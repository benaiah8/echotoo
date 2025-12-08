// src/router/Paths.ts
export const Paths = {
  home: "/",
  create: "/create",
  createTitle: "/create/title",
  createActivities: "/create/activities",
  createCategories: "/create/categories",
  preview: "/create/preview",
  experience: "/experience",
  experienceDetail: "/experience/:id",
  notification: "/notifications",
  profile: "/profile",
  createMap: "/create/map",
  feedTest: "/feed-test",
  hangoutDetail: "/hangout/:id",

  // Profile routes
  user: "/u/:username",
  me: "/me",
  profileMe: "/u/me",
} as const;

// Helper function for profile by username
export const profileByUsername = (username: string) => `/u/${username}`;

// Individual exports as requested
export const home = "/";
export const create = "/create";
export const notification = "/notifications";
export const profileMe = "/u/me";
