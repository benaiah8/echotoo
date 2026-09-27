import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./storage/utils/capacitorDetection", () => ({
  isIOS: vi.fn(() => false),
  isNativeApp: vi.fn(() => false),
}));

type StyleBag = Record<string, string> & { cssText: string };

function createStyleBag(initial: Record<string, string> = {}): StyleBag {
  const store: Record<string, string> = { ...initial };
  return {
    get cssText() {
      return Object.entries(store)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; ");
    },
    set cssText(value: string) {
      for (const key of Object.keys(store)) delete store[key];
      if (!value.trim()) return;
      for (const part of value.split(";")) {
        const [rawKey, ...rest] = part.split(":");
        const key = rawKey?.trim();
        if (!key) continue;
        store[key] = rest.join(":").trim();
      }
    },
    get overflow() {
      return store.overflow ?? "";
    },
    set overflow(v: string) {
      store.overflow = v;
    },
    get overscrollBehavior() {
      return store.overscrollBehavior ?? "";
    },
    set overscrollBehavior(v: string) {
      store.overscrollBehavior = v;
    },
    get paddingRight() {
      return store.paddingRight ?? "";
    },
    set paddingRight(v: string) {
      store.paddingRight = v;
    },
    get position() {
      return store.position ?? "";
    },
    set position(v: string) {
      store.position = v;
    },
    get top() {
      return store.top ?? "";
    },
    set top(v: string) {
      store.top = v;
    },
    get left() {
      return store.left ?? "";
    },
    set left(v: string) {
      store.left = v;
    },
    get right() {
      return store.right ?? "";
    },
    set right(v: string) {
      store.right = v;
    },
    get width() {
      return store.width ?? "";
    },
    set width(v: string) {
      store.width = v;
    },
  } as StyleBag;
}

describe("backgroundScrollLock", () => {
  let htmlStyle: StyleBag;
  let bodyStyle: StyleBag;
  let scrollX = 0;
  let scrollY = 0;

  beforeEach(async () => {
    const cap = await import("./storage/utils/capacitorDetection");
    vi.mocked(cap.isIOS).mockReturnValue(false);
    vi.mocked(cap.isNativeApp).mockReturnValue(false);

    htmlStyle = createStyleBag();
    bodyStyle = createStyleBag({ overflow: "auto", paddingRight: "12px" });
    scrollX = 0;
    scrollY = 420;

    vi.stubGlobal("document", {
      documentElement: {
        style: htmlStyle,
        clientWidth: 1024,
        scrollHeight: 4000,
        offsetHeight: 4000,
      },
      body: {
        style: bodyStyle,
        scrollHeight: 4000,
        offsetHeight: 4000,
      },
    });
    vi.stubGlobal("window", {
      get scrollX() {
        return scrollX;
      },
      get scrollY() {
        return scrollY;
      },
      innerWidth: 1024,
      innerHeight: 800,
      scrollTo: (x: number, y: number) => {
        scrollX = x;
        scrollY = y;
      },
    });

    const mod = await import("./backgroundScrollLock");
    mod.__resetBackgroundScrollLockForTests();
  });

  afterEach(async () => {
    const mod = await import("./backgroundScrollLock");
    mod.__resetBackgroundScrollLockForTests();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("first acquire captures scroll and applies freeze", async () => {
    scrollY = 420;
    const {
      acquireBackgroundScrollLock,
      getBackgroundScrollLockOwnerCount,
      isBackgroundScrollLockActive,
    } = await import("./backgroundScrollLock");

    const release = acquireBackgroundScrollLock();
    expect(getBackgroundScrollLockOwnerCount()).toBe(1);
    expect(isBackgroundScrollLockActive()).toBe(true);
    expect(htmlStyle.overflow).toBe("hidden");
    expect(bodyStyle.overflow).toBe("hidden");
    expect(htmlStyle.overscrollBehavior).toBe("none");
    release();
  });

  it("second acquire does not re-snapshot; nested release keeps freeze", async () => {
    scrollY = 200;
    const {
      acquireBackgroundScrollLock,
      getBackgroundScrollLockOwnerCount,
      isBackgroundScrollLockActive,
    } = await import("./backgroundScrollLock");

    const releaseA = acquireBackgroundScrollLock();
    expect(bodyStyle.overflow).toBe("hidden");
    const releaseB = acquireBackgroundScrollLock();
    expect(getBackgroundScrollLockOwnerCount()).toBe(2);

    releaseB();
    expect(getBackgroundScrollLockOwnerCount()).toBe(1);
    expect(isBackgroundScrollLockActive()).toBe(true);
    expect(bodyStyle.overflow).toBe("hidden");

    releaseA();
    expect(getBackgroundScrollLockOwnerCount()).toBe(0);
    expect(bodyStyle.overflow).toBe("auto");
    expect(bodyStyle.paddingRight).toBe("12px");
  });

  it("nested first release does not restore; last release restores scroll", async () => {
    scrollY = 600;
    const { acquireBackgroundScrollLock, isBackgroundScrollLockActive } =
      await import("./backgroundScrollLock");

    const releaseA = acquireBackgroundScrollLock();
    const releaseB = acquireBackgroundScrollLock();
    releaseB();
    expect(isBackgroundScrollLockActive()).toBe(true);
    expect(bodyStyle.overflow).toBe("hidden");

    scrollY = 0;
    releaseA();
    expect(isBackgroundScrollLockActive()).toBe(false);
    expect(bodyStyle.overflow).toBe("auto");
    expect(bodyStyle.paddingRight).toBe("12px");
    expect(scrollY).toBe(600);
  });

  it("duplicate/late release is idempotent and cannot corrupt owner count", async () => {
    const {
      acquireBackgroundScrollLock,
      getBackgroundScrollLockOwnerCount,
      isBackgroundScrollLockActive,
    } = await import("./backgroundScrollLock");

    const release = acquireBackgroundScrollLock();
    release();
    release();
    release();
    expect(getBackgroundScrollLockOwnerCount()).toBe(0);
    expect(isBackgroundScrollLockActive()).toBe(false);
  });

  it("fresh acquire after final release creates a new snapshot", async () => {
    scrollY = 100;
    const { acquireBackgroundScrollLock } = await import(
      "./backgroundScrollLock"
    );

    const release1 = acquireBackgroundScrollLock();
    release1();

    bodyStyle.overflow = "visible";
    scrollY = 50;
    const release2 = acquireBackgroundScrollLock();
    expect(bodyStyle.overflow).toBe("hidden");
    release2();
    expect(bodyStyle.overflow).toBe("visible");
  });

  it("preserves pre-existing body styles on final unlock", async () => {
    bodyStyle.position = "relative";
    bodyStyle.top = "2px";
    const { acquireBackgroundScrollLock } = await import(
      "./backgroundScrollLock"
    );

    const release = acquireBackgroundScrollLock();
    expect(bodyStyle.overflow).toBe("hidden");
    release();
    expect(bodyStyle.position).toBe("relative");
    expect(bodyStyle.top).toBe("2px");
    expect(bodyStyle.overflow).toBe("auto");
  });

  it("page lock hides overflow without overlay extras or fixed body", async () => {
    bodyStyle.position = "relative";
    const { acquirePageScrollLock, isBackgroundScrollLockActive } =
      await import("./backgroundScrollLock");

    const release = acquirePageScrollLock();
    expect(isBackgroundScrollLockActive()).toBe(true);
    expect(htmlStyle.overflow).toBe("hidden");
    expect(bodyStyle.overflow).toBe("hidden");
    expect(htmlStyle.overscrollBehavior).toBe("");
    expect(bodyStyle.overscrollBehavior).toBe("");
    expect(bodyStyle.paddingRight).toBe("12px");
    expect(bodyStyle.position).toBe("relative");
    expect(bodyStyle.top).toBe("");
    release();
    expect(bodyStyle.overflow).toBe("auto");
    expect(bodyStyle.position).toBe("relative");
  });

  it("page then overlay upgrades extras; overlay release downgrades and keeps overflow locked", async () => {
    const {
      acquireBackgroundScrollLock,
      acquirePageScrollLock,
      getBackgroundScrollLockOwnerCount,
    } = await import("./backgroundScrollLock");

    const releasePage = acquirePageScrollLock();
    expect(htmlStyle.overscrollBehavior).toBe("");
    expect(bodyStyle.position).toBe("");

    const releaseOverlay = acquireBackgroundScrollLock();
    expect(getBackgroundScrollLockOwnerCount()).toBe(2);
    expect(htmlStyle.overflow).toBe("hidden");
    expect(htmlStyle.overscrollBehavior).toBe("none");
    expect(bodyStyle.overscrollBehavior).toBe("none");

    releaseOverlay();
    expect(getBackgroundScrollLockOwnerCount()).toBe(1);
    expect(htmlStyle.overflow).toBe("hidden");
    expect(bodyStyle.overflow).toBe("hidden");
    expect(htmlStyle.overscrollBehavior).toBe("");
    expect(bodyStyle.overscrollBehavior).toBe("");
    expect(bodyStyle.paddingRight).toBe("12px");
    expect(bodyStyle.position).toBe("");

    releasePage();
    expect(bodyStyle.overflow).toBe("auto");
  });

  it("releasing page first while overlay remains keeps full lock; overlay restore is original", async () => {
    bodyStyle.overflow = "auto";
    const {
      acquireBackgroundScrollLock,
      acquirePageScrollLock,
      isBackgroundScrollLockActive,
    } = await import("./backgroundScrollLock");

    const releasePage = acquirePageScrollLock();
    const releaseOverlay = acquireBackgroundScrollLock();
    expect(htmlStyle.overscrollBehavior).toBe("none");

    releasePage();
    expect(isBackgroundScrollLockActive()).toBe(true);
    expect(htmlStyle.overflow).toBe("hidden");
    expect(htmlStyle.overscrollBehavior).toBe("none");
    expect(bodyStyle.overflow).toBe("hidden");

    releaseOverlay();
    expect(isBackgroundScrollLockActive()).toBe(false);
    expect(bodyStyle.overflow).toBe("auto");
    expect(htmlStyle.overscrollBehavior).toBe("");
  });

  it("overlay then page: overlay close last restores original, not page intermediate", async () => {
    const { acquireBackgroundScrollLock, acquirePageScrollLock } = await import(
      "./backgroundScrollLock"
    );

    const releaseOverlay = acquireBackgroundScrollLock();
    const releasePage = acquirePageScrollLock();
    releasePage();
    expect(htmlStyle.overflow).toBe("hidden");
    expect(htmlStyle.overscrollBehavior).toBe("none");
    releaseOverlay();
    expect(bodyStyle.overflow).toBe("auto");
    expect(htmlStyle.overscrollBehavior).toBe("");
  });

  it("nested page tokens stay overflow-only until an overlay joins", async () => {
    const {
      acquirePageScrollLock,
      acquireBackgroundScrollLock,
      getBackgroundScrollLockOwnerCount,
    } = await import("./backgroundScrollLock");

    const a = acquirePageScrollLock();
    const b = acquirePageScrollLock();
    expect(getBackgroundScrollLockOwnerCount()).toBe(2);
    expect(htmlStyle.overscrollBehavior).toBe("");

    const overlay = acquireBackgroundScrollLock();
    expect(htmlStyle.overscrollBehavior).toBe("none");
    overlay();
    expect(htmlStyle.overscrollBehavior).toBe("");
    expect(htmlStyle.overflow).toBe("hidden");
    a();
    expect(htmlStyle.overflow).toBe("hidden");
    b();
    expect(htmlStyle.overflow).toBe("");
    expect(bodyStyle.overflow).toBe("auto");
  });

  it("native overlay applies fixed-body; page-only does not", async () => {
    const cap = await import("./storage/utils/capacitorDetection");
    vi.mocked(cap.isNativeApp).mockReturnValue(true);
    scrollY = 180;

    const { acquirePageScrollLock, acquireBackgroundScrollLock } = await import(
      "./backgroundScrollLock"
    );

    const releasePage = acquirePageScrollLock();
    expect(bodyStyle.position).toBe("");
    expect(bodyStyle.top).toBe("");

    const releaseOverlay = acquireBackgroundScrollLock();
    expect(bodyStyle.position).toBe("fixed");
    expect(bodyStyle.top).toBe("-180px");
    expect(bodyStyle.width).toBe("100%");

    releaseOverlay();
    expect(bodyStyle.position).toBe("");
    expect(bodyStyle.top).toBe("");
    expect(htmlStyle.overflow).toBe("hidden");
    expect(scrollY).toBe(180);

    releasePage();
    expect(bodyStyle.overflow).toBe("auto");
    expect(bodyStyle.position).toBe("");
  });

  it("native: releasing page while overlay open leaves fixed-body; final overlay restores original", async () => {
    const cap = await import("./storage/utils/capacitorDetection");
    vi.mocked(cap.isNativeApp).mockReturnValue(true);
    bodyStyle.position = "relative";
    bodyStyle.top = "4px";
    scrollY = 90;

    const { acquirePageScrollLock, acquireBackgroundScrollLock } = await import(
      "./backgroundScrollLock"
    );

    const releasePage = acquirePageScrollLock();
    const releaseOverlay = acquireBackgroundScrollLock();
    expect(bodyStyle.position).toBe("fixed");

    releasePage();
    expect(bodyStyle.position).toBe("fixed");
    expect(htmlStyle.overflow).toBe("hidden");

    scrollY = 0;
    releaseOverlay();
    expect(bodyStyle.position).toBe("relative");
    expect(bodyStyle.top).toBe("4px");
    expect(bodyStyle.overflow).toBe("auto");
    expect(scrollY).toBe(90);
  });

  it("StrictMode acquire/release/reacquire does not leak native fixed-body", async () => {
    const cap = await import("./storage/utils/capacitorDetection");
    vi.mocked(cap.isNativeApp).mockReturnValue(true);
    bodyStyle.position = "relative";
    bodyStyle.top = "";
    scrollY = 40;

    const {
      acquireBackgroundScrollLock,
      getBackgroundScrollLockOwnerCount,
      isBackgroundScrollLockActive,
    } = await import("./backgroundScrollLock");

    const release1 = acquireBackgroundScrollLock();
    expect(bodyStyle.position).toBe("fixed");
    expect(bodyStyle.top).toBe("-40px");
    release1();
    expect(getBackgroundScrollLockOwnerCount()).toBe(0);
    expect(isBackgroundScrollLockActive()).toBe(false);
    expect(bodyStyle.position).toBe("relative");
    expect(bodyStyle.top).toBe("");
    expect(bodyStyle.overflow).toBe("auto");

    const release2 = acquireBackgroundScrollLock();
    expect(getBackgroundScrollLockOwnerCount()).toBe(1);
    expect(bodyStyle.position).toBe("fixed");
    release2();
    expect(getBackgroundScrollLockOwnerCount()).toBe(0);
    expect(bodyStyle.position).toBe("relative");
    expect(bodyStyle.position).not.toBe("fixed");
    expect(bodyStyle.overflow).toBe("auto");
  });

  it("native fixed-body: scrollDocumentByWhileLocked updates offset; unlock keeps new Y", async () => {
    const cap = await import("./storage/utils/capacitorDetection");
    vi.mocked(cap.isNativeApp).mockReturnValue(true);
    scrollY = 0;

    const {
      acquireBackgroundScrollLock,
      scrollDocumentByWhileLocked,
      getLockedDocumentScrollY,
    } = await import("./backgroundScrollLock");

    const release = acquireBackgroundScrollLock();
    expect(bodyStyle.position).toBe("fixed");
    expect(bodyStyle.top).toBe("-0px");

    const applied = scrollDocumentByWhileLocked(480);
    expect(applied).toBe(480);
    expect(bodyStyle.top).toBe("-480px");
    expect(getLockedDocumentScrollY()).toBe(480);
    // window.scrollY stays frozen under fixed-body; visual offset is body.top
    expect(scrollY).toBe(0);

    release();
    expect(bodyStyle.position).toBe("");
    expect(scrollY).toBe(480);
  });

  it("overflow-only lock: scrollDocumentByWhileLocked moves window and restore snapshot", async () => {
    scrollY = 100;
    const {
      acquireBackgroundScrollLock,
      scrollDocumentByWhileLocked,
      getLockedDocumentScrollY,
    } = await import("./backgroundScrollLock");

    const release = acquireBackgroundScrollLock();
    expect(bodyStyle.position).toBe("");

    const applied = scrollDocumentByWhileLocked(250);
    expect(applied).toBe(250);
    expect(scrollY).toBe(350);
    expect(getLockedDocumentScrollY()).toBe(350);

    scrollY = 0;
    release();
    expect(scrollY).toBe(350);
  });

  it("scrollDocumentByWhileLocked clamps to max; nested owners still unlock cleanly", async () => {
    const cap = await import("./storage/utils/capacitorDetection");
    vi.mocked(cap.isNativeApp).mockReturnValue(true);
    scrollY = 3000;

    const {
      acquireBackgroundScrollLock,
      scrollDocumentByWhileLocked,
      getBackgroundScrollLockOwnerCount,
    } = await import("./backgroundScrollLock");

    const a = acquireBackgroundScrollLock();
    const b = acquireBackgroundScrollLock();
    expect(bodyStyle.top).toBe("-3000px");

    // maxY = 4000 - 800 = 3200
    const applied = scrollDocumentByWhileLocked(500);
    expect(applied).toBe(200);
    expect(bodyStyle.top).toBe("-3200px");

    b();
    expect(getBackgroundScrollLockOwnerCount()).toBe(1);
    expect(bodyStyle.position).toBe("fixed");
    a();
    expect(getBackgroundScrollLockOwnerCount()).toBe(0);
    expect(scrollY).toBe(3200);
  });
});
