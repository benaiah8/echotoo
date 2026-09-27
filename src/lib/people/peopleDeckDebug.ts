/**
 * DEV-only runtime recorder for People / Match Deck carousel diagnostics.
 * No-op in production builds.
 */

const IS_DEV = import.meta.env.DEV;

export type PeopleDebugEvent = {
  t: number;
  kind: string;
  data?: Record<string, unknown>;
};

const BUFFER_SIZE = 200;
const events: PeopleDebugEvent[] = [];

type RenderCounterKey =
  | "peoplePage"
  | "matchDeckOverlay"
  | "openPlanDeckBody"
  | "groupUpDeckBody"
  | "matchDeckCarousel";

const renderCounts: Record<RenderCounterKey, number> = {
  peoplePage: 0,
  matchDeckOverlay: 0,
  openPlanDeckBody: 0,
  groupUpDeckBody: 0,
  matchDeckCarousel: 0,
};

const lastRenderSignatures: Partial<
  Record<RenderCounterKey, Record<string, unknown>>
> = {};

let context: { mode?: string; deck?: string; scope?: string } = {};

export function peopleDebugSetContext(
  partial: Partial<typeof context>
): void {
  if (!IS_DEV) return;
  context = { ...context, ...partial };
}

export function peopleDebugRecord(
  kind: string,
  data?: Record<string, unknown>
): void {
  if (!IS_DEV) return;
  const payload =
    data && Object.keys(data).length > 0
      ? { ...context, ...data }
      : { ...context };
  events.push({
    t: performance.now(),
    kind,
    data: Object.keys(payload).length > 0 ? payload : undefined,
  });
  if (events.length > BUFFER_SIZE) events.shift();
}

export function peopleDebugBumpRender(
  component: RenderCounterKey,
  signature?: Record<string, unknown>
): void {
  if (!IS_DEV) return;
  renderCounts[component] += 1;
  if (signature) {
    lastRenderSignatures[component] = signature;
  }
}

export function peopleDebugGetRenderCount(
  component: RenderCounterKey
): number {
  if (!IS_DEV) return 0;
  return renderCounts[component];
}

export function peopleDebugItemsSignature(ids: readonly string[]): {
  len: number;
  head: string[];
  hash: number;
} {
  let hash = ids.length;
  for (const id of ids) {
    for (let i = 0; i < id.length; i += 1) {
      hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
  }
  return {
    len: ids.length,
    head: ids.slice(0, 3).map((id) => id.slice(0, 8)),
    hash,
  };
}

export type ItemsChangeKind =
  | "append"
  | "removal"
  | "replacement"
  | "reorder"
  | "unchanged";

export function peopleDebugClassifyItemsChange(
  prevIds: readonly string[],
  nextIds: readonly string[]
): {
  changeKind: ItemsChangeKind;
  orderChanged: boolean;
} {
  if (prevIds.length === nextIds.length) {
    const sameOrder = prevIds.every((id, i) => id === nextIds[i]);
    if (sameOrder) return { changeKind: "unchanged", orderChanged: false };
    return { changeKind: "reorder", orderChanged: true };
  }
  if (nextIds.length > prevIds.length) {
    const prefixSame = prevIds.every((id, i) => id === nextIds[i]);
    if (prefixSame) return { changeKind: "append", orderChanged: false };
  }
  if (nextIds.length < prevIds.length) {
    const allPrevInNext = prevIds.every((id) => nextIds.includes(id));
    if (allPrevInNext) return { changeKind: "removal", orderChanged: true };
  }
  return { changeKind: "replacement", orderChanged: true };
}

export function peopleDebugEmblaOptionsSignature(
  opts: Record<string, unknown>
): Record<string, unknown> {
  return {
    align: opts.align,
    loop: opts.loop,
    slidesToScroll: opts.slidesToScroll,
    dragFree: opts.dragFree,
    skipSnaps: opts.skipSnaps,
    containScroll: opts.containScroll,
    watchDrag: opts.watchDrag,
    watchResize: opts.watchResize ?? true,
    watchSlides: opts.watchSlides ?? true,
    startIndex: opts.startIndex,
  };
}

type EmblaLike = {
  selectedScrollSnap: () => number;
  on: (
    ev: "reInit" | "resize",
    cb: (...args: unknown[]) => void,
  ) => unknown;
  off: (
    ev: "reInit" | "resize",
    cb: (...args: unknown[]) => void,
  ) => unknown;
};

export function peopleDebugAttachEmbla(
  emblaApi: EmblaLike | undefined,
  getState: () => Record<string, unknown>
): () => void {
  if (!IS_DEV || !emblaApi) return () => {};

  let prevSnap = emblaApi.selectedScrollSnap();

  const onReInit = () => {
    peopleDebugRecord("embla:reInit", {
      ...getState(),
      selectedSnap: emblaApi.selectedScrollSnap(),
      prevSelectedSnap: prevSnap,
    });
    prevSnap = emblaApi.selectedScrollSnap();
  };

  const onResize = () => {
    peopleDebugRecord("embla:resize", {
      ...getState(),
      selectedSnap: emblaApi.selectedScrollSnap(),
    });
  };

  peopleDebugRecord("embla:init", {
    ...getState(),
    selectedSnap: prevSnap,
  });

  emblaApi.on("reInit", onReInit);
  emblaApi.on("resize", onResize);

  return () => {
    emblaApi.off("reInit", onReInit);
    emblaApi.off("resize", onResize);
    peopleDebugRecord("embla:destroy", getState());
  };
}

const THROTTLE_MS = 120;

export function peopleDebugThrottleKey(
  key: string,
  fn: () => void,
  ms = THROTTLE_MS
): void {
  if (!IS_DEV) return;
  const store = peopleDebugThrottleKey as typeof peopleDebugThrottleKey & {
    _last?: Map<string, number>;
  };
  if (!store._last) store._last = new Map();
  const now = performance.now();
  const last = store._last.get(key) ?? 0;
  if (now - last < ms) return;
  store._last.set(key, now);
  fn();
}

export function peopleDebugObserveHostResize(
  host: HTMLElement,
  label: string
): () => void {
  if (!IS_DEV) return () => {};
  let lastW = host.clientWidth;
  let lastH = host.clientHeight;
  const sync = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (w === lastW && h === lastH) return;
    const prev = { w: lastW, h: lastH };
    lastW = w;
    lastH = h;
    peopleDebugThrottleKey(`host:${label}`, () => {
      peopleDebugRecord("layout:hostResize", {
        label,
        fromW: prev.w,
        fromH: prev.h,
        toW: w,
        toH: h,
      });
    });
  };
  sync();
  const observer = new ResizeObserver(sync);
  observer.observe(host);
  return () => observer.disconnect();
}

export function peopleDebugObserveSlides(
  container: HTMLElement,
  opportunityIds: readonly string[]
): () => void {
  if (!IS_DEV) return () => {};
  const slides = container.querySelectorAll<HTMLElement>(
    "[data-people-slide-idx]"
  );
  const cleanups: (() => void)[] = [];

  slides.forEach((slide) => {
    const idxAttr = slide.getAttribute("data-people-slide-idx");
    const idx = idxAttr != null ? Number(idxAttr) : -1;
    const oid =
      idx >= 0 && idx < opportunityIds.length
        ? opportunityIds[idx]?.slice(0, 8)
        : "?";
    let lastW = slide.offsetWidth;
    let lastH = slide.offsetHeight;

    const sync = () => {
      const w = slide.offsetWidth;
      const h = slide.offsetHeight;
      if (w === lastW && h === lastH) return;
      const prev = { w: lastW, h: lastH };
      lastW = w;
      lastH = h;
      peopleDebugThrottleKey(`slide:${idx}:${oid}`, () => {
        peopleDebugRecord("layout:slideResize", {
          slideIndex: idx,
          opportunityHead: oid,
          fromW: prev.w,
          fromH: prev.h,
          toW: w,
          toH: h,
        });
      });
    };

    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(slide);
    cleanups.push(() => ro.disconnect());
  });

  return () => {
    for (const fn of cleanups) fn();
  };
}

export function peopleDebugObserveSlideImages(
  container: HTMLElement,
  opportunityIds: readonly string[]
): () => void {
  if (!IS_DEV) return () => {};
  const cleanups: (() => void)[] = [];
  const slides = container.querySelectorAll<HTMLElement>(
    "[data-people-slide-idx]"
  );

  slides.forEach((slide) => {
    const idxAttr = slide.getAttribute("data-people-slide-idx");
    const idx = idxAttr != null ? Number(idxAttr) : -1;
    const oid =
      idx >= 0 && idx < opportunityIds.length
        ? opportunityIds[idx]?.slice(0, 8)
        : "?";
    const imgs = slide.querySelectorAll("img");
    imgs.forEach((img) => {
      const recordLoad = (alreadyComplete: boolean) => {
        peopleDebugRecord("media:imageLoad", {
          slideIndex: idx,
          opportunityHead: oid,
          alreadyComplete,
          naturalW: img.naturalWidth || undefined,
          naturalH: img.naturalHeight || undefined,
        });
      };
      if (img.complete && img.naturalWidth > 0) {
        recordLoad(true);
        return;
      }
      const onLoad = () => recordLoad(false);
      img.addEventListener("load", onLoad, { once: true });
      cleanups.push(() => img.removeEventListener("load", onLoad));
    });
  });

  return () => {
    for (const fn of cleanups) fn();
  };
}

function findAnchorTime(
  anchor?: "last-settle" | "last-reinit" | "last-pointerDown" | number
): number | null {
  if (typeof anchor === "number") return anchor;
  const kind =
    anchor === "last-reinit"
      ? "embla:reInit"
      : anchor === "last-pointerDown"
        ? "embla:pointerDown"
        : "embla:settle";
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]?.kind === kind) return events[i]!.t;
  }
  return events.length > 0 ? events[events.length - 1]!.t : null;
}

function windowEvents(center: number, ms: number): PeopleDebugEvent[] {
  return events.filter((e) => Math.abs(e.t - center) <= ms);
}

function installWindowApi(): void {
  if (!IS_DEV || typeof window === "undefined") return;

  const api = {
    clear() {
      events.length = 0;
      (Object.keys(renderCounts) as RenderCounterKey[]).forEach((k) => {
        renderCounts[k] = 0;
      });
    },
    dump() {
      const rows = events.map((e, i) => ({
        i,
        t: Number(e.t.toFixed(1)),
        kind: e.kind,
        ...(e.data ?? {}),
      }));
      console.table(rows);
      return events.slice();
    },
    summary(
      anchor?: "last-settle" | "last-reinit" | "last-pointerDown" | number,
      windowMs = 500
    ) {
      const center = findAnchorTime(anchor);
      const out: Record<string, unknown> = {
        eventCount: events.length,
        renderCounts: { ...renderCounts },
        lastRenderSignatures: { ...lastRenderSignatures },
        context: { ...context },
      };

      if (center != null) {
        const win = windowEvents(center, windowMs);
        out.anchorTime = center;
        out.windowMs = windowMs;
        out.windowEventCount = win.length;
        out.windowEvents = win.map((e) => ({
          dt: Number((e.t - center).toFixed(1)),
          kind: e.kind,
          ...(e.data ?? {}),
        }));

        const suspicious = win.filter((e) =>
          /reInit|items:|fetch:|loadMore|hostResize|slideResize|mount|unmount|index:|currentOpportunityId/.test(
            e.kind
          )
        );
        out.suspiciousInWindow = suspicious.map((e) => ({
          dt: Number((e.t - center).toFixed(1)),
          kind: e.kind,
          ...(e.data ?? {}),
        }));
      }

      const recentSettles = events
        .filter((e) => e.kind === "embla:settle")
        .slice(-3);
      out.recentSettles = recentSettles.map((e) => ({
        t: e.t,
        ...(e.data ?? {}),
      }));

      console.log("[echoPeopleDebug] summary", out);
      return out;
    },
  };

  (
    window as Window & { __echoPeopleDebug?: typeof api }
  ).__echoPeopleDebug = api;
}

installWindowApi();
