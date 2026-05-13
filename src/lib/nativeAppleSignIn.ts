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

/**
 * Apple expects `ASAuthorizationAppleIDRequest.nonce` to be the SHA-256 of the
 * raw nonce (UTF-8), base64url-encoded. Supabase `signInWithIdToken` needs the
 * same raw nonce to validate the `nonce` claim in the Apple ID token.
 */
async function sha256Base64UrlUtf8(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
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
  const nonceForAppleRequest = await sha256Base64UrlUtf8(rawNonce);

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
