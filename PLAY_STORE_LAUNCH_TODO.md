# EchoToo — Google Play Closed Testing Launch Checklist

**Goal:** Ship to closed testing as fast as possible. Only include items critical for launch.

---

## Phase 1: Android Build Setup

- [x] **1.1** Update `capacitor.config.ts` → `appId: 'com.echotoo.app'`
- [ ] **1.1a** Before each Play release build: confirm **`.env.local`** exists and includes `VITE_GOOGLE_WEB_CLIENT_ID=<Google Web OAuth Client ID>` (gitignored — do not commit). See `RELEASE_SIGNING_GUIDE.md`. If missing, native Google sign-in may not work in the release app.
- [x] **1.2** Run `npm run build`
- [x] **1.3** Android folder exists (already added)
- [x] **1.4** Run `npx cap sync`
- [ ] **1.5** Confirm Android project builds: `cd android && .\gradlew.bat assembleDebug` _(requires JAVA_HOME set)_

---

## Phase 2: Versioning

- [x] **2.1** Set `package.json` version to `1.0.0`
- [x] **2.2** Set `android/app/build.gradle`: `versionCode 1`, `versionName "1.0.0"`

---

## Phase 3: OAuth Redirect (critical for Google login in app)

- [x] **3.1** `capacitor.config.ts` — appId ✅
- [x] **3.2** `src/components/CapacitorOAuthListener.tsx` — OAUTH_CALLBACK_SCHEME ✅
- [x] **3.3** `src/components/modal/AuthModal.tsx` — redirectTo ✅
- [x] **3.4** `src/hooks/useSupabaseAuth.ts` — redirectTo ✅
- [ ] **3.5** **Supabase Dashboard** — Add `com.echotoo.app://auth/callback` to Auth → URL Configuration → Redirect URLs

---

## Phase 4: Play Store Technical Compliance

### Already in place ✅

- **Account deletion** — FullScreenProfileCreation (Edit profile → Danger zone → Delete Account)
- **Report post** — PostMenu shows "Report" for non-owners (mailto)
- **Report user** — ProfileTopBar shows Report icon on OtherProfilePage (mailto)
- **Support link** — FullScreenProfileCreation has "Help & Support" link (Edit profile)

---

## Phase 5: Signing & AAB Build

- [ ] **5.0** Confirm `.env.local` has `VITE_GOOGLE_WEB_CLIENT_ID` (then `npm run build` → `npx cap sync android` → `bundleRelease`) — See `RELEASE_SIGNING_GUIDE.md`
- [ ] **5.1** Create Android keystore — See `RELEASE_SIGNING_GUIDE.md` (manual)
- [x] **5.2** Configure `android/app/build.gradle` with signing config ✅
- [x] **5.3** Produce `app-release.aab` via `.\gradlew.bat bundleRelease` ✅

**Full steps:** See `RELEASE_SIGNING_GUIDE.md`. You must create the keystore and `android/keystore.properties` before the AAB is Play Console–ready. Without them, the build uses debug signing (Play will reject it). Run `npm run build` only after `VITE_GOOGLE_WEB_CLIENT_ID` is in `.env.local`.

---

## Phase 6: Smoke Test (on device or emulator)

- [ ] Google login works
- [ ] Feed loads
- [ ] Create post works
- [ ] Comments work
- [ ] Profile editing works (including delete account visible)

---

## Phase 7: Play Console (manual, outside this repo)

- Privacy policy URL (required if app collects data)
- Content rating questionnaire
- Data safety form
- Store listing (screenshots, description, etc.)

---

## Additional Notes (not blocking closed testing)

- **Target SDK**: Play requires `targetSdkVersion` 34+ for new apps (Aug 2024). Capacitor 8 likely sets this.
- **App icon**: Verify `android/app/src/main/res/` has proper launcher icons.
- **Permissions**: Review AndroidManifest for camera, storage if used.
