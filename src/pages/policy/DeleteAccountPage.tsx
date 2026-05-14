import PolicyPage from "./PolicyPage";
import PolicyPageLayout from "../../components/policy/PolicyPageLayout";
import {
  SUPPORT_EMAIL,
  getAccountDeletionMailto,
} from "../../lib/supportConfig";

export default function DeleteAccountPage() {
  return (
    <PolicyPageLayout>
      <PolicyPage
        title="Delete Your EchoToo Account"
        intro="You can request account deletion from within the EchoToo app. This page provides the steps and a fallback contact method for users who cannot access the app."
      >
        {/* POLICY CONTENT START */}
        <p>Last updated: April 13, 2026</p>

        <p>
          This page is intended for account deletion requests and Google Play
          compliance. It explains how to delete your account and what happens
          when you do.
        </p>

        <h3>Account deletion information (in the app)</h3>
        <p>
          You can open this deletion overview at any time from your profile: go
          to <strong>Profile</strong>, open the <strong>menu</strong> (list icon
          in the top bar), then tap <strong>Delete account</strong>.
        </p>

        <h3>How to complete account deletion (in the app)</h3>
        <p>
          To start the in-app deletion flow (including confirmation), open{" "}
          <strong>Profile</strong>, choose <strong>Edit profile</strong>, then
          tap <strong>Delete Account</strong> and follow the prompts. This is
          the control that submits your deletion request and signs you out when
          you confirm.
        </p>
        <ol>
          <li>Open EchoToo</li>
          <li>Go to Profile</li>
          <li>Tap Edit profile</li>
          <li>Tap Delete Account</li>
          <li>Confirm deletion</li>
        </ol>

        <h3>Can&apos;t Access the App?</h3>
        <p>
          If you cannot access the app to delete your account, you can email us
          to request deletion:
        </p>
        <p>
          <a href={getAccountDeletionMailto()}>{SUPPORT_EMAIL}</a>
        </p>
        <p>
          Use the subject &quot;Account Deletion Request&quot; or click the link
          above to open your email client with the subject pre-filled.
        </p>

        <h3>What Happens When You Delete Your Account</h3>
        <p>
          When you confirm deletion in the app, EchoToo processes your request
          to remove your account access. As part of that flow, your profile and
          your posts are removed from EchoToo under the ordinary operation of
          the service, so they should no longer appear in the app to you or
          others.
        </p>
        <p>
          Some limited information may still be retained where required or
          reasonably necessary for legal, safety, fraud-prevention,
          abuse-prevention, or operational reasons (for example, backups,
          short-term logs, or records we must keep to comply with law or
          protect users). We do not claim that every possible copy of every
          record is permanently erased from every system or location immediately.
        </p>
        <p>
          EchoToo may improve or expand its deletion and data removal process
          over time.
        </p>
        {/* POLICY CONTENT END */}
      </PolicyPage>
    </PolicyPageLayout>
  );
}
