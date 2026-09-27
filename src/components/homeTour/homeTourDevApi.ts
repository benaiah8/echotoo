/**
 * DEV-only console helpers:
 *   window.__echoHomeTour.start()
 *   window.__echoHomeTour.reset()
 */

import { clearHomeTourCompletion } from "./homeTourStorage";

export type EchoHomeTourDevApi = {
  start: () => void;
  reset: () => void;
};

declare global {
  interface Window {
    __echoHomeTour?: EchoHomeTourDevApi;
  }
}

export function registerHomeTourDevApi(options: {
  userId: string | null;
  start: () => void;
}): () => void {
  if (!import.meta.env.DEV || typeof window === "undefined") {
    return () => {};
  }

  const api: EchoHomeTourDevApi = {
    start: () => {
      options.start();
    },
    reset: () => {
      clearHomeTourCompletion(options.userId);
    },
  };

  window.__echoHomeTour = api;

  return () => {
    if (window.__echoHomeTour === api) {
      delete window.__echoHomeTour;
    }
  };
}
