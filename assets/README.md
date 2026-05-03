# Native app icon and splash (Capacitor)

Source images for **Android** and **iOS** app icons and splash screens are generated with `@capacitor/assets` (`npm run generate:icons`).

## Default asset folder

The CLI looks for a directory named **`assets`** at the project root (or **`resources`** if `assets` is missing). This repo uses **`assets/`** for documentation; add your source files there before running the generator.

## What to add

`@capacitor/assets` picks up files such as (see [capacitor-assets](https://github.com/ionic-team/capacitor-assets)):

- **`icon.png`** or **`logo.png`** — master artwork (owl) used when generating icons/splashes from a single image. Use a high-resolution PNG (for example 1024×1024 or larger) on a transparent or solid background as appropriate.
- **`icon-only.png`** — optional; foreground for adaptive icons.
- **`logo-dark.png`**, **`splash.png`**, **`splash-dark.png`** — optional variants.

The **`generate:icons`** script in `package.json` already passes light/dark background colors (`#EDBD00` / `#0b0b0b`).

## Regenerating native assets

```bash
npm run generate:icons
npx cap sync
```

Then rebuild the native app (Android Studio / Xcode).

## Web / PWA icons

Installed web app icons, `favicon.ico`, and Apple touch icons live under **`public/`** (for example `public/owlicon.svg`, `public/icons/`, `public/manifest.json`). Those are separate from Capacitor’s native pipeline; see **`LOGO_UPDATE_GUIDE.md`** for how they stay in sync with the owl mark.
