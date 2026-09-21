import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyOrientation,
  applyPan,
  applyZoom,
  clampComposition,
  pointerDeltaToOffset,
  resetEdits,
} from './math';
import { loadCustomSource, rasterizeCustomComposition, revokePreviewUrl } from './rasterize';
import {
  defaultComposition,
  type CustomComposition,
  type CustomOrientation,
  type CustomSource,
} from './types';

const RASTER_DEBOUNCE_MS = 280;

export function useCustomComposition() {
  const [source, setSource] = useState<CustomSource | null>(null);
  const [composition, setComposition] = useState<CustomComposition>(defaultComposition());
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const loadGenRef = useRef(0);
  const rasterGenRef = useRef(0);
  const forceGenRef = useRef(0);
  const forceInFlightRef = useRef(false);
  const sourceRef = useRef<CustomSource | null>(null);
  const compositionRef = useRef<CustomComposition>(composition);
  sourceRef.current = source;
  compositionRef.current = composition;

  const replacePreviewUrl = useCallback((next: string | null) => {
    revokePreviewUrl(previewUrlRef.current);
    previewUrlRef.current = next;
    setPreviewUrl(next);
  }, []);

  const clearSource = useCallback(() => {
    loadGenRef.current += 1;
    rasterGenRef.current += 1;
    setSource(null);
    setComposition(defaultComposition());
    replacePreviewUrl(null);
  }, [replacePreviewUrl]);

  const loadSourceFromUrl = useCallback(async (url: string, preserveOrientation = true) => {
    const gen = ++loadGenRef.current;
    const next = await loadCustomSource(url);
    if (gen !== loadGenRef.current) return;
    setSource(next);
    setComposition((prev) =>
      defaultComposition(preserveOrientation ? prev.orientation : 'portrait'),
    );
  }, []);

  const setOrientation = useCallback((orientation: CustomOrientation) => {
    setComposition((prev) => (source ? applyOrientation(source, prev, orientation) : { ...prev, orientation }));
  }, [source]);

  const setZoom = useCallback((zoom: number) => {
    setComposition((prev) => (source ? applyZoom(source, prev, zoom) : { ...prev, zoom }));
  }, [source]);

  const panByPointer = useCallback((dxPx: number, dyPx: number, frameWidth: number, frameHeight: number) => {
    const delta = pointerDeltaToOffset(dxPx, dyPx, frameWidth, frameHeight);
    setComposition((prev) => (source ? applyPan(source, prev, delta.offsetX, delta.offsetY) : prev));
  }, [source]);

  const reset = useCallback(() => {
    setComposition((prev) => (source ? resetEdits(source, prev) : { ...prev, zoom: 1, offsetX: 0, offsetY: 0 }));
  }, [source]);

  const ensureCurrentPreview = useCallback(async (): Promise<string | null> => {
    const currentSource = sourceRef.current;
    const currentComposition = compositionRef.current;
    if (!currentSource) return null;
    const snapshot = clampComposition(currentSource, currentComposition);
    const forceGen = ++forceGenRef.current;
    forceInFlightRef.current = true;
    rasterGenRef.current += 1;
    try {
      const blob = await rasterizeCustomComposition(currentSource, snapshot);
      if (forceGen !== forceGenRef.current) return null;
      const url = URL.createObjectURL(blob);
      replacePreviewUrl(url);
      return url;
    } catch {
      if (forceGen === forceGenRef.current) replacePreviewUrl(null);
      return null;
    } finally {
      if (forceGen === forceGenRef.current) forceInFlightRef.current = false;
    }
  }, [replacePreviewUrl]);

  useEffect(() => {
    if (!source) {
      replacePreviewUrl(null);
      return undefined;
    }
    if (forceInFlightRef.current) return undefined;

    const gen = ++rasterGenRef.current;
    const forceAtSchedule = forceGenRef.current;
    const timer = window.setTimeout(() => {
      rasterizeCustomComposition(source, clampComposition(source, composition))
        .then((blob) => {
          if (gen !== rasterGenRef.current) return;
          if (forceAtSchedule !== forceGenRef.current) return;
          if (forceInFlightRef.current) return;
          replacePreviewUrl(URL.createObjectURL(blob));
        })
        .catch(() => {
          if (gen !== rasterGenRef.current) return;
          if (forceAtSchedule !== forceGenRef.current) return;
          if (forceInFlightRef.current) return;
          replacePreviewUrl(null);
        });
    }, RASTER_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [source, composition, replacePreviewUrl]);

  useEffect(() => {
    return () => {
      rasterGenRef.current += 1;
      revokePreviewUrl(previewUrlRef.current);
    };
  }, []);

  return {
    source,
    composition,
    previewUrl,
    loadSourceFromUrl,
    clearSource,
    setOrientation,
    setZoom,
    panByPointer,
    reset,
    ensureCurrentPreview,
  };
}
