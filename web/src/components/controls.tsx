import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

// ---- help -------------------------------------------------------------------------

/**
 * Small ⓘ button that explains a control in plain words. Opens on hover or focus,
 * stays open on click, and closes with Escape or a click elsewhere. The bubble is
 * position: fixed so scrolling panels can't clip it.
 */
export function InfoTip({ text, label }: { text: string; label: string }) {
  const btn = useRef<HTMLButtonElement>(null);
  const tipId = useId();
  const [hover, setHover] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const open = hover || pinned;

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const width = 260;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, r.left + r.width / 2 - width / 2));
    const below = r.bottom + 8;
    setPos({ top: below + 120 > window.innerHeight ? r.top - 8 : below, left });
  }, [open]);

  useEffect(() => {
    if (!pinned) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof PointerEvent && btn.current?.contains(e.target as Node)) return;
      setPinned(false);
      setHover(false);
    };
    window.addEventListener('keydown', close);
    window.addEventListener('pointerdown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', close);
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [pinned]);

  const above = pos && btn.current && pos.top < btn.current.getBoundingClientRect().top;

  return (
    <>
      <button
        ref={btn}
        type="button"
        className={`info-tip ${open ? 'open' : ''}`}
        aria-label={`About ${label}`}
        aria-describedby={open ? tipId : undefined}
        aria-expanded={open}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => {
          setHover(false);
          setPinned(false);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPinned((p) => !p);
        }}
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="8" cy="8" r="6.6" fill="none" stroke="currentColor" strokeWidth="1.3" />
          <path d="M8 7.2v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="4.9" r="0.95" fill="currentColor" />
        </svg>
      </button>
      {open && pos && (
        <span
          id={tipId}
          role="tooltip"
          className={`info-bubble ${above ? 'above' : ''}`}
          style={{ top: pos.top, left: pos.left }}
        >
          {text}
        </span>
      )}
    </>
  );
}

function LabelText({ children, info, htmlFor }: { children: ReactNode; info?: string; htmlFor?: string }) {
  return (
    <span className="label-wrap">
      {htmlFor ? <label htmlFor={htmlFor}>{children}</label> : <span className="label">{children}</span>}
      {info && <InfoTip text={info} label={typeof children === 'string' ? children : 'this setting'} />}
    </span>
  );
}

// ---- basic controls ------------------------------------------------------------------

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
  info,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  info?: string;
}) {
  const id = useId();
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="field">
      <div className="field-head">
        <LabelText htmlFor={id} info={info}>
          {label}
        </LabelText>
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
  info,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  info?: string;
}) {
  return (
    <div className="field">
      <div className="field-head">
        <LabelText info={info}>{label}</LabelText>
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

export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  info,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  info?: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="stepper">
      <LabelText info={info}>{label}</LabelText>
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

/** A labelled row with a control on the right (used for on/off switches). */
export function Row({ title, sub, info, children }: { title: string; sub?: string; info?: string; children: ReactNode }) {
  return (
    <div className="row">
      <div>
        <div className="row-title">
          <LabelText info={info}>{title}</LabelText>
        </div>
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

// ---- layout -----------------------------------------------------------------------

/** A titled group inside a panel. Always open. */
export function Section({ title, children, aside, info }: { title: string; children: ReactNode; aside?: ReactNode; info?: string }) {
  return (
    <section className="section">
      <header>
        <span className="section-title">
          <h3>{title}</h3>
          {info && <InfoTip text={info} label={title} />}
        </span>
        {aside}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

function readOpen(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(`lumen.panel.${key}`);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

/**
 * Top-level collapsible panel (Zones, Presets, Customize). Remembers whether it was
 * open in this browser.
 */
export function Panel({
  id,
  title,
  info,
  aside,
  children,
  defaultOpen = true,
  className = '',
}: {
  id: string;
  title: string;
  info?: string;
  aside?: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(() => readOpen(id, defaultOpen));
  const bodyId = useId();
  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(`lumen.panel.${id}`, o ? '0' : '1');
      } catch {
        /* storage unavailable: still works for this visit */
      }
      return !o;
    });
  };
  return (
    <section className={`panel-block ${open ? 'open' : 'closed'} ${className}`}>
      <header className="panel-head">
        <button type="button" className="panel-toggle" aria-expanded={open} aria-controls={bodyId} onClick={toggle}>
          <Chevron open={open} />
          <h2>{title}</h2>
        </button>
        {info && <InfoTip text={info} label={title} />}
        <span className="panel-aside">{open && aside}</span>
      </header>
      {open && (
        <div id={bodyId} className="panel-body">
          {children}
        </div>
      )}
    </section>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 12 12"
      width="11"
      height="11"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .18s' }}
    >
      <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ---- specialised controls ---------------------------------------------------------------

/** Circular direction picker; 0° points right, angles grow counter-clockwise. */
export function AngleDial({
  label,
  value,
  onChange,
  info,
}: {
  label: string;
  value: number;
  onChange: (deg: number) => void;
  info?: string;
}) {
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
        <LabelText info={info}>{label}</LabelText>
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
  info,
}: {
  label: string;
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  info?: string;
}) {
  return (
    <div className="field">
      <div className="field-head">
        <LabelText info={info}>{label}</LabelText>
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
