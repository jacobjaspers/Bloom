// The case display: live preview of every LED, plus the Build editor (move, resize and
// rotate parts, with undo/redo). Drawing lives in stageDraw.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  clampPlacement,
  layoutParts,
  layoutScene,
  MAX_SCALE,
  MIN_SCALE,
  SCENE,
  zoneCenter,
  type Rect,
} from '../../../shared/layout.ts';
import type { DeviceStatus, PartId, Placement, Scene, ZoneRuntime } from '../../../shared/types.ts';
import { HELP } from '../help.ts';
import { fitCanvas, subscribeFrame } from '../frameLoop.ts';
import type { FrameStore } from '../useLumen.ts';
import { InfoTip } from './controls.tsx';
import { draw, HANDLE, unionRect } from './stageDraw.ts';

/** Something the Build editor can move: a lit zone, or an unlit case part. */
export type EditTarget = { kind: 'zone'; id: string } | { kind: 'part'; id: PartId };

/** Every placement at once (for undo/redo and reset). */
export interface LayoutSnapshot {
  zones: Record<string, Placement | undefined>;
  parts: Partial<Record<PartId, Placement>>;
}

interface Props {
  scene: Scene;
  zones: ZoneRuntime[];
  devices: DeviceStatus[];
  frames: FrameStore;
  selected: string | null;
  onSelect: (zoneId: string | null) => void;
  /** True while the dashboard's startup sequence is playing. */
  intro: boolean;
  /** Build editor: apply a whole layout (moves, undo, redo and reset all go through this). */
  onSetLayout: (layout: LayoutSnapshot) => void;
}

const PART_BASE: Record<PartId, Rect> = { cpu: SCENE.cpu, board: SCENE.board };
const PART_NAME: Record<PartId, string> = { cpu: 'CPU', board: 'Motherboard' };
const HISTORY = 60;

export function Stage(props: Props) {
  const { scene, zones, devices, frames, selected, onSelect, intro, onSetLayout } = props;
  const canvas = useRef<HTMLCanvasElement>(null);
  const hover = useRef<EditTarget | null>(null);
  const [editing, setEditing] = useState(false);
  const [editSel, setEditSel] = useState<EditTarget | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const layouts = useMemo(() => layoutScene(zones, scene.zones), [zones, scene.zones]);
  const parts = useMemo(() => layoutParts(scene.parts), [scene.parts]);
  const live = useRef({ layouts, parts, zones, scene, devices, selected, editing, editSel });
  live.current = { layouts, parts, zones, scene, devices, selected, editing, editSel };
  const geo = useRef({ s: 1, ox: 0, oy: 0 });
  const introStart = useRef<number | null>(null);
  if (intro && introStart.current === null) introStart.current = performance.now();

  // ---- layout state + history -----------------------------------------------------

  const snapshot = useCallback((): LayoutSnapshot => {
    const z: LayoutSnapshot['zones'] = {};
    for (const [id, s] of Object.entries(scene.zones)) z[id] = s.place ? { ...s.place } : undefined;
    return { zones: z, parts: structuredClone(scene.parts ?? {}) };
  }, [scene.zones, scene.parts]);

  const history = useRef<{ undo: LayoutSnapshot[]; redo: LayoutSnapshot[] }>({ undo: [], redo: [] });
  const [, bump] = useState(0);
  const remember = () => {
    const h = history.current;
    h.undo.push(snapshot());
    if (h.undo.length > HISTORY) h.undo.shift();
    h.redo = [];
    bump((n) => n + 1);
  };
  const undo = () => {
    const h = history.current;
    const prev = h.undo.pop();
    if (!prev) return;
    h.redo.push(snapshot());
    onSetLayout(prev);
    bump((n) => n + 1);
  };
  const redo = () => {
    const h = history.current;
    const next = h.redo.pop();
    if (!next) return;
    h.undo.push(snapshot());
    onSetLayout(next);
    bump((n) => n + 1);
  };

  const rectOf = (t: EditTarget): Rect | null => {
    if (t.kind === 'part') return parts[t.id];
    const l = layouts.find((x) => x.zoneId === t.id);
    return l ? (l.body ? unionRect(l.bounds, l.body) : l.bounds) : null;
  };

  /** The target's current placement, or its automatic position if it has never moved. */
  const placementOf = (t: EditTarget): Placement => {
    if (t.kind === 'part') {
      const b = PART_BASE[t.id];
      return scene.parts?.[t.id] ?? { x: b.x + b.w / 2, y: b.y + b.h / 2, rot: 0 };
    }
    const cur = scene.zones[t.id]?.place;
    if (cur) return cur;
    const l = layouts.find((x) => x.zoneId === t.id);
    const c = l ? zoneCenter(l) : { x: 50, y: 37 };
    return { x: c.x, y: c.y, rot: 0 };
  };

  const setPlacement = (t: EditTarget, p: Placement) => {
    const next = snapshot();
    if (t.kind === 'part') next.parts[t.id] = clampPlacement(p);
    else next.zones[t.id] = clampPlacement(p);
    onSetLayout(next);
  };

  const rotate = () => {
    if (!editSel) return;
    remember();
    const p = placementOf(editSel);
    setPlacement(editSel, { ...p, rot: ((p.rot + 1) % 4) as Placement['rot'] });
  };
  const resize = (factor: number) => {
    if (!editSel) return;
    remember();
    const p = placementOf(editSel);
    setPlacement(editSel, { ...p, scale: (p.scale ?? 1) * factor });
  };
  const nudge = (dx: number, dy: number) => {
    if (!editSel) return;
    remember();
    const p = placementOf(editSel);
    setPlacement(editSel, { ...p, x: p.x + dx, y: p.y + dy });
  };
  const resetAll = () => {
    remember();
    onSetLayout({ zones: Object.fromEntries(Object.keys(scene.zones).map((id) => [id, undefined])), parts: {} });
    setConfirmReset(false);
  };

  // The "Confirm reset" button reverts to "Reset" if you don't click it.
  useEffect(() => {
    if (!confirmReset) return;
    const t = window.setTimeout(() => setConfirmReset(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirmReset]);

  // Keyboard: Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z), R rotate, +/- size, arrows nudge, Esc done.
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  keys.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) {
      e.preventDefault();
      undo();
      return;
    }
    if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) {
      e.preventDefault();
      redo();
      return;
    }
    if (mod) return;
    if (k === 'r') return rotate();
    if (k === '+' || k === '=') return resize(1.1);
    if (k === '-' || k === '_') return resize(1 / 1.1);
    if (k === 'escape') return setEditing(false);
    const step = e.shiftKey ? 2 : 0.5;
    const arrows: Record<string, [number, number]> = {
      arrowleft: [-step, 0],
      arrowright: [step, 0],
      arrowup: [0, -step],
      arrowdown: [0, step],
    };
    if (arrows[k] && editSel) {
      e.preventDefault();
      nudge(...arrows[k]);
    }
  };
  useEffect(() => {
    if (!editing) return;
    const h = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [editing]);

  // ---- drawing loop -------------------------------------------------------------------

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

  // ---- pointer --------------------------------------------------------------------------

  const toScene = (e: { clientX: number; clientY: number }) => {
    const r = canvas.current!.getBoundingClientRect();
    const { s, ox, oy } = geo.current;
    return { x: (e.clientX - r.left - ox) / s, y: (e.clientY - r.top - oy) / s };
  };

  const inRect = (p: { x: number; y: number }, b: Rect, pad = 1) =>
    p.x >= b.x - pad && p.x <= b.x + b.w + pad && p.y >= b.y - pad && p.y <= b.y + b.h + pad;

  /** Topmost thing under the pointer: lit zones first, then the CPU, then the board (edit mode only). */
  const hit = (e: { clientX: number; clientY: number }, includeParts: boolean): EditTarget | null => {
    const p = toScene(e);
    for (const l of [...layouts].reverse()) {
      for (const b of l.body ? [l.bounds, l.body] : [l.bounds]) if (inRect(p, b)) return { kind: 'zone', id: l.zoneId };
    }
    if (includeParts) {
      if (inRect(p, parts.cpu, 0)) return { kind: 'part', id: 'cpu' };
      if (inRect(p, parts.board, 0)) return { kind: 'part', id: 'board' };
    }
    return null;
  };

  const onHandle = (e: { clientX: number; clientY: number }) => {
    if (!editSel) return false;
    const r = rectOf(editSel);
    if (!r) return false;
    const p = toScene(e);
    return Math.abs(p.x - (r.x + r.w)) <= HANDLE * 1.4 && Math.abs(p.y - (r.y + r.h)) <= HANDLE * 1.4;
  };

  const gesture = useRef<
    | { mode: 'move'; t: EditTarget; sx: number; sy: number; start: Placement; moved: boolean }
    | { mode: 'resize'; t: EditTarget; d0: number; start: Placement; moved: boolean }
    | null
  >(null);

  const selLabel = editSel
    ? editSel.kind === 'part'
      ? PART_NAME[editSel.id]
      : scene.zones[editSel.id]?.label || zones.find((z) => z.id === editSel.id)?.name || 'Part'
    : null;
  const h = history.current;

  return (
    <>
      <canvas
        ref={canvas}
        className={`stage ${editing ? 'editing' : ''}`}
        role="img"
        aria-label={
          editing
            ? 'Layout editor. Drag a part to move it, drag its corner handle to resize.'
            : 'Live preview of your PC lighting. Click a fan group or RAM stick to select it.'
        }
        onPointerDown={(e) => {
          if (!editing) return;
          const p = toScene(e);
          if (editSel && onHandle(e)) {
            const start = placementOf(editSel);
            const d0 = Math.max(0.5, Math.hypot(p.x - start.x, p.y - start.y));
            gesture.current = { mode: 'resize', t: editSel, d0, start, moved: false };
          } else {
            const t = hit(e, true);
            setEditSel(t);
            if (!t) return;
            if (t.kind === 'zone') onSelect(t.id);
            gesture.current = { mode: 'move', t, sx: p.x, sy: p.y, start: placementOf(t), moved: false };
          }
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const g = gesture.current;
          if (g) {
            const p = toScene(e);
            if (g.mode === 'move') {
              const dx = p.x - g.sx, dy = p.y - g.sy;
              if (!g.moved && Math.hypot(dx, dy) < 0.6) return;
              if (!g.moved) remember();
              g.moved = true;
              const snap = (v: number) => Math.round(v * 2) / 2;
              setPlacement(g.t, { ...g.start, x: snap(g.start.x + dx), y: snap(g.start.y + dy) });
            } else {
              const d = Math.hypot(p.x - g.start.x, p.y - g.start.y);
              const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, ((g.start.scale ?? 1) * d) / g.d0));
              if (!g.moved && Math.abs(scale - (g.start.scale ?? 1)) < 0.02) return;
              if (!g.moved) remember();
              g.moved = true;
              setPlacement(g.t, { ...g.start, scale });
            }
            return;
          }
          if (editing && onHandle(e)) {
            canvas.current!.style.cursor = 'nwse-resize';
            return;
          }
          hover.current = hit(e, editing);
          canvas.current!.style.cursor = hover.current ? (editing ? 'grab' : 'pointer') : 'default';
        }}
        onPointerUp={() => (gesture.current = null)}
        onPointerCancel={() => (gesture.current = null)}
        onPointerLeave={() => (hover.current = null)}
        onClick={(e) => {
          if (editing) return;
          const t = hit(e, false);
          onSelect(t?.kind === 'zone' ? t.id : null);
        }}
      />

      <div className={`stage-tools ${editing ? 'editing' : ''}`}>
        {editing ? (
          <>
            <span className="stage-hint">{selLabel ? <strong>{selLabel}</strong> : 'Drag parts to match your PC'}</span>
            <span className="tool-group" role="group" aria-label="History">
              <button type="button" className="icon-btn" disabled={!h.undo.length} onClick={undo} title="Undo (Ctrl+Z)" aria-label="Undo">
                ↶
              </button>
              <button type="button" className="icon-btn" disabled={!h.redo.length} onClick={redo} title="Redo (Ctrl+Y)" aria-label="Redo">
                ↷
              </button>
            </span>
            <span className="tool-group" role="group" aria-label="Selected part">
              <button
                type="button"
                className="icon-btn"
                disabled={!editSel}
                onClick={() => resize(1 / 1.1)}
                title="Smaller (−)"
                aria-label="Make smaller"
              >
                −
              </button>
              <button type="button" className="icon-btn" disabled={!editSel} onClick={() => resize(1.1)} title="Bigger (+)" aria-label="Make bigger">
                +
              </button>
              <button type="button" className="icon-btn" disabled={!editSel} onClick={rotate} title="Rotate (R)" aria-label="Rotate">
                ⟳
              </button>
            </span>
            {confirmReset ? (
              <button type="button" className="ghost-btn danger" onClick={resetAll}>
                Confirm reset
              </button>
            ) : (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setConfirmReset(true)}
                title="Put every part back in its automatic position"
              >
                Reset
              </button>
            )}
            <button type="button" className="primary-btn" onClick={() => setEditing(false)}>
              Done
            </button>
          </>
        ) : (
          <button
            type="button"
            className="ghost-btn glass"
            onClick={() => {
              setEditing(true);
              setEditSel(null);
            }}
            title="Move and resize fans, RAM, the GPU and CPU to match your build"
          >
            ✎ Edit layout
          </button>
        )}
        <InfoTip text={HELP.layout} label="Edit layout" />
      </div>
    </>
  );
}
