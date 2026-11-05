// Spatial layout of every LED in a virtual "PC case" scene.
// Both the effect engine (server) and the stage preview (web) use this, so the
// animation you see in the UI is computed over the same geometry as the hardware.

import type { PartId, Placement, ZoneRuntime, ZoneSettings } from './types.ts';

export type { Placement };

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
  bounds: Rect;
  /** Unlit hardware body that moves with this zone (the graphics card for the GPU logo). */
  body?: Rect;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
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
    const base = ((): ZoneLayout => {
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
        body: { ...g },
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
    })();
    return place(base, settings[z.id]?.place);
  });
}

// ---- Build editor placement ---------------------------------------------------------

/** Centre of the zone in its automatic layout (what a placement is measured from). */
export function zoneCenter(l: ZoneLayout): { x: number; y: number } {
  const b = l.body ? union(l.bounds, l.body) : l.bounds;
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Rotate by quarter turns and scale around the zone's centre, then move that centre to (p.x, p.y). */
function place(base: ZoneLayout, p: Placement | undefined): ZoneLayout {
  if (!p) return base;
  const c = zoneCenter(base);
  const q = ((p.rot % 4) + 4) % 4;
  const k = p.scale ?? 1;
  const tp = (x: number, y: number) => {
    let dx = (x - c.x) * k, dy = (y - c.y) * k;
    for (let i = 0; i < q; i++) [dx, dy] = [-dy, dx]; // 90° clockwise on screen
    return { x: p.x + dx, y: p.y + dy };
  };
  const tr = (r: Rect): Rect => {
    const m = tp(r.x + r.w / 2, r.y + r.h / 2);
    const [w, h] = q % 2 ? [r.h * k, r.w * k] : [r.w * k, r.h * k];
    return { x: m.x - w / 2, y: m.y - h / 2, w, h };
  };
  return {
    zoneId: base.zoneId,
    points: base.points.map((pt0) => {
      const m = tp(pt0.x, pt0.y);
      return { ...pt0, x: m.x, y: m.y, nx: m.x / SCENE_W, ny: m.y / SCENE_H };
    }),
    shapes: base.shapes.map((s): Shape => {
      if (s.type === 'fan') {
        const m = tp(s.cx, s.cy);
        return { ...s, cx: m.x, cy: m.y, r: s.r * k };
      }
      if (s.type === 'stick') {
        const r = tr(s);
        return { type: 'stick', ...r };
      }
      const a = tp(s.x1, s.y1), b = tp(s.x2, s.y2);
      return { type: 'strip', x1: a.x, y1: a.y, x2: b.x, y2: b.y };
    }),
    bounds: tr(base.bounds),
    body: base.body && tr(base.body),
  };
}

export const MIN_SCALE = 0.4;
export const MAX_SCALE = 2.5;

/** Keep a placement's centre inside the case and its size sensible. */
export function clampPlacement(p: Placement): Placement {
  const k = SCENE.case;
  const r = Math.round(((p.rot % 4) + 4) % 4) as Placement['rot'];
  const scale = Math.round(Math.min(MAX_SCALE, Math.max(MIN_SCALE, p.scale ?? 1)) * 100) / 100;
  return {
    x: Math.min(k.x + k.w - 2, Math.max(k.x + 2, p.x)),
    y: Math.min(k.y + k.h - 2, Math.max(k.y + 2, p.y)),
    rot: r,
    ...(scale !== 1 && { scale }),
  };
}

/** Place a plain rectangle (CPU, motherboard). */
export function placeRect(base: Rect, p: Placement | undefined): Rect {
  if (!p) return base;
  const k = p.scale ?? 1;
  const [w, h] = p.rot % 2 ? [base.h * k, base.w * k] : [base.w * k, base.h * k];
  return { x: p.x - w / 2, y: p.y - h / 2, w, h };
}

/** Where the CPU and motherboard are drawn, after any Build editor changes. */
export function layoutParts(parts: Partial<Record<PartId, Placement>> | undefined): Record<PartId, Rect> {
  return {
    board: placeRect(SCENE.board, parts?.board),
    cpu: placeRect(SCENE.cpu, parts?.cpu),
  };
}

/** The CPU's centre in normalised scene coordinates (Ripple radiates from here). */
export function cpuOrigin(parts: Partial<Record<PartId, Placement>> | undefined): { nx: number; ny: number } {
  const c = layoutParts(parts).cpu;
  return { nx: (c.x + c.w / 2) / SCENE_W, ny: (c.y + c.h / 2) / SCENE_H };
}
