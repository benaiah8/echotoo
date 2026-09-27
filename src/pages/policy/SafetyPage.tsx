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
        <p>Last updated: September 27, 2026</p>

        <p>
          EchoToo helps people discover real-world experiences, events,
          hangouts, and itineraries. Optional features like Duo, Group Up, and
          messaging can also help people connect around a plan. Because some
          activities may involve meeting new people or going to unfamiliar
          places, we encourage all users to use good judgment and prioritize
          their safety.
        </p>

        <h3>1. Meet Responsibly</h3>
        <p>
          If you choose to attend a meetup, event, or hangout you discover
          through EchoToo, or to meet someone you connected with through Duo,
          Group Up, or messaging, do so responsibly. Consider meeting in public
          places, especially when meeting people you do not know well. Consider
          telling a friend where you are going.
        </p>

        <h3>2. Verify Details Independently</h3>
        <p>
          EchoToo does not organize, verify, or guarantee user-posted events,
          gatherings, itineraries, or location details. Before attending
          anything, verify the information for yourself whenever possible.
        </p>

        <h3>3. Use Good Judgment in Messages</h3>
        <p>
          Be careful about what you share in direct messages or group chats.
          Avoid sending your home address, financial details, or other sensitive
          information early in a conversation. Trust your instincts. If
          something feels unsafe, misleading, or suspicious, stop engaging,
          leave the Duo or Group if needed, and consider blocking or reporting
          the user.
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
          EchoToo is a discovery platform, not an event organizer. Duo and Group
          Up are tools for expressing interest around a plan; they are not a
          guarantee that someone is trustworthy. Users are responsible for their
          own decisions and interactions. Take extra care when interacting with
          people you have not met before.
        </p>

        <h3>6. Photos and Videos</h3>
        <p>
          Only share photos or videos you have the right to share. Do not post
          or send images of other people without their consent, and never share
          intimate or exploitative imagery.
        </p>

        <h3>7. Report Unsafe or Abusive Behavior</h3>
        <p>
          If you see content or behavior that appears abusive, threatening,
          deceptive, exploitative, or otherwise unsafe — including in messages
          or meetup-related requests — use the available reporting and blocking
          options or contact EchoToo at{" "}
          <a href="mailto:support@echotoo.com">support@echotoo.com</a>.
        </p>

        <h3>8. No Guarantee of Safety</h3>
        <p>
          While EchoToo works to maintain a safer platform, we cannot guarantee
          the accuracy, legitimacy, or safety of user-posted content,
          activities, or interactions. Participation in activities discovered
          through EchoToo is at your own discretion and risk.
        </p>

        <h3>9. Emergency Situations</h3>
        <p>
          If you are in immediate danger or facing an emergency, contact local
          emergency services or the appropriate authorities right away rather
          than relying on the app or support email.
        </p>

        <h3>10. Contact</h3>
        <p>
          For safety concerns or questions, contact{" "}
          <a href="mailto:support@echotoo.com">support@echotoo.com</a>.
        </p>
        {/* POLICY CONTENT END */}
      </PolicyPage>
    </PolicyPageLayout>
  );
}
