/**
 * Vendor-neutral analytics foundation.
 * Sinks (GA4 / Meta / Naver) register later; components only call track().
 */

export const ANALYTICS_CONSENT_EVENT = "metalora:cookie-consent-changed";

export type AnalyticsConsentValue = "accepted" | "essential_only";

export type AnalyticsItem = {
  item_id: string;
  item_name: string;
  item_variant?: string;
  price: number;
  quantity: number;
};

export type AnalyticsEventMap = {
  page_view: {
    page_path: string;
    page_title?: string;
  };
  view_item: {
    currency: "KRW";
    value: number;
    items: [AnalyticsItem];
  };
  add_to_cart: {
    currency: "KRW";
    value: number;
    items: [AnalyticsItem];
  };
  begin_checkout: {
    currency: "KRW";
    value: number;
    items: AnalyticsItem[];
  };
  payment_start: {
    currency: "KRW";
    value: number;
    items: AnalyticsItem[];
    payment_provider: "toss";
  };
  purchase: {
    transaction_id: string;
    currency: "KRW";
    value: number;
    items: AnalyticsItem[];
  };
  payment_fail: {
    failure_stage:
      | "prepare_http"
      | "prepare_network"
      | "toss_sdk_load"
      | "toss_request"
      | "toss_redirect_fail"
      | "confirm_network"
      | "confirm_http"
      | "confirm_finalize";
    failure_code?: string;
    payment_provider: "toss";
  };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;

export type AnalyticsSink = <E extends AnalyticsEventName>(
  event: E,
  payload: AnalyticsEventMap[E],
) => void;

const sinks = new Set<AnalyticsSink>();

function isDebugEnabled(): boolean {
  try {
    return import.meta.env.DEV === true || import.meta.env.VITE_ANALYTICS_DEBUG === "true";
  } catch {
    return false;
  }
}

function debugLog(message: string, detail?: unknown): void {
  if (!isDebugEnabled()) return;
  if (detail !== undefined) {
    console.info(`[ANALYTICS_DEBUG] ${message}`, detail);
  } else {
    console.info(`[ANALYTICS_DEBUG] ${message}`);
  }
}

/** Fail closed: only explicit "accepted" enables outbound analytics. */
export function hasAnalyticsConsent(): boolean {
  try {
    return localStorage.getItem("cookieConsent") === "accepted";
  } catch {
    return false;
  }
}

/** Canonical consent check for components (same semantics as track()). */
export function isAnalyticsConsentAccepted(): boolean {
  return hasAnalyticsConsent();
}

export function getAnalyticsConsent(): AnalyticsConsentValue | null {
  try {
    const value = localStorage.getItem("cookieConsent");
    if (value === "accepted" || value === "essential_only") return value;
    return null;
  } catch {
    return null;
  }
}

export function registerAnalyticsSink(sink: AnalyticsSink): () => void {
  sinks.add(sink);
  return () => {
    sinks.delete(sink);
  };
}

export function track<E extends AnalyticsEventName>(
  event: E,
  payload: AnalyticsEventMap[E],
): void {
  if (!hasAnalyticsConsent()) {
    debugLog(`suppressed (no consent): ${event}`, payload);
    return;
  }

  debugLog(event, payload);

  for (const sink of sinks) {
    try {
      sink(event, payload);
    } catch (err) {
      if (isDebugEnabled()) {
        console.warn("[ANALYTICS_DEBUG] sink error", err);
      }
    }
  }
}

export function dispatchAnalyticsConsentChanged(
  consent: AnalyticsConsentValue,
): void {
  try {
    window.dispatchEvent(
      new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: { consent } }),
    );
  } catch {
    // ignore
  }
}
