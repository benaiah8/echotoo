import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  isMineAtmosphereReportAuthoritative,
  shouldApplyMineAtmosphereReport,
  simulateMineAtmosphereIdentityCommit,
} from "./mineAtmosphereIdentitySync";
import {
  applyMineAtmosphereReady,
  createMineAtmosphereCrossfadeState,
} from "./mineAtmosphereCrossfade";

const overlaySrc = readFileSync(
  new URL("../../pages/people/MatchDeckOverlay.tsx", import.meta.url),
  "utf8"
);

describe("mineAtmosphereIdentitySync", () => {
  it("rejects genuinely stale identity keys", () => {
    expect(
      isMineAtmosphereReportAuthoritative({
        reportIdentityKey: "b:b",
        authoritativeIdentityKey: "a:a",
      })
    ).toBe(false);
  });

  it("accepts matching identity when ready", () => {
    expect(
      shouldApplyMineAtmosphereReport({
        reportIdentityKey: "b:b",
        authoritativeIdentityKey: "b:b",
        ready: true,
      })
    ).toBe(true);
  });

  it("ignores not-ready reports so prior wash can remain", () => {
    expect(
      shouldApplyMineAtmosphereReport({
        reportIdentityKey: "b:b",
        authoritativeIdentityKey: "b:b",
        ready: false,
      })
    ).toBe(false);
  });

  it("A → B already paint-ready: layout sync before child passive accepts B", () => {
    const { accepted } = simulateMineAtmosphereIdentityCommit({
      fromIdentity: "a:a",
      toIdentity: "b:b",
      layoutSyncFirst: true,
      reportReady: true,
    });
    expect(accepted).toBe(true);
  });

  it("regression: child-before-parent passive sync rejects B (old bug)", () => {
    const { accepted, finalRef } = simulateMineAtmosphereIdentityCommit({
      fromIdentity: "a:a",
      toIdentity: "b:b",
      layoutSyncFirst: false,
      reportReady: true,
    });
    expect(accepted).toBe(false);
    expect(finalRef).toBe("b:b");
  });

  it("A → B while loading: not-ready report does not clear A; later ready applies B", () => {
    let atm = applyMineAtmosphereReady(
      createMineAtmosphereCrossfadeState(),
      "path-a"
    );
    expect(atm.fromPath).toBe("path-a");

    const loading = simulateMineAtmosphereIdentityCommit({
      fromIdentity: "a:a",
      toIdentity: "b:b",
      layoutSyncFirst: true,
      reportReady: false,
    });
    expect(loading.accepted).toBe(false);

    // Prior wash unchanged until a ready apply.
    expect(atm.fromPath).toBe("path-a");

    const ready = simulateMineAtmosphereIdentityCommit({
      fromIdentity: "b:b",
      toIdentity: "b:b",
      layoutSyncFirst: true,
      reportReady: true,
    });
    expect(ready.accepted).toBe(true);
    atm = applyMineAtmosphereReady(atm, "path-b");
    expect(atm).toMatchObject({
      fromPath: "path-a",
      toPath: "path-b",
      fading: true,
    });
  });

  it("rapid A → B → C: stale B cannot overwrite after C is authoritative", () => {
    const ref = { current: "c:c" as string | null };
    expect(
      shouldApplyMineAtmosphereReport({
        reportIdentityKey: "b:b",
        authoritativeIdentityKey: ref.current,
        ready: true,
      })
    ).toBe(false);
    expect(
      shouldApplyMineAtmosphereReport({
        reportIdentityKey: "c:c",
        authoritativeIdentityKey: ref.current,
        ready: true,
      })
    ).toBe(true);
  });
});

describe("MatchDeckOverlay identity sync wiring", () => {
  it("synchronizes atmosphere identity in useLayoutEffect (before child passive reports)", () => {
    expect(overlaySrc).toMatch(
      /useLayoutEffect\(\s*\(\)\s*=>\s*\{[^}]*mineAtmosphereIdentityRef\.current\s*=\s*mineAtmosphereIdentityKey/s
    );
    // Must not sync the gate ref only in a passive useEffect (child reports first).
    expect(overlaySrc).not.toMatch(
      /useEffect\(\s*\(\)\s*=>\s*\{[^}]*mineAtmosphereIdentityRef\.current\s*=\s*mineAtmosphereIdentityKey/s
    );
  });

  it("still validates reports through the shared identity gate", () => {
    expect(overlaySrc).toContain("shouldApplyMineAtmosphereReport");
  });
});
