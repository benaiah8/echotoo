# Complete Performance Optimization Audit & Strategy

## Comprehensive mapping of all API calls, optimization opportunities, and implementation plan

**Last Updated**: Based on current codebase analysis  
**Status**: Pre-implementation audit phase

---

## EXECUTIVE SUMMARY

### Current State

- **Homepage**: ~50 database queries for 6 posts
- **Profile Pages**: Multiple individual queries per component
- **Drawers**: Individual queries when opened
- **Post Components**: 4-6 queries per post
- **Critical Issue**: RSVP 406 errors blocking functionality

### Target State

- **Homepage**: ~8 database queries for 6 posts (84% reduction)
- **All Pages**: Batched queries, progressive rendering
- **User Experience**: Instant loading, smooth interactions
- **Egress Data**: 84% reduction in API calls

### Key Findings

1. ✅ Request deduplication exists (`requestManager`) but not used everywhere
2. ✅ Batching functions exist (`getBatchFollowStatuses`) but not always used
3. ❌ RSVP queries are individual (3 queries per hangout post)
4. ❌ Like/Save status checked individually per post
5. ❌ Homepage loads posts in batch (not progressive)
6. ❌ No unified batch data loader

---

## PART 1: COMPLETE API CALL MAPPING

### 1. HOMEPAGE (`src/pages/HomePage.tsx`)

#### Initial Load Sequence

**1.1 Main Feed Query** ✅ **OPTIMIZED**

- **Location**: `src/api/queries/getPublicFeed.ts:40-234`
- **Query**: `posts` table with `author:profiles` join
- **Selects**: id, type, caption, is_anonymous, created_at, selected_dates, tags, author_id, author profile
- **Frequency**: Once per page load (first 6-12 posts)
- **Status**: ✅ Already batched correctly
- **Egress**: ~1 query

**1.2 DataCache Prefetch** ❌ **NEEDS BATCHING**

- **Location**: `src/lib/dataCache.ts:218-424` → `prefetchRelatedData()`
- **What it does**: Loops through each post and makes individual queries

##### 1.2.1 Follow Status Checks (INDIVIDUAL - NEEDS BATCHING)

- **Location**: `src/lib/dataCache.ts:272-304`
- **Query Pattern**:
  ```typescript
  for (const authorId of authorIds) {
    // Individual query per author
    supabase
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", currentUserProfile.id)
      .eq("following_id", authorId);
  }
  ```
- **Frequency**: 1 query per post author (if not cached)
- **Current**: N queries for N authors
- **Target**: 1 batched query for all authors
- **Egress Impact**: High (6 queries → 1 query)

##### 1.2.2 RSVP Data (INDIVIDUAL - NEEDS BATCHING) ⚠️ **406 ERRORS HERE**

- **Location**: `src/lib/dataCache.ts:309-388`
- **Query Pattern**:
  ```typescript
  for (const post of hangoutPosts) {
    // Query 1: Get RSVP responses for this post
    supabase
      .from("rsvp_responses")
      .select("id, user_id, status")
      .eq("post_id", post.id)
      .eq("status", "going");

    // Query 2: Get profiles for RSVP users
    supabase
      .from("profiles")
      .select("id, user_id, username, display_name, avatar_url")
      .in("user_id", authUserIds);

    // Query 3: Get current user's RSVP status
    supabase
      .from("rsvp_responses")
      .select("status")
      .eq("post_id", post.id)
      .eq("user_id", currentUserId);
  }
  ```
- **Frequency**: 3 queries per hangout post (if not cached)
- **Current**: 3N queries for N hangout posts
- **Target**: 2-3 batched queries total
- **Egress Impact**: Very High (9 queries for 3 hangouts → 2-3 queries)
- **Critical**: 406 errors happening here

##### 1.2.3 Profile Data (INDIVIDUAL - NEEDS BATCHING)

- **Location**: `src/lib/dataCache.ts:391-414`
- **Query Pattern**:
  ```typescript
  for (const profileId of profileIds) {
    supabase
      .from("profiles")
      .select(
        "id, user_id, username, display_name, avatar_url, bio, xp, member_no, instagram_url, tiktok_url, telegram_url"
      )
      .eq("id", profileId)
      .single();
  }
  ```
- **Frequency**: 1 query per unique author (if not cached)
- **Current**: N queries for N authors
- **Target**: 1 batched query: `.in("id", profileIds)`
- **Egress Impact**: High (6 queries → 1 query)

**1.3 Per-Post Component Queries** ❌ **NEEDS BATCHING**

##### 1.3.1 Images Query (Lazy Loaded) ⚠️ **PARTIALLY OPTIMIZED**

- **Location**: `src/components/Post.tsx:335-341`
- **Query**: `activities` table
- **Selects**: images, order_idx
- **Frequency**: 1 query per post (when post enters viewport)
- **Current**: Uses Intersection Observer (good)
- **Target**: Could batch for visible posts
- **Egress Impact**: Medium (6 queries, but lazy loaded)

##### 1.3.2 Follow Button Status ❌ **NEEDS BATCHING**

- **Location**: `src/components/ui/FollowButton.tsx:44-179`
- **Query**: `profiles` table (to get viewer ID), then `follows` table
- **Frequency**: 1 query per post (per author)
- **Current**: Individual calls via `getFollowStatus()` per post
- **Has**: `getBatchFollowStatuses` exists but not always used
- **Target**: Use batch function, cache result
- **Egress Impact**: High (6 queries → 1 query)

##### 1.3.3 Like Button Status ❌ **NEEDS BATCHING**

- **Location**: `src/components/ui/LikeButton.tsx:46`
- **Query**: `post_likes` table
- **Query Pattern**:
  ```typescript
  supabase
    .from("post_likes")
    .select("id")
    .eq("user_id", user.id)
    .eq("post_id", postId)
    .maybeSingle();
  ```
- **Frequency**: 1 query per post
- **Current**: N queries for N posts
- **Target**: 1 batched query: `.in("post_id", postIds)`
- **Egress Impact**: High (6 queries → 1 query)

##### 1.3.4 Save Button Status ❌ **NEEDS BATCHING**

- **Location**: `src/components/ui/SaveButton.tsx:42`
- **Query**: `saved_posts` table
- **Query Pattern**:
  ```typescript
  supabase
    .from("saved_posts")
    .select("id")
    .eq("user_id", user.id)
    .eq("post_id", postId)
    .maybeSingle();
  ```
- **Frequency**: 1 query per post
- **Current**: N queries for N posts
- **Target**: 1 batched query: `.in("post_id", postIds)`
- **Egress Impact**: High (6 queries → 1 query)

##### 1.3.5 RSVP Component Status ❌ **NEEDS BATCHING** ⚠️ **406 ERRORS HERE**

- **Location**: `src/components/ui/RSVPComponent.tsx:164-241`
- **Queries**:
  1. `rsvp_responses` - Get RSVP users
  2. `profiles` - Get profiles for RSVP users
  3. `rsvp_responses` - Get current user's RSVP status
- **Frequency**: 3 queries per hangout post
- **Current**: 3N queries for N hangout posts
- **Target**: Use batched result from DataCache prefetch
- **Egress Impact**: Very High (9 queries for 3 hangouts → use cached)
- **Critical**: 406 errors happening here

**Homepage Summary:**

- **Current**: ~50 queries for 6 posts
- **Target**: ~8 queries for 6 posts
- **Reduction**: 84% fewer queries
- **Egress Savings**: ~84% reduction

---

### 2. PROFILE PAGES

#### Own Profile (`src/pages/OwnProfilePage.tsx`)

**2.1 Profile Data** ✅ **OPTIMIZED**

- **Location**: `src/pages/OwnProfilePage.tsx:202-208`
- **Query**: `profiles` table
- **Frequency**: 1 query
- **Status**: ✅ Good, uses stale-while-revalidate

**2.2 Follow Counts** ✅ **OPTIMIZED**

- **Location**: `src/pages/OwnProfilePage.tsx` (via `getFollowCounts`)
- **Query**: `follows` table
- **Frequency**: 1 query
- **Status**: ✅ Good, cached

**2.3 Posts Section** ⚠️ **PARTIALLY OPTIMIZED**

- **Location**: `src/sections/profile/OwnProfilePostsSection.tsx`
- **Created Posts**: 1 query per page ✅
- **Liked Posts**: Individual queries ❌
- **Saved Posts**: Individual queries ❌
- **Per-Post Queries**: Same as homepage ❌

#### Other Profile (`src/pages/OtherProfilePage.tsx`)

**2.4 Profile Data** ✅ **OPTIMIZED**

- **Location**: `src/pages/OtherProfilePage.tsx:141-196`
- **Query**: `profiles` table
- **Frequency**: 1 query
- **Status**: ✅ Good, cached

**2.5 Follow Status** ✅ **OPTIMIZED**

- **Location**: `src/pages/OtherProfilePage.tsx` (via `getFollowStatus`)
- **Query**: `follows` table
- **Frequency**: 1 query
- **Status**: ✅ Good, cached

**2.6 Follow Counts** ✅ **OPTIMIZED**

- **Location**: `src/pages/OtherProfilePage.tsx` (via `getFollowCounts`)
- **Query**: `follows` table
- **Frequency**: 1 query
- **Status**: ✅ Good, cached

**2.7 Posts Section** ⚠️ **PARTIALLY OPTIMIZED**

- **Location**: `src/sections/profile/OtherProfilePostsSection.tsx`
- **Created Posts**: 1 query per page ✅
- **Per-Post Queries**: Same as homepage ❌

---

### 3. DRAWERS

#### FollowListDrawer (`src/components/profile/FollowListDrawer.tsx`)

**3.1 On Open** ✅ **OPTIMIZED**

- **Location**: `src/components/profile/FollowListDrawer.tsx:76-90`
- **Queries**: 3 parallel queries
  1. Follows list
  2. Viewer ID
  3. Profile privacy
- **Status**: ✅ Good, uses Promise.all

**3.2 Per User Follow Status** ⚠️ **COULD OPTIMIZE**

- **Location**: `src/components/profile/FollowListDrawer.tsx:154-233`
- **Query**: Individual follow status checks
- **Current**: 1 query per user in list
- **Target**: Batch if multiple users
- **Egress Impact**: Medium (could batch 10-20 users)

#### RSVPListDrawer (`src/components/ui/RSVPListDrawer.tsx`)

**3.3 On Open** ❌ **NEEDS OPTIMIZATION**

- **Location**: `src/components/ui/RSVPListDrawer.tsx:123-240`
- **Queries**: 3 sequential queries
  1. RSVP responses
  2. User profiles
  3. Current user RSVP status
- **Current**: 3 queries
- **Target**: Could batch profile queries
- **Egress Impact**: Medium (3 queries → 2 queries)

#### InviteDrawer (`src/components/ui/InviteDrawer.tsx`)

**3.4 On Open** ✅ **OPTIMIZED**

- **Location**: `src/components/ui/InviteDrawer.tsx:46-99`
- **Query**: 1 query for followers
- **Status**: ✅ Good

**3.5 On Search** ✅ **OPTIMIZED**

- **Location**: `src/components/ui/InviteDrawer.tsx:102-148`
- **Query**: 1 query per search (debounced)
- **Status**: ✅ Good, debounced

---

## PART 2: RSVP 406 ERROR DIAGNOSIS

### Current Symptoms

- Multiple `GET /rsvp_responses?select=stat...` requests
- All returning `406 (Not Acceptable)` HTTP status
- Affects both `dataCache.ts` prefetching and `RSVPComponent.tsx`
- Same `user_id` in all requests: `85153c40-3aea-4922-...`

### Likely Causes (in order of probability)

1. **RLS Policy Issue** (Most Likely)

   - RLS policies might be too restrictive
   - Policies might not allow the specific query pattern
   - Content-type negotiation issue with Supabase REST API

2. **Query Format Issue**

   - Supabase REST API might not accept the exact query format
   - Column selection might be causing issues
   - Status filter might be problematic

3. **Data Type Mismatch**

   - Status column might have unexpected values
   - Case sensitivity issues
   - Encoding issues

4. **Permission Issue**
   - Column-level permissions might be blocking
   - Role permissions might be insufficient

### SQL Queries to Diagnose

See `inspect_rsvp_406_deep.sql` for detailed diagnostic queries.

**Key Queries to Run:**

1. RLS policies detail
2. RLS enabled status
3. Test exact frontend query pattern
4. Status values analysis
5. Table/column permissions

---

## PART 3: OPTIMIZATION STRATEGY

### Phase 1: Fix Critical Errors (BLOCKING) 🔴

**Priority**: CRITICAL  
**Risk**: HIGH  
**Time**: 1-2 hours

#### 1.1 RSVP 406 Error Fix

- **Steps**:
  1. Run SQL diagnostic queries
  2. Identify root cause (likely RLS policy)
  3. Fix RLS policies or query format
  4. Test thoroughly
- **Files to Modify**:
  - SQL: RLS policies on `rsvp_responses` table
  - Possibly: `src/lib/dataCache.ts` (query format)
  - Possibly: `src/components/ui/RSVPComponent.tsx` (query format)
- **Testing**:
  - Test RSVP prefetching
  - Test RSVPComponent
  - Test RSVPListDrawer
- **Rollback Plan**: Revert RLS policy changes if issues

---

### Phase 2: Unified Batch Data Loader (FOUNDATION) 🟡

**Priority**: HIGH  
**Risk**: MEDIUM  
**Time**: 4-6 hours

#### 2.1 Create Batch Data Loader

- **New File**: `src/lib/batchDataLoader.ts`
- **Purpose**: Single function to load all data for posts
- **Interface**:

  ```typescript
  interface BatchLoadOptions {
    postIds: string[];
    authorIds: string[];
    hangoutPostIds: string[];
    currentUserId: string;
  }

  interface BatchLoadResult {
    followStatuses: Map<authorId, status>;
    likeStatuses: Map<postId, boolean>;
    saveStatuses: Map<postId, boolean>;
    rsvpData: Map<postId, RSVPData>;
    profiles: Map<profileId, Profile>;
  }
  ```

- **Benefits**:
  - Reduces 50 queries → 5 queries
  - Centralized caching
  - Easy to optimize further
- **Dependencies**: None (new file)
- **Testing**: Test with homepage 6 posts

#### 2.2 Integrate with Homepage

- **Files to Modify**:
  - `src/pages/HomePage.tsx`: Use batch loader
  - `src/lib/dataCache.ts`: Use batch loader in prefetch
- **Dependencies**: Phase 2.1 complete
- **Testing**: Verify all data loads correctly

#### 2.3 Update Components to Use Batched Data

- **Files to Modify**:
  - `src/components/ui/FollowButton.tsx`: Use batched result
  - `src/components/ui/LikeButton.tsx`: Use batched result
  - `src/components/ui/SaveButton.tsx`: Use batched result
  - `src/components/ui/RSVPComponent.tsx`: Use batched result
- **Dependencies**: Phase 2.2 complete
- **Testing**: Verify all buttons show correct state

---

### Phase 3: Progressive Rendering (UX) 🟢

**Priority**: HIGH  
**Risk**: LOW  
**Time**: 3-4 hours

#### 3.1 Create ProgressiveFeed Component

- **New File**: `src/components/ProgressiveFeed.tsx`
- **Purpose**: Show posts one-by-one as they load
- **Features**:
  - Stream posts as data arrives
  - Show first post immediately
  - Add others progressively
  - Stale-while-revalidate pattern
- **Dependencies**: None (new component)
- **Testing**: Test on homepage

#### 3.2 Update Homepage to Use Progressive Rendering

- **Files to Modify**:
  - `src/pages/HomePage.tsx`: Use ProgressiveFeed
  - `src/sections/home/HomePostsSection.tsx`: Support progressive rendering
- **Dependencies**: Phase 3.1 complete
- **Testing**: Verify posts appear one-by-one

#### 3.3 Apply to Profile Pages

- **Files to Modify**:
  - `src/sections/profile/OwnProfilePostsSection.tsx`
  - `src/sections/profile/OtherProfilePostsSection.tsx`
- **Dependencies**: Phase 3.1 complete
- **Testing**: Verify profile posts render progressively

---

### Phase 4: Enhanced Caching (PERSISTENCE) 🟢

**Priority**: MEDIUM  
**Risk**: LOW  
**Time**: 4-5 hours

#### 4.1 Add IndexedDB Support

- **New File**: `src/lib/indexedDBCache.ts`
- **Purpose**: Store large datasets for offline access
- **Data to Store**:
  - Last 100 feed posts
  - Profile data
  - Follow relationships
  - RSVP data
- **Dependencies**: None (new file)
- **Testing**: Test offline functionality

#### 4.2 Unified Cache System

- **Files to Modify**:
  - `src/lib/dataCache.ts`: Integrate IndexedDB
  - `src/lib/profileCache.ts`: Integrate IndexedDB
  - `src/lib/followStatusCache.ts`: Integrate IndexedDB
- **Dependencies**: Phase 4.1 complete
- **Testing**: Verify cache persistence

#### 4.3 Smart Cache Invalidation

- **New File**: `src/lib/cacheInvalidation.ts` (might exist)
- **Purpose**: Invalidate related caches together
- **Dependencies**: Phase 4.2 complete
- **Testing**: Verify cache updates correctly

---

### Phase 5: Optimistic Updates (POLISH) 🟢

**Priority**: MEDIUM  
**Risk**: MEDIUM  
**Time**: 3-4 hours

#### 5.1 Follow/Unfollow Optimistic Updates

- **Files to Modify**:
  - `src/components/ui/FollowButton.tsx`: Update UI immediately
  - `src/api/services/follows.ts`: Add optimistic update support
- **Dependencies**: None
- **Testing**: Test error rollback

#### 5.2 Like/Unlike Optimistic Updates

- **Files to Modify**:
  - `src/components/ui/LikeButton.tsx`: Already has optimistic updates ✅
  - Verify error handling
- **Dependencies**: None
- **Testing**: Test error rollback

#### 5.3 RSVP Optimistic Updates

- **Files to Modify**:
  - `src/components/ui/RSVPComponent.tsx`: Update UI immediately
  - `src/components/ui/RSVPListDrawer.tsx`: Update UI immediately
- **Dependencies**: None
- **Testing**: Test error rollback

---

### Phase 6: Connection-Aware (ADAPTIVE) 🟢

**Priority**: LOW  
**Risk**: LOW  
**Time**: 2-3 hours

#### 6.1 Connection Detection

- **Files to Modify**:
  - `src/lib/connectionAware.ts` (might exist)
  - Add connection speed detection
- **Dependencies**: None
- **Testing**: Test on slow networks

#### 6.2 Adaptive Behavior

- **Files to Modify**:
  - `src/lib/dataCache.ts`: Adjust TTL based on connection
  - `src/lib/imageOptimization.ts`: Adjust quality based on connection
- **Dependencies**: Phase 6.1 complete
- **Testing**: Test on slow/fast networks

---

## PART 4: IMPLEMENTATION CHECKLIST

### Pre-Implementation Checklist

- [ ] Run all SQL diagnostic queries
- [ ] Document all current API calls (this document)
- [ ] Identify all components that need updates
- [ ] Create backup of current code
- [ ] Set up feature flags for gradual rollout

### Phase 1: RSVP 406 Fix Checklist

- [ ] Run SQL diagnostic queries
- [ ] Identify root cause
- [ ] Fix RLS policies or query format
- [ ] Test RSVP prefetching in dataCache
- [ ] Test RSVPComponent
- [ ] Test RSVPListDrawer
- [ ] Verify no regressions
- [ ] Document fix

### Phase 2: Batch Data Loader Checklist

- [ ] Create `src/lib/batchDataLoader.ts`
- [ ] Implement batch follow status query
- [ ] Implement batch like status query
- [ ] Implement batch save status query
- [ ] Implement batch RSVP data query
- [ ] Implement batch profile query
- [ ] Add caching to batch loader
- [ ] Integrate with homepage
- [ ] Update FollowButton to use batched data
- [ ] Update LikeButton to use batched data
- [ ] Update SaveButton to use batched data
- [ ] Update RSVPComponent to use batched data
- [ ] Test with 6 posts on homepage
- [ ] Verify all data loads correctly
- [ ] Verify no regressions
- [ ] Measure query reduction

### Phase 3: Progressive Rendering Checklist

- [ ] Create `src/components/ProgressiveFeed.tsx`
- [ ] Implement streaming post rendering
- [ ] Add stale-while-revalidate pattern
- [ ] Update homepage to use ProgressiveFeed
- [ ] Update HomePostsSection to support progressive
- [ ] Test on homepage
- [ ] Apply to OwnProfilePostsSection
- [ ] Apply to OtherProfilePostsSection
- [ ] Verify posts appear one-by-one
- [ ] Verify no regressions
- [ ] Measure UX improvement

### Phase 4: Enhanced Caching Checklist

- [ ] Create `src/lib/indexedDBCache.ts`
- [ ] Implement IndexedDB storage
- [ ] Store last 100 feed posts
- [ ] Store profile data
- [ ] Store follow relationships
- [ ] Integrate with dataCache
- [ ] Integrate with profileCache
- [ ] Integrate with followStatusCache
- [ ] Test offline functionality
- [ ] Test cache persistence
- [ ] Verify no regressions

### Phase 5: Optimistic Updates Checklist

- [ ] Verify FollowButton optimistic updates
- [ ] Verify LikeButton optimistic updates (already done)
- [ ] Add RSVP optimistic updates
- [ ] Test error rollback for all
- [ ] Verify no regressions

### Phase 6: Connection-Aware Checklist

- [ ] Implement connection detection
- [ ] Adjust cache TTL based on connection
- [ ] Adjust image quality based on connection
- [ ] Skip prefetching on slow networks
- [ ] Test on slow networks
- [ ] Test on fast networks
- [ ] Verify no regressions

### Post-Implementation Checklist

- [ ] Measure query reduction (target: 84%)
- [ ] Measure egress reduction (target: 84%)
- [ ] Measure UX improvement (time to first post)
- [ ] Test all pages
- [ ] Test all drawers
- [ ] Test all components
- [ ] Verify no regressions
- [ ] Document changes
- [ ] Update performance metrics

---

## PART 5: RISK ASSESSMENT & MITIGATION

### High Risk Items

1. **RSVP 406 Fix**

   - **Risk**: Breaking existing RSVP functionality
   - **Mitigation**:
     - Test thoroughly before deploying
     - Have rollback plan for RLS policies
     - Test in staging first

2. **Batch Data Loader Integration**
   - **Risk**: Missing data or incorrect data
   - **Mitigation**:
     - Comprehensive testing
     - Feature flag for gradual rollout
     - Keep old code as fallback initially

### Medium Risk Items

1. **Progressive Rendering**

   - **Risk**: UI flickering or incorrect order
   - **Mitigation**:
     - Test with various network speeds
     - Add loading states
     - Handle errors gracefully

2. **Cache Invalidation**
   - **Risk**: Stale data shown to users
   - **Mitigation**:
     - Smart invalidation logic
     - TTL on all cached data
     - Manual refresh option

### Low Risk Items

1. **Optimistic Updates**

   - **Risk**: UI shows incorrect state if server fails
   - **Mitigation**:
     - Always have error rollback
     - Show error messages
     - Retry mechanism

2. **Connection-Aware**
   - **Risk**: Incorrect connection detection
   - **Mitigation**:
     - Conservative detection
     - Fallback to normal behavior
     - User can override

---

## PART 6: EGRESS DATA OPTIMIZATION

### Current Egress Usage

- **Homepage**: ~50 queries per load
- **Profile Page**: ~20 queries per load
- **Drawer Open**: ~5 queries per open

### Target Egress Usage

- **Homepage**: ~8 queries per load (84% reduction)
- **Profile Page**: ~5 queries per load (75% reduction)
- **Drawer Open**: ~2 queries per open (60% reduction)

### Optimization Techniques

1. **Batching**: Combine multiple queries into one
2. **Caching**: Cache aggressively, use stale data
3. **Request Deduplication**: Use `requestManager` everywhere
4. **Smart Prefetching**: Only prefetch what's needed
5. **Connection-Aware**: Skip prefetch on slow networks
6. **Progressive Loading**: Load only visible content

### Expected Savings

- **Queries**: 84% reduction
- **Egress Data**: 84% reduction
- **Cost**: Significant reduction in Supabase egress costs

---

## PART 7: TESTING STRATEGY

### Unit Tests

- Test batch data loader functions
- Test cache functions
- Test optimistic update rollback

### Integration Tests

- Test homepage with batch loader
- Test profile pages with batch loader
- Test drawers with batch loader

### E2E Tests

- Test full user flow on homepage
- Test full user flow on profile pages
- Test RSVP functionality
- Test follow/unfollow
- Test like/unlike
- Test save/unsave

### Performance Tests

- Measure query count before/after
- Measure egress data before/after
- Measure time to first post
- Measure time to interactive

### Regression Tests

- Test all existing functionality
- Test all pages
- Test all drawers
- Test all components

---

## PART 8: ROLLOUT PLAN

### Phase 1: RSVP Fix (Week 1)

- Day 1-2: Diagnose and fix RSVP 406 errors
- Day 3: Test thoroughly
- Day 4: Deploy to staging
- Day 5: Deploy to production

### Phase 2: Batch Loader (Week 2)

- Day 1-3: Create batch data loader
- Day 4: Integrate with homepage
- Day 5: Test and deploy

### Phase 3: Progressive Rendering (Week 3)

- Day 1-2: Create ProgressiveFeed component
- Day 3: Integrate with homepage
- Day 4: Apply to profile pages
- Day 5: Test and deploy

### Phase 4: Enhanced Caching (Week 4)

- Day 1-2: Add IndexedDB support
- Day 3: Integrate with existing caches
- Day 4-5: Test and deploy

### Phase 5: Optimistic Updates (Week 5)

- Day 1-2: Add optimistic updates
- Day 3: Test error handling
- Day 4-5: Deploy

### Phase 6: Connection-Aware (Week 6)

- Day 1-2: Implement connection detection
- Day 3: Add adaptive behavior
- Day 4-5: Test and deploy

---

## CONCLUSION

This comprehensive audit provides:

1. ✅ Complete mapping of all API calls
2. ✅ Identification of optimization opportunities
3. ✅ Detailed implementation strategy
4. ✅ Risk assessment and mitigation
5. ✅ Testing and rollout plan

**Next Steps:**

1. Run SQL diagnostic queries for RSVP 406 errors
2. Fix RSVP 406 errors (Phase 1)
3. Implement batch data loader (Phase 2)
4. Implement progressive rendering (Phase 3)
5. Continue with remaining phases

**Expected Results:**

- 84% reduction in API queries
- 84% reduction in egress data
- Instant loading with progressive rendering
- Smooth user experience
- Significant cost savings
