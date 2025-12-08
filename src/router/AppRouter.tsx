// src/router/AppRouter.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import { Paths } from "./Paths";

import HomePage from "../pages/HomePage";
import CreatePage from "../pages/CreatePage";
import CreateTitlePage from "../pages/CreateTitlePage";
import CreateActivitiesPage from "../pages/CreateActivitiesPage";
import CreateCategoryPage from "../pages/CreateCategoryPage";
import CreateMapPage from "../pages/CreateMapPage";
import PreviewPage from "../pages/PreviewPage";
import ExperiencePage from "../pages/ExperiencePage";
import HangoutPage from "../pages/HangoutPage";
import NotificationPage from "../pages/NotificationPage";
import ProfilePage from "../pages/ProfilePage";
import FeedTestPage from "../pages/FeedTestPage";
import AuthCallback from "../pages/AuthCallback";

export default function AppRouter() {
  return (
    <Routes>
      <Route path={Paths.home} element={<HomePage />} />
      <Route path={Paths.create} element={<CreatePage />} />
      <Route path={Paths.createTitle} element={<CreateTitlePage />} />
      <Route path={Paths.createActivities} element={<CreateActivitiesPage />} />
      <Route path={Paths.createCategories} element={<CreateCategoryPage />} />
      <Route path={Paths.createMap} element={<CreateMapPage />} />
      <Route path={Paths.preview} element={<PreviewPage />} />

      <Route path={Paths.experience} element={<ExperiencePage />} />
      <Route path={Paths.experienceDetail} element={<ExperiencePage />} />
      <Route path={Paths.hangoutDetail} element={<HangoutPage />} />

      <Route path={Paths.notification} element={<NotificationPage />} />
      <Route path={Paths.profile} element={<ProfilePage />} />
      <Route path={Paths.feedTest} element={<FeedTestPage />} />
      <Route path={Paths.user} element={<ProfilePage />} />
      <Route path={Paths.profileMe} element={<ProfilePage />} />
      <Route path={Paths.me} element={<Navigate to="/u/me" replace />} />

      <Route path="/auth/callback" element={<AuthCallback />} />

      {/* Fallback */}
      <Route path="*" element={<Navigate to={Paths.home} replace />} />
    </Routes>
  );
}
