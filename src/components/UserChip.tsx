import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function UserChip() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setEmail(data.user?.email ?? null);
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
