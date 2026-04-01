import type { FeedItem } from "../api/queries/getPublicFeed";

export type StoryCreatorFields = {
  creatorName: string | null;
  creatorHandle: string | null;
  creatorAvatarUrl: string | null;
};

type FallbackAuthor = {
  id?: string;
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
};

function fromAuthorShape(a: {
  username?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
}): StoryCreatorFields {
  const u = a.username?.trim() || null;
  const dn = a.display_name?.trim() || null;
  return {
    creatorName: dn ?? u,
    creatorHandle: u ? `@${u}` : null,
    creatorAvatarUrl: a.avatar_url ?? null,
  };
}

/**
 * Use `post.author` only when its `id` matches `post.author_id`.
 * Otherwise prefer the parent's `postAuthor` (same `author` props as the card) so a bad RPC join
 * cannot show the wrong face/handle on the story.
 */
export function storyCreatorFromPost(
  post: FeedItem | undefined,
  fallback: FallbackAuthor | undefined
): StoryCreatorFields {
  if (post) {
    if (post.is_anonymous) {
      const name = post.anonymous_name?.trim() || null;
      return {
        creatorName: name,
        creatorHandle: null,
        creatorAvatarUrl: post.anonymous_avatar ?? null,
      };
    }
    const a = post.author;
    const fid = post.author_id;
    const authorRowMatches = Boolean(a && fid && a.id === fid);

    if (authorRowMatches && a) {
      return fromAuthorShape(a);
    }
    if (fallback) {
      return fromAuthorShape(fallback);
    }
    if (a) {
      return fromAuthorShape(a);
    }
  }
  if (fallback) {
    return fromAuthorShape(fallback);
  }
  return { creatorName: null, creatorHandle: null, creatorAvatarUrl: null };
}
