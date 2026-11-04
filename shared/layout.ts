// Spatial layout of every LED in a virtual "PC case" scene.
// Both the effect engine (server) and the stage preview (web) use this, so the
// animation you see in the UI is computed over the same geometry as the hardware.

import type { ZoneRuntime, ZoneSettings } from './types.ts';

/** Scene size in layout units (4:3). */
export const SCENE_W = 100;
export const SCENE_H = 75;

export interface LedPoint {
  /** Scene coordinates in layout units. */
  x: number;
  y: number;
  /** Normalised 0..1 position across the whole scene. */
  nx: number;
  ny: number;
  /** 0..1 position along the zone (LED index / count). */
  u: number;
  /** 0..1 position along this LED's local loop (one fan ring, or the whole strip/stick). */
  lu: number;
  /** Which fan / segment of the zone the LED belongs to. */
  group: number;
}

export type Shape =
  | { type: 'fan'; cx: number; cy: number; r: number }
  | { type: 'stick'; x: number; y: number; w: number; h: number }
  | { type: 'strip'; x1: number; y1: number; x2: number; y2: number };

export interface ZoneLayout {
  zoneId: string;
  points: LedPoint[];
  shapes: Shape[];
  /** Bounding box used for hit-testing in the UI. */
  bounds: { x: number; y: number; w: number; h: number };
}

/** Static scene furniture drawn by the UI (not lit). */
export const SCENE = {
  case: { x: 3, y: 3, w: 94, h: 69 },
  board: { x: 34, y: 14, w: 52, h: 52 },
  cpu: { x: 50, y: 24, w: 11, h: 11 },
  gpu: { x: 36, y: 46, w: 46, h: 7 },
};

function pt(x: number, y: number, u: number, lu: number, group: number): LedPoint {
  return { x, y, nx: x / SCENE_W, ny: y / SCENE_H, u, lu, group };
}

function fanColumn(
  zoneId: string,
  count: number,
  fans: number,
  area: { x: number; y: number; w: number; h: number },
  vertical: boolean,
): ZoneLayout {
  const points: LedPoint[] = [];
  const shapes: Shape[] = [];
  if (fans <= 0) {
    // Plain strip along the long axis of the area.
    const x1 = vertical ? area.x + area.w / 2 : area.x;
    const y1 = vertical ? area.y : area.y + area.h / 2;
    const x2 = vertical ? x1 : area.x + area.w;
    const y2 = vertical ? area.y + area.h : y1;
    shapes.push({ type: 'strip', x1, y1, x2, y2 });
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      points.push(pt(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, i / count, i / count, 0));
    }
    return { zoneId, points, shapes, bounds: area };
  }

  const span = vertical ? area.h : area.w;
  const cross = vertical ? area.w : area.h;
  const slot = span / fans;
  const r = Math.min(cross / 2, slot / 2) * 0.86;
  const perFan = Math.ceil(count / fans);
  for (let f = 0; f < fans; f++) {
    const cx = vertical ? area.x + area.w / 2 : area.x + slot * (f + 0.5);
    const cy = vertical ? area.y + slot * (f + 0.5) : area.y + area.h / 2;
    shapes.push({ type: 'fan', cx, cy, r });
  }
  for (let i = 0; i < count; i++) {
    const f = Math.min(Math.floor(i / perFan), fans - 1);
    const j = i - f * perFan;
    const n = Math.min(perFan, count - f * perFan);
    const a = (j / n) * Math.PI * 2 - Math.PI / 2;
    const s = shapes[f] as { cx: number; cy: number; r: number };
    points.push(pt(s.cx + Math.cos(a) * s.r, s.cy + Math.sin(a) * s.r, i / count, j / n, f));
  }
  return { zoneId, points, shapes, bounds: area };
}

/** Compute positions for every zone. Order of zones is preserved. */
export function layoutScene(
  zones: ZoneRuntime[],
  settings: Record<string, ZoneSettings | undefined>,
): ZoneLayout[] {
  let fanSlot = 0;
  let ramSlot = 0;
  let accentSlot = 0;
  let singleSlot = 0;
  const ramTotal = zones.filter((z) => z.kind === 'ram').length;

  return zones.map((z) => {
    const s = settings[z.id];
    const count = z.ledCount;
    if (z.kind === 'fans') {
      const fans = s?.fanCount ?? 1;
      const slot = fanSlot++;
      if (slot === 0) {
        return fanColumn(z.id, count, fans, { x: 6, y: 8, w: 22, h: 60 }, true);
      }
      if (slot === 1) {
        if (fans <= 1) {
          // A single rear exhaust fan.
          return fanColumn(z.id, count, fans, { x: 77, y: 16, w: 17, h: 17 }, true);
        }
        return fanColumn(z.id, count, fans, { x: 34, y: 4, w: 52, h: 9 }, false);
      }
      return fanColumn(z.id, count, fans, { x: 88, y: 40, w: 8, h: 26 }, true);
    }

    if (z.kind === 'ram') {
      const i = ramSlot++;
      const w = 1.9;
      const gap = 1.4;
      const x0 = 66 + (i - (ramTotal - 1) / 2) * (w + gap) + 2;
      const y0 = 17;
      const h = 24;
      const points: LedPoint[] = [];
      // ENE sticks: LED 0 is at the bottom of the light bar.
      for (let k = 0; k < count; k++) {
        const t = count === 1 ? 0.5 : k / (count - 1);
        const y = y0 + h * 0.08 + (1 - t) * h * 0.84;
        points.push(pt(x0 + w / 2, y, k / count, k / count, 0));
      }
      return {
        zoneId: z.id,
        points,
        shapes: [{ type: 'stick', x: x0, y: y0, w, h }],
        bounds: { x: x0 - 0.8, y: y0, w: w + 1.6, h },
      };
    }

    if (z.kind === 'gpu') {
      // The logo sits on the card's top edge, toward the front of the case (left in this view).
      const g = SCENE.gpu;
      const x1 = g.x + 4;
      const x2 = g.x + 18;
      const y = g.y + 1.6;
      const points: LedPoint[] = [];
      for (let k = 0; k < count; k++) {
        const t = count === 1 ? 0.5 : k / (count - 1);
        points.push(pt(x1 + (x2 - x1) * t, y, k / count, k / count, 0));
      }
      return {
        zoneId: z.id,
        points,
        shapes: [{ type: 'strip', x1, y1: y, x2, y2: y }],
        bounds: { x: x1 - 1.5, y: y - 1.5, w: x2 - x1 + 3, h: 3 },
      };
    }

    // 12V RGB headers drive a single color: show them as one dot each along the board's lower edge.
    if (count === 1) {
      const i = singleSlot++;
      const x = 38 + i * 4;
      const y = 62.5;
      return {
        zoneId: z.id,
        points: [pt(x, y, 0, 0, 0)],
        shapes: [],
        bounds: { x: x - 1.5, y: y - 1.5, w: 3, h: 3 },
      };
    }

    // Multi-LED accent zones: board edge lighting.
    const i = accentSlot++;
    const y = 62.5 - i * 3;
    const x1 = 58;
    const x2 = 82;
    const points: LedPoint[] = [];
    for (let k = 0; k < count; k++) {
      const t = count === 1 ? 0.5 : k / (count - 1);
      points.push(pt(x1 + (x2 - x1) * t, y, k / count, k / count, 0));
    }
    return {
      zoneId: z.id,
      points,
      shapes: [{ type: 'strip', x1, y1: y, x2, y2: y }],
      bounds: { x: x1 - 1, y: y - 1.5, w: x2 - x1 + 2, h: 3 },
    };
  });
}
