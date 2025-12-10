import { RootState } from "../app/store";

export const selectUserId = (state: RootState): string | null => {
  return state.auth?.user?.id || null;
};

