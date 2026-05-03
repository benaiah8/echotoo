import {
  OWL_MESSAGE_LIST_VERSION,
  OWL_MESSAGES,
  type OwlMessage,
} from "./owlMessages";

const STORAGE_KEY = "echotoo_owl_messages_state";

export type OwlMessagesPersisted = {
  version: number;
  /** Permutation of indices `0 .. messageCount-1` into {@link OWL_MESSAGES}. */
  order: number[];
  /** Cursor into `order`; displayed line is `messages[order[index]]`. */
  index: number;
};

let memoryFallback: OwlMessagesPersisted | null = null;

function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = t;
  }
  return arr;
}

function isValidOrder(order: unknown, n: number): order is number[] {
  if (!Array.isArray(order) || order.length !== n) return false;
  const seen = new Set<number>();
  for (const x of order) {
    if (typeof x !== "number" || x < 0 || x >= n || Math.floor(x) !== x)
      return false;
    if (seen.has(x)) return false;
    seen.add(x);
  }
  return seen.size === n;
}

function createFreshState(
  listVersion: number,
  messageCount: number
): OwlMessagesPersisted {
  if (messageCount <= 0) {
    return { version: listVersion, order: [], index: 0 };
  }
  return {
    version: listVersion,
    order: shuffleIndices(messageCount),
    index: 0,
  };
}

function parseStored(
  raw: string | null,
  listVersion: number,
  messageCount: number
): OwlMessagesPersisted | null {
  if (raw == null) return null;
  try {
    const p = JSON.parse(raw) as Partial<OwlMessagesPersisted>;
    if (
      typeof p.version !== "number" ||
      !Array.isArray(p.order) ||
      typeof p.index !== "number"
    ) {
      return null;
    }
    if (p.version !== listVersion) return null;
    if (!isValidOrder(p.order, messageCount)) return null;
    if (messageCount === 0) {
      return { version: listVersion, order: [], index: 0 };
    }
    if (p.index < 0 || p.index >= messageCount) return null;
    return {
      version: p.version,
      order: p.order,
      index: p.index,
    };
  } catch {
    return null;
  }
}

/**
 * Load persisted shuffle + cursor, or create and store a new shuffle.
 * Safe when localStorage is unavailable (in-memory fallback for the session).
 */
export function loadOwlMessagesState(
  listVersion: number = OWL_MESSAGE_LIST_VERSION,
  messageCount: number = OWL_MESSAGES.length
): OwlMessagesPersisted {
  if (messageCount <= 0) {
    const empty = createFreshState(listVersion, 0);
    saveOwlMessagesState(empty);
    return empty;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = parseStored(raw, listVersion, messageCount);
    if (parsed) {
      memoryFallback = parsed;
      return parsed;
    }
  } catch {
    /* fall through */
  }

  if (
    memoryFallback &&
    memoryFallback.version === listVersion &&
    isValidOrder(memoryFallback.order, messageCount)
  ) {
    if (memoryFallback.index >= 0 && memoryFallback.index < messageCount) {
      return memoryFallback;
    }
  }

  const fresh = createFreshState(listVersion, messageCount);
  saveOwlMessagesState(fresh);
  return fresh;
}

export function saveOwlMessagesState(state: OwlMessagesPersisted): void {
  memoryFallback = state;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* memoryFallback still holds latest */
  }
}

/** Current entry while modal is open (no advance). */
export function getCurrentOwlMessageEntry(
  state: OwlMessagesPersisted,
  messages: readonly OwlMessage[] = OWL_MESSAGES
): OwlMessage | null {
  if (!state.order.length) return null;
  const pos = Math.min(state.index, state.order.length - 1);
  const mi = state.order[pos];
  if (mi === undefined) return null;
  const row = messages[mi];
  return row ?? null;
}

/** Line shown while modal is open (no advance). */
export function getCurrentOwlMessage(
  state: OwlMessagesPersisted,
  messages: readonly OwlMessage[] = OWL_MESSAGES
): string {
  return getCurrentOwlMessageEntry(state, messages)?.text ?? "";
}

/** After dismiss: next line in shuffle; wraps. Persists. */
export function advanceOwlMessageAfterClose(
  state: OwlMessagesPersisted
): OwlMessagesPersisted {
  if (state.order.length === 0) {
    return state;
  }
  const len = state.order.length;
  const next: OwlMessagesPersisted = {
    ...state,
    index: (state.index + 1) % len,
  };
  saveOwlMessagesState(next);
  return next;
}
