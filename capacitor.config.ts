import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.echotoo.app",
  appName: "EchoToo",
  webDir: "dist",
  plugins: {
    Keyboard: {
      // iOS only (per Capacitor Keyboard docs): shrink `<body>` when the IME opens so
      // `visualViewport` / layout stay coherent without double-counting extra JS padding.
      resize: "body",
    },
  },
};

export default config;
