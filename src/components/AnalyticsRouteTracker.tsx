import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  ANALYTICS_CONSENT_EVENT,
  hasAnalyticsConsent,
  track,
} from "../lib/analytics";
import { syncGa4DefaultPageContext } from "../lib/ga4";

/** Survives StrictMode remounts within the same document lifetime. */
let lastPageViewKey: string | null = null;

/**
 * SPA page_view tracker — must render inside BrowserRouter.
 */
export default function AnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    const key = `${location.pathname}${location.search}`;

    const emitIfAllowed = () => {
      if (!hasAnalyticsConsent()) return;
      if (lastPageViewKey === key) return;
      lastPageViewKey = key;
      syncGa4DefaultPageContext();
      track("page_view", {
        page_path: key,
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
  }, [location.pathname, location.search]);

  return null;
}
