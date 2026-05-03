import { ReactNode } from "react";
import { PiArrowLeft } from "react-icons/pi";
import { useNavigate } from "react-router-dom";
import Logo from "../ui/Logo";

interface PolicyPageLayoutProps {
  children: ReactNode;
}

export default function PolicyPageLayout({ children }: PolicyPageLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="w-full bg-[var(--bg)] text-[var(--text)] min-h-screen flex flex-col">
      {/* Sticky chrome: balanced logo + back, pill bar */}
      <div className="sticky top-0 z-40 pt-[max(0.75rem,env(safe-area-inset-top))] px-3 sm:px-4 pb-3">
        <header
          className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)]/95 py-2.5 pl-3 pr-2 shadow-[0_2px_12px_rgba(0,0,0,0.06)] backdrop-blur-md supports-[backdrop-filter]:bg-[var(--surface)]/88"
          role="banner"
        >
          <div className="flex min-h-11 min-w-0 flex-1 items-center">
            <Logo
              size={30}
              rounded={10}
              onClick={() => navigate("/")}
              className="shrink-0"
              alt="EchoToo"
            />
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-transparent text-[var(--text)] transition-colors hover:bg-[var(--surface-2)] active:scale-[0.98]"
            aria-label="Go back"
          >
            <PiArrowLeft size={22} className="text-[var(--text)]" aria-hidden />
          </button>
        </header>
      </div>

      {/* Content — extra bottom padding for in-app BottomTab */}
      <main
        className="flex-1 w-full max-w-[800px] mx-auto px-4 py-6 sm:py-8 safe-area-inset-bottom"
        style={{
          paddingBottom: "calc(2rem + var(--safe-area-bottom-layout) + 104px)",
        }}
      >
        {children}
      </main>
    </div>
  );
}
