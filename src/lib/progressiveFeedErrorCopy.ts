/**
 * Presentation-only copy for ProgressiveFeed / hangout-rail error surfaces.
 * Does not affect loading, cache, retries, or request ownership.
 */

export type ProgressiveFeedErrorKind =
  | "offline"
  | "network"
  | "aborted"
  | "auth"
  | "server"
  | "generic";

export type ProgressiveFeedErrorSurface = "default" | "home" | "events";

const NETWORK_MESSAGE =
  /failed to fetch|networkerror|load failed|network request failed|network error/;

function readName(error: unknown): string {
  if (error instanceof Error && error.name) return error.name;
  if (error && typeof error === "object" && "name" in error) {
    const name = (error as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return "";
}

function readMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message ?? "";
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

function readCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "";
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" || typeof code === "number") return String(code);
  return "";
}

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const record = error as { status?: unknown; statusCode?: unknown };
  if (typeof record.status === "number" && Number.isFinite(record.status)) {
    return record.status;
  }
  if (
    typeof record.statusCode === "number" &&
    Number.isFinite(record.statusCode)
  ) {
    return record.statusCode;
  }
  return null;
}

/**
 * Request-manager and feed cancellation signals.
 * TimeoutError is a real failure and is not treated as cancellation.
 */
export function isIntentionalFeedAbort(error: unknown): boolean {
  if (readName(error) === "TimeoutError") return false;
  if (readName(error) === "AbortError") return true;
  const message = readMessage(error).trim();
  return message === "Aborted" || message === "Request aborted";
}

/**
 * Hide an intentional abort only when this request no longer owns the surface.
 */
export function shouldSurfaceFeedLoadError(
  error: unknown,
  ownership: { superseded: boolean; cancelled: boolean },
): boolean {
  if (
    isIntentionalFeedAbort(error) &&
    (ownership.superseded || ownership.cancelled)
  ) {
    return false;
  }
  return true;
}

export function classifyProgressiveFeedError(
  error: unknown,
  options?: { isOffline?: boolean },
): ProgressiveFeedErrorKind {
  if (isIntentionalFeedAbort(error)) return "aborted";

  const status = readStatus(error);
  const code = readCode(error);
  const name = readName(error);

  if (
    status === 401 ||
    status === 403 ||
    code === "401" ||
    code === "403" ||
    code === "42501" ||
    code === "PGRST301" ||
    code === "PGRST302" ||
    name === "AuthApiError" ||
    name === "AuthSessionMissingError"
  ) {
    return "auth";
  }

  if (
    (status != null && status >= 500 && status < 600) ||
    /^5\d\d$/.test(code)
  ) {
    return "server";
  }

  if (options?.isOffline) return "offline";

  const combined = `${name} ${readMessage(error)}`.toLowerCase();
  if (NETWORK_MESSAGE.test(combined)) return "network";

  return "generic";
}

function homeEmptyCopy(kind: ProgressiveFeedErrorKind): {
  title: string;
  body: string;
} {
  switch (kind) {
    case "offline":
      return {
        title: "You're offline",
        body: "Reconnect and try again.",
      };
    case "network":
      return {
        title: "We couldn't connect",
        body: "Check your connection and try again.",
      };
    case "server":
      return {
        title: "We couldn't load posts right now",
        body: "Please try again in a moment.",
      };
    case "aborted":
    case "auth":
    case "generic":
    default:
      return {
        title: "We couldn't load posts right now",
        body: "Please try again.",
      };
  }
}

function eventsEmptyCopy(kind: ProgressiveFeedErrorKind): {
  title: string;
  body: string;
} {
  if (kind === "offline") {
    return {
      title: "Couldn't load events",
      body: "Reconnect and try again.",
    };
  }
  if (kind === "network") {
    return {
      title: "Couldn't load events",
      body: "Check your connection and try again.",
    };
  }
  return {
    title: "Couldn't load events",
    body: "Try again.",
  };
}

export function getProgressiveFeedErrorCopy(options: {
  hasItems: boolean;
  isOffline?: boolean;
  error?: unknown;
  surface?: ProgressiveFeedErrorSurface;
}): { title: string; body: string } {
  if (options.hasItems) {
    if (options.isOffline) {
      return {
        title: "You're offline",
        body: "Showing saved posts. Check your connection when you're back online.",
      };
    }
    return {
      title: "Couldn't refresh posts",
      body: "You're seeing saved posts. Check your connection and try again.",
    };
  }

  const surface = options.surface ?? "default";
  if (surface === "default") {
    return {
      title: "We couldn't load posts right now",
      body: "Check your connection and try again.",
    };
  }

  const kind = classifyProgressiveFeedError(options.error, {
    isOffline: options.isOffline,
  });
  if (surface === "events") return eventsEmptyCopy(kind);
  return homeEmptyCopy(kind);
}

/** Read-only online check for error copy; no listeners. */
export function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
