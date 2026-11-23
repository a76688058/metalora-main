import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Cache } from 'three';
import { useEnvironment } from '@react-three/drei';
import { Box, Eye, Image as ImageIcon, ImagePlus, Minus, Pencil, Plus, RotateCcw, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion';
import {
  fetchCustomMPrice,
  formatCustomMPrice,
  PRICE_UNAVAILABLE_MESSAGE,
} from '../../lib/customComposition/customMPrice';
import { SUPPORTED_IMAGE_ACCEPT, validateCustomImageFile } from '../../lib/customComposition/imageValidation';
import { frameAspect, imageCssLayout, minZoom, safeAreaInsetFractions } from '../../lib/customComposition/math';
import { MAX_ZOOM, SAFE_AREA_MM } from '../../lib/customComposition/types';
import { WORKSHOP_UPLOAD_LIMITS } from '../../lib/customComposition/durableHandoff';
import { useCustomComposition } from '../../lib/customComposition/useCustomComposition';
import {
  CART_SAVE_FAILED_MESSAGE,
  submitCustomArtworkToCart,
} from '../../lib/customComposition/submitCustomCart';
import { supabase } from '../../lib/supabase';
import { normalizeWorkshopMediaRef } from '../../lib/workshopMedia';
import { useCart } from '../../context/CartContext';
import type { CustomComposition, CustomSource } from '../../lib/customComposition/types';
import type { Product } from '../../data/products';
import { CATALOG_M_DIMENSION, CATALOG_M_NAME } from '../pdp/catalogSizeLabel';
import { PDP_CAMERA, PDP_FRAME_SCALE, PdpSpatialCanvas } from '../pdp/PdpSpatialCanvas';
import { ProductTheatreRoomPreview } from '../pdp/ProductTheatreRoomPreview';
import { usePdpQualityTier } from '../pdp/usePdpQualityTier';
import './workshopStudio.css';

const PRODUCT_SIZE = '200 × 283 mm';
const ZOOM_NUDGE = 0.05;

type Step = 'edit' | 'spatial' | 'room' | 'preview';

const M_WORLD_WIDTH = 200 / 210;
const M_WORLD_HEIGHT = 283 / 210;
const M_WORLD_THICKNESS = 1.15 / 210;
/** Same pointer scale as ProductTheatreStage. Not a separate camera model. */
const SPATIAL_RAD_PER_PX = 0.005;
const STUDIO_LIGHT_URL = 'https://raw.githack.com/pmndrs/drei-assets/456060a26bbeb8fdf79326f224b6d99b8bcce736/hdri/studio_small_03_1k.hdr';

function warmStudioLight() {
  if (typeof window === 'undefined') return;
  const host = window as Window & {
    __wsStudioLight?: Promise<void>;
    __wsStudioMs?: number;
    __wsStudioReady?: boolean;
  };
  if (host.__wsStudioLight) return;
  const started = performance.now();
  const finish = () => {
    host.__wsStudioReady = true;
    window.dispatchEvent(new Event('ws-studio-ready'));
  };
  host.__wsStudioLight = fetch(STUDIO_LIGHT_URL, { mode: 'cors', credentials: 'omit' })
    .then((response) => {
      if (!response.ok) throw new Error('studio light unavailable');
      return response.arrayBuffer();
    })
    .then((buffer) => {
      Cache.enabled = true;
      Cache.add(`file:${STUDIO_LIGHT_URL}`, buffer);
      useEnvironment.preload({ preset: 'studio' });
      host.__wsStudioMs = Math.round(performance.now() - started);
      finish();
    })
    .catch(() => {
      host.__wsStudioMs = Math.round(performance.now() - started);
      finish();
    });
}

warmStudioLight();

type Atmosphere = { base: string; a: string; b: string; c: string };

const ORIENT_MS = 420;
const INTRO_YAW = (6 * Math.PI) / 180;
const INTRO_MS = 520;
const WORKSHOP_THEME_KEY = 'metalora.workshop.theme';

type WorkshopThemeMode = 'light' | 'dark' | 'system';

function readWorkshopThemeMode(): WorkshopThemeMode {
  const saved = localStorage.getItem(WORKSHOP_THEME_KEY);
  if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
  const siteTheme = localStorage.getItem('theme');
  if (siteTheme === 'light' || siteTheme === 'dark') return siteTheme;
  return 'light';
}

function resolveWorkshopTheme(mode: WorkshopThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const SPATIAL_VIEW_FILL = 0.825;

function orientedFace(orientation: 'portrait' | 'landscape', panelWidth: number, panelHeight: number) {
  if (orientation === 'landscape') return { width: panelHeight, height: panelWidth };
  return { width: panelWidth, height: panelHeight };
}

function fitPanelScale(canvasAspect: number, faceWidth: number, faceHeight: number): number {
  const cameraZ = PDP_CAMERA.position[2];
  const visibleH = 2 * Math.tan((PDP_CAMERA.fov * Math.PI) / 360) * cameraZ;
  const visibleW = visibleH * canvasAspect;
  const byHeight = (SPATIAL_VIEW_FILL * visibleH) / (faceHeight * PDP_FRAME_SCALE);
  const byWidth = (SPATIAL_VIEW_FILL * visibleW) / (faceWidth * PDP_FRAME_SCALE);
  return Math.min(byHeight, byWidth);
}

type SpatialMode = 'wait' | 'ready';

const WorkshopSpatialStage = React.memo(function WorkshopSpatialStage({
  previewUrl,
  spatialKey,
  orientation,
  panelWidth,
  panelHeight,
  mode,
  shown,
  playIntro,
  reducedMotion,
  onReady,
  onFailed,
  onIntroStart,
  onFirstDrag,
}: {
  previewUrl: string;
  spatialKey: string;
  orientation: 'portrait' | 'landscape';
  panelWidth: number;
  panelHeight: number;
  mode: SpatialMode;
  shown: boolean;
  playIntro: boolean;
  reducedMotion: boolean;
  onReady: () => void;
  onFailed: () => void;
  onIntroStart: () => void;
  onFirstDrag: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const face = orientedFace(orientation, panelWidth, panelHeight);
  const analyticalScale = fitPanelScale(face.width / face.height, face.width, face.height);
  const [fitScale, setFitScale] = useState(analyticalScale);
  const [pose, setPose] = useState({ rotationX: 0, rotationY: 0 });
  const poseRef = useRef(pose);
  poseRef.current = pose;
  const dragRef = useRef<{ id: number; x: number; y: number; rotationX: number; rotationY: number } | null>(null);
  const pointRef = useRef<{ x: number; y: number } | null>(null);
  const frameRef = useRef(0);
  const introRaf = useRef(0);
  const introStarted = useRef(false);
  const allowIntro = useRef(playIntro);
  const [dragging, setDragging] = useState(false);

  const flushDrag = () => {
    frameRef.current = 0;
    const drag = dragRef.current;
    const point = pointRef.current;
    if (!drag || !point) return;
    const next = {
      rotationX: drag.rotationX + (point.y - drag.y) * SPATIAL_RAD_PER_PX,
      rotationY: drag.rotationY + (point.x - drag.x) * SPATIAL_RAD_PER_PX,
    };
    poseRef.current = next;
    setPose(next);
  };

  useEffect(() => {
    poseRef.current = { rotationX: 0, rotationY: 0 };
    setPose({ rotationX: 0, rotationY: 0 });
  }, [orientation, spatialKey]);

  useEffect(() => {
    if (!shown || !allowIntro.current || reducedMotion || introStarted.current) return undefined;
    introStarted.current = true;
    onIntroStart();
    const start = performance.now();
    const tick = (now: number) => {
      if (dragRef.current) return;
      const progress = Math.min(1, (now - start) / INTRO_MS);
      const eased = 1 - (1 - progress) ** 3;
      const next = { rotationX: 0, rotationY: INTRO_YAW * eased };
      poseRef.current = next;
      setPose(next);
      if (progress < 1) introRaf.current = window.requestAnimationFrame(tick);
    };
    introRaf.current = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(introRaf.current);
  }, [shown, reducedMotion, onIntroStart]);

  useLayoutEffect(() => {
    const node = hostRef.current;
    if (!node) return undefined;
    const apply = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const next = fitPanelScale(rect.width / rect.height, face.width, face.height);
      setFitScale((current) => (Math.abs(current - next) < 0.01 ? current : next));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(node);
    return () => observer.disconnect();
  }, [face.width, face.height]);

  const releaseDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.id !== event.pointerId) return;
    const point = pointRef.current;
    const moved = Boolean(point && (point.x !== drag.x || point.y !== drag.y));
    dragRef.current = null;
    pointRef.current = null;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    setDragging(false);
    if (moved) onFirstDrag();
  };

  return (
    <div
      ref={hostRef}
      className="ws-spatial"
      data-mode={mode}
      data-ready={shown ? 'true' : 'false'}
      data-dragging={dragging ? 'true' : 'false'}
      data-fit={fitScale.toFixed(3)}
      data-pose={`${pose.rotationX.toFixed(3)},${pose.rotationY.toFixed(3)}`}
      aria-label="3D로 보기"
      onPointerDown={(event) => {
        window.cancelAnimationFrame(introRaf.current);
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          /* Capture is optional. The move events still update the pose. */
        }
        setDragging(true);
        const current = poseRef.current;
        dragRef.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          rotationX: current.rotationX,
          rotationY: current.rotationY,
        };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        pointRef.current = { x: event.clientX, y: event.clientY };
        if (!frameRef.current) frameRef.current = window.requestAnimationFrame(flushDrag);
      }}
      onPointerUp={releaseDrag}
      onPointerCancel={releaseDrag}
    >
      <PdpSpatialCanvas
        key={spatialKey}
        className="ws-spatial-canvas"
        frontTextureUrl={previewUrl}
        orientation={orientation}
        panelWidth={panelWidth}
        panelHeight={panelHeight}
        panelThickness={M_WORLD_THICKNESS}
        scale={fitScale}
        faithfulFrontPrint
        holdInspectDemand
        snapBaseScale
        inspectRotationMode="continuous"
        rotationX={pose.rotationX}
        rotationY={pose.rotationY}
        cameraNear={0.12}
        onReady={onReady}
        onFailed={onFailed}
      />
    </div>
  );
});

const QUIET_ATMOSPHERE: Atmosphere = {
  base: '#07101c',
  a: '#3d7cff',
  b: '#7b61ff',
  c: '#ff5d73',
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const lightness = (max + min) / 2;
  const delta = max - min;
  if (delta === 0) return { h: 0, s: 0, l: lightness };
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = 0;
  if (max === rn) hue = ((gn - bn) / delta) % 6;
  else if (max === gn) hue = (bn - rn) / delta + 2;
  else hue = (rn - gn) / delta + 4;
  hue *= 60;
  if (hue < 0) hue += 360;
  return { h: hue, s: saturation, l: lightness };
}

function grade(hue: number, saturation: number, lightness: number): string {
  return `hsl(${Math.round((hue + 360) % 360)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%)`;
}

function sampleAtmosphere(url: string): Promise<Atmosphere> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const size = 24;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        resolve(QUIET_ATMOSPHERE);
        return;
      }
      context.drawImage(image, 0, 0, size, size);
      let pixels: Uint8ClampedArray;
      try {
        pixels = context.getImageData(0, 0, size, size).data;
      } catch {
        resolve(QUIET_ATMOSPHERE);
        return;
      }
      let hueX = 0;
      let hueY = 0;
      let satSum = 0;
      let weightSum = 0;
      const samples: { h: number; s: number; w: number }[] = [];
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index + 3] < 200) continue;
        const hsl = rgbToHsl(pixels[index], pixels[index + 1], pixels[index + 2]);
        if (hsl.l < 0.05 || hsl.l > 0.96) continue;
        const weight = Math.max(hsl.s, 0.045) * (0.4 + (1 - Math.abs(hsl.l - 0.4)));
        samples.push({ h: hsl.h, s: hsl.s, w: weight });
        const chroma = Math.max(hsl.s, 0.05);
        hueX += Math.cos((hsl.h * Math.PI) / 180) * weight * chroma;
        hueY += Math.sin((hsl.h * Math.PI) / 180) * weight * chroma;
        satSum += hsl.s * weight;
        weightSum += weight;
      }
      if (weightSum < 0.01 || samples.length < 8) {
        resolve(QUIET_ATMOSPHERE);
        return;
      }
      const meanSat = satSum / weightSum;
      if (meanSat < 0.07 || Math.hypot(hueX, hueY) < 0.01) {
        resolve(QUIET_ATMOSPHERE);
        return;
      }
      let primary = (Math.atan2(hueY, hueX) * 180) / Math.PI;
      if (primary < 0) primary += 360;
      let farX = 0;
      let farY = 0;
      let farW = 0;
      for (const sample of samples) {
        const delta = Math.abs(((sample.h - primary + 540) % 360) - 180);
        if (delta < 22 || sample.s < 0.12) continue;
        const weight = sample.w * (delta / 180);
        farX += Math.cos((sample.h * Math.PI) / 180) * weight;
        farY += Math.sin((sample.h * Math.PI) / 180) * weight;
        farW += weight;
      }
      let secondary = (primary + 26) % 360;
      if (farW > 0.15) {
        secondary = (Math.atan2(farY, farX) * 180) / Math.PI;
        if (secondary < 0) secondary += 360;
      }
      const sat = clamp(meanSat, 0.34, 0.72);
      resolve({
        base: grade(primary, clamp(sat * 0.55, 0.22, 0.46), 0.08),
        a: grade(primary, clamp(sat * 1.05, 0.58, 0.78), 0.56),
        b: grade(secondary, clamp(sat * 0.92, 0.42, 0.68), 0.46),
        c: grade((primary + 38) % 360, 0.58, 0.6),
      });
    };
    image.onerror = () => resolve(QUIET_ATMOSPHERE);
    image.src = url;
  });
}

export function WorkshopStudio({
  onClose,
  bootstrapUrl = null,
  exampleFixture = false,
  forceSpatialError = false,
  beforePurchase = null,
}: {
  onClose: () => void;
  bootstrapUrl?: string | null;
  exampleFixture?: boolean;
  forceSpatialError?: boolean;
  beforePurchase?: ((input: {
    example: boolean;
    file: File | null;
    source: CustomSource | null;
    composition: CustomComposition;
    priceReady: boolean;
    price: number | null;
  }) => Promise<{ handled: true; notice?: string | null } | { handled: false }>) | null;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const { openCart, refreshCart } = useCart();
  const quality = usePdpQualityTier();
  const {
    source,
    composition,
    previewUrl,
    loadSourceFromUrl,
    setOrientation,
    setZoom,
    panByPointer,
    reset,
  } = useCustomComposition();
  const [step, setStep] = useState<Step>('edit');
  const [spatialFailed, setSpatialFailed] = useState(false);
  const [spatialReadyFor, setSpatialReadyFor] = useState<string | null>(null);
  const [spatialAttempt, setSpatialAttempt] = useState(0);
  const [blockSpatial, setBlockSpatial] = useState(forceSpatialError);
  const [studioReady, setStudioReady] = useState(() => (
    typeof window !== 'undefined' && Boolean((window as Window & { __wsStudioReady?: boolean }).__wsStudioReady)
  ));
  const [pinnedPreview, setPinnedPreview] = useState<string | null>(null);
  const [stageReady, setStageReady] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [clipGuide, setClipGuide] = useState(true);
  const [dragHint, setDragHint] = useState(true);
  const [price, setPrice] = useState<number | null>(null);
  const [priceState, setPriceState] = useState<'loading' | 'ready' | 'unavailable'>('loading');
  const [notice, setNotice] = useState<string | null>(null);
  const [example, setExample] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paused, setPaused] = useState(() => document.hidden);
  const [atmosphere, setAtmosphere] = useState<Atmosphere>(QUIET_ATMOSPHERE);
  const fileRef = useRef<HTMLInputElement>(null);
  const customerFileRef = useRef<File | null>(null);
  const submitGateRef = useRef({});
  const roomRef = useRef<HTMLButtonElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const presentRef = useRef<HTMLDivElement>(null);
  const photoRef = useRef<HTMLImageElement>(null);
  const orientRaf = useRef(0);
  const orientJob = useRef<{
    fromW: number;
    fromH: number;
    photoW: number;
    photoH: number;
    photoCx: number;
    photoCy: number;
  } | null>(null);
  const orientVisualRef = useRef<{
    presentW: number;
    presentH: number;
    stageW: number | null;
    photoW: number;
    photoH: number;
    transform: string;
  } | null>(null);
  const [orientEpoch, setOrientEpoch] = useState(0);
  const urlRef = useRef<string | null>(null);
  const compositionRef = useRef(composition);
  compositionRef.current = composition;
  const stepRef = useRef(step);
  stepRef.current = step;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const initialTheme = useState(() => readWorkshopThemeMode())[0];
  const [themeMode, setThemeMode] = useState<WorkshopThemeMode>(initialTheme);
  const [themeResolved, setThemeResolved] = useState<'light' | 'dark'>(() => resolveWorkshopTheme(initialTheme));
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{ id: number; x: number; y: number } | null>(null);
  const pinchRef = useRef<{
    distance: number;
    zoom: number;
    offsetX: number;
    offsetY: number;
    midX: number;
    midY: number;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [near, setNear] = useState(false);
  const [sizeNote, setSizeNote] = useState<string | null>(null);
  const sizeNoteTimer = useRef(0);
  const [canvasActive, setCanvasActive] = useState(false);
  const [zoomEditing, setZoomEditing] = useState(false);
  const [zoomDraft, setZoomDraft] = useState('');
  const canvasActiveRef = useRef(false);
  const zoomInputRef = useRef<HTMLInputElement>(null);
  const zoomClosedRef = useRef(false);
  canvasActiveRef.current = canvasActive;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchCustomMPrice().then((amount) => {
      if (cancelled) return;
      if (amount === null) {
        setPrice(null);
        setPriceState('unavailable');
        return;
      }
      setPrice(amount);
      setPriceState('ready');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const adoptUrl = (url: string) => {
    if (urlRef.current && urlRef.current !== url) URL.revokeObjectURL(urlRef.current);
    urlRef.current = url;
    setNotice(null);
    void loadSourceFromUrl(url, true);
    void sampleAtmosphere(url).then((next) => {
      if (urlRef.current === url) setAtmosphere(next);
    });
  };

  useEffect(() => {
    if (step === 'edit') return;
    setCanvasActive(false);
    pointersRef.current.clear();
    dragRef.current = null;
    pinchRef.current = null;
    setDragging(false);
  }, [step]);

  useEffect(() => {
    if (!zoomEditing) return undefined;
    zoomClosedRef.current = false;
    zoomInputRef.current?.focus();
    zoomInputRef.current?.select();
    return undefined;
  }, [zoomEditing]);

  useEffect(() => {
    return () => window.clearTimeout(sizeNoteTimer.current);
  }, []);

  const showUnavailableSize = () => {
    setSizeNote('해당 사이즈는 준비 중이에요. 현재는 M 사이즈만 선택할 수 있어요.');
    window.clearTimeout(sizeNoteTimer.current);
    sizeNoteTimer.current = window.setTimeout(() => setSizeNote(null), 4200);
  };

  useEffect(() => {
    if (!bootstrapUrl) return;
    customerFileRef.current = null;
    adoptUrl(bootstrapUrl);
    setExample(exampleFixture);
  }, [bootstrapUrl, exampleFixture]);

  const takeFile = async (file: File) => {
    if (file.size > WORKSHOP_UPLOAD_LIMITS.original) {
      setNotice('사진 크기는 25MB를 초과할 수 없습니다.');
      return;
    }
    const validated = await validateCustomImageFile(file);
    if (validated.ok === false) {
      setNotice(validated.message);
      return;
    }
    customerFileRef.current = file;
    adoptUrl(validated.objectUrl);
    setExample(false);
    setNear(false);
    setDragOver(false);
    setStep('edit');
  };

  const openFile = () => {
    fileRef.current?.click();
  };

  const introOnce = useRef(false);
  const onIntroStart = useCallback(() => {
    introOnce.current = true;
  }, []);
  const retrySpatial = () => {
    setSpatialFailed(false);
    setBlockSpatial(false);
    setSpatialReadyFor(null);
    setSpatialAttempt((value) => value + 1);
  };

  const openSpatial = () => {
    setSpatialFailed(false);
    setStep('spatial');
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    await takeFile(file);
  };

  const onEmptyDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (source) return;
    event.preventDefault();
    setDragOver(true);
  };

  const onEmptyDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setDragOver(false);
  };

  const onEmptyDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (source) return;
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void takeFile(file);
  };

  const onFrameKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (step !== 'edit' || !source || !frameRef.current) return;
    const nudge = event.shiftKey ? 24 : 12;
    const rect = frameRef.current.getBoundingClientRect();
    if (event.key === 'ArrowLeft') panByPointer(-nudge, 0, rect.width, rect.height);
    else if (event.key === 'ArrowRight') panByPointer(nudge, 0, rect.width, rect.height);
    else if (event.key === 'ArrowUp') panByPointer(0, -nudge, rect.width, rect.height);
    else if (event.key === 'ArrowDown') panByPointer(0, nudge, rect.width, rect.height);
    else return;
    event.preventDefault();
  };

  const rememberPinch = (distance: number) => {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) return;
    const current = compositionRef.current;
    pinchRef.current = {
      distance,
      zoom: current.zoom,
      offsetX: current.offsetX,
      offsetY: current.offsetY,
      midX: (points[0].x + points[1].x) / 2,
      midY: (points[0].y + points[1].y) / 2,
    };
  };

  const onFramePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (step !== 'edit' || !source) return;
    if (orientVisualRef.current) {
      clearOrientVisual();
      if (presentRef.current) {
        presentRef.current.style.width = '';
        presentRef.current.style.height = '';
      }
      if (stageRef.current) stageRef.current.style.width = '';
      if (photoRef.current) {
        photoRef.current.style.width = '';
        photoRef.current.style.height = '';
        photoRef.current.style.left = '';
        photoRef.current.style.top = '';
        photoRef.current.style.transform = '';
      }
      setOrientEpoch((value) => value + 1);
    }
    if ((event.target as HTMLElement).closest('[data-handle]')) return;
    setCanvasActive(true);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* A pointer can end before capture. The pointer map still clears on pointerup. */
    }
    if (pointersRef.current.size >= 2) {
      dragRef.current = null;
      const points = [...pointersRef.current.values()];
      rememberPinch(Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)));
      return;
    }
    dragRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    setDragging(true);
  };

  const onFramePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(event.pointerId) || !frameRef.current) return;
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const rect = frameRef.current.getBoundingClientRect();
    if (pointersRef.current.size >= 2 && pinchRef.current && source) {
      const pinch = pinchRef.current;
      const points = [...pointersRef.current.values()];
      const distance = Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y));
      const midX = (points[0].x + points[1].x) / 2;
      const midY = (points[0].y + points[1].y) / 2;
      const floor = minZoom(source, compositionRef.current.orientation);
      const raw = pinch.zoom * (distance / pinch.distance);
      const nextZoom = Math.min(MAX_ZOOM, Math.max(floor, raw));
      const ratio = pinch.zoom > 0 ? nextZoom / pinch.zoom : 1;
      const lastMidX = (pinch.midX - rect.left) / rect.width;
      const lastMidY = (pinch.midY - rect.top) / rect.height;
      const midFx = (midX - rect.left) / rect.width;
      const midFy = (midY - rect.top) / rect.height;
      const nextCx = midFx - (lastMidX - (0.5 + pinch.offsetX)) * ratio;
      const nextCy = midFy - (lastMidY - (0.5 + pinch.offsetY)) * ratio;
      setZoom(nextZoom);
      panByPointer((nextCx - (0.5 + pinch.offsetX)) * rect.width, (nextCy - (0.5 + pinch.offsetY)) * rect.height, rect.width, rect.height);
      pinchRef.current = {
        distance,
        zoom: nextZoom,
        offsetX: nextCx - 0.5,
        offsetY: nextCy - 0.5,
        midX,
        midY,
      };
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    panByPointer(dx, dy, rect.width, rect.height);
  };

  const endFramePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(event.pointerId);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (pointersRef.current.size === 1) {
      pinchRef.current = null;
      const [id, point] = [...pointersRef.current.entries()][0];
      dragRef.current = { id, x: point.x, y: point.y };
      setDragging(true);
      return;
    }
    pinchRef.current = null;
    if (dragRef.current?.id === event.pointerId) dragRef.current = null;
    if (pointersRef.current.size === 0) setDragging(false);
  };

  const onHandlePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (step !== 'edit' || !source || !frameRef.current) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = frameRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const distance = Math.max(12, Math.hypot(event.clientX - cx, event.clientY - cy));
    event.currentTarget.dataset.zoom = String(compositionRef.current.zoom);
    event.currentTarget.dataset.distance = String(distance);
    setDragging(true);
  };

  const onHandlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId) || !frameRef.current) return;
    const rect = frameRef.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const distance = Math.max(12, Math.hypot(event.clientX - cx, event.clientY - cy));
    const startZoom = Number(event.currentTarget.dataset.zoom);
    const startDistance = Number(event.currentTarget.dataset.distance);
    if (!startDistance) return;
    setZoom(startZoom * (distance / startDistance));
  };

  const onHandlePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDragging(false);
  };

  const layout = source ? imageCssLayout(source, composition) : null;
  const aspect = frameAspect(composition.orientation);
  const placement = safeAreaInsetFractions(composition.orientation);
  const showGuide = step === 'edit';
  const sliderMin = source ? minZoom(source, composition.orientation) : 1;
  const editing = step === 'edit' && Boolean(source);
  const spatialProduct: Product | null = previewUrl
    ? {
        id: 'workshop-concept',
        title: '커스텀 작품',
        artist: 'METALORA',
        image: previewUrl,
        front_image: previewUrl,
        landscape_image: previewUrl,
        description: '',
        limited: true,
      }
    : null;
  const panelWidth = M_WORLD_WIDTH;
  const panelHeight = M_WORLD_HEIGHT;
  const spatialMounted = Boolean(previewUrl)
    && pinnedPreview === previewUrl
    && stageReady
    && studioReady
    && !spatialFailed
    && quality.recommendMount;
  const spatialKey = previewUrl ?? '';
  const spatialShown = step === 'spatial'
    && spatialMounted
    && !blockSpatial
    && spatialReadyFor === spatialKey;
  const spatialPhase: 'idle' | 'loading' | 'ready' | 'error' = step !== 'spatial'
    ? 'idle'
    : spatialFailed || blockSpatial
      ? 'error'
      : spatialShown
        ? 'ready'
        : 'loading';

  useEffect(() => {
    if (studioReady) return undefined;
    const markReady = () => setStudioReady(true);
    window.addEventListener('ws-studio-ready', markReady);
    return () => window.removeEventListener('ws-studio-ready', markReady);
  }, [studioReady]);

  useEffect(() => {
    if (!spatialMounted) return;
    const host = window as Window & { __wsMarks?: { mountAt?: number; mountKey?: string } };
    const marks = host.__wsMarks ?? {};
    marks.mountAt = Math.round(performance.now());
    marks.mountKey = spatialKey;
    host.__wsMarks = marks;
  }, [spatialMounted, spatialKey]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return undefined;
    const update = () => {
      const rect = node.getBoundingClientRect();
      const next = rect.width >= 280 && rect.height >= 320;
      setStageReady((current) => (current === next ? current : next));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (pinnedPreview && pinnedPreview !== previewUrl) {
      setPinnedPreview(null);
      setSpatialReadyFor(null);
    }
  }, [pinnedPreview, previewUrl]);

  useEffect(() => {
    if (!previewUrl || !stageReady || spatialFailed || !quality.recommendMount) return;
    setPinnedPreview((current) => (current === previewUrl ? current : previewUrl));
  }, [previewUrl, stageReady, spatialFailed, quality.recommendMount]);

  useEffect(() => {
    if (!spatialShown || step !== 'spatial') return;
    const host = window as Window & { __wsMarks?: Record<string, number | string | undefined> };
    const marks = host.__wsMarks ?? {};
    marks.shownAt = Math.round(performance.now());
    host.__wsMarks = marks;
  }, [spatialKey, spatialShown, step]);

  useEffect(() => {
    if (step === 'edit') return;
    clearOrientVisual();
    setOrientEpoch((value) => value + 1);
  }, [step]);

  const clearOrientVisual = () => {
    if (orientRaf.current) cancelAnimationFrame(orientRaf.current);
    orientRaf.current = 0;
    orientJob.current = null;
    orientVisualRef.current = null;
  };

  useEffect(() => {
    setThemeResolved(resolveWorkshopTheme(themeMode));
    localStorage.setItem(WORKSHOP_THEME_KEY, themeMode);
    if (themeMode !== 'system') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setThemeResolved(media.matches ? 'dark' : 'light');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [themeMode]);

  useLayoutEffect(() => {
    const job = orientJob.current;
    const present = presentRef.current;
    const photo = photoRef.current;
    const stage = stageRef.current;
    if (!job || !present || !photo || !stage || job.fromW < 2 || job.photoW < 2) return;
    const continuing = Boolean(orientVisualRef.current);
    const live = present.getBoundingClientRect();
    const fromW = continuing ? live.width : job.fromW;
    const fromH = continuing ? live.height : job.fromH;
    photo.style.width = '';
    photo.style.height = '';
    photo.style.left = '';
    photo.style.top = '';
    photo.style.transform = '';
    present.style.width = '';
    present.style.height = '';
    stage.style.width = '';
    const to = present.getBoundingClientRect();
    const photoBox = photo.getBoundingClientRect();
    const photoTo = {
      w: photoBox.width,
      h: photoBox.height,
      cx: photoBox.left - to.left + photoBox.width / 2,
      cy: photoBox.top - to.top + photoBox.height / 2,
    };
    const aspect = job.photoW / Math.max(job.photoH, 1);
    const desktop = window.innerWidth >= 760;
    const started = performance.now();
    const apply = (amount: number) => {
      const ease = amount < 0.5 ? 2 * amount * amount : 1 - ((-2 * amount + 2) ** 2) / 2;
      const presentW = fromW + (to.width - fromW) * ease;
      const presentH = fromH + (to.height - fromH) * ease;
      let scale = (job.photoW + (photoTo.w - job.photoW) * ease) / job.photoW;
      let visualW = job.photoW * scale;
      let visualH = visualW / aspect;
      if (visualW < presentW || visualH < presentH) {
        const cover = Math.max(presentW / visualW, presentH / visualH);
        scale *= cover;
        visualW *= cover;
        visualH *= cover;
      }
      const fx = (continuing ? live.width / 2 : job.photoCx) / fromW + (photoTo.cx / to.width - job.photoCx / job.fromW) * ease;
      const fy = (continuing ? live.height / 2 : job.photoCy) / fromH + (photoTo.cy / to.height - job.photoCy / job.fromH) * ease;
      const visual = {
        presentW,
        presentH,
        stageW: desktop ? presentW : null,
        photoW: job.photoW,
        photoH: job.photoH,
        transform: `translate3d(${fx * presentW - visualW / 2}px, ${fy * presentH - visualH / 2}px, 0) scale(${scale})`,
      };
      orientVisualRef.current = visual;
      present.style.width = `${presentW}px`;
      present.style.height = `${presentH}px`;
      stage.style.width = desktop ? `${presentW}px` : '';
      photo.style.width = `${job.photoW}px`;
      photo.style.height = `${job.photoH}px`;
      photo.style.left = '0px';
      photo.style.top = '0px';
      photo.style.transformOrigin = '0 0';
      photo.style.transform = visual.transform;
    };
    apply(0);
    let elapsed = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      elapsed += Math.min(34, now - previous);
      previous = now;
      const amount = Math.min(1, elapsed / ORIENT_MS);
      apply(amount);
      if (amount < 1) {
        orientRaf.current = window.requestAnimationFrame(tick);
        return;
      }
      clearOrientVisual();
      present.style.width = '';
      present.style.height = '';
      stage.style.width = '';
      photo.style.width = '';
      photo.style.height = '';
      photo.style.left = '';
      photo.style.top = '';
      photo.style.transform = '';
      setOrientEpoch((value) => value + 1);
    };
    orientRaf.current = window.requestAnimationFrame(tick);
    return () => {
      if (orientRaf.current) cancelAnimationFrame(orientRaf.current);
      orientRaf.current = 0;
    };
  }, [composition.orientation]);

  const changeOrientation = (next: 'portrait' | 'landscape') => {
    if (compositionRef.current.orientation === next) return;
    const present = presentRef.current;
    const photo = photoRef.current;
    if (reducedMotion || !present || !photo || step !== 'edit') {
      clearOrientVisual();
      setOrientation(next);
      return;
    }
    if (orientRaf.current) cancelAnimationFrame(orientRaf.current);
    const from = present.getBoundingClientRect();
    const photoBox = photo.getBoundingClientRect();
    orientJob.current = {
      fromW: from.width,
      fromH: from.height,
      photoW: photoBox.width,
      photoH: photoBox.height,
      photoCx: photoBox.left - from.left + photoBox.width / 2,
      photoCy: photoBox.top - from.top + photoBox.height / 2,
    };
    setOrientation(next);
  };

  const zoomed = Boolean(source) && composition.zoom > sliderMin + 0.04;
  const priceLabel = priceState === 'ready' && price !== null
    ? formatCustomMPrice(price)
    : priceState === 'unavailable'
      ? PRICE_UNAVAILABLE_MESSAGE
      : '확인 중';
  const zoomPercent = Math.round(composition.zoom * 100);
  const purchase = async () => {
    if (submitting) return;
    setNotice(null);
    setSubmitting(true);
    try {
      if (beforePurchase) {
        const review = await beforePurchase({
          example,
          file: customerFileRef.current,
          source,
          composition: compositionRef.current,
          priceReady: priceState === 'ready' && price !== null,
          price,
        });
        if (review.handled) {
          if (review.notice) setNotice(review.notice);
          return;
        }
      }

      const saved = await submitCustomArtworkToCart({
        example,
        file: customerFileRef.current,
        source,
        composition: compositionRef.current,
        priceReady: priceState === 'ready' && price !== null,
        gate: submitGateRef.current,
        getAccessToken: async () => {
          const { data } = await supabase.auth.getSession();
          return data.session?.access_token ?? null;
        },
        media: {
          fetch: (input, init) => fetch(input, init),
          getAccessToken: async () => {
            const { data } = await supabase.auth.getSession();
            return data.session?.access_token ?? null;
          },
        },
        normalizeRef: normalizeWorkshopMediaRef,
        refreshCart,
        addLine: async ({ orientation, originalRef, previewRef, config }) => {
          const { data, error } = await supabase.rpc('add_custom_cart_item', {
            p_quantity: 1,
            p_orientation: orientation,
            p_original_image_url: originalRef,
            p_preview_image_url: previewRef,
            p_custom_config: config,
          });
          if (error) return null;
          const row = (Array.isArray(data) ? data[0] : data) as {
            id?: string;
            custom_image?: string | null;
            custom_config?: Record<string, unknown> | null;
          } | null;
          return row?.id ? row : null;
        },
      });
      if (saved.ok === false) {
        setNotice(saved.message);
        return;
      }
      onClose();
      openCart();
    } finally {
      setSubmitting(false);
    }
  };
  const finishZoomEdit = (commit: boolean) => {
    if (zoomClosedRef.current) return;
    zoomClosedRef.current = true;
    if (commit) {
      const parsed = Number(zoomDraft.trim().replace('%', '').replace(',', '.'));
      const zoomValue = parsed / 100;
      if (!Number.isFinite(parsed)) {
        setNotice('확대는 숫자로 입력해 주세요.');
      } else if (zoomValue < sliderMin - 0.0001 || zoomValue > MAX_ZOOM + 0.0001) {
        setNotice(`확대는 ${Math.round(sliderMin * 100)}%에서 ${Math.round(MAX_ZOOM * 100)}% 사이입니다.`);
      } else {
        setNotice(null);
        setZoom(zoomValue);
      }
    }
    setZoomEditing(false);
  };

  const orientVisual = orientVisualRef.current;
  void orientEpoch;
  const currentStepId = !source
    ? 'photo'
    : step === 'spatial'
      ? 'spatial'
      : step === 'room'
        ? 'room'
        : step === 'preview'
          ? 'preview'
          : 'edit';
  const stepOrder = ['photo', 'edit', 'spatial', 'room', 'preview'];
  const stepState = (id: string, disabled: boolean) => {
    if (disabled) return 'disabled';
    if (id === currentStepId) return 'current';
    if (stepOrder.indexOf(id) < stepOrder.indexOf(currentStepId)) return 'done';
    return 'next';
  };
  const stepItems = [
    { id: 'photo', label: '사진', text: '사진 업로드 및 변경', icon: <ImagePlus size={18} strokeWidth={1.6} />, onClick: openFile, disabled: false },
    { id: 'edit', label: '편집', text: '사진 크기와 위치 편집', icon: <Pencil size={18} strokeWidth={1.6} />, onClick: () => setStep('edit'), disabled: !source },
    { id: 'spatial', label: '3D', text: '3D로 보기', icon: <Box size={18} strokeWidth={1.6} />, onClick: openSpatial, disabled: !source || !quality.recommendMount },
    { id: 'room', label: '내 공간', text: '내 방에 걸어보기', icon: <ImageIcon size={18} strokeWidth={1.6} />, onClick: () => setStep('room'), disabled: !source },
    { id: 'preview', label: '완료', text: '완성 작품 확인', icon: <Eye size={18} strokeWidth={1.6} />, onClick: () => setStep('preview'), disabled: !source },
  ];
  const renderSteps = (className: string) => (
    <div className={className} role="group" aria-label="작업 단계">
      {stepItems.map((item) => {
        const state = stepState(item.id, item.disabled);
        return (
          <button
            key={item.id}
            ref={item.id === 'room' ? roomRef : undefined}
            type="button"
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
            aria-label={item.text}
            title={item.text}
            disabled={item.disabled}
            onClick={item.onClick}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      className="ws-root"
      data-concept-root
      data-stage={step === 'preview' ? 'preview' : 'edit'}
      data-tool={source ? (step === 'preview' ? 'complete' : step === 'spatial' ? 'spatial' : step === 'room' ? 'room' : 'edit') : 'photo'}
      data-zoomed={zoomed ? 'true' : 'false'}
      data-example={example ? 'true' : 'false'}
      data-empty={source ? 'false' : 'true'}
      data-orient={composition.orientation}
      data-clip={clipGuide ? 'true' : 'false'}
      data-spatial-phase={spatialPhase}
      data-reduced={reducedMotion ? 'true' : 'false'}
      data-paused={paused ? 'true' : 'false'}
      data-theme={themeResolved}
      data-theme-mode={themeMode}
      data-tools={editing && toolsOpen ? 'open' : 'closed'}
      data-dragging={dragging ? 'true' : 'false'}
      data-dragover={dragOver ? 'true' : 'false'}
      data-near={near && !source ? 'true' : 'false'}
      style={{
        ['--concept-base' as string]: atmosphere.base,
        ['--concept-a' as string]: atmosphere.a,
        ['--concept-b' as string]: atmosphere.b,
        ['--concept-c' as string]: atmosphere.c,
        ['--frame-aspect' as string]: String(aspect),
      }}
      onPointerMove={(event) => {
        if (reducedMotion) return;
        const node = event.currentTarget;
        node.style.setProperty('--tilt-x', ((event.clientX / window.innerWidth) * 2 - 1).toFixed(3));
        node.style.setProperty('--tilt-y', ((event.clientY / window.innerHeight) * 2 - 1).toFixed(3));
      }}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest('.ws-frame')) return;
        setCanvasActive(false);
      }}
      onPointerLeave={(event) => {
        event.currentTarget.style.setProperty('--tilt-x', '0');
        event.currentTarget.style.setProperty('--tilt-y', '0');
      }}
    >
      <div className="ws-field" aria-hidden>
        <span />
        <span />
        <span />
      </div>
      <div className="ws-vignette" aria-hidden />
      <div className="ws-gallery" aria-hidden />

      <div className="ws-theme" role="group" aria-label="화면 테마">
        {([
          ['light', '라이트'],
          ['dark', '다크'],
          ['system', '시스템'],
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={themeMode === mode}
            onClick={() => setThemeMode(mode)}
          >
            {label}
          </button>
        ))}
      </div>
      <button type="button" className="ws-close" aria-label="닫기" onClick={onClose}>
        <X size={18} strokeWidth={1.5} />
      </button>

      <div className="ws-shell">
        <div
          className="ws-stage"
          ref={stageRef}
          style={orientVisual?.stageW ? { width: `${orientVisual.stageW}px` } : undefined}
        >
          <div className="ws-pool" aria-hidden />
          {step === 'spatial' && spatialPhase === 'loading' ? (
            <div className="ws-skeleton" role="status" aria-live="polite">
              <span className="ws-skeleton-slab" />
              <p>3D를 준비하고 있습니다.</p>
            </div>
          ) : null}
          {step === 'spatial' && spatialPhase === 'error' ? (
            <div className="ws-spatial-error" role="alert">
              <p>3D 보기를 열지 못했습니다.</p>
              <button type="button" onClick={retrySpatial}>다시 시도</button>
            </div>
          ) : null}
          {step === 'spatial' && spatialMounted && previewUrl && !blockSpatial ? (
            <WorkshopSpatialStage
              previewUrl={previewUrl}
              spatialKey={`${spatialKey}:${spatialAttempt}`}
              orientation={composition.orientation}
              panelWidth={panelWidth}
              panelHeight={panelHeight}
              mode={spatialShown ? 'ready' : 'wait'}
              shown={spatialShown}
              playIntro={!introOnce.current}
              reducedMotion={reducedMotion}
              onIntroStart={onIntroStart}
              onFirstDrag={() => setDragHint(false)}
              onReady={() => {
                const marks = (window as Window & { __wsMarks?: { readyAt?: number } }).__wsMarks ?? {};
                marks.readyAt = Math.round(performance.now());
                (window as Window & { __wsMarks?: { readyAt?: number } }).__wsMarks = marks;
                setSpatialReadyFor(spatialKey);
              }}
              onFailed={() => setSpatialFailed(true)}
            />
          ) : null}
          <div
            className="ws-present"
            ref={presentRef}
            key={source?.url ?? 'empty'}
            hidden={step === 'spatial'}
            style={orientVisual ? { width: `${orientVisual.presentW}px`, height: `${orientVisual.presentH}px` } : undefined}
          >
            <div className="ws-depth" aria-hidden />
            <div
              ref={frameRef}
              className="ws-frame"
              data-active={editing && canvasActive ? 'true' : 'false'}
              tabIndex={editing ? 0 : undefined}
              role={editing ? 'application' : undefined}
              aria-label={editing ? '작품을 끌어 위치를 조정' : undefined}
              onPointerEnter={() => {
                if (!source) setNear(true);
              }}
              onDragEnter={onEmptyDragOver}
              onDragOver={onEmptyDragOver}
              onDragLeave={(event) => {
                onEmptyDragLeave(event);
                const next = event.relatedTarget;
                if (!(next instanceof Node) || !event.currentTarget.contains(next)) setNear(false);
              }}
              onDrop={onEmptyDrop}
              onKeyDown={onFrameKeyDown}
              onPointerDown={onFramePointerDown}
              onPointerMove={onFramePointerMove}
              onPointerUp={endFramePointer}
              onPointerCancel={endFramePointer}
              onPointerLeave={(event) => {
                const next = event.relatedTarget;
                if (!(next instanceof Node) || !event.currentTarget.contains(next)) setNear(false);
              }}
            >
              {step === 'preview' && previewUrl ? (
                <img
                  className="ws-photo ws-final"
                  src={previewUrl}
                  alt={example ? '예시 작품의 최종 인쇄면' : '최종 인쇄면'}
                  draggable={false}
                />
              ) : source && layout ? (
                <img
                  ref={photoRef}
                  className="ws-photo"
                  src={source.url}
                  alt={example ? '예시 이미지' : step === 'preview' ? '제품 미리보기' : '편집 중인 이미지'}
                  draggable={false}
                  style={orientVisual ? {
                    width: `${orientVisual.photoW}px`,
                    height: `${orientVisual.photoH}px`,
                    left: 0,
                    top: 0,
                    transform: orientVisual.transform,
                    transformOrigin: '0 0',
                  } : {
                    width: `${layout.widthPercent}%`,
                    height: `${layout.heightPercent}%`,
                    left: `${layout.leftPercent}%`,
                    top: `${layout.topPercent}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              ) : (
                <button type="button" className="ws-upload" onClick={openFile}>
                  <ImagePlus size={20} strokeWidth={1.6} />
                  <span>사진 업로드</span>
                </button>
              )}
              {showGuide ? <div className="ws-bound" aria-hidden /> : null}
              {showGuide && clipGuide ? (
                <div
                  className="ws-guide"
                  aria-hidden
                  style={{
                    left: `${placement.x * 100}%`,
                    right: `${placement.x * 100}%`,
                    top: `${placement.y * 100}%`,
                    bottom: `${placement.y * 100}%`,
                  }}
                >
                  <i /><i /><i /><i />
                </div>
              ) : null}
              {source ? (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                <button
                  key={corner}
                  type="button"
                  data-handle
                  data-corner={corner}
                  className="ws-handle"
                  tabIndex={editing ? 0 : -1}
                  aria-hidden={editing ? undefined : true}
                  aria-label="모서리에서 확대 또는 축소"
                  onPointerDown={onHandlePointerDown}
                  onPointerMove={onHandlePointerMove}
                  onPointerUp={onHandlePointerUp}
                  onPointerCancel={onHandlePointerUp}
                >
                  <i />
                </button>
              )) : null}
            </div>
            {example && source ? <p className="ws-example">예시</p> : null}
          </div>
          {example && source && spatialShown ? <p className="ws-example ws-example-stage">예시</p> : null}
        </div>

        <aside className="ws-panel" aria-label="맞춤 정보">
          {renderSteps('ws-steps')}
          {!source ? <p className="ws-empty-note">사진을 업로드해 주세요.</p> : null}
          {step === 'preview' && source ? (
            <section className="ws-complete" aria-label="최종 구성">
              <header className="ws-complete-head">
                <h2>나만의 작품이 완성됐어요.</h2>
                <p>선택한 작품의 최종 구성을 확인해 주세요.</p>
              </header>
              <p className="ws-complete-name">커스텀 메탈 작품</p>
              <div className="ws-config" role="group" aria-label="선택한 구성">
                <div>
                  <span>크기</span>
                  <strong>M</strong>
                </div>
                <div>
                  <span>방향</span>
                  <strong>{composition.orientation === 'landscape' ? '가로' : '세로'}</strong>
                </div>
                <div className="ws-config-dims">
                  <span>치수</span>
                  <strong>{composition.orientation === 'landscape' ? '283 × 200 mm' : PRODUCT_SIZE}</strong>
                </div>
              </div>
              <p className="ws-edit-summary">
                <span>확대 {zoomPercent}%</span>
                <span>맞춤 구도 확정</span>
              </p>
              <div className="ws-purchase">
                <p className="ws-price">{priceLabel}</p>
                <button
                  type="button"
                  className="ws-buy ws-buy-primary"
                  disabled={submitting}
                  aria-busy={submitting}
                  onClick={() => { void purchase(); }}
                >
                  장바구니 담기
                </button>
              </div>
            </section>
          ) : null}
          {editing ? (
            <button
                type="button"
                className="ws-tools-toggle"
                aria-expanded={toolsOpen}
                onClick={() => setToolsOpen((open) => !open)}
              >
                <SlidersHorizontal size={18} strokeWidth={1.6} />
                <span>{toolsOpen ? '도구 닫기' : '편집 도구'}</span>
              </button>
          ) : null}
          {editing ? (
          <div className="ws-sheet" data-open={toolsOpen ? 'true' : 'false'}>
            <p className="ws-label">크기</p>
            <div className="ws-sizes" role="group" aria-label="크기">
              {(['S', 'M', 'L', 'XL'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  aria-pressed={size === 'M'}
                  aria-disabled={size === 'M' ? undefined : true}
                  onClick={() => {
                    if (size !== 'M') showUnavailableSize();
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setSizeNote(null);
                  }}
                >
                  {size}
                </button>
              ))}
            </div>
            <p className="ws-size">M · {composition.orientation === 'landscape' ? '283 × 200 mm' : PRODUCT_SIZE}</p>
            {sizeNote ? (
              <p className="ws-size-note" role="status">
                <span>{sizeNote}</span>
                <button
                  type="button"
                  aria-label="안내 닫기"
                  onClick={() => setSizeNote(null)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setSizeNote(null);
                  }}
                >
                  닫기
                </button>
              </p>
            ) : null}
            <p className="ws-label">방향</p>
            <div className="ws-orient" role="group" aria-label="방향">
              <button
                type="button"
                aria-pressed={composition.orientation === 'portrait'}
                disabled={!editing}
                onClick={() => changeOrientation('portrait')}
              >
                <i className="ws-glyph ws-glyph-portrait" aria-hidden />
                세로
              </button>
              <button
                type="button"
                aria-pressed={composition.orientation === 'landscape'}
                disabled={!editing}
                onClick={() => changeOrientation('landscape')}
              >
                <i className="ws-glyph ws-glyph-landscape" aria-hidden />
                가로
              </button>
            </div>
            <button type="button" className="ws-reset" onClick={() => reset()}>
              <RotateCcw size={16} strokeWidth={1.6} aria-hidden />
              리셋
            </button>
            <p className="ws-label">확대</p>
            <div className="ws-zoom" role="group" aria-label="확대">
              <button
                type="button"
                aria-label="축소"
                disabled={composition.zoom <= sliderMin + 0.001}
                onClick={() => setZoom(composition.zoom - ZOOM_NUDGE)}
              >
                <Minus size={16} strokeWidth={1.6} />
              </button>
              <input
                type="range"
                min={sliderMin}
                max={MAX_ZOOM}
                step={0.01}
                value={composition.zoom}
                aria-label="확대 / 축소"
                aria-valuetext={`${Math.round(composition.zoom * 100)}%`}
                onChange={(event) => setZoom(Number(event.target.value))}
              />
              <button
                type="button"
                aria-label="확대"
                disabled={composition.zoom >= MAX_ZOOM - 0.001}
                onClick={() => setZoom(composition.zoom + ZOOM_NUDGE)}
              >
                <Plus size={16} strokeWidth={1.6} />
              </button>
              {zoomEditing ? (
                <input
                  ref={zoomInputRef}
                  className="ws-zoom-readout"
                  type="text"
                  inputMode="decimal"
                  aria-label="확대 비율"
                  value={zoomDraft}
                  onChange={(event) => setZoomDraft(event.target.value)}
                  onBlur={() => finishZoomEdit(true)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      finishZoomEdit(true);
                    } else if (event.key === 'Escape') {
                      event.preventDefault();
                      finishZoomEdit(false);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="ws-zoom-readout"
                  aria-label={`확대 비율 ${zoomPercent}%. 눌러서 숫자로 입력`}
                  onClick={() => {
                    zoomClosedRef.current = false;
                    setZoomDraft(String(zoomPercent));
                    setZoomEditing(true);
                  }}
                >
                  {zoomPercent}%
                </button>
              )}
            </div>
            <div className="ws-caution" role="note">
              <TriangleAlert size={18} strokeWidth={1.8} aria-hidden />
              <div className="ws-caution-copy">
                <p className="ws-caution-title">가장자리 잘림 주의</p>
                <p>가장자리의 이미지나 글자는 제작 과정에서 잘릴 수 있으니 안쪽에 배치해 주세요.</p>
              </div>
            </div>
            <div className="ws-clip-control">
              <button
                type="button"
                className="ws-clip-toggle"
                role="switch"
                aria-checked={clipGuide}
                onClick={() => setClipGuide((open) => !open)}
              >
                <span>잘림 영역 보기</span>
                <i data-on={clipGuide ? 'true' : 'false'} aria-hidden />
              </button>
              <p className="ws-clip-note">
                노란색으로 잘림 가능 영역을 표시합니다. 안쪽 선은 약 {SAFE_AREA_MM}mm 배치 참고이며, 확정된 재단선이 아닙니다.
              </p>
            </div>
          </div>
          ) : null}
          {step === 'spatial' && source ? (
            <p className="ws-instruct">
              {spatialPhase === 'error'
                ? '3D 보기를 열지 못했습니다. 다시 시도해 주세요.'
                : spatialPhase === 'ready' && dragHint
                  ? '드래그하여 돌려 보세요.'
                  : spatialPhase === 'loading'
                    ? '3D를 준비하고 있습니다.'
                    : ''}
            </p>
          ) : null}
          {step === 'room' && source ? (
            <p className="ws-instruct">
              {previewUrl ? '내 방에 걸어보기가 열려 있습니다.' : '내 공간을 준비하고 있습니다.'}
            </p>
          ) : null}
        </aside>

        {renderSteps('ws-mobile-dock')}
      </div>

      {step === 'room' && spatialProduct ? (
        <ProductTheatreRoomPreview
          product={spatialProduct}
          orientation={composition.orientation}
          optionName={CATALOG_M_NAME}
          optionDimension={CATALOG_M_DIMENSION}
          returnFocusRef={roomRef}
          imageReferrerPolicy="no-referrer"
          onClose={() => {
            document.body.style.overflow = 'hidden';
            setStep('edit');
          }}
        />
      ) : null}

      {notice ? <p className="ws-notice" role="alert">{notice}</p> : null}
      <input ref={fileRef} type="file" accept={SUPPORTED_IMAGE_ACCEPT} className="sr-only" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }} onChange={onFile} />
    </div>
  );
}
