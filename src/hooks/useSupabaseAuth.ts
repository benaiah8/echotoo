// src/hooks/useSupabaseAuth.ts
import { useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useDispatch } from "react-redux";
import { setAuthUser, setAuthLoading } from "../reducers/authReducer";
import { setAuthModal } from "../reducers/modalReducer";
import { getAuthRedirectUrl } from "../lib/authRedirect";
import { openOAuthUrl } from "../lib/openOAuthUrl";
import { isNativeApp } from "../lib/storage/utils/capacitorDetection";
import { deleteMyPushDevices } from "../api/services/pushDevices";

/** Minimal shape of the user we put in Redux */
export type SimpleUser = {
  id: string;
  email: string | null;
  username?: string | null; // we can sync this later
};

export default function useSupabaseAuth() {
  const dispatch = useDispatch();

  const signUp = useCallback(
    async (email: string, password: string) => {
      dispatch(setAuthLoading(true));
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: getAuthRedirectUrl() },
      });
      dispatch(setAuthLoading(false));
      if (error) throw error;

      // A user might be null until they confirm email. We still close the modal and show a note.
      if (data?.user) {
        const user: SimpleUser = {
          id: data.user.id,
          email: data.user.email ?? null,
        };
        dispatch(setAuthUser(user));
      }
      dispatch(setAuthModal(false));
      return data;
    },
    [dispatch]
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      dispatch(setAuthLoading(true));
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      dispatch(setAuthLoading(false));
      if (error) throw error;

      if (data?.user) {
        const user: SimpleUser = {
          id: data.user.id,
          email: data.user.email ?? null,
        };
        dispatch(setAuthUser(user));
      }
      dispatch(setAuthModal(false));
      return data;
    },
    [dispatch]
  );

  const signInWithGoogle = useCallback(async () => {
    const redirectTo = getAuthRedirectUrl();

    console.log("[AuthRedirectDebug] useSupabaseAuth.signInWithGoogle", {
      origin: window.location.origin,
      redirectTo,
      isNativeApp: isNativeApp(),
    });

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;

    if (data?.url) {
      await openOAuthUrl(data.url);
    }
  }, []);

  const signOut = useCallback(async () => {
    await deleteMyPushDevices();
    await supabase.auth.signOut();
    dispatch(setAuthUser(null as any)); // reducer expects nullable
  }, [dispatch]);

  return { signUp, signIn, signOut, signInWithGoogle };
}
