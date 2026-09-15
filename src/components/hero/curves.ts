/** Smooth Hermite edge0→edge1 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Channel active in [start,end] with smooth ramp */
export function channelRange(p: number, start: number, end: number): number {
  return smoothstep(start, end, p);
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Interpolate authored anchor values with smooth transitions between keyframes */
export function interpolateAnchors(p: number, anchors: readonly number[], values: readonly number[]): number {
  const t = clamp01(p);
  if (t <= anchors[0]) return values[0];
  const last = anchors.length - 1;
  if (t >= anchors[last]) return values[last];

  for (let i = 0; i < last; i++) {
    if (t >= anchors[i] && t <= anchors[i + 1]) {
      const local = smoothstep(anchors[i], anchors[i + 1], t);
      return values[i] + (values[i + 1] - values[i]) * local;
    }
  }

  return values[last];
}
