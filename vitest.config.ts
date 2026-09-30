import { defineConfig } from "vitest/config";

export default defineConfig({
  // Mirrors vite.config.ts define (tests use the non-iOS build).
  define: {
    __ECHOTOO_IOS_BUILD__: "false",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
