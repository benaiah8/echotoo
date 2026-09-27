import {
  PiArrowClockwiseBold,
  PiChatCircleBold,
  PiCheckBold,
  PiHandshakeBold,
  PiUserPlusBold,
} from "react-icons/pi";
import {
  peopleShellActionFaceClass,
  peopleShellActionExtrusionClass,
  type PeopleShellActionIcon,
  type PeopleShellPrimaryAction,
} from "./peopleShellPrimaryAction";
import {
  PEOPLE_ACTION_CIRCLE_PX,
  PEOPLE_ACTION_TO_NAV_GAP_PX,
  PEOPLE_EXTRUSION_PX,
  PEOPLE_MINE_ACTION_TO_NAV_GAP_PX,
  PEOPLE_MINE_CONNECT_H_PX,
  PEOPLE_MINE_CONNECT_PILL_PAD_X_PX,
  PEOPLE_PRESS_DURATION_MS,
  PEOPLE_SHELL_Z_ABOVE_BOTTOM_TAB,
  peopleShellDockBottomOffset,
  type PeopleFlatDestination,
} from "./peopleShellLayout";
import PeopleFluidNav, {
  type PeopleGroupsPillState,
} from "./PeopleFluidNav";
import { peopleUiCopy } from "./peopleUiCopy";

/**
 * People Shell V12.3 bottom cluster:
 * single-layer compact primary action (Connect / Join / I'm down share one pill)
 * + unified frosted nav. No dock gradient / no action extrusion backplate.
 */
export default function PeopleBottomDock({
  activeDestination,
  discoverEnabled,
  groupsYoursActive = false,
  groupsPillState = "inactive",
  onBack,
  onSelectDuo,
  onSelectDiscover,
  onSelectPlans,
  onSelectGroups,
  primaryAction,
  mineCompactConnect = true,
}: {
  activeDestination: PeopleFlatDestination;
  discoverEnabled: boolean;
  /** Groups browseTab === "yours" — show subtle "Your groups" above action. */
  groupsYoursActive?: boolean;
  groupsPillState?: PeopleGroupsPillState;
  onBack: () => void;
  onSelectDuo: () => void;
  onSelectDiscover: () => void;
  onSelectPlans: () => void;
  onSelectGroups: () => void;
  primaryAction: PeopleShellPrimaryAction | null;
  /** Canonical compact Connect / Join / I'm down pill. */
  mineCompactConnect?: boolean;
}) {
  const bottomOffset = peopleShellDockBottomOffset();
  const action = primaryAction;
  const actionDisabled = !action || Boolean(action.disabled);
  const actionTone = action?.tone ?? "muted";
  const actionLabel = action?.label ?? peopleUiCopy.deckConnectLabel;
  const actionIcon = action?.icon ?? "connect";
  const longLabel = actionLabel.trim().length >= 9;
  const compactMineConnect = mineCompactConnect;
  const actionToNavGap = compactMineConnect
    ? PEOPLE_MINE_ACTION_TO_NAV_GAP_PX
    : PEOPLE_ACTION_TO_NAV_GAP_PX;
  const showYoursContext =
    activeDestination === "groups" && groupsYoursActive;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 overflow-visible"
      style={{
        zIndex: PEOPLE_SHELL_Z_ABOVE_BOTTOM_TAB,
      }}
      data-people-shell
      data-people-shell-version="v12.3-groups-states"
      data-people-shell-primary-shelves="false"
      data-people-shell-end-housings="false"
      data-people-shell-flat-primary-nav="true"
      data-people-shell-bottom-back="true"
      data-people-shell-back-in-nav="true"
      data-people-shell-home-nav-baseline="true"
      data-people-shell-dock-panel="false"
      data-people-shell-action-extrusion={compactMineConnect ? "false" : "true"}
      data-people-shell-svg-wings="false"
      data-people-shell-separate-art-control-bottom="true"
      data-people-shell-action-always-circle="true"
      data-people-shell-action-detached="true"
      data-people-shell-action-diameter={PEOPLE_ACTION_CIRCLE_PX}
      data-people-groups-dock-inverted="false"
    >
      <div
        className="people-shell-cluster pointer-events-none relative z-[2] mx-auto flex w-full max-w-[640px] flex-col items-center bg-transparent"
        style={{
          paddingBottom: bottomOffset,
        }}
        data-people-shell-cluster
        data-people-control-bottom="safe"
        data-people-dock-bottom-offset={bottomOffset}
        data-people-dock-panel="false"
      >
        {showYoursContext ? (
          <p
            className="pointer-events-none mb-1.5 text-center text-[11px] font-semibold tracking-wide text-[var(--text)]/55"
            data-people-groups-yours-context-label="true"
          >
            {peopleUiCopy.groupUpYoursContextLabel}
          </p>
        ) : null}

        <button
          type="button"
          data-people-center-action
          data-people-action-detached="true"
          data-people-action-shape={compactMineConnect ? "pill" : "circle"}
          data-people-action-diameter={
            compactMineConnect ? undefined : PEOPLE_ACTION_CIRCLE_PX
          }
          data-people-mine-connect-pill={
            compactMineConnect ? "true" : undefined
          }
          data-people-action-single-layer={
            compactMineConnect ? "true" : undefined
          }
          data-people-action-wrapper-bg="transparent"
          aria-label={actionLabel}
          disabled={actionDisabled || Boolean(action?.busy)}
          onClick={() => {
            if (actionDisabled || !action) return;
            action.onPress();
          }}
          className={[
            "people-action-hit group/people-action pointer-events-auto relative shrink-0 bg-transparent",
            "disabled:pointer-events-none",
          ].join(" ")}
          style={
            compactMineConnect
              ? {
                  /* Single-layer: hit box == face height (no extrusion reserve). */
                  height: PEOPLE_MINE_CONNECT_H_PX,
                  minWidth: 120,
                }
              : {
                  width: PEOPLE_ACTION_CIRCLE_PX,
                  height: PEOPLE_ACTION_CIRCLE_PX + PEOPLE_EXTRUSION_PX,
                }
          }
        >
          {compactMineConnect ? (
            <span
              className={[
                "people-action-face relative z-[1] inline-flex h-full items-center justify-center gap-1.5 rounded-full border box-border",
                "shadow-[0_2px_8px_rgba(0,0,0,0.18)]",
                peopleShellActionFaceClass(actionTone, actionDisabled),
              ].join(" ")}
              style={{
                height: PEOPLE_MINE_CONNECT_H_PX,
                paddingLeft: PEOPLE_MINE_CONNECT_PILL_PAD_X_PX,
                paddingRight: PEOPLE_MINE_CONNECT_PILL_PAD_X_PX,
              }}
              data-people-action-extrusion="false"
            >
              <ActionIcon kind={actionIcon} size={18} />
              <span className="text-[13px] font-bold leading-none tracking-tight">
                {action?.busy ? "…" : actionLabel}
              </span>
            </span>
          ) : (
            <>
              <span
                className={[
                  "people-action-extrusion pointer-events-none absolute left-0 top-0 rounded-full",
                  peopleShellActionExtrusionClass(actionTone, actionDisabled),
                ].join(" ")}
                style={{
                  width: PEOPLE_ACTION_CIRCLE_PX,
                  height: PEOPLE_ACTION_CIRCLE_PX,
                  transform: `translateY(${PEOPLE_EXTRUSION_PX}px)`,
                }}
                aria-hidden
              />
              <span
                className={[
                  "people-action-face relative z-[1] inline-flex flex-col items-center justify-center gap-[3px] rounded-full px-1 text-center",
                  "border box-border",
                  peopleShellActionFaceClass(actionTone, actionDisabled),
                ].join(" ")}
                style={{
                  width: PEOPLE_ACTION_CIRCLE_PX,
                  height: PEOPLE_ACTION_CIRCLE_PX,
                  minWidth: PEOPLE_ACTION_CIRCLE_PX,
                }}
              >
                <ActionIcon kind={actionIcon} size={18} />
                <span
                  className={[
                    "font-bold leading-none tracking-tight",
                    longLabel
                      ? "max-w-[3.6rem] text-[9.5px]"
                      : "max-w-[3.5rem] text-[10.5px]",
                  ].join(" ")}
                >
                  {action?.busy ? "…" : actionLabel}
                </span>
              </span>
            </>
          )}
        </button>

        <div
          style={{ height: actionToNavGap }}
          aria-hidden
          data-people-action-to-nav-gap={actionToNavGap}
        />

        <div
          className="pointer-events-auto relative w-full bg-transparent"
          data-people-nav-with-back-row="unified"
        >
          <PeopleFluidNav
            activeDestination={activeDestination}
            discoverEnabled={discoverEnabled}
            groupsPillState={groupsPillState}
            onBack={onBack}
            onSelectDuo={onSelectDuo}
            onSelectDiscover={onSelectDiscover}
            onSelectPlans={onSelectPlans}
            onSelectGroups={onSelectGroups}
          />
        </div>
      </div>

      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .people-action-face {
            transition: transform ${PEOPLE_PRESS_DURATION_MS}ms ease-out;
          }
          .people-action-hit[data-people-action-single-layer="true"]:active .people-action-face {
            transform: scale(0.97);
          }
          .people-action-hit:not([data-people-action-single-layer="true"]):active .people-action-face {
            transform: translateY(${PEOPLE_EXTRUSION_PX}px);
          }
        }
      `}</style>
    </div>
  );
}

function ActionIcon({
  kind,
  size,
}: {
  kind: PeopleShellActionIcon;
  size: number;
}) {
  const cls = "shrink-0";
  const style = { width: size, height: size };
  switch (kind) {
    case "request":
      return <PiUserPlusBold className={cls} style={style} aria-hidden />;
    case "requested":
    case "withdraw":
      return <PiCheckBold className={cls} style={style} aria-hidden />;
    case "open":
      return <PiChatCircleBold className={cls} style={style} aria-hidden />;
    case "retry":
      return <PiArrowClockwiseBold className={cls} style={style} aria-hidden />;
    case "im_down":
    case "connect":
    default:
      return <PiHandshakeBold className={cls} style={style} aria-hidden />;
  }
}
