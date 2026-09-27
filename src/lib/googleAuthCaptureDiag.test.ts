/**
 * Safe Google auth capture diagnostics — no tokens / PII in logs.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  extractGoogleAuthSafeErrorFields,
  logGoogleAuth,
} from "./googleAuthCaptureDiag";
import { isGoogleNativeSignInUserCancel } from "./nativeGoogleSignIn";

describe("googleAuthCaptureDiag", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  it("logs only allowlisted primitive fields under GOOGLE_AUTH", () => {
    logGoogleAuth("native_start", {
      platform: "android",
      ok: true,
      skip_me_object: { secret: "x" } as unknown as string,
    });
    expect(infoSpy).toHaveBeenCalledWith(
      "GOOGLE_AUTH",
      "native_start",
      expect.objectContaining({ platform: "android", ok: true }),
    );
    const payload = infoSpy.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("skip_me_object");
  });

  it("drops overlong strings that could carry tokens", () => {
    logGoogleAuth("token_present", {
      has_id_token: true,
      junk: "a".repeat(200),
    });
    const payload = infoSpy.mock.calls[0]?.[2] as Record<string, unknown>;
    expect(payload).toEqual({ has_id_token: true });
  });

  it("flags nocredentialexception without exposing raw message", () => {
    const err = new Error("NoCredentialException: no credentials available");
    err.name = "Error";
    const fields = extractGoogleAuthSafeErrorFields(err, true);
    expect(fields.matches_nocredentialexception).toBe(true);
    expect(fields.cancel_marker_hit).toBe("nocredentialexception");
    expect(fields.classified_as_cancel).toBe(true);
    expect(JSON.stringify(fields)).not.toMatch(/no credentials available/i);
  });

  it("does not treat ApiException 10 as cancel via marker list alone", () => {
    const err = { name: "ApiException", code: 10, message: "DEVELOPER_ERROR" };
    expect(isGoogleNativeSignInUserCancel(err)).toBe(false);
    const fields = extractGoogleAuthSafeErrorFields(err, false);
    expect(fields.classified_as_cancel).toBe(false);
    expect(fields.safe_error_code).toBe("10");
    expect(fields.matches_nocredentialexception).toBe(false);
  });

  it("treats 12501 as cancel (unchanged classification)", () => {
    const err = { code: 12501, message: "sign_in_cancelled" };
    expect(isGoogleNativeSignInUserCancel(err)).toBe(true);
  });
});
