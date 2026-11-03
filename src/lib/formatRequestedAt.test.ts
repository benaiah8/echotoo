import { describe, expect, it } from "vitest";
import { formatRequestedAt } from "./formatRequestedAt";

describe("formatRequestedAt", () => {
  const now = new Date("2026-11-03T15:00:00");

  it("labels today and yesterday without a bare clock time", () => {
    expect(formatRequestedAt("2026-11-03T03:12:00", now)).toBe("Sent today");
    expect(formatRequestedAt("2026-11-02T22:00:00", now)).toBe(
      "Sent yesterday"
    );
    expect(formatRequestedAt("2026-11-03T03:12:00", now)).not.toMatch(/\d:\d/);
  });

  it("uses a short month-day for older dates", () => {
    const label = formatRequestedAt("2026-11-01T12:00:00", now);
    expect(label).toMatch(/Nov/);
    expect(label).toMatch(/1/);
    expect(label).not.toContain("Sent");
    expect(label).not.toMatch(/\d:\d{2}/);
  });

  it("returns empty for invalid input", () => {
    expect(formatRequestedAt("not-a-date", now)).toBe("");
  });
});
