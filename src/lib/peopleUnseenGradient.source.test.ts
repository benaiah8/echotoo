/**
 * People unseen gradient edge — visual tokens only (no nav/sync).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  PEOPLE_DUO_FRONT_RADIUS,
  PEOPLE_MINE_CARD_RADIUS,
  PEOPLE_MINE_DEPTH_SHADOW,
  PEOPLE_MINE_FRONT_SHADOW,
  PEOPLE_MINE_PHOTO_EDGE,
  PEOPLE_MINE_UNSEEN_EDGE_GRADIENT,
  PEOPLE_MINE_UNSEEN_EDGE_WIDTH_PX,
  PEOPLE_MINE_UNSEEN_FRONT_SHADOW,
  PEOPLE_MINE_UNSEEN_PHOTO_EDGE,
  peopleMineUnseenEdgeRingStyle,
} from "./people/peopleCandidateMediaPresentation";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("People unseen gradient edge", () => {
  it("1–4: Duo/Discover/Plans/Groups New get gradient ring treatment", () => {
    expect(PEOPLE_MINE_UNSEEN_EDGE_GRADIENT).toMatch(/linear-gradient/);
    expect(PEOPLE_MINE_UNSEEN_EDGE_GRADIENT).toContain("#2563EB");
    expect(PEOPLE_MINE_UNSEEN_EDGE_GRADIENT).toContain("#D946EF");
    expect(PEOPLE_MINE_UNSEEN_EDGE_GRADIENT).toContain("#EF4444");
    expect(PEOPLE_MINE_UNSEEN_EDGE_WIDTH_PX).toBe(2);
    expect(PEOPLE_MINE_UNSEEN_PHOTO_EDGE).toBe(PEOPLE_MINE_UNSEEN_EDGE_GRADIENT);

    const ring = peopleMineUnseenEdgeRingStyle();
    expect(ring.padding).toBe(2);
    expect(ring.background).toBe(PEOPLE_MINE_UNSEEN_EDGE_GRADIENT);
    expect(ring.pointerEvents).toBe("none");
    expect(ring.maskComposite).toBe("exclude");

    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).toContain("peopleMineUnseenEdgeRingStyle");
    expect(media).toContain('data-people-mine-unseen-edge="true"');

    expect(read("pages/people/PeopleDuoCandidateSlide.tsx")).toContain(
      "isUnseen"
    );
    expect(
      read("components/people/PeopleCanonicalCandidatePresentation.tsx")
    ).toContain("isUnseen={isUnseen}");
    expect(
      read("components/people/PeopleOpenPlanCandidateSlide.tsx")
    ).toContain("isUnseen");
    expect(read("components/people/PeopleGroupSourceMedia.tsx")).toContain(
      "peopleMineUnseenEdgeRingStyle"
    );
    expect(read("components/people/PeopleGroupSourceMedia.tsx")).toContain(
      "data-people-group-media-unseen-edge"
    );
  });

  it("5: seen cards retain neutral edge", () => {
    expect(PEOPLE_MINE_PHOTO_EDGE).toContain("var(--text)");
    expect(PEOPLE_MINE_PHOTO_EDGE).toContain("1px");
    expect(PEOPLE_MINE_FRONT_SHADOW).toContain(PEOPLE_MINE_PHOTO_EDGE);
    expect(PEOPLE_MINE_FRONT_SHADOW).toContain(PEOPLE_MINE_DEPTH_SHADOW);
    expect(PEOPLE_MINE_UNSEEN_FRONT_SHADOW).toBe(PEOPLE_MINE_DEPTH_SHADOW);
    expect(PEOPLE_MINE_UNSEEN_FRONT_SHADOW).not.toContain("linear-gradient");
  });

  it("6: action buttons unchanged (not keyed off isUnseen)", () => {
    const overlay = read("pages/people/MatchDeckOverlay.tsx");
    expect(overlay).not.toMatch(/isUnseen[\s\S]{0,80}Connect/);
    const groups = read("pages/people/GroupUpDeckBody.tsx");
    expect(groups).not.toMatch(/isUnseen[\s\S]{0,80}Join/);
  });

  it("7: no geometry constants changed", () => {
    expect(PEOPLE_MINE_CARD_RADIUS).toBe(PEOPLE_DUO_FRONT_RADIUS);
    expect(PEOPLE_DUO_FRONT_RADIUS).toBe("1.65rem");
  });

  it("8–10: no navigation / seen-sync / DB changes in this pass", () => {
    const media = read("components/people/PeopleCandidateMedia.tsx");
    expect(media).not.toContain("useEmblaCarousel");
    expect(media).not.toContain("forceHydratePeopleDeckSeen");
    expect(media).not.toContain("mark_people_deck_seen");
    const group = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(group).not.toContain("useEmblaCarousel");
    const mig = read(
      "../supabase/migrations/20260928140000_people_deck_seen.sql"
    );
    expect(mig).toContain("people_deck_seen");
  });
});
