import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildCommentAuthorLabel,
  normalizeLatestCommentPreview,
} from "./latestCommentPreview";

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const MIGRATION =
  "supabase/migrations/20260929120000_list_rpc_latest_comment_preview.sql";

describe("latest comment preview SQL (list RPCs)", () => {
  const sql = read(MIGRATION);

  it("replaces only the three list RPCs; not Post Detail", () => {
    expect(
      (sql.match(/CREATE OR REPLACE FUNCTION public\.get_feed_with_related_data/g) ?? [])
        .length,
    ).toBe(1);
    expect(
      (
        sql.match(
          /CREATE OR REPLACE FUNCTION public\.get_user_posts_created_with_related_data/g,
        ) ?? []
      ).length,
    ).toBe(1);
    expect(
      (
        sql.match(
          /CREATE OR REPLACE FUNCTION public\.get_user_posts_saved_with_related_data/g,
        ) ?? []
      ).length,
    ).toBe(1);
    expect(sql).not.toContain("get_post_detail_with_related_data");
  });

  it("selects latest eligible top-level comment; replies excluded", () => {
    expect(sql).toContain("c.parent_id IS NULL");
    expect(sql).toContain("c.is_deleted = false");
    expect(sql).toContain("btrim(c.content) <> ''");
    expect(sql).toContain("ORDER BY c.created_at DESC, c.id DESC");
    expect(sql).toContain("LIMIT 1");
    expect(sql).toContain("LEFT JOIN LATERAL");
    expect(sql).toContain("latest_comment_preview");
    // Reply-only path is not selected as preview (parent_id must be null).
    expect(sql).not.toMatch(/parent_id IS NOT NULL[\s\S]{0,80}latest_comment/);
  });

  it("truncates preview text to 160 chars and builds author label fallbacks", () => {
    expect(sql).toContain("left(btrim(c.content), 160)");
    expect(sql).toContain("NULLIF(btrim(pr.display_name), '')");
    expect(sql).toContain("NULLIF(btrim(pr.username), '')");
    expect(sql).toContain("'Unknown User'");
    expect(sql).toContain("pr.user_id = c.author_id");
    // Preview object itself must not include avatar.
    expect(sql).toMatch(
      /jsonb_build_object\(\s*'id', c\.id,\s*'author_label',[\s\S]*?'text', left\(btrim\(c\.content\), 160\)\s*\) AS latest_comment_preview/,
    );
    expect(sql).not.toMatch(
      /AS latest_comment_preview[\s\S]{0,40}avatar/i,
    );
  });

  it("preserves Home ranking / slot0 and terminates each function", () => {
    expect(sql).toContain("all_score");
    expect(sql).toContain("urgency_bucket");
    expect(sql).toContain("page_ord");
    expect(sql).toContain("slot0_location_name");
    expect(sql).toContain("slot0_location_url");
    expect(sql).toContain("slot0_key_info");
    expect(sql).toContain("discoverable_group_count");
    const ends = sql.match(/\$function\$;/g) ?? [];
    expect(ends.length).toBe(3);
  });
});

describe("latestCommentPreview helpers", () => {
  it("normalizes preview and clamps text to 160", () => {
    const long = "x".repeat(200);
    expect(
      normalizeLatestCommentPreview({
        id: "c1",
        author_label: "Ada",
        text: long,
      }),
    ).toEqual({
      id: "c1",
      author_label: "Ada",
      text: "x".repeat(160),
    });
    expect(normalizeLatestCommentPreview(null)).toBeNull();
    expect(normalizeLatestCommentPreview({ id: "", author_label: "A", text: "t" })).toBeNull();
  });

  it("author label: display_name → username → Unknown User", () => {
    expect(
      buildCommentAuthorLabel({ display_name: "Ada Lovelace", username: "ada" }),
    ).toBe("Ada Lovelace");
    expect(buildCommentAuthorLabel({ display_name: "  ", username: "ada" })).toBe(
      "ada",
    );
    expect(buildCommentAuthorLabel({ display_name: null, username: null })).toBe(
      "Unknown User",
    );
  });
});

describe("Post comment preview UI + navigation", () => {
  it("renders preview between caption and PostActions with divider only when present", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain("normalizeLatestCommentPreview");
    expect(post).toContain("function PostCardCommentPreview");
    expect(post).toContain("{commentPreviewBlock}");
    expect(post).toContain("{actionsBlock}");
    expect(post).toContain('data-comment-preview');
    expect(post).toContain("border-t border-[var(--border)]");

    const captionIdx = post.indexOf("{displayedCaption ? (");
    const previewIdx = post.indexOf("{commentPreviewBlock}");
    const actionsIdx = post.indexOf("{actionsBlock}");
    expect(captionIdx).toBeGreaterThan(-1);
    expect(previewIdx).toBeGreaterThan(captionIdx);
    expect(actionsIdx).toBeGreaterThan(previewIdx);

    // Divider/wrapper only when preview exists (ternary → null otherwise).
    expect(post).toMatch(
      /commentPreview \? \([\s\S]*?border-t border-\[var\(--border\)\][\s\S]*?\) : null/,
    );
    expect(post).not.toContain("No comments yet");
    expect(post).not.toContain("Latest comment");
  });

  it("clamps to 2 lines and shows … more only on measured overflow", () => {
    const post = read("src/components/Post.tsx");
    const start = post.indexOf("function PostCardCommentPreview");
    const end = post.indexOf("type PostProps");
    const previewFn = post.slice(start, end);
    expect(previewFn).toContain("line-clamp-2");
    expect(previewFn).toContain("min-w-0");
    expect(previewFn).toContain("break-words");
    expect(previewFn).toContain("scrollHeight > el.clientHeight + 1");
    expect(previewFn).toContain("ResizeObserver");
    expect(previewFn).toContain("… more");
    expect(previewFn).toContain("{overflows ? (");
    // more does not expand inline — same scrollToComments open path.
    expect(previewFn).not.toContain("setExpanded");
    expect(previewFn).toContain("pointer-events-none");
  });

  it("preview and more open Detail with scrollToComments", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain(
      "onOpen={() => goToDetails({ scrollToComments: true })}",
    );
    expect(post).toContain("goToDetails({ scrollToComments: true })");
    expect(post).toContain("e.stopPropagation()");
  });

  it("location pin still uses scrollToLocation; normal open sets neither", () => {
    const post = read("src/components/Post.tsx");
    expect(post).toContain(
      "onOpenLocation={() => goToDetails({ scrollToLocation: true })}",
    );
    expect(post).toContain("onOpen={() => goToDetails()}");
    expect(post).toContain(
      "onOpenDetail={(mediaKeyOrOpts) => goToDetails(mediaKeyOrOpts)}",
    );
    // Options type includes both flags independently.
    expect(post).toContain("scrollToComments?: boolean");
    expect(post).toContain("scrollToLocation?: boolean");
  });

  it("mappers pass latest_comment_preview without getCommentsForPost", () => {
    const feed = read("src/api/queries/getPublicFeed.ts");
    const created = read("src/api/queries/getUserPostsCreated.ts");
    const saved = read("src/api/services/savedPosts.ts");
    const converters = read("src/lib/profilePostsConverters.ts");
    for (const src of [feed, created, saved, converters]) {
      expect(src).toContain("normalizeLatestCommentPreview");
      expect(src).toContain("latest_comment_preview");
      expect(src).not.toContain("getCommentsForPost");
    }
  });
});
