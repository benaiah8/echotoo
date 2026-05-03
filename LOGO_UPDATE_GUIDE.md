# Logo update guide

## In-app owl (React)

**Single source of truth for the SVG used in the UI:**

`public/owlicon.svg`

### How to update

1. Replace `public/owlicon.svg` with your new artwork.
2. If browsers keep serving an old file, either hard refresh (Windows/Linux: `Ctrl+Shift+R` or `Ctrl+F5`, Mac: `Cmd+Shift+R`) or increment `LOGO_VERSION` in `src/lib/assets.ts`.

### Where it is used

Components import `getOwlLogoPath()` from `src/lib/assets.ts` (for example `Logo.tsx`, splash/loading UI). Updating the file and version covers all of those.

---

## Web / PWA (favicon, manifest, home screen)

These are **static files** under `public/`:

- `public/manifest.json` — `icons` entries (PNG under `public/icons/`)
- `index.html` — `link rel="icon"`, `apple-touch-icon`, manifest link
- `public/favicon.ico`, `public/apple-touch-icon.png`
- `public/icons/icon-{48,72,96,128,192,256,512}.png` (and optional `.webp` copies)

After you change `owlicon.svg`, regenerate the raster icons from that SVG so install icons match the app (same aspect and mark). One approach (Sharp CLI, no project dependency):

```bash
npx --yes sharp-cli -i public/owlicon.svg -o public/icons/icon-192.png resize 192 192
# repeat for 48, 72, 96, 128, 256, 512; also apple-touch-icon.png (e.g. 180) and favicon.ico (e.g. 64)
```

Bump the service worker cache label in `public/sw.js` (`APP_VERSION`) when you ship new icons so clients drop stale cached assets.

---

## Native Android / iOS (store icons)

Use **`npm run generate:icons`** with source images in **`assets/`** (see `assets/README.md`). That updates native projects; it does not automatically replace the hand-maintained PWA files in `public/` unless you adopt the `--pwa` flow and align output paths with your layout.

---

## Rename the public SVG file

1. Add the new file under `public/` (for example `public/owl-mark.svg`).
2. Set `OWL_LOGO_PATH` in `src/lib/assets.ts` to match (`/owl-mark.svg`).
3. Update `index.html` if you reference the old filename there.

---

## Force cache refresh (summary)

1. `src/lib/assets.ts` — increment `LOGO_VERSION` for in-app SVG URLs.
2. `public/sw.js` — increment `APP_VERSION` after changing precached icons or shell assets.
