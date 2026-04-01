# Feed Verification Steps (Task A/B)

## Prerequisites

1. **Deploy updated RPC**: Run `create_feed_function.sql` in Supabase SQL Editor so the new pagination + true count is active.

## Task A — Hard Verification

### 1. Run SQL to get eligible post list

In Supabase SQL Editor, run `verify_feed_pagination.sql`:

- **Anonymous**: Use as-is (NULL in joins).
- **Authenticated**: Replace `NULL` in `mutual_follow.follower_id` and `reverse_follow.following_id` with your profile UUID.

You should see:

- `true_total`: Total eligible posts.
- `first_50_ids`: First 50 eligible IDs (ordered by `created_at DESC, id DESC`).

### 2. Load Home feed on clean session

- Clear cache (e.g. DevTools → Application → Clear site data, or incognito).
- Open Home feed.
- Open DevTools Console.

### 3. Capture PF logs

For each page, look for:

```
[PF] page | requestedLimit=... oldOffset=... fetchedLen=... consumedOffset=... nextOffset=... count=... shortStreak=... hasMore=... ids=...
```

### 4. Compare

- **Union of UI IDs**: Collect all `ids=` from PF logs (first+last 5 per page).
- **SQL eligible IDs**: From `verify_feed_pagination.sql` output.
- **Missing IDs**: Any ID in the SQL list that never appears in the UI.
- **Reason**: Use `[FeedPipeline]` logs to see where they were dropped.

## Task B — Pipeline Debug Logs

These logs show where posts are dropped (no behavior changes):

| Log                                              | Location            | What it shows                                            |
| ------------------------------------------------ | ------------------- | -------------------------------------------------------- |
| `[FeedPipeline] getPublicFeedOptimizedWithCount` | getPublicFeed.ts    | raw RPC length, after filterExpiredHangouts, removed IDs |
| `[FeedPipeline] HomePage loadItems`              | HomePage.tsx        | items from loader, after personalization                 |
| `[FeedPipeline] ProgressiveFeed setItems`        | ProgressiveFeed.tsx | prev len, fetched len, appended, deduped, merged len     |

### Interpreting logs

- **rawRpcPostsLength > afterFilterExpiredHangoutsLength**: `filterExpiredHangouts` removed some posts. Check `removedByExpiryIds`.
- **itemsFromRpc ≠ afterPersonalization**: Personalization changed count (reorder only; it should not remove).
- **appended < fetchedLen**: Dedupe removed duplicates (expected when loading more pages).

## Task C — Fix only if proven

- **filterExpiredHangouts**: If it removes posts you expect to see, review rules in `feedExpiryFilters.ts`.
- **Privacy/block**: Optimized feed does not use `filterPostsByPrivacy`; RPC handles privacy.
- **count/hasMore**: RPC now returns true total; `hasMore` should stay true until `nextOffset >= count`.
- **Ordering**: RPC uses `ORDER BY created_at DESC, id DESC` for deterministic ordering.

## Definition of Done

- [ ] Page 1: `fetchedLen == requestedLimit` (unless total < limit).
- [ ] `hasMore` stays true until `nextOffset >= count`.
- [ ] UI-rendered IDs match SQL eligible IDs for the first N posts.
- [ ] If items are filtered, logs show which filter removed them and why.
