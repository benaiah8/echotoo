import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface ModalState {
  authModal: boolean;
}

const initialState: ModalState = {
  authModal: false,
};

export const modal = createSlice({
  name: "modal",
  initialState,
  reducers: {
    setAuthModal: (state, action: PayloadAction<any>) => {
      state.authModal = action.payload;
    },
  },
});

export const { setAuthModal } = modal.actions;

export default modal.reducer;
