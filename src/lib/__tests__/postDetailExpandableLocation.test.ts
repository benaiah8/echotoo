/**
 * Post Detail expandable location box — presentation contracts (source).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const LOC = "src/components/detail/PostV4LocationReadOnly.tsx";

describe("PostV4LocationReadOnly expandable location", () => {
  const src = read(LOC);

  it("collapsed main area toggles expansion; does not call openMapsLocationUrl", () => {
    expect(src).toContain("data-location-toggle");
    expect(src).toContain("aria-expanded={expanded}");
    expect(src).toContain("setExpanded((v) => !v)");
    expect(src).toContain("onClick={toggleExpanded}");
    // Toggle handler must not open Maps.
    const toggleFn = src.slice(
      src.indexOf("const toggleExpanded"),
      src.indexOf("const headerAlignClass"),
    );
    expect(toggleFn).not.toContain("openMapsLocationUrl");
  });

  it("right circle still calls openMapsLocationUrl only", () => {
    expect(src).toContain("data-location-maps-open");
    expect(src).toContain("openMapsLocationUrl(url)");
    expect(src).toContain('aria-label="Open location in Google Maps"');
    const mapsBtn = src.slice(
      src.indexOf("data-location-maps-open"),
      src.indexOf("data-location-expanded"),
    );
    expect(mapsBtn).toContain("openMaps()");
    expect(mapsBtn).toContain("e.stopPropagation()");
  });

  it("expanded shows name, desc, notes, and full locationUrl", () => {
    expect(src).toContain("data-location-expanded");
    expect(src).toContain("{name ? (");
    expect(src).toContain("{desc ? (");
    expect(src).toContain("{notes ? (");
    expect(src).toContain("Location link");
    expect(src).toContain("data-location-url-open");
    expect(src).toContain("{url}");
    expect(src).toContain("break-all");
    expect(src).toContain("min-w-0");
  });

  it("URL tap opens OpenExternalLinkDialog; not Maps; does not collapse", () => {
    expect(src).toContain('from "../ui/OpenExternalLinkDialog"');
    expect(src).toContain("setLinkDialogOpen(true)");
    expect(src).toContain("<OpenExternalLinkDialog");
    expect(src).toContain("href={url}");
    const urlBtn = src.slice(
      src.indexOf("data-location-url-open"),
      src.indexOf("</OpenExternalLinkDialog>") > 0
        ? src.indexOf("<OpenExternalLinkDialog")
        : src.length,
    );
    expect(urlBtn).toContain("e.stopPropagation()");
    expect(urlBtn).not.toContain("openMapsLocationUrl");
    expect(urlBtn).not.toContain("setExpanded");
  });

  it("OpenExternalLinkDialog confirmed path stays generic opener", () => {
    const dialog = read("src/components/ui/OpenExternalLinkDialog.tsx");
    expect(dialog).toContain("openExternalUrl");
    expect(dialog).not.toContain("openMapsLocationUrl");
    expect(dialog).toContain("Open external link?");
  });

  it("no-URL hides link section and Maps circle", () => {
    expect(src).toContain("data-location-maps-open");
    expect(src).toContain("Location link");
    expect(src).toContain("data-location-url-open");
    // Both Maps circle and URL section are gated on hasUrl.
    expect(src).toMatch(/\{hasUrl \? \([\s\S]*data-location-maps-open/);
    expect(src).toMatch(/\{hasUrl \? \([\s\S]*Location link/);
    expect(src).toMatch(/\{hasUrl \? \([\s\S]*OpenExternalLinkDialog/);
  });

  it("no nested button-in-button: URL and Maps are siblings of toggle", () => {
    expect(src).toContain("data-location-toggle");
    // Expanded body is a sibling div after the Maps button, not inside toggle.
    const toggleEnd = src.indexOf("</button>", src.indexOf("data-location-toggle"));
    const mapsIdx = src.indexOf("data-location-maps-open");
    const expandedIdx = src.indexOf("data-location-expanded");
    const urlIdx = src.indexOf("data-location-url-open");
    expect(mapsIdx).toBeGreaterThan(toggleEnd);
    expect(expandedIdx).toBeGreaterThan(mapsIdx);
    expect(urlIdx).toBeGreaterThan(expandedIdx);
  });

  it("smooth expand uses CSS grid-rows + opacity; respects reduced motion", () => {
    expect(src).toContain("data-location-motion");
    expect(src).toContain("grid-rows-[1fr]");
    expect(src).toContain("grid-rows-[0fr]");
    expect(src).toContain("transition-[grid-template-rows]");
    expect(src).toContain("transition-[border-radius]");
    expect(src).toContain("transition-[opacity,transform]");
    expect(src).toContain("duration-200");
    expect(src).toContain("ease-out");
    expect(src).toContain("motion-reduce:transition-none");
    expect(src).toContain("pointer-events-none");
    expect(src).toContain("tabIndex={expanded ? 0 : -1}");
  });

  it("uses finite radii (not rounded-full) with generous expanded top-right", () => {
    // Shell uses inline finite radii — never Tailwind rounded-full (9999px) on the shell.
    expect(src).toMatch(/SHELL_RADIUS_PILL\s*=\s*"19px"/);
    expect(src).toMatch(/SHELL_RADIUS_COLLAPSED_RECT\s*=\s*"18px"/);
    expect(src).toMatch(/SHELL_RADIUS_EXPANDED\s*=\s*"12px 24px 12px 12px"/);
    expect(src).toContain("style={{ borderRadius: shellBorderRadius }}");
    expect(src).toContain("data-location-radius");
    expect(src).toContain("transition-[border-radius]");
    // Maps action circle may keep rounded-full; shell class strings must not.
    expect(metaBlockShellBaseSnippet()).not.toContain("rounded-full");
  });

  function metaBlockShellBaseSnippet(): string {
    const start = src.indexOf("const metaBlockShellBase");
    const end = src.indexOf("const metaHitClass");
    return start >= 0 && end > start ? src.slice(start, end) : "";
  }

  it("collapse uses local expanded state; Schedule-like expanded shell", () => {
    expect(src).toContain("useState(false)");
    expect(src).toContain("metaBlockExpandedClass");
    expect(src).toContain('data-expanded={expanded ? "true" : "false"}');
  });

  it("does not modify Maps opener modules from this component surface", () => {
    expect(src).toContain('from "../../lib/openMapsLocationUrl"');
    expect(src).not.toContain("buildAndroidOpenGoogleMapsAppIntent");
    expect(src).not.toContain("InAppBrowser");
  });
});

describe("Post Detail metadata shell styling remains intact", () => {
  it("Schedule/Date and Location keep border-only shells", () => {
    const body = read("src/components/detail/PostDetailBody.tsx");
    const start = body.indexOf("{showScheduleBlock && (");
    const end = body.indexOf(
      "{!composeFinalizeShell && publishedCarrierSlot0Location",
    );
    const block = body.slice(start, end);
    expect(block).toContain("rounded-xl border border-[var(--border)]/70");
    expect(block).toContain("bg-transparent");

    const loc = read(LOC);
    expect(loc).toContain("border border-[var(--border)]/70");
    expect(loc).toContain("bg-transparent");
    expect(loc).toContain("app-dark:border-white/22");
    expect(loc).not.toContain("finalizeMetaSurfaceClass");
  });
});
