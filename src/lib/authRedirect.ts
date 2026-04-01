import { isNativeApp } from "./storage/utils/capacitorDetection";

/**
 * Returns the correct redirect URL for auth flows (sign-up verification, OAuth).
 * Web (any origin): /auth/callback on current origin (localhost, production, etc.)
 * Native iOS/Android only: deep link so the app receives the callback
 */
export function getAuthRedirectUrl(): string {
  if (isNativeApp()) {
    return "com.echotoo.app://auth/callback";
  }
  return `${window.location.origin}/auth/callback`;
}
