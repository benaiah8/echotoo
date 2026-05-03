import { useNavigate } from "react-router-dom";

/**
 * Desktop marketing panel: navigate to policy/help URLs.
 * Plain navigation (no background overlay state) so AppRouter resolves the
 * route and full-page legal content renders on desktop policy paths.
 */
export function useDesktopPolicyNavigate() {
  const navigate = useNavigate();

  return function navigateToPolicyRoute(targetPath: string) {
    navigate(targetPath);
  };
}
