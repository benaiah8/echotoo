# EchoToo — Android Release Signing Guide

**Critical:** You need the keystore file and passwords for every future app update. Losing them means you cannot update your app on Play Store.

---

## Step 1: Create the Keystore (ONE-TIME, manual)

Run this in Command Prompt or PowerShell from the project root (`c:\Users\benai\Documents\experience\frontend`):

```powershell
keytool -genkey -v -keystore echotoo-release.keystore -alias echotoo -keyalg RSA -keysize 2048 -validity 10000
```

You will be prompted for:

- **Keystore password** — Choose a strong password. Save it securely (password manager recommended).
- **Key password** — Can be same as keystore password (just press Enter when asked).
- **Name, organization, city, etc.** — Fill in as needed for your app.

**Store the keystore safely:**

- Place `echotoo-release.keystore` in the project root (or a secure folder outside the repo).
- Back it up to secure cloud storage (e.g. Google Drive, Dropbox) or offline backup.
- Never commit it to git (already in `.gitignore`).

---

## Step 2: Create keystore.properties (passwords file)

Create the file: `android/keystore.properties`

Content (replace with your actual passwords):

```properties
storePassword=YOUR_KEYSTORE_PASSWORD
keyPassword=YOUR_KEY_PASSWORD
keyAlias=echotoo
storeFile=..\\..\\echotoo-release.keystore
```

- If the keystore is in the project root: `storeFile=..\\..\\echotoo-release.keystore` (from android/app)
- If you put the keystore elsewhere, use an absolute path:  
  `storeFile=C:\\Users\\benai\\echotoo-release.keystore`

**Never commit `keystore.properties`** — it contains secrets. (It's in an ignored path; double-check it's not tracked.)

---

## Step 3: Build the release AAB

### Before `npm run build`

Native **Continue with Google** on Android needs a Web OAuth client ID baked into the app at build time.

- Confirm **`.env.local`** exists in the project root (it is gitignored — **do not commit it**).
- Confirm it includes:
  ```
  VITE_GOOGLE_WEB_CLIENT_ID=<your Google Web OAuth Client ID>
  ```
- Run **`npm run build` only after** that line is present. Vite reads `VITE_*` variables during the build; Gradle does not add them later.

If this variable is missing, Play/release builds may not get native Google sign-in (users may see browser sign-in instead, or sign-in may fail).

### Build commands

From the project root:

```powershell
npm run build
npx cap sync android
cd android
.\gradlew.bat bundleRelease
```

**Output AAB path:**

```
android\app\build\outputs\bundle\release\app-release.aab
```

**Important:** The AAB is only valid for Play Console upload if you completed Step 1 and Step 2. If you ran `bundleRelease` without creating the keystore and `keystore.properties`, the build used the debug key and **Play Console will reject it**. Create the keystore, add `keystore.properties`, then run `bundleRelease` again.

---

## Quick Reference

| Item           | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| Keystore file  | `echotoo-release.keystore`                                 |
| Key alias      | `echotoo`                                                  |
| Passwords file | `android/keystore.properties`                              |
| AAB output     | `android\app\build\outputs\bundle\release\app-release.aab` |

---

## Android App Smoke Test Checklist

Before submitting to Play Console, test on a device or emulator:

- [ ] **Google login** — Sign in with Google works (native account picker on Android when `VITE_GOOGLE_WEB_CLIENT_ID` was set before `npm run build`)
- [ ] **Feed loads** — Home feed displays posts
- [ ] **Create post** — Create flow works (title → activities → preview → publish)
- [ ] **Comments** — Add comment on a post; replies work
- [ ] **Profile editing** — Edit profile opens; Save works; Delete Account is visible in Danger zone
- [ ] **Report post** — Three dots on someone else's post → Report opens email
- [ ] **Report user** — On another user's profile, Report icon opens email
- [ ] **Help & Support** — Edit profile → Help & Support link opens email

---

## If You Lose the Keystore

You will not be able to publish updates to the same app. You would have to create a new app listing. Keep backups.
