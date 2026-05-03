/**
 * Front-end registry for activity additional-info rows (title/value).
 * Matches persisted `title` strings; backward-compatible with legacy "Other".
 */

import type { ComponentType, SVGProps } from "react";
import {
  PiBaby,
  PiCloudRain,
  PiCurrencyCircleDollar,
  PiDress,
  PiPhone,
  PiPencilSimple,
  PiScroll,
  PiShieldWarning,
  PiClock,
  PiWheelchair,
  PiBackpack,
  PiDotsThree,
} from "react-icons/pi";

export type AdditionalInfoTone =
  | "neutral"
  | "emphasis"
  | "caution"
  | "rules"
  | "contact"
  | "access"
  | "meta";

export type AdditionalInfoRegistryEntry = {
  /** Canonical title stored in DB */
  canonicalTitle: string;
  /** Alternative stored titles */
  aliases?: string[];
  displayLabel: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone: AdditionalInfoTone;
  /** Reserved for feed/card surfacing (higher = more prominent); unused in phase 1 */
  feedPriority: number;
};

const ENTRIES: AdditionalInfoRegistryEntry[] = [
  {
    canonicalTitle: "Duration",
    displayLabel: "Duration",
    Icon: PiClock,
    tone: "meta",
    feedPriority: 2,
  },
  {
    canonicalTitle: "Dress Code / Attire",
    displayLabel: "Dress code",
    Icon: PiDress,
    tone: "neutral",
    feedPriority: 0,
  },
  {
    canonicalTitle: "What to Bring",
    displayLabel: "What to bring",
    Icon: PiBackpack,
    tone: "neutral",
    feedPriority: 0,
  },
  {
    canonicalTitle: "Warnings / Advisories",
    aliases: ["Warnings / advisories"],
    displayLabel: "Warnings",
    Icon: PiShieldWarning,
    tone: "caution",
    feedPriority: 2,
  },
  {
    canonicalTitle: "Rules / Guidelines",
    displayLabel: "Rules",
    Icon: PiScroll,
    tone: "rules",
    feedPriority: 1,
  },
  {
    canonicalTitle: "Cost Breakdown",
    displayLabel: "Cost",
    Icon: PiCurrencyCircleDollar,
    tone: "emphasis",
    feedPriority: 3,
  },
  {
    canonicalTitle: "Weather Contingency",
    displayLabel: "Weather",
    Icon: PiCloudRain,
    tone: "neutral",
    feedPriority: 0,
  },
  {
    canonicalTitle: "Accessibility",
    displayLabel: "Accessibility",
    Icon: PiWheelchair,
    tone: "access",
    feedPriority: 2,
  },
  {
    canonicalTitle: "Age-Suitability",
    displayLabel: "Age",
    Icon: PiBaby,
    tone: "neutral",
    feedPriority: 0,
  },
  {
    canonicalTitle: "Host Contact Info",
    displayLabel: "Contact",
    Icon: PiPhone,
    tone: "contact",
    feedPriority: 2,
  },
  {
    canonicalTitle: "Custom",
    aliases: ["Other"],
    displayLabel: "Custom",
    Icon: PiPencilSimple,
    tone: "neutral",
    feedPriority: 0,
  },
];

function normalizeKey(s: string): string {
  return s.trim().toLowerCase();
}

export function resolveAdditionalInfoEntry(
  storedTitle: string
): AdditionalInfoRegistryEntry | null {
  const n = normalizeKey(storedTitle);
  for (const e of ENTRIES) {
    if (normalizeKey(e.canonicalTitle) === n) return e;
    if (e.aliases?.some((a) => normalizeKey(a) === n)) return e;
  }
  return null;
}

/** Label shown in UI (chip / detail row header). */
export function getAdditionalInfoDisplayLabel(storedTitle: string): string {
  const e = resolveAdditionalInfoEntry(storedTitle);
  if (e) return e.displayLabel;
  const t = storedTitle.trim();
  if (normalizeKey(t) === "other") return "Custom";
  return t || "Detail";
}

export function getAdditionalInfoIcon(
  storedTitle: string
): ComponentType<SVGProps<SVGSVGElement>> {
  return resolveAdditionalInfoEntry(storedTitle)?.Icon ?? PiDotsThree;
}

/**
 * Main additional-info editor: non-generic label for the value field (create flow).
 */
export function getAdditionalInfoValueFieldLabel(storedTitle: string): string {
  const e = resolveAdditionalInfoEntry(storedTitle);
  if (!e) {
    const t = storedTitle.trim();
    if (!t) return "What to include";
    return `What to include for “${t}”`;
  }
  switch (e.canonicalTitle) {
    case "Custom":
      return "What to say for this custom detail";
    case "Duration":
      return "Expected duration";
    case "Dress Code / Attire":
      return "Dress code for guests";
    case "What to Bring":
      return "What people should bring";
    case "Warnings / Advisories":
      return "Warnings and advisories";
    case "Rules / Guidelines":
      return "Rules and guidelines";
    case "Cost Breakdown":
      return "Price and cost details";
    case "Weather Contingency":
      return "Weather backup plan";
    case "Accessibility":
      return "Accessibility details";
    case "Age-Suitability":
      return "Age suitability";
    case "Host Contact Info":
      return "Contact information";
    default:
      return "What to include";
  }
}

/** Type-specific placeholder for the value textarea (create flow). */
export function getAdditionalInfoValuePlaceholder(
  storedTitle: string
): string {
  const e = resolveAdditionalInfoEntry(storedTitle);
  if (!e) return "Write the details here…";
  switch (e.canonicalTitle) {
    case "Custom":
      return "Write the details here…";
    case "Duration":
      return "Add the expected duration…";
    case "Dress Code / Attire":
      return "Describe what guests should wear…";
    case "What to Bring":
      return "List what people should bring…";
    case "Warnings / Advisories":
      return "Add any warnings or advisories…";
    case "Rules / Guidelines":
      return "Write the rules or guidelines…";
    case "Cost Breakdown":
      return "Explain the price or cost details…";
    case "Weather Contingency":
      return "Describe what happens if weather changes…";
    case "Accessibility":
      return "Share accessibility notes for guests…";
    case "Age-Suitability":
      return "Note age ranges or suitability…";
    case "Host Contact Info":
      return "Phone, email, or how to reach you…";
    default:
      return "Write the details here…";
  }
}

/** Chip / compact row: border + soft fill by tone (create flow). */
export function additionalInfoToneChipClasses(tone: AdditionalInfoTone): string {
  switch (tone) {
    case "emphasis":
      return "border-[color-mix(in_oklab,var(--brand)_55%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_14%,transparent)] shadow-[0_0_20px_-8px_rgba(247,208,71,0.35)]";
    case "caution":
      return "border-amber-500/35 bg-amber-500/[0.08]";
    case "rules":
      return "border-violet-400/30 bg-violet-500/[0.07]";
    case "contact":
      return "border-sky-400/35 bg-sky-500/[0.08]";
    case "access":
      return "border-emerald-400/30 bg-emerald-500/[0.07]";
    case "meta":
      return "border-[var(--create-border-panel-line-soft)] bg-[color-mix(in_oklab,var(--surface)_32%,transparent)]";
    default:
      return "border-[var(--create-border-panel-line-soft)] bg-[color-mix(in_oklab,var(--surface)_26%,transparent)]";
  }
}

/** Post detail / preview row surface */
export function additionalInfoToneRowClasses(tone: AdditionalInfoTone): string {
  switch (tone) {
    case "emphasis":
      return "border-[color-mix(in_oklab,var(--brand)_45%,var(--border))] bg-[color-mix(in_oklab,var(--brand)_10%,transparent)]";
    case "caution":
      return "border-amber-500/25 bg-amber-500/[0.06]";
    case "rules":
      return "border-violet-400/25 bg-violet-500/[0.05]";
    case "contact":
      return "border-sky-400/25 bg-sky-500/[0.06]";
    case "access":
      return "border-emerald-400/25 bg-emerald-500/[0.05]";
    case "meta":
      return "border-[var(--border)] bg-[var(--surface)]/40";
    default:
      return "border-[var(--border)] bg-[var(--surface)]/30";
  }
}

/**
 * Icon wells for additional-info (dropdown options, semantic rows).
 * EchoToo yellow brand accent — soft fill, inset highlight, diffuse glow (light + dark).
 */
export function additionalInfoIconWrapClasses(tone: AdditionalInfoTone): string {
  const brandVeil =
    "shadow-[inset_0_1px_0_color-mix(in_oklab,var(--brand)_26%,transparent),0_0_18px_-6px_color-mix(in_oklab,var(--brand)_30%,transparent)]";

  switch (tone) {
    case "emphasis":
      return [
        "border border-[color-mix(in_oklab,var(--brand)_58%,var(--border))]",
        "bg-[color-mix(in_oklab,var(--brand)_28%,transparent)] text-[var(--brand-dark)]",
        brandVeil,
      ].join(" ");
    case "caution":
      return [
        "border border-[color-mix(in_oklab,var(--brand)_34%,rgb(245_158_11_/_0.4))]",
        "bg-[color-mix(in_oklab,var(--brand)_12%,rgb(245_158_11_/_0.12))]",
        "text-amber-800 app-dark:text-amber-200",
        brandVeil,
      ].join(" ");
    case "rules":
      return [
        "border border-[color-mix(in_oklab,var(--brand)_32%,rgb(139_92_246_/_0.38))]",
        "bg-[color-mix(in_oklab,var(--brand)_10%,rgb(139_92_246_/_0.11))]",
        "text-violet-800 app-dark:text-violet-200",
        brandVeil,
      ].join(" ");
    case "contact":
      return [
        "border border-[color-mix(in_oklab,var(--brand)_32%,rgb(14_165_233_/_0.38))]",
        "bg-[color-mix(in_oklab,var(--brand)_10%,rgb(14_165_233_/_0.11))]",
        "text-sky-800 app-dark:text-sky-200",
        brandVeil,
      ].join(" ");
    case "access":
      return [
        "border border-[color-mix(in_oklab,var(--brand)_32%,rgb(16_185_129_/_0.38))]",
        "bg-[color-mix(in_oklab,var(--brand)_10%,rgb(16_185_129_/_0.11))]",
        "text-emerald-800 app-dark:text-emerald-200",
        brandVeil,
      ].join(" ");
    case "meta":
      return [
        "border border-[color-mix(in_oklab,var(--brand)_42%,var(--border))]",
        "bg-[color-mix(in_oklab,var(--brand)_14%,var(--surface-2))]",
        "text-[color-mix(in_oklab,var(--brand-dark)_82%,var(--text))]",
        brandVeil,
      ].join(" ");
    default:
      return [
        "border border-[color-mix(in_oklab,var(--brand)_44%,var(--border))]",
        "bg-[color-mix(in_oklab,var(--brand)_16%,var(--surface-2))]",
        "text-[color-mix(in_oklab,var(--brand-dark)_78%,var(--text))]",
        brandVeil,
      ].join(" ");
  }
}

/** Inline icons inside create-flow chips — emphasis only (no layout change). */
export function additionalInfoChipInlineIconClasses(tone: AdditionalInfoTone): string {
  switch (tone) {
    case "emphasis":
      return "text-[var(--brand-dark)] drop-shadow-[0_0_9px_color-mix(in_oklab,var(--brand)_42%,transparent)]";
    case "caution":
      return "text-amber-700 app-dark:text-amber-200 drop-shadow-[0_0_8px_color-mix(in_oklab,var(--brand)_28%,transparent)]";
    case "rules":
      return "text-violet-700 app-dark:text-violet-200 drop-shadow-[0_0_8px_color-mix(in_oklab,var(--brand)_26%,transparent)]";
    case "contact":
      return "text-sky-700 app-dark:text-sky-200 drop-shadow-[0_0_8px_color-mix(in_oklab,var(--brand)_26%,transparent)]";
    case "access":
      return "text-emerald-700 app-dark:text-emerald-200 drop-shadow-[0_0_8px_color-mix(in_oklab,var(--brand)_26%,transparent)]";
    case "meta":
      return "text-[color-mix(in_oklab,var(--brand-dark)_72%,var(--text))] drop-shadow-[0_0_8px_color-mix(in_oklab,var(--brand)_30%,transparent)]";
    default:
      return "text-[color-mix(in_oklab,var(--brand-dark)_68%,var(--text))] drop-shadow-[0_0_8px_color-mix(in_oklab,var(--brand)_28%,transparent)]";
  }
}

/** Ordered option labels for the add-detail dropdown (Custom first). */
export const ADDITIONAL_INFO_DROPDOWN_ORDER: string[] = [
  "Custom",
  "Duration",
  "Dress Code / Attire",
  "What to Bring",
  "Warnings / Advisories",
  "Rules / Guidelines",
  "Cost Breakdown",
  "Weather Contingency",
  "Accessibility",
  "Age-Suitability",
  "Host Contact Info",
];
