/**
 * Presentation-only freeze of multi-media shared aspect ratio (PV3.6).
 * Does not mutate publishedMediaCache / PublishedMediaItem objects.
 *
 * `policy: "stable-list"` (Feed/Profile/Detail multi): lock the first established
 * ratio (known video dims, else provisional 1:1). Late image/video samples must
 * not resize the shell. Create and single-image paths do not use this policy.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublishedMediaItem } from "./types";
import {
  isUsablePublishedImageNaturalSize,
  publishedMediaMembershipSignature,
  resolvePublishedMultiMediaFrame,
  formatPublishedAspectRatioCss,
  PUBLISHED_MULTI_MIN_HEIGHT,
  PUBLISHED_MULTI_PROVISIONAL_ASPECT,
  type PublishedImageAspectSample,
} from "./resolvePublishedMultiMediaFrame";

export type PublishedMultiMediaFramePolicy = "default" | "stable-list";

export type UsePublishedMultiMediaFrameOptions = {
  policy?: PublishedMultiMediaFramePolicy;
  /**
   * List cards only: treat as multi-frame even when `items.length === 1`
   * (e.g. Feed `image_count > 1` before full gallery hydrates).
   */
  forceMulti?: boolean;
};

export function isPublishedMediaMembershipExpansion(
  prevSig: string,
  nextSig: string,
): boolean {
  const prevKeys = prevSig ? prevSig.split("\0").filter(Boolean) : [];
  const nextKeys = nextSig ? nextSig.split("\0").filter(Boolean) : [];
  if (prevKeys.length === 0 || nextKeys.length < prevKeys.length) return false;
  return prevKeys.every((k) => nextKeys.includes(k));
}

function isMembershipExpansion(prevSig: string, nextSig: string): boolean {
  return isPublishedMediaMembershipExpansion(prevSig, nextSig);
}

export function usePublishedMultiMediaFrame(
  items: readonly PublishedMediaItem[],
  options?: UsePublishedMultiMediaFrameOptions,
) {
  const policy = options?.policy ?? "default";
  const forceMulti = options?.forceMulti === true;
  const membership = useMemo(
    () => publishedMediaMembershipSignature(items),
    [items],
  );
  const [committedAspectRatio, setCommittedAspectRatio] = useState<
    number | null
  >(null);
  const [samplesByKey, setSamplesByKey] = useState<
    Record<string, PublishedImageAspectSample>
  >({});
  const membershipRef = useRef(membership);
  const committedRef = useRef<number | null>(null);

  useEffect(() => {
    committedRef.current = committedAspectRatio;
  }, [committedAspectRatio]);

  useEffect(() => {
    if (membershipRef.current === membership) return;
    const prevMembership = membershipRef.current;
    membershipRef.current = membership;

    // stable-list: keep locked ratio when gallery expands (1→N hydration).
    if (
      policy === "stable-list" &&
      committedRef.current != null &&
      isMembershipExpansion(prevMembership, membership)
    ) {
      setSamplesByKey({});
      return;
    }

    setCommittedAspectRatio(null);
    setSamplesByKey({});
  }, [membership, policy]);

  const reportImageNaturalSize = useCallback(
    (key: string, width: number, height: number) => {
      // List cards: natural sizes may still warm ProgressiveImage cache callers,
      // but must not drive shell geometry after lock (samples ignored once committed).
      if (!isUsablePublishedImageNaturalSize(width, height)) return;
      setSamplesByKey((prev) => {
        const existing = prev[key];
        if (
          existing &&
          existing.width === width &&
          existing.height === height
        ) {
          return prev;
        }
        return {
          ...prev,
          [key]: { key, width, height },
        };
      });
    },
    [],
  );

  const samples = useMemo(
    () => Object.values(samplesByKey),
    [samplesByKey],
  );

  const resolved = useMemo(() => {
    const multi =
      items.length > 1 || (forceMulti && policy === "stable-list");
    if (!multi) {
      return null;
    }
    if (items.length <= 1 && forceMulti && policy === "stable-list") {
      const committed =
        typeof committedAspectRatio === "number" &&
        Number.isFinite(committedAspectRatio) &&
        committedAspectRatio > 0
          ? committedAspectRatio
          : null;
      const aspectRatio = committed ?? PUBLISHED_MULTI_PROVISIONAL_ASPECT;
      return {
        style: {
          width: "100%",
          aspectRatio: formatPublishedAspectRatioCss(aspectRatio),
          height: "auto",
          minHeight: PUBLISHED_MULTI_MIN_HEIGHT,
        },
        aspectRatio,
        source:
          committed != null
            ? ("committed" as const)
            : ("provisional" as const),
        shouldCommit: committed == null,
      };
    }
    if (policy === "stable-list") {
      // Ignore late image samples for list geometry — only video dims in items
      // (synchronous) or provisional 1:1, then freeze.
      return resolvePublishedMultiMediaFrame({
        items,
        imageAspectSamples: [],
        committedAspectRatio,
      });
    }
    return resolvePublishedMultiMediaFrame({
      items,
      imageAspectSamples: samples,
      committedAspectRatio,
    });
  }, [items, samples, committedAspectRatio, policy, forceMulti]);

  useEffect(() => {
    if (!resolved) return;
    if (policy === "stable-list") {
      // Lock on first establishment (video dims or provisional 1:1).
      setCommittedAspectRatio((prev) =>
        prev == null ? resolved.aspectRatio : prev,
      );
      return;
    }
    if (!resolved.shouldCommit) return;
    setCommittedAspectRatio((prev) =>
      prev == null ? resolved.aspectRatio : prev,
    );
  }, [resolved, policy]);

  return {
    multiAspectRatio: resolved?.aspectRatio ?? null,
    multiFrameStyle: resolved?.style ?? null,
    multiFrameSource: resolved?.source ?? null,
    reportImageNaturalSize,
  };
}
