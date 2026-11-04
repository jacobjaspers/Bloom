import { useEffect, useState } from 'react';
import type { ColorOrder, Scene, ZoneRuntime, ZoneSettings } from '../../../shared/types.ts';
import { PRESETS } from '../presets.ts';
import { Section, Slider, Stepper, Toggle } from './controls.tsx';
import { EffectSection } from './EffectPicker.tsx';

const ORDERS: ColorOrder[] = ['RGB', 'RBG', 'GRB', 'GBR', 'BRG', 'BGR'];

export function GlobalInspector({ scene, update }: { scene: Scene; update: (m: (s: Scene) => void) => void }) {
  return (
    <div className="inspector">
      <div className="inspector-head">
        <div>
          <h2>All zones</h2>
          <p>Zones set to Synced follow this effect.</p>
        </div>
      </div>
      <Section title="Themes">
        <div className="presets">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              className="preset"
              onClick={() =>
                update((s) => {
                  s.effect = structuredClone(p.effect);
                })
              }
            >
              <span className="preset-swatch" style={{ background: p.swatch }} />
              {p.name}
            </button>
          ))}
        </div>
      </Section>
      <EffectSection
        title="Effect"
        value={scene.effect}
        onChange={(e) =>
          update((s) => {
            s.effect = e;
          })
        }
      />
    </div>
  );
}

export function ZoneInspector({
  zone,
  scene,
  update,
  identify,
}: {
  zone: ZoneRuntime;
  scene: Scene;
  update: (m: (s: Scene) => void) => void;
  identify: (id: string) => void;
}) {
  const s = scene.zones[zone.id];
  const [name, setName] = useState(s.label || zone.name);
  useEffect(() => setName(s.label || zone.name), [zone.id, s.label, zone.name]);

  const set = (patch: Partial<ZoneSettings>) =>
    update((sc) => {
      Object.assign(sc.zones[zone.id], patch);
    });

  return (
    <div className="inspector">
      <div className="inspector-head">
        <div className="grow">
          <input
            className="title-input"
            value={name}
            aria-label="Zone name"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => set({ label: name.trim() && name.trim() !== zone.name ? name.trim() : undefined })}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <p>
            {{ ram: 'RAM stick', fans: 'Addressable RGB header', gpu: 'Graphics card logo', accent: 'Motherboard lighting' }[zone.kind]} ·{' '}
            {zone.ledCount} {zone.ledCount === 1 ? 'LED' : 'LEDs'}
          </p>
        </div>
        <Toggle checked={s.enabled} label="Zone on/off" onChange={(enabled) => set({ enabled })} />
      </div>

      <Section title="Output">
        <Slider label="Brightness" value={s.brightness} onChange={(brightness) => set({ brightness })} />
        <div className="row">
          <div>
            <div className="row-title">Follow global effect</div>
            <div className="row-sub">Turn off to give this zone its own effect.</div>
          </div>
          <Toggle
            checked={s.synced}
            label="Follow global effect"
            onChange={(synced) => set(synced ? { synced } : { synced, effect: structuredClone(scene.effect) })}
          />
        </div>
      </Section>

      {!s.synced && <EffectSection title="Effect" value={s.effect} onChange={(effect) => set({ effect })} />}

      <Section
        title="Hardware"
        aside={
          <button type="button" className="ghost-btn" onClick={() => identify(zone.id)}>
            Identify
          </button>
        }
      >
        {zone.configurable && (
          <>
            <Stepper
              label="LEDs connected"
              value={s.ledCount ?? 40}
              min={1}
              max={zone.maxLeds}
              onChange={(ledCount) => set({ ledCount })}
            />
            <Stepper label="Fans on this header" value={s.fanCount ?? 1} min={0} max={8} onChange={(fanCount) => set({ fanCount })} />
            <p className="hint">Set fans to 0 for an LED strip. Use Identify to watch a white chase run along this header.</p>
          </>
        )}
        <div className="field">
          <div className="field-head">
            <label htmlFor="order">Color order</label>
          </div>
          <select
            id="order"
            className="select"
            value={s.colorOrder}
            onChange={(e) => set({ colorOrder: e.target.value as ColorOrder })}
          >
            {ORDERS.map((o) => (
              <option key={o} value={o}>
                {o}
                {o === 'RGB' ? ' (default)' : ''}
              </option>
            ))}
          </select>
          <p className="hint">If red shows up as green, try GRB.</p>
        </div>
      </Section>
    </div>
  );
}
