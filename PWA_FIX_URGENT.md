# 🚨 URGENT: PWA Loading Fix

## Problem
- Home page works on Chrome but not on PWA
- Shows loading skeleton but posts don't load
- ProgressiveFeed not working in PWA context

## Root Cause
Service worker is caching Supabase API responses, interfering with progressive loading.

## Quick Fix (30 minutes)

### Step 1: Update Service Worker (`public/sw.js`)

**Find this section** (around line 164):
```javascript
// Check for Supabase and Auth patterns
const isSupabaseHost = url.hostname.endsWith("supabase.co");
```

**Replace with**:
```javascript
// Check for Supabase and Auth patterns
const isSupabaseHost = url.hostname.endsWith("supabase.co");
const isSupabaseAPI = isSupabaseHost && (
  url.pathname.includes('/rest/v1/') || 
  url.pathname.includes('/rpc/') ||
  url.pathname.includes('/auth/v1/')
);
```

**Then update the exclusion check** (around line 179):
```javascript
// Never handle development assets, auth-related requests, or Supabase requests
if (
  isDevFile ||
  isAuthPath ||
  hasAuthParams ||
  isAuthCallback ||
  isOAuthCallback ||
  isSupabaseHost ||
  isSupabaseAPI  // ADD THIS LINE
) {
  return; // Let browser handle these requests normally
}
```

### Step 2: Update Service Worker Version

**Change** (line 3):
```javascript
const APP_VERSION = "v14"; // Change to "v15"
```

This forces PWA to update and clear old cache.

### Step 3: Add Cache Bypass to Feed Requests

**File**: `src/api/queries/getPublicFeed.ts`

**Find the fetch call** and add cache bypass:
```typescript
const response = await supabase.rpc('get_feed_with_related_data', {
  // ... params
}, {
  // ADD THIS:
  cache: 'no-store', // Bypass service worker cache
  headers: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  }
});
```

### Step 4: Test

1. Clear PWA cache: Settings → Apps → Echotoo → Clear Storage
2. Uninstall PWA
3. Reinstall PWA
4. Test loading - should work now

## Why This Works

- Service worker no longer caches API calls
- App handles all caching via dataCache
- No interference between service worker and progressive loading
- Fresh data always fetched (cached by app, not service worker)

## If Still Not Working

Check:
1. Service worker is updated (check in DevTools → Application → Service Workers)
2. Old cache is cleared
3. Network tab shows API calls are not going through service worker
4. Console for any errors



