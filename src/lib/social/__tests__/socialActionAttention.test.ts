import { describe, expect, it, beforeEach } from "vitest";
import {
  SOCIAL_ATTENTION_DWELL_MS,
  SOCIAL_ATTENTION_GLOBAL_COOLDOWN_MS,
  __resetSocialAttentionSessionForTests,
  canAutoCueSocialSource,
  hasSocialSourceNoticedThisSession,
  markSocialSourceNoticedThisSession,
  recordSocialAutoCuePlayed,
} from "../socialActionAttention";

describe("socialActionAttention session registry", () => {
  beforeEach(() => {
    __resetSocialAttentionSessionForTests();
  });

  it("allows first auto cue per source", () => {
    expect(canAutoCueSocialSource("a")).toBe(true);
    recordSocialAutoCuePlayed("a", 1_000);
    expect(hasSocialSourceNoticedThisSession("a")).toBe(true);
    expect(canAutoCueSocialSource("a", 1_000)).toBe(false);
  });

  it("enforces global cooldown between different sources", () => {
    recordSocialAutoCuePlayed("a", 1_000);
    expect(canAutoCueSocialSource("b", 1_000 + 10_000)).toBe(false);
    expect(
      canAutoCueSocialSource(
        "b",
        1_000 + SOCIAL_ATTENTION_GLOBAL_COOLDOWN_MS + 1
      )
    ).toBe(true);
  });

  it("manual notice suppresses auto cue without starting cooldown alone", () => {
    markSocialSourceNoticedThisSession("a");
    expect(canAutoCueSocialSource("a", 50_000)).toBe(false);
    /* Another source still allowed if no auto cue recorded */
    expect(canAutoCueSocialSource("b", 50_000)).toBe(true);
  });

  it("exports 10s dwell constant", () => {
    expect(SOCIAL_ATTENTION_DWELL_MS).toBe(10_000);
  });
});
