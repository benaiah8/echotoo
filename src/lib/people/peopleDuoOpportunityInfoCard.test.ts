/**
 * Duo-modern opportunity info card — note strip, compact See Post, caption order.
 */
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import PeopleDuoOpportunityInfoCard from "../../components/people/PeopleDuoOpportunityInfoCard";
import { shouldDuoCaptionClickOpenPost } from "./peopleDuoCaptionClick";
import {
  PEOPLE_DUO_MODERN_ACTION_ROW_GAP_PX,
  PEOPLE_DUO_MODERN_ACTION_ROW_H_PX,
  PEOPLE_DUO_MODERN_SCROLL_TO_ACTION_GAP_PX,
  peopleDuoModernSlideScrollBottomPad,
  peopleShellDockBottomOffset,
} from "../../pages/people/peopleShellLayout";
import {
  PEOPLE_DUO_MODERN_SCENE_BLUR_PX,
  PEOPLE_DUO_MODERN_SCENE_OUTGOING_END_SCALE,
} from "./peopleCandidateMediaPresentation";

const root = join(__dirname, "../..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

const base = {
  postType: "hangout" as const,
  caption: "Sunset walk along the ridge",
  scheduleLabel: "Today",
  scheduleLabelKind: "today" as const,
  note: "Bring a jacket.\nMeet at the overlook.",
};

describe("PeopleDuoOpportunityInfoCard", () => {
  it("renders meta, then note strip, then a three-line clamped caption", () => {
    const html = renderToStaticMarkup(
      createElement(PeopleDuoOpportunityInfoCard, {
        ...base,
        onSeePost: () => {},
      })
    );
    const meta = html.indexOf("data-people-duo-opportunity-meta");
    const strip = html.indexOf("data-people-duo-opportunity-note-strip");
    const note = html.indexOf("data-people-duo-opportunity-note=");
    const caption = html.indexOf("data-people-duo-opportunity-caption=");
    expect(meta).toBeGreaterThan(-1);
    expect(strip).toBeGreaterThan(meta);
    expect(note).toBeGreaterThan(strip);
    expect(caption).toBeGreaterThan(note);
    expect(html).toContain("Bring a jacket.\nMeet at the overlook.");
    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).toContain("line-clamp-3");
    expect(html).toContain("overflow-hidden");
    expect(html).toContain('data-people-duo-opportunity-caption-lines="3"');
    expect(html).not.toContain("line-clamp-4");
    expect(html).not.toContain('data-people-duo-opportunity-caption-lines="full"');
    expect(html).not.toContain(">Note<");
    expect(html).not.toContain("Personal Note");
    expect(html).not.toContain("No note added");
  });

  it("does not keep the full-caption QA override", () => {
    const src = read("components/people/PeopleDuoOpportunityInfoCard.tsx");
    expect(src).not.toContain("PEOPLE_DUO_QA_FULL_CAPTION");
    expect(src).toContain("line-clamp-3");
    expect(src).not.toContain("line-clamp-4");
  });

  it("uses an inverted edge-attached strip and 16px section gaps", () => {
    const src = read("components/people/PeopleDuoOpportunityInfoCard.tsx");
    expect(src).toContain("PiNotePencilBold");
    expect(src).toContain("-mx-2.5");
    expect(src).toContain("rounded-none");
    expect(src).toContain("shadow-none");
    expect(src).toContain("var(--text)_94%");
    expect(src).toContain("text-[var(--bg)]");
    expect(src).toContain('const SECTION_GAP_CLASS = "mt-4"');
    expect(src).not.toContain("mt-2.5");
    expect(src).not.toContain("text-black");
    expect(src).not.toContain("app-dark:text-white");
    expect(src).not.toContain("duoNoteSectionLabel");
    expect(src).not.toContain("data-people-duo-opportunity-note-divider");
    const html = renderToStaticMarkup(
      createElement(PeopleDuoOpportunityInfoCard, base)
    );
    expect(html).toContain("data-people-duo-opportunity-note-icon");
    expect(html).toContain("text-[var(--bg)]");
    expect(html).toContain("-mx-2.5");
    expect(html).toContain("mt-4");
    expect(html).not.toContain("shadow-[");
    const noNote = renderToStaticMarkup(
      createElement(PeopleDuoOpportunityInfoCard, { ...base, note: null })
    );
    expect(noNote.match(/mt-4/g)?.length).toBe(1);
    expect(noNote).not.toContain("data-people-duo-opportunity-note-strip");
  });

  it("omits the note strip when the note is empty", () => {
    for (const note of [null, "", "   "]) {
      const html = renderToStaticMarkup(
        createElement(PeopleDuoOpportunityInfoCard, {
          ...base,
          note,
        })
      );
      expect(html).not.toContain("data-people-duo-opportunity-note-strip");
      expect(html).not.toContain("data-people-duo-opportunity-note-icon");
      expect(html).not.toContain("data-people-duo-opportunity-note=");
      expect(html).toContain("data-people-duo-opportunity-caption=");
      expect(html).not.toContain("No note added");
    }
  });

  it("omits date and See Post when unavailable; keeps compact See Post at badge height", () => {
    const withSee = renderToStaticMarkup(
      createElement(PeopleDuoOpportunityInfoCard, {
        ...base,
        onSeePost: () => {},
      })
    );
    expect(withSee).toContain("data-people-duo-see-post");
    expect(withSee).toContain("h-5");
    expect(withSee).toContain("text-[10px]");
    expect(withSee).toContain("leading-none");
    expect(withSee).toContain("px-1.5");
    expect(withSee).toContain("rounded-md");
    expect(withSee).toContain("h-3 w-3");
    expect(withSee).toContain("See post");
    expect(withSee).not.toContain("h-7");

    const noSee = renderToStaticMarkup(
      createElement(PeopleDuoOpportunityInfoCard, {
        ...base,
        scheduleLabel: null,
        onSeePost: undefined,
      })
    );
    expect(noSee).not.toContain("data-people-duo-see-post");
    expect(noSee).not.toContain("Today");

    const see = vi.fn();
    renderToStaticMarkup(
      createElement(PeopleDuoOpportunityInfoCard, {
        ...base,
        onSeePost: see,
      })
    );
    expect(see).not.toHaveBeenCalled();
  });

  it("opens See Post from plain caption clicks but not inline link chips", () => {
    const src = read("components/people/PeopleDuoOpportunityInfoCard.tsx");
    expect(src).toContain("shouldDuoCaptionClickOpenPost");
    expect(src).toContain("cursor-pointer");
    expect(src).toContain("stopLinkPropagation");
    expect(src).toContain("data-people-duo-opportunity-caption-action");
    expect(src).not.toContain('role="button"');
    const captionBlock = src.slice(
      src.indexOf("data-people-duo-opportunity-caption")
    );
    expect(captionBlock.slice(0, 900)).toContain("<PostCaptionText");
    expect(captionBlock.slice(0, 900)).not.toContain("<button");

    expect(
      shouldDuoCaptionClickOpenPost({ closest: () => null } as unknown as EventTarget)
    ).toBe(true);
    expect(
      shouldDuoCaptionClickOpenPost({
        closest: (sel: string) => (sel.includes("a") ? {} : null),
      } as unknown as EventTarget)
    ).toBe(false);
    expect(
      shouldDuoCaptionClickOpenPost({
        closest: (sel: string) => (sel.includes("button") ? {} : null),
      } as unknown as EventTarget)
    ).toBe(false);

    const see = vi.fn();
    const withSee = renderToStaticMarkup(
      createElement(PeopleDuoOpportunityInfoCard, {
        ...base,
        onSeePost: see,
      })
    );
    expect(withSee).toContain('data-people-duo-opportunity-caption-action="see-post"');
    expect(withSee).toContain("cursor-pointer");
    expect(see).not.toHaveBeenCalled();

    const idle = renderToStaticMarkup(
      createElement(PeopleDuoOpportunityInfoCard, base)
    );
    expect(idle).not.toContain("data-people-duo-opportunity-caption-action");
    expect(idle).not.toContain("cursor-pointer");
  });

  it("leaves shared See Post, Discover, scroll, and swipe tokens unchanged", () => {
    const shared = read("components/people/PeopleSeePostControl.tsx");
    const discover = read("components/people/PeopleDiscoverOpportunityBox.tsx");
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    const canonical = read(
      "components/people/PeopleCanonicalCandidatePresentation.tsx"
    );
    expect(shared).toContain("h-7");
    expect(shared).not.toContain("data-people-duo-see-post");
    expect(discover).toContain("data-people-discover-see-post");
    expect(discover).not.toContain("data-people-duo-see-post");
    expect(discover).not.toContain("PiNotePencilBold");
    expect(overlay).toContain("candidate.description?.trim()");
    expect(overlay).toContain("sourceForCandidate(candidate).caption");
    expect(canonical).toContain("peopleDuoModernSlideScrollBottomPad");
    expect(canonical).toContain("shouldResetPeopleDuoSlideScroll");
    expect(canonical).toContain("scroller.scrollTop = 0");
    expect(peopleDuoModernSlideScrollBottomPad()).toBe(
      `calc(${PEOPLE_DUO_MODERN_ACTION_ROW_H_PX}px + ${PEOPLE_DUO_MODERN_SCROLL_TO_ACTION_GAP_PX}px + 64px + 6px + max(${peopleShellDockBottomOffset()}, var(--safe-area-bottom-layout, 0px)))`
    );
    expect(peopleDuoModernSlideScrollBottomPad()).not.toContain(
      `${PEOPLE_DUO_MODERN_ACTION_ROW_GAP_PX}px`
    );
    expect(PEOPLE_DUO_MODERN_SCENE_BLUR_PX).toBe(9.6);
    expect(PEOPLE_DUO_MODERN_SCENE_OUTGOING_END_SCALE).toBe(0.52);
  });
});
