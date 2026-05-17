import { SocialLogin } from "@capgo/capacitor-social-login";
import { isAndroid, isNativeApp } from "./storage/utils/capacitorDetection";

let initializePromise: Promise<void> | null = null;

function getGoogleWebClientId(): string {
  const id = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID?.trim();
  if (!id) {
    throw new Error(
      "VITE_GOOGLE_WEB_CLIENT_ID is not set. Add it to .env.local for native Google Sign-In."
    );
  }
  return id;
}

async function ensureGoogleSignInInitialized(): Promise<void> {
  if (!initializePromise) {
    const webClientId = getGoogleWebClientId();
    initializePromise = SocialLogin.initialize({
      google: {
        webClientId,
        mode: "online",
      },
    });
  }
  await initializePromise;
}

export function canUseNativeGoogleSignInAndroid(): boolean {
  return isNativeApp() && isAndroid();
}

function collectCancelMarkers(error: unknown): string {
  const parts: string[] = [];
  if (error == null) return "";
  if (typeof error === "string") return error;
  if (error instanceof Error) {
    parts.push(error.message, error.name);
  }
  if (typeof error === "object") {
    const o = error as Record<string, unknown>;
    for (const key of ["code", "message", "errorMessage", "error"]) {
      const v = o[key];
      if (typeof v === "string") parts.push(v);
      if (typeof v === "number") parts.push(String(v));
    }
  }
  return parts.join(" ");
}

const GOOGLE_CANCEL_MARKERS = [
  "cancelled",
  "canceled",
  "user cancelled",
  "user canceled",
  "12501",
  "sign_in_cancelled",
  "sign_in_canceled",
  "nocredentialexception",
];

export function isGoogleNativeSignInUserCancel(error: unknown): boolean {
  const haystack = collectCancelMarkers(error).toLowerCase();
  if (!haystack) return false;
  return GOOGLE_CANCEL_MARKERS.some((m) => haystack.includes(m));
}

/**
 * Native Sign in with Google (Android only). Call only when
 * `canUseNativeGoogleSignInAndroid()` is true.
 */
export async function signInWithGoogleNativeAndroid(): Promise<string> {
  if (!canUseNativeGoogleSignInAndroid()) {
    throw new Error(
      "Native Google Sign-In is only available on the Android app."
    );
  }

  await ensureGoogleSignInInitialized();

  const login = await SocialLogin.login({
    provider: "google",
    options: {
      scopes: ["email", "profile"],
    },
  });

  const result = login.result;
  if (!result || result.responseType === "offline") {
    throw new Error("Google did not return an identity token.");
  }

  const idToken = result.idToken?.trim();
  if (!idToken) {
    throw new Error("Google did not return an identity token.");
  }

  return idToken;
}
