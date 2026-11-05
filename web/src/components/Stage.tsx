import { useEffect, useMemo, useRef, useState } from 'react';
import { clampPlacement, layoutScene, SCENE, SCENE_H, SCENE_W, zoneCenter, type ZoneLayout } from '../../../shared/layout.ts';
import type { DeviceStatus, Placement, Scene, ZoneRuntime } from '../../../shared/types.ts';
import { HELP } from '../help.ts';
import { InfoTip } from './controls.tsx';
import { fitCanvas, subscribeFrame } from '../frameLoop.ts';
import type { FrameStore } from '../useLumen.ts';

interface Props {
  scene: Scene;
  zones: ZoneRuntime[];
  devices: DeviceStatus[];
  frames: FrameStore;
  selected: string | null;
  onSelect: (zoneId: string | null) => void;
  /** True while the dashboard's startup sequence is playing. */
  intro: boolean;
  /** Build editor: move/rotate a part, or clear every placement. */
  onPlace: (zoneId: string, place: Placement) => void;
  onResetLayout: () => void;
}

const ACCENT = '#8b7bff';
const KIND_ORDER = { fans: 0, ram: 1, gpu: 2, accent: 3 } as const;

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export function Stage(props: Props) {
  const { scene, zones, devices, frames, selected, onSelect, intro, onPlace, onResetLayout } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const hover = useRef<string | null>(null);
  const [editing, setEditing] = useState(false);
  const layouts = useMemo(() => layoutScene(zones, scene.zones), [zones, scene.zones]);
  const live = useRef({ layouts, zones, scene, devices, selected, editing });
  live.current = { layouts, zones, scene, devices, selected, editing };
  const geo = useRef({ s: 1, ox: 0, oy: 0 });
  const introStart = useRef<number | null>(null);
  if (intro && introStart.current === null) introStart.current = performance.now();
  const drag = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number; rot: Placement['rot']; moved: boolean } | null>(null);

  useEffect(
    () =>
      subscribeFrame((now) => {
        const c = canvas.current;
        if (!c) return;
        const ctx = fitCanvas(c);
        if (!ctx) return;
        const e = introStart.current === null ? 99 : (now - introStart.current) / 1000;
        draw(ctx, c.clientWidth, c.clientHeight, live.current, frames.current, hover.current, geo.current, now, e);
      }),
    [frames],
  );

  const toScene = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    const { s, ox, oy } = geo.current;
    return { x: (e.clientX - r.left - ox) / s, y: (e.clientY - r.top - oy) / s };
  };

  const hit = (e: { clientX: number; clientY: number }): string | null => {
    const { x, y } = toScene(e);
    for (const l of [...live.current.layouts].reverse()) {
      for (const b of l.body ? [l.bounds, l.body] : [l.bounds]) {
        if (x >= b.x - 1 && x <= b.x + b.w + 1 && y >= b.y - 1 && y <= b.y + b.h + 1) return l.zoneId;
      }
    }
    return null;
  };

  const selLayout = editing && selected ? layouts.find((l) => l.zoneId === selected) : undefined;
  const rotateSelected = () => {
    if (!selLayout) return;
    const c = zoneCenter(selLayout);
    const cur = scene.zones[selLayout.zoneId]?.place;
    onPlace(selLayout.zoneId, clampPlacement({ x: cur?.x ?? c.x, y: cur?.y ?? c.y, rot: (((cur?.rot ?? 0) + 1) % 4) as Placement['rot'] }));
  };

  return (
    <>
      <canvas
        ref={canvas}
        className={`stage ${editing ? 'editing' : ''}`}
        role="img"
        aria-label={
          editing
            ? 'Layout editor. Drag a part to move it.'
            : 'Live preview of your PC lighting. Click a fan group or RAM stick to select it.'
        }
        onPointerDown={(e) => {
          if (!editing) return;
          const id = hit(e);
          if (!id) return;
          const l = layouts.find((x) => x.zoneId === id)!;
          const c = zoneCenter(l);
          const cur = scene.zones[id]?.place;
          const p = toScene(e);
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { id, sx: p.x, sy: p.y, ox: cur?.x ?? c.x, oy: cur?.y ?? c.y, rot: cur?.rot ?? 0, moved: false };
          onSelect(id);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (d) {
            const p = toScene(e);
            const dx = p.x - d.sx, dy = p.y - d.sy;
            if (!d.moved && Math.hypot(dx, dy) < 0.6) return;
            d.moved = true;
            const snap = (v: number) => Math.round(v * 2) / 2;
            onPlace(d.id, clampPlacement({ x: snap(d.ox + dx), y: snap(d.oy + dy), rot: d.rot }));
            return;
          }
          hover.current = hit(e);
          canvas.current!.style.cursor = hover.current ? (editing ? 'grab' : 'pointer') : 'default';
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerLeave={() => (hover.current = null)}
        onClick={(e) => !editing && onSelect(hit(e))}
        onKeyDown={(e) => editing && (e.key === 'r' || e.key === 'R') && rotateSelected()}
        tabIndex={editing ? 0 : -1}
      />

      <div className={`stage-tools ${editing ? 'editing' : ''}`}>
        {editing ? (
          <>
            <span className="stage-hint">Drag parts to match your PC</span>
            <button type="button" className="ghost-btn" disabled={!selLayout} onClick={rotateSelected} title="Rotate the selected part (R)">
              ⟳ Rotate
            </button>
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                if (window.confirm('Put every part back in its automatic position?')) onResetLayout();
              }}
            >
              Reset
            </button>
            <button type="button" className="primary-btn" onClick={() => setEditing(false)}>
              Done
            </button>
          </>
        ) : (
          <button type="button" className="ghost-btn glass" onClick={() => setEditing(true)} title="Move fans, RAM and the GPU to match your build">
            ✎ Edit layout
          </button>
        )}
        <InfoTip text={HELP.layout} label="Edit layout" />
      </div>
    </>
  );
}

// ---- drawing ------------------------------------------------------------------

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  st: { layouts: ZoneLayout[]; zones: ZoneRuntime[]; scene: Scene; devices: DeviceStatus[]; selected: string | null; editing: boolean },
  frame: Map<string, Uint8Array>,
  hoverId: string | null,
  geo: { s: number; ox: number; oy: number },
  now: number,
  /** Seconds since the startup sequence began (large once it's over). */
  introT: number,
) {
  const s = Math.min(w / SCENE_W, h / SCENE_H) * 0.97;
  const ox = (w - SCENE_W * s) / 2;
  const oy = (h - SCENE_H * s) / 2;
  Object.assign(geo, { s, ox, oy });
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy + y * s;
  const intro = introT < 3;

  // During the intro each zone powers up in turn (fans → RAM → GPU → board).
  if (intro) {
    const order = [...st.zones].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]).map((z) => z.id);
    const scaled = new Map<string, Uint8Array>();
    for (const l of st.layouts) {
      const src = frame.get(l.zoneId);
      if (!src) continue;
      const start = 0.75 + order.indexOf(l.zoneId) * 0.22;
      const dst = new Uint8Array(src.length);
      for (let i = 0; i < l.points.length; i++) {
        const a = smoothstep(0, 0.45, introT - start - l.points[i].lu * 0.3);
        for (let c = 0; c < 3; c++) dst[i * 3 + c] = src[i * 3 + c] * a;
      }
      scaled.set(l.zoneId, dst);
    }
    frame = scaled;
  }

  ctx.clearRect(0, 0, w, h);

  // Case and components (unlit furniture). The outline draws itself in during the intro.
  const k = SCENE.case;
  const fade = intro ? smoothstep(0.15, 0.8, introT) : 1;
  ctx.save();
  ctx.globalAlpha = fade;
  roundRect(ctx, X(k.x), Y(k.y), k.w * s, k.h * s, 3 * s);
  const caseFill = ctx.createLinearGradient(0, Y(k.y), 0, Y(k.y + k.h));
  caseFill.addColorStop(0, 'rgba(255,255,255,0.035)');
  caseFill.addColorStop(1, 'rgba(255,255,255,0.012)');
  ctx.fillStyle = caseFill;
  ctx.fill();
  ctx.restore();
  const perimeter = 2 * (k.w + k.h) * s;
  ctx.save();
  if (intro) ctx.setLineDash([perimeter * smoothstep(0, 0.9, introT), perimeter]);
  roundRect(ctx, X(k.x), Y(k.y), k.w * s, k.h * s, 3 * s);
  ctx.strokeStyle = intro ? `rgba(160,150,255,${0.09 + 0.5 * (1 - smoothstep(0.6, 1.6, introT))})` : 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = fade;

  const b = SCENE.board;
  roundRect(ctx, X(b.x), Y(b.y), b.w * s, b.h * s, 1.2 * s);
  ctx.fillStyle = '#0e1016';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.stroke();

  const cpu = SCENE.cpu;
  roundRect(ctx, X(cpu.x), Y(cpu.y), cpu.w * s, cpu.h * s, 1 * s);
  ctx.fillStyle = '#151821';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.stroke();
  label(ctx, 'CPU', X(cpu.x + cpu.w / 2), Y(cpu.y + cpu.h / 2), s, 'rgba(255,255,255,0.18)');

  // The graphics card moves with its logo zone in the Build editor.
  const gpu = st.layouts.find((l) => l.body)?.body ?? SCENE.gpu;
  roundRect(ctx, X(gpu.x), Y(gpu.y), gpu.w * s, gpu.h * s, 1 * s);
  ctx.fillStyle = '#12141b';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.stroke();
  label(ctx, 'GPU', X(gpu.x + gpu.w / 2), Y(gpu.y + gpu.h / 2), s, 'rgba(255,255,255,0.18)');

  // Ghost RAM when the RAM device isn't available yet.
  const ram = st.devices.find((d) => d.id === 'ram');
  if (ram && ram.state !== 'connected') {
    for (let i = 0; i < 2; i++) {
      const x0 = 66 + (i - 0.5) * 3.3 + 2;
      ctx.setLineDash([2, 3]);
      roundRect(ctx, X(x0), Y(17), 1.9 * s, 24 * s, 0.4 * s);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.stroke();
      ctx.setLineDash([]);
    }
    label(ctx, 'RAM · setup needed', X(69), Y(44), s, 'rgba(255,255,255,0.32)');
  }
  ctx.restore();

  // Intro scan line sweeping across the case.
  if (intro && introT < 1.6) {
    const sx = X(k.x + k.w * smoothstep(0.1, 1.5, introT));
    const band = 14 * s;
    const grad = ctx.createLinearGradient(sx - band, 0, sx + band, 0);
    grad.addColorStop(0, 'rgba(139,123,255,0)');
    grad.addColorStop(0.5, `rgba(170,160,255,${0.35 * (1 - smoothstep(1.2, 1.6, introT))})`);
    grad.addColorStop(1, 'rgba(0,216,255,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grad;
    ctx.fillRect(sx - band, Y(k.y), band * 2, k.h * s);
    ctx.restore();
  }

  // Ambient glow (additive).
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of st.layouts) {
    const rgb = frame.get(l.zoneId);
    if (!rgb) continue;
    const z = st.zones.find((zz) => zz.id === l.zoneId);
    const radius = (z?.kind === 'ram' ? 4.5 : 5.5) * s;
    for (let i = 0; i < l.points.length; i++) {
      const r = rgb[i * 3], g = rgb[i * 3 + 1], bb = rgb[i * 3 + 2];
      if (r + g + bb < 6) continue;
      const p = l.points[i];
      const grad = ctx.createRadialGradient(X(p.x), Y(p.y), 0, X(p.x), Y(p.y), radius);
      grad.addColorStop(0, `rgba(${r},${g},${bb},0.22)`);
      grad.addColorStop(1, `rgba(${r},${g},${bb},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(X(p.x) - radius, Y(p.y) - radius, radius * 2, radius * 2);
    }
  }
  ctx.restore();

  // Hardware bodies + LEDs.
  for (const l of st.layouts) {
    const rgb = frame.get(l.zoneId) ?? new Uint8Array(l.points.length * 3);
    l.shapes.forEach((sh, si) => {
      if (sh.type === 'fan') {
        // Light from this fan's ring spills onto its housing and blades.
        const [ar, ag, ab] = groupAverage(rgb, l, si);
        ctx.beginPath();
        ctx.arc(X(sh.cx), Y(sh.cy), sh.r * 1.08 * s, 0, Math.PI * 2);
        const housing = ctx.createRadialGradient(X(sh.cx), Y(sh.cy), sh.r * 0.2 * s, X(sh.cx), Y(sh.cy), sh.r * 1.08 * s);
        housing.addColorStop(0, '#0b0d12');
        housing.addColorStop(0.75, `rgba(${ar * 0.12 + 11},${ag * 0.12 + 13},${ab * 0.12 + 18},1)`);
        housing.addColorStop(1, `rgba(${ar * 0.25 + 11},${ag * 0.25 + 13},${ab * 0.25 + 18},1)`);
        ctx.fillStyle = housing;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.stroke();
        // Spinning blades.
        const spin = (now / 1000) * 2.4 + si * 0.7;
        ctx.strokeStyle = `rgba(${Math.min(255, ar + 60)},${Math.min(255, ag + 60)},${Math.min(255, ab + 60)},0.13)`;
        ctx.lineWidth = Math.max(1, 0.55 * s);
        for (let bl = 0; bl < 7; bl++) {
          const a = (bl / 7) * Math.PI * 2 + spin;
          ctx.beginPath();
          ctx.arc(X(sh.cx), Y(sh.cy), sh.r * 0.55 * s, a, a + 0.9);
          ctx.stroke();
        }
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(X(sh.cx), Y(sh.cy), sh.r * 0.2 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#14171f';
        ctx.fill();
      } else if (sh.type === 'stick') {
        roundRect(ctx, X(sh.x), Y(sh.y), sh.w * s, sh.h * s, 0.4 * s);
        ctx.fillStyle = '#1b1e26';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.stroke();
        // Light bar as a continuous gradient through the LED colors.
        const n = l.points.length;
        if (n) {
          const top = Y(l.points[n - 1].y) - 1.2 * s;
          const bot = Y(l.points[0].y) + 1.2 * s;
          const grad = ctx.createLinearGradient(0, bot, 0, top);
          for (let i = 0; i < n; i++) {
            grad.addColorStop(n === 1 ? 0.5 : i / (n - 1), `rgb(${lift(rgb, i)})`);
          }
          roundRect(ctx, X(sh.x + sh.w * 0.22), top, sh.w * 0.56 * s, bot - top, 0.3 * s);
          ctx.fillStyle = grad;
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = Math.max(1, 0.9 * s);
        ctx.beginPath();
        ctx.moveTo(X(sh.x1), Y(sh.y1));
        ctx.lineTo(X(sh.x2), Y(sh.y2));
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    });
    const z = st.zones.find((zz) => zz.id === l.zoneId);
    if (z?.kind !== 'ram') {
      const dot = Math.max(1.2, (z?.kind === 'fans' ? 0.75 : 0.6) * s);
      for (let i = 0; i < l.points.length; i++) {
        const p = l.points[i];
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), dot, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${lift(rgb, i)})`;
        ctx.fill();
      }
    }
  }

  // Selection + hover outlines and labels. In the Build editor every part is outlined.
  for (const l of st.layouts) {
    const isSel = l.zoneId === st.selected;
    const isHover = l.zoneId === hoverId;
    if (!isSel && !isHover && !st.editing) continue;
    const bb = l.body ? unionRect(l.bounds, l.body) : l.bounds;
    const pad = 1.4;
    roundRect(ctx, X(bb.x - pad), Y(bb.y - pad), (bb.w + pad * 2) * s, (bb.h + pad * 2) * s, 1.6 * s);
    ctx.save();
    if (st.editing && !isSel && !isHover) {
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = 'rgba(160,150,255,0.35)';
      ctx.fillStyle = 'rgba(139,123,255,0.05)';
      ctx.fill();
    } else if (isSel) {
      // Selected: a softly breathing glow.
      ctx.shadowColor = ACCENT;
      ctx.shadowBlur = 8 + 6 * Math.sin(now / 420);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 1.5;
    } else {
      // Hover: marching dashes.
      ctx.setLineDash([3, 3]);
      ctx.lineDashOffset = -now / 60;
      ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    }
    ctx.stroke();
    ctx.restore();
    const z = st.zones.find((zz) => zz.id === l.zoneId);
    const name = st.scene.zones[l.zoneId]?.label || z?.name || '';
    const ly = bb.y - pad - 1.6 < 2 ? bb.y + bb.h + pad + 2.4 : bb.y - pad - 1.6;
    label(ctx, name, X(bb.x + bb.w / 2), Y(ly), s, isSel ? '#d9d3ff' : 'rgba(255,255,255,0.6)', 600);
  }
}

function unionRect(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/** Average color of the LEDs belonging to fan `group` within a zone. */
function groupAverage(rgb: Uint8Array, l: ZoneLayout, group: number): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < l.points.length; i++) {
    if (l.points[i].group !== group) continue;
    r += rgb[i * 3] ?? 0;
    g += rgb[i * 3 + 1] ?? 0;
    b += rgb[i * 3 + 2] ?? 0;
    n++;
  }
  return n ? [r / n, g / n, b / n] : [0, 0, 0];
}

/** Brighten dim LED colors a little so the preview reads like the real thing. */
function lift(rgb: Uint8Array, i: number): string {
  const r = rgb[i * 3] ?? 0, g = rgb[i * 3 + 1] ?? 0, b = rgb[i * 3 + 2] ?? 0;
  const m = Math.max(r, g, b);
  if (m === 0) return '28,31,40';
  const k = Math.min(255 / m, 1 + (1 - m / 255) * 0.9);
  return `${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, s: number, color: string, weight = 500) {
  ctx.font = `${weight} ${Math.max(10, 1.5 * s)}px "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
}
