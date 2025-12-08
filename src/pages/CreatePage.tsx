// src/pages/CreatePage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PrimaryPageContainer from "../components/container/PrimaryPageContainer";
import { Paths } from "../router/Paths";
import Avatar from "../components/ui/Avatar";
import { supabase } from "../lib/supabaseClient";

/**
 * Local, file-scoped labels so this file has no external config dependency.
 * (If you later add/createFlow.ts again, you can import from there.)
 */
const LABELS = {
  hangout: "Hang out",
  experience: "Experience",
} as const;

type ProfileLite = {
  display_name?: string | null;
  username?: string | null;
  avatar_url?: string | null;
};

export default function CreatePage() {
  const navigate = useNavigate();
  const [me, setMe] = useState<ProfileLite | null>(null);

  // hydrate quickly from localStorage (BottomTab caches these)
  useEffect(() => {
    const quick = {
      display_name: localStorage.getItem("my_display_name"),
      username: localStorage.getItem("my_username"),
      avatar_url: localStorage.getItem("my_avatar_url"),
    };
    if (quick.display_name || quick.username || quick.avatar_url) {
      setMe(quick);
    }
    // then fetch fresh profile (avoid flicker, but keep UI accurate)
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const uid = user?.id;
      if (!uid) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, username, avatar_url")
        .eq("user_id", uid)
        .maybeSingle();
      if (!error && data) {
        setMe(data);
        try {
          if (data.avatar_url)
            localStorage.setItem("my_avatar_url", data.avatar_url);
          if (data.display_name)
            localStorage.setItem("my_display_name", data.display_name);
          if (data.username) localStorage.setItem("my_username", data.username);
        } catch {}
      }
    })();
  }, []);

  const start = (type: "hangout" | "experience") => {
    // go straight to Activities (we're skipping the old Title step)
    navigate(`${Paths.createActivities}?type=${type}`);
  };

  const name = me?.display_name || me?.username || "user_";
  const handle = me?.username ? `@${me.username}` : "";

  return (
    <PrimaryPageContainer>
      <div className="flex-1 w-full px-4">
        {/* center everything in viewport, but keep safe space for bottom tab */}
        <div className="min-h-[calc(100vh-88px)] flex flex-col items-center justify-center">
          {/* Profile header */}
          <div className="flex flex-col items-center">
            <Avatar url={me?.avatar_url || undefined} name={name} size={104} />
            <div className="mt-3 text-[var(--text)] text-base font-medium leading-tight text-center">
              {name}
            </div>
            {handle && (
              <div className="text-xs text-[var(--text)]/70 mt-0.5 text-center">
                {handle}
              </div>
            )}
          </div>

          {/* Prompt */}
          <h3 className="mt-5 text-center text-[var(--text)]/95 font-normal">
            What are you creating?
          </h3>

          {/* Buttons (compact, bordered, theme-aligned) */}
          <div className="mt-5 w-full flex flex-col items-center gap-3">
            <button
              onClick={() => start("hangout")}
              className="min-w-[220px] max-w-[280px] w-[70%] px-4 py-3 rounded-md border border-[var(--border)]
                         bg-[color-mix(in_oklab,var(--surface)_85%,transparent)] text-[var(--text)]
                         hover:bg-white/5 active:scale-[0.99] transition flex items-center justify-center gap-2"
            >
              <div className="w-2 h-2 rounded-full bg-green-500"></div>
              {LABELS.hangout}
            </button>
            <button
              onClick={() => start("experience")}
              className="min-w-[220px] max-w-[280px] w-[70%] px-4 py-3 rounded-md border border-[var(--border)]
                         bg-[color-mix(in_oklab,var(--surface)_85%,transparent)] text-[var(--text)]
                         hover:bg-white/5 active:scale-[0.99] transition flex items-center justify-center gap-2"
            >
              <div className="w-2 h-2 rounded-full bg-orange-500"></div>
              {LABELS.experience}
            </button>
          </div>
        </div>
      </div>
    </PrimaryPageContainer>
  );
}
