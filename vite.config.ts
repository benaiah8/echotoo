import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * iOS App Store build (set ECHOTOO_BUILD_TARGET=ios, used by ios-testflight.yml).
 * Compiles out Google Play / Play Store copy and links so they never ship in the
 * iOS binary (App Review 2.3.10). Web and Android builds are unchanged.
 */
const IS_IOS_BUILD = process.env.ECHOTOO_BUILD_TARGET === "ios";

/** Android-only WebView fallback page mentions Google Play; drop it from iOS web assets. */
function stripAndroidOnlyPublicFilesForIos(): Plugin {
  let outDir = "dist";
  return {
    name: "strip-android-only-public-files-for-ios",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!IS_IOS_BUILD) return;
      fs.rmSync(path.join(outDir, "unsupported-webview.html"), { force: true });
    },
  };
}

/**
 * Old setups referenced `../../logo2.svg` from `src/index.css`, which resolves to
 * `<repo-parent>/experience/logo2.svg` — outside `public/` and often missing after cleanup.
 * Rewire that path to the current owl mark so Vite/Tailwind CSS analysis never ENOENTs.
 */
function legacyLogo2SvgAlias(): Plugin {
  return {
    name: "legacy-logo2-svg-alias",
    enforce: "pre",
    resolveId(id, importer) {
      const norm = id.replace(/\\/g, "/");
      if (/\/experience\/logo2\.svg$/i.test(norm)) {
        return path.join(DIR, "public", "owlicon.svg");
      }
      if (id === "../../logo2.svg" || norm.endsWith("/../../logo2.svg")) {
        if (
          importer &&
          /[/\\]src[/\\]index\.css$/i.test(importer.replace(/\\/g, "/"))
        ) {
          return path.join(DIR, "public", "owlicon.svg");
        }
      }
      return undefined;
    },
  };
}

export default defineConfig({
  plugins: [
    legacyLogo2SvgAlias(),
    react(),
    tailwindcss(),
    stripAndroidOnlyPublicFilesForIos(),
  ],
  define: {
    __ECHOTOO_IOS_BUILD__: JSON.stringify(IS_IOS_BUILD),
  },
  // Avoid two React copies (would break Context — e.g. useCreateChooser always null → crash before fix).
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  // Pin Vite 6 "modules" so a later Vite upgrade cannot silently raise the Android WebView floor.
  build: {
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
  },
});
