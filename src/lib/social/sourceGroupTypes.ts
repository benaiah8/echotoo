import type { GroupUpViewerState } from "../people/types";

/** Slim source-overlay Group row (presentation-agnostic). */
export type SourceGroupRow = {
  opportunity_id: string;
  conversation_id: string;
  source_post_id: string;
  group_title: string | null;
  group_description: string | null;
  occurs_at: string | null;
  /** false = date-only intent; never display internal noon. Missing → true. */
  occurs_time_explicit: boolean;
  discoverable_until: string;
  created_at: string;
  source_type: "hangout" | "experience";
  organizer_user_id: string;
  organizer_display_name: string | null;
  organizer_username: string | null;
  organizer_avatar_url: string | null;
  organizer_echo_preset: string | null;
  member_count: number;
  viewer_state: GroupUpViewerState;
  request_id: string | null;
};

export type SourceGroupListPage = {
  candidates: SourceGroupRow[];
  has_more: boolean;
  next_cursor: string | null;
};

export type { GroupUpViewerState };
