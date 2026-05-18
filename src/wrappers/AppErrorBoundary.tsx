import { Component, type ErrorInfo, type ReactNode } from "react";
import {
  frostedModalPanelClassName,
  frostedModalPanelStyle,
} from "../components/ui/FrostedCenterModal";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

/**
 * Catches render errors in the main app tree so WKWebView shows a recovery UI
 * instead of a blank screen.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[AppErrorBoundary] Uncaught render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-6 py-12"
          role="alert"
        >
          <div
            className={`${frostedModalPanelClassName} text-center`}
            style={frostedModalPanelStyle}
          >
            <h1 className="text-base font-semibold text-[var(--text)]">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-[var(--text)]/70">
              Please close and reopen EchoToo.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
