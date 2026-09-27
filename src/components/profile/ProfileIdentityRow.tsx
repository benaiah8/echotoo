import {
  PROFILE_OVERVIEW_IDENTITY_CLASS,
  PROFILE_OVERVIEW_NAME_CLASS,
  PROFILE_OVERVIEW_USERNAME_CLASS,
} from "../../lib/profileOverviewPresentation";

type ProfileIdentityRowProps = {
  displayName: string;
  username?: string | null;
  nameMuted?: boolean;
};

export default function ProfileIdentityRow({
  displayName,
  username,
  nameMuted = false,
}: ProfileIdentityRowProps) {
  const handle = username?.trim() ? `@${username.trim()}` : "";

  return (
    <div className={PROFILE_OVERVIEW_IDENTITY_CLASS}>
      <span
        className={[
          PROFILE_OVERVIEW_NAME_CLASS,
          nameMuted ? "text-[var(--text)]/45" : "",
        ].join(" ")}
        title={displayName}
      >
        {displayName}
      </span>
      {handle ? (
        <span className={PROFILE_OVERVIEW_USERNAME_CLASS} title={handle}>
          {handle}
        </span>
      ) : null}
    </div>
  );
}
