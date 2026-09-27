/**
 * Mine atmosphere identity gate — shared by Overlay handler + regression tests.
 *
 * Authoritative identity must be synchronized in a *parent useLayoutEffect*
 * before child passive effects report atmosphere readiness (React runs layout
 * effects before passive effects; child layout still precedes parent layout,
 * but parent layout still precedes all passive effects).
 */

export function isMineAtmosphereReportAuthoritative(args: {
  reportIdentityKey: string;
  authoritativeIdentityKey: string | null;
}): boolean {
  const { reportIdentityKey, authoritativeIdentityKey } = args;
  if (authoritativeIdentityKey == null) return false;
  return reportIdentityKey === authoritativeIdentityKey;
}

/**
 * Whether Overlay should apply a readiness report to crossfade state.
 * Not-ready reports are ignored so the previous wash is retained.
 */
export function shouldApplyMineAtmosphereReport(args: {
  reportIdentityKey: string;
  authoritativeIdentityKey: string | null;
  ready: boolean;
}): boolean {
  if (!args.ready) return false;
  return isMineAtmosphereReportAuthoritative(args);
}

/**
 * Simulate A→B commit ordering.
 * `layoutSyncFirst: true` matches parent useLayoutEffect before child useEffect.
 * `layoutSyncFirst: false` reproduces the rejected-report race (parent useEffect).
 */
export function simulateMineAtmosphereIdentityCommit(args: {
  fromIdentity: string;
  toIdentity: string;
  layoutSyncFirst: boolean;
  reportReady: boolean;
}): { accepted: boolean; finalRef: string } {
  const ref = { current: args.fromIdentity as string | null };
  let accepted = false;

  const childPassiveReport = () => {
    accepted = shouldApplyMineAtmosphereReport({
      reportIdentityKey: args.toIdentity,
      authoritativeIdentityKey: ref.current,
      ready: args.reportReady,
    });
  };

  const parentLayoutSync = () => {
    ref.current = args.toIdentity;
  };

  if (args.layoutSyncFirst) {
    parentLayoutSync();
    childPassiveReport();
  } else {
    childPassiveReport();
    parentLayoutSync();
  }

  return { accepted, finalRef: ref.current ?? "" };
}
