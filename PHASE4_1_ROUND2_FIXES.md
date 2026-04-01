# 🔧 **CRITICAL FIXES APPLIED - Round 2**

**Date:** 2026-01-19  
**Status:** Fixed remaining issues from testing

---

## 🎯 **ISSUES FOUND FROM TESTING**

### **✅ Good News:**
1. ✅ No infinite loop errors
2. ✅ Console is cleaner (more readable)
3. ✅ Images still working

### **❌ Issues Found:**
1. ❌ Save button not working (403 error, NOT 409!)
2. ❌ Tab switching still re-fetches everything
3. ❌ Many individual queries still happening
4. ❌ Saved tab loading 4.15 kB (not optimized)

---

## 🔍 **ROOT CAUSE ANALYSIS**

### **Issue 1: Save Button 403 Error**

**Error from console:**
```
Error saving post: {code: '42501', message: 'new row violates row-level security policy (USING expression) for table "saved_posts"'}
```

**Root Cause:** 
- Code 42501 = RLS policy violation (NOT duplicate key!)
- `.upsert()` requires BOTH INSERT and UPDATE policies
- Current database only has INSERT policy for `saved_posts`
- When upsert tries to update an existing row, RLS blocks it

**Current RLS policies:**
```sql
-- EXISTS:
CREATE POLICY "Users can save posts" ON saved_posts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- MISSING:
-- No UPDATE policy!
```

---

### **Issue 2: Tab Switching Re-fetches**

**Root Cause:** Cache callbacks were unstable!

**The Problem:**
```typescript
// ❌ BAD (line 215):
}, [userId, profile]); // profile changes on every render!
```

When `profile` is in the dependency array, the callback gets a new reference every time `profile` updates. This breaks React's memoization and ProgressiveFeed thinks it's a new callback, so it doesn't use the cache.

**Why this happens:**
1. `profile` comes from context
2. Context value changes frequently (even if same data)
3. Callback dependencies include `profile`
4. Callback gets new reference
5. ProgressiveFeed thinks cache is invalid
6. Queries database again

---

### **Issue 3: Many Individual Queries**

From network tab, still seeing:
- `post_likes?select=*` (many)
- `saved_posts?select=*` (many)
- `comments?select=*` (many)
- `rsvp_responses?select=*` (many)
- `activities?select=images` (many)

**Why:** Old components are still making individual queries instead of using data from RPC functions.

---

## ✅ **FIXES APPLIED**

### **Fix 1: Add Missing RLS Policy for Save Button**

**File Created:** `fix_saved_posts_rls_policy.sql`

**SQL to Run:**
```sql
-- Add UPDATE policy for saved_posts (currently missing!)
CREATE POLICY "Users can update their saved posts" ON saved_posts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Why this works:**
- `.upsert()` = INSERT if not exists, UPDATE if exists
- Now both operations have policies
- Save button will work without errors

**Test:** Save a post, unsave it, save it again - should work!

---

### **Fix 2: Remove `profile` from Cache Dependencies**

**File Modified:** `src/sections/profile/OwnProfilePostsSection.tsx`

**Changes:**
```typescript
// ❌ BEFORE (line 215):
}, [userId, profile]); // Unstable!

// ✅ AFTER:
}, [userId]); // Stable - only userId!
```

**Why this works:**
- `userId` is a string that doesn't change unless user changes
- `profile` is accessed from closure (fine!)
- Callback now has stable reference
- ProgressiveFeed will use cache on tab switch

**Test:** Switch tabs, check network - should see NO new RPC calls!

---

### **Fix 3: Add Diagnostic Logs for Cache**

**File Modified:** `src/sections/profile/OwnProfilePostsSection.tsx`

**Added logs:**
```typescript
// Created tab:
console.log("🔍 [CACHE-CREATED] getCachedItems called:", {
  cacheKey,
  hasCached: !!cached,
  cachedCount: cached?.length || 0,
  userId
});

console.log("💾 [CACHE-CREATED] setCachedItems called:", {
  cacheKey,
  itemsCount: items.length,
  nonDraftCount: nonDraftItems.length,
  cached: nonDraftItems.slice(0, 5).length
});

// Interacted tab:
console.log("🔍 [CACHE-INTERACTED] getCachedItems called:", { ... });
console.log("💾 [CACHE-INTERACTED] setCachedItems called:", { ... });
```

**Why this helps:**
- See when cache is read
- See when cache is written
- See if cache has data
- Debug why tab switching might still re-fetch

---

## 🧪 **TESTING STEPS**

### **Step 1: Fix RLS Policy (CRITICAL - Do First!)**

**Run this SQL in Supabase SQL Editor:**
```sql
-- Copy contents of: fix_saved_posts_rls_policy.sql
-- Or just run this:
CREATE POLICY "Users can update their saved posts" ON saved_posts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
```

**Verify:**
```sql
SELECT policyname, cmd FROM pg_policies WHERE tablename = 'saved_posts';
```

**Expected output:**
- "Users can save posts" | INSERT
- "Users can update their saved posts" | UPDATE ← New!
- "Users can unsave their own posts" | DELETE
- "Users can view their own saved posts" | SELECT

---

### **Step 2: Test Save Button**

1. Reload the app
2. Find a post
3. Click save button
4. **Expected:** "Post saved" toast, NO 403 error
5. Click save button again
6. **Expected:** "Post unsaved" toast
7. Click save button again
8. **Expected:** "Post saved" toast
9. **Check console:** No RLS errors

---

### **Step 3: Test Tab Switching with Cache Logs**

1. Open browser console
2. Go to profile page (Created tab)
3. **Look for logs:**
   - `🔍 [CACHE-CREATED] getCachedItems called:` (should show `hasCached: false` first time)
   - `💾 [CACHE-CREATED] setCachedItems called:` (should show items being cached)
4. Switch to Interacted tab
5. **Look for logs:**
   - `🔍 [CACHE-INTERACTED] getCachedItems called:` (should show `hasCached: false` first time)
   - `💾 [CACHE-INTERACTED] setCachedItems called:`
6. Switch back to Created tab
7. **CRITICAL:** Look for `🔍 [CACHE-CREATED] getCachedItems called:`
   - **Expected:** `hasCached: true`, `cachedCount: 5`
   - **Check network tab:** Should see ZERO new `get_user_posts_created_with_related_data` calls!

---

### **Step 4: Analyze Network Tab**

**If tab switching STILL re-fetches:**

Look at the cache logs in console:
- Does `getCachedItems` return data? (`hasCached: true`?)
- Is `setCachedItems` being called?
- What is the `cacheKey`?

**Send me screenshots of:**
1. Console logs (the cache logs with 🔍 and 💾 emojis)
2. Network tab when switching tabs

---

## 📊 **EXPECTED RESULTS**

| Issue | Before | After Fix |
|-------|--------|-----------|
| **Save Button** | ❌ 403 RLS error | ✅ Should work |
| **Tab Switching** | ❌ Re-fetches every time | ✅ Uses cache |
| **Console Logs** | ❌ Hard to read | ✅ Clean + diagnostic |
| **Cache Working** | ❌ Unknown | ✅ Can see with logs |

---

## 🚨 **IF ISSUES PERSIST**

### **If Save Button Still Fails:**
- Check if SQL was run successfully
- Verify policies exist: `SELECT * FROM pg_policies WHERE tablename = 'saved_posts';`
- Check browser console for exact error code

### **If Tab Switching Still Re-fetches:**
1. Look at the cache diagnostic logs
2. Check if `hasCached: true` when switching back
3. If `hasCached: false`, the cache isn't being set
4. Send me the console logs (with 🔍 and 💾 emojis)

### **If Individual Queries Still High:**
- This is a separate issue (Priority 4)
- Will investigate after cache is working
- Requires auditing which components make individual queries

---

## 📋 **FILES MODIFIED**

1. ✅ `fix_saved_posts_rls_policy.sql` (NEW - SQL to run)
2. ✅ `src/sections/profile/OwnProfilePostsSection.tsx` (Fixed cache dependencies + added logs)

---

## 🎯 **CRITICAL NEXT STEPS**

1. **Run the SQL** (fix_saved_posts_rls_policy.sql)
2. **Reload app**
3. **Test save button** (should work now)
4. **Test tab switching** (watch console for cache logs)
5. **Report back** with:
   - Does save button work? ✅/❌
   - Do you see cache logs in console? (🔍 and 💾 emojis)
   - Does tab switching still re-fetch? ✅/❌
   - Screenshots of console + network tab

---

**Status:** ✅ All fixes applied. Waiting for SQL to be run and testing results.
