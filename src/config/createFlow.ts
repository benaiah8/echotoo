// src/config/createFlow.ts
export const CREATE_LABELS = {
  // Button labels on the first screen (purely cosmetic)
  hangout: "Hang out",
  experience: "Experience",

  // What you call an "experience" elsewhere in the UI
  // change this ONE line to rename app-wide ("Experience", "Itinerary", etc.)
  experienceTerm: "Experience",
} as const;

// Types we pass around in URLs. Keep these stable even if labels change.
export type CreateType = "hangout" | "experience";
