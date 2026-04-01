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
        <p>Last updated: March 15, 2026</p>

        <p>
          This page is intended for account deletion requests and Google Play
          compliance. It explains how to delete your account and what happens
          when you do.
        </p>

        <h3>How to Delete Your Account (In-App)</h3>
        <p>
          Follow these steps to delete your account from within the EchoToo app:
        </p>
        <ol>
          <li>Open EchoToo</li>
          <li>Go to Profile</li>
          <li>Open Edit Profile</li>
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
          EchoToo currently handles account deletion by marking your profile as
          deleted. Your profile is removed from active visibility in the app
          immediately after you confirm deletion.
        </p>
        <p>
          At this time, account deletion does not guarantee removal of all
          related data. Some data may remain associated with the account
          according to our current implementation, including posts, comments,
          uploaded media, and authentication records. We do not claim that
          everything is immediately permanently erased.
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
