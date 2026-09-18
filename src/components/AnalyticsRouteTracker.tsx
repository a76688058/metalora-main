import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  ANALYTICS_CONSENT_EVENT,
  hasAnalyticsConsent,
  track,
} from "../lib/analytics";
import {
  sanitizeAnalyticsPagePath,
  syncGa4DefaultPageContext,
} from "../lib/ga4";

/** Survives StrictMode remounts within the same document lifetime. */
let lastPageViewKey: string | null = null;

/**
 * SPA page_view tracker — must render inside BrowserRouter.
 * Dedupe identity is the sanitized pathname actually sent to GA.
 */
export default function AnalyticsRouteTracker() {
  const location = useLocation();
  const pagePath = sanitizeAnalyticsPagePath(location.pathname);

  useEffect(() => {
    const emitIfAllowed = () => {
      if (!hasAnalyticsConsent()) return;
      if (lastPageViewKey === pagePath) return;
      lastPageViewKey = pagePath;
      syncGa4DefaultPageContext();
      track("page_view", {
        page_path: pagePath,
        page_title: typeof document !== "undefined" ? document.title : undefined,
      });
    };

    emitIfAllowed();

    const onConsent = (event: Event) => {
      const detail = (event as CustomEvent<{ consent?: string }>).detail;
      if (detail?.consent === "accepted") {
        // Allow current route once after opt-in; do not replay prior events.
        lastPageViewKey = null;
        emitIfAllowed();
      }
    };

    window.addEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_EVENT, onConsent);
    };
  }, [pagePath]);

  return null;
}
