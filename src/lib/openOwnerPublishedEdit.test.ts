/**
 * Owner published Edit open — loading feedback, single-flight, stale cancel.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react-hot-toast", () => {
  const toast = Object.assign(vi.fn(), {
    loading: vi.fn(() => "toast-loading-id"),
    dismiss: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  });
  return { default: toast };
});

vi.mock("./editPostBootstrap", () => ({
  persistCanonicalEditPostData: vi.fn(),
}));

import toast from "react-hot-toast";
import { persistCanonicalEditPostData } from "./editPostBootstrap";
import {
  __resetOwnerPublishedEditFlightForTests,
  isOwnerPublishedEditInFlight,
  OWNER_PUBLISHED_EDIT_LOADING_MESSAGE,
  runOwnerPublishedEditOpen,
} from "./openOwnerPublishedEdit";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readRepo(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

function stubWindowPath(pathname: string) {
  const loc = { pathname };
  (globalThis as { window?: unknown }).window = {
    location: loc,
    history: {
      replaceState: (_a: unknown, _b: unknown, url: string) => {
        loc.pathname = new URL(url, "http://local.test").pathname;
      },
      pushState: (_a: unknown, _b: unknown, url: string) => {
        loc.pathname = new URL(url, "http://local.test").pathname;
      },
    },
  };
}

describe("runOwnerPublishedEditOpen", () => {
  beforeEach(() => {
    __resetOwnerPublishedEditFlightForTests();
    vi.clearAllMocks();
    stubWindowPath("/");
  });

  it("shows loading toast immediately and navigates on success", async () => {
    const navigate = vi.fn();
    const editData = { postId: "p1" } as never;
    const status = await runOwnerPublishedEditOpen({
      startPathname: "/",
      navigate,
      fetchAndBuild: async () => ({
        editData,
        href: "/create/finalize?type=experience",
      }),
    });

    expect(toast.loading).toHaveBeenCalledWith(
      OWNER_PUBLISHED_EDIT_LOADING_MESSAGE,
    );
    expect(status).toBe("ok");
    expect(persistCanonicalEditPostData).toHaveBeenCalledWith(editData);
    expect(toast.dismiss).toHaveBeenCalledWith("toast-loading-id");
    expect(navigate).toHaveBeenCalledWith("/create/finalize?type=experience");
    expect(isOwnerPublishedEditInFlight()).toBe(false);
  });

  it("blocks duplicate in-flight opens", async () => {
    const navigate = vi.fn();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const first = runOwnerPublishedEditOpen({
      startPathname: "/",
      navigate,
      fetchAndBuild: async () => {
        await gate;
        return {
          editData: { postId: "p1" } as never,
          href: "/create/finalize?type=experience",
        };
      },
    });

    expect(isOwnerPublishedEditInFlight()).toBe(true);
    const second = await runOwnerPublishedEditOpen({
      startPathname: "/",
      navigate,
      fetchAndBuild: async () => ({
        editData: { postId: "p2" } as never,
        href: "/create/finalize?type=hangout",
      }),
    });
    expect(second).toBe("busy");
    expect(toast.loading).toHaveBeenCalledTimes(1);

    release();
    await first;
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("clears loading and errors on failure without navigating", async () => {
    const navigate = vi.fn();
    const status = await runOwnerPublishedEditOpen({
      startPathname: "/",
      navigate,
      fetchAndBuild: async () => {
        throw new Error("Nope");
      },
    });
    expect(status).toBe("failed");
    expect(toast.dismiss).toHaveBeenCalledWith("toast-loading-id");
    expect(toast.error).toHaveBeenCalledWith("Nope");
    expect(navigate).not.toHaveBeenCalled();
    expect(persistCanonicalEditPostData).not.toHaveBeenCalled();
    expect(isOwnerPublishedEditInFlight()).toBe(false);
  });

  it("allows retry after failure", async () => {
    const navigate = vi.fn();
    await runOwnerPublishedEditOpen({
      startPathname: "/",
      navigate,
      fetchAndBuild: async () => {
        throw new Error("Nope");
      },
    });
    const status = await runOwnerPublishedEditOpen({
      startPathname: "/",
      navigate,
      fetchAndBuild: async () => ({
        editData: { postId: "p1" } as never,
        href: "/create/finalize?type=experience",
      }),
    });
    expect(status).toBe("ok");
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it("ignores stale success after pathname leaves start surface", async () => {
    const navigate = vi.fn();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const pending = runOwnerPublishedEditOpen({
      startPathname: "/",
      navigate,
      fetchAndBuild: async () => {
        await gate;
        return {
          editData: { postId: "p1" } as never,
          href: "/create/finalize?type=experience",
        };
      },
    });

    (
      globalThis as {
        window: { history: { pushState: (a: unknown, b: unknown, u: string) => void } };
      }
    ).window.history.pushState(null, "", "/messages");
    release();
    const status = await pending;
    expect(status).toBe("cancelled");
    expect(navigate).not.toHaveBeenCalled();
    expect(persistCanonicalEditPostData).not.toHaveBeenCalled();
    expect(toast.dismiss).toHaveBeenCalledWith("toast-loading-id");
    expect(toast.error).not.toHaveBeenCalled();
    expect(isOwnerPublishedEditInFlight()).toBe(false);
  });

  it("does not show error toast after leave if fetch fails", async () => {
    const navigate = vi.fn();
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });

    const pending = runOwnerPublishedEditOpen({
      startPathname: "/",
      navigate,
      fetchAndBuild: async () => {
        await gate;
        throw new Error("late fail");
      },
    });

    (
      globalThis as {
        window: { history: { pushState: (a: unknown, b: unknown, u: string) => void } };
      }
    ).window.history.pushState(null, "", "/people");
    release();
    const status = await pending;
    expect(status).toBe("failed");
    expect(navigate).not.toHaveBeenCalled();
    expect(toast.dismiss).toHaveBeenCalledWith("toast-loading-id");
    expect(toast.error).not.toHaveBeenCalled();
    expect(isOwnerPublishedEditInFlight()).toBe(false);
  });

  it("persists bootstrap only after fetchAndBuild returns", async () => {
    const navigate = vi.fn();
    let built = false;
    await runOwnerPublishedEditOpen({
      startPathname: "/",
      navigate,
      fetchAndBuild: async () => {
        expect(persistCanonicalEditPostData).not.toHaveBeenCalled();
        built = true;
        return {
          editData: { postId: "p1" } as never,
          href: "/create/finalize?type=experience",
        };
      },
    });
    expect(built).toBe(true);
    expect(persistCanonicalEditPostData).toHaveBeenCalledTimes(1);
  });
});

describe("owner Edit wiring (source)", () => {
  it("Post / PostDetailBody / Hangout use runOwnerPublishedEditOpen", () => {
    for (const rel of [
      "src/components/Post.tsx",
      "src/components/detail/PostDetailBody.tsx",
      "src/components/Hangout.tsx",
    ]) {
      const src = readRepo(rel);
      expect(src).toContain("runOwnerPublishedEditOpen");
      expect(src).toContain("startPathname");
    }
  });

  it("admin Edit toast path remains in PostMenu", () => {
    const src = readRepo("src/components/ui/PostMenu.tsx");
    expect(src).toContain('toast.loading("Loading post for edit…")');
    expect(src).toContain("isAdminEditLoading");
    expect(src).not.toContain("runOwnerPublishedEditOpen");
  });

  it("does not alter discard helpers", () => {
    const src = readRepo("src/lib/createFlowLeaveGuard.ts");
    expect(src).toContain("shouldOfferCreateDraftEntryDialog");
  });

  it("does not wire BottomTab into owner edit open", () => {
    const src = readRepo("src/components/BottomTab.tsx");
    expect(src).not.toContain("runOwnerPublishedEditOpen");
    expect(src).not.toContain("getPostForEdit");
  });
});
