import {
  configureStore,
  ThunkAction,
  Action,
  Middleware,
} from "@reduxjs/toolkit";
import userReducer from "../reducers/userReducer";
import modalReducer from "../reducers/modalReducer";
import authReducer from "../reducers/authReducer";
import {
  createStateSyncMiddleware,
  initMessageListener,
} from "redux-state-sync";

const syncMiddleware = createStateSyncMiddleware({
  whitelist: ["user/setUser", "user/setToken"],
}) as Middleware;

export const store = configureStore({
  reducer: {
    user: userReducer,
    modal: modalReducer,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(syncMiddleware),
});

initMessageListener(store);

export type AppDispatch = typeof store.dispatch;
export type RootState = ReturnType<typeof store.getState>;
export type AppThunk<ReturnType = void> = ThunkAction<
  ReturnType,
  RootState,
  unknown,
  Action<string>
>;
