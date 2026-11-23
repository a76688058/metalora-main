/**
 * Isolated manufacturing fidelity checks.
 * Compares the server PNG with the existing browser canvas rasterizer.
 * Does not call production, create orders, or deploy.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCompleteV1Config } from '../src/lib/customComposition/durableHandoff';
import { compositionRasterFrame, effectiveSourceWindow, manufacturingPixelSize, previewPixelSize } from '../src/lib/customComposition/math';
import type { CustomComposition, CustomSource } from '../src/lib/customComposition/types';
import type { ManufacturingByteAccess } from '../src/lib/manufacturingBytes';
import { renderPurchasedManufacturing } from '../src/lib/manufacturingOrder';
import { renderManufacturingPng } from '../src/lib/manufacturingRaster';
import { isManufacturingArtifactKey, parseWorkshopRef } from '../src/lib/workshopStorage';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const evidenceDir = path.join(os.tmpdir(), 'metalora-mfg-evidence');
const GEOMETRIC_TOLERANCE_PX = 3.5;

type Mark = { name: string; x: number; y: number; w: number; h: number; rgb: [number, number, number] };
type CaseDef = {
  id: string;
  source: CustomSource;
  composition: CustomComposition;
  png: Buffer;
  marks: Mark[];
};

const results: { name: string; pass: boolean; detail: string }[] = [];

function assert(name: string, condition: boolean, detail = ''): void {
  results.push({ name, pass: condition, detail });
  console.log(`${condition ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`);
}

function memoryAccess(files: Map<string, Buffer>): ManufacturingByteAccess & { artifacts: Map<string, Buffer> } {
  const artifacts = new Map<string, Buffer>();
  return {
    persistent: true,
    artifacts,
    async readOriginal(ref) {
      return files.get(ref) ?? null;
    },
    async readArtifact(key) {
      return artifacts.get(key) ?? null;
    },
    async writeArtifact(key, bytes) {
      if (artifacts.has(key)) return 'exists';
      artifacts.set(key, Buffer.from(bytes));
      return 'written';
    },
  };
}

async function paint(width: number, height: number, marks: Mark[]): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const raw = Buffer.alloc(width * height * 3, 244);
  for (const mark of marks) {
    for (let y = mark.y; y < mark.y + mark.h; y += 1) {
      for (let x = mark.x; x < mark.x + mark.w; x += 1) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const index = (y * width + x) * 3;
        raw[index] = mark.rgb[0];
        raw[index + 1] = mark.rgb[1];
        raw[index + 2] = mark.rgb[2];
      }
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

function marksFor(width: number, height: number): Mark[] {
  const size = Math.max(12, Math.round(Math.min(width, height) * 0.08));
  return [
    { name: 'red', x: Math.round(width * 0.18), y: Math.round(height * 0.22), w: size, h: size, rgb: [255, 0, 0] },
    { name: 'green', x: Math.round(width * 0.62), y: Math.round(height * 0.28), w: size, h: size, rgb: [0, 255, 0] },
    { name: 'blue', x: Math.round(width * 0.4), y: Math.round(height * 0.68), w: size, h: size, rgb: [0, 0, 255] },
  ];
}

function orderItem(source: CustomSource, composition: CustomComposition, originalRef: string, previewRef: string) {
  return {
    product_id: 'workshop-single',
    orientation: composition.orientation,
    custom_config: {
      ...buildCompleteV1Config(source, composition),
      original_image_url: originalRef,
      preview_image_url: previewRef,
    },
  };
}

async function decode(bytes: Buffer): Promise<{ raw: Buffer; width: number; height: number }> {
  const sharp = (await import('sharp')).default;
  const image = sharp(bytes).ensureAlpha();
  const meta = await image.metadata();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return { raw: data, width: info.width, height: info.height ?? meta.height ?? 0 };
}

function centroid(
  raw: Buffer,
  width: number,
  height: number,
  match: (r: number, g: number, b: number) => boolean,
): { x: number; y: number; n: number } | null {
  let count = 0;
  let sx = 0;
  let sy = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (!match(raw[index], raw[index + 1], raw[index + 2])) continue;
      count += 1;
      sx += x;
      sy += y;
    }
  }
  if (count < 20) return null;
  return { x: sx / count, y: sy / count, n: count };
}

const MATCH: Record<string, (r: number, g: number, b: number) => boolean> = {
  red: (r, g, b) => r > 220 && g < 40 && b < 40,
  green: (r, g, b) => g > 220 && r < 40 && b < 40,
  blue: (r, g, b) => b > 220 && r < 40 && g < 40,
};

function predicted(source: CustomSource, composition: CustomComposition, mark: Mark) {
  const size = manufacturingPixelSize(source, composition);
  const frame = compositionRasterFrame(source, composition, size);
  const mapPoint = (sx: number, sy: number) => ({
    x: frame.drawX + (sx / source.width) * frame.drawWidth,
    y: frame.drawY + (sy / source.height) * frame.drawHeight,
  });
  const corners = [
    mapPoint(mark.x, mark.y),
    mapPoint(mark.x + mark.w, mark.y),
    mapPoint(mark.x, mark.y + mark.h),
    mapPoint(mark.x + mark.w, mark.y + mark.h),
  ];
  const center = mapPoint(mark.x + mark.w / 2, mark.y + mark.h / 2);
  const inside = corners.every((point) => point.x >= 1 && point.y >= 1 && point.x <= size.width - 2 && point.y <= size.height - 2);
  return { x: center.x, y: center.y, inside };
}

function findBrowser(): string | null {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

async function browserRasters(
  cases: CaseDef[],
): Promise<Map<string, Buffer> | null> {
  const browser = findBrowser();
  if (!browser) {
    assert('browser rasterizer available', false, 'Chrome/Edge not found');
    return null;
  }
  const esbuild = path.join(root, 'node_modules', 'esbuild', 'bin', 'esbuild');
  const bundleDir = path.join(evidenceDir, 'browser');
  fs.mkdirSync(bundleDir, { recursive: true });
  const outfile = path.join(bundleDir, 'raster.js');
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [
      esbuild,
      path.join(root, 'scripts', 'manufacturing-browser-raster.ts'),
      '--bundle',
      '--format=esm',
      `--outfile=${outfile}`,
    ], { cwd: root });
    let err = '';
    child.stderr.on('data', (chunk) => { err += String(chunk); });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(err || `esbuild ${code}`))));
  });

  const payload = cases.map((item) => ({
    id: item.id,
    sourceUrl: `/source/${item.id}.png`,
    width: item.source.width,
    height: item.source.height,
    composition: item.composition,
    target: manufacturingPixelSize(item.source, item.composition),
  }));
  const html = `<!doctype html><meta charset="utf-8"><body>working</body>
<script type="module">
async function report(body) {
  await fetch('/results', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}
try {
  const { rasterizeCustomComposition } = await import('./raster.js');
  const cases = await fetch('/cases.json').then((response) => response.json());
  const out = [];
  for (const item of cases) {
    const blob = await rasterizeCustomComposition(
      { url: item.sourceUrl, width: item.width, height: item.height },
      item.composition,
      { targetPx: item.target },
    );
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    const chunk = 0x8000;
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
    }
    out.push({ id: item.id, b64: btoa(binary) });
  }
  await report(out);
  document.body.textContent = 'DONE';
} catch (error) {
  await report({ error: error instanceof Error ? error.stack || error.message : String(error) });
  document.body.textContent = 'ERROR';
}
</script>`;

  const received = new Promise<Map<string, Buffer>>((resolve, reject) => {
    let finish: (error: Error | null, map?: Map<string, Buffer>) => void = (error) => {
      reject(error ?? new Error('browser result missing'));
    };
    const server = http.createServer((req, res) => {
      const url = req.url ?? '/';
      if (url === '/' || url === '/index.html') {
        res.setHeader('content-type', 'text/html; charset=utf-8');
        res.end(html);
        return;
      }
      if (url === '/raster.js') {
        res.setHeader('content-type', 'text/javascript');
        res.end(fs.readFileSync(outfile));
        return;
      }
      if (url === '/cases.json') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(payload));
        return;
      }
      if (url.startsWith('/source/')) {
        const id = decodeURIComponent(url.slice('/source/'.length).replace(/\.png$/, ''));
        const item = cases.find((candidate) => candidate.id === id);
        if (!item) {
          res.statusCode = 404;
          res.end();
          return;
        }
        const jpeg = item.png[0] === 0xff && item.png[1] === 0xd8;
        res.setHeader('content-type', jpeg ? 'image/jpeg' : 'image/png');
        res.end(item.png);
        return;
      }
      if (url === '/results' && req.method === 'POST') {
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as { id?: string; b64?: string; error?: string }[] | { error?: string };
            if (!Array.isArray(body)) {
              res.end('err');
              finish(new Error(body.error || 'browser raster failed'));
              return;
            }
            const map = new Map<string, Buffer>();
            for (const row of body) {
              if (row.id && row.b64) map.set(row.id, Buffer.from(row.b64, 'base64'));
            }
            res.end('ok');
            finish(null, map);
          } catch (error) {
            reject(error);
          }
        });
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      const profile = path.join(bundleDir, `profile-${Date.now()}`);
      let settled = false;
      finish = (error, map) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.kill();
        server.close();
        if (error) reject(error);
        else if (map) resolve(map);
      };
      const child = spawn(browser, [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--disable-extensions',
        '--remote-debugging-port=9335',
        `--user-data-dir=${profile}`,
        `http://127.0.0.1:${port}/`,
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      const timer = setTimeout(() => finish(new Error('browser timeout')), 90000);
      child.stderr.on('data', (chunk) => {
        fs.appendFileSync(path.join(evidenceDir, 'browser-stderr.txt'), String(chunk));
      });
      child.on('exit', () => {
        setTimeout(() => finish(new Error('browser exited before the canvas posted pixels')), 4000);
      });
    });
  });
  return received;
}

async function main(): Promise<void> {
  fs.mkdirSync(evidenceDir, { recursive: true });
  const portrait: CustomComposition = { version: 1, orientation: 'portrait', zoom: 1, offsetX: 0, offsetY: 0 };
  const portraitMoved: CustomComposition = { version: 1, orientation: 'portrait', zoom: 1.8, offsetX: 0.2, offsetY: -0.15 };
  const landscape: CustomComposition = { version: 1, orientation: 'landscape', zoom: 1.6, offsetX: -0.18, offsetY: 0.12 };
  const extreme: CustomComposition = { version: 1, orientation: 'portrait', zoom: 6, offsetX: 0.45, offsetY: -0.4 };

  const specs: { id: string; width: number; height: number; composition: CustomComposition }[] = [
    { id: 'A-portrait-center', width: 900, height: 1400, composition: portrait },
    { id: 'B-portrait-moved', width: 900, height: 1400, composition: portraitMoved },
    { id: 'C-landscape-moved', width: 1400, height: 900, composition: landscape },
    { id: 'D-same-original-alt', width: 900, height: 1400, composition: portraitMoved },
    { id: 'E-other-source', width: 1100, height: 1600, composition: portrait },
    { id: 'F-extreme', width: 900, height: 1400, composition: extreme },
    { id: 'G-high-res', width: 1800, height: 2600, composition: portraitMoved },
    { id: 'H-low-res', width: 70, height: 100, composition: portrait },
  ];

  const cases: CaseDef[] = [];
  for (const spec of specs) {
    const source: CustomSource = { url: '', width: spec.width, height: spec.height };
    const window = effectiveSourceWindow(source, spec.composition);
    const size = Math.max(8, Math.round(Math.min(window.width, window.height, spec.width, spec.height) * 0.12));
    const anchor: Mark = {
      name: 'red',
      x: Math.round(window.x + window.width / 2 - size / 2),
      y: Math.round(window.y + window.height / 2 - size / 2),
      w: size,
      h: size,
      rgb: [255, 0, 0],
    };
    const marks = [anchor, ...marksFor(spec.width, spec.height).filter((mark) => mark.name !== 'red')];
    cases.push({
      id: spec.id,
      source,
      composition: spec.composition,
      png: await paint(spec.width, spec.height, marks),
      marks,
    });
  }

  const files = new Map<string, Buffer>();
  for (const item of cases) {
    const ref = `original://${item.id}`;
    item.source = { ...item.source, url: ref };
    files.set(ref, item.png);
  }

  const sharp = (await import('sharp')).default;
  const orientedRaw = await paint(120, 48, [
    { name: 'red', x: 4, y: 8, w: 20, h: 20, rgb: [255, 0, 0] },
    { name: 'green', x: 90, y: 8, w: 20, h: 20, rgb: [0, 255, 0] },
  ]);
  const exifJpeg = await sharp(orientedRaw).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const exifMeta = await sharp(exifJpeg).metadata();
  const rotated = await sharp(exifJpeg).rotate().png().toBuffer({ resolveWithObject: true });
  assert(
    'I exif rotate changes the decoded size',
    exifMeta.orientation === 6 && rotated.info.width === 48 && rotated.info.height === 120,
    `tag=${exifMeta.orientation} raw=${exifMeta.width}x${exifMeta.height} oriented=${rotated.info.width}x${rotated.info.height}`,
  );
  const exifSource: CustomSource = { url: 'original://exif', width: rotated.info.width, height: rotated.info.height };
  const exifComposition: CustomComposition = { version: 1, orientation: 'portrait', zoom: 1, offsetX: 0, offsetY: 0 };
  files.set(exifSource.url, exifJpeg);
  const rotatedPng = await sharp(exifJpeg).rotate().png().toBuffer();
  const rotatedPixels = await decode(rotatedPng);
  const exifRed = centroid(rotatedPixels.raw, rotatedPixels.width, rotatedPixels.height, MATCH.red);
  const exifGreen = centroid(rotatedPixels.raw, rotatedPixels.width, rotatedPixels.height, MATCH.green);
  if (exifRed && exifGreen) {
    cases.push({
      id: 'I-exif',
      source: exifSource,
      composition: exifComposition,
      png: exifJpeg,
      marks: [
        { name: 'red', x: Math.round(exifRed.x), y: Math.round(exifRed.y), w: 1, h: 1, rgb: [255, 0, 0] },
        { name: 'green', x: Math.round(exifGreen.x), y: Math.round(exifGreen.y), w: 1, h: 1, rgb: [0, 255, 0] },
      ],
    });
  } else {
    assert('I oriented markers are readable', false, 'centroid missing');
  }

  const preview = previewPixelSize('portrait', 1600);
  const native = manufacturingPixelSize(cases[0].source, cases[0].composition);
  assert(
    'manufacturing size is the source crop, not the 1600 preview',
    native.width !== preview.width && native.height !== preview.height && native.width < 1600,
    `native=${native.width}x${native.height} preview=${preview.width}x${preview.height}`,
  );

  const low = manufacturingPixelSize(cases.find((item) => item.id === 'H-low-res')!.source, portrait);
  const lowInches = 200 / 25.4;
  const lowPpi = low.width / lowInches;
  assert(
    'H low-resolution output is not upscaled toward 300 PPI',
    low.width < 200 && lowPpi < 300,
    `output=${low.width}x${low.height} ppi=${lowPpi.toFixed(1)}`,
  );

  const artifactKey = `manufacturing/${'ab'.repeat(32)}.png`;
  assert('manufacturing key is not a client sign-read path', parseWorkshopRef(artifactKey) == null && isManufacturingArtifactKey(artifactKey));

  const access = memoryAccess(files);
  const reads: string[] = [];
  const counting: ManufacturingByteAccess = {
    persistent: true,
    readOriginal: async (ref) => {
      reads.push(ref);
      return access.readOriginal(ref);
    },
    readArtifact: (key) => access.readArtifact(key),
    writeArtifact: (key, bytes) => access.writeArtifact(key, bytes),
  };

  const denied = await renderPurchasedManufacturing({
    actor: { ok: false, status: 403, reason_class: 'actor_not_admin' },
    order: { id: '00000000-0000-4000-8000-000000000001', ordered_items: [] },
    itemIndex: 0,
    access: counting,
    onOriginalRead: () => reads.push('called'),
  });
  assert('unauthorized caller does not read an original', !denied.ok && denied.status === 403 && reads.length === 0, JSON.stringify(denied));

  const measurements: unknown[] = [];
  let browser: Map<string, Buffer> | null = null;
  try {
    browser = await browserRasters(cases);
    assert('browser canvas rasterizer ran', browser != null && browser.size === cases.length, `count=${browser?.size ?? 0}`);
  } catch (error) {
    assert('browser canvas rasterizer ran', false, error instanceof Error ? error.message : String(error));
  }

  for (const item of cases) {
    const previewRef = `preview://${item.id}`;
    const order = {
      id: `00000000-0000-4000-8000-${item.id.length.toString(16).padStart(12, '0')}`.slice(0, 36),
      ordered_items: [orderItem(item.source, item.composition, item.source.url, previewRef)],
    };
    const first = await renderPurchasedManufacturing({
      actor: { ok: true, actorUserId: 'admin' },
      order,
      itemIndex: 0,
      access: counting,
    });
    assert(`${item.id} manufacturing png`, 'png' in first, 'png' in first ? `${first.width}x${first.height}` : first.error);
    if (!('png' in first)) continue;
    fs.writeFileSync(path.join(evidenceDir, `${item.id}-manufacturing.png`), first.png);
    fs.writeFileSync(path.join(evidenceDir, `${item.id}-source.png`), item.png);
    const manufactured = await decode(first.png);
    const browserBytes = browser?.get(item.id);
    if (browserBytes) fs.writeFileSync(path.join(evidenceDir, `${item.id}-canvas.jpg`), browserBytes);
    const canvas = browserBytes ? await decode(browserBytes) : null;
    const row: Record<string, unknown> = {
      id: item.id,
      output: `${first.width}x${first.height}`,
      mm: `${first.widthMm}x${first.heightMm}`,
      ppi: `${first.ppiX.toFixed(1)}x${first.ppiY.toFixed(1)}`,
      belowReference: first.belowReference,
      resampled: first.resampled,
      stored: first.stored,
      marks: [] as unknown[],
    };
    let aligned = true;
    let sawInterior = false;
    for (const mark of item.marks) {
      const expect = predicted(item.source, item.composition, mark);
      const made = centroid(manufactured.raw, manufactured.width, manufactured.height, MATCH[mark.name]);
      const seen = canvas ? centroid(canvas.raw, canvas.width, canvas.height, MATCH[mark.name]) : null;
      const madeDelta = made ? Math.hypot(made.x - expect.x, made.y - expect.y) : null;
      const pairDelta = made && seen ? Math.hypot(made.x - seen.x, made.y - seen.y) : null;
      const visible = expect.inside;
      if (visible) {
        sawInterior = true;
        if (madeDelta == null || madeDelta > GEOMETRIC_TOLERANCE_PX) aligned = false;
        if (browser && (pairDelta == null || pairDelta > GEOMETRIC_TOLERANCE_PX)) aligned = false;
      }
      (row.marks as unknown[]).push({
        name: mark.name,
        predicted: [Number(expect.x.toFixed(2)), Number(expect.y.toFixed(2))],
        manufacturing: made ? [Number(made.x.toFixed(2)), Number(made.y.toFixed(2))] : null,
        canvas: seen ? [Number(seen.x.toFixed(2)), Number(seen.y.toFixed(2))] : null,
        manufacturingErrorPx: madeDelta == null ? null : Number(madeDelta.toFixed(3)),
        canvasDeltaPx: pairDelta == null ? null : Number(pairDelta.toFixed(3)),
        visible,
      });
    }
    if (!sawInterior && item.id !== 'I-exif') aligned = false;
    measurements.push(row);
    assert(`${item.id} marker alignment`, aligned, JSON.stringify(row.marks));
    if (item.id === 'H-low-res') {
      assert('H warning is explicit and output stays small', first.belowReference && first.width < 200, `${first.width}px ${first.ppiX.toFixed(1)}ppi`);
    }
    if (item.id === 'G-high-res') {
      const crop = manufacturingPixelSize(item.source, item.composition);
      const screen = previewPixelSize('portrait', 1600);
      assert(
        'G uses the source crop rather than the 1600 preview',
        first.width === crop.width && first.height === crop.height && (first.width !== screen.width || first.height !== screen.height),
        `${first.width}x${first.height} crop=${crop.width}x${crop.height}`,
      );
    }
  }

  const shared = cases.find((item) => item.id === 'A-portrait-center')!;
  const sharedAlt = cases.find((item) => item.id === 'D-same-original-alt')!;
  const other = cases.find((item) => item.id === 'E-other-source')!;
  const multiOrder = {
    id: '00000000-0000-4000-8000-0000000000aa',
    ordered_items: [
      orderItem(shared.source, shared.composition, shared.source.url, 'preview://a'),
      orderItem(shared.source, sharedAlt.composition, shared.source.url, 'preview://d'),
      orderItem(other.source, other.composition, other.source.url, 'preview://e'),
    ],
  };
  const lineA = await renderPurchasedManufacturing({ actor: { ok: true, actorUserId: 'admin' }, order: multiOrder, itemIndex: 0, access: counting });
  const lineD = await renderPurchasedManufacturing({ actor: { ok: true, actorUserId: 'admin' }, order: multiOrder, itemIndex: 1, access: counting });
  const lineE = await renderPurchasedManufacturing({ actor: { ok: true, actorUserId: 'admin' }, order: multiOrder, itemIndex: 2, access: counting });
  assert(
    'D and E stay distinct from A',
    lineA.ok && lineD.ok && lineE.ok
      && lineA.fingerprint !== lineD.fingerprint
      && lineA.fingerprint !== lineE.fingerprint
      && !lineA.png.equals(lineD.png)
      && !lineA.png.equals(lineE.png),
  );
  const readsBeforeRetry = reads.length;
  const again = await renderPurchasedManufacturing({ actor: { ok: true, actorUserId: 'admin' }, order: multiOrder, itemIndex: 0, access: counting });
  assert(
    'retry of the same line is idempotent',
    again.ok && lineA.ok && again.stored === 'hit' && again.png.equals(lineA.png) && again.fingerprint === lineA.fingerprint && reads.length === readsBeforeRetry,
  );

  const currentUi = { ...shared.composition, zoom: 3, offsetX: -0.4 };
  const frozen = orderItem(shared.source, shared.composition, shared.source.url, 'preview://frozen');
  const drifted = orderItem(shared.source, currentUi, shared.source.url, 'preview://drift');
  const fromFrozen = await renderPurchasedManufacturing({
    actor: { ok: true, actorUserId: 'admin' },
    order: { id: '00000000-0000-4000-8000-0000000000bb', ordered_items: [frozen] },
    itemIndex: 0,
    access: counting,
  });
  const fromDrift = await renderPurchasedManufacturing({
    actor: { ok: true, actorUserId: 'admin' },
    order: { id: '00000000-0000-4000-8000-0000000000bb', ordered_items: [drifted] },
    itemIndex: 0,
    access: counting,
  });
  assert(
    'output follows the purchased snapshot, not a later UI composition',
    fromFrozen.ok && fromDrift.ok && fromFrozen.fingerprint !== fromDrift.fingerprint,
  );

  const missing = await renderPurchasedManufacturing({
    actor: { ok: true, actorUserId: 'admin' },
    order: {
      id: '00000000-0000-4000-8000-0000000000cc',
      ordered_items: [orderItem(shared.source, shared.composition, 'original://missing', 'preview://missing')],
    },
    itemIndex: 0,
    access: counting,
  });
  assert('J missing original is visible', !missing.ok && missing.status === 404 && missing.error === 'source_missing');

  files.set('original://bad', Buffer.from('this is not an image'));
  const broken = await renderPurchasedManufacturing({
    actor: { ok: true, actorUserId: 'admin' },
    order: {
      id: '00000000-0000-4000-8000-0000000000dd',
      ordered_items: [orderItem(shared.source, shared.composition, 'original://bad', 'preview://bad')],
    },
    itemIndex: 0,
    access: counting,
  });
  assert('J decode failure is visible', !('png' in broken) && broken.status === 422 && broken.error === 'decode_failed', 'png' in broken ? '' : broken.error);

  const mismatchSource = { ...shared.source, url: 'original://exif', width: 120, height: 48 };
  const mismatch = await renderPurchasedManufacturing({
    actor: { ok: true, actorUserId: 'admin' },
    order: {
      id: '00000000-0000-4000-8000-0000000000ee',
      ordered_items: [orderItem(mismatchSource, exifComposition, mismatchSource.url, 'preview://exif-bad')],
    },
    itemIndex: 0,
    access: counting,
  });
  assert(
    'I stored size must match oriented pixels',
    !('png' in mismatch) && mismatch.status === 422 && mismatch.error === 'source_dimension_mismatch',
    'png' in mismatch ? '' : mismatch.error,
  );
  const oriented = await renderManufacturingPng(exifJpeg, exifSource, exifComposition);
  assert(
    'I oriented jpeg renders at the rotated size',
    oriented.width > 0 && oriented.height > oriented.width,
    `${oriented.width}x${oriented.height}`,
  );
  fs.writeFileSync(path.join(evidenceDir, 'I-oriented-manufacturing.png'), oriented.png);

  const conflictAccess = memoryAccess(files);
  const conflictOrder = {
    id: '00000000-0000-4000-8000-0000000000ff',
    ordered_items: [orderItem(shared.source, shared.composition, shared.source.url, 'preview://conflict')],
  };
  const seeded = await renderPurchasedManufacturing({
    actor: { ok: true, actorUserId: 'admin' },
    order: conflictOrder,
    itemIndex: 0,
    access: conflictAccess,
  });
  if (seeded.ok) {
    const key = [...conflictAccess.artifacts.keys()][0];
    conflictAccess.artifacts.set(key, Buffer.from('not-the-png'));
    const conflict = await renderPurchasedManufacturing({
      actor: { ok: true, actorUserId: 'admin' },
      order: conflictOrder,
      itemIndex: 0,
      access: conflictAccess,
    });
    assert('stored artifact mismatch is not overwritten', !conflict.ok && conflict.status === 409 && conflict.error === 'manufacturing_conflict');
  } else {
    assert('stored artifact mismatch is not overwritten', false, 'seed failed');
  }

  const alpha = await sharp({
    create: { width: 80, height: 120, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  }).png().toBuffer();
  const alphaRendered = await renderManufacturingPng(alpha, { url: '', width: 80, height: 120 }, portrait);
  const alphaRaw = await decode(alphaRendered.png);
  const corner = alphaRaw.raw.subarray(0, 3);
  assert(
    'transparent pixels flatten onto the preview margin',
    corner[0] === 244 && corner[1] === 244 && corner[2] === 245,
    `${corner[0]},${corner[1]},${corner[2]}`,
  );

  fs.writeFileSync(path.join(evidenceDir, 'measurements.json'), JSON.stringify({
    tolerancePx: GEOMETRIC_TOLERANCE_PX,
    note: 'Centroid error separates placement from JPEG/Lanczos interpolation. Byte identity is not required.',
    measurements,
    evidenceSha256: createHash('sha256').update(JSON.stringify(measurements)).digest('hex'),
  }, null, 2));

  const failed = results.filter((item) => !item.pass);
  console.log(`EVIDENCE ${evidenceDir}`);
  console.log(`RESULT ${results.length - failed.length}/${results.length}`);
  if (failed.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
