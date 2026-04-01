import PolicyPage from "./PolicyPage";
import PolicyPageLayout from "../../components/policy/PolicyPageLayout";

export default function CommunityGuidelinesPage() {
  return (
    <PolicyPageLayout>
      <PolicyPage
        title="Community Guidelines"
        intro="These guidelines help keep EchoToo a safe and welcoming space for everyone."
      >
        {/* POLICY CONTENT START */}
        <p>Last updated: March 13, 2026</p>

        <p>
          EchoToo is a platform for discovering and sharing real-world
          experiences, events, hangouts, and itineraries. These Community
          Guidelines explain what is and is not allowed on EchoToo so the
          platform stays respectful, safe, and useful for everyone.
        </p>

        <h3>1. Be Respectful</h3>
        <p>
          Treat other users with respect. Healthy disagreement is fine, but
          harassment, bullying, humiliation, intimidation, and repeated unwanted
          behavior are not allowed.
        </p>

        <h3>2. No Hate Speech or Discrimination</h3>
        <p>
          Do not post content that attacks, degrades, or excludes people based
          on protected characteristics or identity. Hate speech, hateful
          symbols, and discriminatory abuse are not allowed.
        </p>

        <h3>3. No Threats, Violence, or Dangerous Content</h3>
        <p>
          Do not post threats, incitement to violence, violent glorification, or
          content that encourages dangerous or harmful acts.
        </p>

        <h3>4. No Sexual Exploitation or Abuse</h3>
        <p>
          Explicit sexual exploitation, coercive sexual content, and abusive
          sexual behavior are not allowed on EchoToo.
        </p>

        <h3>5. Zero Tolerance for Child Sexual Abuse Material</h3>
        <p>
          EchoToo has zero tolerance for child sexual abuse material, grooming,
          exploitation imagery, or any attempt to sexualize minors. Any such
          content or behavior is strictly prohibited and may be reported to the
          appropriate authorities.
        </p>

        <h3>6. No Illegal Activity</h3>
        <p>
          Do not use EchoToo to promote, organize, or encourage illegal
          activity. This includes fraud, scams, theft, illegal drug promotion,
          violent crime, or other unlawful conduct.
        </p>

        <h3>7. No Scams, Fraud, or Impersonation</h3>
        <p>
          Do not deceive users, impersonate people or organizations, post
          misleading event information, or attempt to obtain money, access, or
          personal information through dishonest means.
        </p>

        <h3>8. No Spam or Manipulation</h3>
        <p>
          EchoToo should not be used for spam, repetitive posting, fake
          engagement, misleading promotion, automated abuse, or manipulation of
          platform activity.
        </p>

        <h3>9. Keep Content Relevant and Honest</h3>
        <p>
          Posts should be relevant to real-world experiences, hangouts, events,
          recommendations, or itineraries. Do not intentionally post false or
          misleading information about places, timings, events, or availability.
        </p>

        <h3>10. Respect Privacy</h3>
        <p>
          Do not share other people&apos;s private or sensitive information
          without their permission. Avoid posting personal contact details,
          precise private information, or anything that could put someone at
          risk.
        </p>

        <h3>11. Use Care With Real-World Meetups</h3>
        <p>
          EchoToo helps users discover real-world activities, but EchoToo does
          not organize or guarantee the safety of user-posted gatherings or
          events. Use good judgment, verify details independently, and prefer
          public places when meeting others.
        </p>

        <h3>12. Reporting Violations</h3>
        <p>
          Users can report posts and user accounts they believe violate the
          rules or create a safety concern. Reports may be reviewed by the
          EchoToo team.
        </p>

        <h3>13. Enforcement</h3>
        <p>
          If content or behavior violates these guidelines, EchoToo may take
          action. That may include:
        </p>
        <ul>
          <li>removing content</li>
          <li>issuing warnings</li>
          <li>restricting account activity</li>
          <li>suspending an account</li>
          <li>permanently removing an account</li>
        </ul>

        <h3>14. Repeated or Serious Violations</h3>
        <p>
          Serious violations or repeated rule-breaking may result in stronger
          enforcement, including permanent removal from the platform.
        </p>

        <h3>15. Contact</h3>
        <p>
          If you have questions or need to report a serious issue, contact{" "}
          <a href="mailto:support@echotoo.com">support@echotoo.com</a>.
        </p>
        {/* POLICY CONTENT END */}
      </PolicyPage>
    </PolicyPageLayout>
  );
}
