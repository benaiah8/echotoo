/**
 * V4 "Key details" (user-facing) stored in activities[].additional_info as title V4KeyInfo.
 * Legacy additional-info rows are preserved; only V4KeyInfo rows are managed here.
 */
import {
  V4_KEY_INFO_MAX_ITEMS,
  V4_KEY_INFO_VALUE_MAX,
} from "./createFlowLimits";

export const V4_KEY_INFO_TITLE = "V4KeyInfo";
export { V4_KEY_INFO_MAX_ITEMS, V4_KEY_INFO_VALUE_MAX };

export type AdditionalInfoRow = { title: string; value: string };

export function isV4KeyInfoRow(
  row: AdditionalInfoRow | null | undefined
): boolean {
  return (row?.title ?? "").trim() === V4_KEY_INFO_TITLE;
}

/** Non-empty additional-info row that is not V4KeyInfo (Duration, Dress Code, etc.). */
export function isLegacyAdditionalInfoRow(
  row: AdditionalInfoRow | null | undefined
): boolean {
  if (!row) return false;
  const title = (row.title ?? "").trim();
  const value = (row.value ?? "").trim();
  if (!title || !value) return false;
  return !isV4KeyInfoRow(row);
}

export function hasLegacyAdditionalInfoContent(
  additionalInfo: AdditionalInfoRow[] | null | undefined
): boolean {
  if (!Array.isArray(additionalInfo)) return false;
  return additionalInfo.some(isLegacyAdditionalInfoRow);
}

/** Clamp live input length; emoji preserved. */
export function clampV4KeyInfoValue(raw: string): string {
  if (raw.length <= V4_KEY_INFO_VALUE_MAX) return raw;
  return raw.slice(0, V4_KEY_INFO_VALUE_MAX);
}

/** Trim + clamp for commit; empty string means no item. */
export function sanitizeV4KeyInfoValueForCommit(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return clampV4KeyInfoValue(trimmed);
}

export function extractV4KeyInfoValues(
  additionalInfo: AdditionalInfoRow[] | null | undefined
): string[] {
  if (!Array.isArray(additionalInfo)) return [];
  return additionalInfo
    .filter(isV4KeyInfoRow)
    .map((r) => r.value ?? "")
    .map((v) => sanitizeV4KeyInfoValueForCommit(v))
    .filter(Boolean)
    .slice(0, V4_KEY_INFO_MAX_ITEMS);
}

export function partitionAdditionalInfo(
  additionalInfo: AdditionalInfoRow[] | null | undefined
): { legacy: AdditionalInfoRow[]; v4KeyInfo: AdditionalInfoRow[] } {
  const legacy: AdditionalInfoRow[] = [];
  const v4KeyInfo: AdditionalInfoRow[] = [];
  if (!Array.isArray(additionalInfo)) return { legacy, v4KeyInfo };

  for (const row of additionalInfo) {
    if (isV4KeyInfoRow(row)) {
      const value = sanitizeV4KeyInfoValueForCommit(row.value ?? "");
      if (value) {
        v4KeyInfo.push({ title: V4_KEY_INFO_TITLE, value });
      }
    } else {
      legacy.push(row);
    }
  }

  return {
    legacy,
    v4KeyInfo: v4KeyInfo.slice(0, V4_KEY_INFO_MAX_ITEMS),
  };
}

/** Legacy rows first (unchanged order), then sanitized V4KeyInfo rows in creation order. */
export function mergeV4KeyInfoIntoAdditionalInfo(
  additionalInfo: AdditionalInfoRow[] | null | undefined,
  values: string[]
): AdditionalInfoRow[] {
  const { legacy } = partitionAdditionalInfo(additionalInfo);
  const v4Rows = values
    .map(sanitizeV4KeyInfoValueForCommit)
    .filter(Boolean)
    .slice(0, V4_KEY_INFO_MAX_ITEMS)
    .map((value) => ({ title: V4_KEY_INFO_TITLE, value }));
  return [...legacy, ...v4Rows];
}

export function stripV4KeyInfoFromAdditionalInfo(
  additionalInfo: AdditionalInfoRow[] | null | undefined
): AdditionalInfoRow[] {
  if (!Array.isArray(additionalInfo)) return [];
  return additionalInfo.filter((row) => !isV4KeyInfoRow(row));
}
