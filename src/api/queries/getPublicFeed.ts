import { supabase } from "../../lib/supabaseClient";
import { sortFeedItems, type FeedItemWithDates } from "../../lib/feedSorting";
import {
  dataCache,
  cacheFeedResult,
  getCachedFeedResult,
} from "../../lib/dataCache";

export type FeedItem = {
  id: string;
  type: "experience" | "hangout";
  caption: string | null;
  is_anonymous: boolean | null;
  anonymous_name: string | null; // NEW: anonymous name
  anonymous_avatar: string | null; // NEW: anonymous avatar
  created_at: string;
  selected_dates?: string[] | null;
  tags?: string[] | null;

  author_id: string;
  author: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
};

export type FeedOptions = {
  type?: "experience" | "hangout";
  q?: string;
  tags?: string[];
  limit?: number;
  offset?: number;
};

export async function getPublicFeed(
  opts: FeedOptions = {}
): Promise<FeedItem[]> {
  // console.log("[getPublicFeed] Starting query with opts:", opts);

  const { type, q, tags, limit = 12, offset = 0 } = opts;

  // Check cache first (only for non-offset queries to avoid pagination issues)
  if (offset === 0) {
    const cacheKey = dataCache.generateFeedKey(opts);
    const cachedData = getCachedFeedResult<FeedItem>(cacheKey);
    if (cachedData) {
      // console.log("[getPublicFeed] Returning cached data for key:", cacheKey);
      return cachedData;
    }
  }

  let query = supabase
    .from("posts")
    .select(
      `
      id,
       type,
       caption,
       is_anonymous,
       anonymous_name,
       anonymous_avatar,
       created_at,
       selected_dates,
       tags,
       author_id,
         author:profiles!author_id(
        id, username, display_name, avatar_url
  )
`
    )

    // newest first (we'll sort smartly after fetching)
    .order("created_at", { ascending: false })
    // pagination
    .range(offset, offset + limit - 1);

  if (type) {
    // console.log("[getPublicFeed] Adding type filter:", type);
    query = query.eq("type", type);
  }
  if (q && q.trim()) {
    // console.log("[getPublicFeed] Adding search filter:", q);
    query = query.ilike("caption", `%${q.trim()}%`);
  }

  // Filter by tags if provided
  if (tags && tags.length > 0) {
    // console.log("[getPublicFeed] Adding tags filter:", tags);
    // Filter posts that have at least one of the selected tags
    query = query.overlaps("tags", tags);
  }

  // console.log("[getPublicFeed] About to execute query...");

  // First, let's try a simple test query to see if the table is accessible at all
  try {
    const { data: testData, error: testError } = await supabase
      .from("posts")
      .select("id")
      .limit(1);
    // console.log("[getPublicFeed] Test query result:", {
    //   testData,
    //   testError,
    //   testLength: testData?.length,
    // });
  } catch (testErr) {
    console.error("[getPublicFeed] Test query failed:", testErr);
  }

  const { data, error } = await query;

  // console.log("[getPublicFeed] Query result:", {
  //   data,
  //   error,
  //   dataLength: data?.length,
  // });

  if (error) {
    console.error("[getPublicFeed] Query error:", error);
    throw error;
  }

  const rawData = (data ?? []) as unknown as FeedItemWithDates[];
  // console.log("[getPublicFeed] Raw data:", rawData, "length:", rawData.length);

  // Apply smart sorting for better user experience
  const sortedData = sortFeedItems(rawData);
  // console.log(
  //   "[getPublicFeed] Sorted data:",
  //   sortedData,
  //   "length:",
  //   sortedData.length
  // );

  // Temporary: if sorting removes items, return raw data instead
  if (rawData.length > 0 && sortedData.length === 0) {
    console.warn(
      "[getPublicFeed] Sorting removed all items, returning raw data"
    );
    return rawData as FeedItem[];
  }

  // Debug: Log the final return data
  // console.log(
  //   "[getPublicFeed] Final return data:",
  //   sortedData,
  //   "length:",
  //   sortedData.length
  // );

  const finalData = sortedData as FeedItem[];

  // Cache the result for first page queries only
  if (offset === 0) {
    const cacheKey = dataCache.generateFeedKey(opts);
    cacheFeedResult(cacheKey, finalData, 2 * 60 * 1000); // Cache for 2 minutes

    // Trigger prefetch for next page in background
    dataCache.prefetchFeedData(opts);
  }

  return finalData;
}

/**
 * Get all unique tags from published posts
 */
export async function getAvailableTags(): Promise<string[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("tags")
    .or("is_anonymous.is.null,is_anonymous.eq.false")
    .not("tags", "is", null);

  if (error) throw error;

  // Flatten all tags and get unique ones
  const allTags = (data ?? [])
    .flatMap((post) => post.tags || [])
    .filter(
      (tag): tag is string => typeof tag === "string" && tag.trim() !== ""
    )
    .filter((tag, index, arr) => arr.indexOf(tag) === index) // Remove duplicates
    .sort(); // Sort alphabetically

  return allTags;
}
