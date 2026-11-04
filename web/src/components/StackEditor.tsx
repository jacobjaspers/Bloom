import { useEffect, useMemo, useState } from 'react';
import { BLENDS, CURVES, EFFECT_BY_ID, EFFECTS, makeLayer, newKey } from '../../../shared/effects.ts';
import { MAX_LAYERS } from '../../../shared/stack.ts';
import type { EffectId, EffectStack, Layer } from '../../../shared/types.ts';
import { HELP } from '../help.ts';
import { AngleDial, DualRange, InfoTip, Panel, Section, Segmented, Slider, Toggle } from './controls.tsx';
import { GradientEditor, TrashIcon } from './GradientEditor.tsx';
import { StackThumb } from './Thumb.tsx';

/**
 * The Customize panel: layer list on top, the selected layer's controls below.
 * `panelId` keeps the open/closed state separate for the global and per-zone editors.
 */
export function StackEditor({
  stack,
  onChange,
  panelId = 'customize',
}: {
  stack: EffectStack;
  onChange: (s: EffectStack) => void;
  panelId?: string;
}) {
  const layers = stack.layers;
  const [selKey, setSelKey] = useState(layers[layers.length - 1]?.key);
  useEffect(() => {
    if (!layers.some((l) => l.key === selKey)) setSelKey(layers[layers.length - 1]?.key);
  }, [layers, selKey]);
  const selIndex = Math.max(0, layers.findIndex((l) => l.key === selKey));
  const layer = layers[selIndex];

  const setLayers = (next: Layer[]) => onChange({ layers: next });
  const patch = (i: number, p: Partial<Layer>) => setLayers(layers.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= layers.length) return;
    const next = [...layers];
    [next[i], next[j]] = [next[j], next[i]];
    setLayers(next);
  };

  return (
    <Panel id={panelId} title="Customize" info={HELP.customize}>
      <Section
        title="Layers"
        info={HELP.layers}
        aside={
          <button
            type="button"
            className="ghost-btn"
            disabled={layers.length >= MAX_LAYERS}
            onClick={() => {
              const l = makeLayer('twinkle', { blend: 'screen' });
              setLayers([...layers, l]);
              setSelKey(l.key);
            }}
          >
            + Add layer
          </button>
        }
      >
        <ol className="layers" aria-label="Effect layers, top layer first">
          {[...layers].reverse().map((l) => {
            const i = layers.indexOf(l);
            const single = { layers: [{ ...l, enabled: true, opacity: 100 }] };
            return (
              <li key={l.key} className={`layer ${i === selIndex ? 'active' : ''} ${l.enabled ? '' : 'muted'}`}>
                <button
                  type="button"
                  className="layer-eye"
                  aria-pressed={l.enabled}
                  aria-label={l.enabled ? 'Hide layer' : 'Show layer'}
                  onClick={() => patch(i, { enabled: !l.enabled })}
                >
                  <EyeIcon off={!l.enabled} />
                </button>
                <button type="button" className="layer-main" onClick={() => setSelKey(l.key)}>
                  <StackThumb stack={single} className="layer-thumb" />
                  <span className="layer-text">
                    <span className="layer-name">{EFFECT_BY_ID[l.effect].name}</span>
                    <span className="layer-sub">
                      {i === 0 ? 'Base' : `${BLENDS.find((b) => b.value === l.blend)?.label} · ${l.opacity}%`}
                    </span>
                  </span>
                </button>
                <div className="layer-tools">
                  <button type="button" className="icon-btn" aria-label="Move layer up" disabled={i === layers.length - 1} onClick={() => move(i, 1)}>
                    ↑
                  </button>
                  <button type="button" className="icon-btn" aria-label="Move layer down" disabled={i === 0} onClick={() => move(i, -1)}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Duplicate layer"
                    disabled={layers.length >= MAX_LAYERS}
                    onClick={() => {
                      const copy = { ...structuredClone(l), key: newKey() };
                      const next = [...layers];
                      next.splice(i + 1, 0, copy);
                      setLayers(next);
                      setSelKey(copy.key);
                    }}
                  >
                    ⧉
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Delete layer"
                    disabled={layers.length <= 1}
                    onClick={() => setLayers(layers.filter((_, k) => k !== i))}
                  >
                    <TrashIcon />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      {layer && <LayerEditor key={layer.key} layer={layer} isBase={selIndex === 0} onChange={(p) => patch(selIndex, p)} />}
    </Panel>
  );
}

function LayerEditor({ layer, isBase, onChange }: { layer: Layer; isBase: boolean; onChange: (p: Partial<Layer>) => void }) {
  const meta = EFFECT_BY_ID[layer.effect];
  const u = meta.uses;
  const previews = useMemo(
    () =>
      Object.fromEntries(
        EFFECTS.map((e) => [e.id, { layers: [e.id === layer.effect ? { ...layer, enabled: true, opacity: 100 } : makeLayer(e.id)] }]),
      ),
    [layer],
  );

  const switchTo = (id: EffectId) => {
    if (id === layer.effect) return;
    // Keep everything the user tuned that still makes sense; take effect-specific defaults.
    const fresh = makeLayer(id);
    onChange({
      ...fresh,
      key: layer.key,
      enabled: layer.enabled,
      palette: layer.palette,
      speed: layer.speed,
      angle: layer.angle,
      reverse: layer.reverse,
      minBrightness: layer.minBrightness,
      maxBrightness: layer.maxBrightness,
      hueDrift: layer.hueDrift,
      spread: layer.spread,
      blend: layer.blend,
      opacity: layer.opacity,
    });
  };

  return (
    <>
      <Section title="Effect" info={HELP.effect}>
        <div className="effect-grid" role="radiogroup" aria-label="Effect">
          {EFFECTS.map((e) => (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={e.id === layer.effect}
              className={`effect-card ${e.id === layer.effect ? 'active' : ''}`}
              title={e.blurb}
              onClick={() => switchTo(e.id)}
            >
              <StackThumb stack={previews[e.id]} />
              <span>{e.name}</span>
            </button>
          ))}
        </div>
        <p className="blurb">{meta.blurb}</p>
      </Section>

      <Section title="Colors" info={HELP.colors}>
        <GradientEditor value={layer.palette} onChange={(palette) => onChange({ palette })} />
      </Section>

      {(u.speed || u.size || u.angle || u.curve) && (
        <Section title="Motion">
          {u.speed && (
            <div className="row-tight">
              <div className="grow">
                <Slider label="Speed" info={HELP.speed} value={layer.speed} onChange={(speed) => onChange({ speed })} />
              </div>
              <div className="mini-toggle">
                <span className="label-wrap">
                  <span>Reverse</span>
                  <InfoTip text={HELP.reverse} label="Reverse" />
                </span>
                <Toggle checked={layer.reverse} label="Reverse direction" onChange={(reverse) => onChange({ reverse })} />
              </div>
            </div>
          )}
          {u.curve && (
            <Segmented
              label={meta.curveLabel ?? 'Curve'}
              info={HELP.curve}
              value={layer.curve}
              options={CURVES.map((c) => ({ value: c.value, label: c.label, title: c.title }))}
              onChange={(curve) => onChange({ curve })}
            />
          )}
          {u.size && (
            <Slider label={meta.sizeLabel ?? 'Size'} info={HELP.size} value={layer.size} onChange={(size) => onChange({ size })} />
          )}
          {u.angle && <AngleDial label="Direction" info={HELP.direction} value={layer.angle} onChange={(angle) => onChange({ angle })} />}
        </Section>
      )}

      <Section title="Light">
        {u.intensity && (
          <Slider label="Contrast" info={HELP.contrast} value={layer.intensity} onChange={(intensity) => onChange({ intensity })} />
        )}
        <DualRange
          label="Brightness range"
          info={HELP.brightnessRange}
          low={layer.minBrightness}
          high={layer.maxBrightness}
          onChange={(minBrightness, maxBrightness) => onChange({ minBrightness, maxBrightness })}
        />
        <Slider
          label="Hue drift"
          info={HELP.hueDrift}
          value={layer.hueDrift}
          max={180}
          suffix="°"
          onChange={(hueDrift) => onChange({ hueDrift })}
        />
      </Section>

      {u.spread && (
        <Section title="Sync">
          <Slider label="Offset between devices" info={HELP.spread} value={layer.spread} onChange={(spread) => onChange({ spread })} />
        </Section>
      )}

      <Section title="Blending">
        {!isBase && (
          <Segmented
            label="Blend mode"
            info={HELP.blend}
            value={layer.blend}
            options={BLENDS.map((b) => ({ value: b.value, label: b.label }))}
            onChange={(blend) => onChange({ blend })}
          />
        )}
        <Slider label="Opacity" info={HELP.opacity} value={layer.opacity} onChange={(opacity) => onChange({ opacity })} />
        {isBase && <p className="hint">This is the base layer. Layers you add above it blend onto it.</p>}
      </Section>
    </>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="8" cy="8" r="2" fill="currentColor" />
      {off && <path d="M2.5 13.5l11-11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
}
