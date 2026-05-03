import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const DIR = path.dirname(fileURLToPath(import.meta.url));

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
  plugins: [legacyLogo2SvgAlias(), react(), tailwindcss()],
  // Avoid two React copies (would break Context — e.g. useCreateChooser always null → crash before fix).
  resolve: {
    dedupe: ["react", "react-dom"],
  },
});
