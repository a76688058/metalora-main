import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const ORDER_ID = '11111111-1111-4111-8111-111111111111';
const CANCEL_PATH = `/api/admin/orders/${ORDER_ID}/cancel`;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const contractDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/components/admin');

type Probe = {
  brokenName: string;
  brokenMessage: string;
  kind: string;
  already: boolean | null;
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const built = await esbuild.build({
  stdin: {
    contents: 'export { postFullRefund } from "./adminRefundContract.ts";',
    resolveDir: contractDir,
    sourcefile: 'refund-fetch-receiver-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  write: false,
  plugins: [{
    name: 'stub-supabase',
    setup(build) {
      build.onResolve({ filter: /supabase\.ts$/ }, () => ({
        path: 'supabase-stub',
        namespace: 'stub',
      }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: 'export const supabase = { auth: { getSession: async () => ({ data: { session: null } }) } }; export const supabasePublic = supabase;',
        loader: 'js',
      }));
    },
  }],
});

const bundle = built.outputFiles?.[0]?.text ?? '';
if (!bundle.includes('.call(globalThis')) throw new Error('BUNDLE_MISSING_RECEIVER');
if (bundle.includes('fetchImpl(`/api/admin/orders/')) throw new Error('BUNDLE_STILL_USES_METHOD_CALL');

const page = `<!doctype html>
<meta charset="utf-8">
<script type="module">
  import { postFullRefund } from "/bundle.js";
  const nativeFetch = window.fetch;
  const brokenInput = { fetchImpl: nativeFetch };
  let brokenName = "";
  let brokenMessage = "";
  try {
    await brokenInput.fetchImpl("/non-financial", { method: "POST" });
    brokenName = "NO_THROW";
  } catch (error) {
    brokenName = error && error.name ? String(error.name) : "";
    brokenMessage = error && error.message ? String(error.message).slice(0, 180) : "";
  }
  const result = await postFullRefund({
    orderId: ${JSON.stringify(ORDER_ID)},
    cancelReason: "로컬 수신자 확인",
    token: "local-receiver-test",
    fetchImpl: nativeFetch,
  });
  window.__refundFetchReceiver = {
    brokenName,
    brokenMessage,
    kind: result.kind,
    already: result.kind === "confirmed" ? result.alreadyComplete : null,
  };
</script>`;

const hits: string[] = [];
let requestOk = false;
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    res.end(page);
    return;
  }
  if (req.method === 'GET' && pathname === '/bundle.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' });
    res.end(bundle);
    return;
  }
  if (req.method === 'POST') {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      hits.push(`${req.method} ${pathname}`);
      if (pathname === CANCEL_PATH) {
        let reason = '';
        try {
          reason = String(JSON.parse(Buffer.concat(chunks).toString('utf8')).cancelReason ?? '');
        } catch {
          reason = '';
        }
        const authorization = String(req.headers.authorization ?? '');
        requestOk = authorization.startsWith('Bearer ')
          && authorization.length > 'Bearer '.length
          && reason === '로컬 수신자 확인';
      }
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ ok: true, alreadyComplete: false }));
    });
    return;
  }
  res.writeHead(404, { 'cache-control': 'no-store' });
  res.end();
});

const port = await new Promise<number>((resolve) => {
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    resolve(typeof address === 'object' && address ? address.port : 0);
  });
});

const profile = await mkdtemp(path.join(tmpdir(), 'metalora-refund-fetch-'));
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--disable-extensions',
  '--no-first-run',
  '--no-default-browser-check',
  '--remote-allow-origins=*',
  `--user-data-dir=${profile}`,
  '--remote-debugging-port=9341',
  'about:blank',
], { stdio: 'ignore' });

let socket: WebSocket | undefined;
let failed = false;

function fail(label: string): void {
  failed = true;
  console.error(`FAIL ${label}`);
}

try {
  let browserPage: { webSocketDebuggerUrl?: string } | undefined;
  for (let attempt = 0; attempt < 30 && !browserPage?.webSocketDebuggerUrl; attempt += 1) {
    await delay(250);
    try {
      const list = await fetch('http://127.0.0.1:9341/json/list').then((response) => response.json()) as Array<{ type?: string; webSocketDebuggerUrl?: string }>;
      browserPage = list.find((item) => item.type === 'page');
    } catch {
      browserPage = undefined;
    }
  }
  if (!browserPage?.webSocketDebuggerUrl) throw new Error('NO_PAGE');

  socket = new WebSocket(browserPage.webSocketDebuggerUrl);
  let messageId = 0;
  const pending = new Map<number, (message: { result?: { result?: { value?: Probe }; exceptionDetails?: { text?: string } } }) => void>();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: Probe }; exceptionDetails?: { text?: string } } };
    const resolve = message.id === undefined ? undefined : pending.get(message.id);
    if (resolve) {
      pending.delete(message.id);
      resolve(message);
    }
  });
  const send = (method: string, params: object) => new Promise<{ result?: { result?: { value?: Probe }; exceptionDetails?: { text?: string } } }>((resolve, reject) => {
    const next = ++messageId;
    const timer = setTimeout(() => reject(new Error(`TIMEOUT_${method}`)), 20000);
    pending.set(next, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    socket?.send(JSON.stringify({ id: next, method, params }));
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WS_TIMEOUT')), 10000);
    socket?.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    });
    socket?.addEventListener('error', () => reject(new Error('WS_ERROR')));
  });
  await send('Page.enable', {});
  await send('Page.navigate', { url: `http://127.0.0.1:${port}/` });

  let probe: Probe | undefined;
  for (let attempt = 0; attempt < 40 && !probe; attempt += 1) {
    await delay(250);
    const evaluated = await send('Runtime.evaluate', {
      expression: 'window.__refundFetchReceiver || null',
      returnByValue: true,
    });
    probe = evaluated.result?.result?.value ?? undefined;
  }
  if (!probe) throw new Error('NO_PROBE');

  const illegal = probe.brokenName === 'TypeError' && probe.brokenMessage.includes('Illegal invocation');
  console.log(`ILLEGAL_INVOCATION=${illegal ? 'PASS' : 'FAIL'}`);
  if (!illegal) fail(`old invocation ${probe.brokenName}`);

  const corrected = probe.kind === 'confirmed' && probe.already === false && requestOk && hits.length === 1 && hits[0] === `POST ${CANCEL_PATH}`;
  console.log(`CORRECTED_FETCH=${corrected ? 'PASS' : 'FAIL'}`);
  console.log(`CHROME_HTTP=${corrected ? '200' : 'NONE'}`);
  if (!corrected) fail(`corrected kind=${probe.kind} hits=${hits.length} requestOk=${requestOk}`);
} catch (error) {
  fail(error instanceof Error ? error.message : 'runner');
} finally {
  socket?.close();
  chrome.kill();
  server.close();
  await delay(300);
  await rm(profile, { recursive: true, force: true }).catch(() => undefined);
}

if (failed) {
  console.error('ADMIN_REFUND_FETCH_RECEIVER=FAIL');
  process.exit(1);
}
console.log('ADMIN_REFUND_FETCH_RECEIVER=PASS');
