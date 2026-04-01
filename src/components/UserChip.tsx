import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getViewerAuthUserId } from "../api/services/follows";

export default function UserChip() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      // Use getSession() instead of getUser() - faster and no extra query
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setEmail(data.session?.user?.email ?? null);
    };

    load();

    // keep in sync with auth changes
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (!email) return null;
  return (
    <div className="text-[10px] text-[var(--text)]/70">
      Signed in as <span className="text-primary">{email}</span>
    </div>
  );
}
