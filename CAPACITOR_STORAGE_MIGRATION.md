# Capacitor Storage Migration Guide

## Overview

This guide explains how to migrate your app to use Capacitor storage adapters for native app support. The storage abstraction layer automatically detects the environment and uses the appropriate adapters.

---

## Prerequisites

### 1. Install Capacitor

If you haven't already, install Capacitor:

```bash
npm install @capacitor/core @capacitor/cli
npx cap init
```

### 2. Install Storage Plugins

Install the required Capacitor plugins:

```bash
# For small to medium data (< 1MB per key)
npm install @capacitor/preferences

# For large data (> 1MB)
npm install @capacitor/filesystem

# Sync plugins to native projects
npx cap sync
```

---

## Migration Steps

### Step 1: Update App Initialization

In your main app file (`src/main.tsx` or `src/App.tsx`), initialize storage based on environment:

```typescript
import { initializeDefaultStorage } from './lib/storage/initializeDefaultStorage';
import { initializeCapacitorStorage } from './lib/storage/adapters/initializeCapacitorStorage';
import { isCapacitor } from './lib/storage/utils/capacitorDetection';

// Initialize storage based on environment
if (isCapacitor()) {
  // Native app: use Capacitor adapters
  initializeCapacitorStorage({
    defaultTtl: 10 * 60 * 1000, // 10 minutes
    connectionAware: true,
  });
} else {
  // Web app: use web adapters
  initializeDefaultStorage({
    defaultTtl: 10 * 60 * 1000, // 10 minutes
    connectionAware: true,
  });
}
```

### Step 2: Verify Storage Works

The storage abstraction automatically:
- Detects the environment (web vs Capacitor)
- Uses appropriate adapters
- Falls back gracefully if plugins aren't available

No changes needed to existing cache code - it will automatically use the new storage layer!

### Step 3: Test on Native Devices

1. **Build for iOS:**
   ```bash
   npx cap sync ios
   npx cap open ios
   ```

2. **Build for Android:**
   ```bash
   npx cap sync android
   npx cap open android
   ```

3. **Test storage:**
   - Verify feed data persists across app restarts
   - Check that profile data is cached correctly
   - Ensure no errors in console

---

## Storage Adapter Priority

### Web Environment
1. **Memory** (50MB) - Fastest, cleared on refresh
2. **LocalStorage** (5MB) - Persistent, limited size
3. **IndexedDB** (100MB) - Large datasets, persistent

### Capacitor Environment
1. **Memory** (50MB) - Fastest, cleared on refresh
2. **Capacitor Preferences** (1MB per key) - Small to medium data
3. **Capacitor Filesystem** (100MB) - Large data

---

## Adapter Selection

The `StorageManager` automatically selects the best adapter based on:

1. **Data Size:**
   - < 100KB → Memory
   - < 1MB → Preferences (Capacitor) or LocalStorage (Web)
   - > 1MB → Filesystem (Capacitor) or IndexedDB (Web)

2. **Availability:**
   - Tries adapters in priority order
   - Falls back to next adapter if one fails

3. **Environment:**
   - Web: Uses browser APIs
   - Capacitor: Uses native plugins

---

## Troubleshooting

### Issue: "Capacitor Preferences is not available"

**Solution:**
1. Ensure `@capacitor/preferences` is installed
2. Run `npx cap sync` to sync plugins
3. Rebuild the native app

### Issue: "Storage manager not initialized"

**Solution:**
Make sure you call `initializeCapacitorStorage()` or `initializeDefaultStorage()` before using storage.

### Issue: Data not persisting

**Solution:**
1. Check that you're using the storage manager (not direct localStorage)
2. Verify TTL hasn't expired
3. Check console for errors

### Issue: Quota exceeded

**Solution:**
1. Large data is automatically moved to Filesystem/IndexedDB
2. Check adapter size limits
3. Consider clearing old cache entries

---

## Best Practices

### 1. Use Appropriate Adapters

- **Small data** (< 1MB): Use Preferences/LocalStorage
- **Large data** (> 1MB): Use Filesystem/IndexedDB
- **Hot data**: Always in Memory for fastest access

### 2. Handle Errors Gracefully

The storage abstraction handles errors automatically, but you can add custom error handling:

```typescript
try {
  await storage.set('key', data);
} catch (error) {
  if (error.code === 'QUOTA_EXCEEDED') {
    // Handle quota exceeded
  }
}
```

### 3. Monitor Storage Usage

```typescript
const stats = await storage.getStats();
console.log('Storage usage:', stats);
```

### 4. Clear Cache When Needed

```typescript
// Clear all storage
await storage.clear();

// Clear specific keys
await storage.delete('feed:home');
```

---

## Migration Checklist

- [ ] Install Capacitor and plugins
- [ ] Update app initialization
- [ ] Test on web (should work as before)
- [ ] Test on iOS device
- [ ] Test on Android device
- [ ] Verify data persistence
- [ ] Check for console errors
- [ ] Monitor storage usage

---

## Next Steps

After migration:

1. **Optimize Storage:**
   - Move large caches to Filesystem/IndexedDB
   - Implement cache size limits
   - Add cache cleanup strategies

2. **Add Monitoring:**
   - Track storage usage
   - Monitor hit/miss ratios
   - Log performance metrics

3. **Enhance Features:**
   - Offline support
   - Background sync
   - Cache invalidation strategies

---

## Support

For issues or questions:
1. Check console for errors
2. Verify plugin installation
3. Test on both web and native
4. Review adapter logs

The storage abstraction is designed to be robust and handle errors gracefully, so most issues are related to plugin installation or configuration.

