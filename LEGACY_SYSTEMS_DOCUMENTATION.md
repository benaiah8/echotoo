# 📚 Legacy Systems Documentation

**Purpose:** Document old batch loading systems before phasing them out  
**Date:** December 30, 2025  
**Status:** Phase 1 Complete - Home Page Optimized

---

## 🎯 Overview

This document preserves the knowledge of legacy data loading systems that are being replaced by PostgreSQL optimized functions. This ensures we don't lose important architectural patterns when migrating other pages.

---

## 🗂️ Systems Being Phased Out

### 1. BatchLoadResult System (`src/types/legacy.ts`)

**Purpose:** Loaded related data (likes, saves, follows, RSVPs) in batches to reduce individual queries

**Structure:**
```typescript
interface BatchLoadResult {
  followStatuses: Map<string, "none" | "pending" | "following" | "friends">;
  likeStatuses: Map<string, boolean>;
  saveStatuses: Map<string, boolean>;
  rsvpData: Map<string, RSVPData>;
  profiles: Map<string, Profile>;
}
```

**Replaced by:** PostgreSQL `get_feed_with_related_data` function that returns all data in a single query

**Still used in:** 
- Detail pages (until Phase 3)
- Other profile pages (until Phase 2)

**Migration path:** Pass `post` object with PostgreSQL data instead of `batchedData`

---

### 2. Component-Level Lazy Loading

**Purpose:** Fallback mechanism when data not provided from parent

**Components affected:**
- `LikeButton.tsx` - Checks if post is liked
- `SaveButton.tsx` - Checks if post is saved
- `RSVPComponent.tsx` - Loads RSVP users
- `FollowButton.tsx` - Checks follow status

**How it works:**
1. Component receives `initialIsLiked` / `initialIsSaved` / `initialRsvpData` prop
2. If `undefined`, uses IntersectionObserver to detect visibility
3. When visible, makes individual API call
4. Updates local state

**Why it's good:**
- Allows user to scroll past posts before all data loads
- Non-blocking progressive rendering
- Good UX for slow connections

**Why it's being optimized:**
- Should use PostgreSQL data (already loaded)
- Individual queries only as fallback for detail pages

**Keep for:**
- Detail pages (where we don't have feed data)
- Backward compatibility
- Non-feed contexts

**Optimize for:**
- Feed pages should ALWAYS provide data from PostgreSQL
- Warning logs when fallback triggers on feed pages

---

## 📄 Page-Specific Systems

### Home Page (✅ Phase 1 Complete)

**Old system:**
- `getPublicFeed()` - Basic post query
- Batch loader for likes, saves, RSVPs, follows
- Component-level lazy loading for everything

**New system:**
- `get_feed_with_related_data` PostgreSQL RPC
- Returns all data in single query
- Components receive `post` prop with complete data
- No individual queries needed

**Result:**
- 2,510 requests → 10-15 requests
- 312 MB → ~500 KB
- 1-5 minutes → <2 seconds

---

### Profile Pages (⏳ Phase 2 - Pending)

**Current system:**
- **Created tab:** Uses `get_user_posts_created_with_related_data` (PostgreSQL) ✅
- **Interacted tab:** Multiple queries (needs optimization) ❌
- **Saved tab:** Multiple queries (needs optimization) ❌

**What they load:**
- **Created:** Posts authored by user
- **Interacted:** Posts user has liked, commented on, or RSVP'd to
- **Saved:** Posts user has saved

**Migration plan:**
1. Verify `get_user_posts_created_with_related_data` exists and works
2. Create `get_user_posts_interacted_with_related_data`
3. Create `get_user_posts_saved_with_related_data`
4. Apply same pattern as Home page
5. Remove batch loader from profile pages

**PostgreSQL functions needed:**
```sql
-- Already exists (verify structure)
get_user_posts_created_with_related_data(
  p_user_id UUID,
  p_limit INTEGER,
  p_offset INTEGER,
  p_viewer_user_id UUID
)

-- TODO: Create these
get_user_posts_interacted_with_related_data(...)
get_user_posts_saved_with_related_data(...)
```

---

### Detail Pages (⏳ Phase 3 - Pending)

**Current system:**
- Multiple individual queries:
  1. `getPost(id)` - Post data
  2. `getActivities(post_id)` - Activities with images
  3. `getComments(post_id)` - Comments
  4. `getRSVPUsers(post_id)` - RSVP list (hangouts)
  5. `getProfile(author_id)` - Author profile
  6. `getFollowStatus(viewer_id, author_id)` - Follow status

**What they show:**
- Full post details
- All activities with images
- Comment thread
- RSVP list (for hangouts)
- Author profile
- Follow/RSVP buttons

**Migration plan:**
1. Create `get_post_detail_with_related_data` PostgreSQL function
2. Implement instant loading with cached data:
   ```typescript
   // Show from feed cache immediately
   const cachedData = getCachedPostFromFeed(postId);
   if (cachedData) {
     setPost(cachedData); // Instant display
   }
   
   // Load full details in background
   const fullData = await getPostDetailOptimized(postId);
   setPost(fullData); // Update with activities, comments
   ```
3. Keep lazy loading for components not in PostgreSQL response

**User experience goal:**
- Click post → Instant display of caption, author, image (from cache)
- Background load → Activities, comments appear smoothly
- No blank screen or full reload

---

### Notifications Page (⏳ Phase 4 - Pending)

**Current system:**
- `getNotifications(user_id, filters)` - Notification list
- Batch load actor profiles
- Batch load related posts

**What they load:**
- Notifications filtered by type (all, likes, comments, follows, RSVPs)
- Actor profiles (who liked/commented/followed)
- Related post data (for like/comment notifications)

**Migration plan:**
1. Create `get_notifications_with_related_data` PostgreSQL function
2. Return notifications with embedded actor profiles and post data
3. Apply same pattern as Home page

**PostgreSQL function needed:**
```sql
get_notifications_with_related_data(
  p_user_id UUID,
  p_type_filter TEXT, -- 'all', 'like', 'comment', 'follow', 'rsvp'
  p_limit INTEGER,
  p_offset INTEGER
)
```

---

## 🔄 Migration Pattern (Reusable)

### Step 1: Create PostgreSQL Function
```sql
CREATE OR REPLACE FUNCTION get_[page]_with_related_data(...)
RETURNS JSONB
AS $$
  -- Query with all JOINs for related data
  -- Return structured JSON with posts array and count
$$;
```

### Step 2: Update TypeScript Query Function
```typescript
export async function get[Page]Optimized(opts: Options): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('[function_name]', params);
  if (error) throw error;
  return data.posts;
}
```

### Step 3: Update Page Component
```typescript
// Remove batch loading
// Remove individual queries
// Pass post={item} to child components
<Post post={item} />
```

### Step 4: Verify Components Receive Data
```typescript
// Add debug logging
useEffect(() => {
  if (post) {
    console.log('[Component] ✅ PostgreSQL data received');
  } else {
    console.warn('[Component] ⚠️ Missing post data');
  }
}, [post]);
```

### Step 5: Test & Measure
- Network tab: Verify request reduction
- Console: No fallback warnings
- Load time: Measure improvement
- Egress: Measure data reduction

---

## 📊 Expected Results Per Page

| Page | Before | After | Improvement |
|------|--------|-------|-------------|
| **Home** | 2,510 req, 312 MB, 1-5 min | 10-15 req, 500 KB, <2 sec | 99% reduction |
| **Profile** | ~500 req, 50 MB, 30 sec | 10-15 req, 500 KB, <2 sec | 98% reduction |
| **Detail** | 20-30 req, 5 MB, 5 sec | 1-2 req, 100 KB, <1 sec | 95% reduction |
| **Notifications** | 100-200 req, 10 MB, 10 sec | 5-10 req, 200 KB, <2 sec | 95% reduction |

---

## 🎯 Key Principles

### 1. Don't Assume, Verify
- Always add debug logs to trace data flow
- Test all scenarios (cold load, warm load, navigation)
- Verify PostgreSQL data reaches components

### 2. Progressive Enhancement
- Show cached data immediately
- Load fresh data in background
- Lazy load details (images, counts)

### 3. Graceful Degradation
- Keep lazy loading as fallback
- Handle missing data gracefully
- Don't break old pages during migration

### 4. Measure Everything
- Network requests (before/after)
- Data transferred (before/after)
- Load time (before/after)
- User experience (perceived speed)

---

## 🚨 Common Pitfalls

### 1. Missing `post` Prop
**Symptom:** Components fall back to individual queries  
**Fix:** Pass `post={item}` to all Post components

### 2. `batchedData={null}` Still Passed
**Symptom:** Optional chaining fails, causes errors  
**Fix:** Remove `batchedData` prop entirely OR add safe fallback `batchedData?.field?.get(id)`

### 3. PostgreSQL Function Returns Wrong Structure
**Symptom:** `post.is_liked` is undefined  
**Fix:** Verify PostgreSQL function returns all required fields

### 4. Cache Key Mismatch
**Symptom:** Data refetches on every navigation  
**Fix:** Include `viewerProfileId` in cache key dependencies

### 5. Infinite Re-render Loops
**Symptom:** "Maximum update depth exceeded"  
**Fix:** Check `useEffect` dependency arrays, use `useMemo` for derived state

---

## 📝 Cleanup Checklist (After All Phases)

- [ ] Delete `src/types/legacy.ts` (BatchLoadResult)
- [ ] Remove `batchedData` prop from all components
- [ ] Remove batch loader files (if any exist)
- [ ] Remove fallback query logging (keep logic for backward compatibility)
- [ ] Update component prop types to require `post` prop
- [ ] Archive this documentation file

---

## 🔗 Related Files

- `create_feed_function.sql` - PostgreSQL function definitions
- `src/api/queries/getPublicFeed.ts` - Feed query functions
- `src/types/legacy.ts` - Legacy type definitions
- `PHASE1_COMPLETE.md` - Phase 1 completion notes
- `NAVIGATION_FIX_COMPLETE.md` - Navigation architecture notes

---

**Last Updated:** December 30, 2025  
**Next Phase:** Profile Pages Optimization  
**Status:** Home Page Complete ✅

