import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  postTypeCompactLabel,
  postTypeNotificationPhrase,
} from "../postTypeLabels";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("Events + Posts public taxonomy (display copy)", () => {
  it("Welcome presents Events + Posts, not Experiences as a category", () => {
    const src = read("src/components/ui/WelcomeModal.tsx");
    expect(src).toContain(">Events<");
    expect(src).toContain(">Posts<");
    expect(src).not.toContain("Experiences");
    expect(src).not.toMatch(/events,\s*experiences/);
    expect(src).toContain("Discover events and posts");
  });

  it("Desktop marketing uses Events + Posts", () => {
    const src = read("src/components/desktop/DesktopMarketingPanel.tsx");
    expect(src).toContain('title="Events"');
    expect(src).toContain('title="Posts"');
    expect(src).toContain("Discover events and posts with friends.");
    expect(src).not.toMatch(/events,\s*experiences/);
    expect(src).not.toContain("curated stops and itineraries");
    expect(src).not.toContain("Hangouts + Experiences");
  });

  it("web banner no longer presents Experiences as a category", () => {
    const src = read("src/components/WebOnlyPublicBanner.tsx");
    expect(src).toContain("Discover local events and posts");
    expect(src).not.toContain("experiences");
  });

  it("profile creation and onboarding drop Experience taxonomy", () => {
    const profile = read("src/components/profile/FullScreenProfileCreation.tsx");
    const onboarding = read("src/components/onboarding/OnboardingFlow.tsx");
    expect(profile).toContain("discovering events, posts, and ideas");
    expect(profile).not.toContain("hangouts, experiences");
    expect(onboarding).toContain("exploring events and posts");
    expect(onboarding).not.toContain("amazing experiences and");
    expect(onboarding).not.toContain("hangouts");
  });

  it("invite internal type experience displays as Post", () => {
    expect(postTypeCompactLabel("experience")).toBe("Post");
    expect(postTypeCompactLabel("hangout")).toBe("Event");
    const src = read(
      "src/components/notifications/PersonalInviteThreadDrawer.tsx"
    );
    expect(src).toContain("postTypeCompactLabel");
    expect(src).not.toContain('"Experience"');
    // Display only — helper maps internal experience → Post
    expect(src).toContain("postTypeCompactLabel(bundle.post_peek.post_type)");
    expect(src).toContain("Paths.experience");
  });

  it("DM shared preview uses Post / Event display labels", () => {
    expect(postTypeNotificationPhrase("experience")).toBe("a post");
    expect(postTypeNotificationPhrase("hangout")).toBe("an event");
    const src = read("src/pages/messages/DirectMessagePage.tsx");
    expect(src).toContain("postTypeNotificationPhrase");
    expect(src).toContain('snap.post_type === "experience"');
    expect(src).not.toContain("Shared an experience");
    expect(src).not.toContain("Shared a hangout");
    expect(src).toContain("`Shared ${postTypeNotificationPhrase(kind)}`");
  });

  it("story default and CreateTitle placeholder say Post", () => {
    const story = read("src/components/ui/InstagramStoryGenerator.tsx");
    const title = read("src/pages/CreateTitlePage.tsx");
    expect(story).toContain('"Check out this post!"');
    expect(story).not.toContain("Check out this experience!");
    expect(title).toContain("Say what this post is about...");
    expect(title).not.toContain("Say what this experience is about...");
  });

  it("manifest uses Events + Posts; routes and runtime experience stay", () => {
    const manifest = read("public/manifest.json");
    expect(manifest).toContain("events and posts");
    expect(manifest).not.toContain("experiences and hangouts");

    const paths = read("src/router/Paths.ts");
    expect(paths).toContain('experience: "/experience"');
    expect(paths).toContain('experienceDetail: "/experience/:id"');

    const filters = read("src/lib/homeVerticalFilters.ts");
    expect(filters).toContain('"experiences"');
    expect(filters).toContain("togglePlaces");
  });
});
