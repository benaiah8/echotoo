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
      {/* Header: Logo + Back */}
      <header className="w-full bg-[var(--surface)] px-4 py-3 backdrop-blur-md sticky top-0 z-40 safe-area-inset-top border-b border-[var(--border)]">
        <div className="flex items-center justify-between">
          <Logo
            size={28}
            onClick={() => navigate("/")}
            className="shrink-0"
            alt="EchoToo"
          />
          <button
            onClick={() => navigate(-1)}
            className="p-2 -m-2 rounded-lg hover:bg-[var(--surface-2)] transition-colors"
            aria-label="Go back"
          >
            <PiArrowLeft size={22} className="text-[var(--text)]" />
          </button>
        </div>
      </header>

      {/* Content - extra bottom padding for fixed tab bar when opened from in-app */}
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
