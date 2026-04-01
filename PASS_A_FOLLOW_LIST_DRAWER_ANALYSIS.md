# Pass A: FollowListDrawer RPC Discovery & SQL Draft

## 1. Current FollowListDrawer Queries Analysis

### File: `src/components/profile/FollowListDrawer.tsx`

### Current Query Flow (per page of 30 users):

**Query 1: Fetch Follow IDs** (Lines 93-99)
```typescript
supabase
  .from("follows")
  .select(isFollowers ? "follower_id" : "following_id")
  .eq(isFollowers ? "following_id" : "follower_id", profileId)
  .eq("status", "approved")
  .order("created_at", { ascending: false })
  .range(from, to)
```
- **Mode: "followers"**: Gets `follower_id` where `following_id = profileId` (who follows this profile)
- **Mode: "following"**: Gets `following_id` where `follower_id = profileId` (who this profile follows)
- **Returns**: Array of profile IDs
- **Pagination**: `range(from, to)` where `from = page * 30`, `to = from + 29`

**Query 2: Fetch Profile Data** (Lines 160-163)
```typescript
supabase
  .from("profiles")
  .select("id, user_id, username, display_name, avatar_url")
  .in("id", uncachedIds)
```
- **Only fetches uncached profiles** (cache check at lines 139-155)
- **Returns**: Profile data for uncached IDs
- **Fields needed**: `id`, `user_id`, `username`, `display_name`, `avatar_url`

**Query 3: Batch Follow Status Check** (Lines 212-222)
```typescript
getBatchFollowStatuses(viewerId, targetIds)
```
- **Internally does 2 queries**:
  1. `follows.select("following_id, status").eq("follower_id", viewerId).in("following_id", targetIds)`
  2. `follows.select("follower_id, status").eq("following_id", viewerId).in("follower_id", targetIds)`
- **Returns**: Map of `{ [targetId]: "none" | "pending" | "following" | "friends" }`
- **Mapping logic**:
  - `"pending"` if viewer follows target with status "pending"
  - `"friends"` if viewer follows target with status "approved" AND target follows viewer with status "approved"
  - `"following"` if viewer follows target with status "approved"
  - `"none"` otherwise

**Additional Query: Profile Privacy Check** (Lines 107-111)
```typescript
supabase
  .from("profiles")
  .select("id, is_private")
  .eq("id", profileId)
  .maybeSingle()
```
- **Only if not cached** (cache check at line 89)
- **Used for**: Determining if viewer can remove followers (private account owner)

### Summary:
- **Best case** (all profiles cached): 1 query (follows) + 1 batch follow status (2 internal queries) = **3 queries total**
- **Worst case** (no profiles cached): 1 query (follows) + 1 query (profiles) + 1 batch follow status (2 internal queries) = **4 queries total**
- **Pagination**: Manual via `range(from, to)`
- **Page size**: 30 users per page

---

## 2. Existing RPC Pattern Analysis

### Pattern Reference: `get_feed_with_related_data` (`create_feed_function.sql`)

**Structure:**
- `SECURITY DEFINER` - Bypasses RLS for reads
- `STABLE` - Read-only, results stable within transaction
- `RETURNS JSONB` - Returns structured JSON
- Uses `p_viewer_user_id` (auth user ID) and converts to `v_viewer_profile_id` internally
- Manual security checks in WHERE clause (privacy, visibility)
- Returns `{ users: [...], count: number }` pattern

### Pattern Reference: `get_rsvp_list_with_profiles` (from `src/api/services/rsvp.ts`)

**Return Format:**
```typescript
{
  users: Array<{
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    status: "going" | "maybe" | "not_going";
    created_at: string;
  }>;
  currentUserStatus: string | null;
}
```

**Similarities to FollowListDrawer:**
- Returns list of profiles with related data
- Includes viewer-specific status (RSVP status vs follow status)
- Uses pagination (`p_limit`, `p_offset`)

---

## 3. Proposed RPC Signature

```sql
CREATE OR REPLACE FUNCTION get_follow_list_with_profiles(
  p_profile_id UUID,           -- Profile whose followers/following to fetch
  p_mode TEXT,                  -- 'followers' or 'following'
  p_viewer_user_id UUID,        -- Auth user ID for follow status checks (optional)
  p_limit INTEGER DEFAULT 30,   -- Page size
  p_offset INTEGER DEFAULT 0   -- Pagination offset
)
RETURNS JSONB
```

**Return Format:**
```json
{
  "users": [
    {
      "id": "profile-uuid",
      "user_id": "auth-user-uuid",
      "username": "username",
      "display_name": "Display Name",
      "avatar_url": "https://...",
      "viewer_follow_status": "none" | "pending" | "following" | "friends" | "self"
    }
  ],
  "count": 30
}
```

---

## 4. SQL Query Plan

### Step 1: Get Viewer Profile ID
```sql
IF p_viewer_user_id IS NOT NULL THEN
  SELECT id INTO v_viewer_profile_id
  FROM profiles
  WHERE user_id = p_viewer_user_id
  LIMIT 1;
END IF;
```

### Step 2: Query Follow List with Joins

**Main Query Structure:**
```sql
SELECT 
  profile.id,
  profile.user_id,
  profile.username,
  profile.display_name,
  profile.avatar_url,
  follow_relationship.created_at as follow_created_at,
  -- Viewer follow status calculation
  CASE
    WHEN v_viewer_profile_id IS NULL THEN 'none'
    WHEN v_viewer_profile_id = profile.id THEN 'self'
    WHEN viewer_follows_target.status = 'approved' 
         AND target_follows_viewer.status = 'approved' 
    THEN 'friends'
    WHEN viewer_follows_target.status = 'approved' 
    THEN 'following'
    WHEN viewer_follows_target.status = 'pending' 
    THEN 'pending'
    ELSE 'none'
  END as viewer_follow_status
FROM follows follow_relationship
INNER JOIN profiles profile ON 
  CASE 
    WHEN p_mode = 'followers' THEN profile.id = follow_relationship.follower_id
    WHEN p_mode = 'following' THEN profile.id = follow_relationship.following_id
  END
LEFT JOIN follows viewer_follows_target ON 
  viewer_follows_target.follower_id = v_viewer_profile_id 
  AND viewer_follows_target.following_id = profile.id
LEFT JOIN follows target_follows_viewer ON 
  target_follows_viewer.follower_id = profile.id 
  AND target_follows_viewer.following_id = v_viewer_profile_id
WHERE
  CASE 
    WHEN p_mode = 'followers' THEN follow_relationship.following_id = p_profile_id
    WHEN p_mode = 'following' THEN follow_relationship.follower_id = p_profile_id
  END
  AND follow_relationship.status = 'approved'
ORDER BY follow_relationship.created_at DESC
LIMIT p_limit
OFFSET p_offset
```

**Key Joins:**
1. **Main join**: `follows` → `profiles` (get profile data)
   - **Followers mode**: Join on `profile.id = follow_relationship.follower_id`
   - **Following mode**: Join on `profile.id = follow_relationship.following_id`

2. **Viewer follow status**: `follows viewer_follows_target`
   - Checks if viewer follows each profile in the list
   - Used for follow button status

3. **Mutual follow check**: `follows target_follows_viewer`
   - Checks if each profile follows viewer
   - Used to determine "friends" status

**Follow Status Mapping Logic:**
- `"self"`: Viewer is the profile itself
- `"friends"`: Viewer follows target (approved) AND target follows viewer (approved)
- `"following"`: Viewer follows target (approved)
- `"pending"`: Viewer follows target (pending)
- `"none"`: No follow relationship

### Step 3: Aggregate to JSONB
```sql
SELECT jsonb_agg(
  jsonb_build_object(
    'id', id,
    'user_id', user_id,
    'username', username,
    'display_name', display_name,
    'avatar_url', avatar_url,
    'viewer_follow_status', viewer_follow_status
  ) ORDER BY follow_created_at DESC
)
INTO v_users
FROM follow_list;
```

### Step 4: Build Final Result
```sql
v_result := jsonb_build_object(
  'users', COALESCE(v_users, '[]'::jsonb),
  'count', jsonb_array_length(COALESCE(v_users, '[]'::jsonb))
);
```

---

## 5. Security Considerations

**SECURITY DEFINER Pattern:**
- Matches `get_feed_with_related_data` pattern
- Bypasses RLS for read-only queries
- Manual security: Only returns approved follows (status = 'approved')
- No sensitive data exposed (public profile fields only)

**Privacy:**
- Follow lists are public (visible on profile pages)
- Only approved follows are shown (pending/declined filtered out)
- Viewer follow status is calculated but doesn't expose private data

---

## 6. Final SQL Function

**File:** `get_follow_list_with_profiles.sql`

**Key Features:**
- ✅ Single query replaces 2-4 queries
- ✅ Returns profile data + viewer follow status in one response
- ✅ Handles both "followers" and "following" modes
- ✅ Pagination via `p_limit` and `p_offset`
- ✅ Follows existing RPC patterns (SECURITY DEFINER, STABLE, JSONB return)
- ✅ Proper follow status mapping (none/pending/following/friends/self)

**Expected Performance:**
- **Before**: 2-4 queries per page (follows + profiles + batch follow status)
- **After**: 1 RPC call per page
- **Egress reduction**: ~60-70% (similar to feed optimization)

---

## 7. Next Steps (Pass B - Not Yet)

After approval, Pass B will:
1. Update `FollowListDrawer.tsx` to use the RPC
2. Remove old query logic
3. Map RPC response to existing `Row[]` type
4. Maintain progressive loading behavior
5. Keep caching via StorageManager/dataCache

**No TypeScript changes in Pass A - SQL only.**
