import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.echotoo.app",
  appName: "Echo Too",
  webDir: "dist",
  android: {
    minWebViewVersion: 87,
  },
  // Android WebView fallback page; not shipped in iOS builds (ECHOTOO_BUILD_TARGET=ios).
  ...(process.env.ECHOTOO_BUILD_TARGET === "ios"
    ? {}
    : { server: { errorPath: "unsupported-webview.html" } }),
  plugins: {
    PushNotifications: {
      /**
       * Suppress native foreground alert on Android; JS in-app banner handles UX.
       * iOS foreground suppress is in AppDelegate UNUserNotificationCenterDelegate.
       */
      presentationOptions: [],
    },
    Keyboard: {
      // iOS only (per Capacitor Keyboard docs): shrink `<body>` when the IME opens so
      // `visualViewport` / layout stay coherent without double-counting extra JS padding.
      resize: "body",
    },
    SocialLogin: {
      providers: {
        google: true,
        apple: false,
        facebook: false,
        twitter: false,
      },
    },
  },
};

export default config;
