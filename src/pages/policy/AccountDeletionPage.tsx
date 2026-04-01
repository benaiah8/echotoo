import PolicyPage from "./PolicyPage";
import PolicyPageLayout from "../../components/policy/PolicyPageLayout";
import { SUPPORT_EMAIL } from "../../lib/supportConfig";

export default function AccountDeletionPage() {
  return (
    <PolicyPageLayout>
      <PolicyPage
        title="Account Deletion"
        intro="Information about how to delete your EchoToo account and what happens to your data."
      >
        {/* POLICY CONTENT START */}
        <p>Last updated: March 13, 2026</p>

        <p>
          EchoToo provides an in-app account deletion option. This page explains
          how account deletion currently works and what happens when you use it.
        </p>

        <h3>1. How to Delete Your Account</h3>
        <p>
          You can request account deletion from within the EchoToo app through
          your profile or account settings.
        </p>

        <h3>2. What Happens When You Delete Your Account</h3>
        <p>
          EchoToo currently handles account deletion by marking your profile as
          deleted. This happens immediately after the deletion action is
          completed.
        </p>
        <p>
          Once your profile is marked as deleted, it is removed from active
          visibility in the app experience.
        </p>

        <h3>3. What Is Currently Removed</h3>
        <p>
          The current deletion process removes your profile from active
          visibility.
        </p>

        <h3>4. What Is Not Currently Guaranteed To Be Removed</h3>
        <p>
          At this time, account deletion does not currently guarantee removal of
          all related backend records or content associated with the account.
        </p>
        <p>This may include:</p>
        <ul>
          <li>posts</li>
          <li>comments</li>
          <li>uploaded images</li>
          <li>authentication records</li>
          <li>other related stored data connected to platform operations</li>
        </ul>

        <h3>5. Processing Timeline</h3>
        <p>
          The current profile deletion action takes effect immediately when
          triggered in the app. There is no separate waiting period built into
          the current process.
        </p>

        <h3>6. Future Improvements</h3>
        <p>
          EchoToo may improve or expand its deletion and data removal process
          over time as the platform continues to develop.
        </p>

        <h3>7. Need Help?</h3>
        <p>
          If you have questions about account deletion or want to contact us
          regarding your data, email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
        {/* POLICY CONTENT END */}
      </PolicyPage>
    </PolicyPageLayout>
  );
}
