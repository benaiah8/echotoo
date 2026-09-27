import { hasV4VisibleLocation } from "./createFlowLocation";
import {
  extractV4KeyInfoValues,
  V4_KEY_INFO_MAX_ITEMS,
  V4_KEY_INFO_TITLE,
  type AdditionalInfoRow,
} from "./createFlowV4KeyInfo";

/** Compact slot-0 fields from list RPCs (Home / Created / Saved). */
export type ListCardSlot0Fields = {
  slot0_location_name?: string | null;
  slot0_location_url?: string | null;
  slot0_key_info?: unknown;
};

/** Activity shape the shared Post card reads for pin + Key Details. */
export type ListCardActivity = {
  id?: string;
  title?: string | null;
  images?: string[] | null;
  order_idx?: number | null;
  location_name?: string | null;
  location_desc?: string | null;
  location_url?: string | null;
  location_notes?: string | null;
  additional_info?: AdditionalInfoRow[] | null;
  tags?: string[] | null;
  created_at?: string;
};

/** Keep only V4KeyInfo rows; drop legacy extras. Max 4. */
export function parseSlot0KeyInfo(raw: unknown): AdditionalInfoRow[] {
  if (!Array.isArray(raw)) return [];
  const out: AdditionalInfoRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const rec = row as { title?: unknown; value?: unknown };
    const title = String(rec.title ?? "").trim();
    if (title !== V4_KEY_INFO_TITLE) continue;
    const value = typeof rec.value === "string" ? rec.value : String(rec.value ?? "");
    if (!value.trim()) continue;
    out.push({ title: V4_KEY_INFO_TITLE, value });
    if (out.length >= V4_KEY_INFO_MAX_ITEMS) break;
  }
  return out;
}

export function hasListCardSlot0Payload(fields: ListCardSlot0Fields): boolean {
  if (hasV4VisibleLocation(fields.slot0_location_name, fields.slot0_location_url)) {
    return true;
  }
  return extractV4KeyInfoValues(parseSlot0KeyInfo(fields.slot0_key_info)).length > 0;
}

function slot0CarrierPatch(fields: ListCardSlot0Fields): {
  location_name: string | null;
  location_url: string | null;
  additional_info: AdditionalInfoRow[] | null;
} {
  const name = (fields.slot0_location_name ?? "").trim();
  const url = (fields.slot0_location_url ?? "").trim();
  const keyInfo = parseSlot0KeyInfo(fields.slot0_key_info);
  return {
    location_name: name || null,
    location_url: url || null,
    additional_info: keyInfo.length > 0 ? keyInfo : null,
  };
}

function syntheticCarrier(fields: ListCardSlot0Fields, images: string[] | null): ListCardActivity {
  const patch = slot0CarrierPatch(fields);
  return {
    title: null,
    images,
    order_idx: 0,
    location_name: patch.location_name,
    location_desc: null,
    location_url: patch.location_url,
    location_notes: null,
    additional_info: patch.additional_info,
    tags: null,
  };
}

/**
 * Home shrink mapper: one synthetic slot-0 activity when image and/or
 * location / Key Details exist. Undefined when the card has nothing to show.
 */
export function buildHomeSlot0Activities(opts: {
  images: string[] | null | undefined;
  slot0: ListCardSlot0Fields;
}): ListCardActivity[] | undefined {
  const images =
    Array.isArray(opts.images) && opts.images.length > 0 ? opts.images : null;
  const hasImage = images != null;
  if (!hasImage && !hasListCardSlot0Payload(opts.slot0)) return undefined;
  return [syntheticCarrier(opts.slot0, images)];
}

/**
 * Created/Saved: keep existing thin activity rows (image order), stamp
 * authoritative slot-0 location/Key Details onto index 0.
 */
export function stampSlot0OntoActivities(
  activities: ListCardActivity[] | null | undefined,
  slot0: ListCardSlot0Fields,
): ListCardActivity[] {
  const rows = Array.isArray(activities) ? activities.map((a) => ({ ...a })) : [];
  if (!hasListCardSlot0Payload(slot0)) return rows;
  const patch = slot0CarrierPatch(slot0);
  if (rows.length === 0) {
    return [syntheticCarrier(slot0, null)];
  }
  rows[0] = {
    ...rows[0],
    location_name: patch.location_name,
    location_url: patch.location_url,
    additional_info: patch.additional_info,
  };
  return rows;
}
