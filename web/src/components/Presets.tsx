import { useEffect, useRef, useState } from 'react';
import { newKey } from '../../../shared/effects.ts';
import { BUILTIN_PRESETS } from '../../../shared/presets.ts';
import { sanitizePresets } from '../../../shared/stack.ts';
import type { EffectStack, Preset, Scene } from '../../../shared/types.ts';
import { HELP } from '../help.ts';
import { InfoTip, Panel } from './controls.tsx';
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

export function Presets({
  scene,
  update,
  editing,
  onEdit,
}: {
  scene: Scene;
  update: (m: (s: Scene) => void) => void;
  /** Id of the preset currently open in the editor, if any. */
  editing: string | null;
  onEdit: (id: string | null) => void;
}) {
  const [naming, setNaming] = useState<null | { mode: 'new' }>(null);
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  // Two-click delete (browser confirm dialogs can be blocked in embedded browsers).
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingDelete) return;
    const t = window.setTimeout(() => setPendingDelete(null), 3000);
    return () => window.clearTimeout(t);
  }, [pendingDelete]);
  const fileInput = useRef<HTMLInputElement>(null);

  const all = [...BUILTIN_PRESETS, ...scene.presets];
  const active = all.find((p) => p.id === scene.activePreset);
  const edited = !!active && stackSig(active.stack) !== stackSig(scene.effect);

  const apply = (p: Preset) => {
    if (editing && editing !== p.id) onEdit(null);
    update((s) => {
      s.effect = withFreshKeys(p.stack);
      s.activePreset = p.id;
    });
  };

  const duplicate = (p: Preset) => {
    const id = `user:${newKey()}`;
    const copy = { id, name: `${p.name} copy`.slice(0, 48), stack: withFreshKeys(p.stack) };
    update((s) => {
      s.presets.push(copy);
    });
    flash(`Added “${copy.name}” to your presets`);
    return copy;
  };

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(''), 2600);
  };

  const commitName = () => {
    const n = name.trim().slice(0, 48);
    if (!n || !naming) return setNaming(null);
    const id = `user:${newKey()}`;
    update((s) => {
      s.presets.push({ id, name: n, stack: structuredClone(s.effect) });
      s.activePreset = id;
    });
    flash(`Saved “${n}”`);
    setNaming(null);
  };

  const card = (p: Preset) => {
    const isActive = p.id === scene.activePreset;
    return (
      <div key={p.id} className={`preset-card ${isActive ? 'active' : ''} ${p.credit ? 'egg' : ''} ${editing === p.id ? 'editing' : ''}`}>
        <button type="button" className="preset-main" onClick={() => apply(p)} aria-pressed={isActive}>
          <StackThumb stack={p.stack} className="preset-thumb" />
          <span className="preset-name">
            {p.name}
            {p.credit && (
              <span className="egg-mark" title={p.credit} aria-label={p.credit}>
                ✦
              </span>
            )}
            {editing === p.id ? <span className="badge editing">editing</span> : isActive && edited && <span className="badge">edited</span>}
          </span>
        </button>
        {p.builtin ? (
          <div className="preset-tools">
            <button
              type="button"
              className="icon-btn"
              title="Duplicate to your presets so you can edit it"
              aria-label={`Duplicate ${p.name} to your presets`}
              onClick={() => duplicate(p)}
            >
              ⧉
            </button>
          </div>
        ) : (
          <div className="preset-tools">
            <button
              type="button"
              className="icon-btn"
              title="Edit"
              aria-label={`Edit ${p.name}`}
              onClick={() => {
                apply(p);
                onEdit(p.id);
              }}
            >
              ✎
            </button>
            <button type="button" className="icon-btn" title="Duplicate" aria-label={`Duplicate ${p.name}`} onClick={() => duplicate(p)}>
              ⧉
            </button>
            <button
              type="button"
              className="icon-btn"
              title="Export"
              aria-label={`Export ${p.name}`}
              onClick={() => download(`bloom-${slug(p.name)}.json`, { app: 'bloom', version: 1, presets: [p] })}
            >
              ⤓
            </button>
            {pendingDelete === p.id ? (
              <button
                type="button"
                className="ghost-btn danger tiny"
                aria-label={`Confirm delete ${p.name}`}
                onClick={() => {
                  setPendingDelete(null);
                  if (editing === p.id) onEdit(null);
                  update((s) => {
                    s.presets = s.presets.filter((x) => x.id !== p.id);
                    if (s.activePreset === p.id) delete s.activePreset;
                  });
                  flash(`Deleted “${p.name}”`);
                }}
              >
                Delete?
              </button>
            ) : (
              <button type="button" className="icon-btn" title="Delete" aria-label={`Delete ${p.name}`} onClick={() => setPendingDelete(p.id)}>
                <TrashIcon />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <Panel
      id="presets"
      title="Presets"
      info={HELP.presets}
      aside={
        <div className="preset-actions">
          <button type="button" className="ghost-btn" onClick={() => fileInput.current?.click()}>
            Import
          </button>
          <button
            type="button"
            className="ghost-btn"
            disabled={!scene.presets.length}
            onClick={() => download('bloom-presets.json', { app: 'bloom', version: 1, presets: scene.presets })}
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
            flash('That file isn’t a Bloom preset file');
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
              Save
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
            {active && edited && !active.builtin && !editing && (
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  update((s) => {
                    const p = s.presets.find((x) => x.id === active.id);
                    if (p) p.stack = structuredClone(s.effect);
                  });
                  flash(`Saved changes to “${active.name}”`);
                }}
              >
                Save changes to “{active.name}”
              </button>
            )}
            {active && edited && !editing && (
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
          <h4 className="sub-head">
            Yours <InfoTip text={HELP.yours} label="Your presets" />
          </h4>
          <div className="preset-grid">{scene.presets.map(card)}</div>
        </>
      )}
      <h4 className="sub-head">
        Built-in <InfoTip text={HELP.builtIn} label="Built-in presets" />
      </h4>
      <div className="preset-grid">{BUILTIN_PRESETS.map(card)}</div>
    </Panel>
  );
}

/**
 * Shown at the top of Customize while one of your presets is open for editing:
 * rename it, then save the changes back to it or cancel and restore what was saved.
 */
export function PresetEditBanner({
  scene,
  update,
  id,
  onClose,
}: {
  scene: Scene;
  update: (m: (s: Scene) => void) => void;
  id: string;
  onClose: () => void;
}) {
  const preset = scene.presets.find((p) => p.id === id);
  const [name, setName] = useState(preset?.name ?? '');
  useEffect(() => setName(preset?.name ?? ''), [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!preset) return null;

  const changed = stackSig(preset.stack) !== stackSig(scene.effect) || name.trim() !== preset.name;

  const save = () => {
    const n = name.trim().slice(0, 48) || preset.name;
    update((s) => {
      const p = s.presets.find((x) => x.id === id);
      if (!p) return;
      p.name = n;
      p.stack = structuredClone(s.effect);
      s.activePreset = id;
    });
    onClose();
  };

  const cancel = () => {
    update((s) => {
      s.effect = withFreshKeys(preset.stack);
      s.activePreset = id;
    });
    onClose();
  };

  return (
    <div className="edit-banner" role="region" aria-label={`Editing preset ${preset.name}`}>
      <div className="edit-banner-head">
        <span className="edit-dot" aria-hidden="true" />
        <span>Editing preset</span>
      </div>
      <input
        className="text-input"
        value={name}
        maxLength={48}
        aria-label="Preset name"
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') cancel();
        }}
      />
      <p className="hint">Change anything below, then save it back to this preset.</p>
      <div className="edit-banner-actions">
        <button type="button" className="primary-btn" disabled={!changed} onClick={save}>
          Save changes
        </button>
        <button type="button" className="ghost-btn" onClick={cancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
