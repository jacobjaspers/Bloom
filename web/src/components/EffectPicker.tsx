import { useEffect, useMemo, useRef } from 'react';
import { createRenderer, EFFECT_BY_ID, EFFECTS } from '../../../shared/effects.ts';
import type { LedPoint } from '../../../shared/layout.ts';
import type { Direction, EffectConfig, EffectId } from '../../../shared/types.ts';
import { fitCanvas, subscribeFrame } from '../frameLoop.ts';
import { Section, Segmented, Slider, Swatch } from './controls.tsx';

const COLS = 18;
const ROWS = 7;
const GRID: LedPoint[] = [];
for (let y = 0; y < ROWS; y++) {
  for (let x = 0; x < COLS; x++) {
    const nx = (x + 0.5) / COLS;
    const ny = (y + 0.5) / ROWS;
    GRID.push({ x: nx * 100, y: ny * 75, nx, ny, u: nx, lu: nx, group: y });
  }
}

function Thumb({ effect }: { effect: EffectConfig }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const render = useMemo(() => createRenderer(effect), [effect]);
  useEffect(() => {
    const t0 = performance.now();
    // Render at grid resolution, then let the browser upscale smoothly.
    const small = document.createElement('canvas');
    small.width = COLS;
    small.height = ROWS;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(COLS, ROWS);
    return subscribeFrame((now) => {
      const c = ref.current;
      if (!c) return;
      const ctx = fitCanvas(c);
      if (!ctx) return;
      const t = (now - t0) / 1000;
      for (let i = 0; i < GRID.length; i++) {
        const [r, g, b] = render(t, GRID[i]);
        img.data[i * 4] = r;
        img.data[i * 4 + 1] = g;
        img.data[i * 4 + 2] = b;
        img.data[i * 4 + 3] = 255;
      }
      sctx.putImageData(img, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(small, 0, 0, c.clientWidth, c.clientHeight);
    });
  }, [render]);
  return <canvas ref={ref} className="thumb" aria-hidden="true" />;
}

export function EffectPicker({ value, onChange }: { value: EffectConfig; onChange: (e: EffectConfig) => void }) {
  return (
    <div className="effect-grid" role="radiogroup" aria-label="Effect">
      {EFFECTS.map((meta) => {
        const active = meta.id === value.id;
        // Show the user's own colors on the active card, defaults on the others.
        const preview = active ? value : meta.defaults;
        return (
          <button
            key={meta.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`effect-card ${active ? 'active' : ''}`}
            title={meta.blurb}
            onClick={() => !active && onChange(switchEffect(value, meta.id))}
          >
            <Thumb effect={preview} />
            <span>{meta.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Switch effect, keeping speed/direction and carrying colors over where it makes sense. */
function switchEffect(prev: EffectConfig, id: EffectId): EffectConfig {
  const meta = EFFECT_BY_ID[id];
  const next = structuredClone(meta.defaults);
  next.speed = meta.uses.speed && EFFECT_BY_ID[prev.id].uses.speed ? prev.speed : next.speed;
  next.direction = prev.direction;
  return next;
}

const DIRS: { value: Direction; label: string; title: string }[] = [
  { value: 'left', label: '←', title: 'Right to left' },
  { value: 'right', label: '→', title: 'Left to right' },
  { value: 'up', label: '↑', title: 'Bottom to top' },
  { value: 'down', label: '↓', title: 'Top to bottom' },
];

export function EffectParams({ value, onChange }: { value: EffectConfig; onChange: (e: EffectConfig) => void }) {
  const meta = EFFECT_BY_ID[value.id];
  const set = (patch: Partial<EffectConfig>) => onChange({ ...value, ...patch });
  const colors = meta.colorSlots ? (value.colors.length ? value.colors : meta.defaults.colors) : [];
  const sizeLabel: Partial<Record<EffectId, string>> = {
    rainbow: 'Wave length',
    gradient: 'Spread',
    aurora: 'Cloud size',
    ripple: 'Ring spacing',
    comet: 'Tail length',
    ember: 'Flame size',
  };

  return (
    <>
      {colors.length > 0 && (
        <div className="field">
          <div className="field-head">
            <span className="label">Colors</span>
            <button type="button" className="link" onClick={() => set({ colors: [...meta.defaults.colors] })}>
              Reset
            </button>
          </div>
          <div className="swatches">
            {colors.map((c, i) => (
              <Swatch
                key={i}
                color={c}
                label={`Color ${i + 1}`}
                onChange={(nc) => {
                  const next = [...colors];
                  next[i] = nc;
                  set({ colors: next });
                }}
              />
            ))}
          </div>
        </div>
      )}
      {meta.uses.speed && <Slider label="Speed" value={value.speed} onChange={(speed) => set({ speed })} />}
      {meta.uses.size && (
        <Slider label={sizeLabel[value.id] ?? 'Size'} value={value.size} onChange={(size) => set({ size })} />
      )}
      {meta.uses.direction && (
        <Segmented label="Direction" value={value.direction} options={DIRS} onChange={(direction) => set({ direction })} />
      )}
    </>
  );
}

export function EffectSection({
  title,
  value,
  onChange,
}: {
  title: string;
  value: EffectConfig;
  onChange: (e: EffectConfig) => void;
}) {
  return (
    <>
      <Section title={title}>
        <EffectPicker value={value} onChange={onChange} />
      </Section>
      <Section title={`${EFFECT_BY_ID[value.id].name} settings`}>
        <p className="blurb">{EFFECT_BY_ID[value.id].blurb}</p>
        <EffectParams value={value} onChange={onChange} />
      </Section>
    </>
  );
}
