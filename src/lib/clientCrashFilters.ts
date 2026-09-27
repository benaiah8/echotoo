function errorName(err: unknown): string {
  if (err instanceof Error && err.name) return err.name;
  if (err && typeof err === "object" && "name" in err) {
    const n = (err as { name?: unknown }).name;
    if (typeof n === "string") return n;
  }
  return "";
}

function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message ?? "";
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

function errorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err) {
    const c = (err as { code?: unknown }).code;
    if (typeof c === "string" || typeof c === "number") return String(c);
  }
  return "";
}

/**
 * Operational failures that must not be treated as app/code crashes.
 * React ErrorBoundary TypeError/ReferenceError typically return false.
 */
export function isIgnorableOperationalError(err: unknown): boolean {
  const name = errorName(err);
  const message = errorMessage(err);
  const combined = `${name} ${message}`.toLowerCase();
  const code = errorCode(err);

  if (name === "AbortError") return true;
  if (name === "ChunkLoadError") return true;
  if (
    name === "AuthApiError" ||
    name === "AuthRetryableFetchError" ||
    name === "AuthSessionMissingError" ||
    name === "AuthWeakPasswordError"
  ) {
    return true;
  }

  if (
    /failed to fetch|networkerror|load failed|network request failed/.test(
      combined
    )
  ) {
    return true;
  }
  if (/\boffline\b|internet connection appears to be offline/.test(combined)) {
    return true;
  }
  if (
    /loading chunk|dynamically imported module|importing a module script failed/.test(
      combined
    )
  ) {
    return true;
  }

  if (/^PGRST/i.test(code)) return true;
  if (/^(22|23|42)/.test(code)) return true;
  if (code === "401" || code === "403" || code === "42501" || code === "P0001") {
    return true;
  }

  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status?: unknown }).status)
      : NaN;
  if (status === 401 || status === 403 || status === 429) return true;

  return false;
}
