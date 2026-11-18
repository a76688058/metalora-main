// Projective DOM slices for the Dock genie mesh.
// Quad mapping follows Heckbert's square-to-quad, as used by Raphael Salaja's
// MIT @web-kits/springboard renderer. Copyright (c) 2026 Raphael Salaja.
// The permission notice is in genieDockMesh.ts.

import { genieMesh, type Rect } from './genieDockMesh';
import { liquefyMesh } from './genieLiquid';

const ACCOUNT_ANCHOR = '[data-account-anchor]';

const FADE = 0.04;

function cloneWindow(source: HTMLElement, width: number, height: number) {
  const copy = source.cloneNode(true) as HTMLElement;
  for (const node of [copy, ...copy.querySelectorAll('*')]) {
    node.removeAttribute('id');
    if (node !== copy && (node.tagName === 'STYLE' || node.tagName === 'SCRIPT')) node.remove();
  }
  copy.setAttribute('aria-hidden', 'true');
  copy.inert = true;
  const style = copy.style;
  style.position = 'absolute';
  style.inset = 'auto';
  style.left = '0';
  style.top = '0';
  style.margin = '0';
  style.boxSizing = 'border-box';
  style.width = `${width}px`;
  style.height = `${height}px`;
  style.transform = 'none';
  style.translate = 'none';
  style.scale = 'none';
  style.rotate = 'none';
  style.transition = 'none';
  style.animation = 'none';
  style.opacity = '1';
  style.visibility = 'visible';
  style.pointerEvents = 'none';
  style.boxShadow = 'none';
  return copy;
}

function quadMatrix(q: number[], w: number, h: number) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
  const dx1 = x1 - x2;
  const dx2 = x3 - x2;
  const dx3 = x0 - x1 + x2 - x3;
  const dy1 = y1 - y2;
  const dy2 = y3 - y2;
  const dy3 = y0 - y1 + y2 - y3;
  let g = 0;
  let k = 0;
  if (Math.abs(dx3) > 1e-6 || Math.abs(dy3) > 1e-6) {
    const det = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(det) < 1e-9) return null;
    g = (dx3 * dy2 - dx2 * dy3) / det;
    k = (dx1 * dy3 - dx3 * dy1) / det;
  }
  const a = x1 - x0 + g * x1;
  const b = x3 - x0 + k * x3;
  const d = y1 - y0 + g * y1;
  const e = y3 - y0 + k * y3;
  const values = [
    a / w, d / w, 0, g / w,
    b / h, e / h, 0, k / h,
    0, 0, 1, 0,
    x0, y0, 0, 1,
  ];
  if (values.some((value) => !Number.isFinite(value))) return null;
  return `matrix3d(${values.map((value) => +value.toFixed(8)).join(',')})`;
}

type Slice = { strip: HTMLDivElement; copy: HTMLElement };

function createSlices(layer: HTMLElement, source: HTMLElement, width: number, height: number) {
  const template = cloneWindow(source, width, height);
  const pool: Slice[] = [];
  const take = (index: number) => {
    let item = pool[index];
    if (!item) {
      const strip = document.createElement('div');
      strip.setAttribute('aria-hidden', 'true');
      strip.inert = true;
      strip.style.cssText = 'position:absolute;left:0;top:0;overflow:hidden;transform-origin:0 0;pointer-events:none;backface-visibility:hidden;';
      const copy = template.cloneNode(true) as HTMLElement;
      strip.append(copy);
      layer.append(strip);
      item = { strip, copy };
      pool[index] = item;
    }
    return item;
  };

  return {
    draw(points: Float32Array, columns: number, rows: number) {
      const origin = layer.getBoundingClientRect();
      const at = (column: number, row: number) => (row * columns + column) * 4;
      let used = 0;
      for (let row = 0; row < rows - 1; row += 1) {
        for (let column = 0; column < columns - 1; column += 1) {
          const tl = at(column, row);
          const tr = at(column + 1, row);
          const br = at(column + 1, row + 1);
          const bl = at(column, row + 1);
          const u0 = points[tl];
          const v0 = points[tl + 1];
          const w = points[br] - u0;
          const h = points[br + 1] - v0;
          if (w < 0.01 || h < 0.01) continue;
          const screen = [tl, tr, br, bl].flatMap((index) => [
            points[index + 2] - origin.left,
            points[index + 3] - origin.top,
          ]);
          const matrix = quadMatrix(screen, w, h);
          if (!matrix) continue;
          const travelX = Math.hypot(screen[2] - screen[0], screen[3] - screen[1]);
          const travelY = Math.hypot(screen[6] - screen[0], screen[7] - screen[1]);
          const padX = Math.min(w / 2, (0.8 * w) / Math.max(travelX, 0.5));
          const padY = Math.min(h / 2, (0.9 * h) / Math.max(travelY, 0.5));
          const { strip, copy } = take(used);
          used += 1;
          strip.style.display = 'block';
          strip.style.width = `${w + padX * 2}px`;
          strip.style.height = `${h + padY * 2}px`;
          strip.style.transform = `${matrix} translate(${-padX}px, ${-padY}px)`;
          copy.style.translate = `${padX - u0}px ${padY - v0}px`;
        }
      }
      for (let i = used; i < pool.length; i += 1) pool[i].strip.style.display = 'none';
      return used;
    },
    dispose() {
      for (const item of pool) item.strip.remove();
      pool.length = 0;
    },
  };
}

/** Dock projective renderer. Shell progress 0 is inside the icon, 1 is open. */
export class DockGenieMesh {
  private slices: ReturnType<typeof createSlices> | null = null;
  private sized = { width: 0, height: 0 };
  private iconLayer: HTMLElement | null = null;

  constructor(
    readonly host: HTMLElement,
    readonly anchorSelector = ACCOUNT_ANCHOR,
  ) {}

  destroy() {
    this.slices?.dispose();
    this.slices = null;
    this.sized = { width: 0, height: 0 };
    this.iconLayer?.remove();
    this.iconLayer = null;
    this.host.replaceChildren();
    this.host.style.opacity = '';
  }

  render(visual: HTMLElement, shellProgress: number) {
    const panel = visual.getBoundingClientRect();
    const anchor = document.querySelector(this.anchorSelector);
    if (!(anchor instanceof HTMLElement) || panel.width < 2 || panel.height < 2) return false;
    const dockProgress = 1 - shellProgress;
    if (dockProgress <= 0 || dockProgress >= 1) {
      this.destroy();
      if (visual.parentElement) visual.parentElement.style.visibility = '';
      return true;
    }

    const windowRect: Rect = { x: panel.left, y: panel.top, width: panel.width, height: panel.height };
    const iconBox = anchor.getBoundingClientRect();
    const icon: Rect = { x: iconBox.left, y: iconBox.top, width: iconBox.width, height: iconBox.height };
    const dockMesh = genieMesh(dockProgress, windowRect, icon, 'top');
    if (!dockMesh) return false;
    const mesh = liquefyMesh(dockMesh, dockProgress, windowRect, icon);

    if (!this.slices || Math.abs(this.sized.width - panel.width) > 0.5 || Math.abs(this.sized.height - panel.height) > 0.5) {
      this.slices?.dispose();
      this.slices = createSlices(this.host, visual, panel.width, panel.height);
      this.sized = { width: panel.width, height: panel.height };
    }
    const quads = this.slices.draw(mesh.points, mesh.columns, mesh.rows);
    if (quads < 1) return false;

    const fade = Math.min(1, dockProgress / FADE);
    this.host.style.opacity = String(fade);
    if (visual.parentElement) {
      visual.parentElement.style.visibility = fade < 0.999 ? 'visible' : 'hidden';
    }
    this.placeIcon(anchor);
    return true;
  }

  private placeIcon(anchor: HTMLElement) {
    if (!this.iconLayer) {
      const clone = anchor.cloneNode(true) as HTMLElement;
      clone.removeAttribute('id');
      clone.setAttribute('aria-hidden', 'true');
      clone.inert = true;
      const computed = getComputedStyle(anchor);
      clone.style.position = 'fixed';
      clone.style.margin = '0';
      clone.style.pointerEvents = 'none';
      clone.style.zIndex = 'calc(var(--z-sheet) + 1)';
      clone.style.color = computed.color;
      clone.style.backgroundColor = computed.backgroundColor;
      document.body.append(clone);
      this.iconLayer = clone;
    }
    const box = anchor.getBoundingClientRect();
    const layer = this.iconLayer;
    layer.style.left = `${box.left}px`;
    layer.style.top = `${box.top}px`;
    layer.style.width = `${box.width}px`;
    layer.style.height = `${box.height}px`;
  }
}
