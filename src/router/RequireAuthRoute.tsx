import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { setAuthModal } from "../reducers/modalReducer";
import { Paths } from "./Paths";
import { supabase } from "../lib/supabaseClient";

interface RequireAuthRouteProps {
  children: ReactNode;
}

/**
 * Route guard: if not logged in, opens AuthModal and redirects to home.
 * Auth logic matches BottomTab.requireAuth().
 * Uses useEffect for dispatch+navigate so AuthModal opens reliably (Navigate caused unmount before dispatch).
 */
export function RequireAuthRoute({ children }: RequireAuthRouteProps) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();

  const reduxUserId = useSelector((s: any) => s.auth?.user?.id) as
    | string
    | undefined;

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    supabase.auth.getSession().then(({ data }) => {
      if (on) setSessionUserId(data.session?.user?.id ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      if (on) setSessionUserId(sess?.user?.id ?? null);
    });
    return () => {
      on = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const authedId = reduxUserId ?? sessionUserId;
  const isAuthedFinal = !!authedId;

  const lastHandledKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (isAuthedFinal) return;
    if (lastHandledKeyRef.current === location.key) return;
    lastHandledKeyRef.current = location.key;

    dispatch(setAuthModal(true));
    if (location.pathname !== Paths.home) {
      navigate(Paths.home, { replace: true });
    }
  }, [dispatch, navigate, location.key, location.pathname, isAuthedFinal]);

  if (isAuthedFinal) {
    return <>{children}</>;
  }

  return null;
}
