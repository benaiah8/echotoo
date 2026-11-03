import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  postTypeCreatedPhrase,
  postTypeNotificationPhrase,
} from "../postTypeLabels";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("notification wording (event / post)", () => {
  it("postTypeCreatedPhrase maps hangout/experience", () => {
    expect(postTypeCreatedPhrase("hangout")).toBe("created an event");
    expect(postTypeCreatedPhrase("experience")).toBe("created a post");
    expect(postTypeNotificationPhrase("hangout")).toBe("an event");
    expect(postTypeNotificationPhrase("experience")).toBe("a post");
  });

  it("inbox post rows use postTypeCreatedPhrase", () => {
    const src = read("src/components/notifications/NotificationItem.tsx");
    expect(src).toContain("postTypeCreatedPhrase");
    expect(src).toContain(
      "`${actorName} ${postTypeCreatedPhrase(notification.entity_type)}`"
    );
    expect(src).not.toContain("posted a new ${notification.entity_type}");
  });

  it("followed-post push uses type-aware created wording", () => {
    const src = read("supabase/functions/send-post-push/index.ts");
    expect(src).toContain('entityType === "hangout" ? "created an event"');
    expect(src).toContain('"created a post"');
    expect(src).toContain("const title = `${displayName} ${createdPhrase}`");
    expect(src).not.toContain("shared something new");
  });

  it("invite push experience copy is Invited you to a post", () => {
    const src = read("supabase/functions/send-invite-push/index.ts");
    expect(src).toContain('return "Invited you to a post"');
    expect(src).not.toContain("Invited you to a place");
  });
});
