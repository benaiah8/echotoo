# Optimization Marking Guide

This guide explains how to mark optimization-related code so it's easy to find, understand, and reference in future work.

## Standard Format

Use this comment pattern for all optimizations:

```typescript
// [OPTIMIZATION: Phase X - Type] Description
// Why: Brief explanation of the optimization
```

## Marking Categories

### 1. Privacy Filtering
- **Tag**: `[OPTIMIZATION: Phase X - Privacy Filter]`
- **Used in**: Privacy filter utility, feed filtering, profile sections, saved posts
- **Example**: `// [OPTIMIZATION: Phase 1 - Privacy Filter] Centralized privacy filtering utility`

### 2. Caching
- **Tag**: `[OPTIMIZATION: Phase X - Cache]`
- **Used in**: Profile cache, follow status cache, privacy cache, avatar cache
- **Example**: `// [OPTIMIZATION: Phase 2 - Cache] Privacy settings cached in profile cache`

### 3. Batch Operations
- **Tag**: `[OPTIMIZATION: Phase X - Batch]`
- **Used in**: Batch follow status checks, batch profile fetches, parallel operations
- **Example**: `// [OPTIMIZATION: Phase 2 - Batch] Batch follow status check for all private authors`

### 4. Prefetching
- **Tag**: `[OPTIMIZATION: Phase X - Prefetch]`
- **Used in**: Profile prefetching, follow status prefetching, image prefetching, next page prefetching
- **Example**: `// [OPTIMIZATION: Phase 4 - Prefetch] Prefetch profiles for visible post authors`

### 5. Request Deduplication
- **Tag**: `[OPTIMIZATION: Phase X - Dedupe]`
- **Used in**: Request manager, duplicate request prevention
- **Example**: `// [OPTIMIZATION: Phase 3 - Dedupe] Prevent duplicate follow status requests`

### 6. Performance
- **Tag**: `[OPTIMIZATION: Phase X - Performance]`
- **Used in**: React.memo, useMemo, useCallback, rendering optimizations
- **Example**: `// [OPTIMIZATION: Phase 6 - Performance] Memoize Post component to prevent unnecessary re-renders`

### 7. Image Loading
- **Tag**: `[OPTIMIZATION: Phase X - Image]`
- **Used in**: Lazy loading, progressive loading, preloading, Intersection Observer
- **Example**: `// [OPTIMIZATION: Phase 5 - Image] Lazy load images with Intersection Observer`

### 8. Connection-Aware
- **Tag**: `[OPTIMIZATION: Phase X - Connection]`
- **Used in**: Slow connection detection, adaptive loading, connection-based optimizations
- **Example**: `// [OPTIMIZATION: Phase 6 - Connection] Reduce prefetching on slow connections`

## Phase Reference

### Phase 1: Privacy Filtering Foundation
- Privacy filter utility
- Cache privacy settings

### Phase 2: Follow Status and Batch Operations
- Follow request cache
- Batch operations optimization

### Phase 3: Cache Management and Request Deduplication
- Request deduplication
- Unified cache invalidation

### Phase 4: Prefetching and Drawer Optimization
- Smart prefetching system
- Followers/following drawer optimization

### Phase 5: Image and Rendering Performance
- Progressive image loading
- Rendering performance

### Phase 6: Advanced Performance Tuning
- Connection-aware optimizations
- React performance optimizations

### Phase 7: Error Handling and Edge Cases
- Error handling and retry logic
- Edge cases and testing
- Visual polish

### Phase 8: Optional Advanced Features
- IndexedDB (if needed)
- Virtual scrolling (if needed)

## File-Level Documentation

For optimization-related files, add a header comment:

```typescript
/**
 * [OPTIMIZATION FILE: Phase X]
 * 
 * This file contains optimizations for [description]
 * 
 * Optimizations included:
 * - [Type 1]: [Description]
 * - [Type 2]: [Description]
 * 
 * Related optimizations:
 * - See: [other file] for [related optimization]
 */
```

## Search Commands

To find all optimizations:
```bash
# Find all optimizations
grep -r "\[OPTIMIZATION:" src/

# Find specific phase
grep -r "OPTIMIZATION: Phase 1" src/

# Find specific type
grep -r "OPTIMIZATION.*Cache" src/
grep -r "OPTIMIZATION.*Batch" src/
grep -r "OPTIMIZATION.*Prefetch" src/
```

## Best Practices

1. **Always mark optimizations**: Every optimization should have the `[OPTIMIZATION: Phase X - Type]` comment
2. **Explain why**: Include a brief "Why:" explanation for each optimization
3. **Use consistent phase numbers**: Reference the 8-phase optimization plan
4. **Link related optimizations**: When optimizations are related, reference each other
5. **Update file headers**: For new optimization files, add the file-level documentation
6. **Be specific**: Include enough detail to understand what was optimized and why

## Examples

### Example 1: Privacy Filter Utility
```typescript
// [OPTIMIZATION: Phase 1 - Privacy Filter] Centralized privacy filtering utility
// Why: Eliminates code duplication, ensures consistent filtering across feed, profile sections, and saved posts
export async function filterPostsByPrivacy<T extends PostWithAuthor>(
  posts: T[],
  viewerProfileId?: string | null
): Promise<T[]> {
  // [OPTIMIZATION: Phase 1 - Cache] Privacy status caching with 5-minute TTL
  // Why: Reduces database queries by caching which profiles are private
  const privateAuthorIds = await getPrivateAuthorIds(authorIds);
  
  // [OPTIMIZATION: Phase 2 - Batch] Batch follow status check for all private authors
  // Why: Single API call instead of multiple sequential calls
  const followStatuses = await getBatchFollowStatuses(
    viewerProfileId,
    Array.from(privateAuthorIds)
  );
}
```

### Example 2: Profile Cache
```typescript
// [OPTIMIZATION: Phase 2 - Cache] Privacy settings cached in profile cache
// Why: Instant display of privacy status without flicker, prevents "Sign in" message
if (cachedProfile) {
  setProfile(cachedProfile);
  setLoading(false); // Show cached data immediately
}
```

### Example 3: Batch Operations
```typescript
// [OPTIMIZATION: Phase 2 - Batch] Batch follow status prefetching for search results
// Why: Single API call for all results instead of loop with individual calls
const followStatuses = await getBatchFollowStatuses(
  currentViewerId,
  profilesToPrefetch.map(p => p.id)
);
```

## When to Use

- **Always**: When implementing any optimization from the 8-phase plan
- **Always**: When adding caching logic
- **Always**: When implementing prefetching
- **Always**: When batching operations
- **Always**: When optimizing React components
- **Always**: When implementing performance improvements

## Benefits

1. **Easy to find**: Search for `[OPTIMIZATION:` to see all optimizations
2. **Organized**: Phase numbers group related work
3. **Searchable**: Can grep by phase, type, or description
4. **Documented**: Comments explain what and why
5. **Reference-friendly**: Easy to find similar patterns when working on new optimizations

