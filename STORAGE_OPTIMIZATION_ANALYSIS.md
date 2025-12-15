# Storage Optimization Analysis - Phase 8

## Executive Summary

This document analyzes the current localStorage usage across all caches in the application and provides recommendations for optimization. The analysis focuses on identifying which caches might benefit from IndexedDB migration in the future, without making breaking changes to the current implementation.

## 8.1.1: Storage Metrics Utility

**Created:** `src/lib/storageMetrics.ts`

### Features:
- ✅ Measures localStorage quota using `StorageManager.estimate()` API (when available)
- ✅ Fallback calculation for browsers without StorageManager API
- ✅ Analyzes individual cache sizes
- ✅ Formats bytes to human-readable strings
- ✅ Provides comprehensive storage reports

### Usage:
```typescript
import { getStorageReport, logStorageReport } from "./lib/storageMetrics";

// Get full report
const report = await getStorageReport();
console.log("Total usage:", report.metrics.used);
console.log("Cache sizes:", report.cacheSizes);

// Log formatted report to console
await logStorageReport();
```

### Testing:
Run in browser console to see current storage usage:
```javascript
import { logStorageReport } from "./lib/storageMetrics";
await logStorageReport();
```

## 8.1.2: Cache Analysis

### Current Cache Inventory

| Cache Name | Structure | Growth Pattern | Size Estimate | IndexedDB Candidate |
|------------|-----------|----------------|---------------|---------------------|
| `profile_cache` | `{ [profileId]: ProfileEntry }` | Bounded (per-profile) | Medium | ⚠️ Potential |
| `profile_username_cache` | `{ [username]: profileId }` | Bounded | Small | ❌ No |
| `follow_status_cache` | `{ [userId]: { [targetId]: status } }` | Unbounded | Large | ✅ Yes |
| `avatar_cache` | `{ [userId]: avatarUrl }` | Bounded (per-user) | Small | ❌ No |
| `profile_posts_cache` | `{ [profileId]: Post[] }` | Unbounded | Large | ✅ Yes |
| `follow_counts_cache` | `{ [profileId]: { followers, following } }` | Bounded | Small | ❌ No |
| `rsvp_cache` | `{ [postId]: RSVPStatus }` | Bounded | Small | ❌ No |
| `notification_settings_cache` | `{ [userId]: Settings }` | Bounded | Small | ❌ No |
| `invite_status_cache` | `{ [postId]: { [userId]: status } }` | Unbounded | Large | ✅ Yes |
| `data_cache` | `{ [key]: FeedItem[] }` | Unbounded | Large | ✅ Yes |
| `page_cache` | Various page data | Bounded | Small | ❌ No |
| `follow_cache` | `{ [userId]: FollowEntry[] }` | Unbounded | Large | ✅ Yes |

### Cache Characteristics

#### ✅ IndexedDB Candidates (High Priority)

1. **`follow_status_cache`** - `src/lib/followStatusCache.ts`
   - **Why:** Stores follow relationships for all users user has checked
   - **Growth:** Unbounded - grows with every profile visit
   - **Size:** Could exceed 1MB for active users
   - **Query Needs:** Complex lookups by user/target pairs
   - **Recommendation:** Migrate when user follows >1000 accounts or cache >500KB

2. **`data_cache`** - `src/lib/dataCache.ts`
   - **Why:** Caches entire feed pages (posts with metadata)
   - **Growth:** Unbounded - stores multiple feed queries
   - **Size:** Each feed page ~50-200KB, could store 10+ pages
   - **Query Needs:** Simple key-value lookup by feed query params
   - **Recommendation:** Migrate when cache >1MB or storing >20 feed pages

3. **`profile_posts_cache`** - `src/lib/profilePostsCache.ts`
   - **Why:** Stores all posts for each profile viewed
   - **Growth:** Unbounded - one profile could have 100+ posts
   - **Size:** Profile with 50 posts ~200-500KB
   - **Query Needs:** Lookup by profile ID, pagination
   - **Recommendation:** Migrate when cache >1MB or storing >10 profiles' posts

4. **`follow_cache`** - `src/lib/followCache.ts`
   - **Why:** Stores followers/following lists
   - **Growth:** Unbounded - could store 1000+ followers
   - **Size:** 1000 followers ~100-300KB
   - **Query Needs:** Array storage, pagination
   - **Recommendation:** Migrate when lists >500 users or cache >500KB

5. **`invite_status_cache`** - `src/lib/inviteStatusCache.ts`
   - **Why:** Stores invite statuses for posts
   - **Growth:** Unbounded - one post could have 100+ invitees
   - **Size:** Post with 100 invites ~50-100KB
   - **Query Needs:** Nested lookups by postId and userId
   - **Recommendation:** Migrate when cache >500KB

#### ⚠️ Potential IndexedDB Candidates (Monitor)

6. **`profile_cache`** - `src/lib/profileCache.ts`
   - **Why:** Stores profile data for all viewed profiles
   - **Growth:** Bounded per profile, but could cache many profiles
   - **Size:** ~1KB per profile, 1000 profiles ~1MB
   - **Query Needs:** Lookup by ID or username
   - **Recommendation:** Monitor - migrate if >2000 profiles cached or cache >2MB

#### ❌ Keep in localStorage (Low Priority)

- `avatar_cache` - Small strings, bounded growth
- `follow_counts_cache` - Small objects, bounded
- `rsvp_cache` - Small per-post data
- `notification_settings_cache` - Single object per user
- `page_cache` - Small, bounded
- `profile_username_cache` - Small mapping object

## 8.1.3: Performance Measurement (Manual Testing Required)

### Lists to Profile:
1. **Followers/Following Lists**
   - Test with 100+ items
   - Measure: Render time, scroll FPS, memory usage
   - Components: `FollowListDrawer.tsx`, `ProfileSearchResults.tsx`

2. **Feed Posts**
   - Test with 100+ posts
   - Measure: Initial render, scroll performance, memory
   - Components: `HomePostsSection.tsx`, `OwnProfilePostsSection.tsx`

3. **Search Results**
   - Test with 100+ results
   - Measure: Render time, filtering performance
   - Components: `ProfileSearchResults.tsx`

### Tools:
- React DevTools Profiler
- Chrome DevTools Performance tab
- Chrome DevTools Memory profiler

## 8.1.4: Recommendations

### Thresholds for IndexedDB Migration

| Metric | Threshold | Action |
|--------|-----------|--------|
| Total localStorage usage | >80% of quota | Consider migrating largest caches |
| Individual cache size | >1MB | Migrate to IndexedDB |
| Follow status cache | >500KB | Migrate to IndexedDB |
| Data cache (feeds) | >1MB | Migrate to IndexedDB |
| Profile posts cache | >1MB | Migrate to IndexedDB |
| Follow cache | >500KB | Migrate to IndexedDB |

### Virtual Scrolling Thresholds

| List Type | Threshold | Recommendation |
|-----------|-----------|----------------|
| Followers/Following | >200 items | Implement virtual scrolling |
| Feed posts | >100 items | Consider virtual scrolling (if scroll lag) |
| Search results | >50 items | Implement virtual scrolling |

### Implementation Priority

**Phase 1 (Monitor Only - Current)**
- ✅ Storage metrics utility created
- ⏳ Manual testing of list performance
- ⏳ Monitor cache sizes in production

**Phase 2 (When Thresholds Reached)**
- Migrate `follow_status_cache` to IndexedDB
- Migrate `data_cache` to IndexedDB
- Add virtual scrolling to follower/following lists

**Phase 3 (Future Optimization)**
- Migrate remaining large caches
- Implement hybrid localStorage/IndexedDB strategy
- Add cache eviction policies

### Code Examples

#### Checking Storage Usage
```typescript
import { getStorageReport, formatBytes } from "./lib/storageMetrics";

const report = await getStorageReport();
if (report.metrics.usagePercent > 80) {
  console.warn(`Storage usage high: ${report.metrics.usagePercent}%`);
  console.log("Largest caches:", report.cacheSizes.slice(0, 3));
}
```

#### Monitoring Cache Growth
```typescript
// Add to cache update functions
import { getLocalStorageKeySize, formatBytes } from "./lib/storageMetrics";

function setCachedProfile(profileId: string, profile: Profile) {
  // ... existing cache logic ...
  
  const size = getLocalStorageKeySize("profile_cache");
  if (size > 2 * 1024 * 1024) { // 2MB
    console.warn(`Profile cache is large: ${formatBytes(size)}`);
  }
}
```

## Current Status

- ✅ Storage metrics utility implemented
- ✅ Cache analysis completed
- ⏳ Manual performance testing needed
- ⏳ Production monitoring needed

## Next Steps

1. **Short-term (This Phase):**
   - Use storage metrics utility to monitor usage
   - Document baseline measurements
   - Set up monitoring in development

2. **Medium-term (When Needed):**
   - Implement IndexedDB wrapper if quota issues arise
   - Migrate largest caches to IndexedDB
   - Add virtual scrolling to long lists

3. **Long-term (Future Optimization):**
   - Implement hybrid storage strategy
   - Add automated cache eviction
   - Optimize cache data structures

---

**Note:** All recommendations are conservative and aim to avoid breaking changes. Migration to IndexedDB should only occur when storage limits are actually being approached or performance issues are identified.

