import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";

import "./index.css";
import App from "./App";
import { store } from "./app/store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </StrictMode>
);

// PWA: Handle service worker (disable in development to prevent white screen issues)
if ("serviceWorker" in navigator) {
  // In development, unregister any existing service worker
  if (process.env.NODE_ENV === "development") {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        console.log("Unregistering service worker in development");
        registration.unregister();
      });
    });
  }
}

if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("SW registered:", registration);

        // Check for iOS installation prompt
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isInStandaloneMode = window.matchMedia(
          "(display-mode: standalone)"
        ).matches;

        if (isIOS && !isInStandaloneMode) {
          // Show iOS installation hint after a delay
          setTimeout(() => {
            const shouldShow = localStorage.getItem("echotoo-ios-install-hint");
            if (!shouldShow) {
              const installHint = document.createElement("div");
              installHint.innerHTML = `
                <div style="position: fixed; bottom: 80px; left: 16px; right: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px; z-index: 1000; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="flex: 1;">
                      <div style="font-weight: 600; margin-bottom: 4px;">Install Echotoo</div>
                      <div style="font-size: 14px; color: var(--text-muted);">Tap Share <span style="font-weight: 600;">→</span> "Add to Home Screen"</div>
                    </div>
                    <button onclick="this.parentElement.parentElement.remove(); localStorage.setItem('echotoo-ios-install-hint', 'shown');" style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--text);">×</button>
                  </div>
                </div>
              `;
              document.body.appendChild(installHint);
              localStorage.setItem("echotoo-ios-install-hint", "shown");
            }
          }, 10000); // Show after 10 seconds
        }

        // Listen for updates from service worker
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data && event.data.type === "SW_UPDATE") {
            console.log(
              "Service worker updated to version:",
              event.data.version
            );
            // Auto-reload to prevent white screen (better UX than prompt)
            window.location.reload();
          }
        });

        // Check for updates periodically and on focus
        const checkForUpdates = () => {
          registration.update();
        };

        // Check for updates when user returns to app
        window.addEventListener("focus", checkForUpdates);

        // Check for updates every 5 minutes
        setInterval(checkForUpdates, 5 * 60 * 1000);

        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          if (newWorker) {
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                console.log("New service worker version available - reloading");
                // Auto-reload to get latest version immediately
                window.location.reload();
              }
            });
          }
        });
      })
      .catch(console.error);
  });
}
