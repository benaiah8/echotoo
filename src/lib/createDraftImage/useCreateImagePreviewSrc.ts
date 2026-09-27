/**
 * Resolve display src for Create finalize image thumbs/hero.
 * Local draft sentinels → resolveDraftImagePreview; remote → imgUrlPublic.
 */

import { useEffect, useState } from "react";
import { imgUrlPublic } from "../img";
import { readDraftImagesMeta } from "./draftImageMeta";
import { resolveDraftImagePreview } from "./index";
import {
  isLocalDraftImageUrl,
  localIdFromLocalDraftImageUrl,
} from "./localDraftImageUrl";

/**
 * Session preview for a mediaOrder / gallery image url.
 * Never persists the returned object URL.
 */
export function useCreateImagePreviewSrc(
  url: string,
  clientId?: string,
): string | undefined {
  const isLocal = isLocalDraftImageUrl(url);
  const [src, setSrc] = useState<string | undefined>(() =>
    isLocal ? undefined : imgUrlPublic(url),
  );

  useEffect(() => {
    if (!isLocal) {
      setSrc(imgUrlPublic(url));
      return;
    }

    const id =
      (clientId && clientId.trim()) ||
      localIdFromLocalDraftImageUrl(url) ||
      "";
    if (!id) {
      setSrc(undefined);
      return;
    }

    const draft = readDraftImagesMeta().find((img) => img.localId === id);
    if (!draft) {
      setSrc(undefined);
      return;
    }

    let cancelled = false;
    void resolveDraftImagePreview(draft).then((result) => {
      if (cancelled) return;
      setSrc(result.url ?? undefined);
    });

    return () => {
      cancelled = true;
    };
  }, [url, clientId, isLocal]);

  return src;
}
