/**
 * Compact company announcement surface (FrostedCenterModal).
 * Not OwlMessageModal / owl tips / invite announcement threads.
 *
 * User close (X / backdrop / Got it) only dismisses this modal for the viewer.
 * It does not deactivate the announcement globally (admin uses is_active).
 */

import { useEffect, useRef, useState } from "react";
import { PiMegaphone, PiX } from "react-icons/pi";
import FrostedCenterModal, {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "./ui/FrostedCenterModal";
import {
  socialPillExtrusionClassName,
  socialPillFaceClassName,
  socialPillHitClassName,
  socialPillStackClassName,
} from "../lib/socialActionUi";
import {
  closeCompanyAnnouncementModal,
  markLoadedCompanyAnnouncementsSeen,
  useCompanyAnnouncementStore,
} from "../lib/companyAnnouncementStore";
import type { CompanyAnnouncementRuntimeItem } from "../types/companyAnnouncement";

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function metadataLine(iso: string | null | undefined): string {
  if (!iso) return "ECHOTOO";
  return `${formatWhen(iso)} · ECHOTOO`;
}

export default function CompanyAnnouncementModal() {
  const { modalOpen, items } = useCompanyAnnouncementStore();
  const markedForOpenRef = useRef<string | null>(null);
  /** Snapshot at open so a later hydrate (e.g. admin deactivate) does not blank mid-read. */
  const [displayItems, setDisplayItems] = useState<
    CompanyAnnouncementRuntimeItem[]
  >([]);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (modalOpen && !wasOpenRef.current) {
      setDisplayItems(items);
    }
    if (!modalOpen) {
      setDisplayItems([]);
    }
    wasOpenRef.current = modalOpen;
  }, [modalOpen, items]);

  useEffect(() => {
    if (!modalOpen) {
      markedForOpenRef.current = null;
      return;
    }
    const fingerprint = items.map((i) => i.id).join(",");
    if (!fingerprint) return;
    if (markedForOpenRef.current === fingerprint) return;
    let cancelled = false;
    void (async () => {
      const result = await markLoadedCompanyAnnouncementsSeen();
      if (cancelled) return;
      if (result.ok) {
        markedForOpenRef.current = fingerprint;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, items]);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeCompanyAnnouncementModal();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  const handleClose = () => {
    closeCompanyAnnouncementModal();
  };

  const shown = displayItems.length > 0 ? displayItems : items;
  const primary = shown[0] ?? null;
  const headingTitle = primary?.title?.trim() || "Announcement";

  return (
    <FrostedCenterModal
      open={modalOpen}
      onBackdropClick={handleClose}
      zTier="dialog"
      role="dialog"
      aria-labelledby="company-announcement-modal-title"
      aria-label={headingTitle}
      containerClassName="items-center px-4"
    >
      <div
        className={[
          frostedModalPanelClassName,
          "flex max-h-[80vh] w-full flex-col overflow-hidden !p-0",
          "app-light:shadow-[0_16px_48px_rgba(0,0,0,0.10)]",
          "app-dark:shadow-[0_16px_48px_rgba(0,0,0,0.48)]",
        ].join(" ")}
        style={{
          ...frostedModalPanelStyle,
          maxWidth: "min(420px, 92vw)",
          padding: undefined,
        }}
        onClick={(e) => e.stopPropagation()}
        data-company-announcement-modal="1"
      >
        {/* Header: icon + real title + X */}
        <div className="flex shrink-0 items-start gap-2.5 px-5 pt-4 pb-2.5">
          <span
            className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand)]/18 text-[var(--text)] app-dark:bg-[var(--brand)]/22"
            aria-hidden
          >
            <PiMegaphone className="h-[16px] w-[16px]" />
          </span>
          <h2
            id="company-announcement-modal-title"
            className="min-w-0 flex-1 pt-0.5 text-[18px] font-bold leading-snug tracking-[-0.015em] text-[var(--text)] app-light:text-neutral-950 app-dark:text-white/[0.98]"
          >
            {headingTitle}
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 -mr-1 flex h-9 w-9 items-center justify-center rounded-xl text-[var(--text)]/65 transition hover:bg-[var(--surface-2)] hover:text-[var(--text)] touch-manipulation"
            aria-label="Close"
            data-company-announcement-close-x="1"
          >
            <PiX className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* Body — message(s); scrolls only after panel hits ~80vh */}
        <div className="min-h-0 overflow-y-auto overscroll-contain px-5 text-left">
          {shown.length === 0 ? (
            <p className="pb-2 text-[13px] leading-relaxed text-[var(--text)]/65">
              No active announcements right now.
            </p>
          ) : (
            <div className="space-y-5 pb-1">
              {shown.map((item, index) => (
                <article
                  key={item.id}
                  className={
                    index > 0
                      ? "border-t border-[var(--border)]/55 pt-5"
                      : undefined
                  }
                >
                  {index > 0 ? (
                    <h3 className="mb-2 text-[16px] font-semibold leading-snug tracking-[-0.01em] text-[var(--text)]">
                      {item.title}
                    </h3>
                  ) : null}
                  <p className="text-[14px] leading-[1.55] text-[var(--text)]/80 app-light:text-neutral-800/92 app-dark:text-white/78 whitespace-pre-wrap">
                    {item.message}
                  </p>
                  <p className="mt-3 text-[11px] leading-none text-[var(--text)]/42">
                    {metadataLine(item.created_at)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </div>

        {/* Compact left-aligned Got it (Duo/Group extrusion) */}
        <div className="flex shrink-0 justify-start px-5 pt-4 pb-5">
          <button
            type="button"
            onClick={handleClose}
            className={socialPillHitClassName("shrink-0")}
            data-company-announcement-close-primary="1"
            aria-label="Got it"
          >
            <span className={socialPillStackClassName()}>
              <span
                className={socialPillExtrusionClassName("active")}
                aria-hidden
              />
              <span
                className={socialPillFaceClassName({
                  tone: "active",
                  className:
                    "!h-7 min-w-0 px-3.5 text-[13px] font-bold tracking-[0.01em]",
                })}
              >
                Got it
              </span>
            </span>
          </button>
        </div>
      </div>
    </FrostedCenterModal>
  );
}
