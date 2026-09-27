import { describe, expect, it } from "vitest";
import { clientCrashPageLabel } from "./clientCrashPageLabel";

describe("clientCrashPageLabel", () => {
  it("maps core tabs", () => {
    expect(clientCrashPageLabel("/")).toBe("Feed");
    expect(clientCrashPageLabel("/games")).toBe("Feed");
    expect(clientCrashPageLabel("/people")).toBe("People");
    expect(clientCrashPageLabel("/messages")).toBe("Messages");
    expect(clientCrashPageLabel("/messages/abc")).toBe("Messages");
    expect(clientCrashPageLabel("/notifications")).toBe("Notifications");
  });

  it("maps profile without usernames", () => {
    expect(clientCrashPageLabel("/u/me")).toBe("Profile");
    expect(clientCrashPageLabel("/profile")).toBe("Profile");
    expect(clientCrashPageLabel("/me")).toBe("Profile");
    expect(clientCrashPageLabel("/u/someone")).toBe("Profile");
  });

  it("maps post detail, create, admin", () => {
    expect(clientCrashPageLabel("/experience/post-id")).toBe("Post Detail");
    expect(clientCrashPageLabel("/hangout/post-id")).toBe("Post Detail");
    expect(clientCrashPageLabel("/create")).toBe("Create");
    expect(clientCrashPageLabel("/create/finalize")).toBe("Create");
    expect(clientCrashPageLabel("/internal")).toBe("Admin");
    expect(clientCrashPageLabel("/internal/crash-reports")).toBe("Admin");
  });

  it("strips query/hash and falls back", () => {
    expect(clientCrashPageLabel("/people?x=1#y")).toBe("People");
    expect(clientCrashPageLabel("/unknown-place")).toBe("Other");
  });
});
