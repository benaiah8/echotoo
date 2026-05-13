import {
  AppleSignIn,
  ErrorCode,
  SignInScope,
} from "@capawesome/capacitor-apple-sign-in";
import { isIOS, isNativeApp } from "./storage/utils/capacitorDetection";

export type NativeAppleSignInResult = {
  idToken: string;
  rawNonce: string;
  email?: string | null;
  givenName?: string | null;
  familyName?: string | null;
};

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function generateRawNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

function bytesToLowerHex(bytes: Uint8Array): string {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Apple `ASAuthorizationAppleIDRequest.nonce`: SHA-256 of the raw nonce string
 * (UTF-8 bytes), as a **lowercase hex** string (64 chars). This matches what
 * Supabase expects to pair with `signInWithIdToken({ nonce: rawNonce })`.
 */
async function sha256HexUtf8(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return bytesToLowerHex(new Uint8Array(digest));
}

export function canUseNativeAppleSignIn(): boolean {
  return isNativeApp() && isIOS();
}

export function isAppleNativeSignInUserCancel(error: unknown): boolean {
  if (error == null || typeof error !== "object") return false;
  const code = (error as { code?: string }).code;
  return code === ErrorCode.SignInCanceled;
}

/**
 * Native Sign in with Apple (iOS only). Call only when `canUseNativeAppleSignIn()` is true.
 */
export async function signInWithAppleNative(): Promise<NativeAppleSignInResult> {
  if (!canUseNativeAppleSignIn()) {
    throw new Error("Native Apple Sign-In is only available on the iOS app.");
  }

  const rawNonce = generateRawNonce();
  /** Apple: SHA-256 hex of UTF-8(rawNonce). Supabase: same `rawNonce` string. */
  const nonceForAppleRequest = await sha256HexUtf8(rawNonce);

  const result = await AppleSignIn.signIn({
    nonce: nonceForAppleRequest,
    scopes: [SignInScope.Email, SignInScope.FullName],
  });

  const idToken = result.idToken?.trim();
  if (!idToken) {
    throw new Error("Apple did not return an identity token.");
  }

  return {
    idToken,
    rawNonce,
    email: result.email,
    givenName: result.givenName,
    familyName: result.familyName,
  };
}
