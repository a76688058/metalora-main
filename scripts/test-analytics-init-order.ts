/**
 * Static ordering tests for GA4 init vs payment_fail dispatch.
 * Run: npx tsx scripts/test-analytics-init-order.ts
 */

import {
  __resetGa4ForTests,
  indexOfGa4DataLayerCommand,
  initGa4Analytics,
  isGa4ConfiguredForDispatch,
  parseGa4DataLayerCommands,
} from "../src/lib/ga4";
import {
  __resetAnalyticsSinksForTests,
  hasRegisteredAnalyticsSinks,
  track,
} from "../src/lib/analytics";
import { reportPaymentFail } from "../src/lib/paymentFailureAnalytics";

type TestResult = { name: string; pass: boolean; detail?: string };

const results: TestResult[] = [];

function assert(name: string, condition: boolean, detail?: string): void {
  results.push({ name, pass: condition, detail });
  const status = condition ? "PASS" : "FAIL";
  console.log(`${status}: ${name}${detail ? ` — ${detail}` : ""}`);
}

function resetModules(): void {
  __resetGa4ForTests();
  __resetAnalyticsSinksForTests();
}

function createMockStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function createMockDocument(): {
  doc: Document;
  getScriptCount: () => number;
} {
  const scripts: HTMLScriptElement[] = [];
  const head = {
    appendChild(node: HTMLScriptElement) {
      scripts.push(node);
      return node;
    },
  };
  const doc = {
    head,
    referrer: "",
    querySelector(selector: string) {
      const measurementMatch = /id=([^"&]+)/.exec(selector);
      const measurementId = measurementMatch?.[1];
      return (
        scripts.find((script) => {
          if (!selector.includes("data-metalora-ga4")) return false;
          if (!measurementId) return script.dataset.metaloraGa4 === "1";
          return (
            script.dataset.metaloraGa4 === "1" &&
            script.src.includes(measurementId)
          );
        }) ?? null
      );
    },
    createElement(tag: string) {
      if (tag !== "script") {
        throw new Error(`Unexpected element: ${tag}`);
      }
      return {
        async: false,
        src: "",
        dataset: {} as DOMStringMap,
        onload: null as (() => void) | null,
        onerror: null as (() => void) | null,
      } as unknown as HTMLScriptElement;
    },
  } as unknown as Document;

  return {
    doc,
    getScriptCount: () => scripts.length,
  };
}

function installBrowserMocks(options: {
  consent?: "accepted" | "essential_only" | null;
  pathname?: string;
}) {
  const dataLayer: Array<IArguments | Record<string, unknown>> = [];
  const session = createMockStorage();
  const local = createMockStorage(
    options.consent ? { cookieConsent: options.consent } : {},
  );
  const { doc, getScriptCount } = createMockDocument();
  const listeners = new Map<string, Set<EventListener>>();

  function gtagStub(): void {
    dataLayer.push(arguments);
  }

  const location = {
    origin: "https://metalora.art",
    pathname: options.pathname ?? "/payment/fail",
    search: "?code=PAY_PROCESS_CANCELED&orderId=ORD-E2E-FAIL-NEW",
    hash: "",
  };

  const win = {
    dataLayer,
    gtag: gtagStub,
    location,
    document: doc,
    addEventListener(type: string, listener: EventListener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: EventListener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event: Event) {
      for (const listener of listeners.get(event.type) ?? []) {
        listener(event);
      }
      return true;
    },
  };

  globalThis.window = win as unknown as Window & typeof globalThis;
  globalThis.document = doc;
  globalThis.localStorage = local;
  globalThis.sessionStorage = session;

  return { dataLayer, doc, session, local, win, getScriptCount };
}

// --- Test A: accepted startup direct /payment/fail ---
{
  resetModules();
  const { dataLayer, getScriptCount } = installBrowserMocks({
    consent: "accepted",
    pathname: "/payment/fail",
  });

  initGa4Analytics();

  const configIdx = indexOfGa4DataLayerCommand(dataLayer, "config");
  assert("A1 config queued before render", configIdx >= 0, `index=${configIdx}`);
  assert("A2 configured before sink dispatch", isGa4ConfiguredForDispatch());
  assert("A3 sink registered", hasRegisteredAnalyticsSinks());

  const dispatched = track("payment_fail", {
    failure_stage: "toss_redirect_fail",
    failure_code: "PAY_PROCESS_CANCELED",
    payment_provider: "toss",
  });
  assert("A4 track returns true", dispatched);

  const eventIdx = indexOfGa4DataLayerCommand(
    dataLayer,
    "event",
    "payment_fail",
  );
  assert(
    "A5 config before payment_fail event",
    configIdx >= 0 && eventIdx > configIdx,
    `config@${configIdx}, event@${eventIdx}`,
  );

  const commands = parseGa4DataLayerCommands(dataLayer);
  assert(
    "A6 command order",
    commands.indexOf("config") < commands.lastIndexOf("event"),
    commands.join(" → "),
  );

  reportPaymentFail({
    failure_stage: "confirm_http",
    failure_code: "http_500",
    orderNumberForDedupe: "ORD-E2E-FAIL-NEW",
  });
  assert(
    "A7 reported marker written",
    sessionStorage.getItem(
      "metalora:payment-fail:ORD-E2E-FAIL-NEW:confirm_http:http_500",
    ) === "reported",
  );

  assert(
    "A8 script load initiated async",
    getScriptCount() === 1,
    `scripts=${getScriptCount()}`,
  );
}

// --- Test B: no consent startup ---
{
  resetModules();
  installBrowserMocks({ consent: null, pathname: "/payment/fail" });
  initGa4Analytics();

  assert("B1 no sink without consent", !hasRegisteredAnalyticsSinks());
  assert("B2 not configured", !isGa4ConfiguredForDispatch());

  const dispatched = track("payment_fail", {
    failure_stage: "toss_redirect_fail",
    failure_code: "PAY_PROCESS_CANCELED",
    payment_provider: "toss",
  });
  assert("B3 track returns false", !dispatched);

  reportPaymentFail({
    failure_stage: "toss_redirect_fail",
    failure_code: "PAY_PROCESS_CANCELED",
    orderNumberForDedupe: "ORD-NO-CONSENT",
  });
  assert(
    "B4 suppressed_no_consent marker",
    sessionStorage.getItem(
      "metalora:payment-fail:ORD-NO-CONSENT:toss_redirect_fail:PAY_PROCESS_CANCELED",
    ) === "suppressed_no_consent",
  );
}

// --- Test C: accepted mid-session ---
{
  resetModules();
  const { dataLayer, local, win } = installBrowserMocks({
    consent: null,
    pathname: "/",
  });
  initGa4Analytics();

  assert("C1 no config at essential startup", !isGa4ConfiguredForDispatch());

  local.setItem("cookieConsent", "accepted");
  win.dispatchEvent(
    new CustomEvent("metalora:cookie-consent-changed", {
      detail: { consent: "accepted" },
    }),
  );

  const configIdx = indexOfGa4DataLayerCommand(dataLayer, "config");
  assert("C2 config queued on consent accept", configIdx >= 0);
  assert("C3 sink registered after consent", hasRegisteredAnalyticsSinks());

  const dispatched = track("page_view", {
    page_path: "/",
    page_title: "Metalora",
  });
  const eventIdx = indexOfGa4DataLayerCommand(dataLayer, "event", "page_view");
  assert(
    "C4 config before mid-session page_view",
    configIdx >= 0 && eventIdx > configIdx,
    `config@${configIdx}, page_view@${eventIdx}`,
  );
  assert("C5 mid-session track true", dispatched);
}

// --- Test D: StrictMode / double init ---
{
  resetModules();
  const { dataLayer } = installBrowserMocks({
    consent: "accepted",
    pathname: "/payment/fail",
  });

  initGa4Analytics();
  initGa4Analytics();

  const configCount = parseGa4DataLayerCommands(dataLayer).filter(
    (cmd) => cmd === "config",
  ).length;
  const consentDefaultCount = dataLayer.filter((entry) => {
    const args = entry as IArguments;
    return args[0] === "consent" && args[1] === "default";
  }).length;

  assert("D1 single config on double init", configCount === 1);
  assert("D2 single consent default on double init", consentDefaultCount === 1);
  assert("D3 single sink registration", hasRegisteredAnalyticsSinks());
}

// --- Test E: revoke consent clears configured state ---
{
  resetModules();
  const { win } = installBrowserMocks({ consent: "accepted" });
  initGa4Analytics();
  assert("E1 configured with consent", isGa4ConfiguredForDispatch());

  win.dispatchEvent(
    new CustomEvent("metalora:cookie-consent-changed", {
      detail: { consent: "essential_only" },
    }),
  );
  assert("E2 sink removed on revoke", !hasRegisteredAnalyticsSinks());
  assert("E3 not configured after revoke", !isGa4ConfiguredForDispatch());
}

const failed = results.filter((r) => !r.pass);
console.log("");
console.log(
  failed.length === 0
    ? `ALL ${results.length} TESTS PASSED`
    : `${failed.length}/${results.length} TESTS FAILED`,
);

if (failed.length > 0) {
  process.exit(1);
}
