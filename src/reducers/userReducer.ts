import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { reducerLoadInitialUserController } from "../controllers/reducerController.ts";

interface UserState {
  user: any;
  token: string | null;
}

const initialState: UserState = {
  token: localStorage.getItem("token") || "",

  user: reducerLoadInitialUserController(),
};

export const user = createSlice({
  name: "user",
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<any>) => {
      state.user = action.payload;
    },
    setToken: (state, action: PayloadAction<string | null>) => {
      state.token = action.payload;
    },
  },
});

export const { setToken, setUser } = user.actions;

export default user.reducer;
