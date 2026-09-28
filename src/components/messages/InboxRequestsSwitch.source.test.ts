/**
 * Messages filter-row size contract. Source-level: this repo's vitest
 * environment is node, with no DOM renderer.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function readSwitch(): string {
  return readFileSync(
    join(process.cwd(), "src/components/messages/InboxRequestsSwitch.tsx"),
    "utf8",
  );
}

describe("InboxRequestsSwitch visible size", () => {
  it("Inbox and Requests share a 36px visible pill", () => {
    const src = readSwitch();
    expect(src).toContain('const VISIBLE_H = "h-9"');
    expect(src).toContain("tabPillVisual");
    expect(src).toContain("Inbox");
    expect(src).toContain("Requests");
    const visual = src.slice(
      src.indexOf("const tabPillVisual"),
      src.indexOf("const tabPillActive"),
    );
    expect(visual).toContain("VISIBLE_H");
    expect(visual).toContain("px-2.5");
  });

  it("primary labels use 12px and a comfortable line height", () => {
    const src = readSwitch();
    const visual = src.slice(
      src.indexOf("const tabPillVisual"),
      src.indexOf("const tabPillActive"),
    );
    expect(visual).toContain("text-[12px]");
    expect(visual).toContain("leading-snug");
    expect(visual).not.toContain("leading-none");
    expect(visual).not.toContain("text-[10px]");
  });

  it("circular controls are 36px with 14px icons", () => {
    const src = readSwitch();
    const icon = src.slice(
      src.indexOf("const iconVisual"),
      src.indexOf("const iconChipActive"),
    );
    expect(icon).toContain("VISIBLE_H");
    expect(icon).toContain("w-9");
    expect(src).toContain("size={14}");
    expect(src).not.toContain("size={11}");
    expect(src).not.toContain('"w-6"');
    expect(src).not.toContain('"h-6"');
  });
});

describe("InboxRequestsSwitch touch target", () => {
  it("uses a 44px-tall button that stays as wide as the visible control", () => {
    const src = readSwitch();
    expect(src).toContain('const HIT_H = "h-11"');
    const hit = src.slice(
      src.indexOf("const hitButtonBase"),
      src.indexOf("const tabPillVisual"),
    );
    expect(hit).toContain("HIT_H");
    expect(hit).toContain("bg-transparent");
    expect(hit).toContain("p-0");
    expect(hit).not.toContain("w-11");
    expect(hit).not.toContain("before:");
  });
});

describe("InboxRequestsSwitch behavior preserved", () => {
  it("keeps the request badge on Requests and out of the hit path", () => {
    const src = readSwitch();
    expect(src).toContain("pointer-events-none absolute -right-0.5 -top-1 z-[1]");
    expect(src).toContain("h-[15px] min-w-[15px]");
    expect(src).toContain("bg-amber-400");
    expect(src).toContain("{badgeLabel ?? \"\"}");
    expect(src).toContain("aria-hidden");
  });

  it("keeps the same tab and kind actions", () => {
    const src = readSwitch();
    expect(src).toContain('onClick={() => onTabChange("inbox")}');
    expect(src).toContain('onClick={() => onTabChange("requests")}');
    expect(src).toContain("onKindFilterChange(id)");
    expect(src).toContain('aria-selected={tab === "inbox"}');
    expect(src).toContain('aria-selected={tab === "requests"}');
    expect(src).toContain("aria-pressed={active}");
    expect(src).toContain('role="tab"');
    expect(src).toContain('role="tablist"');
    expect(src).toContain('role="toolbar"');
  });

  it("keeps the existing active and idle treatments", () => {
    const src = readSwitch();
    expect(src).toContain("tab === \"inbox\" ? tabPillActive : tabPillIdle");
    expect(src).toContain("tab === \"requests\" ? tabPillActive : tabPillIdle");
    expect(src).toContain("active ? iconChipActive : iconChipIdle");
    expect(src).toContain("const iconChipActive = tabPillActive");
    expect(src).toContain("const iconChipIdle = tabPillIdle");
  });

  it("stays a single non-wrapping row", () => {
    const src = readSwitch();
    expect(src).toContain("flex-nowrap");
    expect(src).toContain("whitespace-nowrap");
    expect(src).not.toContain("flex-wrap");
    expect(src).toContain('label: "All chats"');
    expect(src).toContain('label: "DMs"');
    expect(src).toContain('label: "Groups"');
  });

  it("does not branch by platform or device", () => {
    const src = readSwitch();
    expect(src).not.toMatch(/isIOS|isAndroid|iPhone|Capacitor|userAgent|platform/);
  });
});
