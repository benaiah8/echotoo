import { useEffect } from "react";
import { installUsageAnalytics } from "../lib/usageAnalytics";

/** Signs the usage queue in and out with the Supabase session. Renders nothing. */
export default function UsageAnalyticsMount() {
  useEffect(() => installUsageAnalytics(), []);
  return null;
}
