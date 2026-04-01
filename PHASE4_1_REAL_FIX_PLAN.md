# 🚨 **ACTUAL ROOT CAUSE & COMPLETE FIX PLAN**

**Date:** 2026-01-19  
**Status:** Previous fix was 20% complete - This is the REAL fix

---

## ❌ **WHAT WENT WRONG WITH MY PREVIOUS FIX**

### **Critical Mistake:**
I set `getCachedItems={undefined}` and `setCachedItems={undefined}`, which **COMPLETELY DISABLED CACHING**.

**Result:**
- ✅ No infinite loop (because no cache callbacks to trigger re-renders)
- ❌ No caching (every tab switch re-fetches from database)
- ❌ Network tab shows duplicate queries
- ❌ Slow performance
- ❌ High egress costs

---

## ✅ **THE REAL SOLUTION**

### **1. Fix Infinite Loop (Keep Caching)**

**Root Cause:** Cache callbacks had `getDraftsFromStorage` as a dependency, which changed every render.

```typescript
// ❌ BAD (Causes infinite loop):
const getCachedItems = useCallback(() => {
  const drafts = getDraftsFromStorage(); // ← Function changes every render!
  const cached = dataCache.get(...);
  return [...drafts, ...cached];
}, [userId, getDraftsFromStorage]); // ← getDraftsFromStorage changes!
```

**Solution:** Use `userId` as only dependency (like HomePage does):

```typescript
// ✅ GOOD (Stable callback):
const getCachedItems = useCallback(() => {
  // Calculate drafts inline (no dependency on function)
  const draftMeta = localStorage.getItem("draftMeta");
  const hasDrafts = draftMeta && draftMeta !== "{}";
  
  const cached = dataCache.get(`profile_created_${userId}`);
  
  if (hasDrafts) {
    const drafts = parseDrafts(); // Inline function
    return [...drafts, ...(cached || [])];
  }
  
  return cached || null;
}, [userId]); // ← Only userId!
```

---

### **2. Fix Save Button (409 Conflict)**

**Error:** `duplicate key value violates unique constraint "saved_posts_user_id_post_id_key"`

**Root Cause:** Trying to INSERT when post is already saved.

**Solution:** Use UPSERT or check before inserting:

```typescript
// In SaveButton.tsx or wherever save is handled:
const handleSave = async () => {
  if (isSaved) {
    // Delete from saved_posts
    await supabase
      .from("saved_posts")
      .delete()
      .eq("user_id", userId)
      .eq("post_id", postId);
  } else {
    // Insert (use upsert to handle duplicates gracefully)
    await supabase
      .from("saved_posts")
      .upsert({
        user_id: userId,
        post_id: postId,
      }, {
        onConflict: "user_id,post_id" // ← Handle duplicates
      });
  }
};
```

---

### **3. Remove Console Spam**

**Files to fix:**

#### `src/components/ui/InviteDrawer.tsx`
- Remove `[DRAWER-DEBUG]` logs (lines that log flag cleared)

#### `src/api/services/follows.ts`
- Remove `[getViewerId] localStorage.getItem('my_profile_id') HIT` logs

#### `src/api/queries/getUserPostsCreated.ts`
- Remove `[getUserPostsCreatedOptimized]` logs

#### `src/api/services/likes.ts`
- Remove `[getLikedPostsWithDetailsForUserOptimized]` logs

#### `src/components/ProgressiveFeed.tsx`
- Remove `[ProgressiveFeed]` logs (warnings about offset 0)

---

### **4. Fix Tab Switching Re-fetches**

**Problem:** With caching disabled, every tab switch re-queries database.

**Solution:** Restore caching with stable callbacks (see #1 above).

**Expected behavior:**
- First load: Query database → Cache result
- Switch to Interacted: Query database → Cache result
- Switch back to Created: **Read from cache** (no query)

---

### **5. Clean Up Old Query Patterns**

**Problem:** Old components still use individual queries instead of optimized RPC.

**Examples from network tab:**
- Many `saved_posts?select=*` queries
- Many `post_likes?select=*` queries  
- Many `comments?select=*` queries

**Solution:** These should be coming from PostgreSQL RPC functions only.

**Files to audit:**
- `src/components/Post.tsx` - Should use `post.activities` not query
- `src/components/PostActions.tsx` - Should use props not query
- `src/components/ui/SaveButton.tsx` - Fix upsert logic

---

## 📋 **IMPLEMENTATION CHECKLIST**

### **Phase 1: Fix Caching (Highest Priority)**
- [ ] Restore cache callbacks in `OwnProfilePostsSection.tsx`
- [ ] Use stable dependencies (only `userId`, not functions)
- [ ] Handle drafts inline (no `getDraftsFromStorage` dependency)
- [ ] Test: Tab switching should NOT re-fetch

### **Phase 2: Fix Save Button**
- [ ] Find `SaveButton.tsx` or save handler
- [ ] Add upsert logic or check before insert
- [ ] Test: Can save a post, unsave, and save again

### **Phase 3: Remove Console Spam**
- [ ] Remove `[DRAWER-DEBUG]` logs from `InviteDrawer.tsx`
- [ ] Remove `[getViewerId]` logs from `follows.ts`
- [ ] Remove `[getUserPostsCreatedOptimized]` logs
- [ ] Remove `[getLikedPostsWithDetailsForUserOptimized]` logs
- [ ] Remove `[ProgressiveFeed]` warnings
- [ ] Test: Console should be clean

### **Phase 4: Audit Network Queries**
- [ ] Check why `saved_posts?select=*` queries exist
- [ ] Check why `post_likes?select=*` queries exist
- [ ] Ensure all components use RPC data, not individual queries
- [ ] Test: Network tab should show minimal queries

---

## 🎯 **EXPECTED RESULTS AFTER FIX**

| Feature | Current | After Fix |
|---------|---------|-----------|
| Infinite loop | ✅ None | ✅ None |
| Caching | ❌ Disabled | ✅ Working |
| Tab switching | ❌ Re-fetches | ✅ Cached |
| Save button | ❌ 409 error | ✅ Works |
| Console logs | ❌ Spammy | ✅ Clean |
| Network queries | ❌ Duplicates | ✅ Minimal |

---

## 🔧 **CODE PATTERN TO FOLLOW**

**Homepage Pattern (PROVEN TO WORK):**

```typescript
// ✅ STABLE CACHE CALLBACKS (No infinite loop)
getCachedItems={useCallback(() => {
  const cacheKey = `profile_${tab}_${userId}`;
  const cached = dataCache.get<FeedItem[]>(cacheKey);
  return Array.isArray(cached) ? cached : null;
}, [tab, userId])} // ← Only primitive dependencies!

setCachedItems={useCallback((items: FeedItem[]) => {
  const cacheKey = `profile_${tab}_${userId}`;
  dataCache.set(cacheKey, items, 10 * 60 * 1000);
}, [tab, userId])}
```

**For Created Tab with Drafts:**

```typescript
getCachedItems={useCallback(() => {
  // 1. Get cached posts
  const cacheKey = `profile_created_${userId}`;
  const cached = dataCache.get<FeedItem[]>(cacheKey);
  
  // 2. Get drafts inline (no function dependency)
  try {
    const draftMeta = localStorage.getItem("draftMeta");
    const draftActivities = localStorage.getItem("draftActivities");
    
    if (draftMeta && draftMeta !== "{}") {
      const meta = JSON.parse(draftMeta);
      const activities = draftActivities ? JSON.parse(draftActivities) : [];
      const draft: FeedItem = {
        id: "draft-" + Date.now(),
        caption: meta.caption || "Untitled draft",
        // ... other fields
      };
      return [draft, ...(cached || [])];
    }
  } catch (error) {
    console.error("Failed to load drafts:", error);
  }
  
  return cached || null;
}, [userId])} // ← Only userId!
```

---

## 🚀 **NEXT STEPS**

I'll now implement these fixes in order:

1. **Fix OwnProfilePostsSection.tsx** - Restore caching with stable callbacks
2. **Fix SaveButton** - Add upsert logic
3. **Remove console spam** - Clean up all debug logs
4. **Audit network queries** - Ensure RPC-only pattern

**Ready to proceed?**
