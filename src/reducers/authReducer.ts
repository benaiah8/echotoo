// src/reducers/authReducer.ts
import { createSlice, createAction, PayloadAction } from "@reduxjs/toolkit";

export type AuthUser = {
  id: string;
  email?: string | null;
  avatar_url?: string | null;
  display_name?: string | null;
  username?: string | null;
};

type AuthState = {
  user: AuthUser | null;
  loading: boolean;
  guest: boolean; // ← NEW: explicit guest browsing mode
};

const initialState: AuthState = { user: null, loading: true, guest: false };

// Action you can dispatch from the AuthModal "Continue as guest" link
export const setGuest = createAction<boolean>("auth/setGuest");

const slice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAuthUser(state, action: PayloadAction<AuthUser | null>) {
      state.user = action.payload;
      state.loading = false;
      if (action.payload) state.guest = false; // real login cancels guest mode
    },
    setAuthLoading(state, action: PayloadAction<boolean>) {
      state.loading = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(setGuest, (state, { payload }) => {
      state.guest = payload;
      if (payload) {
        // guest mode means no authenticated user object
        state.user = null;
        state.loading = false;
      }
    });
  },
});

export const { setAuthUser, setAuthLoading } = slice.actions;
export default slice.reducer;
