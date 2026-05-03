# Instagram Story Generator - Relevant Files

## Core Files (Directly Related to Instagram Story Generation)

### 1. **src/components/ui/InstagramStoryGenerator.tsx**

- **Main component** for the Instagram Story modal: visible preview, export trigger, blob/share flow
- **Primary export:** manual Canvas 2D via `renderInstagramStoryToCanvas` (see `src/lib/renderInstagramStoryToCanvas.ts`)
- **Fallback export:** html2canvas capture of the off-screen `StoryExportCard` (DOM), if manual render fails validation or throws, or if manual export is toggled off for rollback
- **This is the PRIMARY file for the modal UX and wiring**

### 2. **src/components/ui/StoryCharacter.tsx**

- **Character component** - the cute black round character
- SVG-based character with winking animation
- Props: `size` (default 600), `winking` (boolean)
- **This is the file to modify if you want a different character design**

### 3. **src/components/ui/ShareDrawer.tsx**

- **Share drawer component** that opens when user clicks share
- Contains the "Instagram Stories" button
- Opens the InstagramStoryGenerator when clicked
- **This is the entry point for the story generator**

### 4. **src/components/ui/PostActions.tsx**

- **Post actions component** (like, save, share, comment buttons)
- Updated to use ShareDrawer instead of direct share
- Passes caption and post image to ShareDrawer
- **This triggers the share flow**

## Supporting Files

### 5. **src/lib/renderInstagramStoryToCanvas.ts**

- Manual Canvas 2D composition for the primary story bitmap (matches shared layout tokens from `StoryExportCard`)

### 6. **src/lib/instagramStoryCanvasValidation.ts**

- Post-export canvas sanity check (manual and html2canvas paths)

### 7. **src/components/ui/StoryExportCard.tsx**

- Off-screen DOM used by the html2canvas fallback; also exports shared colors/caption constants for manual export

### 8. **src/lib/img.ts**

- Helper function `imgUrlPublic()` that converts Supabase storage paths to public URLs
- Used to process post images for the story

### 9. **Branding / background (web)**

- **Owl mark (in-app and cache-busted):** `public/owlicon.svg` — wired through `src/lib/assets.ts` (`getOwlLogoPath()`).
- **Story frame background:** `public/instagram-story-bg.png` — `getInstagramStoryBackgroundPath()` in `src/lib/assets.ts`.

## Configuration

### Environment Variables

- `VITE_SITE_URL` - Site URL for the link (defaults to "echotoo.com")
- Set in `.env` file if needed

## Summary

**For Instagram Story Design:**

- Modal + wiring: `InstagramStoryGenerator.tsx` (visible preview); primary bitmap: `renderInstagramStoryToCanvas.ts`
- Character (if used in UI): `StoryCharacter.tsx`

**For Share Flow:**

- `ShareDrawer.tsx` → `InstagramStoryGenerator.tsx`

**To change the owl or story visuals:**

- Owl SVG: replace `public/owlicon.svg` and bump `LOGO_VERSION` in `src/lib/assets.ts` if needed.
- Story background: replace `public/instagram-story-bg.png` and bump `INSTAGRAM_STORY_BG_VERSION` in `src/lib/assets.ts` if needed.
- For installed PWA / favicon sizes, see `LOGO_UPDATE_GUIDE.md` (web icons under `public/icons/`, `public/manifest.json`, `index.html`).
