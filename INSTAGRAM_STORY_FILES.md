# Instagram Story Generator - Relevant Files

## Core Files (Directly Related to Instagram Story Generation)

### 1. **src/components/ui/InstagramStoryGenerator.tsx**
   - **Main component** that generates the Instagram Story image
   - Contains the layout, styling, and image generation logic
   - Handles: background, gradients, logo, caption, character positioning, ECHOTOO text, link
   - Uses html2canvas to convert the HTML to an image
   - **This is the PRIMARY file for the story design and structure**

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

### 5. **src/lib/img.ts**
   - Helper function `imgUrlPublic()` that converts Supabase storage paths to public URLs
   - Used to process post images for the story

### 6. **public/echotoo logo.png** (or **echotoo logo2.svg**)
   - Logo file used in the story
   - Currently referenced in InstagramStoryGenerator.tsx
   - **Replace this file when you have the new logo**

## Configuration

### Environment Variables
- `VITE_SITE_URL` - Site URL for the link (defaults to "echotoo.com")
- Set in `.env` file if needed

## Summary

**For Instagram Story Design:**
- Primary: `InstagramStoryGenerator.tsx` (layout, design, structure)
- Character: `StoryCharacter.tsx` (the character design)

**For Share Flow:**
- `ShareDrawer.tsx` → `InstagramStoryGenerator.tsx`

**To change logo:**
- Replace `/public/echotoo logo.png` or update path in `InstagramStoryGenerator.tsx` line 176

