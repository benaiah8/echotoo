# 🔴 ROOT CAUSE ANALYSIS - Why Nothing Changed

**Date:** 2026-01-19  
**Status:** ❌ Previous fixes were INCOMPLETE

---

## 🎯 **WHAT WENT WRONG**

### **Critical Error #1: `activities` Prop Doesn't Exist**

**My mistake:** I added this line:
```typescript
activities={(post as any).activities || []}
```

**Reality:** The `Post` component **doesn't have an `activities` prop**!

**Post.tsx interface (lines 33-58):**
```typescript
type PostProps = {
  postId: string;
  caption: string | null;
  // ... other individual props
  post?: FeedItem;  // ← THIS is where activities should be
  // ❌ NO activities prop exists!
};
```

**Result:** The `activities` prop was **ignored**, Post component never received the data.

---

### **Critical Error #2: Missing `post` Prop**

**Current code (OwnProfilePostsSection.tsx, lines 561-586):**
```typescript
<Post
  key={post.id}
  postId={post.id}
  caption={post.caption}
  // ... 20+ individual props
  activities={(post as any).activities || []}  // ❌ Doesn't exist
  // ❌ MISSING: post={post}  ← This is what we need!
/>
```

**What should happen:**
```typescript
<Post
  key={post.id}
  postId={post.id}
  caption={post.caption}
  // ... other individual props
  post={post}  // ✅ Pass entire FeedItem with activities!
/>
```

**Why this matters:**
- `Post.tsx` line 413: `if (post?.activities && post.activities.length > 0)`
- It's looking for `post.activities`, not a separate `activities` prop
- Without `post` prop, it falls back to querying activities separately

---

### **Critical Error #3: Pagination Still Has Empty String**

**Console shows:**
```
[OwnProfile-Created] Loading items: {viewerUserId: '85153c40-3aea-4922-b0c5-7a124b85d9b1', hasViewer: true}
[OwnProfile-Created] Loading items: {viewerUserId: '85153c40-3aea-4922-b0c5-7a124b85d9b1', hasViewer: true}
POST .../get_user_posts_created_with_related_data 400 (Bad Request)
Error: 'invalid input syntax for type uuid: ""'
```

**Analysis:**
- First 2 calls work (offset 0, offset 5)
- Third call fails (offset 10 or 15)
- Something is resetting `viewerUserId` to empty string during pagination

**Possible cause:**
- `getViewerAuthUserId()` being called multiple times
- Race condition with auth state
- Inconsistent return value from cache vs fresh call

---

## 📊 **WHY NETWORK TAB STILL SHOWS INDIVIDUAL QUERIES**

From your network screenshots, I see:
1. ✅ `get_user_posts_created_with_related_data` (200) - **Works for first load**
2. ❌ `get_user_posts_created_with_related_data` (400) - **Fails for pagination**
3. ❌ `post_likes?select=` queries - **Post component fetching likes individually**
4. ❌ `saved_posts?select=` queries - **Post component fetching saves individually**
5. ❌ `rsvp_responses?select=` queries - **RSVPComponent fetching individually**
6. ❌ `comments?select=` queries - **CommentInput fetching individually**

**Root cause for #3-6:**
- These components don't check if data is already in `post` prop
- They always fetch, even if data exists in FeedItem
- Need to modify components to use pre-fetched data

---

## 🔧 **REQUIRED FIXES**

### **Fix #1: Pass `post` Prop to Post Component** (CRITICAL)

**File:** `src/sections/profile/OwnProfilePostsSection.tsx` (line 561)

**Change from:**
```typescript
<Post
  key={post.id}
  postId={post.id}
  caption={post.caption}
  // ... individual props
  activities={(post as any).activities || []}  // ❌ Remove this
/>
```

**Change to:**
```typescript
<Post
  key={post.id}
  postId={post.id}
  caption={post.caption}
  // ... keep individual props for backward compatibility
  post={post}  // ✅ Add this - passes entire FeedItem with activities
/>
```

---

### **Fix #2: Debug Pagination 400 Error** (CRITICAL)

**Investigation needed:**
1. Why does `getViewerAuthUserId()` return empty string on 3rd+ call?
2. Is there a race condition with auth state?
3. Is the check `viewerUserId && viewerUserId !== ""` being bypassed?

**Diagnostic logs to add:**
```typescript
const viewerUserId = await getViewerAuthUserId();
console.log("[DEBUG-Pagination] getViewerAuthUserId() returned:", {
  viewerUserId,
  type: typeof viewerUserId,
  isEmpty: viewerUserId === "",
  isNull: viewerUserId === null,
  isUndefined: viewerUserId === undefined,
  offset,
  limit,
  callNumber: ++callCounter,
});
```

---

### **Fix #3: Modify Post Components to Use Pre-fetched Data** (PERFORMANCE)

**Components that need modification:**
1. **LikeButton.tsx** - Check `post?.is_liked` before querying
2. **SaveButton.tsx** - Check `post?.is_saved` before querying
3. **RSVPComponent.tsx** - Check `post?.rsvp_data` before querying
4. **CommentInput.tsx** - Check `post?.comment_count` before querying

**Example (LikeButton.tsx):**
```typescript
// Current: Always queries
useEffect(() => {
  // Query likes...
}, [postId]);

// Should be: Check post prop first
useEffect(() => {
  if (post?.is_liked !== undefined) {
    setIsLiked(post.is_liked);  // Use pre-fetched data
    return;  // Skip query
  }
  // Only query if not in post prop (backward compatibility)
}, [postId, post?.is_liked]);
```

---

## 🎯 **CORRECTED IMPLEMENTATION PLAN**

### **Step 1: Fix `post` Prop (URGENT)**
- Add `post={post}` to Post component in OwnProfilePostsSection
- Verify activities are passed through
- **Expected result:** Images show immediately, no activities queries

### **Step 2: Debug 400 Error (URGENT)**
- Add diagnostic logs to pagination flow
- Track `getViewerAuthUserId()` return values
- Find why empty string appears on 3rd+ call
- **Expected result:** No 400 errors, all RPC calls succeed

### **Step 3: Optimize Child Components (PERFORMANCE)**
- Modify LikeButton, SaveButton, RSVPComponent to use pre-fetched data
- Fall back to queries only if data missing
- **Expected result:** 90% fewer network requests

### **Step 4: Fix Caching (RELIABILITY)**
- Investigate why cache isn't persisting between navigations
- Check if `setCachedItems` is being called correctly
- **Expected result:** No re-fetch on back navigation

---

## 📝 **LESSONS LEARNED**

1. ❌ **Don't assume props exist** - Always check component interface
2. ❌ **Don't add non-existent props** - TypeScript should catch this, but `(post as any)` bypassed it
3. ❌ **Test incrementally** - Should have verified first fix before adding more
4. ✅ **Deep dive first** - Should have investigated Post.tsx interface before making changes

---

## 🚨 **IMMEDIATE NEXT STEPS**

1. **Fix `post` prop** (5 minutes, high confidence)
2. **Add pagination debugging** (10 minutes, medium confidence)
3. **Wait for user testing** before modifying more components

**Recommendation:** Let's fix #1 and #2 first, test thoroughly, THEN tackle #3.

