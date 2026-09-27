import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("Messages Requests cache-first loading", () => {
  it("does not gate the Requests tab on inbox conversation Loading", () => {
    const src = read("src/pages/messages/MessagesInboxPage.tsx");
    expect(src).toContain("showRequestsInitialLoader");
    expect(src).toContain("showInboxInitialLoader");
    expect(src).toContain(
      "showInboxInitialLoader || showRequestsInitialLoader"
    );
    expect(src).not.toContain("loading && rows.length === 0 ? (");
    expect(src).toContain("!openPlanHasLoaded || !groupUpHasLoaded");
    expect(src).toContain("openPlanHasLoaded &&\n    groupUpHasLoaded");
  });

  it("soft-revalidates Open Plan and Group Up request groups with force network", () => {
    const openPlan = read("src/hooks/useOpenPlanRequestGroups.ts");
    const groupUp = read("src/hooks/useGroupUpRequestGroups.ts");
    expect(openPlan).toContain("void revalidate(true)");
    expect(openPlan).not.toContain("void revalidate(false)");
    expect(openPlan).toContain("isOpenPlanRequestGroupsSoftStale");
    expect(groupUp).toContain("void revalidate(true)");
    expect(groupUp).not.toContain("void revalidate(false)");
    expect(groupUp).toContain("isGroupUpRequestGroupsSoftStale");
  });

  it("preserves Open Plan requester force soft-revalidate", () => {
    const requesters = read("src/hooks/useOpenPlanRequesters.ts");
    expect(requesters).toContain("void revalidate(true)");
    expect(requesters).not.toContain("void revalidate(false)");
  });
});

describe("Messages pull-to-refresh tab preservation", () => {
  it("refreshes the active tab without resetting to Inbox", () => {
    const src = read("src/pages/messages/MessagesInboxPage.tsx");
    expect(src).toContain("runMessagesPullRefresh");
    expect(src).toContain('tab === "requests"');
    expect(src).toContain("refreshOpenPlanRequestGroups");
    expect(src).toContain("refreshGroupUpRequestGroups");
    expect(src).toContain("ptr_requests");
    expect(src).not.toContain(
      "committed pull-to-refresh resets local view to default Inbox + All"
    );
    const onCommit = src.slice(
      src.indexOf("onCommit: () => {"),
      src.indexOf("refreshEpoch: 0")
    );
    expect(onCommit).not.toContain('setInboxTab("inbox")');
    expect(onCommit).not.toContain('setKindFilter("all")');
    expect(onCommit).toContain("return runMessagesPullRefresh()");
    expect(onCommit).not.toContain("void runMessagesPullRefresh()");
  });

  it("keeps the pull indicator tied to the refresh promise", () => {
    const src = read("src/pages/messages/MessagesInboxPage.tsx");
    expect(src).toContain("messagesPtrPromiseRef");
    expect(src).toContain("return runMessagesPullRefresh()");
    expect(src).toContain("refreshEpoch: 0");
    expect(src).not.toContain("messagesRefreshEpoch");
    expect(src).not.toContain("setMessagesRefreshEpoch");
  });

  it("blocks window pull-to-refresh while requester drawers are open", () => {
    const src = read("src/pages/messages/MessagesInboxPage.tsx");
    expect(src).toContain("openPlanRequestersDrawerOpen");
    expect(src).toContain("groupUpRequestersDrawerOpen");
    expect(src).toContain("acquirePullToRefreshBlock()");
    expect(src).toContain("!openPlanRequestersDrawerOpen");
    expect(src).toContain("!groupUpRequestersDrawerOpen");
  });
});
