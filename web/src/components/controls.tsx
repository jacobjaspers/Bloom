import { useId, useRef, useState, type ReactNode } from 'react';

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  suffix = '%',
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="field">
      <div className="field-head">
        <label htmlFor={id}>{label}</label>
        <span className="value">
          {value}
          {suffix}
        </span>
      </div>
      <input
        id={id}
        type="range"
        className="slider"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ '--pct': `${pct}%` } as React.CSSProperties}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="field">
      <div className="field-head">
        <span className="label">{label}</span>
      </div>
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            title={o.title}
            className={o.value === value ? 'active' : ''}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Swatch({ color, onChange, label }: { color: string; onChange: (c: string) => void; label: string }) {
  return (
    <label className="swatch" style={{ '--c': color } as React.CSSProperties} title={`${label}: ${color}`}>
      <input type="color" value={color} aria-label={label} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="stepper">
      <span className="label">{label}</span>
      <div className="stepper-ctl">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - 1))}>
          −
        </button>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          aria-label={label}
          onChange={(e) => {
            const v = Number(e.target.value);
            if (Number.isFinite(v)) onChange(clamp(Math.round(v)));
          }}
        />
        <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + 1))}>
          +
        </button>
      </div>
    </div>
  );
}

export function Section({
  title,
  children,
  aside,
  collapsible = false,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <section className={`section ${open ? '' : 'closed'}`}>
      <header>
        {collapsible ? (
          <button type="button" className="section-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            <Chevron open={open} />
            <h3>{title}</h3>
          </button>
        ) : (
          <h3>{title}</h3>
        )}
        {aside}
      </header>
      {open && (
        <div id={id} className="section-body">
          {children}
        </div>
      )}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Circular direction picker; 0° points right, angles grow counter-clockwise. */
export function AngleDial({ label, value, onChange }: { label: string; value: number; onChange: (deg: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (clientX: number, clientY: number) => {
    const r = ref.current!.getBoundingClientRect();
    const a = Math.atan2(-(clientY - (r.top + r.height / 2)), clientX - (r.left + r.width / 2));
    let deg = Math.round(((a * 180) / Math.PI + 360) % 360);
    // Snap to 45° steps when close.
    const snap = Math.round(deg / 45) * 45;
    if (Math.abs(snap - deg) < 6) deg = snap % 360;
    onChange(deg);
  };
  return (
    <div className="field">
      <div className="field-head">
        <span className="label">{label}</span>
        <span className="value">{value}°</span>
      </div>
      <div className="angle-row">
        <div
          ref={ref}
          className="dial"
          role="slider"
          tabIndex={0}
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={value}
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture(e.pointerId);
            set(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => e.buttons === 1 && set(e.clientX, e.clientY)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') onChange((value + 355) % 360);
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') onChange((value + 5) % 360);
          }}
        >
          <span className="dial-hand" style={{ transform: `rotate(${-value}deg)` }} />
        </div>
        <div className="angle-presets">
          {[
            [180, '←'],
            [0, '→'],
            [90, '↑'],
            [270, '↓'],
            [45, '↗'],
            [135, '↖'],
          ].map(([deg, glyph]) => (
            <button
              key={deg}
              type="button"
              className={value === deg ? 'active' : ''}
              aria-label={`${deg} degrees`}
              onClick={() => onChange(deg as number)}
            >
              {glyph}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Two-thumb range slider (min/max). */
export function DualRange({
  label,
  low,
  high,
  onChange,
}: {
  label: string;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
}) {
  return (
    <div className="field">
      <div className="field-head">
        <span className="label">{label}</span>
        <span className="value">
          {low}–{high}%
        </span>
      </div>
      <div className="dual-range" style={{ '--lo': `${low}%`, '--hi': `${high}%` } as React.CSSProperties}>
        <input
          type="range"
          min={0}
          max={100}
          value={low}
          aria-label={`${label} minimum`}
          onChange={(e) => onChange(Math.min(Number(e.target.value), high), high)}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={high}
          aria-label={`${label} maximum`}
          onChange={(e) => onChange(low, Math.max(Number(e.target.value), low))}
        />
      </div>
    </div>
  );
}
