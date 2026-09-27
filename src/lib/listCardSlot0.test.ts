import { describe, expect, it } from "vitest";
import { hasV4VisibleLocation } from "./createFlowLocation";
import { extractV4KeyInfoValues } from "./createFlowV4KeyInfo";
import {
  buildHomeSlot0Activities,
  hasListCardSlot0Payload,
  parseSlot0KeyInfo,
  stampSlot0OntoActivities,
} from "./listCardSlot0";

const MAPS = "https://maps.google.com/?q=Addis";

describe("parseSlot0KeyInfo", () => {
  it("keeps only V4KeyInfo rows and drops unrelated additional_info", () => {
    const parsed = parseSlot0KeyInfo([
      { title: "Duration", value: "2h" },
      { title: "V4KeyInfo", value: "Bring ID" },
      { title: "V4KeyInfo", value: "Cash only" },
      { title: "Dress Code", value: "Smart" },
    ]);
    expect(parsed).toEqual([
      { title: "V4KeyInfo", value: "Bring ID" },
      { title: "V4KeyInfo", value: "Cash only" },
    ]);
    expect(extractV4KeyInfoValues(parsed)).toEqual(["Bring ID", "Cash only"]);
  });
});

describe("buildHomeSlot0Activities", () => {
  it("A: image + location → synthetic activity carries location", () => {
    const acts = buildHomeSlot0Activities({
      images: ["https://cdn.example/a.jpg"],
      slot0: { slot0_location_name: "Bole", slot0_location_url: null },
    });
    expect(acts).toHaveLength(1);
    expect(acts![0].images).toEqual(["https://cdn.example/a.jpg"]);
    expect(acts![0].order_idx).toBe(0);
    expect(acts![0].location_name).toBe("Bole");
    expect(acts![0].location_url).toBeNull();
    expect(acts![0].location_desc).toBeNull();
    expect(acts![0].location_notes).toBeNull();
  });

  it("B: no image + location → synthetic activity still exists", () => {
    const acts = buildHomeSlot0Activities({
      images: null,
      slot0: { slot0_location_name: "Meskel Square", slot0_location_url: null },
    });
    expect(acts).toHaveLength(1);
    expect(acts![0].images).toBeNull();
    expect(acts![0].location_name).toBe("Meskel Square");
  });

  it("C: no image + Key Details → synthetic activity still exists", () => {
    const acts = buildHomeSlot0Activities({
      images: [],
      slot0: {
        slot0_key_info: [{ title: "V4KeyInfo", value: "Arrive early" }],
      },
    });
    expect(acts).toHaveLength(1);
    expect(acts![0].additional_info).toEqual([
      { title: "V4KeyInfo", value: "Arrive early" },
    ]);
  });

  it("D: no location / no notes / no image → no stub", () => {
    expect(
      buildHomeSlot0Activities({
        images: null,
        slot0: {
          slot0_location_name: null,
          slot0_location_url: null,
          slot0_key_info: [],
        },
      }),
    ).toBeUndefined();
  });

  it("G: location URL with no name still reaches the Post pin rule", () => {
    const acts = buildHomeSlot0Activities({
      images: null,
      slot0: { slot0_location_name: null, slot0_location_url: MAPS },
    });
    expect(acts).toHaveLength(1);
    expect(acts![0].location_name).toBeNull();
    expect(acts![0].location_url).toBe(MAPS);
    expect(hasV4VisibleLocation(acts![0].location_name, acts![0].location_url)).toBe(
      true,
    );
  });
});

describe("stampSlot0OntoActivities", () => {
  const thin = [
    {
      id: "act-1",
      images: ["https://cdn.example/p.jpg"],
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "act-2",
      images: ["https://cdn.example/q.jpg"],
      created_at: "2026-01-02T00:00:00Z",
    },
  ];

  it("E: Created thin activity keeps images and stamps slot-0 metadata", () => {
    const next = stampSlot0OntoActivities(thin, {
      slot0_location_name: "Piassa",
      slot0_location_url: MAPS,
      slot0_key_info: [{ title: "V4KeyInfo", value: "Gate B" }],
    });
    expect(next).toHaveLength(2);
    expect(next[0].id).toBe("act-1");
    expect(next[0].images).toEqual(["https://cdn.example/p.jpg"]);
    expect(next[0].location_name).toBe("Piassa");
    expect(next[0].location_url).toBe(MAPS);
    expect(next[0].additional_info).toEqual([
      { title: "V4KeyInfo", value: "Gate B" },
    ]);
    expect(next[1].images).toEqual(["https://cdn.example/q.jpg"]);
    expect(next[1].location_name).toBeUndefined();
  });

  it("F: Saved thin activity same stamp behavior", () => {
    const next = stampSlot0OntoActivities(thin, {
      slot0_location_name: "Friendship Park",
      slot0_location_url: null,
    });
    expect(next[0].images).toEqual(["https://cdn.example/p.jpg"]);
    expect(next[0].location_name).toBe("Friendship Park");
    expect(next[1].id).toBe("act-2");
  });

  it("H: V4KeyInfo only — unrelated additional_info is not mapped", () => {
    const next = stampSlot0OntoActivities([], {
      slot0_key_info: [
        { title: "Duration", value: "3h" },
        { title: "V4KeyInfo", value: "Only this" },
      ],
    });
    expect(next).toHaveLength(1);
    expect(next[0].additional_info).toEqual([
      { title: "V4KeyInfo", value: "Only this" },
    ]);
    expect(hasListCardSlot0Payload({ slot0_key_info: next[0].additional_info })).toBe(
      true,
    );
  });

  it("leaves thin activities unchanged when slot-0 is empty", () => {
    const next = stampSlot0OntoActivities(thin, {
      slot0_location_name: "  ",
      slot0_location_url: null,
      slot0_key_info: [{ title: "Duration", value: "2h" }],
    });
    expect(next[0].location_name).toBeUndefined();
    expect(next[0].images).toEqual(["https://cdn.example/p.jpg"]);
  });
});
