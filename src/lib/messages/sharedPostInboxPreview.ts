import { postTypeNotificationPhrase } from "../postTypeLabels";

const PREVIEW_MAX = 200;

/** Inbox line for a shared_post. Duo comments stay neutral and may include the note. */
export function sharedPostInboxPreview(input: {
  note: string | null | undefined;
  postType: string | null | undefined;
  origin?: string | null;
}): string {
  const note = (input.note ?? "").trim();
  if (input.origin === "duo") {
    if (note.length > 0) return `Duo comment · ${note}`.slice(0, PREVIEW_MAX);
    return "Duo comment";
  }
  const label = `Shared ${postTypeNotificationPhrase(input.postType)}`;
  if (note.length > 0) return `${label} · ${note}`.slice(0, PREVIEW_MAX);
  return label;
}
