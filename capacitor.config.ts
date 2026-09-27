import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.echotoo.app",
  appName: "Echo Too",
  webDir: "dist",
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
