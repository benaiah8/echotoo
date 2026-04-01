import PolicyPage from "./PolicyPage";
import PolicyPageLayout from "../../components/policy/PolicyPageLayout";

export default function SafetyPage() {
  return (
    <PolicyPageLayout>
      <PolicyPage
        title="Safety Tips"
        intro="Tips for safe use of EchoToo when discovering real-world experiences, hangouts, events, and itineraries."
      >
        {/* POLICY CONTENT START */}
        <p>Last updated: March 13, 2026</p>

        <p>
          EchoToo helps people discover real-world experiences, events,
          hangouts, and itineraries. Because some activities may involve meeting
          new people or going to unfamiliar places, we encourage all users to
          use good judgment and prioritize their safety.
        </p>

        <h3>1. Meet Responsibly</h3>
        <p>
          If you choose to attend a meetup, event, or hangout you discover
          through EchoToo, do so responsibly. Consider meeting in public places,
          especially when meeting people you do not know well.
        </p>

        <h3>2. Verify Details Independently</h3>
        <p>
          EchoToo does not organize, verify, or guarantee user-posted events,
          gatherings, itineraries, or location details. Before attending
          anything, verify the information for yourself whenever possible.
        </p>

        <h3>3. Use Good Judgment</h3>
        <p>
          Trust your instincts. If something feels unsafe, misleading, or
          suspicious, you should avoid participating and consider reporting the
          content or user.
        </p>

        <h3>4. Protect Your Personal Information</h3>
        <p>
          Do not share sensitive personal information publicly unless you are
          comfortable doing so. Be cautious about posting phone numbers, private
          addresses, financial information, travel details, or other information
          that could put you at risk.
        </p>

        <h3>5. Be Careful With New Connections</h3>
        <p>
          EchoToo is a discovery platform, not an event organizer. Users are
          responsible for their own decisions and interactions. Take extra care
          when interacting with people you have not met before.
        </p>

        <h3>6. Report Unsafe or Abusive Behavior</h3>
        <p>
          If you see content or behavior that appears abusive, threatening,
          deceptive, exploitative, or otherwise unsafe, use the available
          reporting options or contact EchoToo at{" "}
          <a href="mailto:support@echotoo.com">support@echotoo.com</a>.
        </p>

        <h3>7. No Guarantee of Safety</h3>
        <p>
          While EchoToo works to maintain a safer platform, we cannot guarantee
          the accuracy, legitimacy, or safety of user-posted content,
          activities, or interactions. Participation in activities discovered
          through EchoToo is at your own discretion and risk.
        </p>

        <h3>8. Emergency Situations</h3>
        <p>
          If you are in immediate danger or facing an emergency, contact local
          emergency services or the appropriate authorities right away rather
          than relying on the app or support email.
        </p>

        <h3>9. Contact</h3>
        <p>
          For safety concerns or questions, contact{" "}
          <a href="mailto:support@echotoo.com">support@echotoo.com</a>.
        </p>
        {/* POLICY CONTENT END */}
      </PolicyPage>
    </PolicyPageLayout>
  );
}
