// Dock genie mesh, adapted from Raphael Salaja's MIT port of the macOS 27.0.1
// Dock (FUN_100071d38 / FUN_1000726dc), published in @web-kits/springboard.
//
// Copyright (c) 2026 Raphael Salaja
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

export type Edge = 'top' | 'bottom' | 'left' | 'right';

export type Rect = { x: number; y: number; width: number; height: number };

export type Mesh = {
  columns: number;
  rows: number;
  /** Four floats per vertex, row by row: local x, local y, screen x, screen y. */
  points: Float32Array;
};

const f = Math.fround;
const PI = Math.PI;
const CAPACITY = 1200;
const TOLERANCE = 0.6;
const MAX_CALLS = 64;

const ease = (cosine: number) => cosine * -0.5 + 0.5;

type Counter = { calls: number };

function subdivide(
  buffer: Float32Array,
  offset: number,
  a: number,
  b: number,
  start: number,
  left: number,
  right: number,
  span: number,
  counter: Counter,
): number {
  const divisor = span;
  const atB = ease(Math.cos(((b - start) * PI) / divisor));
  counter.calls += 1;
  if (counter.calls > MAX_CALLS) return 0;

  const rightB = f(right * atB);
  const leftB = f(left * atB);
  let written = 0;
  let from = a;
  let at = offset;

  for (;;) {
    const length = Math.abs(b - from);
    if (length < 8) return written;
    const mid = (b + from) * 0.5;
    const atFrom = Math.cos(((from - start) * PI) / divisor);
    const atMid = ease(Math.cos(((mid - start) * PI) / divisor));
    const leftMid = f(left * atMid);
    const rightMid = f(right * atMid);

    if (length < 128) {
      const eased = ease(atFrom);
      const leftFrom = f(left * eased);
      const leftChord = Math.abs(f(leftB + leftFrom) * 0.5 - leftMid);
      if (leftChord < TOLERANCE) {
        const rightFrom = f(right * eased);
        const rightChord = Math.abs(f(rightB + rightFrom) * 0.5 - rightMid);
        if (rightChord < TOLERANCE) return written;
      }
    }

    const count = subdivide(buffer, at, from, mid, start, left, right, span, counter);
    const index = count + at;
    if (index > CAPACITY - 1) return written;
    buffer[index] = mid;
    buffer[index + 1] = leftMid;
    buffer[index + 2] = rightMid;
    if (index > CAPACITY - 4) return written;
    at = index + 3;
    written += count + 3;
    counter.calls += 1;
    from = mid;
    if (counter.calls >= MAX_CALLS + 1) return written;
  }
}

type Axis = {
  far: number;
  length: number;
  near: number;
  iconFar: number;
  left: number;
  right: number;
  overlap: number;
  travel: number;
};

function axis(windowRect: Rect, icon: Rect, edge: Edge): Axis {
  const { x: ax, y: ay, width: aw, height: ah } = windowRect;
  const { x: bx, y: by, width: bw, height: bh } = icon;
  if (edge === 'bottom') {
    const gap = by - (ay + ah);
    const overlap = gap > 0 ? 0 : gap;
    return {
      far: ay,
      length: ah,
      near: by,
      iconFar: by + bh,
      left: bx - ax,
      right: bx + bw - (ax + aw),
      overlap,
      travel: overlap >= 0 ? by - ay : ah,
    };
  }
  if (edge === 'top') {
    const near = by + bh;
    const far = ay + ah;
    const gap = near - ay;
    const overlap = gap < 0 ? 0 : gap;
    return {
      far,
      length: -ah,
      near,
      iconFar: by,
      left: bx - ax,
      right: bx + bw - (ax + aw),
      overlap,
      travel: overlap <= 0 ? near - far : -ah,
    };
  }
  if (edge === 'right') {
    const gap = bx - (ax + aw);
    const overlap = gap > 0 ? 0 : gap;
    return {
      far: ax,
      length: aw,
      near: bx,
      iconFar: bx + bw,
      left: by - ay,
      right: by + bh - (ay + ah),
      overlap,
      travel: overlap >= 0 ? bx - ax : aw,
    };
  }
  const near = bx + bw;
  const far = ax + aw;
  const gap = near - ax;
  const overlap = gap < 0 ? 0 : gap;
  return {
    far,
    length: -aw,
    near,
    iconFar: bx,
    left: by - ay,
    right: by + bh - (ay + ah),
    overlap,
    travel: overlap <= 0 ? near - far : -aw,
  };
}

function timing(progress: number, a: Axis) {
  const sides = (Math.abs(a.left) + Math.abs(a.right)) * 0.125;
  const squeeze = Math.abs(a.overlap + a.overlap);
  const bend = Math.abs(squeeze > sides ? squeeze : sides) * 0.5 + 1;
  const bendLength = Math.trunc(Math.log(bend)) * 50;
  const distance = Math.abs(a.travel);
  const slideLength = Math.trunc(Math.log(distance * 0.5 + 1)) * 50;
  const gap = Math.abs(a.travel - a.length);
  const ratio = distance === 0 || slideLength === 0 ? 1 : (slideLength * gap) / distance / slideLength;
  const reach = slideLength * (Math.acos(Math.min(1, Math.max(-1, ratio * -2 + 1))) / PI);
  const narrow = bendLength > reach ? bendLength : reach;
  const lead = bendLength > reach ? bendLength - reach : 0;
  const along = (slideLength + lead) * progress;
  const narrowAt = along > narrow ? narrow : along;
  const narrowed = (along < 0 ? 0 : narrowAt) / (narrow || 1);
  const slid = along - lead;
  const slideAt = slid > slideLength ? slideLength : slid;
  const slidden = slideLength === 0 ? 1 : (slid < 0 ? 0 : slideAt) / slideLength;
  return {
    bent: ease(Math.cos(narrowed * PI)),
    poured: ease(Math.cos(slidden * PI)),
    gap,
  };
}

/** progress 0 is the open window. progress 1 is the window inside the icon. */
export function genieMesh(
  progress: number,
  windowRect: Rect,
  icon: Rect,
  edge: Edge = 'top',
): Mesh | null {
  const a = axis(windowRect, icon, edge);
  const span = Math.trunc(a.travel + 0.5);
  if (span === 0 || !Number.isFinite(span)) return null;
  const { bent, poured, gap } = timing(f(progress), a);
  const left = a.left * bent;
  const right = a.right * bent;
  const moved = a.travel * poured;
  const start = a.far + a.overlap * bent;
  const top = start + moved;
  const bottom = a.length + top;
  const toward = edge === 'bottom' || edge === 'right';
  const clamped = toward
    ? bottom <= a.near ? bottom : a.near
    : bottom >= a.near ? bottom : a.near;
  const neck = poured <= 0 ? bottom : clamped;

  const buffer = new Float32Array(CAPACITY);
  const first = ease(Math.cos(((top - start) * PI) / span));
  buffer[0] = top;
  buffer[1] = left * first;
  buffer[2] = right * first;
  const count = subdivide(buffer, 3, top, neck, start, left, right, span, { calls: 0 });
  const atNeck = ease(Math.cos(((neck - start) * PI) / span));
  buffer[count + 3] = neck;
  buffer[count + 4] = left * atNeck;
  buffer[count + 5] = right * atNeck;
  let floats = count + 6;

  if (Math.abs(moved) > gap) {
    let tail = bottom;
    if (toward) {
      if (tail > a.iconFar) tail = a.iconFar;
    } else if (tail < a.iconFar) tail = a.iconFar;
    buffer[floats] = tail;
    buffer[floats + 1] = left;
    buffer[floats + 2] = right;
    floats += 3;
  }

  return build(buffer, Math.trunc(floats / 3), windowRect, edge);
}

function build(buffer: Float32Array, count: number, windowRect: Rect, edge: Edge): Mesh {
  const { x: ax, y: ay, width: aw, height: ah } = windowRect;
  const vertical = edge === 'bottom' || edge === 'top';
  const reversed = edge === 'top' || edge === 'left';
  const points = new Float32Array(count * 8);
  const firstAt = reversed ? count - 1 : 0;
  const lastAt = reversed ? 0 : count - 1;
  const origin = buffer[firstAt * 3];
  const extent = vertical ? ah : aw;
  const scale = f(extent / (buffer[lastAt * 3] - origin || 1));
  const across = vertical ? aw : ah;
  const breadth = f(across);
  const base = vertical ? ax : ay;

  for (let n = 0; n < count; n += 1) {
    const i = reversed ? count - 1 - n : n;
    const position = buffer[i * 3];
    const local = f((position - origin) * scale);
    const near = f(base + buffer[i * 3 + 1]);
    const far = f(base + across + buffer[i * 3 + 2]);
    if (vertical) {
      points.set([0, local, near, position, breadth, local, far, position], n * 8);
    } else {
      points.set([local, 0, position, near], n * 4);
      points.set([local, breadth, position, far], (count + n) * 4);
    }
  }

  return vertical
    ? { columns: 2, rows: count, points }
    : { columns: count, rows: 2, points };
}
