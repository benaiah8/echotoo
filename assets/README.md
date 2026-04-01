# App Icon & Splash Screen Assets

Source logo for **Android** and **iOS** app icons and splash screens.

## Current setup

- **Source:** `logo.png` (Echotoo owl logo)
- **Colors:** Yellow `#EDBD00` (light) / Dark `#0b0b0b` (dark mode)
- **Platforms:** Android and iOS only (PWA skipped for focus on native apps)

## Regenerating icons

When you update the logo:

```bash
npm run generate:icons
npx cap sync
```

Then rebuild:

- **Android:** `cd android && .\gradlew.bat bundleRelease` (or `assembleDebug` for testing)
- **iOS:** Build in Xcode (requires Mac)

## Using a different logo

1. Replace `assets/logo.png` with your new logo
2. **Requirements:** PNG/JPG at least 1024×1024px, or SVG
3. Run `npm run generate:icons`
4. Optionally adjust colors in `package.json` → `generate:icons` script

## Files

- `logo.png` – Main logo (used by the generator)
- `logo-dark.png` – Optional dark mode variant
