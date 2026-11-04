import type { RGB } from './types.ts';

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function fract(v: number): number {
  return v - Math.floor(v);
}

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [0, 0, 0];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

export function rgbToHex([r, g, b]: RGB): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** h, s, v in 0..1 → RGB 0..255 */
export function hsv(h: number, s: number, v: number): RGB {
  h = fract(h) * 6;
  const i = Math.floor(h);
  const f = h - i;
  const p = v * (1 - s);
  const q = v * (1 - s * f);
  const t = v * (1 - s * (1 - f));
  let r: number, g: number, b: number;
  switch (i) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q; break;
  }
  return [r * 255, g * 255, b * 255];
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scale(c: RGB, k: number): RGB {
  return [c[0] * k, c[1] * k, c[2] * k];
}

/** Sample a looping palette at position t (0..1). */
export function palette(colors: RGB[], t: number, loop = true): RGB {
  if (colors.length === 0) return [0, 0, 0];
  if (colors.length === 1) return colors[0];
  if (loop) {
    const p = fract(t) * colors.length;
    const i = Math.floor(p);
    return mix(colors[i], colors[(i + 1) % colors.length], smooth(p - i));
  }
  const p = clamp01(t) * (colors.length - 1);
  const i = Math.min(Math.floor(p), colors.length - 2);
  return mix(colors[i], colors[i + 1], smooth(p - i));
}

export function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
