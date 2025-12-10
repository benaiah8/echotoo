# 🦉 Logo Update Guide

## Where to Update the Owl Logo

**Single Source of Truth:**

```
/public/owlicon.svg
```

## How to Update

1. **Replace the file** at `/public/owlicon.svg` with your new logo
2. **If the logo doesn't update immediately:**
   - Do a **hard refresh** in your browser:
     - **Windows/Linux:** `Ctrl + Shift + R` or `Ctrl + F5`
     - **Mac:** `Cmd + Shift + R`
   - Or increment the version number in `src/lib/assets.ts` (line 15)

## Where the Logo is Used

The logo automatically appears in these places:

- ✅ Top navigation bar (Logo component)
- ✅ Instagram Story generator (owl above cards)
- ✅ Any other component using the Logo component

## Technical Details

All logo references use the centralized configuration in:

- **File:** `src/lib/assets.ts`
- **Function:** `getOwlLogoPath()`

This ensures:

- ✅ Single source of truth
- ✅ Cache-busting for updates
- ✅ Easy to change filename if needed

## If You Rename the File

If you want to use a different filename (e.g., `owl-logo.svg`):

1. Update `OWL_LOGO_PATH` in `src/lib/assets.ts`:

   ```typescript
   export const OWL_LOGO_PATH = "/your-new-filename.svg";
   ```

2. That's it! All references will automatically update.

## Force Cache Refresh

If you update the logo but still see the old version:

1. Open `src/lib/assets.ts`
2. Increment the `LOGO_VERSION` number (line 15):
   ```typescript
   const LOGO_VERSION = "2"; // Change from "1" to "2"
   ```
3. Save and refresh the page

---

**Remember:** Just replace `/public/owlicon.svg` and the logo will update everywhere! 🎉
