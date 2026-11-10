/**
 * Light-mode glass contrast — backdrop, section labels, people panels.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

describe("light-mode glass contrast", () => {
  const glass = read("src/lib/glassActionSheetStyles.ts");
  const settings = read("src/components/profile/ProfileTopBar.tsx");
  const filters = read("src/components/home/HomeFiltersOverlay.tsx");
  const groupUp = read("src/components/people/GroupUpRequestNoteComposer.tsx");
  const openPlan = read("src/components/people/OpenPlanRequestNoteComposer.tsx");

  it("keeps a dark scrim and adds a 75% light surface with 18px blur", () => {
    expect(glass).toContain("bg-black/50");
    expect(glass).toContain("[backdrop-filter:blur(12px)]");
    expect(glass).toContain("[-webkit-backdrop-filter:blur(12px)]");
    expect(glass).toContain(
      "app-light:bg-[color-mix(in_oklab,var(--surface)_75%,transparent)]"
    );
    expect(glass).toContain("app-light:[backdrop-filter:blur(18px)]");
    expect(glass).toContain("app-light:[-webkit-backdrop-filter:blur(18px)]");
    expect(glass).not.toContain("app-light:bg-white");
  });

  it("keeps Profile Settings on the shared backdrop and Filters on its own scrim", () => {
    expect(settings).toContain("glassActionSheetBackdropClass");
    expect(settings).toContain("className={glassActionSheetBackdropClass}");
    expect(settings).not.toContain("bg-black/50 backdrop-blur-md");
    expect(filters).not.toContain("glassActionSheetBackdropClass");
    expect(filters).toContain("homeFiltersDismissBackdropClass");
    expect(filters).toContain("h-[78%]");
  });

  it("raises light section labels to 75% and leaves dark labels at 42%", () => {
    expect(settings).toContain(
      "text-[var(--text)]/42 app-light:text-[var(--text)]/75"
    );
    expect(filters).toContain(
      "text-[var(--text)]/42 app-light:text-[var(--text)]/75"
    );
    expect(glass).toContain(
      "text-[var(--text)]/42 app-light:text-[var(--text)]/75"
    );
    expect(filters).toContain("Social");
    expect(filters).toContain("Date");
    expect(filters).toContain("Calendar");
  });

  it("strengthens the people-panel light fill and keeps the dark 26% fill", () => {
    expect(glass).toContain(
      "bg-[color-mix(in_oklab,var(--surface-2)_75%,transparent)]"
    );
    expect(glass).toContain("backdrop-blur-xl");
    expect(glass).toContain(
      "app-dark:bg-[color-mix(in_oklab,var(--surface-2)_26%,transparent)]"
    );
    expect(glass).not.toContain(
      "bg-[color-mix(in_oklab,var(--surface-2)_34%,transparent)]"
    );
  });

  it("leaves composer dismiss and submit handlers in place", () => {
    expect(groupUp).toContain("glassPeoplePanelClass");
    expect(groupUp).toContain("onCancel");
    expect(groupUp).toContain("onDismiss");
    expect(groupUp).toContain("onSubmit");
    expect(openPlan).toContain("glassPeoplePanelClass");
    expect(filters).toContain("onClearAllFilters");
    expect(filters).toContain("playAnimatedDismiss()");
    expect(settings).toContain("onRequestDeleteAccount?.()");
    expect(settings).toContain("onRequestLogout?.()");
  });
});
