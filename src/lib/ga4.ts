/**
 * GA4 adapter for the consent-aware analytics layer.
 * Components must not call gtag directly — only track() / sinks.
 */

import {
  ANALYTICS_CONSENT_EVENT,
  getAnalyticsConsent,
  hasAnalyticsConsent,
  registerAnalyticsSink,
  type AnalyticsEventMap,
  type AnalyticsSink,
} from "./analytics";

/**
 * Public GA4 web-stream Measurement ID for metalora.art (safe to embed).
 * Docker candidate builds do not receive .env / VITE_* today, so production
 * bakes this value (same pattern as other public client config).
 *
 * Local override: VITE_GA4_MEASUREMENT_ID=G-XXXXXXXX
 */
const BAKED_GA4_MEASUREMENT_ID = "G-T2FFXETHTZ";

const MEASUREMENT_ID_RE = /^G-[A-Z0-9]+$/i;

type GtagCommand = "js" | "config" | "event" | "consent";

type GtagFn = (
  command: GtagCommand,
  ...args: Array<string | Date | Record<string, unknown>>
) => void;

declare global {
  interface Window {
    /** GA command queue: IArguments objects and/or plain event objects. */
    dataLayer: Array<IArguments | Record<string, unknown>>;
    gtag: GtagFn;
  }
}

let scriptLoadPromise: Promise<void> | null = null;
let configured = false;
let activeMeasurementId: string | null = null;
let enabling = false;
let unregisterSink: (() => void) | null = null;
let consentListenerAttached = false;

type QueuedEvent = {
  event: keyof AnalyticsEventMap;
  payload: AnalyticsEventMap[keyof AnalyticsEventMap];
};

const pendingEvents: QueuedEvent[] = [];

function isDebugEnabled(): boolean {
  try {
    return (
      import.meta.env.DEV === true ||
      import.meta.env.VITE_ANALYTICS_DEBUG === "true"
    );
  } catch {
    return false;
  }
}

function debugLog(message: string, detail?: unknown): void {
  if (!isDebugEnabled()) return;
  if (detail !== undefined) {
    console.info(`[ANALYTICS_DEBUG] ga4: ${message}`, detail);
  } else {
    console.info(`[ANALYTICS_DEBUG] ga4: ${message}`);
  }
}

export function getGa4MeasurementId(): string | null {
  try {
    const fromEnv = import.meta.env.VITE_GA4_MEASUREMENT_ID;
    if (typeof fromEnv === "string" && MEASUREMENT_ID_RE.test(fromEnv.trim())) {
      return fromEnv.trim();
    }
  } catch {
    // ignore
  }
  if (MEASUREMENT_ID_RE.test(BAKED_GA4_MEASUREMENT_ID.trim())) {
    return BAKED_GA4_MEASUREMENT_ID.trim();
  }
  return null;
}

/**
 * Canonical gtag command queue stub.
 * Must push the `arguments` object — NOT a rest-parameter Array —
 * so gtag.js can process the queue.
 */
function ensureDataLayer(): void {
  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    // Regular function (not arrow / not rest params) so `arguments` is IArguments.
    function gtagStub(): void {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtagStub as unknown as GtagFn;
  }
}

function loadGtagScript(measurementId: string): Promise<void> {
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise<void>((resolve, reject) => {
    ensureDataLayer();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-metalora-ga4="1"][src*="${measurementId}"]`,
    );
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.dataset.metaloraGa4 = "1";
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error("Failed to load gtag.js"));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

function withDebugMode<T extends Record<string, unknown>>(payload: T): T {
  if (!isDebugEnabled()) return payload;
  return { ...payload, debug_mode: true };
}

/** Origin + pathname only — never query or hash (payment tokens live in search). */
export function getSafeAnalyticsPageLocation(): string {
  try {
    return `${window.location.origin}${window.location.pathname}`;
  } catch {
    return "";
  }
}

/** Strip query/hash if a caller passed pathname+search into page_path. */
export function sanitizeAnalyticsPagePath(pagePath: string): string {
  if (!pagePath) return "/";
  const withoutHash = pagePath.split("#")[0] ?? pagePath;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  return withoutQuery || "/";
}

/** Origin + pathname only — never forward raw document.referrer. */
export function getSafeAnalyticsPageReferrer(): string {
  try {
    const raw = document.referrer;
    if (!raw) return "";
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}

function getGa4DefaultPageContext(): Record<string, string> {
  const context: Record<string, string> = {
    page_location: getSafeAnalyticsPageLocation(),
  };
  const referrer = getSafeAnalyticsPageReferrer();
  if (referrer) {
    context.page_referrer = referrer;
  }
  return context;
}

/** Shared gtag config fields — every config call must keep automatic pageviews off. */
function getGa4SharedConfigFields(): Record<string, unknown> {
  return {
    send_page_view: false,
    ...getGa4DefaultPageContext(),
  };
}

/**
 * Sync GA4 default page context so automatic events (scroll, engagement, etc.)
 * inherit sanitized page_location/page_referrer instead of document.location.
 */
export function syncGa4DefaultPageContext(): void {
  const measurementId = activeMeasurementId ?? getGa4MeasurementId();
  if (!measurementId || !configured || typeof window.gtag !== "function") {
    return;
  }

  try {
    window.gtag(
      "config",
      measurementId,
      withDebugMode(getGa4SharedConfigFields()),
    );
    debugLog("default page context synced");
  } catch {
    // Analytics must never affect app behavior.
  }
}

function withGa4EventPayload<T extends Record<string, unknown>>(payload: T): T {
  const enriched: Record<string, unknown> = {
    ...payload,
    page_location: getSafeAnalyticsPageLocation(),
  };
  const referrer = getSafeAnalyticsPageReferrer();
  if (referrer) {
    enriched.page_referrer = referrer;
  }
  return withDebugMode(enriched as T);
}

function configureGa4(measurementId: string): void {
  ensureDataLayer();
  activeMeasurementId = measurementId;
  window.gtag("js", new Date());
  window.gtag(
    "config",
    measurementId,
    withDebugMode({
      anonymize_ip: true,
      ...getGa4SharedConfigFields(),
    }),
  );
  configured = true;
  debugLog("configured", {
    measurementId,
    send_page_view: false,
    page_location: getSafeAnalyticsPageLocation(),
  });
}

function sendToGa4<E extends keyof AnalyticsEventMap>(
  event: E,
  payload: AnalyticsEventMap[E],
): void {
  if (typeof window.gtag !== "function") return;

  if (event === "page_view") {
    const p = payload as AnalyticsEventMap["page_view"];
    window.gtag(
      "event",
      "page_view",
      withGa4EventPayload({
        page_path: sanitizeAnalyticsPagePath(p.page_path),
        page_title: p.page_title,
      }),
    );
    return;
  }

  if (
    event === "view_item" ||
    event === "add_to_cart" ||
    event === "begin_checkout"
  ) {
    const p = payload as AnalyticsEventMap[
      "view_item" | "add_to_cart" | "begin_checkout"
    ];
    window.gtag(
      "event",
      event,
      withGa4EventPayload({
        currency: p.currency,
        value: p.value,
        items: p.items,
      }),
    );
    return;
  }

  if (event === "payment_start") {
    const p = payload as AnalyticsEventMap["payment_start"];
    window.gtag(
      "event",
      "payment_start",
      withGa4EventPayload({
        currency: p.currency,
        value: p.value,
        items: p.items,
        payment_provider: p.payment_provider,
      }),
    );
    return;
  }

  if (event === "purchase") {
    const p = payload as AnalyticsEventMap["purchase"];
    window.gtag(
      "event",
      "purchase",
      withGa4EventPayload({
        transaction_id: p.transaction_id,
        currency: p.currency,
        value: p.value,
        items: p.items,
      }),
    );
    return;
  }
}

function flushPending(): void {
  while (pendingEvents.length > 0) {
    const next = pendingEvents.shift();
    if (!next) break;
    sendToGa4(next.event, next.payload);
  }
}

const ga4Sink: AnalyticsSink = (event, payload) => {
  if (!configured) {
    // Keep only a short buffer so consent-time page_view is not lost while gtag loads.
    if (pendingEvents.length < 20) {
      pendingEvents.push({ event, payload });
    }
    return;
  }
  sendToGa4(event, payload);
};

async function enableGa4(): Promise<void> {
  const measurementId = getGa4MeasurementId();
  if (!measurementId) {
    debugLog("skipped enable: missing Measurement ID");
    return;
  }
  if (!hasAnalyticsConsent()) {
    debugLog("skipped enable: no consent");
    return;
  }
  if (enabling || (configured && unregisterSink)) {
    return;
  }
  enabling = true;

  try {
    // Register before async script load so consent-time track() is queued, not dropped.
    if (!unregisterSink) {
      unregisterSink = registerAnalyticsSink(ga4Sink);
      debugLog("sink registered");
    }

    await loadGtagScript(measurementId);
    if (!configured) {
      window.gtag("consent", "update", {
        analytics_storage: "granted",
      });
      configureGa4(measurementId);
    }
    flushPending();
  } catch (err) {
    debugLog("enable failed", err);
    pendingEvents.length = 0;
  } finally {
    enabling = false;
  }
}

function disableGa4Sink(): void {
  pendingEvents.length = 0;
  if (unregisterSink) {
    unregisterSink();
    unregisterSink = null;
    debugLog("sink unregistered");
  }
  configured = false;
  activeMeasurementId = null;
  if (typeof window.gtag === "function") {
    try {
      window.gtag("consent", "update", {
        analytics_storage: "denied",
      });
    } catch {
      // ignore
    }
  }
}

/**
 * Bootstrap GA4 against the existing consent-aware track() layer.
 * Call once from the app root. Safe to call multiple times.
 */
export function initGa4Analytics(): void {
  if (typeof window === "undefined") return;

  ensureDataLayer();
  // Default denied until explicit accept (fail closed for analytics_storage).
  window.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    wait_for_update: 500,
  });

  if (getAnalyticsConsent() === "accepted") {
    void enableGa4();
  }

  if (consentListenerAttached) return;
  consentListenerAttached = true;

  window.addEventListener(ANALYTICS_CONSENT_EVENT, ((event: Event) => {
    const detail = (event as CustomEvent<{ consent?: string }>).detail;
    if (detail?.consent === "accepted") {
      void enableGa4();
      return;
    }
    if (detail?.consent === "essential_only") {
      disableGa4Sink();
    }
  }) as EventListener);
}
