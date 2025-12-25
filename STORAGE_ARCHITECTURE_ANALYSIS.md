# Storage Architecture Analysis - Step 1.0

## Executive Summary

This document provides a comprehensive analysis of all existing cache systems in the application. It identifies data types, TTL strategies, size estimates, access patterns, and design requirements for a unified storage abstraction layer that is compatible with both web and Capacitor environments.

---

## 1. Cache Inventory

### 1.1 Feed Data Cache (`dataCache.ts`)

**Purpose**: Caches homepage feed posts with all related data (follow status, likes, saves, RSVPs)

**Storage**: 
- **Memory**: `Map<string, CacheEntry>` (primary)
- **localStorage**: `echotoo_cache` (persistence for feed keys only)

**Data Structure**:
```typescript
interface CacheEntry<T> {
  data: T; // FeedItem[] array
  timestamp: number;
  ttl: number; // Connection-aware (5-15 minutes base, 3x on slow)
}
```

**Key Format**: `feed:{type}:{q}:{tags}:{limit}:{offset}:{viewerProfileId}`

**TTL Strategy**:
- Base: 5-10 minutes (varies by operation)
- Connection-aware: 3x multiplier on slow connections
- Feed cache: 10 minutes

**Size Estimates**:
- Per feed entry: ~50-100KB (15-20 posts with full data)
- Max entries: 15 feed sets
- Total estimate: ~750KB - 1.5MB

**Access Patterns**:
- **Read**: Very frequent (every page load, scroll)
- **Write**: Frequent (new posts, pagination)
- **Invalidation**: On auth change, new posts detected

**Special Features**:
- PWA retry logic for localStorage access
- Cache versioning (`v3`)
- New post detection (compares IDs)
- User-specific keys (prevents cross-user leakage)

**Capacitor Considerations**:
- ✅ Works with Capacitor Preferences API
- ⚠️ localStorage size limits may be restrictive
- ✅ IndexedDB migration path available

---

### 1.2 Profile Posts Cache (`profilePostsCache.ts`)

**Purpose**: Caches profile page posts (created, saved, interacted tabs)

**Storage**: localStorage only (`profile_posts_cache`)

**Data Structure**:
```typescript
interface ProfilePostsCacheEntry<T> {
  data: T[]; // Post array (max 5 posts per tab)
  timestamp: number;
  userId: string;
  version: number; // Schema version
}
```

**Key Format**: `{userId}_{tab}` (e.g., `uuid-123_created`)

**TTL Strategy**:
- Base: 10 minutes
- Connection-aware: 3x multiplier on slow connections
- No expiration for active user

**Size Estimates**:
- Per entry: ~20-50KB (5 posts)
- Max entries: ~30-50 users (3 tabs each = 90-150 entries)
- Total estimate: ~600KB - 2.5MB

**Access Patterns**:
- **Read**: Frequent (profile page loads, tab switches)
- **Write**: Moderate (new posts, saves, likes)
- **Invalidation**: On profile update, post creation

**Special Features**:
- Image preloading for cached posts
- Smart cache update (detects new posts)
- Version-based schema migration

**Capacitor Considerations**:
- ✅ Works with Capacitor Preferences API
- ⚠️ May exceed localStorage limits with many users
- ✅ IndexedDB migration recommended for large datasets

---

### 1.3 Profile Cache (`profileCache.ts`)

**Purpose**: Caches user profile data (username, display name, avatar, bio, privacy settings)

**Storage**: localStorage only (`profile_cache`, `profile_username_cache`)

**Data Structure**:
```typescript
interface ProfileCacheEntry {
  id: string;
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  xp: number | null;
  member_no: number | null;
  instagram_url: string | null;
  tiktok_url: string | null;
  telegram_url: string | null;
  is_private?: boolean | null;
  social_media_public?: boolean | null;
  timestamp: number;
}
```

**Key Format**: Profile ID (UUID)

**TTL Strategy**:
- Base: 30 minutes
- Connection-aware: 3x multiplier on slow connections

**Size Estimates**:
- Per profile: ~1-2KB
- Max profiles: ~100-200 (typical user)
- Total estimate: ~100-400KB

**Access Patterns**:
- **Read**: Very frequent (every post render, profile view)
- **Write**: Moderate (profile updates, new profiles discovered)
- **Invalidation**: On profile edit, username change

**Special Features**:
- Username → Profile ID mapping (separate cache)
- Batch caching support (`setCachedProfiles`)
- Privacy settings included

**Capacitor Considerations**:
- ✅ Perfect for Capacitor Preferences API
- ✅ Small size, no migration needed

---

### 1.4 Follow Status Cache (`followStatusCache.ts`)

**Purpose**: Caches follow relationships (none, pending, following, friends)

**Storage**: localStorage only (`follow_status_cache`)

**Data Structure**:
```typescript
interface FollowStatusCacheEntry {
  status: "none" | "pending" | "following" | "friends";
}
```

**Key Format**: `{viewerId}-{targetProfileId}`

**TTL Strategy**:
- **No expiration** - cleared only on relationship change

**Size Estimates**:
- Per entry: ~50 bytes
- Max entries: ~500-2000 (active user following many)
- Total estimate: ~25KB - 100KB

**Access Patterns**:
- **Read**: Very frequent (every post render)
- **Write**: Infrequent (follow/unfollow actions)
- **Invalidation**: On follow/unfollow, profile deletion

**Special Features**:
- No TTL (event-based invalidation only)
- Bidirectional clearing (viewer or target)

**Capacitor Considerations**:
- ✅ Perfect for Capacitor Preferences API
- ✅ Small size, no migration needed

---

### 1.5 RSVP Cache (`rsvpCache.ts`)

**Purpose**: Caches RSVP data for hangout posts (users going, current user status)

**Storage**: localStorage only (`rsvp_cache`)

**Data Structure**:
```typescript
interface RSVPCacheEntry {
  users: RSVPUser[]; // Max 10 users
  currentUserRsvp: string | null;
  timestamp: number;
}
```

**Key Format**: Post ID (UUID)

**TTL Strategy**:
- Fixed: 10 minutes
- **Not connection-aware** (should be added)

**Size Estimates**:
- Per entry: ~2-5KB (10 users with avatars)
- Max entries: ~50-100 hangout posts
- Total estimate: ~100KB - 500KB

**Access Patterns**:
- **Read**: Moderate (hangout post views)
- **Write**: Moderate (RSVP actions)
- **Invalidation**: On RSVP change, post deletion

**Special Features**:
- Limited to 10 users per post
- Current user status included

**Capacitor Considerations**:
- ✅ Works with Capacitor Preferences API
- ⚠️ May grow large with many hangouts
- ✅ IndexedDB migration optional

---

### 1.6 Follow Counts Cache (`followCountsCache.ts`)

**Purpose**: Caches follower/following counts for profiles

**Storage**: localStorage only (`follow_counts_cache`)

**Data Structure**:
```typescript
interface FollowCountsCacheEntry {
  following: number;
  followers: number;
  timestamp: number;
}
```

**Key Format**: Profile ID (UUID)

**TTL Strategy**:
- Base: 5 minutes
- Connection-aware: 3x multiplier on slow connections

**Size Estimates**:
- Per entry: ~50 bytes
- Max entries: ~100-200 profiles
- Total estimate: ~5KB - 10KB

**Access Patterns**:
- **Read**: Frequent (profile page loads)
- **Write**: Moderate (follow/unfollow actions)
- **Invalidation**: On follow/unfollow, real-time updates

**Special Features**:
- Real-time updates via Supabase subscriptions (separate from cache)

**Capacitor Considerations**:
- ✅ Perfect for Capacitor Preferences API
- ✅ Tiny size, no migration needed

---

### 1.7 Avatar Cache (`avatarCache.ts`)

**Purpose**: Caches avatar URLs (not images, just URLs)

**Storage**: localStorage only (`avatar_cache`)

**Data Structure**:
```typescript
interface CachedAvatar {
  url: string;
  timestamp: number;
}
```

**Key Format**: User ID (UUID)

**TTL Strategy**:
- Base: 24 hours
- Connection-aware: 3x multiplier on slow connections

**Size Estimates**:
- Per entry: ~200 bytes (URL string)
- Max entries: ~200-500 users
- Total estimate: ~40KB - 100KB

**Access Patterns**:
- **Read**: Very frequent (every post, comment, profile)
- **Write**: Infrequent (avatar changes)
- **Invalidation**: On avatar update

**Special Features**:
- Image preloading helper (`preloadAvatar`)
- Long TTL (avatars change rarely)

**Capacitor Considerations**:
- ✅ Perfect for Capacitor Preferences API
- ✅ Small size, no migration needed

---

### 1.8 Notification Settings Cache (`notificationSettingsCache.ts`)

**Purpose**: Caches notification preferences for follow relationships

**Storage**: localStorage only (`notification_settings_cache`)

**Data Structure**:
```typescript
interface NotificationSettingsCacheEntry {
  enabled: boolean;
}
```

**Key Format**: `{viewerId}-{targetProfileId}`

**TTL Strategy**:
- **No expiration** - cleared only on settings change

**Size Estimates**:
- Per entry: ~20 bytes
- Max entries: ~100-500 (active user)
- Total estimate: ~2KB - 10KB

**Access Patterns**:
- **Read**: Infrequent (settings page)
- **Write**: Rare (settings changes)
- **Invalidation**: On settings change, unfollow

**Capacitor Considerations**:
- ✅ Perfect for Capacitor Preferences API
- ✅ Tiny size, no migration needed

---

### 1.9 Invite Status Cache (`inviteStatusCache.ts`)

**Purpose**: Caches invite status (pending, accepted, declined)

**Storage**: localStorage only (`invite_status_cache`)

**Data Structure**:
```typescript
interface InviteStatusCacheEntry {
  status: "pending" | "accepted" | "declined";
}
```

**Key Format**: Invite ID (UUID)

**TTL Strategy**:
- **No expiration** - cleared only on status change

**Size Estimates**:
- Per entry: ~30 bytes
- Max entries: ~50-200 invites
- Total estimate: ~1.5KB - 6KB

**Access Patterns**:
- **Read**: Moderate (invite views)
- **Write**: Moderate (invite actions)
- **Invalidation**: On invite status change

**Capacitor Considerations**:
- ✅ Perfect for Capacitor Preferences API
- ✅ Tiny size, no migration needed

---

### 1.10 Follow Request Status Cache (`followRequestStatusCache.ts`)

**Purpose**: Caches follow request status (pending, approved, declined)

**Storage**: localStorage only (`follow_request_status_cache`)

**Data Structure**:
```typescript
interface FollowRequestStatusCacheEntry {
  status: "pending" | "approved" | "declined";
}
```

**Key Format**: `{followerId}-{followingId}`

**TTL Strategy**:
- **No expiration** - cleared only on status change

**Size Estimates**:
- Per entry: ~30 bytes
- Max entries: ~50-200 requests
- Total estimate: ~1.5KB - 6KB

**Access Patterns**:
- **Read**: Moderate (request views)
- **Write**: Moderate (request actions)
- **Invalidation**: On request status change

**Capacitor Considerations**:
- ✅ Perfect for Capacitor Preferences API
- ✅ Tiny size, no migration needed

---

### 1.11 Saved Posts Cache (`savedPosts.ts`)

**Purpose**: Caches saved posts for current user

**Storage**: localStorage only (key not specified in analysis)

**Data Structure**: `SavedPostWithDetails[]`

**TTL Strategy**: Not specified (likely similar to profile posts)

**Size Estimates**:
- Per entry: ~20-50KB (similar to profile posts)
- Max entries: ~50-100 saved posts
- Total estimate: ~1MB - 5MB

**Access Patterns**:
- **Read**: Moderate (saved tab views)
- **Write**: Moderate (save/unsave actions)
- **Invalidation**: On save/unsave

**Capacitor Considerations**:
- ⚠️ May exceed localStorage limits
- ✅ IndexedDB migration recommended

---

## 2. Storage Summary

### 2.1 Total Size Estimates

| Cache Type | Size Range | Storage Type |
|------------|------------|--------------|
| Feed Data | 750KB - 1.5MB | Memory + localStorage |
| Profile Posts | 600KB - 2.5MB | localStorage |
| Profiles | 100KB - 400KB | localStorage |
| Follow Status | 25KB - 100KB | localStorage |
| RSVP | 100KB - 500KB | localStorage |
| Follow Counts | 5KB - 10KB | localStorage |
| Avatar URLs | 40KB - 100KB | localStorage |
| Notification Settings | 2KB - 10KB | localStorage |
| Invite Status | 1.5KB - 6KB | localStorage |
| Follow Request Status | 1.5KB - 6KB | localStorage |
| Saved Posts | 1MB - 5MB | localStorage |
| **TOTAL** | **~2.6MB - 10.5MB** | Mixed |

### 2.2 Storage Type Distribution

- **Memory (Map)**: Feed data (hot cache)
- **localStorage**: All other caches (persistent)
- **IndexedDB**: None currently (migration target)

### 2.3 TTL Strategy Summary

| Strategy | Caches | Count |
|----------|--------|-------|
| Connection-aware TTL | Feed, Profile Posts, Profiles, Follow Counts, Avatars | 5 |
| Fixed TTL | RSVP | 1 |
| No TTL (event-based) | Follow Status, Notification Settings, Invite Status, Follow Request Status | 4 |

---

## 3. Access Patterns

### 3.1 Read Frequency

**Very Frequent** (every render):
- Feed Data
- Profile Cache
- Follow Status
- Avatar URLs

**Frequent** (page loads):
- Profile Posts
- Follow Counts

**Moderate** (feature-specific):
- RSVP
- Saved Posts
- Notification Settings
- Invite Status
- Follow Request Status

### 3.2 Write Frequency

**Very Frequent**:
- Feed Data (pagination, new posts)

**Frequent**:
- Profile Posts (new posts, saves, likes)

**Moderate**:
- Profiles (updates, discoveries)
- RSVP (actions)
- Follow Counts (actions)

**Infrequent**:
- Follow Status (follow/unfollow)
- Avatar URLs (changes)
- Notification Settings (changes)
- Invite Status (actions)
- Follow Request Status (actions)

### 3.3 Invalidation Patterns

**Event-based** (immediate):
- Follow Status (on follow/unfollow)
- Notification Settings (on change)
- Invite Status (on action)
- Follow Request Status (on action)
- Avatar URLs (on change)

**Time-based** (TTL):
- Feed Data
- Profile Posts
- Profiles
- RSVP
- Follow Counts

**Auth-based** (on login/logout):
- Feed Data (user-specific keys)

---

## 4. Design Requirements

### 4.1 Unified Interface

**Required Methods**:
```typescript
interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(): Promise<string[]>;
  has(key: string): Promise<boolean>;
}
```

### 4.2 Multi-Tier Storage

**Priority Order**:
1. **Memory** (fastest, cleared on refresh)
   - Hot data: Feed data, frequently accessed profiles
   - Size limit: ~50MB (browser-dependent)
   
2. **localStorage** (persistent, limited)
   - Medium data: Profile posts, profiles, follow status
   - Size limit: ~5-10MB (browser-dependent)
   
3. **IndexedDB** (large datasets, persistent)
   - Large data: Feed history, saved posts, image metadata
   - Size limit: Browser limit (~50% of disk)

### 4.3 Capacitor Compatibility

**Required Adapters**:
- **Web**: Memory → localStorage → IndexedDB
- **Capacitor**: Memory → Preferences API → Filesystem API

**Environment Detection**:
```typescript
function isCapacitor(): boolean {
  return typeof window !== 'undefined' && 
         (window as any).Capacitor !== undefined;
}
```

### 4.4 TTL Support

**Requirements**:
- Connection-aware TTL multiplier (3x on slow connections)
- Per-key TTL override
- Default TTL per cache type
- Automatic expiration cleanup

### 4.5 Cache Versioning

**Requirements**:
- Version-based invalidation
- Schema migration support
- Backward compatibility

### 4.6 Error Handling

**Requirements**:
- Graceful degradation (fallback to next tier)
- PWA retry logic (localStorage access)
- Quota exceeded handling
- Silent failures for non-critical caches

---

## 5. Migration Strategy

### 5.1 Phase 1: Create Abstraction (No Breaking Changes)
- Create `StorageAdapter` interface
- Implement web adapters (Memory, LocalStorage, IndexedDB)
- Keep existing cache functions as wrappers

### 5.2 Phase 2: Gradual Migration
- Migrate one cache at a time
- Test thoroughly before next migration
- Maintain backward compatibility

### 5.3 Phase 3: Capacitor Support
- Add Capacitor adapters
- Environment detection
- Test on native devices

### 5.4 Phase 4: Optimization
- Move large caches to IndexedDB
- Optimize access patterns
- Add monitoring/metrics

---

## 6. Recommendations

### 6.1 Immediate Actions

1. **Create Storage Adapter Interface**
   - Unified API for all storage operations
   - Type-safe, Promise-based
   - Error handling built-in

2. **Implement Web Adapters**
   - Memory adapter (existing Map)
   - LocalStorage adapter (existing logic)
   - IndexedDB adapter (new, for large data)

3. **Add Connection-Aware TTL**
   - Extend to RSVP cache
   - Standardize across all caches
   - Use `connectionAware.ts` utilities

### 6.2 Future Optimizations

1. **IndexedDB Migration**
   - Feed data history (>15 sets)
   - Saved posts (>50 posts)
   - Profile posts history

2. **Capacitor Adapters**
   - Preferences API for small data
   - Filesystem API for large data
   - Network detection for offline mode

3. **Cache Monitoring**
   - Size tracking
   - Hit/miss ratios
   - Performance metrics

---

## 7. Next Steps

**Step 1.1**: Create storage adapter interface
- Define `StorageAdapter` interface
- Define `StorageManager` class
- Add TypeScript types

**Step 1.2**: Implement web adapters
- Memory adapter
- LocalStorage adapter
- IndexedDB adapter

**Step 1.3**: Integrate with existing caches
- Wrap existing cache functions
- Maintain backward compatibility
- Test thoroughly

**Step 1.4**: Capacitor preparation
- Design Capacitor adapters
- Add environment detection
- Document migration path

---

## 8. Conclusion

The current caching system is well-designed but fragmented. A unified storage abstraction layer will:

1. **Simplify maintenance** - Single API for all storage
2. **Enable Capacitor** - Native app support
3. **Improve performance** - Multi-tier storage optimization
4. **Reduce bugs** - Consistent error handling
5. **Future-proof** - Easy to add new storage types

The analysis shows:
- **12 distinct cache systems** with different patterns
- **~2.6MB - 10.5MB** total storage usage
- **Mixed TTL strategies** (connection-aware, fixed, event-based)
- **High read frequency** for feed/profile data
- **Event-based invalidation** for relationship data

The unified storage abstraction will maintain all existing functionality while providing a clean path forward for Capacitor and future optimizations.

