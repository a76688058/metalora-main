// Continuous silhouette for the Dock genie.
// Endpoints stay on the Dock pose, so bend-then-slide and the icon tip are unchanged.
// Each edge is one cubic Bézier. It leaves the far end along the panel, then bends
// into the icon. Rows are samples of that curve, kept within half a pixel of it,
// so adjacent quads do not meet at a corner.
// The strip between the edges is ruled. There is no offset center column.

import type { Mesh, Rect } from './genieDockMesh';

const TOLERANCE = 0.45;
const MAX_ROWS = 28;

type Point = { x: number; y: number };

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  };
}

/** Far point is t = 0. The icon is t = 1. */
function bend(from: Point, to: Point): [Point, Point, Point, Point] {
  return [
    from,
    { x: from.x, y: from.y + (to.y - from.y) * 0.72 },
    { x: to.x, y: to.y + (from.y - to.y) * 0.38 },
    to,
  ];
}

function sagitta(p0: Point, p1: Point, p2: Point, p3: Point, t0: number, t1: number) {
  const a = cubic(p0, p1, p2, p3, t0);
  const b = cubic(p0, p1, p2, p3, t1);
  const mid = cubic(p0, p1, p2, p3, (t0 + t1) * 0.5);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const span = Math.hypot(dx, dy);
  if (span < 1e-4) return Math.hypot(mid.x - a.x, mid.y - a.y);
  return Math.abs((mid.x - a.x) * dy - (mid.y - a.y) * dx) / span;
}

function collect(p0: Point, p1: Point, p2: Point, p3: Point, into: number[]) {
  const visit = (t0: number, t1: number, depth: number) => {
    if (depth < 8 && t1 - t0 > 1 / 64 && sagitta(p0, p1, p2, p3, t0, t1) > TOLERANCE) {
      const mid = (t0 + t1) * 0.5;
      visit(t0, mid, depth + 1);
      into.push(mid);
      visit(mid, t1, depth + 1);
    }
  };
  visit(0, 1, 0);
}

function readRow(points: Float32Array, row: number) {
  const index = row * 8;
  return {
    localY: points[index + 1],
    y: points[index + 3],
    left: points[index + 2],
    right: points[index + 6],
  };
}

/** Dock progress is accepted so the call site stays stable. The curve uses the Dock endpoints. */
export function liquefyMesh(mesh: Mesh, _progress: number, _windowRect: Rect, _icon: Rect): Mesh {
  if (mesh.columns !== 2 || mesh.rows < 2) return mesh;
  const head = readRow(mesh.points, 0);
  const foot = readRow(mesh.points, mesh.rows - 1);
  if (Math.abs(foot.y - head.y) < 1 && Math.abs(foot.left - head.left) < 1) return mesh;

  const left = bend({ x: foot.left, y: foot.y }, { x: head.left, y: head.y });
  const right = bend({ x: foot.right, y: foot.y }, { x: head.right, y: head.y });
  const marks = [0, 1];
  collect(left[0], left[1], left[2], left[3], marks);
  collect(right[0], right[1], right[2], right[3], marks);
  marks.sort((a, b) => a - b);
  const times: number[] = [];
  for (const time of marks) {
    if (times.length === 0 || time - times[times.length - 1] > 1e-3) times.push(time);
  }
  while (times.length > MAX_ROWS) {
    let widest = 1;
    let span = 0;
    for (let index = 1; index < times.length - 1; index += 1) {
      const gap = times[index + 1] - times[index - 1];
      if (gap > span) {
        span = gap;
        widest = index;
      }
    }
    times.splice(widest, 1);
  }

  const breadth = mesh.points[4];
  const points = new Float32Array(times.length * 8);
  for (let index = 0; index < times.length; index += 1) {
    const time = times[times.length - 1 - index];
    const edgeL = cubic(left[0], left[1], left[2], left[3], time);
    const edgeR = cubic(right[0], right[1], right[2], right[3], time);
    const localY = foot.localY + (head.localY - foot.localY) * time;
    let lx = edgeL.x;
    let rx = edgeR.x;
    if (rx < lx + 1) {
      const center = (lx + rx) * 0.5;
      lx = center - 0.5;
      rx = center + 0.5;
    }
    points.set([0, localY, lx, edgeL.y, breadth, localY, rx, edgeL.y], index * 8);
  }

  return { columns: 2, rows: times.length, points };
}
