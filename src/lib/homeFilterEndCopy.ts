import {
  tomorrowSecondaryDateFilter,
  type HomeDateFilter,
  type HomeFilterAction,
  type HomeViewMode,
} from "./homeVerticalFilters";

export type HomeFilterEndVariant = "zero" | "exhausted";

export type HomeFilterEndCopyInput = {
  dateFilter: HomeDateFilter;
  viewMode: HomeViewMode;
  friendsFilter: boolean;
  variant: HomeFilterEndVariant;
  now?: Date;
  /** Non-empty posts search query — takes priority over filter-only zero copy. */
  searchActive?: boolean;
};

export type HomeFilterEndCopy = {
  heading: string;
  createPrompt: string;
  primaryLabel: string;
  secondaryLabel: string;
  tertiaryLabel: string;
  secondaryAction: HomeFilterAction;
};

const TERTIARY = "Back to Feed";
const CREATE = "Create";
const PROMPT_DATE_EVENTS = "Want to post something others can join?";
const PROMPT_POSTS = "Have something worth sharing? Create one.";
const PROMPT_FRIENDS = "Want to post something with friends?";
const PROMPT_SEARCH_FILTERS =
  "Try adjusting filters, or search for people below.";

export function getHomeSearchPostsEmptyHeading(hasContentFilters: boolean): string {
  return hasContentFilters
    ? "No posts match your search and filters."
    : "No posts match your search.";
}

function dateWindowPhrase(dateFilter: Exclude<HomeDateFilter, "none">): string {
  switch (dateFilter) {
    case "today":
      return "today";
    case "tomorrow":
      return "tomorrow";
    case "this_week":
      return "this week";
    case "this_weekend":
      return "this weekend";
    case "next_week":
      return "next week";
  }
}

function dateBaseCopy(
  dateFilter: Exclude<HomeDateFilter, "none">,
  now: Date
): Omit<HomeFilterEndCopy, "heading"> & { headingZero: string; headingExhausted: string } {
  const weekendOrNext = tomorrowSecondaryDateFilter(now);
  const tomorrowSecondary: {
    label: string;
    action: HomeFilterAction;
  } =
    weekendOrNext === "this_weekend"
      ? {
          label: "See this weekend",
          action: { type: "selectDate", target: "this_weekend" },
        }
      : {
          label: "See next week",
          action: { type: "selectDate", target: "next_week" },
        };

  switch (dateFilter) {
    case "today":
      return {
        headingZero: "Nothing happening today yet",
        headingExhausted: "That's all for today",
        createPrompt: PROMPT_DATE_EVENTS,
        primaryLabel: CREATE,
        secondaryLabel: "See tomorrow",
        tertiaryLabel: TERTIARY,
        secondaryAction: { type: "selectDate", target: "tomorrow" },
      };
    case "tomorrow":
      return {
        headingZero: "Nothing planned for tomorrow yet",
        headingExhausted: "That's all for tomorrow",
        createPrompt: PROMPT_DATE_EVENTS,
        primaryLabel: CREATE,
        secondaryLabel: tomorrowSecondary.label,
        tertiaryLabel: TERTIARY,
        secondaryAction: tomorrowSecondary.action,
      };
    case "this_week":
      return {
        headingZero: "Nothing else this week yet",
        headingExhausted: "That's all for this week",
        createPrompt: PROMPT_DATE_EVENTS,
        primaryLabel: CREATE,
        secondaryLabel: "See next week",
        tertiaryLabel: TERTIARY,
        secondaryAction: { type: "selectDate", target: "next_week" },
      };
    case "this_weekend":
      return {
        headingZero: "Nothing planned this weekend yet",
        headingExhausted: "That's all for this weekend",
        createPrompt: PROMPT_DATE_EVENTS,
        primaryLabel: CREATE,
        secondaryLabel: "See next week",
        tertiaryLabel: TERTIARY,
        secondaryAction: { type: "selectDate", target: "next_week" },
      };
    case "next_week":
      return {
        headingZero: "Nothing planned for next week yet",
        headingExhausted: "That's all for next week",
        createPrompt: PROMPT_DATE_EVENTS,
        primaryLabel: CREATE,
        secondaryLabel: "See all events",
        tertiaryLabel: TERTIARY,
        secondaryAction: { type: "selectEvents" },
      };
  }
}

function eventsBaseCopy(): Omit<HomeFilterEndCopy, "heading"> & {
  headingZero: string;
  headingExhausted: string;
} {
  return {
    headingZero: "No events found.",
    headingExhausted: "That's all the events for now",
    createPrompt: PROMPT_DATE_EVENTS,
    primaryLabel: CREATE,
    secondaryLabel: "Explore posts",
    tertiaryLabel: TERTIARY,
    secondaryAction: { type: "selectPlaces" },
  };
}

function placesBaseCopy(): Omit<HomeFilterEndCopy, "heading"> & {
  headingZero: string;
  headingExhausted: string;
} {
  return {
    headingZero: "No posts found.",
    headingExhausted: "That's all the posts for now",
    createPrompt: PROMPT_POSTS,
    primaryLabel: CREATE,
    secondaryLabel: "See events",
    tertiaryLabel: TERTIARY,
    secondaryAction: { type: "selectEvents" },
  };
}

function friendsOnlyBaseCopy(): Omit<HomeFilterEndCopy, "heading"> & {
  headingZero: string;
  headingExhausted: string;
} {
  return {
    headingZero: "Nothing from friends yet",
    headingExhausted: "You're caught up with friends",
    createPrompt: PROMPT_FRIENDS,
    primaryLabel: CREATE,
    secondaryLabel: "Explore events",
    tertiaryLabel: TERTIARY,
    secondaryAction: { type: "selectEvents" },
  };
}

function combinedDateHeading(
  dateFilter: Exclude<HomeDateFilter, "none">,
  variant: HomeFilterEndVariant
): string {
  const window = dateWindowPhrase(dateFilter);
  return variant === "zero"
    ? `Nothing from friends ${window} yet`
    : `That's all from friends ${window}`;
}

function hasContentFilters(input: HomeFilterEndCopyInput): boolean {
  return (
    input.dateFilter !== "none" ||
    input.viewMode !== "all" ||
    input.friendsFilter
  );
}

export function getHomeFilterEndCopy(
  input: HomeFilterEndCopyInput
): HomeFilterEndCopy {
  const now = input.now ?? new Date();
  const headingOf = (
    base: { headingZero: string; headingExhausted: string },
    combined?: string
  ) =>
    combined ??
    (input.variant === "zero" ? base.headingZero : base.headingExhausted);

  // Search query wins for zero-result headings (not exhausted / not loading).
  if (input.searchActive && input.variant === "zero") {
    const base =
      input.dateFilter !== "none"
        ? dateBaseCopy(input.dateFilter, now)
        : input.viewMode === "hangouts"
          ? eventsBaseCopy()
          : input.viewMode === "experiences"
            ? placesBaseCopy()
            : friendsOnlyBaseCopy();
    return {
      heading: getHomeSearchPostsEmptyHeading(hasContentFilters(input)),
      createPrompt: PROMPT_SEARCH_FILTERS,
      primaryLabel: base.primaryLabel,
      secondaryLabel: base.secondaryLabel,
      tertiaryLabel: base.tertiaryLabel,
      secondaryAction: base.secondaryAction,
    };
  }

  if (input.dateFilter !== "none") {
    const base = dateBaseCopy(input.dateFilter, now);
    return {
      heading: headingOf(
        base,
        input.friendsFilter
          ? combinedDateHeading(input.dateFilter, input.variant)
          : undefined
      ),
      createPrompt: base.createPrompt,
      primaryLabel: base.primaryLabel,
      secondaryLabel: base.secondaryLabel,
      tertiaryLabel: base.tertiaryLabel,
      secondaryAction: base.secondaryAction,
    };
  }

  if (input.viewMode === "hangouts") {
    const base = eventsBaseCopy();
    const combined =
      input.friendsFilter
        ? input.variant === "zero"
          ? "No events from friends yet"
          : "That's all the events from friends"
        : undefined;
    return {
      heading: headingOf(base, combined),
      createPrompt: base.createPrompt,
      primaryLabel: base.primaryLabel,
      secondaryLabel: base.secondaryLabel,
      tertiaryLabel: base.tertiaryLabel,
      secondaryAction: base.secondaryAction,
    };
  }

  if (input.viewMode === "experiences") {
    const base = placesBaseCopy();
    const combined =
      input.friendsFilter
        ? input.variant === "zero"
          ? "No posts from friends yet"
          : "That's all the posts from friends"
        : undefined;
    return {
      heading: headingOf(base, combined),
      createPrompt: base.createPrompt,
      primaryLabel: base.primaryLabel,
      secondaryLabel: base.secondaryLabel,
      tertiaryLabel: base.tertiaryLabel,
      secondaryAction: base.secondaryAction,
    };
  }

  const base = friendsOnlyBaseCopy();
  return {
    heading: headingOf(base),
    createPrompt: base.createPrompt,
    primaryLabel: base.primaryLabel,
    secondaryLabel: base.secondaryLabel,
    tertiaryLabel: base.tertiaryLabel,
    secondaryAction: base.secondaryAction,
  };
}
