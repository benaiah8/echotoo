import {
  peopleNavPrimaryActiveGlowClassName,
  peopleNavPrimaryExtrusionClassName,
  peopleNavPrimaryFaceClassName,
  peopleNavPrimaryHitClassName,
  peopleNavPrimaryHousingClassName,
  peopleNavPrimaryStackClassName,
} from "./peopleNavPrimaryUi";

type Side = "left" | "right";

/**
 * White asymmetric housing + Feed-style Duo/Groups button.
 * Housing is state-invariant; only the inner button communicates selection.
 */
export default function PeoplePrimaryShelf({
  side,
  active,
  label,
  onPress,
}: {
  side: Side;
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <div
      className={peopleNavPrimaryHousingClassName(side)}
      data-people-primary-end={side}
      data-people-end-slot={side}
      data-people-end-housing="true"
      data-people-end-housing-active={active ? "true" : "false"}
      data-people-end-width-stable="true"
      data-people-housing-state-invariant="true"
    >
      <button
        type="button"
        aria-pressed={active}
        aria-label={label}
        data-people-fluid-end={side === "left" ? "duo" : "groups"}
        data-people-end-active={active ? "true" : "false"}
        data-people-has-icon="false"
        data-people-selected-gradient="false"
        data-people-btn-upright="true"
        onClick={onPress}
        className={peopleNavPrimaryHitClassName()}
      >
        <span className={peopleNavPrimaryStackClassName()}>
          {active ? (
            <span
              data-social-glow
              className={peopleNavPrimaryActiveGlowClassName()}
              aria-hidden
            />
          ) : null}
          <span
            className={peopleNavPrimaryExtrusionClassName(active)}
            aria-hidden
          />
          <span className={peopleNavPrimaryFaceClassName(active)}>{label}</span>
        </span>
      </button>
    </div>
  );
}
