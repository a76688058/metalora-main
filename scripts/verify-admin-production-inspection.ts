/**
 * Geometry and read-only contract for the admin production inspection viewer.
 * Synthetic sources only. Does not read production orders or storage.
 */
import { readFileSync } from 'node:fs';
import { effectiveSourceWindow, manufacturingResolution } from '../src/lib/customComposition/math.ts';
import type { CustomComposition, CustomSource } from '../src/lib/customComposition/types.ts';
import {
  fileTypeLabel,
  inspectionFacts,
  lowResolutionCopy,
  originalDownloadName,
  parsePixelHeader,
  purchasedCropFractions,
  resamplingNote,
  sharedRasterFrames,
} from '../src/components/admin/productionInspection.ts';

let failed = 0;

function assert(label: string, condition: boolean) {
  if (!condition) {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

function source(width: number, height: number): CustomSource {
  return { url: '', width, height };
}

function composition(
  orientation: CustomComposition['orientation'],
  zoom = 1,
  offsetX = 0,
  offsetY = 0,
): CustomComposition {
  return { version: 1, orientation, zoom, offsetX, offsetY };
}

const incident = inspectionFacts(source(1152, 363), composition('portrait'));
assert('incident crop is 257 by 363', incident.cropWidth === 257 && incident.cropHeight === 363);
assert('incident manufacturing matches the crop', incident.manufacturingWidth === 257 && incident.manufacturingHeight === 363);
assert('incident physical size stays M portrait', incident.widthMm === 200 && incident.heightMm === 283);
assert('incident PPI is about 32.6', Math.abs(incident.ppiX - 32.64) < 0.02 && Math.abs(incident.ppiY - 32.58) < 0.02);
assert('incident window uses the full source height', incident.window.y === 0 && incident.window.height === 363);
assert('incident window width is the unrounded portrait slice', Math.abs(incident.window.width - (200 * 363) / 283) < 1e-9);
assert('incident overlay matches the manufacturing window', (() => {
  const window = effectiveSourceWindow(source(1152, 363), composition('portrait'));
  return incident.overlay.left === window.x / 1152
    && incident.overlay.top === window.y / 363
    && incident.overlay.width === window.width / 1152
    && incident.overlay.height === window.height / 363;
})());
assert('incident resampling is the small horizontal rounding', incident.resampling.tone === 'info' && incident.resampling.text.includes('2.08') && incident.resampling.text.includes('낮은 인쇄 해상도의 원인이 아닙니다'));
assert('incident low PPI copy does not claim restored detail', lowResolutionCopy(incident.ppiX, incident.ppiY, 200, 283).includes('복원되지는 않습니다'));

const wide = source(2400, 800);
const landscape = inspectionFacts(wide, composition('landscape'));
const landscapeWindow = effectiveSourceWindow(wide, composition('landscape'));
assert('landscape overlay is the same window', purchasedCropFractions(wide, composition('landscape')).width === landscapeWindow.width / 2400);
assert('landscape output follows manufacturingResolution', landscape.cropWidth === manufacturingResolution(wide, composition('landscape')).width);

const tight = inspectionFacts(source(1152, 363), composition('portrait', 2, 0.05, 0));
const tightWindow = effectiveSourceWindow(source(1152, 363), composition('portrait', 2, 0.05, 0));
assert('tighter zoom uses the same window, not a new formula', tight.overlay.left === tightWindow.x / 1152 && tight.overlay.width === tightWindow.width / 1152);
assert('zoom 2 covers about one quarter of the zoom 1 area', Math.abs((tight.window.width * tight.window.height) / (incident.window.width * incident.window.height) - 0.25) < 0.02);

const square = inspectionFacts(source(900, 900), composition('portrait', 1, 0, -0.04));
const squareWindow = effectiveSourceWindow(source(900, 900), composition('portrait', 1, 0, -0.04));
assert('square source offset still uses effectiveSourceWindow', square.overlay.top === squareWindow.y / 900);

assert('pixel header parses the manufacturing response', parsePixelHeader('257x363')?.width === 257 && parsePixelHeader('257x363')?.height === 363);
assert('pixel header rejects prose', parsePixelHeader('257 × 363') === null);
assert('original download name uses the extension only', originalDownloadName('originals/redacted/redacted.png') === 'original-source.png');
assert('preview is identified as JPEG without using its path', fileTypeLabel('previews/redacted/redacted.jpg', 'preview') === 'JPEG');

const shared = sharedRasterFrames(source(1152, 363), composition('portrait'));
assert('fixture preview and manufacturing share one source window', shared.preview.sourceWindow.x === shared.manufacturing.sourceWindow.x
  && shared.preview.sourceWindow.y === shared.manufacturing.sourceWindow.y
  && shared.preview.sourceWindow.width === shared.manufacturing.sourceWindow.width
  && shared.preview.sourceWindow.height === shared.manufacturing.sourceWindow.height);
assert('shared window is the manufacturing window', shared.sourceWindow.width === incident.window.width && shared.sourceWindow.height === incident.window.height);
assert('derived manufacturing target is 257 by 363', shared.manufacturing.width === 257 && shared.manufacturing.height === 363);
assert('derived preview uses the portrait screen size', shared.preview.width === 1131 && shared.preview.height === 1600);
const shifted = sharedRasterFrames(source(1152, 363), composition('portrait', 2, 0.05, 0));
assert('non-default zoom still shares one window', shifted.preview.sourceWindow.width === shifted.manufacturing.sourceWindow.width
  && shifted.preview.sourceWindow.x === shifted.manufacturing.sourceWindow.x);

const root = new URL('..', import.meta.url);
const viewer = readFileSync(new URL('src/components/admin/ProductionInspectionViewer.tsx', root), 'utf8');
const admin = readFileSync(new URL('src/components/admin/AdminCustomProduction.tsx', root), 'utf8');
const orders = readFileSync(new URL('src/pages/AdminOrders.tsx', root), 'utf8');
const math = readFileSync(new URL('src/lib/customComposition/math.ts', root), 'utf8');
assert('viewer does not call the manufacturing route', !viewer.includes('manufacturing.png'));
assert('viewer does not import payment or order mutation clients', !viewer.includes('supabase') && !viewer.includes('PRODUCTION') && !viewer.includes('updateOrder'));
assert('viewer has no effect that requests a manufacturing file', !/useEffect\([\s\S]{0,500}onRequestManufacturing/.test(viewer));
assert('old resampling sentence is gone', !admin.includes('소스 비율이 한 픽셀 넘게 조정됩니다'));
assert('admin still shows stored dimensions and price', admin.includes('저장된 치수가 없습니다.') && admin.includes('개당 구매가') && admin.includes('원본 픽셀'));
assert('order list file is unchanged by this module', orders.includes('fetchAdminOrders') && !orders.includes('ProductionInspectionViewer'));
assert('manufacturing pixel formula is untouched', math.includes('Math.round(window.width)') && math.includes('Math.round(window.height)'));
assert('manufacturing download is the primary label', viewer.includes('제작 PNG 다운로드') && viewer.includes('원본 다운로드'));
assert('comparison is optional', viewer.includes('비교 보기') && viewer.includes('확정 구도와 제작'));
assert('manufacturing stays unloaded until asked', viewer.includes('제작 PNG 준비 및 보기') && !viewer.includes('제작 파일을 아직 불러오지 않았습니다'));
assert('comparison can prepare the same file', viewer.includes('제작 PNG 준비 및 비교') && viewer.includes('실제 제작 PNG'));
assert('loading and retry stay explicit', viewer.includes('제작 파일을 준비하고 있습니다.') && viewer.includes('다시 준비'));
assert('mode copy is one line each', viewer.includes('고객이 확정한 최종 구도') && viewer.includes('업로드 원본 · 구매 영역 표시') && viewer.includes('원본 픽셀 기반 제작 파일') && viewer.includes('확정 구도와 제작 파일 비교'));
assert('download buttons do not repeat the manufacturing description', !viewer.includes('구매한 부분의 원본 픽셀입니다'));
assert('one in-flight manufacturing request is reused', viewer.includes('if (manufacturingRequest.current) return manufacturingRequest.current'));
assert('a ready file is reused', viewer.includes('if (manufacturing?.ok === true) return manufacturing'));
assert('closing drops a late result', viewer.includes('if (!alive.current)'));
assert('viewer is keyed to the order item', admin.includes('key={`${orderId}:${itemIndex}`}'));
assert('crop overlay can be hidden', viewer.includes('크롭 숨기기') && viewer.includes('크롭 보기'));
assert('switching views does not reset inspector zoom', !viewer.includes('setAsset(next);\n    resetView'));
const previewMain = readFileSync(new URL('scripts/admin-inspection-preview/main.tsx', root), 'utf8');
assert('preview derives every asset from the shared frames', previewMain.includes('sharedRasterFrames') && previewMain.includes('drawImage') && !previewMain.includes('screen jpeg'));

if (failed > 0) {
  console.error(`admin production inspection failures: ${failed}`);
  process.exit(1);
}
console.log('ADMIN_PRODUCTION_INSPECTION=PASS');
