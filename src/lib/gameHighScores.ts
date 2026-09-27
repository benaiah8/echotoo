// Lightweight localStorage-backed high-score cache for owl mini-games.
// Same try/catch + in-memory fallback pattern as owlMessagesStorage.ts.

export type GameId = "nightWatch" | "whackAnOwl" | "owlFlap";

const PREFIX = "echotoo_game_score_";
const memoryFallback: Partial<Record<GameId, number>> = {};

export function getHighScore(id: GameId): number {
  try {
    const raw = localStorage.getItem(PREFIX + id);
    return raw ? Number(raw) || 0 : (memoryFallback[id] ?? 0);
  } catch {
    return memoryFallback[id] ?? 0;
  }
}

export function setHighScoreIfBetter(id: GameId, score: number): boolean {
  if (score <= getHighScore(id)) return false;
  memoryFallback[id] = score;
  try {
    localStorage.setItem(PREFIX + id, String(score));
  } catch {
    /* memoryFallback still holds latest */
  }
  return true;
}
