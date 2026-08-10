/**
 * Load and dedupe push device targets for recipient auth user IDs.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type {
  DeviceRowPlatformCounts,
  LoadPushDeviceTargetsResult,
  PlatformCounts,
  PushDevicePlatform,
  PushDeviceTarget,
} from "./types.ts";

export function isPushDevicePlatform(
  value: unknown
): value is PushDevicePlatform {
  return value === "android" || value === "ios";
}

export function emptyPlatformCounts(): PlatformCounts {
  return { android: 0, ios: 0 };
}

export function emptyDeviceRowPlatformCounts(): DeviceRowPlatformCounts {
  return { android: 0, ios: 0, other: 0 };
}

export function countDeviceRowsByPlatform(
  rows: unknown[] | null
): DeviceRowPlatformCounts {
  const counts = emptyDeviceRowPlatformCounts();
  for (const row of rows ?? []) {
    const platform = (row as { platform?: unknown }).platform;
    if (isPushDevicePlatform(platform)) {
      counts[platform]++;
    } else {
      counts.other++;
    }
  }
  return counts;
}

export function countTargetsByPlatform(
  targets: PushDeviceTarget[]
): PlatformCounts {
  const counts = emptyPlatformCounts();
  for (const target of targets) {
    counts[target.platform]++;
  }
  return counts;
}

function dedupePushDeviceTargets(
  deviceRows: unknown[] | null
): PushDeviceTarget[] {
  const targetByPlatformAndToken = new Map<string, PushDeviceTarget>();
  for (const row of deviceRows ?? []) {
    const token = ((row as { token?: string | null }).token ?? "").trim();
    const platform = (row as { platform?: unknown }).platform;
    if (!token || !isPushDevicePlatform(platform)) continue;
    targetByPlatformAndToken.set(`${platform}:${token}`, { token, platform });
  }
  return [...targetByPlatformAndToken.values()];
}

export type LoadPushDeviceTargetsOptions = {
  platforms?: PushDevicePlatform[];
  logPrefix?: string;
};

/**
 * Query push_devices for recipient auth IDs and dedupe by `${platform}:${token}`.
 */
export async function loadPushDeviceTargets(
  supabaseAdmin: SupabaseClient,
  recipientAuthUserIds: string[],
  options?: LoadPushDeviceTargetsOptions
): Promise<LoadPushDeviceTargetsResult> {
  const logPrefix = options?.logPrefix ?? "[push]";
  const platforms = options?.platforms ?? ["android", "ios"];

  const { data: deviceRows, error: devicesError } = await supabaseAdmin
    .from("push_devices")
    .select("token, user_id, platform")
    .in("user_id", recipientAuthUserIds)
    .in("platform", platforms);

  if (devicesError) {
    console.error(`${logPrefix} push_devices:`, devicesError.message);
    return {
      ok: false,
      skipped: "push_devices_read_failed",
      message: devicesError.message,
    };
  }

  const rawDevicePlatformCounts = countDeviceRowsByPlatform(deviceRows ?? []);
  console.log(`${logPrefix} push device rows`, {
    rawDeviceRowCount: deviceRows?.length ?? 0,
    byPlatform: rawDevicePlatformCounts,
  });

  const targets = dedupePushDeviceTargets(deviceRows ?? []);
  const attemptedByPlatform = countTargetsByPlatform(targets);
  console.log(`${logPrefix} push targets after dedupe`, {
    pushTargetCount: targets.length,
    byPlatform: attemptedByPlatform,
  });

  return {
    ok: true,
    targets,
    rawDeviceRowCount: deviceRows?.length ?? 0,
    rawDevicePlatformCounts,
    attemptedByPlatform,
  };
}
