# Step 5: Cache Invalidation Integration

## Discovery: Cache Keys

### Home feed

- **Key pattern:** `feed:${type}:${q}:${tags}:${filters}:${limit}:${offset}:${viewerProfileId}`
- **Source:** `dataCache.generateFeedKey()` in `src/lib/dataCache.ts`
- **RPC:** `get_feed_with_related_data`

### Profile created tab

- **Key:** `profile_created_${userId}`
- **Source:** `OwnProfilePostsSection`, `OtherProfilePostsSection` via `dataCache`
- **RPC:** `get_user_posts_created_with_related_data`

### Profile saved tab

- **Key:** `profile_saved_${userId}`
- **Source:** `OwnProfilePostsSection` via `dataCache`
- **RPC:** `get_saved_posts_with_details` (savedPosts service)

### Profile liked/interacted tab

- **Key:** `profile_interacted_${userId}`
- **Source:** `OwnProfilePostsSection`, `OtherProfilePostsSection` via `dataCache`
- **RPC:** `get_liked_posts_with_details_for_user`

### Post detail cache (per viewer)

- **Key pattern:** `post:${postId}:${viewerUserId ?? "null"}`
- **Source:** `getPostById.ts` - `postDetailCache`, `postDetailInFlight`
- **RPC:** `get_post_detail_with_related_data`

### Follow counts cache

- **Key:** `follow_counts:${profileId}` (in followCountsCache)
- **Source:** `src/lib/followCountsCache.ts`

### Notifications cache

- **Key:** `notification_count:${userId}` (in notificationCountCache)
- **Source:** `src/lib/notificationCountCache.ts`

### Other caches

- **Likes cache:** `likes_cache` (localStorage) - map of postId → boolean
- **Saved posts cache:** `saved_posts_cache` (localStorage)
- **Comments cache:** `comments_cache` (localStorage) - map of postId → comments
- **RSVP cache:** `rsvp:${postId}` (StorageManager/localStorage)
- **Follow status:** `viewerId-targetProfileId` in followStatusCache

---

## Existing Invalidation Utilities (cacheInvalidation.ts)

| Helper                                              | What it touches                                                                                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `invalidateRelatedCaches(profileId, relationships)` | profile, followStatus, followRequestStatus, followCounts, notificationSettings, privacy, posts (profile_created/interacted/saved), avatar |
| `invalidateProfileCaches(profileId, changes)`       | Wrapper for invalidateRelatedCaches with boolean flags                                                                                    |
| `invalidateFollowCaches(followerId, followingId)`   | followStatus, followCounts, followRequestStatus, mutualFriends                                                                            |
| `invalidateOnLike(postId, userId)`                  | **NEW** post detail, profile_interacted, feed                                                                                             |
| `invalidateOnSave(postId, userId)`                  | **NEW** post detail, profile_saved, feed                                                                                                  |
| `invalidateOnRSVP(postId)`                          | **NEW** post detail, rsvpCache                                                                                                            |
| `invalidateOnComment(postId)`                       | **NEW** post detail                                                                                                                       |

---

## Diff Summary

### Files changed

1. **src/lib/cacheInvalidation.ts**

   - Import `invalidatePostDetailCache`, `clearCachedRSVPData`
   - Add `invalidateOnLike(postId, userId)`
   - Add `invalidateOnSave(postId, userId)`
   - Add `invalidateOnRSVP(postId)`
   - Add `invalidateOnComment(postId)`

2. **src/api/services/likes.ts**

   - Import `invalidateOnLike`
   - Replace inline `dataCache.delete(profile_interacted)` with `invalidateOnLike(postId, userId)` in likePost and unlikePost

3. **src/api/services/savedPosts.ts**

   - Import `invalidateOnSave`
   - Remove `dataCache` import (no longer used)
   - Replace inline `dataCache.delete(profile_saved)` with `invalidateOnSave(postId, userId)` in savePost and unsavePost

4. **src/api/services/comments.ts**

   - After `invalidateCommentsCache`, call `invalidateOnComment(postId)` in createComment, updateComment, deleteComment

5. **src/components/ui/RSVPComponent.tsx**

   - After successful RSVP upsert, call `invalidateOnRSVP(postId)`

6. **src/components/ui/RSVPListDrawer.tsx**
   - After successful RSVP upsert, call `invalidateOnRSVP(postId)`

### Follow/unfollow

- Already wired via `follow:changed` event → `invalidateFollowCaches` in cacheInvalidation.ts
- FollowButton dispatches event; OtherProfilePage/OwnProfilePage handle counts via Supabase realtime + cache updates

---

## Verification Checklist

### Like / Unlike

| Screen                   | Action        | What should update                         |
| ------------------------ | ------------- | ------------------------------------------ |
| Home feed card           | Like post     | Heart fills, count increments (no refresh) |
| Home feed card           | Unlike post   | Heart unfills, count decrements            |
| Profile → Created tab    | Like own post | N/A (own posts)                            |
| Profile → Interacted tab | Unlike a post | Post disappears from list on next visit    |
| Post detail modal        | Like          | Heart fills, count increments              |
| Post detail modal        | Unlike        | Heart unfills, count decrements            |

### Save / Unsave

| Screen              | Action        | What should update                      |
| ------------------- | ------------- | --------------------------------------- |
| Home feed card      | Save post     | Bookmark fills (no refresh)             |
| Home feed card      | Unsave post   | Bookmark unfills                        |
| Profile → Saved tab | Unsave a post | Post disappears from list on next visit |
| Post detail modal   | Save/Unsave   | Bookmark icon updates                   |

### Follow / Unfollow

| Screen                                | Action        | What should update                    |
| ------------------------------------- | ------------- | ------------------------------------- |
| Other profile page                    | Follow        | Button → Following, follower count +1 |
| Other profile page                    | Unfollow      | Button → Follow, follower count -1    |
| Post detail modal (StickyPostActions) | Follow author | Follow button updates                 |

### RSVP

| Screen                      | Action         | What should update                                     |
| --------------------------- | -------------- | ------------------------------------------------------ |
| Post detail modal (hangout) | RSVP Going     | RSVP section shows "Going", count updates              |
| Post detail modal (hangout) | RSVP Not going | RSVP section updates                                   |
| RSVP List drawer            | Change RSVP    | List refreshes, parent modal rsvp_data fresh on reopen |

### Add comment

| Screen            | Action                          | What should update                                |
| ----------------- | ------------------------------- | ------------------------------------------------- |
| Post detail modal | Add comment                     | Comment appears in list, comment count increments |
| Home feed card    | (after adding comment in modal) | Comment count on card updates on next feed load   |

### Delete comment

| Screen            | Action         | What should update                   |
| ----------------- | -------------- | ------------------------------------ |
| Post detail modal | Delete comment | Comment disappears, count decrements |

---

## DoD Checks

- [x] After like/save/follow/RSVP/comment: UI updates without hard refresh
- [x] Home feed card counters update (via feed cache invalidation → next load fresh)
- [x] Profile tabs (created/liked/saved) update where relevant
- [x] Post detail modal counts update (via invalidatePostDetailCache)
- [x] No broad "clear all caches" - only targeted invalidation (feed clear is feed-only, not profile/post detail)
