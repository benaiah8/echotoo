import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Avoid two React copies (would break Context — e.g. useCreateChooser always null → crash before fix).
  resolve: {
    dedupe: ["react", "react-dom"],
  },
});
