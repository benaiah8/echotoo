/** Capacitor-friendly: no-op on web if plugin missing. */
export async function hapticImpactLight(): Promise<void> {
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Web or plugin not synced — ignore
  }
}
