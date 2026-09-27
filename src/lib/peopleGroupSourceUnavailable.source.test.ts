/**
 * Source-unavailable Group cards in Yours — hide source chrome, keep footprint.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(process.cwd(), "src");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("Groups source-unavailable Yours card", () => {
  it("slide suppresses See post / caption / schedule when source_unavailable", () => {
    const slide = read("components/people/PeopleGroupUpCandidateSlide.tsx");
    expect(slide).toContain("source_unavailable");
    expect(slide).toContain("sourceGone ? null");
    expect(slide).toContain("sourceGone ? undefined : onSeePost");
    expect(slide).toContain("groupUpDeckRowId");
  });

  it("deck body skips published media fetch for unavailable source", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("source_unavailable");
    expect(body).toContain("!row.source_unavailable");
    expect(body).toContain("EMPTY_GROUP_MEDIA");
    expect(body).toContain("handleOpenGroup");
    expect(body).toContain("messagesConversationPath(current.conversation_id)");
  });

  it("canOpenGroupSourcePost blocks source_unavailable", () => {
    const open = read("lib/people/groupSourcePostOpen.ts");
    expect(open).toContain("source_unavailable");
    expect(open).toContain("if (row.source_unavailable === true) return false");
  });

  it("presentation still reserves fixed source chrome height", () => {
    const presentation = read(
      "components/people/PeopleGroupUpCandidatePresentation.tsx"
    );
    expect(presentation).toContain("PEOPLE_MINE_SOURCE_CHROME_H_PX");
    expect(presentation).toContain("data-people-duo-source-reserve");
  });
});
