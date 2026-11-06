import { useEffect, useState } from 'react';
import { BUILTIN_PRESETS } from '../../../shared/presets.ts';
import type { ColorOrder, Scene, ZoneRuntime, ZoneSettings } from '../../../shared/types.ts';
import { HELP } from '../help.ts';
import { InfoTip, openPanel, Row, Section, Slider, Stepper, Toggle } from './controls.tsx';
import { PresetEditBanner, Presets } from './Presets.tsx';
import { StackEditor } from './StackEditor.tsx';

const ORDERS: ColorOrder[] = ['RGB', 'RBG', 'GRB', 'GBR', 'BRG', 'BGR'];
const KIND_TEXT = { ram: 'RAM', fans: 'Fans', gpu: 'Graphics card', accent: 'Lighting strip', device: 'Device' };

export function GlobalInspector({ scene, update }: { scene: Scene; update: (m: (s: Scene) => void) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  // Stop editing if that preset disappears (deleted, or replaced by an import).
  useEffect(() => {
    if (editing && !scene.presets.some((p) => p.id === editing)) setEditing(null);
  }, [editing, scene.presets]);
  return (
    <div className="inspector">
      <Presets
        scene={scene}
        update={update}
        editing={editing}
        onEdit={(id) => {
          setEditing(id);
          if (id) openPanel('customize');
        }}
      />
      <StackEditor
        banner={editing && <PresetEditBanner scene={scene} update={update} id={editing} onClose={() => setEditing(null)} />}
        stack={scene.effect}
        onChange={(effect) =>
          update((s) => {
            s.effect = effect;
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
  onBack,
}: {
  zone: ZoneRuntime;
  scene: Scene;
  update: (m: (s: Scene) => void) => void;
  identify: (id: string) => void;
  onBack: () => void;
}) {
  const s = scene.zones[zone.id];
  const [name, setName] = useState(s.label || zone.name);
  useEffect(() => setName(s.label || zone.name), [zone.id, s.label, zone.name]);

  const set = (patch: Partial<ZoneSettings>) =>
    update((sc) => {
      Object.assign(sc.zones[zone.id], patch);
    });
  const presets = [...scene.presets, ...BUILTIN_PRESETS];

  return (
    <section className="inspector zone-card" aria-label={`${name} settings`}>
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
            {KIND_TEXT[zone.kind]} · {zone.ledCount} {zone.ledCount === 1 ? 'LED' : 'LEDs'}
            {zone.via && ` · via ${zone.via}`}
          </p>
        </div>
        <Toggle checked={s.enabled} label="Zone on/off" onChange={(enabled) => set({ enabled })} />
        <button type="button" className="icon-btn close-btn" onClick={onBack} aria-label="Close zone settings" title="Close">
          ×
        </button>
      </div>

      <Section title="Output">
        <Slider label="Brightness" info={HELP.zoneBrightness} value={s.brightness} onChange={(brightness) => set({ brightness })} />
        <Row title="Follow global effect" sub="Turn off to give this zone its own effect." info={HELP.follow}>
          <Toggle
            checked={s.synced}
            label="Follow global effect"
            onChange={(synced) => set(synced ? { synced } : { synced, effect: structuredClone(scene.effect) })}
          />
        </Row>
        {!s.synced && (
          <div className="field">
            <div className="field-head">
              <span className="label-wrap">
                <label htmlFor="zone-preset">Start from a preset</label>
                <InfoTip text={HELP.zonePreset} label="Start from a preset" />
              </span>
            </div>
            <select
              id="zone-preset"
              className="select"
              value=""
              onChange={(e) => {
                const p = presets.find((x) => x.id === e.target.value);
                if (p) set({ effect: structuredClone(p.stack) });
              }}
            >
              <option value="" disabled>
                Choose…
              </option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.builtin ? '' : ' (yours)'}
                </option>
              ))}
            </select>
          </div>
        )}
      </Section>

      {!s.synced && (
        <StackEditor
          panelId="customize-zone"
          title="Zone effect"
          info={HELP.zoneEffect}
          stack={s.effect}
          onChange={(effect) => set({ effect })}
        />
      )}

      <Section
        title="Hardware"
        aside={
          <span className="label-wrap">
            <button type="button" className="ghost-btn" onClick={() => identify(zone.id)}>
              Identify
            </button>
            <InfoTip text={HELP.identify} label="Identify" />
          </span>
        }
      >
        {zone.configurable && (
          <>
            <Stepper
              label="LEDs connected"
              info={HELP.ledsConnected}
              value={s.ledCount ?? 40}
              min={1}
              max={zone.maxLeds}
              onChange={(ledCount) => set({ ledCount })}
            />
            <Stepper
              label="Fans on this header"
              info={HELP.fansOnHeader}
              value={s.fanCount ?? 1}
              min={0}
              max={8}
              onChange={(fanCount) => set({ fanCount })}
            />
          </>
        )}
        <div className="field">
          <div className="field-head">
            <span className="label-wrap">
              <label htmlFor="order">Color order</label>
              <InfoTip text={HELP.colorOrder} label="Color order" />
            </span>
          </div>
          <select id="order" className="select" value={s.colorOrder} onChange={(e) => set({ colorOrder: e.target.value as ColorOrder })}>
            {ORDERS.map((o) => (
              <option key={o} value={o}>
                {o}
                {o === 'RGB' ? ' (default)' : ''}
              </option>
            ))}
          </select>
        </div>
      </Section>
    </section>
  );
}
