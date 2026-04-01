import PolicyPage from "./PolicyPage";
import PolicyPageLayout from "../../components/policy/PolicyPageLayout";

export default function ChildSafetyPage() {
  return (
    <PolicyPageLayout>
      <PolicyPage
        title="Child Safety"
        intro="EchoToo is committed to protecting children and young people on our platform."
      >
        {/* POLICY CONTENT START */}
        <p>Last updated: March 17, 2026</p>

        <p>
          EchoToo is committed to maintaining a safe environment for all users.
          We do not tolerate content or behavior that exploits, harms, or
          endangers minors. This Child Safety Policy explains our standards and
          how we address safety concerns involving minors.
        </p>

        <h3>1. Minimum Age Requirement</h3>
        <p>
          EchoToo is intended for users who are at least 13 years old.
          Individuals under the age of 13 are not permitted to create accounts
          or use the platform.
        </p>
        <p>
          If we become aware that an account belongs to a child under 13, we may
          remove the account or take appropriate action to protect the minor.
        </p>

        <h3>2. Zero Tolerance for Child Sexual Exploitation</h3>
        <p>
          EchoToo has zero tolerance for child sexual abuse material (CSAM),
          grooming, sexual exploitation of minors, or any attempt to sexualize
          or exploit minors.
        </p>
        <p>
          Content or behavior that violates these rules is strictly prohibited
          and may result in immediate removal from the platform.
        </p>

        <h3>3. Prohibited Behavior Involving Minors</h3>
        <p>The following activities are not allowed on EchoToo:</p>
        <ul>
          <li>posting or sharing child sexual abuse material</li>
          <li>attempting to groom or exploit minors</li>
          <li>sexualizing minors in posts, comments, or media</li>
          <li>
            encouraging harmful or exploitative interactions involving minors
          </li>
          <li>
            using the platform to contact minors for inappropriate purposes
          </li>
        </ul>

        <h3>4. Reporting Safety Concerns</h3>
        <p>
          Users may report posts or accounts that appear to involve
          exploitation, grooming, or other safety risks involving minors.
        </p>
        <p>
          Reports may be submitted through EchoToo&apos;s in-app reporting tools
          or by contacting{" "}
          <a href="mailto:support@echotoo.com">support@echotoo.com</a>.
        </p>
        <p>
          Reports are reviewed by the EchoToo team and appropriate action may be
          taken.
        </p>

        <h3>5. Enforcement</h3>
        <p>
          EchoToo reviews reports and may take immediate action if content or
          behavior violates this policy. This may include:
        </p>
        <ul>
          <li>removing content</li>
          <li>restricting accounts</li>
          <li>suspending accounts</li>
          <li>permanently banning accounts</li>
        </ul>

        <h3>6. Moderation and Review</h3>
        <p>
          EchoToo may use a combination of human review and other moderation
          measures to identify, review, and remove content or accounts that
          violate our child safety standards.
        </p>

        <h3>7. Cooperation With Authorities</h3>
        <p>
          In cases involving potential child exploitation or abuse, EchoToo may
          cooperate with appropriate legal authorities when required by law.
        </p>

        <h3>8. Commitment to Safety</h3>
        <p>
          EchoToo is committed to maintaining a platform that prioritizes
          safety, respect, and responsible behavior. Protecting minors from
          exploitation and abuse is a core priority for the platform.
        </p>

        <h3>9. Contact</h3>
        <p>
          If you have questions about this policy or need to report a serious
          safety concern, contact{" "}
          <a href="mailto:support@echotoo.com">support@echotoo.com</a>.
        </p>
        {/* POLICY CONTENT END */}
      </PolicyPage>
    </PolicyPageLayout>
  );
}
