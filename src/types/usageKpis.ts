export type UsageWindowDays = 1 | 7 | 30;

export type UsageMetricCounts = {
  events: number;
  actors: number;
};

export type UsageKpiMetric =
  | "app_active"
  | "people_visit"
  | "tab_discover"
  | "tab_duo"
  | "tab_plans"
  | "tab_groups"
  | "duo_express"
  | "duo_withdraw"
  | "duo_complete"
  | "post_detail_open"
  | "profile_view"
  | "post_save"
  | "post_unsave";

export type UsageKpis = {
  windowDays: UsageWindowDays;
  usage: Record<UsageKpiMetric, UsageMetricCounts>;
  product: {
    commentsCreated: number;
    openPlanRequestsCreated: number;
    groupUpRequestsCreated: number;
    duoJoinsCreated: number;
    currentSavesCreated: number;
  };
};
