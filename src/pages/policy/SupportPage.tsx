import PolicyPage from "./PolicyPage";
import PolicyPageLayout from "../../components/policy/PolicyPageLayout";

export default function SupportPage() {
  return (
    <PolicyPageLayout>
      <PolicyPage
        title="Support"
        intro="Get help with EchoToo, contact our team, or find answers to common questions."
      >
        {/* POLICY CONTENT START */}
        <p>Last updated: March 13, 2026</p>

        <p>
          EchoToo provides support to help users with account issues, reporting
          concerns, safety questions, and general platform feedback.
        </p>

        <h3>1. Contacting Support</h3>
        <p>
          If you need help with EchoToo, you can contact our support team by
          email:
        </p>

        <p>
          <a href="mailto:support@echotoo.com">support@echotoo.com</a>
        </p>

        <p>
          When contacting support, please include as much relevant information
          as possible so we can assist you more effectively.
        </p>

        <h3>2. Reporting Problems</h3>
        <p>You can contact support if you experience issues such as:</p>

        <ul>
          <li>account access problems</li>
          <li>technical errors or bugs</li>
          <li>content that violates platform rules</li>
          <li>safety concerns involving other users</li>
          <li>questions about your account or data</li>
        </ul>

        <h3>3. Reporting Abuse or Unsafe Behavior</h3>
        <p>
          If you encounter harassment, scams, dangerous behavior, or other
          harmful activity on EchoToo, please report it using the in-app
          reporting options or contact support directly.
        </p>

        <h3>4. Response Time</h3>
        <p>
          EchoToo reviews support requests as quickly as possible. Response
          times may vary depending on the nature and volume of requests.
        </p>

        <h3>5. Feedback and Suggestions</h3>
        <p>
          We welcome feedback from the community. If you have suggestions for
          improving EchoToo or ideas for new features, feel free to contact us.
        </p>

        <h3>6. Policy Questions</h3>
        <p>
          If you have questions about any of EchoToo’s policies — including
          privacy, community guidelines, reporting, or safety — please reach out
          to our support team.
        </p>

        <h3>7. Contact</h3>
        <p>
          Support Email:{" "}
          <a href="mailto:support@echotoo.com">support@echotoo.com</a>
        </p>
        {/* POLICY CONTENT END */}
      </PolicyPage>
    </PolicyPageLayout>
  );
}
