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
let unregisterSink: (() => void) | null = null;
let consentListenerAttached = false;
let consentDefaultQueued = false;

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

function queueConsentDefault(): void {
  if (consentDefaultQueued) return;
  consentDefaultQueued = true;
  window.gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    wait_for_update: 500,
  });
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

/** Queue measurement config to dataLayer — does not require gtag.js to be loaded. */
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

/**
 * Synchronously grant consent and queue GA4 config before any tracked events.
 * Safe to call multiple times (idempotent once configured).
 */
function activateGa4Sync(): boolean {
  const measurementId = getGa4MeasurementId();
  if (!measurementId || !hasAnalyticsConsent()) {
    debugLog("skipped sync activate: missing ID or no consent");
    return false;
  }
  if (configured) {
    return true;
  }

  ensureDataLayer();
  window.gtag("consent", "update", {
    analytics_storage: "granted",
  });
  configureGa4(measurementId);
  return true;
}

async function loadGa4ScriptAsync(): Promise<void> {
  const measurementId = getGa4MeasurementId();
  if (!measurementId || !hasAnalyticsConsent()) {
    return;
  }

  try {
    await loadGtagScript(measurementId);
    debugLog("gtag.js loaded");
  } catch (err) {
    debugLog("script load failed", err);
  }
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

  if (event === "payment_fail") {
    const p = payload as AnalyticsEventMap["payment_fail"];
    window.gtag(
      "event",
      "payment_fail",
      withGa4EventPayload({
        failure_stage: p.failure_stage,
        ...(p.failure_code ? { failure_code: p.failure_code } : {}),
        payment_provider: p.payment_provider,
      }),
    );
    return;
  }
}

const ga4Sink: AnalyticsSink = (event, payload) => {
  if (!configured || typeof window.gtag !== "function") {
    return false;
  }

  try {
    sendToGa4(event, payload);
    return true;
  } catch {
    return false;
  }
};

function registerGa4SinkIfNeeded(): void {
  if (!unregisterSink) {
    unregisterSink = registerAnalyticsSink(ga4Sink);
    debugLog("sink registered");
  }
}

function enableGa4ForConsent(): void {
  if (!activateGa4Sync()) {
    return;
  }
  registerGa4SinkIfNeeded();
  void loadGa4ScriptAsync();
}

function disableGa4Sink(): void {
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
 * Call once before React render. Safe to call multiple times.
 */
export function initGa4Analytics(): void {
  if (typeof window === "undefined") return;

  ensureDataLayer();
  queueConsentDefault();

  if (getAnalyticsConsent() === "accepted") {
    enableGa4ForConsent();
  }

  if (consentListenerAttached) return;
  consentListenerAttached = true;

  window.addEventListener(ANALYTICS_CONSENT_EVENT, ((event: Event) => {
    const detail = (event as CustomEvent<{ consent?: string }>).detail;
    if (detail?.consent === "accepted") {
      enableGa4ForConsent();
      return;
    }
    if (detail?.consent === "essential_only") {
      disableGa4Sink();
    }
  }) as EventListener);
}

/** @internal Reset GA4 module state between ordering tests. */
export function __resetGa4ForTests(): void {
  scriptLoadPromise = null;
  configured = false;
  activeMeasurementId = null;
  if (unregisterSink) {
    unregisterSink();
    unregisterSink = null;
  }
  consentListenerAttached = false;
  consentDefaultQueued = false;
}

/** @internal Test helper — parse queued gtag command names in order. */
export function parseGa4DataLayerCommands(
  dataLayer: Array<IArguments | Record<string, unknown>>,
): string[] {
  return dataLayer.map((entry) => {
    if (!entry || typeof entry !== "object") return "?";
    const args = entry as IArguments;
    if (typeof args.length !== "number" || args.length === 0) return "?";
    return String(args[0]);
  });
}

/** @internal Test helper — index of first matching command, or -1. */
export function indexOfGa4DataLayerCommand(
  dataLayer: Array<IArguments | Record<string, unknown>>,
  command: string,
  eventName?: string,
): number {
  return dataLayer.findIndex((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const args = entry as IArguments;
    if (String(args[0]) !== command) return false;
    if (eventName === undefined) return true;
    return String(args[1]) === eventName;
  });
}

/** @internal Test helper — whether GA4 config has been queued synchronously. */
export function isGa4ConfiguredForDispatch(): boolean {
  return configured;
}
