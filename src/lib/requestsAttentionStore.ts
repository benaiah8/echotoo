/**
 * Bottom-tab attention for actionable requests.
 * The Messages inbox writes it. The tab only reads the boolean.
 */
import { useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
let attention = false;
let ownerUserId: string | null = null;

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getHasRequestAttention(): boolean {
  return attention;
}

export function useHasRequestAttention(): boolean {
  return useSyncExternalStore(
    subscribe,
    getHasRequestAttention,
    () => false
  );
}

export function setRequestsAttention(userId: string, next: boolean): void {
  const id = userId.trim();
  if (!id) return;
  const value = next === true;
  if (ownerUserId === id && attention === value) return;
  ownerUserId = id;
  attention = value;
  emit();
}

export function clearRequestsAttention(): void {
  if (!attention && ownerUserId == null) return;
  ownerUserId = null;
  attention = false;
  emit();
}
