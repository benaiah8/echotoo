import PolicyPage from "./PolicyPage";
import PolicyPageLayout from "../../components/policy/PolicyPageLayout";

export default function ReportingPage() {
  return (
    <PolicyPageLayout>
      <PolicyPage
        title="Reporting"
        intro="How to report content or behavior that violates our community standards."
      >
        {/* POLICY CONTENT START */}
        <p>Last updated: March 13, 2026</p>

        <p>
          EchoToo allows users to report posts and user accounts that violate
          our rules or create safety concerns. This Reporting and Moderation
          Policy explains how reporting works and how the platform may respond
          to violations.
        </p>
        <p>
          EchoToo has zero tolerance for objectionable content, abusive behavior,
          harassment, hate speech, threats, sexual exploitation, and other unsafe
          content. You can report posts and user accounts from inside the app.
          EchoToo reviews objectionable content reports within 24 hours, to the
          extent reasonably practicable. EchoToo may remove content and suspend
          or eject users who violate the rules. You may block abusive users from
          their profile in the app.
        </p>

        <h3>1. Reporting Content</h3>
        <p>
          Users can report posts that they believe violate EchoToo’s policies or
          create safety concerns.
        </p>
        <p>Examples of reportable content may include:</p>
        <ul>
          <li>harassment or bullying</li>
          <li>hate speech or discriminatory content</li>
          <li>violent threats or dangerous activity</li>
          <li>scams or fraudulent activity</li>
          <li>misleading or deceptive event information</li>
          <li>sexually exploitative content</li>
          <li>illegal activity</li>
        </ul>

        <h3>2. Reporting Users</h3>
        <p>
          Users may also report accounts that engage in abusive, harmful, or
          deceptive behavior.
        </p>
        <p>
          Reporting a user helps EchoToo review behavior that may violate the
          platform rules or create safety risks for other users.
        </p>

        <h3>3. How Reporting Works</h3>
        <p>
          When you report a post or user within the app, the report information
          is sent to the EchoToo support team for review. Reports may include
          identifying information about the reported content or account to help
          us investigate the issue.
        </p>

        <h3>4. Review Process</h3>
        <p>
          The EchoToo team may review reported content and determine whether it
          violates the platform’s rules, Community Guidelines, or applicable
          laws. EchoToo aims to review reports of objectionable content within 24
          hours, to the extent reasonably practicable.
        </p>
        <p>
          Not every report results in enforcement action, but reports help us
          identify potential issues and maintain a safer environment.
        </p>

        <h3>5. Moderation Actions</h3>
        <p>
          If content or behavior violates EchoToo policies, we may take action
          to address the issue. Possible actions include:
        </p>
        <ul>
          <li>removing content</li>
          <li>issuing warnings</li>
          <li>restricting certain account features</li>
          <li>suspending an account</li>
          <li>permanently removing an account from the platform</li>
        </ul>

        <h3>6. Safety and Serious Violations</h3>
        <p>
          Some violations, particularly those involving threats, exploitation,
          or illegal activity, may result in immediate enforcement action.
        </p>

        <h3>7. Good Faith Reporting</h3>
        <p>
          Users should submit reports in good faith. Repeated misuse of the
          reporting system or intentionally false reports may itself violate
          platform rules.
        </p>

        <h3>8. Contact</h3>
        <p>
          If you need help reporting an issue or want to contact the EchoToo
          team about safety concerns, you can email{" "}
          <a href="mailto:support@echotoo.com">support@echotoo.com</a>.
        </p>
        {/* POLICY CONTENT END */}
      </PolicyPage>
    </PolicyPageLayout>
  );
}
