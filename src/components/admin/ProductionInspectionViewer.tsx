import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AdminOrderItem } from './adminOrders';
import { readPurchasedComposition } from '../../lib/customComposition/productionSnapshot';
import { readStoredSourcePixels } from './adminOrderMapping';
import {
  concisePrintWarning,
  fileTypeLabel,
  formatInspectorZoom,
  formatPurchasedOffset,
  inspectionFacts,
  originalDownloadName,
  type InspectionImageSlot,
  type ManufacturingFileResult,
} from './productionInspection';

type AssetId = 'preview' | 'original' | 'manufacturing';
type CompareChoice = 'preview-mfg' | 'original-mfg' | 'three';
type ViewMode = 'fit' | 'actual';
type DecodedSize = { width: number; height: number };

const MODES: { id: AssetId; label: string }[] = [
  { id: 'preview', label: '확정 구도' },
  { id: 'original', label: '원본' },
  { id: 'manufacturing', label: '제작 파일' },
];

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ProductionInspectionViewer({
  item,
  orderNumber,
  itemIndex,
  preview,
  original,
  onPreviewError,
  onOriginalError,
  onRequestManufacturing,
  onClose,
}: {
  item: AdminOrderItem;
  orderNumber: string;
  itemIndex: number;
  preview: InspectionImageSlot;
  original: InspectionImageSlot;
  onPreviewError?: () => void;
  onOriginalError?: () => void;
  onRequestManufacturing: () => Promise<ManufacturingFileResult>;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const manufacturingRequest = useRef<Promise<ManufacturingFileResult> | null>(null);
  const alive = useRef(true);
  const [asset, setAsset] = useState<AssetId>('preview');
  const [compare, setCompare] = useState(false);
  const [compareChoice, setCompareChoice] = useState<CompareChoice>('preview-mfg');
  const [showCrop, setShowCrop] = useState(true);
  const [mode, setMode] = useState<ViewMode>('fit');
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [decoded, setDecoded] = useState<{ original?: DecodedSize; preview?: DecodedSize }>({});
  const [manufacturing, setManufacturing] = useState<ManufacturingFileResult | null>(null);
  const [manufacturingState, setManufacturingState] = useState<'idle' | 'loading'>('idle');
  const [downloadNote, setDownloadNote] = useState<string | null>(null);

  const composition = readPurchasedComposition(item.customConfig, item.orientation);
  const ready = composition.status === 'ready';
  const storedPixels = readStoredSourcePixels(item.customConfig);
  const sourceMatchesDecode =
    storedPixels != null &&
    decoded.original != null &&
    storedPixels.width === decoded.original.width &&
    storedPixels.height === decoded.original.height;
  const purchased = ready
    ? {
        version: 1 as const,
        orientation: composition.orientation,
        zoom: composition.zoom,
        offsetX: composition.offsetX,
        offsetY: composition.offsetY,
      }
    : null;
  const facts = storedPixels && purchased
    ? inspectionFacts({ url: '', width: storedPixels.width, height: storedPixels.height }, purchased)
    : null;
  const overlay = facts && showCrop && (decoded.original == null || sourceMatchesDecode) ? facts.overlay : null;
  const activeSize = asset === 'preview'
    ? decoded.preview ?? null
    : asset === 'original'
      ? decoded.original ?? storedPixels
      : asset === 'manufacturing' && manufacturing?.ok === true
        ? { width: manufacturing.width, height: manufacturing.height }
        : null;
  const orientationLabel = facts?.orientation === 'landscape' ? '가로' : '세로';

  useEffect(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown, true);
      returnFocus.current?.focus();
    };
  }, [onClose]);

  useEffect(() => () => {
    alive.current = false;
  }, []);

  useEffect(() => () => {
    if (manufacturing?.ok === true && manufacturing.src.startsWith('blob:')) URL.revokeObjectURL(manufacturing.src);
  }, [manufacturing]);

  function resetView(nextMode: ViewMode) {
    setMode(nextMode);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function changeZoom(factor: number) {
    setZoom((current) => Math.min(8, Math.max(0.5, Math.round(current * factor * 100) / 100)));
  }

  function selectAsset(next: AssetId) {
    setCompare(false);
    setAsset(next);
  }

  async function ensureManufacturing(): Promise<ManufacturingFileResult> {
    if (manufacturing?.ok === true) return manufacturing;
    if (manufacturingRequest.current) return manufacturingRequest.current;
    setManufacturingState('loading');
    setDownloadNote(null);
    const request = onRequestManufacturing();
    manufacturingRequest.current = request;
    try {
      const result = await request;
      if (!alive.current) {
        if (result.ok === true && result.src.startsWith('blob:')) URL.revokeObjectURL(result.src);
        return result;
      }
      setManufacturing((current) => {
        if (current?.ok === true && current.src.startsWith('blob:') && current.src !== (result.ok ? result.src : '')) {
          URL.revokeObjectURL(current.src);
        }
        return result;
      });
      return result;
    } finally {
      manufacturingRequest.current = null;
      if (alive.current) setManufacturingState('idle');
    }
  }

  async function downloadOriginal() {
    setDownloadNote(null);
    if (!original.src) {
      setDownloadNote('원본 소스가 없습니다.');
      return;
    }
    try {
      const response = await fetch(original.src, { referrerPolicy: 'no-referrer' });
      if (!response.ok) {
        setDownloadNote('원본 주소가 만료되었거나 원본을 받지 못했습니다. 주문 상세에서 이미지를 다시 연 뒤 시도하세요.');
        return;
      }
      saveBlob(await response.blob(), originalDownloadName(item.originalRef));
      setDownloadNote('원본을 저장했습니다.');
    } catch {
      setDownloadNote('원본을 받지 못했습니다. 주문 상세에서 이미지를 다시 연 뒤 시도하세요.');
    }
  }

  async function downloadManufacturing() {
    setDownloadNote(null);
    const result = await ensureManufacturing();
    if (result.ok === false) return;
    const response = await fetch(result.src);
    saveBlob(await response.blob(), `manufacturing-${itemIndex}.png`);
    setDownloadNote('제작 PNG를 저장했습니다.');
  }

  const contextLine = asset === 'preview'
    ? '고객이 확정한 최종 구도'
    : asset === 'original'
      ? showCrop ? '업로드 원본 · 구매 영역 표시' : '업로드 원본'
      : '원본 픽셀 기반 제작 파일';
  const manufacturingFailure = manufacturing?.ok === false ? manufacturing.message : null;
  const showContext = asset !== 'manufacturing' || manufacturing?.ok === true;

  return createPortal(
    <div className="fixed inset-0 flex flex-col bg-zinc-950 text-white" style={{ zIndex: 'var(--z-critical-loading)' }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="flex min-h-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-col gap-2 px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold">제작 확인</h2>
              <p className="truncate text-sm text-zinc-400">커스텀 M · {orientationLabel} · {orderNumber || '주문 번호 없음'}</p>
            </div>
            <button ref={closeRef} type="button" className="focus-ring min-h-11 shrink-0 rounded-md px-3 text-sm text-zinc-300" onClick={onClose}>
              닫기
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <div className="flex flex-wrap" role="tablist" aria-label="보는 파일">
            {MODES.map((entry) => {
              const selected = !compare && asset === entry.id;
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  className={`focus-ring min-h-11 whitespace-nowrap rounded-md px-2 text-sm sm:px-3 ${selected ? 'text-white' : 'text-zinc-500'}`}
                  onClick={() => selectAsset(entry.id)}
                >
                  <span className={selected ? 'border-b border-white pb-0.5' : ''}>{entry.label}</span>
                </button>
              );
            })}
            </div>
            <button
              type="button"
              className={`focus-ring min-h-11 whitespace-nowrap rounded-md px-2 text-sm ${compare ? 'text-white' : 'text-zinc-400'}`}
              aria-pressed={compare}
              onClick={() => setCompare((open) => !open)}
            >
              비교 보기
            </button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-[58svh] min-w-0 flex-1 flex-col lg:min-h-0">
            {compare ? (
              <CompareWorkspace
                choice={compareChoice}
                onChoice={setCompareChoice}
                preview={preview}
                original={original}
                overlay={overlay}
                originalFrame={decoded.original ?? storedPixels}
                previewFrame={decoded.preview}
                manufacturing={manufacturing}
                loading={manufacturingState === 'loading'}
                failure={manufacturingFailure}
                onLoad={() => void ensureManufacturing()}
                onPreviewError={onPreviewError}
                onOriginalError={onOriginalError}
                onDecode={(kind, size) => setDecoded((current) => ({ ...current, [kind]: size }))}
              />
            ) : asset === 'manufacturing' && manufacturing?.ok !== true ? (
              <ManufacturingEmpty
                variant="workspace"
                loading={manufacturingState === 'loading'}
                message={manufacturingFailure}
                onLoad={() => void ensureManufacturing()}
              />
            ) : (
              <ZoomStage
                mode={mode}
                zoom={zoom}
                pan={pan}
                contentSize={activeSize}
                onPan={setPan}
                onZoom={changeZoom}
                onFit={() => resetView('fit')}
                onActual={() => resetView('actual')}
              >
                {asset === 'preview' ? (
                  <FittedImage slot={preview} alt="고객이 확정한 구도" fill onError={onPreviewError} onDecode={(size) => setDecoded((current) => ({ ...current, preview: size }))} />
                ) : null}
                {asset === 'original' ? (
                  <FittedImage slot={original} alt="원본 소스와 구매 크롭" fill overlay={overlay} onError={onOriginalError} onDecode={(size) => setDecoded((current) => ({ ...current, original: size }))} />
                ) : null}
                {asset === 'manufacturing' && manufacturing?.ok === true ? (
                  <img src={manufacturing.src} alt="제작 PNG" className="h-full w-full object-contain" referrerPolicy="no-referrer" />
                ) : null}
              </ZoomStage>
            )}
            {!compare && showContext ? (
              <div className="flex shrink-0 flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="min-w-0 text-sm text-zinc-400">{contextLine}</p>
                <InspectionToolbar
                  mode={mode}
                  zoom={zoom}
                  showCropToggle={asset === 'original'}
                  showCrop={showCrop}
                  onFit={() => resetView('fit')}
                  onActual={() => resetView('actual')}
                  onZoom={changeZoom}
                  onReset={() => resetView('fit')}
                  onToggleCrop={() => setShowCrop((value) => !value)}
                />
              </div>
            ) : null}
          </div>

          <aside className="max-h-[42svh] shrink-0 overflow-y-auto px-4 py-4 sm:px-6 lg:max-h-none lg:w-80 lg:border-l lg:border-white/10" aria-label="제작 정보">
            {facts ? (
              <>
                <p className="text-sm text-zinc-400">커스텀 M · {orientationLabel}</p>
                <p className="mt-1 text-2xl font-semibold tracking-tight">{facts.widthMm} × {facts.heightMm} mm</p>
                <p className="mt-6 text-sm text-zinc-400">제작 파일</p>
                <p className="mt-1 text-lg">{facts.manufacturingWidth} × {facts.manufacturingHeight} px</p>
                <p className="mt-3 text-sm">약 {Math.min(facts.ppiX, facts.ppiY).toFixed(1)} PPI</p>
                {facts.belowReference ? <p className="mt-3 text-sm font-medium text-amber-200">{concisePrintWarning(facts.ppiX, facts.ppiY)}</p> : null}
              </>
            ) : (
              <p className="text-sm text-amber-200">저장된 구매 구도 또는 원본 픽셀이 없습니다.</p>
            )}
            <button
              type="button"
              className="focus-ring mt-6 min-h-11 w-full rounded-lg bg-white px-3 text-sm font-medium text-black disabled:opacity-40"
              disabled={manufacturingState === 'loading' || !item.originalRef}
              onClick={() => void downloadManufacturing()}
            >
              {manufacturingState === 'loading' ? '제작 파일을 준비하고 있습니다.' : '제작 PNG 다운로드'}
            </button>
            <button
              type="button"
              className="focus-ring mt-4 min-h-11 w-full rounded-lg px-3 text-sm text-zinc-200 disabled:opacity-40"
              disabled={!original.src}
              onClick={() => void downloadOriginal()}
            >
              원본 다운로드
            </button>
            {downloadNote ? <p className="mt-3 text-sm text-zinc-300">{downloadNote}</p> : null}
            {manufacturingFailure && compare === false && asset !== 'manufacturing' ? <p className="mt-3 text-sm text-amber-200">{manufacturingFailure}</p> : null}
            {decoded.original && storedPixels && !sourceMatchesDecode ? (
              <p className="mt-3 text-sm text-amber-200">디코딩된 원본이 저장된 픽셀과 달라 크롭을 그리지 않았습니다.</p>
            ) : null}
            {manufacturing?.ok === true && facts && (manufacturing.width !== facts.manufacturingWidth || manufacturing.height !== facts.manufacturingHeight) ? (
              <p className="mt-3 text-sm text-amber-200">받은 파일은 {manufacturing.width} × {manufacturing.height} px로, 계산과 다릅니다.</p>
            ) : null}
            {facts ? (
              <details className="mt-6">
                <summary className="focus-ring cursor-pointer text-sm text-zinc-300">제작 상세 정보</summary>
                <dl className="mt-3 grid grid-cols-[6.5rem_1fr] gap-y-2 text-sm">
                  <dt className="text-zinc-500">원본</dt>
                  <dd>{facts.originalWidth} × {facts.originalHeight} px · {fileTypeLabel(item.originalRef, 'original')}</dd>
                  <dt className="text-zinc-500">미리보기</dt>
                  <dd>{decoded.preview ? `${decoded.preview.width} × ${decoded.preview.height} px · JPEG` : 'JPEG · 화면용'}</dd>
                  <dt className="text-zinc-500">크롭</dt>
                  <dd>{facts.cropWidth} × {facts.cropHeight} px</dd>
                  <dt className="text-zinc-500">구매 확대</dt>
                  <dd>{Math.round(facts.zoom * 100)}%</dd>
                  <dt className="text-zinc-500">구매 위치</dt>
                  <dd>X {formatPurchasedOffset(facts.offsetX)} · Y {formatPurchasedOffset(facts.offsetY)}</dd>
                  <dt className="text-zinc-500">구성 버전</dt>
                  <dd>{facts.version}</dd>
                  <dt className="text-zinc-500">화면 배율</dt>
                  <dd>{formatInspectorZoom(mode, zoom)}</dd>
                </dl>
                <p className="mt-3 text-xs leading-5 text-zinc-500">100%는 보고 있는 이미지의 1픽셀을 CSS 1픽셀로 보는 배율입니다. 구매 확대와 기기 픽셀 배율이 아닙니다.</p>
                <p className="mt-2 text-xs leading-5 text-zinc-500">{facts.resampling.text}</p>
              </details>
            ) : null}
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function InspectionToolbar({
  mode,
  zoom,
  showCropToggle,
  showCrop,
  onFit,
  onActual,
  onZoom,
  onReset,
  onToggleCrop,
}: {
  mode: ViewMode;
  zoom: number;
  showCropToggle: boolean;
  showCrop: boolean;
  onFit: () => void;
  onActual: () => void;
  onZoom: (factor: number) => void;
  onReset: () => void;
  onToggleCrop: () => void;
}) {
  const itemClass = 'focus-ring min-h-11 px-3 text-sm text-zinc-200';
  return (
    <div className="flex shrink-0 items-center rounded-full bg-white/10" role="toolbar" aria-label="화면 배율. 구매 확대와 별개입니다.">
      <button type="button" className={itemClass} onClick={onFit}>맞추기</button>
      <button type="button" className={itemClass} onClick={onActual}>100%</button>
      <button type="button" className={itemClass} aria-label="축소" onClick={() => onZoom(0.8)}>−</button>
      <span className="min-w-14 px-1 text-center text-xs text-zinc-400">{mode === 'actual' ? `${Math.round(zoom * 100)}%` : '맞춤'}</span>
      <button type="button" className={itemClass} aria-label="확대" onClick={() => onZoom(1.25)}>+</button>
      <button type="button" className={itemClass} onClick={onReset}>초기화</button>
      {showCropToggle ? (
        <button type="button" className={itemClass} aria-pressed={showCrop} onClick={onToggleCrop}>{showCrop ? '크롭 숨기기' : '크롭 보기'}</button>
      ) : null}
    </div>
  );
}

function CompareWorkspace({
  choice,
  onChoice,
  preview,
  original,
  overlay,
  originalFrame,
  previewFrame,
  manufacturing,
  loading,
  failure,
  onLoad,
  onPreviewError,
  onOriginalError,
  onDecode,
}: {
  choice: CompareChoice;
  onChoice: (choice: CompareChoice) => void;
  preview: InspectionImageSlot;
  original: InspectionImageSlot;
  overlay: { left: number; top: number; width: number; height: number } | null;
  originalFrame: DecodedSize | null;
  previewFrame: DecodedSize | null;
  manufacturing: ManufacturingFileResult | null;
  loading: boolean;
  failure: string | null;
  onLoad: () => void;
  onPreviewError?: () => void;
  onOriginalError?: () => void;
  onDecode: (kind: 'original' | 'preview', size: DecodedSize) => void;
}) {
  const compareLine = choice === 'original-mfg'
    ? '원본 크롭과 제작 파일 비교'
    : choice === 'three'
      ? '세 가지 비교'
      : '확정 구도와 제작 파일 비교';
  const manufacturingReady = manufacturing?.ok === true;
  const columns = choice === 'three' ? 'lg:grid-cols-3' : 'lg:grid-cols-2';
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col gap-1 px-4 pt-2 sm:px-6">
        <div className="flex flex-wrap gap-3 text-sm">
          <ChoiceButton selected={choice === 'preview-mfg'} onClick={() => onChoice('preview-mfg')}>확정 구도와 제작</ChoiceButton>
          <ChoiceButton selected={choice === 'original-mfg'} onClick={() => onChoice('original-mfg')}>원본 크롭과 제작</ChoiceButton>
          <ChoiceButton selected={choice === 'three'} onClick={() => onChoice('three')}>세 가지</ChoiceButton>
        </div>
        <p className="text-sm text-zinc-400">{compareLine}</p>
      </div>
      <div className={`grid min-h-0 flex-1 grid-cols-1 gap-6 overflow-y-auto p-4 sm:p-6 ${columns}`}>
        {choice !== 'original-mfg' ? (
          <CompareSlot label="고객 확정 구도">
            <FittedImage slot={preview} alt="고객이 확정한 구도" frameSize={previewFrame} onError={onPreviewError} onDecode={(size) => onDecode('preview', size)} />
          </CompareSlot>
        ) : null}
        {choice !== 'preview-mfg' ? (
          <CompareSlot label="업로드 원본">
            <FittedImage slot={original} alt="원본 소스와 구매 크롭" frameSize={originalFrame} overlay={overlay} onError={onOriginalError} onDecode={(size) => onDecode('original', size)} />
          </CompareSlot>
        ) : null}
        <CompareSlot label={manufacturingReady ? '실제 제작 PNG' : '제작 PNG'}>
          {manufacturingReady ? (
            <FittedImage slot={{ status: 'ready', src: manufacturing.src }} alt="실제 제작 PNG" frameSize={{ width: manufacturing.width, height: manufacturing.height }} />
          ) : (
            <ManufacturingEmpty
              variant="compare"
              frameSize={previewFrame}
              loading={loading}
              message={failure}
              onLoad={onLoad}
            />
          )}
        </CompareSlot>
      </div>
    </div>
  );
}

function ChoiceButton({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`focus-ring min-h-11 ${selected ? 'text-white' : 'text-zinc-500'}`} aria-pressed={selected} onClick={onClick}>
      {children}
    </button>
  );
}

function CompareSlot({ label, children }: { label: string; children: ReactNode }) {
  return (
    <figure className="flex min-h-64 flex-col lg:min-h-0">
      <figcaption className="mb-2 text-sm text-zinc-400">{label}</figcaption>
      <div className="min-h-0 flex-1">{children}</div>
    </figure>
  );
}

function ManufacturingEmpty({
  variant,
  frameSize = null,
  loading,
  message,
  onLoad,
}: {
  variant: 'workspace' | 'compare';
  frameSize?: DecodedSize | null;
  loading: boolean;
  message: string | null;
  onLoad: () => void;
}) {
  const title = variant === 'compare' ? '제작 PNG' : '제작 PNG 확인';
  const description = variant === 'compare'
    ? '제작 파일을 준비하면 고객 확정 구도와 나란히 비교할 수 있습니다.'
    : '고객이 확정한 구도를 원본 이미지로 제작합니다. 생성된 파일은 확대해서 확인하거나 다운로드할 수 있습니다.';
  const action = message ? '다시 준비' : variant === 'compare' ? '제작 PNG 준비 및 비교' : '제작 PNG 준비 및 보기';
  const body = (
    <div className="max-w-sm text-center" aria-live="polite">
      {variant === 'workspace' ? <p className="text-base">{title}</p> : null}
      {loading ? <p className={`text-sm text-zinc-300 ${variant === 'workspace' ? 'mt-2' : ''}`}>제작 파일을 준비하고 있습니다.</p> : (
        <>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
          {message ? <p className="mt-2 text-sm text-amber-200">{message}</p> : null}
          <button type="button" className="focus-ring mt-4 min-h-11 rounded-lg bg-white px-4 text-sm font-medium text-black" onClick={onLoad}>{action}</button>
        </>
      )}
    </div>
  );
  if (variant === 'compare') {
    const ratio = frameSize && frameSize.height > 0 ? frameSize.width / frameSize.height : 200 / 283;
    return (
      <div className="flex h-full min-h-64 w-full items-center justify-center [container-type:size]">
        <div
          className="flex items-center justify-center border border-white/15 px-4"
          style={{
            aspectRatio: frameSize ? `${frameSize.width} / ${frameSize.height}` : '200 / 283',
            width: `min(100cqw, calc(100cqh * ${ratio}))`,
          }}
        >
          {body}
        </div>
      </div>
    );
  }
  return <div className="flex min-h-64 flex-1 items-center justify-center px-6">{body}</div>;
}

function FittedImage({
  slot,
  alt,
  overlay,
  fill = false,
  frameSize = null,
  onError,
  onDecode,
}: {
  slot: InspectionImageSlot;
  alt: string;
  overlay?: { left: number; top: number; width: number; height: number } | null;
  fill?: boolean;
  frameSize?: DecodedSize | null;
  onError?: () => void;
  onDecode?: (size: DecodedSize) => void;
}) {
  if (slot.status === 'loading') return <p className="text-sm text-zinc-300">이미지를 불러오는 중입니다.</p>;
  if (slot.status === 'failed') return <p className="text-sm text-amber-200">이미지를 불러오지 못했습니다.</p>;
  if (slot.status !== 'ready' || !slot.src) return <p className="text-sm text-zinc-400">이미지가 없습니다.</p>;
  const image = (
    <img
      src={slot.src}
      alt={alt}
      className={fill ? 'h-full w-full object-contain' : 'block h-auto w-full'}
      referrerPolicy="no-referrer"
      onError={onError}
      onLoad={(event) => onDecode?.({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
    />
  );
  if (!fill) {
    return (
      <div className="flex h-full w-full items-center justify-center [container-type:size]">
        <div
          className="relative overflow-hidden"
          style={frameSize ? {
            aspectRatio: `${frameSize.width} / ${frameSize.height}`,
            width: `min(100cqw, calc(100cqh * ${frameSize.width} / ${frameSize.height}))`,
          } : undefined}
        >
          {image}
          {overlay && frameSize ? <CropRect overlay={overlay} /> : null}
        </div>
      </div>
    );
  }
  return (
    <div className="relative h-full w-full overflow-hidden">
      {image}
      {overlay ? <CropRect overlay={overlay} /> : null}
    </div>
  );
}

function CropRect({ overlay }: { overlay: { left: number; top: number; width: number; height: number } }) {
  return (
    <div
      className="pointer-events-none absolute border-2 border-white outline outline-1 outline-black"
      style={{
        left: `${overlay.left * 100}%`,
        top: `${overlay.top * 100}%`,
        width: `${overlay.width * 100}%`,
        height: `${overlay.height * 100}%`,
        boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
      }}
    />
  );
}

function ZoomStage({
  mode,
  zoom,
  pan,
  contentSize,
  onPan,
  onZoom,
  onFit,
  onActual,
  children,
}: {
  mode: ViewMode;
  zoom: number;
  pan: { x: number; y: number };
  contentSize: DecodedSize | null;
  onPan: (pan: { x: number; y: number }) => void;
  onZoom: (factor: number) => void;
  onFit: () => void;
  onActual: () => void;
  children: ReactNode;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const zoomRef = useRef(onZoom);
  zoomRef.current = onZoom;
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const observer = new ResizeObserver(() => {
      setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    });
    observer.observe(stage);
    setStageSize({ width: stage.clientWidth, height: stage.clientHeight });
    const onWheel = (event: WheelEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      zoomRef.current(event.deltaY > 0 ? 0.9 : 1.1);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer.disconnect();
      stage.removeEventListener('wheel', onWheel);
    };
  }, []);

  const fitScale = contentSize && stageSize.width > 0 && stageSize.height > 0
    ? Math.min(stageSize.width / contentSize.width, stageSize.height / contentSize.height)
    : 1;
  const scale = mode === 'actual' ? zoom : fitScale * zoom;
  const frame = contentSize ?? { width: stageSize.width || 1, height: stageSize.height || 1 };

  return (
    <div
      ref={stageRef}
      tabIndex={0}
      aria-label={mode === 'actual' ? `검사 화면. 이미지 픽셀 ${Math.round(zoom * 100)}퍼센트.` : '검사 화면. 화면에 맞춘 배율.'}
      className="focus-ring relative min-h-0 flex-1 overflow-hidden outline-none"
      style={{ touchAction: 'none' }}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if ((event.target as HTMLElement | null)?.closest('button, input, textarea, summary')) return;
        stageRef.current?.focus();
        drag.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const start = drag.current;
        if (!start) return;
        onPan({ x: start.panX + event.clientX - start.x, y: start.panY + event.clientY - start.y });
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        const target = event.target;
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
        if (event.key === '+' || event.key === '=') onZoom(1.25);
        else if (event.key === '-' || event.key === '_') onZoom(0.8);
        else if (event.key === '0' || event.key === 'f' || event.key === 'F') onFit();
        else if (event.key === '1') onActual();
        else if (event.key === 'ArrowLeft') onPan({ x: pan.x + 48, y: pan.y });
        else if (event.key === 'ArrowRight') onPan({ x: pan.x - 48, y: pan.y });
        else if (event.key === 'ArrowUp') onPan({ x: pan.x, y: pan.y + 48 });
        else if (event.key === 'ArrowDown') onPan({ x: pan.x, y: pan.y - 48 });
        else return;
        event.preventDefault();
      }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: frame.width,
          height: frame.height,
          transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px)) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
