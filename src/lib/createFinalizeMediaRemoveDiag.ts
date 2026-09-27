/**
 * DEV-only media-remove diagnostics (PASS LI1D.4).
 * Prefix: [echotoo media remove]
 * Temporary — do not use for production behavior.
 */

import type { DraftMediaOrderItem } from "./createDraftMediaOrder";
import {
  isLocalDraftImageUrl,
  localIdFromLocalDraftImageUrl,
} from "./createDraftImage/localDraftImageUrl";

const PREFIX = "[echotoo media remove]";

export function isMediaRemoveDiagEnabled(): boolean {
  return Boolean(import.meta.env.DEV);
}

export function mediaRemoveDiag(
  event: string,
  payload?: Record<string, unknown>,
): void {
  if (!isMediaRemoveDiagEnabled()) return;
  const t =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? Math.round(performance.now() * 100) / 100
      : Date.now();
  if (payload) {
    console.log(`${PREFIX} ${event}`, { t, ...payload });
  } else {
    console.log(`${PREFIX} ${event}`, { t });
  }
}

export type MediaRemoveUrlType = "local-sentinel" | "remote" | "video" | "other";

export function compactMediaOrderUrlType(
  item: DraftMediaOrderItem,
): MediaRemoveUrlType {
  if (item.kind === "video") return "video";
  if (isLocalDraftImageUrl(item.url)) return "local-sentinel";
  if (
    item.url.startsWith("blob:") ||
    item.url.startsWith("data:") ||
    item.url.startsWith("capacitor:") ||
    item.url.startsWith("file:")
  ) {
    return "other";
  }
  return "remote";
}

export function compactMediaOrderForDiag(order: DraftMediaOrderItem[]) {
  return order.map((item) => ({
    kind: item.kind,
    clientId: item.clientId,
    urlType: compactMediaOrderUrlType(item),
  }));
}

export function compactLocalSentinelIdsFromImages(
  images: string[] | null | undefined,
): string[] {
  const out: string[] = [];
  for (const raw of images ?? []) {
    const url = String(raw ?? "").trim();
    if (!isLocalDraftImageUrl(url)) continue;
    const id = localIdFromLocalDraftImageUrl(url);
    if (id) out.push(id);
  }
  return out;
}

export function targetDiagSnapshot(target: EventTarget | null): {
  targetTag: string | null;
  targetDataset: Record<string, string> | null;
} {
  if (!(target && typeof (target as Element).tagName === "string")) {
    return { targetTag: null, targetDataset: null };
  }
  const el = target as HTMLElement;
  const dataset: Record<string, string> = {};
  try {
    if (el.dataset) {
      for (const key of Object.keys(el.dataset)) {
        const v = el.dataset[key];
        if (typeof v === "string") dataset[key] = v;
      }
    }
  } catch {
    /* ignore */
  }
  return {
    targetTag: el.tagName?.toLowerCase?.() ?? null,
    targetDataset: Object.keys(dataset).length ? dataset : null,
  };
}
