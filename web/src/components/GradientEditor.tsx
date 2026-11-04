import { useMemo, useRef, useState } from 'react';
import { buildLut, cssGradient, SPECTRUM, sortedStops, stops } from '../../../shared/effects.ts';
import { rgbToHex } from '../../../shared/color.ts';
import { MAX_STOPS } from '../../../shared/stack.ts';
import type { ColorStop } from '../../../shared/types.ts';

const QUICK: { name: string; palette: ColorStop[] }[] = [
  { name: 'Spectrum', palette: SPECTRUM },
  { name: 'Aurora', palette: stops('#00ffa3', '#00a2ff', '#8a2be2') },
  { name: 'Sunset', palette: stops('#ff2e63', '#ff8a00', '#ffd23f') },
  { name: 'Neon', palette: stops('#ff2fb3', '#7c3aed', '#00e5ff') },
  { name: 'Ocean', palette: stops('#001f54', '#0077b6', '#48cae4', '#caf0f8') },
  { name: 'Fire', palette: stops('#5a0500', '#ff3a00', '#ff9a00', '#ffe08a') },
  { name: 'Forest', palette: stops('#0b3d20', '#2dc653', '#b7efc5') },
  { name: 'Mono', palette: stops('#ffffff', '#5b6070') },
];

/**
 * Gradient bar with draggable color stops. Click the bar to add a stop, drag a stop to
 * move it, pick its color below, or drag it off the bar to remove it.
 */
export function GradientEditor({ value, onChange }: { value: ColorStop[]; onChange: (p: ColorStop[]) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const [sel, setSel] = useState(0);
  const drag = useRef<{ index: number; startY: number } | null>(null);
  const lut = useMemo(() => buildLut(value, false), [value]);
  const selected = value[Math.min(sel, value.length - 1)];
  const order = useMemo(() => sortedStops(value), [value]);

  const posFromEvent = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };

  const colorAt = (pos: number) => {
    const i = Math.round(pos * 255) * 3;
    return rgbToHex([lut[i], lut[i + 1], lut[i + 2]]);
  };

  const update = (i: number, patch: Partial<ColorStop>) => onChange(value.map((s, k) => (k === i ? { ...s, ...patch } : s)));

  const remove = (i: number) => {
    if (value.length <= 1) return;
    onChange(value.filter((_, k) => k !== i));
    setSel(0);
  };

  return (
    <div className="gradient-editor">
      <div
        ref={bar}
        className="gradient-bar"
        style={{ background: cssGradient(value) }}
        onPointerDown={(e) => {
          if (e.target !== bar.current || value.length >= MAX_STOPS) return;
          const pos = posFromEvent(e.clientX);
          onChange([...value, { pos, color: colorAt(pos) }]);
          setSel(value.length);
        }}
        role="group"
        aria-label="Gradient. Click to add a color stop."
      >
        {value.map((s, i) => (
          <button
            key={i}
            type="button"
            className={`stop ${i === sel ? 'active' : ''}`}
            style={{ left: `${s.pos * 100}%`, '--c': s.color } as React.CSSProperties}
            aria-label={`Color stop ${order.indexOf(s) + 1}: ${s.color} at ${Math.round(s.pos * 100)}%`}
            onPointerDown={(e) => {
              e.stopPropagation();
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              drag.current = { index: i, startY: e.clientY };
              setSel(i);
            }}
            onPointerMove={(e) => {
              if (drag.current?.index !== i) return;
              update(i, { pos: posFromEvent(e.clientX) });
            }}
            onPointerUp={(e) => {
              const d = drag.current;
              drag.current = null;
              // Pull a stop well off the bar to delete it.
              if (d && Math.abs(e.clientY - d.startY) > 48) remove(i);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                e.preventDefault();
                update(i, { pos: Math.min(1, Math.max(0, s.pos + (e.key === 'ArrowLeft' ? -0.02 : 0.02))) });
              } else if (e.key === 'Delete' || e.key === 'Backspace') {
                remove(i);
              }
            }}
          />
        ))}
      </div>

      {selected && (
        <div className="stop-row">
          <label className="stop-color" style={{ '--c': selected.color } as React.CSSProperties}>
            <input type="color" value={selected.color} aria-label="Stop color" onChange={(e) => update(sel, { color: e.target.value })} />
          </label>
          <input
            className="hex-input"
            value={selected.color.toUpperCase()}
            aria-label="Hex color"
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#?[0-9a-f]{6}$/i.test(v)) update(sel, { color: (v.startsWith('#') ? v : `#${v}`).toLowerCase() });
            }}
          />
          <span className="stop-pos">{Math.round(selected.pos * 100)}%</span>
          <button type="button" className="icon-btn" disabled={value.length <= 1} onClick={() => remove(sel)} title="Remove stop">
            <TrashIcon />
          </button>
        </div>
      )}

      <div className="quick-palettes">
        {QUICK.map((q) => (
          <button
            key={q.name}
            type="button"
            className="quick-palette"
            title={q.name}
            aria-label={`Use ${q.name} gradient`}
            style={{ background: cssGradient(q.palette) }}
            onClick={() => {
              onChange(structuredClone(q.palette));
              setSel(0);
            }}
          />
        ))}
      </div>
    </div>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M6 2h4M3 4h10M5 4l.6 9h4.8L11 4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
