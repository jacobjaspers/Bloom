import { useRef, useState } from 'react';
import { newKey } from '../../../shared/effects.ts';
import { BUILTIN_PRESETS } from '../../../shared/presets.ts';
import { sanitizePresets } from '../../../shared/stack.ts';
import type { EffectStack, Preset, Scene } from '../../../shared/types.ts';
import { Section } from './controls.tsx';
import { TrashIcon } from './GradientEditor.tsx';
import { StackThumb } from './Thumb.tsx';

/** Compare stacks by content, ignoring React keys and property order. */
export function stackSig(s: EffectStack): string {
  return JSON.stringify(
    s.layers.map(({ key: _k, ...rest }) =>
      Object.keys(rest)
        .sort()
        .map((k) => [k, rest[k as keyof typeof rest]]),
    ),
  );
}

function withFreshKeys(s: EffectStack): EffectStack {
  return { layers: s.layers.map((l) => ({ ...structuredClone(l), key: newKey() })) };
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'preset';

export function Presets({ scene, update }: { scene: Scene; update: (m: (s: Scene) => void) => void }) {
  const [naming, setNaming] = useState<null | { mode: 'new' } | { mode: 'rename'; id: string }>(null);
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const all = [...BUILTIN_PRESETS, ...scene.presets];
  const active = all.find((p) => p.id === scene.activePreset);
  const edited = !!active && stackSig(active.stack) !== stackSig(scene.effect);

  const apply = (p: Preset) =>
    update((s) => {
      s.effect = withFreshKeys(p.stack);
      s.activePreset = p.id;
    });

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2600);
  };

  const commitName = () => {
    const n = name.trim().slice(0, 48);
    if (!n || !naming) return setNaming(null);
    if (naming.mode === 'new') {
      const id = `user:${newKey()}`;
      update((s) => {
        s.presets.push({ id, name: n, stack: structuredClone(s.effect) });
        s.activePreset = id;
      });
      flash(`Saved “${n}”`);
    } else {
      update((s) => {
        const p = s.presets.find((x) => x.id === naming.id);
        if (p) p.name = n;
      });
    }
    setNaming(null);
  };

  const card = (p: Preset) => {
    const isActive = p.id === scene.activePreset;
    return (
      <div key={p.id} className={`preset-card ${isActive ? 'active' : ''}`}>
        <button type="button" className="preset-main" onClick={() => apply(p)} aria-pressed={isActive}>
          <StackThumb stack={p.stack} className="preset-thumb" />
          <span className="preset-name">
            {p.name}
            {isActive && edited && <span className="badge">edited</span>}
          </span>
        </button>
        {!p.builtin && (
          <div className="preset-tools">
            <button
              type="button"
              className="icon-btn"
              title="Rename"
              aria-label={`Rename ${p.name}`}
              onClick={() => {
                setName(p.name);
                setNaming({ mode: 'rename', id: p.id });
              }}
            >
              ✎
            </button>
            <button type="button" className="icon-btn" title="Export" aria-label={`Export ${p.name}`} onClick={() => download(`lumen-${slug(p.name)}.json`, { app: 'lumen', version: 1, presets: [p] })}>
              ⤓
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Delete"
              aria-label={`Delete ${p.name}`}
              onClick={() => {
                if (!window.confirm(`Delete the preset “${p.name}”?`)) return;
                update((s) => {
                  s.presets = s.presets.filter((x) => x.id !== p.id);
                  if (s.activePreset === p.id) delete s.activePreset;
                });
              }}
            >
              <TrashIcon />
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <Section
      title="Presets"
      aside={
        <div className="preset-actions">
          <button type="button" className="ghost-btn" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <button
            type="button"
            className="ghost-btn"
            disabled={!scene.presets.length}
            onClick={() => download('lumen-presets.json', { app: 'lumen', version: 1, presets: scene.presets })}
          >
            Export all
          </button>
        </div>
      }
    >
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          try {
            const data = JSON.parse(await f.text()) as { presets?: unknown };
            const incoming = sanitizePresets(data.presets ?? data).map((p) => ({ ...p, id: `user:${newKey()}` }));
            if (!incoming.length) return flash('No presets found in that file');
            update((s) => {
              s.presets.push(...incoming);
            });
            flash(`Imported ${incoming.length} preset${incoming.length === 1 ? '' : 's'}`);
          } catch {
            flash('That file isn’t a Lumen preset file');
          }
        }}
      />

      <div className="save-row">
        {naming ? (
          <form
            className="name-form"
            onSubmit={(e) => {
              e.preventDefault();
              commitName();
            }}
          >
            <input
              autoFocus
              className="text-input"
              value={name}
              maxLength={48}
              placeholder="Preset name"
              aria-label="Preset name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setNaming(null)}
            />
            <button type="submit" className="primary-btn" disabled={!name.trim()}>
              {naming.mode === 'new' ? 'Save' : 'Rename'}
            </button>
            <button type="button" className="ghost-btn" onClick={() => setNaming(null)}>
              Cancel
            </button>
          </form>
        ) : (
          <>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                setName(active && !active.builtin ? `${active.name} copy` : 'My preset');
                setNaming({ mode: 'new' });
              }}
            >
              Save as new preset
            </button>
            {active && edited && !active.builtin && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  update((s) => {
                    const p = s.presets.find((x) => x.id === active.id);
                    if (p) p.stack = structuredClone(s.effect);
                  });
                  flash(`Updated “${active.name}”`);
                }}
              >
                Update “{active.name}”
              </button>
            )}
            {active && edited && (
              <button type="button" className="link" onClick={() => apply(active)}>
                Revert
              </button>
            )}
          </>
        )}
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {scene.presets.length > 0 && (
        <>
          <h4 className="sub-head">Yours</h4>
          <div className="preset-grid">{scene.presets.map(card)}</div>
        </>
      )}
      <h4 className="sub-head">Built-in</h4>
      <div className="preset-grid">{BUILTIN_PRESETS.map(card)}</div>
    </Section>
  );
}
