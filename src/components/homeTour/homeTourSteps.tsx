/**
 * Home Tour — step config (targets map to data-tour-target attributes).
 * Content / order / emphasis only — interaction wiring lives in HomeTour.
 */

import type { ReactNode } from "react";
import {
  tourBlue,
  tourBrand,
  tourDatePreview,
  tourGreen,
  tourItalic,
  tourMiniBlock,
  tourStack,
  tourStrong,
} from "./homeTourText";

export type HomeTourTargetId =
  | "home-filters"
  | "home-search-filters"
  | "home-filter-dates"
  | "home-filter-panel"
  | "home-filter-shortcuts"
  | "home-filter-trigger"
  | "duo-group"
  | "create"
  | "people";

export type HomeTourStep = {
  id: string;
  /**
   * Spotlight target. Omit / null for a centered welcome card (no hole).
   */
  target?: HomeTourTargetId | null;
  title?: string;
  /**
   * Prefer composing with `tourBrand` / `tourStrong` / `tourStack`.
   */
  body: ReactNode;
  /**
   * When true, wait briefly for the target; if still missing, skip this step.
   * Used for feed Duo/Group which may not be on the first paint.
   */
  optionalTarget?: boolean;
  /**
   * Slightly stronger title treatment (People). Overlay-local only.
   */
  titleEmphasis?: "normal" | "prominent";
};

export const HOME_TOUR_STEPS: readonly HomeTourStep[] = [
  {
    id: "welcome",
    target: null,
    title: "Welcome to EchoToo 👋",
    body: tourStack(
      <>
        Discover {tourBrand("places and events")}, explore ideas, and meet
        people along the way.
      </>,
      <>
        Find {tourBrand("things to do")} and {tourBrand("people to connect with")}
        .
      </>
    ),
  },
  {
    id: "filters-search",
    target: "home-search-filters",
    title: "Find what you’re looking for",
    body: tourStack(
      <>
        Filter events by {tourBrand("TIME")}, or explore{" "}
        {tourStrong("places, plans, and posts")}.
      </>,
      <>
        {tourBrand("Search")} for things like {tourBrand("date places")} or{" "}
        {tourBrand("weekend plans")}.
      </>
    ),
  },
  {
    id: "date-time",
    target: "home-filter-panel",
    title: "Find events by time",
    body: tourStack(
      <>
        Find events happening {tourBrand("when you want")}.
      </>,
      tourDatePreview()
    ),
  },
  {
    id: "duo",
    target: "duo-group",
    title: "Duo",
    body: tourStack(
      <>
        {tourBrand("Down to go?")} See people going to the same event or checking
        out the same place.
      </>,
      <>
        You can {tourBrand("meet there")} or {tourBrand("make plans")}.
      </>
    ),
    optionalTarget: true,
  },
  {
    id: "group",
    target: "duo-group",
    title: "Group",
    body: tourStack(
      <>
        {tourBrand("Find or create")} a group around an event, place, or post.
      </>,
      <>
        {tourStrong("Chat, plan, connect")} with people around the same thing.
      </>
    ),
    optionalTarget: true,
  },
  {
    id: "people",
    target: "people",
    title: "People",
    titleEmphasis: "prominent",
    body: tourStack(
      <>
        See {tourBrand("people")}, {tourGreen("Duos")}, and {tourBlue("Groups")}{" "}
        you can connect with — or discover new ones.
      </>,
      <>Find people around the events, places, and things you're into.</>
    ),
  },
  {
    id: "create",
    target: "create",
    title: "Create your event or post",
    body: tourStack(
      tourMiniBlock(
        tourBrand("Event"),
        <>
          Add a date to your post so it can be{" "}
          {tourItalic(tourStrong("discoverable by time"))}.
        </>
      ),
      tourMiniBlock(
        tourStrong("Post"),
        <>
          Share {tourStrong("places")}, {tourStrong("ideas")},{" "}
          {tourStrong("plans")}, itineraries, questions, or anything else.
        </>
      )
    ),
  },
];

export function homeTourTargetSelector(target: HomeTourTargetId): string {
  return `[data-tour-target="${target}"]`;
}
