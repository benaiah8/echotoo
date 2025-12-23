# Phase 2: Progressive Rendering - Comprehensive Plan

## Overview

Implement progressive rendering across the entire application to show content one-by-one as it loads, with intelligent caching, virtual scrolling, and egress optimization.

---

## Core Principles

### 1. **Progressive Rendering**

- Show items immediately as they become available (one-by-one)
- No batch skeleton loading
- First item appears instantly from cache
- Subsequent items stream in progressively

### 2. **Stale-While-Revalidate (SWR)**

- Show cached data immediately
- Fetch fresh data in background
- Update UI when fresh data arrives
- User always sees something, never blank screens

### 3. **Virtual Scrolling / Lazy Loading**

- Only render visible items + buffer
- Load more as user scrolls
- Stop loading when user stops scrolling
- Save egress by not loading everything at once

### 4. **Intersection Observer**

- Detect when user approaches end of list
- Trigger loading for next batch
- Works for both vertical and horizontal scrolling

### 5. **Egress Optimization**

- Load only what's visible + small buffer
- Stop loading when scrolling stops
- Resume loading when scrolling resumes
- Cache aggressively to reduce future requests

---

## Areas to Implement Progressive Rendering

### 1. **Homepage Feed** ✅ Priority: HIGH

**Current State**: Batch loads all posts, shows skeletons
**Target State**:

- First post from cache immediately
- Remaining posts stream in one-by-one
- Horizontal rail loads progressively as user scrolls horizontally
- Vertical feed loads progressively as user scrolls vertically
- Stop loading when user stops scrolling

**Components**:

- `HomePage.tsx` - Main feed
- `HomePostsSection.tsx` - Vertical feed
- `HomeHangoutSection.tsx` - Horizontal rail

**Features**:

- Cache first 5-10 posts
- Show first post immediately
- Stream remaining posts
- Horizontal rail: Load 3-4 visible + 2 buffer, load more on horizontal scroll
- Vertical feed: Load visible + 2 buffer, load more on vertical scroll
- Stop loading when scroll stops for 2 seconds

---

### 2. **Profile Pages** ✅ Priority: HIGH

**Current State**: Batch loads all posts for each tab
**Target State**:

- First post from cache immediately
- Remaining posts stream in one-by-one
- When switching tabs (Created → Saved → Interacted):
  - Show cached data immediately if available
  - Stream fresh data in background
  - Update progressively

**Components**:

- `OwnProfilePostsSection.tsx` - Created/Saved/Interacted tabs
- `OtherProfilePostsSection.tsx` - Created/Interacted tabs

**Features**:

- Cache last viewed tab's posts
- Show cached posts immediately on tab switch
- Stream fresh posts progressively
- Each tab maintains its own progressive loading state

---

### 3. **RSVP Lists** ✅ Priority: MEDIUM

**Current State**: Loads all RSVP users at once
**Target State**:

- Show first 3-5 users immediately
- Stream remaining users one-by-one
- Load more as user scrolls through list

**Components**:

- `RSVPListDrawer.tsx` - RSVP list drawer
- `RSVPComponent.tsx` - RSVP component with user list

**Features**:

- Show first batch immediately
- Progressive loading as user scrolls
- Virtual scrolling for long lists (50+ users)

---

### 4. **Followers/Following Lists** ✅ Priority: MEDIUM

**Current State**: Loads all followers/following at once
**Target State**:

- Show first 10-15 users immediately
- Stream remaining users one-by-one
- Load more as user scrolls

**Components**:

- Profile page followers/following drawers
- Search results for followers

**Features**:

- Progressive loading
- Virtual scrolling for long lists
- Cache recently viewed profiles

---

### 5. **Search Results** ✅ Priority: MEDIUM

**Current State**: Loads all search results at once
**Target State**:

- Show first 5-10 results immediately
- Stream remaining results one-by-one
- Load more as user scrolls

**Components**:

- `HomeSearchSection.tsx` - Post search
- Profile page follower search

**Features**:

- Progressive loading
- Debounce search input (500ms)
- Cancel previous search when new search starts
- Cache search results

---

### 6. **Comments** ✅ Priority: MEDIUM

**Current State**: Loads all comments at once
**Target State**:

- Show first 5-10 comments immediately
- Stream remaining comments one-by-one
- Load more as user scrolls to bottom

**Components**:

- Post detail page comments section
- Comment threads

**Features**:

- Progressive loading
- Virtual scrolling for long threads
- Load replies progressively

---

### 7. **Notifications** ✅ Priority: MEDIUM

**Current State**: Loads all notifications at once
**Target State**:

- Show first 10-15 notifications immediately
- Stream remaining notifications one-by-one
- Load more as user scrolls

**Components**:

- `NotificationList.tsx` - Notification list

**Features**:

- Progressive loading
- Virtual scrolling for long lists
- Cache recent notifications

---

### 8. **Horizontal Rail** ✅ Priority: MEDIUM

**Current State**: Loads all hangouts at once
**Target State**:

- Show first 3-4 visible hangouts immediately
- Load 2-3 more as buffer
- Load more as user scrolls horizontally
- Stop loading when horizontal scroll stops

**Components**:

- `HomeHangoutSection.tsx` - Horizontal rail

**Features**:

- Intersection Observer for horizontal scroll
- Load only visible + buffer
- Stop loading when scroll stops
- Resume when scroll resumes

---

## Implementation Strategy

### Phase 2.1: Core Progressive Feed Component

**Goal**: Create reusable progressive feed component

**New File**: `src/components/ProgressiveFeed.tsx`

**Features**:

- Accepts async data loader function
- Renders items as they become available
- Shows single skeleton for next item
- Integrates with batching
- Supports virtual scrolling
- Intersection Observer for lazy loading
- Stop loading when scroll stops
- Stale-while-revalidate caching

**Props**:

```typescript
interface ProgressiveFeedProps<T> {
  // Data loading
  loadItems: (offset: number, limit: number) => Promise<T[]>;
  renderItem: (item: T, index: number) => React.ReactNode;

  // Caching
  cacheKey?: string;
  getCachedItems?: () => T[] | null;
  setCachedItems?: (items: T[]) => void;

  // Batching
  onBatchDataLoad?: (items: T[]) => Promise<BatchLoadResult | null>;
  batchedData?: BatchLoadResult | null;

  // Virtual scrolling
  enableVirtualScrolling?: boolean;
  itemHeight?: number;
  bufferSize?: number; // Items to render outside viewport

  // Lazy loading
  enableLazyLoading?: boolean;
  loadMoreThreshold?: number; // Pixels from bottom to trigger load

  // Scroll stop detection
  enableScrollStopDetection?: boolean;
  scrollStopDelay?: number; // Milliseconds to wait before stopping

  // Loading states
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;

  // Orientation
  orientation?: "vertical" | "horizontal";
}
```

**Key Methods**:

- `loadInitialItems()` - Load first batch from cache or API
- `loadMoreItems()` - Load next batch
- `handleScroll()` - Detect scroll position, trigger loading
- `handleScrollStop()` - Stop loading when scroll stops
- `resumeLoading()` - Resume loading when scroll resumes

---

### Phase 2.2: Progressive List Component (for simple lists)

**Goal**: Create simpler component for lists (RSVP, followers, comments)

**New File**: `src/components/ProgressiveList.tsx`

**Features**:

- Simpler than ProgressiveFeed (no virtual scrolling complexity)
- Progressive rendering
- Lazy loading
- Scroll stop detection

**Use Cases**:

- RSVP lists
- Followers/Following lists
- Comments
- Notifications

---

### Phase 2.3: Virtual Scrolling Hook

**Goal**: Reusable hook for virtual scrolling

**New File**: `src/hooks/useVirtualScrolling.ts`

**Features**:

- Calculate visible items based on scroll position
- Render only visible + buffer items
- Handle scroll events
- Optimize for performance

**Use Cases**:

- Long lists (100+ items)
- Comments threads
- Followers lists

---

### Phase 2.4: Scroll Stop Detection Hook

**Goal**: Detect when user stops scrolling

**New File**: `src/hooks/useScrollStopDetection.ts`

**Features**:

- Debounce scroll events
- Detect when scroll stops
- Trigger callback when scroll stops
- Resume detection when scroll resumes

**Use Cases**:

- Stop loading when user stops scrolling
- Save egress
- Resume loading when scrolling resumes

---

### Phase 2.5: Stale-While-Revalidate Hook

**Goal**: Show cached data immediately, fetch fresh in background

**New File**: `src/hooks/useStaleWhileRevalidate.ts`

**Features**:

- Get cached data immediately
- Fetch fresh data in background
- Update UI when fresh data arrives
- Handle errors gracefully

**Use Cases**:

- All progressive feeds
- Tab switching
- Page navigation

---

## Implementation Steps

### Step 1: Create Core Hooks

1. `useStaleWhileRevalidate.ts` - SWR pattern
2. `useScrollStopDetection.ts` - Scroll stop detection
3. `useVirtualScrolling.ts` - Virtual scrolling (optional, for long lists)

**Time**: 2-3 hours

---

### Step 2: Create Progressive Components

1. `ProgressiveFeed.tsx` - Main progressive feed component
2. `ProgressiveList.tsx` - Simpler list component

**Time**: 3-4 hours

---

### Step 3: Update Homepage

1. Replace batch loading with ProgressiveFeed
2. Implement horizontal rail progressive loading
3. Add scroll stop detection
4. Integrate with batching

**Time**: 2-3 hours

---

### Step 4: Update Profile Pages

1. OwnProfilePostsSection - Use ProgressiveFeed for all tabs
2. OtherProfilePostsSection - Use ProgressiveFeed for all tabs
3. Implement tab switching with SWR
4. Cache each tab's data separately

**Time**: 2-3 hours

---

### Step 5: Update RSVP Lists

1. RSVPListDrawer - Use ProgressiveList
2. Progressive loading of RSVP users
3. Virtual scrolling for long lists (50+ users)

**Time**: 1-2 hours

---

### Step 6: Update Followers/Following Lists

1. Profile drawers - Use ProgressiveList
2. Progressive loading
3. Virtual scrolling for long lists

**Time**: 1-2 hours

---

### Step 7: Update Search Results

1. HomeSearchSection - Use ProgressiveFeed
2. Debounce search input
3. Cancel previous searches
4. Progressive loading

**Time**: 1-2 hours

---

### Step 8: Update Comments

1. Post detail page - Use ProgressiveList
2. Progressive loading
3. Virtual scrolling for long threads

**Time**: 1-2 hours

---

### Step 9: Update Notifications

1. NotificationList - Use ProgressiveList
2. Progressive loading
3. Virtual scrolling for long lists

**Time**: 1 hour

---

### Step 10: Update Horizontal Rail

1. HomeHangoutSection - Progressive horizontal loading
2. Intersection Observer for horizontal scroll
3. Load only visible + buffer
4. Stop loading when scroll stops

**Time**: 1-2 hours

---

## Technical Details

### Caching Strategy

- **In-Memory Cache**: Fast access, cleared on page refresh
- **localStorage**: Persist across sessions (limited size)
- **IndexedDB**: Large datasets (Phase 3)
- **Cache Keys**: Based on page, filters, tab, etc.

### Scroll Stop Detection

- Debounce scroll events (100ms)
- If no scroll for 2 seconds → stop loading
- Resume loading when scroll resumes
- Clear timeout on scroll

### Virtual Scrolling

- Calculate visible items: `Math.floor(scrollTop / itemHeight)`
- Render: `visibleStart - buffer` to `visibleEnd + buffer`
- Update on scroll
- Use `React.memo` for items

### Intersection Observer

- Observe last visible item
- When it enters viewport → load more
- Works for both vertical and horizontal
- Unobserve when done loading

### Egress Optimization

- Load only visible + buffer (e.g., 5 visible + 2 buffer = 7 items)
- Stop loading when scroll stops
- Resume when scroll resumes
- Cache aggressively
- Prefetch next page only when 80% through current page

---

## Testing Checklist

### Homepage

- [ ] First post appears immediately from cache
- [ ] Posts appear one-by-one as they load
- [ ] No batch skeleton loading
- [ ] Horizontal rail loads progressively
- [ ] Stops loading when scroll stops
- [ ] Resumes loading when scroll resumes

### Profile Pages

- [ ] First post appears immediately from cache
- [ ] Posts appear one-by-one
- [ ] Tab switching shows cached data immediately
- [ ] Fresh data streams in background
- [ ] Each tab maintains its own state

### RSVP Lists

- [ ] First batch appears immediately
- [ ] Remaining users stream in
- [ ] Virtual scrolling for long lists
- [ ] Smooth scrolling

### Followers/Following

- [ ] First batch appears immediately
- [ ] Progressive loading
- [ ] Virtual scrolling for long lists

### Search Results

- [ ] First results appear immediately
- [ ] Progressive loading
- [ ] Debounced search
- [ ] Previous searches cancelled

### Comments

- [ ] First comments appear immediately
- [ ] Progressive loading
- [ ] Virtual scrolling for long threads

### Notifications

- [ ] First notifications appear immediately
- [ ] Progressive loading
- [ ] Virtual scrolling for long lists

### Horizontal Rail

- [ ] First hangouts appear immediately
- [ ] Progressive horizontal loading
- [ ] Stops loading when scroll stops
- [ ] Only loads visible + buffer

---

## Performance Targets

- **First Contentful Paint**: < 500ms (from cache)
- **Time to Interactive**: < 1s (from cache)
- **Progressive Loading**: 1 item per 100-200ms
- **Scroll Stop Detection**: 2 seconds
- **Virtual Scrolling**: Smooth 60fps
- **Egress Reduction**: 70-80% (only load visible + buffer)

---

## Dependencies

- Phase 1 (Batching) ✅ Complete
- React 18+ (for concurrent features)
- Intersection Observer API (browser support)
- requestIdleCallback (optional, for prefetching)

---

## Risks & Mitigations

### Risk 1: Complex State Management

**Mitigation**: Use hooks to encapsulate logic, keep components simple

### Risk 2: Performance Issues

**Mitigation**: Use React.memo, virtual scrolling, debouncing

### Risk 3: Cache Invalidation

**Mitigation**: Clear cache on mutations, use TTL

### Risk 4: Scroll Jank

**Mitigation**: Virtual scrolling, requestAnimationFrame, debouncing

---

## Next Steps

1. Review and approve this plan
2. Start with Step 1 (Core Hooks)
3. Implement step-by-step
4. Test each step before moving to next
5. Monitor performance and egress

---

## Questions to Resolve

1. **Cache TTL**: How long should cached data be valid? (Suggested: 5-10 minutes)
2. **Buffer Size**: How many items outside viewport? (Suggested: 2-3 items)
3. **Scroll Stop Delay**: How long before stopping? (Suggested: 2 seconds)
4. **Virtual Scrolling Threshold**: When to enable? (Suggested: 50+ items)
5. **Horizontal Rail Buffer**: How many hangouts to load? (Suggested: 3 visible + 2 buffer)

---

**Total Estimated Time**: 15-20 hours
**Priority**: HIGH
**Risk**: MEDIUM (complex but well-defined)
