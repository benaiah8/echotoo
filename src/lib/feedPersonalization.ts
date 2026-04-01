// src/lib/feedPersonalization.ts
// Client-side preference store and scoring for feed personalization
// [PHASE 3] Preference store + scoring (localStorage, updated by actions)
// [PHASE 4] Feed personalization algorithm (70/30 for-you/discovery mix)

import { FeedItem } from "../api/queries/getPublicFeed";
import { FeedItemWithDates } from "./feedSorting";
import { isUnscheduledHangout } from "./feedExpiryFilters";

// [DEBUG] Toggle to enable/disable debug logs
const DEBUG_PERSONALIZATION = false;

// localStorage keys
const PREF_TAGS_KEY = "feed_pref_tags_v1";
const PREF_AUTHORS_KEY = "feed_pref_authors_v1";

// Preference data structures
export interface FeedPreferences {
  tags: Record<string, number>; // tag -> score
  authors: Record<string, number>; // authorId -> score
}

// Action types that trigger preference updates
export type ActionType = "like" | "save" | "follow" | "rsvp_going" | "create";

// Action weights (how much each action contributes to preferences)
const ACTION_WEIGHTS: Record<ActionType, number> = {
  like: 2,
  save: 2,
  follow: 2,
  rsvp_going: 3,
  create: 4,
};

// Max score cap to prevent runaway preferences
const MAX_SCORE = 50;

/**
 * Clamp a score to prevent runaway values
 * @param score - Score to clamp
 * @param max - Maximum allowed score (default: 50)
 * @returns Clamped score
 */
export function clampScore(score: number, max: number = MAX_SCORE): number {
  return Math.max(-max, Math.min(max, score));
}

/**
 * Load preferences from localStorage
 * @returns Current preferences (tags and authors)
 */
export function loadPrefs(): FeedPreferences {
  try {
    const tagsStr = localStorage.getItem(PREF_TAGS_KEY);
    const authorsStr = localStorage.getItem(PREF_AUTHORS_KEY);

    const tags = tagsStr ? JSON.parse(tagsStr) : {};
    const authors = authorsStr ? JSON.parse(authorsStr) : {};

    return { tags, authors };
  } catch (error) {
    console.error("[FeedPersonalization] Error loading preferences:", error);
    return { tags: {}, authors: {} };
  }
}

/**
 * Save preferences to localStorage
 * @param prefs - Preferences to save
 */
export function savePrefs(prefs: FeedPreferences): void {
  try {
    localStorage.setItem(PREF_TAGS_KEY, JSON.stringify(prefs.tags));
    localStorage.setItem(PREF_AUTHORS_KEY, JSON.stringify(prefs.authors));
  } catch (error) {
    console.error("[FeedPersonalization] Error saving preferences:", error);
    // If localStorage is full, try to clean up old entries
    // (This is a simple fallback - in production you might want more sophisticated cleanup)
  }
}

/**
 * Record a user action signal to update preferences
 * Updates tag scores and author scores based on the action
 *
 * @param postOrAuthor - Post object (or minimal post data with tags, author_id, type, is_recurring)
 *                       OR just author_id string for follow actions
 * @param actionType - Type of action (like, save, follow, rsvp_going, create)
 */
export function recordSignal(
  postOrAuthor:
    | {
        tags?: string[] | null;
        author_id: string;
        type?: "experience" | "hangout";
        is_recurring?: boolean | null;
      }
    | string, // For follow actions, can pass just author_id
  actionType: ActionType
): void {
  try {
    const prefs = loadPrefs();
    const weight = ACTION_WEIGHTS[actionType];

    // Handle follow action (author_id only, no post)
    if (actionType === "follow" && typeof postOrAuthor === "string") {
      const authorId = postOrAuthor;
      if (authorId) {
        const currentScore = prefs.authors[authorId] || 0;
        prefs.authors[authorId] = clampScore(currentScore + weight);
      }
      savePrefs(prefs);
      return;
    }

    // Handle other actions (require post object)
    if (typeof postOrAuthor === "string") {
      console.warn(
        "[FeedPersonalization] recordSignal: Expected post object for action type:",
        actionType
      );
      return;
    }

    const post = postOrAuthor;

    // Update tag scores (not for follow actions)
    if (
      actionType !== "follow" &&
      post.tags &&
      Array.isArray(post.tags) &&
      post.tags.length > 0
    ) {
      post.tags.forEach((tag) => {
        if (tag && typeof tag === "string") {
          const normalizedTag = tag.toLowerCase().trim();
          if (normalizedTag) {
            const currentScore = prefs.tags[normalizedTag] || 0;
            prefs.tags[normalizedTag] = clampScore(currentScore + weight);
          }
        }
      });
    }

    // Update author score
    if (post.author_id) {
      const currentScore = prefs.authors[post.author_id] || 0;
      prefs.authors[post.author_id] = clampScore(currentScore + weight);
    }

    savePrefs(prefs);
  } catch (error) {
    console.error("[FeedPersonalization] Error recording signal:", error);
    // Fail silently - don't break user actions if preference storage fails
  }
}

/**
 * Calculate personalization score for a post
 * Higher score = more relevant to user preferences
 *
 * @param post - Post to score
 * @param prefs - User preferences (if not provided, loads from localStorage)
 * @returns Numeric score (higher = more relevant)
 */
export function scorePost(post: FeedItem, prefs?: FeedPreferences): number {
  try {
    const preferences = prefs || loadPrefs();

    // Tag score: sum of preference scores for all post tags
    let tagScore = 0;
    if (post.tags && Array.isArray(post.tags) && post.tags.length > 0) {
      post.tags.forEach((tag) => {
        if (tag && typeof tag === "string") {
          const normalizedTag = tag.toLowerCase().trim();
          if (normalizedTag && preferences.tags[normalizedTag]) {
            tagScore += preferences.tags[normalizedTag];
          }
        }
      });
    }

    // Author score: preference score for post author
    const authorScore = preferences.authors[post.author_id] || 0;

    // Follow boost: bonus for posts from followed users
    let followBoost = 0;
    if (post.follow_status === "friends") {
      followBoost = 4; // Mutual follow = highest boost
    } else if (post.follow_status === "following") {
      followBoost = 2; // One-way follow = moderate boost
    }

    // Unscheduled penalty: downrank unscheduled hangouts (appear later, never excluded)
    let unscheduledPenalty = 0;
    if (post.type === "hangout" && isUnscheduledHangout(post)) {
      unscheduledPenalty = -5;
    }

    // Total score
    return tagScore + authorScore + followBoost + unscheduledPenalty;
  } catch (error) {
    console.error("[FeedPersonalization] Error scoring post:", error);
    return 0; // Return neutral score on error
  }
}

/**
 * Check if a hangout is time-critical (today or this week)
 * Time-critical items are pinned and not reordered by personalization
 *
 * @param item - Feed item to check
 * @returns true if item is time-critical, false otherwise
 */
function isTimeCritical(item: FeedItemWithDates): boolean {
  if (item.type !== "hangout") return false;
  if (!item.selected_dates || item.selected_dates.length === 0) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekFromNow = new Date(today);
  weekFromNow.setDate(weekFromNow.getDate() + 7);

  // Check if any date is today or within the next 7 days
  return item.selected_dates.some((dateStr) => {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return false;
    const dateOnly = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
    return dateOnly >= today && dateOnly < weekFromNow;
  });
}

/**
 * Simple seeded deterministic shuffle (for discovery bucket)
 * Uses a simple linear congruential generator for pseudo-randomness
 *
 * @param array - Array to shuffle
 * @param seed - Seed for deterministic randomness
 * @returns Shuffled array (new array, doesn't mutate original)
 */
function seededShuffle<T>(array: T[], seed: number): T[] {
  const shuffled = [...array];
  let currentSeed = seed;

  // Simple LCG: (a * seed + c) % m
  const a = 1664525;
  const c = 1013904223;
  const m = Math.pow(2, 32);

  for (let i = shuffled.length - 1; i > 0; i--) {
    currentSeed = (a * currentSeed + c) % m;
    const j = Math.floor((currentSeed / m) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}

/**
 * Personalize a batch of feed items
 * Implements 70/30 for-you/discovery mix with time-critical pinning
 *
 * @param items - Feed items (already time-sorted and filtered)
 * @param seed - Seed for deterministic shuffle (default: hash of current time + items length)
 * @returns Personalized feed items
 */
export function personalizeFeedBatch(
  items: FeedItemWithDates[],
  seed?: number
): FeedItemWithDates[] {
  if (items.length === 0) return items;

  // Generate seed if not provided (deterministic based on items)
  const finalSeed =
    seed ??
    items.reduce((acc, item, idx) => {
      return acc + (item.id.charCodeAt(0) || 0) * (idx + 1);
    }, Date.now() % 10000);

  const prefs = loadPrefs();

  // [TESTING] Log personalization stats (keep for future testing)
  const hasPrefs =
    Object.keys(prefs.tags).length > 0 || Object.keys(prefs.authors).length > 0;
  if (DEBUG_PERSONALIZATION && hasPrefs) {
    console.log("[Personalization] Applying personalization:", {
      inputLength: items.length,
      hasPreferences: hasPrefs,
      tagCount: Object.keys(prefs.tags).length,
      authorCount: Object.keys(prefs.authors).length,
    });
  }

  // Step 1: Score all items and add original index for stable sorting
  interface ScoredItem {
    item: FeedItemWithDates;
    score: number;
    originalIndex: number;
    isTimeCritical: boolean;
    isUnscheduled: boolean;
  }

  const scoredItems: ScoredItem[] = items.map((item, idx) => ({
    item,
    score: scorePost(item, prefs),
    originalIndex: idx,
    isTimeCritical: isTimeCritical(item),
    isUnscheduled: isUnscheduledHangout(item),
  }));

  // Step 2: Separate time-critical items (pin them, don't reorder)
  const timeCriticalItems = scoredItems
    .filter((s) => s.isTimeCritical)
    .sort((a, b) => a.originalIndex - b.originalIndex); // Keep original order

  // Step 3: Get non-time-critical items
  const nonTimeCritical = scoredItems.filter((s) => !s.isTimeCritical);

  if (nonTimeCritical.length === 0) {
    // Only time-critical items - return as-is
    return timeCriticalItems.map((s) => s.item);
  }

  // Step 4: Calculate percentile threshold for 70/30 split
  const scores = nonTimeCritical.map((s) => s.score).sort((a, b) => a - b);
  const percentile70Index = Math.floor(scores.length * 0.7);
  const threshold = scores[percentile70Index] ?? 0;

  // Step 5: Split into for-you (high score) and discovery (low score) buckets
  const forYouBucket: ScoredItem[] = [];
  const discoveryBucket: ScoredItem[] = [];

  nonTimeCritical.forEach((scored) => {
    if (scored.score >= threshold) {
      forYouBucket.push(scored);
    } else {
      discoveryBucket.push(scored);
    }
  });

  // Step 6: Sort for-you bucket by score (descending), then by originalIndex for stability
  forYouBucket.sort((a, b) => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > 0.1) return scoreDiff; // Significant difference
    return a.originalIndex - b.originalIndex; // Tie-break with original index
  });

  // Step 7: Deterministically shuffle discovery bucket
  const shuffledDiscovery = seededShuffle(discoveryBucket, finalSeed);

  // Step 8: Interleave buckets with 70/30 mix (length-preserving, no caps)
  const result: FeedItemWithDates[] = [];
  let forYouIdx = 0;
  let discoveryIdx = 0;

  // Target: 70% for-you, 30% discovery
  const targetForYou = Math.floor(items.length * 0.7);
  const targetDiscovery = items.length - targetForYou;

  while (result.length < items.length) {
    let progressMade = false;

    // Add for-you items (up to target)
    if (
      forYouIdx < forYouBucket.length &&
      result.length < targetForYou + timeCriticalItems.length
    ) {
      result.push(forYouBucket[forYouIdx].item);
      forYouIdx++;
      progressMade = true;
    }

    // Add discovery items (up to target)
    if (
      discoveryIdx < shuffledDiscovery.length &&
      result.length < items.length &&
      (result.length < targetForYou + timeCriticalItems.length ||
        result.length - (targetForYou + timeCriticalItems.length) <
          targetDiscovery)
    ) {
      result.push(shuffledDiscovery[discoveryIdx].item);
      discoveryIdx++;
      progressMade = true;
    }

    // Progress guard: if no progress, advance indices or break
    if (!progressMade) {
      if (forYouIdx < forYouBucket.length) {
        forYouIdx++;
        continue;
      }
      if (discoveryIdx < shuffledDiscovery.length) {
        discoveryIdx++;
        continue;
      }
      break;
    }
  }

  // Step 9: Prepend time-critical items (they stay at the top)
  const finalResult = [...timeCriticalItems.map((s) => s.item), ...result];

  // [LENGTH-PRESERVING] Assert in dev: output must match input set and length
  const DEBUG_ASSERT_LENGTH = false;
  if (DEBUG_ASSERT_LENGTH && process.env.NODE_ENV !== "production") {
    const inputIds = new Set(items.map((i) => i.id));
    const outputIds = new Set(finalResult.map((i) => i.id));
    const missingIds = items
      .filter((i) => !outputIds.has(i.id))
      .map((i) => i.id);
    const extraIds = finalResult
      .filter((i) => !inputIds.has(i.id))
      .map((i) => i.id);
    if (
      inputIds.size !== outputIds.size ||
      finalResult.length !== items.length ||
      missingIds.length > 0 ||
      extraIds.length > 0
    ) {
      console.error("[Personalization] LENGTH MISMATCH:", {
        inputLength: items.length,
        outputLength: finalResult.length,
        inputIdsSize: inputIds.size,
        outputIdsSize: outputIds.size,
        missingIds: missingIds.slice(0, 20),
        extraIds: extraIds.slice(0, 20),
      });
    }
  }

  // [TESTING] Log final stats (keep for future testing)
  if (DEBUG_PERSONALIZATION && hasPrefs && finalResult.length > 0) {
    const avgScore =
      scoredItems.reduce((sum, s) => sum + s.score, 0) / scoredItems.length;
    const maxScore = Math.max(...scoredItems.map((s) => s.score));
    const minScore = Math.min(...scoredItems.map((s) => s.score));
    console.log("[Personalization] Result:", {
      outputLength: finalResult.length,
      timeCritical: timeCriticalItems.length,
      forYou: forYouBucket.length,
      discovery: discoveryBucket.length,
      avgScore: avgScore.toFixed(2),
      scoreRange: `${minScore.toFixed(1)}-${maxScore.toFixed(1)}`,
    });
  }

  return finalResult;
}

/**
 * Clear all preferences (useful for testing or reset)
 */
export function clearPrefs(): void {
  try {
    localStorage.removeItem(PREF_TAGS_KEY);
    localStorage.removeItem(PREF_AUTHORS_KEY);
  } catch (error) {
    console.error("[FeedPersonalization] Error clearing preferences:", error);
  }
}
