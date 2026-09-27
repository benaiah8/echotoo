export type PeopleSourceRef = {
  postId: string;
  postType: "hangout" | "experience";
};

export type PairUpOpportunityStatus = "active" | "closed" | "expired";

export type PairUpOpportunity = {
  id: string;
  source_post_id: string;
  status: PairUpOpportunityStatus | string;
  description: string | null;
  discoverable_until: string;
  created_at: string;
};

export type PairUpCandidate = {
  opportunity_id: string;
  source_post_id: string;
  creator_id: string;
  description: string | null;
  discoverable_until: string;
  created_at: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  profile_photos: string[];
  echo_preset: string | null;
  expressed_by_me: boolean;
  profile_id: string | null;
  bio: string | null;
  source_caption: string | null;
  source_type: "hangout" | "experience" | null;
  source_created_at: string | null;
  source_selected_dates: string[] | null;
  source_is_recurring: boolean | null;
  source_recurrence_days: string[] | null;
};

export type PairUpCandidatesPage = {
  candidates: PairUpCandidate[];
  has_more: boolean;
  /** Opaque Discover keyset. My Plans leaves this null. */
  next_cursor?: string | null;
};

export type PeopleSourceListItem = {
  source_post_id: string;
};

export type PeopleSourcesPage = {
  sources: PeopleSourceListItem[];
  has_more: boolean;
};

export type PairUpExpressResult = {
  from_opportunity_id: string;
  to_opportunity_id: string;
  matched: boolean;
};

/** Atomic Discover Connect result. Does not include conversation_id. */
export type PairUpDiscoverConnectResult = {
  opportunity: PairUpOpportunity;
  from_opportunity_id: string;
  to_opportunity_id: string;
  matched: boolean;
};

export type PairUpMatchCompletion = {
  conversation_id: string;
  other_user_id: string;
  source_post_id: string;
  created: boolean;
};

/** Open Plan opportunity (kind=open_plan). Distinct from Pair Up. */
export type OpenPlanOpportunity = {
  id: string;
  source_post_id: string;
  creator_id: string;
  status: PairUpOpportunityStatus | string;
  description: string | null;
  occurs_at: string;
  /** false = date-only intent; never display internal noon clock. Missing → true. */
  occurs_time_explicit: boolean;
  discoverable_until: string;
  created_at: string;
  closed_at: string | null;
};

/**
 * Browse candidate for Open Plans. Intentionally omits display_name, username,
 * profile_id, and creator_id (pre-accept anonymity).
 */
export type OpenPlanCandidate = {
  opportunity_id: string;
  source_post_id: string;
  description: string | null;
  occurs_at: string;
  /** false = date-only intent; never display internal noon clock. Missing → true. */
  occurs_time_explicit: boolean;
  discoverable_until: string;
  created_at: string;
  avatar_url: string | null;
  profile_photos: string[];
  echo_preset: string | null;
  bio: string | null;
  source_caption: string | null;
  source_type: "experience" | null;
  /** Bulk request state for the viewer. Accepted plans are excluded from the deck. */
  my_request_status: "pending" | null;
};

export type OpenPlanCandidatesPage = {
  candidates: OpenPlanCandidate[];
  has_more: boolean;
  next_cursor: string | null;
};

export type OpenPlanRequestStatus =
  | "pending"
  | "accepted"
  | "withdrawn"
  | "declined"
  | "closed";

export type OpenPlanRequest = {
  id: string;
  opportunity_id: string;
  status: OpenPlanRequestStatus | string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
};

/**
 * Creator-side pending Open Plan request card. Intentionally omits
 * requester_id, profile_id, display_name, username (pre-accept anonymity).
 */
export type OpenPlanIncomingRequest = {
  request_id: string;
  opportunity_id: string;
  requested_at: string;
  avatar_url: string | null;
  profile_photos: string[];
  echo_preset: string | null;
  bio: string | null;
  source_post_id: string;
  source_caption: string | null;
  source_type: "experience" | null;
  plan_description: string | null;
  occurs_at: string;
  /** false = date-only intent; never display internal noon clock. Missing → true. */
  occurs_time_explicit: boolean;
  discoverable_until: string;
};

export type OpenPlanIncomingRequestsPage = {
  requests: OpenPlanIncomingRequest[];
  has_more: boolean;
  next_cursor: string | null;
};

/** Anonymous presentation only — never identity fields. */
export type OpenPlanAnonymousPreview = {
  avatar_url: string | null;
  profile_photos: string[];
  echo_preset: string | null;
};

/** Host-side Open Plan request summary — one row per opportunity_id. */
export type OpenPlanRequestGroup = {
  opportunity_id: string;
  source_post_id: string;
  plan_description: string | null;
  source_caption: string | null;
  occurs_at: string | null;
  occurs_time_explicit: boolean;
  pending_count: number;
  latest_request_at: string;
  latest_request_id: string;
  preview_requesters: OpenPlanAnonymousPreview[];
};

export type OpenPlanRequestGroupsPage = {
  groups: OpenPlanRequestGroup[];
  has_more: boolean;
  next_cursor: string | null;
};

/**
 * Lazy overlay requester for one Open Plan.
 * display_name + profile_open_key only when identity_visible_to_host was set at submit.
 * Parser still strips leaked requester_id / profile_id / username / email.
 */
export type OpenPlanRequester = {
  request_id: string;
  requested_at: string;
  /** Null when grandfathered / old client / flag false. */
  display_name: string | null;
  /**
   * Username or user_id for OtherProfilePage when disclosed; null otherwise.
   * Never invent from display_name.
   */
  profile_open_key: string | null;
  avatar_url: string | null;
  profile_photos: string[];
  echo_preset: string | null;
  bio: string | null;
};

export type OpenPlanRequestersPage = {
  requests: OpenPlanRequester[];
  has_more: boolean;
  next_cursor: string | null;
};

/** Accept → DM result. No requester identity fields. */
export type OpenPlanAcceptResult = {
  accepted: boolean;
  reason: string | null;
  request: OpenPlanRequest | null;
  conversation_id: string | null;
};

/** Group Up opportunity (kind=group_up). Linked to persistent group conversation. */
export type GroupUpOpportunity = {
  id: string;
  source_post_id: string;
  creator_id: string;
  conversation_id: string;
  status: PairUpOpportunityStatus | string;
  description: string | null;
  occurs_at: string | null;
  /** false = date-only intent; never display internal noon. Missing → true. */
  occurs_time_explicit: boolean;
  discoverable_until: string;
  created_at: string;
  closed_at: string | null;
};

/** Linked Event/Place context for Group Up thread/settings (G1.3). G2 browse uses conversation title/description separately. */
export type GroupUpSourceContext = {
  source_post_id: string;
  post_type: "hangout" | "experience";
  caption: string | null;
  is_recurring: boolean | null;
  selected_dates: string[] | null;
  recurrence_days: string[] | null;
  group_up_occurs_at: string | null;
};

export type GroupUpViewerState = "owner" | "pending" | "none" | "member";

/**
 * Profile rail Duo sub-payload (list_profile_social_opportunities).
 * Present only when the profile subject CREATED an active pair_up for the post.
 */
export type ProfileSocialDuoPayload = {
  opportunity_id: string;
  viewer_duo_joined: boolean;
  /**
   * Client-only Profile Connect interest flag (not returned by RPC).
   * Set after Profile Connect so Connect can stay active independently of Duo-only join.
   */
  viewer_profile_connected?: boolean;
};

/**
 * Profile rail hosted Group sub-payload.
 * Present only when the profile subject CREATED/HOSTS an active group_up.
 * Joined/member-only Groups are never returned.
 */
export type ProfileSocialGroupPayload = {
  opportunity_id: string;
  group_title: string | null;
  occurs_at: string | null;
  occurs_time_explicit: boolean | null;
  viewer_group_state: "none" | "pending" | "member" | null;
  request_id: string | null;
};

/**
 * Post-centric Profile social-opportunity rail row.
 * One source_post_id per item; duo and/or group may be present (never neither).
 * No match/DM/peer identities. No owner Discover preference field.
 */
export type ProfileSocialOpportunity = {
  source_post_id: string;
  source_type: "hangout" | "experience";
  source_caption: string | null;
  source_cover_url: string | null;
  source_author_id: string;
  source_author_profile_id: string | null;
  /** Source-post author public identity (not necessarily the profile subject). */
  source_author_display_name: string | null;
  source_author_username: string | null;
  source_author_avatar_url: string | null;
  source_selected_dates: string[] | null;
  source_recurrence_days: string[] | null;
  source_is_recurring: boolean | null;
  /** Earliest created_at among present Duo/Group sides (RPC). */
  created_at: string;
  duo: ProfileSocialDuoPayload | null;
  group: ProfileSocialGroupPayload | null;
};

export type ProfileSocialOpportunitiesPage = {
  opportunities: ProfileSocialOpportunity[];
};

/** Group Up browse deck row (G2+). */
export type GroupUpCandidate = {
  /**
   * Discovery/request opportunity id. Null when membership survives after
   * source post deletion (`source_unavailable`).
   */
  opportunity_id: string | null;
  conversation_id: string;
  /** Null when `source_unavailable`. */
  source_post_id: string | null;
  group_title: string | null;
  group_description: string | null;
  occurs_at: string | null;
  /** false = date-only intent; never display internal noon. Missing → true. */
  occurs_time_explicit: boolean;
  /** Empty/null when source unavailable. */
  discoverable_until: string | null;
  created_at: string;
  /** Null when `source_unavailable`. */
  source_type: "hangout" | "experience" | null;
  source_caption: string | null;
  source_selected_dates: string[] | null;
  source_recurrence_days: string[] | null;
  source_is_recurring: boolean | null;
  /** Host/creator; falls back to conversations.created_by when source gone. */
  organizer_user_id: string | null;
  organizer_display_name: string | null;
  organizer_username: string | null;
  organizer_avatar_url: string | null;
  organizer_echo_preset: string | null;
  member_count: number;
  viewer_state: GroupUpViewerState;
  request_id: string | null;
  /**
   * Membership survives but original source post/opportunity is gone.
   * Default false for browse/discovery rows.
   */
  source_unavailable: boolean;
};

export type GroupUpCandidatesPage = {
  candidates: GroupUpCandidate[];
  has_more: boolean;
  next_cursor: string | null;
};

/** Persistent Yours Host|Member page (one row per conversation). */
export type GroupUpMembershipsPage = {
  memberships: GroupUpCandidate[];
  has_more: boolean;
  next_cursor: string | null;
};

export type GroupUpRequest = {
  id: string;
  opportunity_id: string;
  status: string;
  created_at: string;
  updated_at?: string | null;
  resolved_at?: string | null;
};

/** Host-side pending Group Up request (identified requester). */
export type GroupUpIncomingRequest = {
  request_id: string;
  opportunity_id: string;
  conversation_id: string;
  requested_at: string;
  requester_user_id: string;
  requester_profile_id: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  profile_photos: string[];
  echo_preset: string | null;
  bio: string | null;
  title: string | null;
  description: string | null;
  source_post_id: string;
  source_type: "hangout" | "experience" | null;
  source_caption: string | null;
  occurs_at: string | null;
  /** false = date-only intent; never display internal noon. Missing → true. */
  occurs_time_explicit: boolean;
  discoverable_until: string | null;
  member_count: number;
};

export type GroupUpIncomingRequestsPage = {
  requests: GroupUpIncomingRequest[];
  has_more: boolean;
  next_cursor: string | null;
};

/** Host-side Group Up request summary — one row per conversation_id (G4). */
export type GroupUpRequestGroup = {
  conversation_id: string;
  opportunity_id: string;
  group_title: string | null;
  description: string | null;
  source_post_id: string;
  source_type: "hangout" | "experience" | null;
  latest_request_at: string;
  latest_request_id: string;
  pending_count: number;
  new_count: number;
  /** Opportunity meetup; null when undated or missing from older cache. */
  occurs_at: string | null;
  /** false = date-only; missing/legacy → true via parser. */
  occurs_time_explicit: boolean;
};

export type GroupUpRequestGroupsPage = {
  groups: GroupUpRequestGroup[];
  has_more: boolean;
  next_cursor: string | null;
};

/** Lazy overlay requester row for one Group Up conversation (G4). */
export type GroupUpRequester = {
  request_id: string;
  opportunity_id: string;
  conversation_id: string;
  requested_at: string;
  requester_user_id: string;
  requester_profile_id: string | null;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  profile_photos: string[];
  echo_preset: string | null;
  bio: string | null;
};

export type GroupUpRequestersPage = {
  requests: GroupUpRequester[];
  has_more: boolean;
  next_cursor: string | null;
};

export type GroupUpMarkSeenResult = {
  ok: boolean;
  advanced: boolean;
  conversation_id: string | null;
  last_seen_request_at: string | null;
  last_seen_request_id: string | null;
};

export type GroupUpAcceptResult = {
  accepted: boolean;
  reason: string | null;
  request: GroupUpRequest | null;
  opportunity_id: string | null;
  conversation_id: string | null;
  requester_user_id: string | null;
};

export type GroupUpDeclineResult = {
  declined: boolean;
  request: GroupUpRequest | null;
  opportunity_id: string | null;
  conversation_id: string | null;
  requester_user_id: string | null;
};

export type GroupUpRequestErrorKind =
  | "unavailable"
  | "full"
  | "already_member"
  | "declined"
  | "blocked"
  | "unknown";
