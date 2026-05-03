import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../app/store";
import { setAuthModal } from "../reducers/modalReducer";

/**
 * Shared guard for UI actions that require authentication.
 * Keeps behavior consistent across buttons/modals and avoids duplicated checks.
 */
export function useAuthActionGate() {
  const dispatch = useDispatch();
  const authState = useSelector((state: RootState) => state.auth);
  const authLoading = authState?.loading ?? true;
  const isAuthenticated = !!authState?.user;

  const ensureAuthed = useCallback(() => {
    if (!authLoading && !isAuthenticated) {
      dispatch(setAuthModal(true));
      return false;
    }
    return true;
  }, [authLoading, isAuthenticated, dispatch]);

  return {
    authLoading,
    isAuthenticated,
    ensureAuthed,
  };
}

export default useAuthActionGate;
