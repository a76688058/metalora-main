import {
  WORKSHOP_UPLOAD_LIMITS,
  buildCompleteV1Config,
  persistWorkshopCartMedia,
  verifyTrustedCustomCartRow,
  type WorkshopCartMediaResult,
  type WorkshopMediaApi,
} from './durableHandoff';
import { validateCustomImageFile, type CustomImageValidationResult } from './imageValidation';
import { clampComposition } from './math';
import { rasterizeCustomComposition } from './rasterize';
import type { CustomComposition, CustomSource } from './types';

export const CART_CONTINUE_LINE_KEY = 'metalora-cart-continue-line';

export const EXAMPLE_ARTWORK_REFUSAL = '예시 이미지는 구매할 수 없습니다. 고객 사진을 업로드해 주세요.';
export const MISSING_ARTWORK_MESSAGE = '사진을 먼저 업로드해 주세요.';
export const OVERSIZE_ARTWORK_MESSAGE = '25MB 이하의 사진을 선택해 주세요.';
export const PRICE_UNREADY_MESSAGE = '판매가를 확인할 수 없어 담을 수 없습니다.';
export const LOGIN_REQUIRED_MESSAGE = '로그인이 필요합니다.';
export const CART_SAVE_FAILED_MESSAGE = '장바구니에 담지 못했습니다. 다시 시도해 주세요.';
export const CART_REFRESH_FAILED_MESSAGE = '장바구니에 담겼습니다. 목록을 다시 불러오지 못했습니다. 같은 화면에서 다시 누르면 새 항목을 만들지 않고 목록만 다시 불러옵니다.';
export const PREVIEW_FAILED_MESSAGE = '미리보기를 만들지 못했습니다. 다시 시도해 주세요.';
export const CART_IN_FLIGHT_MESSAGE = '이미 담고 있습니다.';

const heldGates = new Set<object>();

export function customCheckoutCartItemId(item: {
  id?: unknown;
  product_id?: unknown;
  product_type?: unknown;
}): string | null {
  const custom = item.product_id === 'workshop-single' || item.product_type === 'workshop';
  if (!custom) return null;
  return typeof item.id === 'string' && item.id.trim() ? item.id.trim() : null;
}

export function persistedCustomCartItemId(rpcData: unknown): string | null {
  const row = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as { id?: unknown } | null;
  if (!row || typeof row !== 'object') return null;
  return typeof row.id === 'string' && row.id.trim() ? row.id.trim() : null;
}

export function customCartRetryAction(persistedCartItemId: string | null): 'create' | 'refresh' {
  return persistedCartItemId ? 'refresh' : 'create';
}

export function freezeCustomSubmission(
  source: CustomSource,
  composition: CustomComposition,
): { source: CustomSource; composition: CustomComposition } {
  const frozenSource: CustomSource = { url: source.url, width: source.width, height: source.height };
  return {
    source: frozenSource,
    composition: { ...clampComposition(frozenSource, composition) },
  };
}

export function submissionCompositionKey(source: CustomSource, composition: CustomComposition): string {
  const frozen = freezeCustomSubmission(source, composition);
  return JSON.stringify({
    url: frozen.source.url,
    width: frozen.source.width,
    height: frozen.source.height,
    version: frozen.composition.version,
    orientation: frozen.composition.orientation,
    zoom: frozen.composition.zoom,
    offsetX: frozen.composition.offsetX,
    offsetY: frozen.composition.offsetY,
  });
}

type RememberedCartLine = {
  key: string;
  lineId: string;
  priceSnapshot: number;
  previewRef: string;
  originalRef: string;
  config: Record<string, unknown>;
};

const rememberedByGate = new WeakMap<object, RememberedCartLine>();

export type CustomCartAssessment =
  | { ok: true }
  | { ok: false; message: string };

export function assessCustomCartFile(input: {
  example: boolean;
  file: File | null;
  source: CustomSource | null;
  priceReady: boolean;
}): CustomCartAssessment {
  if (input.example) return { ok: false, message: EXAMPLE_ARTWORK_REFUSAL };
  if (!input.file || !input.source) return { ok: false, message: MISSING_ARTWORK_MESSAGE };
  if (input.file.size <= 0) return { ok: false, message: MISSING_ARTWORK_MESSAGE };
  if (input.file.size > WORKSHOP_UPLOAD_LIMITS.original) return { ok: false, message: OVERSIZE_ARTWORK_MESSAGE };
  if (!input.priceReady) return { ok: false, message: PRICE_UNREADY_MESSAGE };
  return { ok: true };
}

export type CustomCartRow = {
  id?: string;
  custom_image?: string | null;
  custom_config?: Record<string, unknown> | null;
};

export type CustomCartLineResult =
  | {
      ok: true;
      lineId: string;
      priceSnapshot: number;
      previewRef: string;
      originalRef: string;
      config: Record<string, unknown>;
    }
  | { ok: false; persisted: true; lineId: string; message: string }
  | { ok: false; persisted?: false; message: string };

export async function submitCustomArtworkToCart(input: {
  example: boolean;
  file: File | null;
  source: CustomSource | null;
  composition: CustomComposition;
  priceReady: boolean;
  getAccessToken: () => Promise<string | null>;
  media: WorkshopMediaApi;
  addLine: (args: {
    orientation: CustomComposition['orientation'];
    originalRef: string;
    previewRef: string;
    config: Record<string, unknown>;
  }) => Promise<CustomCartRow | null>;
  normalizeRef: (value: unknown) => string | null;
  refreshCart: () => Promise<boolean>;
  rasterize?: typeof rasterizeCustomComposition;
  validateFile?: (file: File) => Promise<CustomImageValidationResult>;
  persist?: typeof persistWorkshopCartMedia;
  gate?: object;
}): Promise<CustomCartLineResult> {
  if (input.gate) {
    if (heldGates.has(input.gate)) return { ok: false, message: CART_IN_FLIGHT_MESSAGE };
    heldGates.add(input.gate);
  }

  try {
    const assessed = assessCustomCartFile(input);
    if (assessed.ok === false) return assessed;

    const validate = input.validateFile ?? validateCustomImageFile;
    const fileCheck = await validate(input.file as File);
    if (fileCheck.ok === false) return { ok: false, message: fileCheck.message };
    if (fileCheck.objectUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(fileCheck.objectUrl); } catch { /* non-browser double */ }
    }

    const token = await input.getAccessToken().catch(() => null);
    if (!token) return { ok: false, message: LOGIN_REQUIRED_MESSAGE };

    const frozen = freezeCustomSubmission(input.source as CustomSource, input.composition);
    const key = submissionCompositionKey(frozen.source, frozen.composition);
    const remembered = input.gate ? rememberedByGate.get(input.gate) : undefined;
    if (remembered && remembered.key === key) {
      const refreshed = await input.refreshCart();
      if (!refreshed) {
        return { ok: false, persisted: true, lineId: remembered.lineId, message: CART_REFRESH_FAILED_MESSAGE };
      }
      rememberedByGate.delete(input.gate as object);
      return {
        ok: true,
        lineId: remembered.lineId,
        priceSnapshot: remembered.priceSnapshot,
        previewRef: remembered.previewRef,
        originalRef: remembered.originalRef,
        config: remembered.config,
      };
    }
    if (input.gate) rememberedByGate.delete(input.gate);

    const config = buildCompleteV1Config(frozen.source, frozen.composition);
    delete config.price;
    delete config.price_snapshot;

    let previewBlob: Blob;
    try {
      previewBlob = await (input.rasterize ?? rasterizeCustomComposition)(
        frozen.source,
        frozen.composition,
      );
    } catch {
      return { ok: false, message: PREVIEW_FAILED_MESSAGE };
    }

    const persist = input.persist ?? persistWorkshopCartMedia;
    const handoff = await persist(
      input.media,
      { originalFile: input.file, existingOriginalRef: null, previewBlob },
      async ({ originalRef, previewRef }) => input.addLine({
        orientation: frozen.composition.orientation,
        originalRef,
        previewRef,
        config,
      }),
    );

    return finishHandoff(handoff, input.normalizeRef, input.refreshCart, config, input.gate, key);
  } finally {
    if (input.gate) heldGates.delete(input.gate);
  }
}

async function finishHandoff(
  handoff: WorkshopCartMediaResult<CustomCartRow>,
  normalizeRef: (value: unknown) => string | null,
  refreshCart: () => Promise<boolean>,
  config: Record<string, unknown>,
  gate: object | undefined,
  key: string,
): Promise<CustomCartLineResult> {
  if (handoff.ok === false) {
    return {
      ok: false,
      message: handoff.reason === 'no_original'
        ? '원본 이미지를 저장하지 못했습니다. 다시 시도해 주세요.'
        : CART_SAVE_FAILED_MESSAGE,
    };
  }

  const row = handoff.value;
  const verified = verifyTrustedCustomCartRow(row, handoff.refs.previewRef, normalizeRef);
  const lineId = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : null;
  if (!verified.ok || !lineId) return { ok: false, message: CART_SAVE_FAILED_MESSAGE };
  const saved: RememberedCartLine = {
    key,
    lineId,
    priceSnapshot: verified.priceSnapshot,
    previewRef: handoff.refs.previewRef,
    originalRef: handoff.refs.originalRef,
    config,
  };
  const refreshed = await refreshCart();
  if (!refreshed) {
    if (gate) rememberedByGate.set(gate, saved);
    return { ok: false, persisted: true, lineId, message: CART_REFRESH_FAILED_MESSAGE };
  }
  if (gate) rememberedByGate.delete(gate);
  return {
    ok: true,
    lineId,
    priceSnapshot: saved.priceSnapshot,
    previewRef: saved.previewRef,
    originalRef: saved.originalRef,
    config,
  };
}
