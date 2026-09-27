import { describe, expect, it } from "vitest";
import {
  extractSafeHttpUrlsFromText,
  normalizeSafeHttpUrl,
  safeHttpUrlPillLabel,
  tokenizeSafeHttpUrlsInText,
} from "./safeHttpUrlText";

describe("normalizeSafeHttpUrl", () => {
  it("accepts https and http", () => {
    expect(normalizeSafeHttpUrl("https://example.com")).toBe(
      "https://example.com/",
    );
    expect(normalizeSafeHttpUrl("http://example.com")).toBe(
      "http://example.com/",
    );
  });

  it("normalizes www and bare domains to https", () => {
    expect(normalizeSafeHttpUrl("www.example.com")).toBe(
      "https://www.example.com/",
    );
    expect(normalizeSafeHttpUrl("example.com")).toBe("https://example.com/");
  });

  it("preserves path, query, and hash", () => {
    expect(normalizeSafeHttpUrl("example.com/path?ticket=123")).toBe(
      "https://example.com/path?ticket=123",
    );
    expect(normalizeSafeHttpUrl("https://example.com/event?id=123#top")).toBe(
      "https://example.com/event?id=123#top",
    );
  });

  it("strips trailing sentence punctuation", () => {
    expect(normalizeSafeHttpUrl("example.com.")).toBe("https://example.com/");
    expect(normalizeSafeHttpUrl("example.com,")).toBe("https://example.com/");
    expect(normalizeSafeHttpUrl("example.com)")).toBe("https://example.com/");
    expect(normalizeSafeHttpUrl("example.com!")).toBe("https://example.com/");
  });

  it("rejects unsafe schemes", () => {
    expect(normalizeSafeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeSafeHttpUrl("data:text/html,hi")).toBeNull();
    expect(normalizeSafeHttpUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeSafeHttpUrl("intent://scan/#Intent;end")).toBeNull();
    expect(normalizeSafeHttpUrl("mailto:user@example.com")).toBeNull();
    expect(normalizeSafeHttpUrl("tel:+15551212")).toBeNull();
    expect(normalizeSafeHttpUrl("myapp://open")).toBeNull();
  });

  it("rejects emails", () => {
    expect(normalizeSafeHttpUrl("user@example.com")).toBeNull();
  });
});

describe("tokenizeSafeHttpUrlsInText", () => {
  it("tokenizes common caption forms", () => {
    const segs = tokenizeSafeHttpUrlsInText(
      "Get tickets here example.com/tickets",
    );
    expect(segs).toEqual([
      { kind: "text", value: "Get tickets here " },
      {
        kind: "url",
        value: "example.com/tickets",
        href: "https://example.com/tickets",
      },
    ]);
  });

  it("handles www and full https", () => {
    expect(tokenizeSafeHttpUrlsInText("www.example.com/event")).toEqual([
      {
        kind: "url",
        value: "www.example.com/event",
        href: "https://www.example.com/event",
      },
    ]);
    expect(
      tokenizeSafeHttpUrlsInText("https://example.com/event?id=123"),
    ).toEqual([
      {
        kind: "url",
        value: "https://example.com/event?id=123",
        href: "https://example.com/event?id=123",
      },
    ]);
  });

  it("keeps multiple URLs and newlines", () => {
    const text = "A\nhttps://a.example\nB example.com/path?ticket=123 C";
    const segs = tokenizeSafeHttpUrlsInText(text);
    expect(segs.filter((s) => s.kind === "url").map((s) => s.href)).toEqual([
      "https://a.example/",
      "https://example.com/path?ticket=123",
    ]);
    expect(segs.some((s) => s.kind === "text" && s.value.includes("\n"))).toBe(
      true,
    );
  });

  it("leaves trailing punctuation outside the URL token", () => {
    const segs = tokenizeSafeHttpUrlsInText("See example.com.");
    expect(segs).toEqual([
      { kind: "text", value: "See " },
      { kind: "url", value: "example.com", href: "https://example.com/" },
      { kind: "text", value: "." },
    ]);
  });

  it("does not linkify email domains", () => {
    const segs = tokenizeSafeHttpUrlsInText("Email me at user@example.com thanks");
    expect(segs.every((s) => s.kind === "text")).toBe(true);
    expect(segs.map((s) => s.value).join("")).toBe(
      "Email me at user@example.com thanks",
    );
  });

  it("does not linkify unsafe schemes in prose", () => {
    const segs = tokenizeSafeHttpUrlsInText(
      "bad javascript:alert(1) and data:text/html,x",
    );
    expect(segs.every((s) => s.kind === "text")).toBe(true);
  });

  it("avoids treating simple decimals as URLs", () => {
    const segs = tokenizeSafeHttpUrlsInText("Version 1.2 and price 3.14");
    expect(segs.every((s) => s.kind === "text")).toBe(true);
  });
});

describe("extractSafeHttpUrlsFromText", () => {
  it("dedupes and caps", () => {
    expect(
      extractSafeHttpUrlsFromText(
        "https://example.com again example.com/path",
        1,
      ),
    ).toEqual([{ href: "https://example.com/", label: "example.com" }]);
  });
});

describe("safeHttpUrlPillLabel", () => {
  it("shows host and short path", () => {
    expect(safeHttpUrlPillLabel("https://echo.too.com/")).toBe("echo.too.com");
    expect(safeHttpUrlPillLabel("https://example.com/tickets")).toBe(
      "example.com/tickets",
    );
  });
});
