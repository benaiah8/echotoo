/**
 * Groups canonical card presentation — source tests (no Duo/Plans mutations).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  groupAtmospherePathFromMedia,
  publishedMediaVisualUrl,
} from "./people/groupSourceMedia";
import type { PublishedMediaItem } from "./publishedMedia";

const root = join(__dirname, "..");

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("PeopleGroupSourceMedia helpers", () => {
  it("5–7: image url / video poster / no player", () => {
    const image: PublishedMediaItem = {
      kind: "image",
      key: "image:a",
      url: "https://cdn.example/a.jpg",
    };
    const video: PublishedMediaItem = {
      kind: "video",
      key: "video:v1",
      mediaId: "v1",
      videoId: "bunny",
      status: "ready",
      posterUrl: "https://cdn.example/poster.jpg",
      width: 1280,
      height: 720,
      durationSec: 10,
    };
    expect(publishedMediaVisualUrl(image)).toContain("a.jpg");
    expect(publishedMediaVisualUrl(video)).toContain("poster.jpg");
    expect(groupAtmospherePathFromMedia([video, image])).toContain("poster.jpg");
    expect(groupAtmospherePathFromMedia([])).toBeNull();
  });

  it("17–18: atmosphere uses first media only", () => {
    const items: PublishedMediaItem[] = [
      {
        kind: "image",
        key: "image:first",
        url: "https://cdn.example/first.jpg",
      },
      {
        kind: "image",
        key: "image:second",
        url: "https://cdn.example/second.jpg",
      },
    ];
    expect(groupAtmospherePathFromMedia(items)).toContain("first.jpg");
  });
});

describe("Groups canonical presentation (source)", () => {
  it("1–4: GroupUp deck uses duo/mine fixed footprint", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain('layout="duo"');
    expect(body).toContain('duoPresentation="mine"');
    expect(body).toContain("duoInFlowChrome");
    expect(body).toContain("MineEdgeNavCards");
    expect(body).toContain("fixedRailsGeometry");
    expect(body).toContain("PeopleGroupUpCandidateSlide");
    expect(body).not.toContain("GroupUpDeckCard");
    expect(body).not.toContain("MatchDeckPlanContext");
  });

  it("15–16: uses publishedMediaByPostId; Groups-owned published surface", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("publishedMediaByPostId");
    expect(body).not.toContain("getOrFetchPublishedMedia(");
    const card = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(card).toContain("PeopleGroupPublishedMediaSurface");
    const surface = read(
      "components/people/PeopleGroupPublishedMediaSurface.tsx",
    );
    expect(surface).toContain('data-people-group-video-playback="poster-only"');
    expect(surface).not.toContain("PeopleGroupPublishedVideo");
    expect(surface).toContain("data-people-group-no-media");
    expect(surface).toContain('fit={GROUP_PUBLISHED_IMAGE_FIT}');
  });

  it("8–9: group title inside media; no member_count", () => {
    const media = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(media).toContain("data-people-group-title-band");
    expect(media).not.toContain("member_count");
    const slide = read("components/people/PeopleGroupUpCandidateSlide.tsx");
    expect(slide).not.toContain("member_count");
  });

  it("10–11: host notch present", () => {
    const notch = read("components/people/PeopleGroupHostNotch.tsx");
    expect(notch).toContain("data-people-group-host-notch");
    expect(notch).toContain("groupUpBrowseHostedBy");
    expect(notch).toContain("rounded-full");
    const media = read("components/people/PeopleGroupSourceMedia.tsx");
    expect(media).toContain("inset-x-3 top-3");
    expect(media).toContain("flex justify-center");
  });

  it("12–14: description via PeopleExpandableNote floating", () => {
    const note = read("components/people/PeopleGroupNote.tsx");
    expect(note).toContain("PeopleExpandableNote");
    expect(note).toContain('expansionMode="floating"');
    expect(note).toContain("groupUpNoteSectionLabel");
  });

  it("26: New/Yours filter unchanged", () => {
    const body = read("pages/people/GroupUpDeckBody.tsx");
    expect(body).toContain("groupUpRowMatchesBrowseTab");
    expect(body).toContain("browseTab");
  });

  it("23–25: Duo/Discover/Plans adapters untouched by Groups card", () => {
    const duo = read("pages/people/PeopleDuoCandidateSlide.tsx");
    expect(duo).toContain("PeopleCanonicalCandidatePresentation");
    const plans = read("components/people/PeopleOpenPlanCandidateSlide.tsx");
    expect(plans).toContain("PeopleCanonicalCandidatePresentation");
    const canonical = read(
      "components/people/PeopleCanonicalCandidatePresentation.tsx",
    );
    expect(canonical).not.toContain("PeopleGroupUp");
  });
});
