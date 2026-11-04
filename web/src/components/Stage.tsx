import { useEffect, useMemo, useRef } from 'react';
import { layoutScene, SCENE, SCENE_H, SCENE_W, type ZoneLayout } from '../../../shared/layout.ts';
import type { DeviceStatus, Scene, ZoneRuntime } from '../../../shared/types.ts';
import { fitCanvas, subscribeFrame } from '../frameLoop.ts';
import type { FrameStore } from '../useLumen.ts';

interface Props {
  scene: Scene;
  zones: ZoneRuntime[];
  devices: DeviceStatus[];
  frames: FrameStore;
  selected: string | null;
  onSelect: (zoneId: string | null) => void;
}

const ACCENT = '#8b7bff';

export function Stage(props: Props) {
  const { scene, zones, devices, frames, selected, onSelect } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const hover = useRef<string | null>(null);
  const layouts = useMemo(() => layoutScene(zones, scene.zones), [zones, scene.zones]);
  const live = useRef({ layouts, zones, scene, devices, selected });
  live.current = { layouts, zones, scene, devices, selected };
  const geo = useRef({ s: 1, ox: 0, oy: 0 });

  useEffect(
    () =>
      subscribeFrame(() => {
        const c = canvas.current;
        if (!c) return;
        const ctx = fitCanvas(c);
        if (!ctx) return;
        draw(ctx, c.clientWidth, c.clientHeight, live.current, frames.current, hover.current, geo.current);
      }),
    [frames],
  );

  const hit = (e: { clientX: number; clientY: number }): string | null => {
    const r = canvas.current!.getBoundingClientRect();
    const { s, ox, oy } = geo.current;
    const x = (e.clientX - r.left - ox) / s;
    const y = (e.clientY - r.top - oy) / s;
    for (const l of [...live.current.layouts].reverse()) {
      const b = l.bounds;
      if (x >= b.x - 1 && x <= b.x + b.w + 1 && y >= b.y - 1 && y <= b.y + b.h + 1) return l.zoneId;
    }
    return null;
  };

  return (
    <canvas
      ref={canvas}
      className="stage"
      role="img"
      aria-label="Live preview of your PC lighting. Click a fan group or RAM stick to select it."
      onPointerMove={(e) => {
        hover.current = hit(e);
        canvas.current!.style.cursor = hover.current ? 'pointer' : 'default';
      }}
      onPointerLeave={() => (hover.current = null)}
      onClick={(e) => onSelect(hit(e))}
    />
  );
}

// ---- drawing ------------------------------------------------------------------

function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  st: { layouts: ZoneLayout[]; zones: ZoneRuntime[]; scene: Scene; devices: DeviceStatus[]; selected: string | null },
  frame: Map<string, Uint8Array>,
  hoverId: string | null,
  geo: { s: number; ox: number; oy: number },
) {
  const s = Math.min(w / SCENE_W, h / SCENE_H) * 0.97;
  const ox = (w - SCENE_W * s) / 2;
  const oy = (h - SCENE_H * s) / 2;
  Object.assign(geo, { s, ox, oy });
  const X = (x: number) => ox + x * s;
  const Y = (y: number) => oy + y * s;

  ctx.clearRect(0, 0, w, h);

  // Case and components (unlit furniture).
  const k = SCENE.case;
  roundRect(ctx, X(k.x), Y(k.y), k.w * s, k.h * s, 3 * s);
  const caseFill = ctx.createLinearGradient(0, Y(k.y), 0, Y(k.y + k.h));
  caseFill.addColorStop(0, 'rgba(255,255,255,0.035)');
  caseFill.addColorStop(1, 'rgba(255,255,255,0.012)');
  ctx.fillStyle = caseFill;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';
  ctx.lineWidth = 1;
  ctx.stroke();

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

  const gpu = SCENE.gpu;
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
    for (const sh of l.shapes) {
      if (sh.type === 'fan') {
        ctx.beginPath();
        ctx.arc(X(sh.cx), Y(sh.cy), sh.r * 1.08 * s, 0, Math.PI * 2);
        ctx.fillStyle = '#0b0d12';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.06)';
        ctx.stroke();
        // Blades.
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = Math.max(1, 0.5 * s);
        for (let bl = 0; bl < 7; bl++) {
          const a = (bl / 7) * Math.PI * 2;
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
    }
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

  // Selection + hover outlines and labels.
  for (const l of st.layouts) {
    const isSel = l.zoneId === st.selected;
    const isHover = l.zoneId === hoverId;
    if (!isSel && !isHover) continue;
    const bb = l.bounds;
    const pad = 1.4;
    roundRect(ctx, X(bb.x - pad), Y(bb.y - pad), (bb.w + pad * 2) * s, (bb.h + pad * 2) * s, 1.6 * s);
    ctx.strokeStyle = isSel ? ACCENT : 'rgba(255,255,255,0.25)';
    ctx.lineWidth = isSel ? 1.5 : 1;
    ctx.setLineDash(isSel ? [] : [3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    const z = st.zones.find((zz) => zz.id === l.zoneId);
    const name = st.scene.zones[l.zoneId]?.label || z?.name || '';
    const ly = bb.y - pad - 1.6 < 2 ? bb.y + bb.h + pad + 2.4 : bb.y - pad - 1.6;
    label(ctx, name, X(bb.x + bb.w / 2), Y(ly), s, isSel ? '#d9d3ff' : 'rgba(255,255,255,0.6)', 600);
  }
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
