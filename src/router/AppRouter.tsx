// src/router/AppRouter.tsx
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  type Location,
} from "react-router-dom";
import { Paths, isMessagesConversationPath, isCreateFlowPath } from "./Paths";
import { RequireAuthRoute } from "./RequireAuthRoute";
// [PHASE 2 TESTING] Temporarily using new version for testing
// OLD: import { PersistentTabContainer } from "./PersistentTabContainer";
import { PersistentTabContainer } from "./PersistentTabContainer.new";

// Non-tab pages (overlays, flows, utilities)
import CreatePage from "../pages/CreatePage";
import CreateTitlePage from "../pages/CreateTitlePage";
import CreateActivitiesPage from "../pages/CreateActivitiesPage";
import CreateCategoryPage from "../pages/CreateCategoryPage";
import CreateFinalizePage from "../pages/CreateFinalizePage";
import CreateMapPage from "../pages/CreateMapPage";
import ExperiencePage from "../pages/ExperiencePage";
import FeedTestPage from "../pages/FeedTestPage";
import DirectMessagePage from "../pages/messages/DirectMessagePage";
import OpenDmPage from "../pages/dev/OpenDmPage";
import MinePortraitStackPreview from "../pages/dev/MinePortraitStackPreview";
import ReportsReviewPage from "../pages/reviews/ReportsReviewPage";
import AppUpdatesPage from "../pages/internal/AppUpdatesPage";
import CompanyAnnouncementsPage from "../pages/internal/CompanyAnnouncementsPage";
import CrashReportsPage from "../pages/internal/CrashReportsPage";
import InternalLandingPage from "../pages/internal/InternalLandingPage";
import AuthCallback from "../pages/AuthCallback";
import PostDetailModal from "../components/PostDetailModal";
import CreateFlowLayout from "../components/create/CreateFlowLayout";
import { isPostDetailRoutePath } from "../lib/inviteOverlayHistory";

/**
 * Legacy `/create/preview` → Finalize (replace) so Preview never mounts or publishes.
 * Preserves search/hash/state; draft/edit bootstrap stays in localStorage.
 */
function RedirectCreatePreviewToFinalize() {
  const location = useLocation();
  return (
    <Navigate
      to={{
        pathname: Paths.createFinalize,
        search: location.search,
        hash: location.hash,
      }}
      replace
      state={location.state}
    />
  );
}

/** Cold/direct post detail opens: home tab stays mounted behind PostDetailModal. */
const DEFAULT_POST_DETAIL_BACKGROUND: Location = {
  pathname: "/",
  search: "",
  hash: "",
  key: "default",
  state: null,
};

/** Cold/direct conversation opens: Messages inbox tab stays mounted underneath. */
const DEFAULT_MESSAGES_BACKGROUND: Location = {
  pathname: "/messages",
  search: "",
  hash: "",
  key: "default",
  state: null,
};

// Policy & legal pages
import PrivacyPage from "../pages/policy/PrivacyPage";
import TermsPage from "../pages/policy/TermsPage";
import CommunityGuidelinesPage from "../pages/policy/CommunityGuidelinesPage";
import ChildSafetyPage from "../pages/policy/ChildSafetyPage";
import DeleteAccountPage from "../pages/policy/DeleteAccountPage";
import ReportingPage from "../pages/policy/ReportingPage";
import SupportPage from "../pages/policy/SupportPage";
import SafetyPage from "../pages/policy/SafetyPage";

/**
 * App Router - Tab Architecture
 *
 * Architecture:
 * 1. PersistentTabContainer: Conditionally rendered on tab routes only
 * 2. Routes: Handles ALL pages, returns null for tab routes when PersistentTabContainer is active
 *
 * Core tab pages (/, /u/me, /notifications, /u/:username) are handled by
 * PersistentTabContainer when on a tab route. Non-tab routes render normally.
 *
 * Benefits:
 * - 31x faster tab navigation (16ms vs 500ms)
 * - 70% fewer API calls (no re-fetching on return)
 * - Preserved scroll position and component state
 * - Native app-like experience
 * - No double rendering on non-tab routes
 */
function isTabPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/people" ||
    pathname === "/messages" ||
    pathname === "/notifications" ||
    pathname === "/profile" ||
    pathname === "/u/me" ||
    pathname === "/me" ||
    (pathname.startsWith("/u/") && !pathname.includes("/create"))
  );
}

type AppRouterProps = {
  /** When false, tab pages (incl. home feed) are not mounted — used during startup splash. */
  contentReady?: boolean;
};

export default function AppRouter({ contentReady = true }: AppRouterProps) {
  const location = useLocation();
  const state = location.state as { backgroundLocation?: Location } | null;
  const requestedBackground = state?.backgroundLocation;
  /**
   * A conversation path must never be the Messages modal underlay / overlay match
   * source — that leaves a stale thread mounted when opening another conversation.
   */
  const backgroundIsConversation =
    !!requestedBackground &&
    isMessagesConversationPath(requestedBackground.pathname ?? "");
  const backgroundLocation = backgroundIsConversation
    ? undefined
    : requestedBackground;
  const isDetailRoute = isPostDetailRoutePath(location.pathname);
  const isConversationRoute = isMessagesConversationPath(location.pathname);
  const effectiveBackground =
    backgroundLocation ??
    (isDetailRoute
      ? DEFAULT_POST_DETAIL_BACKGROUND
      : isConversationRoute
        ? DEFAULT_MESSAGES_BACKGROUND
        : undefined);

  const mainRoutesLocation = effectiveBackground ?? location;
  const isTabRoute = isTabPath(location.pathname);
  const isCreateRoute = isCreateFlowPath(location.pathname);
  const isMainTabPath = isTabPath(mainRoutesLocation.pathname);

  const showConversationOverlay =
    isConversationRoute || (isDetailRoute && backgroundIsConversation);

  /**
   * Overlay must follow the REAL current conversation URL.
   * Only when viewing post-detail over a conversation underlay do we use the
   * requested conversation background for the underlaid thread route.
   */
  const conversationRoutesLocation = isConversationRoute
    ? location
    : isDetailRoute && backgroundIsConversation && requestedBackground
      ? requestedBackground
      : location

  return (
    <>
      {/*
        Tab container: tab routes, modal underlays, or Create (Home stays mounted
        behind the Create shell — do not remount on Create exit).
        Create must NOT use effectiveBackground: that would rewrite mainRoutesLocation
        and unmount the /create/* Routes tree.
      */}
      {contentReady && (isTabRoute || !!effectiveBackground || isCreateRoute) && (
        <PersistentTabContainer
          backgroundPath={
            effectiveBackground?.pathname ??
            (isCreateRoute ? Paths.home : undefined)
          }
          tabsCovered={isCreateRoute}
          mountHomeTab={contentReady}
        />
      )}

      {/* Main routes: use background location when modal is open so background stays rendered */}
      <Routes location={mainRoutesLocation}>
        {/* Tab routes - return null when PersistentTabContainer is active */}
        <Route
          path={Paths.home}
          element={isMainTabPath ? null : <Navigate to="/" replace />}
        />
        <Route path={Paths.games} element={<Navigate to="/" replace />} />
        <Route
          path={Paths.notification}
          element={
            isMainTabPath ? null : <Navigate to="/notifications" replace />
          }
        />
        <Route
          path={Paths.profile}
          element={isMainTabPath ? null : <Navigate to="/u/me" replace />}
        />
        <Route
          path={Paths.profileMe}
          element={isMainTabPath ? null : <Navigate to="/u/me" replace />}
        />
        <Route
          path={Paths.user}
          element={
            isMainTabPath ? null : (
              <Navigate to={mainRoutesLocation.pathname} replace />
            )
          }
        />
        <Route path={Paths.me} element={<Navigate to="/u/me" replace />} />
        <Route
          path={Paths.people}
          element={isMainTabPath ? null : <Navigate to="/people" replace />}
        />
        <Route
          path={Paths.messages}
          element={
            isMainTabPath ? null : <Navigate to="/messages" replace />
          }
        />
        <Route
          path={Paths.messagesConversation}
          element={null}
        />

        {/* Bare /experience unchanged; :id detail is PostDetailModal overlay only */}
        <Route path={Paths.experience} element={<ExperiencePage />} />
        <Route path={Paths.experienceDetail} element={null} />
        <Route path={Paths.hangoutDetail} element={null} />

        {/* Create flow: single parent keeps CreateFlowLayout + CreatePostMediaProvider mounted */}
        <Route
          path={Paths.create}
          element={
            <RequireAuthRoute>
              <CreateFlowLayout />
            </RequireAuthRoute>
          }
        >
          <Route index element={<CreatePage />} />
          <Route path="title" element={<CreateTitlePage />} />
          <Route path="activities" element={<CreateActivitiesPage />} />
          <Route path="finalize" element={<CreateFinalizePage />} />
          <Route path="categories" element={<CreateCategoryPage />} />
          <Route path="map" element={<CreateMapPage />} />
          <Route path="preview" element={<RedirectCreatePreviewToFinalize />} />
        </Route>

        {/* Utility routes */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path={Paths.feedTest} element={<FeedTestPage />} />
        {import.meta.env.DEV ? (
          <>
            <Route
              path={Paths.devOpenDm}
              element={
                <RequireAuthRoute>
                  <OpenDmPage />
                </RequireAuthRoute>
              }
            />
            <Route
              path={Paths.devMinePortraitStack}
              element={<MinePortraitStackPreview />}
            />
          </>
        ) : null}
        <Route
          path={Paths.internal}
          element={
            <RequireAuthRoute>
              <InternalLandingPage />
            </RequireAuthRoute>
          }
        />
        <Route
          path={Paths.internalReports}
          element={
            <RequireAuthRoute>
              <ReportsReviewPage />
            </RequireAuthRoute>
          }
        />
        <Route
          path={Paths.internalAppUpdates}
          element={
            <RequireAuthRoute>
              <AppUpdatesPage />
            </RequireAuthRoute>
          }
        />
        <Route
          path={Paths.internalCompanyAnnouncements}
          element={
            <RequireAuthRoute>
              <CompanyAnnouncementsPage />
            </RequireAuthRoute>
          }
        />
        <Route
          path={Paths.internalCrashReports}
          element={
            <RequireAuthRoute>
              <CrashReportsPage />
            </RequireAuthRoute>
          }
        />

        {/* Policy & legal pages */}
        <Route path={Paths.privacy} element={<PrivacyPage />} />
        <Route path={Paths.terms} element={<TermsPage />} />
        <Route
          path={Paths.communityGuidelines}
          element={<CommunityGuidelinesPage />}
        />
        <Route path={Paths.childSafety} element={<ChildSafetyPage />} />
        <Route
          path={Paths.accountDeletion}
          element={<Navigate to={Paths.deleteAccount} replace />}
        />
        <Route path={Paths.deleteAccount} element={<DeleteAccountPage />} />
        <Route path={Paths.reporting} element={<ReportingPage />} />
        <Route path={Paths.support} element={<SupportPage />} />
        <Route path={Paths.safety} element={<SafetyPage />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to={Paths.home} replace />} />
      </Routes>

      {/* Post detail overlay: always modal for /experience/:id and /hangout/:id */}
      {isDetailRoute && (
        <Routes>
          <Route path={Paths.experienceDetail} element={<PostDetailModal />} />
          <Route path={Paths.hangoutDetail} element={<PostDetailModal />} />
        </Routes>
      )}
      {showConversationOverlay && (
        <Routes location={conversationRoutesLocation}>
          <Route
            path={Paths.messagesConversation}
            element={
              <RequireAuthRoute>
                <DirectMessagePage />
              </RequireAuthRoute>
            }
          />
        </Routes>
      )}
    </>
  );
}
