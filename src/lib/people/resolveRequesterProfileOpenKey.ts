/**
 * Resolve OtherProfilePage open key for request-drawer profile preview.
 * Never invents a username from display_name.
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

function normalizeUsername(raw: string | null | undefined): string | null {
  const u = raw?.trim() ?? "";
  if (!u) return null;
  return u.startsWith("@") ? u.slice(1) : u;
}

/** Open Plan: gated profile_open_key from list RPC (username or user_id). */
export function resolveOpenPlanRequesterProfileOpenKey(request: {
  profile_open_key: string | null;
}): string | null {
  const key = request.profile_open_key?.trim() ?? "";
  if (!key) return null;
  if (UUID_RE.test(key)) return key;
  return normalizeUsername(key);
}

/** Group Up: prefer username, else requester_user_id UUID. */
export function resolveGroupUpRequesterProfileOpenKey(request: {
  username: string | null;
  requester_user_id: string;
}): string | null {
  const username = normalizeUsername(request.username);
  if (username) return username;
  const id = request.requester_user_id?.trim() ?? "";
  if (UUID_RE.test(id)) return id;
  return null;
}
