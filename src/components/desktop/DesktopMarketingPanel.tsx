import type { ReactNode } from "react";
import {
  PiAppleLogo,
  PiConfetti,
  PiGooglePlayLogo,
  PiMapTrifold,
  PiSparkle,
} from "react-icons/pi";
import { getOwlLogoPath } from "../../lib/assets";
import { DESKTOP_POLICY_NAV } from "../../lib/desktopPolicyRoutes";
import { useDesktopPolicyNavigate } from "../../hooks/useDesktopPolicyNavigate";

/** Desktop marketing panel only — beside the phone shell on web ≥ breakpoint. */
const CONTACT_EMAIL = "blueprtdigital@gmail.com";

const FEEDBACK_MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  "EchoToo feedback"
)}`;

function FeatureCard({
  icon,
  title,
  accentClass,
  children,
}: {
  icon: ReactNode;
  title: string;
  accentClass: string;
  children: ReactNode;
}) {
  return (
    <article
      className={[
        "group relative overflow-hidden rounded-2xl border border-white/[0.09] bg-[rgba(255,255,255,0.04)] p-5 shadow-[0_20px_50px_-28px_rgba(0,0,0,0.55)] backdrop-blur-[2px]",
        "transition-all duration-200 ease-out",
        "hover:border-[var(--brand)]/35 hover:shadow-[0_12px_40px_-16px_rgba(0,0,0,0.45)] hover:-translate-y-0.5",
      ].join(" ")}
    >
      <div
        className={`mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--border)] ${accentClass} transition-colors group-hover:border-[var(--brand)]/25`}
        aria-hidden
      >
        {icon}
      </div>
      <h3 className="text-base font-semibold tracking-tight text-[var(--text)] mb-2">
        {title}
      </h3>
      <div className="text-sm text-[var(--text)]/82 leading-relaxed">
        {children}
      </div>
    </article>
  );
}

export default function DesktopMarketingPanel() {
  const navigateToPolicyRoute = useDesktopPolicyNavigate();

  return (
    <div className="flex flex-col gap-11 pb-6">
      {/* Hero — landing-style block aligned with shared desktop-stage glow */}
      <header className="relative overflow-hidden rounded-[2rem] border border-white/[0.09] bg-[rgba(255,255,255,0.035)] shadow-[0_0_70px_-28px_rgba(247,208,71,0.35),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-[rgba(21,21,22,0.55)]">
        <div
          className="pointer-events-none absolute left-1/2 top-0 h-[140px] w-[min(100%,420px)] -translate-x-1/2 opacity-90 blur-3xl"
          style={{
            background:
              "radial-gradient(ellipse at center top, rgba(247,208,71,0.28) 0%, transparent 72%)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(165deg, transparent 35%, rgba(255,255,255,0.07) 48%, transparent 62%)",
          }}
          aria-hidden
        />

        <div className="relative mx-auto flex max-w-xl flex-col items-center px-6 py-10 text-center sm:px-10 sm:py-12">
          <div className="mb-8 flex flex-col items-center gap-3 sm:mb-9">
            <div className="flex flex-col items-center justify-center gap-2">
              <img
                src={getOwlLogoPath()}
                alt=""
                width={56}
                height={56}
                className="shrink-0 object-contain drop-shadow-[0_6px_32px_rgba(247,208,71,0.28)]"
                draggable={false}
              />
              <span className="text-base font-semibold tracking-tight text-[var(--text)]">
                EchoToo
              </span>
            </div>
            <div
              className="h-px w-20 rounded-full bg-gradient-to-r from-transparent via-[var(--brand)]/45 to-transparent"
              aria-hidden
            />
          </div>

          <h1 className="text-balance text-[1.65rem] font-bold leading-snug tracking-tight text-[var(--text)] sm:text-[1.95rem] sm:leading-tight">
            Discover hangouts, experiences, and real-world plans with friends.
          </h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-[var(--text)]/87">
            Find what&apos;s happening near you, join hangouts, and explore
            curated stops and itineraries — built for showing up, not endless
            scrolling.
          </p>
        </div>
      </header>

      {/* Hangouts + Experiences */}
      <section
        className="flex flex-col gap-5"
        aria-labelledby="desktop-product-heading"
      >
        <div className="flex flex-col gap-1">
          <h2
            id="desktop-product-heading"
            className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text)]/55"
          >
            What you can do
          </h2>
          <p className="text-sm text-[var(--text)]/65">
            Two sides of going out — spontaneous plans and places worth the
            trip.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <FeatureCard
            title="Hangouts"
            accentClass="bg-[rgba(247,208,71,0.07)] text-[var(--brand)]"
            icon={<PiConfetti className="text-xl" aria-hidden />}
          >
            <p>
              See what&apos;s happening around you — meetups with friends,
              invites you can accept, and last-minute plans you can drop into or
              share.
            </p>
          </FeatureCard>

          <FeatureCard
            title="Experiences"
            accentClass="bg-[rgba(120,160,255,0.06)] text-[var(--text)]"
            icon={<PiMapTrifold className="text-xl" aria-hidden />}
          >
            <p>
              Follow itineraries and stops you care about — from cafés to events
              — so every outing feels like a small adventure, not a vague maybe.
            </p>
          </FeatureCard>
        </div>
      </section>

      {/* Creator partnership — elevated */}
      <section
        className="relative overflow-hidden rounded-3xl border border-[var(--brand)]/25 bg-gradient-to-br from-[var(--surface)] via-[var(--surface)] to-[rgba(247,208,71,0.06)] p-6 sm:p-7 shadow-[0_0_0_1px_rgba(247,208,71,0.12),0_16px_50px_-24px_rgba(0,0,0,0.5)]"
        aria-labelledby="desktop-creators-heading"
      >
        <div
          className="pointer-events-none absolute -right-8 top-1/2 h-40 w-40 -translate-y-1/2 rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, rgba(247,208,71,0.35) 0%, transparent 70%)",
          }}
          aria-hidden
        />
        <div className="relative">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--brand)]/30 bg-[rgba(247,208,71,0.1)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--brand)]">
              In development
            </span>
            <PiSparkle
              className="text-[var(--brand)] opacity-80"
              size={18}
              aria-hidden
            />
          </div>
          <h2
            id="desktop-creators-heading"
            className="text-xl font-bold tracking-tight text-[var(--text)]"
          >
            Creator partnerships
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-[var(--text)]/88">
            We&apos;re building a program so creators who share standout
            real-world experiences can earn through EchoToo. STAY TUNED
          </p>
        </div>
      </section>

      {/* Policies */}
      <section aria-labelledby="desktop-policies-heading">
        <h2
          id="desktop-policies-heading"
          className="mb-4 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text)]/55"
        >
          Policies &amp; safety
        </h2>
        <nav className="overflow-hidden rounded-2xl border border-white/[0.09] bg-[rgba(255,255,255,0.035)] shadow-sm divide-y divide-white/[0.08] backdrop-blur-[2px]">
          {DESKTOP_POLICY_NAV.map(({ path, navLabel }) => (
            <button
              key={path}
              type="button"
              onClick={() => navigateToPolicyRoute(path)}
              className="block w-full px-4 py-3.5 text-left text-sm font-medium text-[var(--brand)] transition-all duration-200 hover:bg-white/[0.05] hover:pl-5 active:bg-white/[0.06]"
            >
              {navLabel}
            </button>
          ))}
        </nav>
      </section>

      {/* Closure: download + contact */}
      <section
        className="rounded-[2rem] border border-white/[0.09] bg-[rgba(255,255,255,0.035)] p-6 backdrop-blur-md supports-[backdrop-filter]:bg-[rgba(21,21,22,0.45)] sm:p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
        aria-labelledby="desktop-closure-heading"
      >
        <h2
          id="desktop-closure-heading"
          className="text-xl font-bold tracking-tight text-[var(--text)]"
        >
          Get EchoToo
        </h2>
        <p className="mt-2 max-w-lg text-sm leading-relaxed text-[var(--text)]/75">
          Mobile apps are on the way. Use the preview on the left today;
          we&apos;ll link the stores here when builds go live.
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3.5 transition-all duration-200 hover:border-[var(--brand)]/30"
            role="group"
            aria-label="App Store"
          >
            <PiAppleLogo
              className="shrink-0 text-xl text-[var(--text)]"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[var(--text)]">
                App Store
              </div>
              <div className="text-[11px] text-[var(--muted)]">
                iPhone &amp; iPad
              </div>
            </div>
            <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Soon
            </span>
          </div>
          <div
            className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-4 py-3.5 transition-all duration-200 hover:border-[var(--brand)]/30"
            role="group"
            aria-label="Google Play"
          >
            <PiGooglePlayLogo
              className="shrink-0 text-xl text-[var(--text)]"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-[var(--text)]">
                Google Play
              </div>
              <div className="text-[11px] text-[var(--muted)]">Android</div>
            </div>
            <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              Soon
            </span>
          </div>
        </div>

        <div className="mt-8 rounded-xl border border-[var(--brand)]/22 bg-[rgba(247,208,71,0.05)] px-4 py-4 sm:px-5">
          <h3 className="text-sm font-semibold tracking-tight text-[var(--text)]">
            Give us feedback
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text)]/78">
            Share what&apos;s working, what isn&apos;t, or what you&apos;d love
            next — your notes help us improve EchoToo.
          </p>
          <a
            href={FEEDBACK_MAILTO}
            className="mt-3 inline-flex items-center justify-center rounded-lg border border-[var(--brand)]/35 bg-[rgba(247,208,71,0.08)] px-4 py-2 text-sm font-semibold text-[var(--text)] transition-all duration-200 hover:border-[var(--brand)]/55 hover:bg-[rgba(247,208,71,0.12)]"
          >
            Send feedback
          </a>
        </div>

        <div className="mt-8 border-t border-white/[0.08] pt-8">
          <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text)]/55">
            Contact
          </h3>
          <p className="mt-2 text-sm text-[var(--text)]/78">
            Business, partnerships, and general inquiries:
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="mt-3 inline-flex items-center justify-center rounded-xl border border-[var(--brand)]/40 bg-[rgba(247,208,71,0.06)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition-all duration-200 hover:border-[var(--brand)]/60 hover:bg-[rgba(247,208,71,0.1)]"
          >
            {CONTACT_EMAIL}
          </a>
          <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
            Phone and social channels will be listed here as official EchoToo
            handles are finalized.
          </p>
        </div>
      </section>
    </div>
  );
}
