import { useEffect, useState } from 'react';
import { useAmbientGlow, useAmbientSetting } from './ambient.ts';
import { InfoTip, Panel, Toggle } from './components/controls.tsx';
import { HELP } from './help.ts';
import { GlobalInspector, ZoneInspector } from './components/Inspector.tsx';
import { Stage } from './components/Stage.tsx';
import { DeviceList, ZoneList } from './components/ZoneList.tsx';
import { useLumen } from './useLumen.ts';

/** How long the startup sequence plays when the dashboard opens. */
export const INTRO_MS = 2600;

export function App() {
  const { state, frames, updateScene, identify } = useLumen();
  const [selected, setSelected] = useState<string | null>(null);
  const { scene, zones, devices, connected, demo } = state;
  const zone = zones.find((z) => z.id === selected) ?? null;
  const [ambient, setAmbient] = useAmbientSetting();
  useAmbientGlow(frames, zones, ambient);

  // Play the intro once, the first time the dashboard has something to show.
  const [intro, setIntro] = useState<'pending' | 'playing' | 'done'>('pending');
  useEffect(() => {
    if (!scene || intro !== 'pending') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIntro('done');
      return;
    }
    setIntro('playing');
    const t = window.setTimeout(() => setIntro('done'), INTRO_MS);
    return () => window.clearTimeout(t);
  }, [scene, intro]);

  return (
    <div className={`app ${intro === 'playing' ? 'intro' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <span className="wordmark">Lumen</span>
          <span className={`conn ${connected ? 'ok' : ''}`}>{connected ? (demo ? 'Demo' : 'Live') : 'Connecting…'}</span>
        </div>
        {scene && (
          <div className="master">
            <div className="power">
              <span className="label-wrap">
                <span>Glow</span>
                <InfoTip text={HELP.ambient} label="Glow" />
              </span>
              <Toggle checked={ambient} label="Ambient glow" onChange={setAmbient} />
            </div>
            <label className="master-bright">
              <span>Brightness</span>
              <input
                type="range"
                className="slider"
                min={0}
                max={100}
                value={scene.brightness}
                style={{ '--pct': `${scene.brightness}%` } as React.CSSProperties}
                onChange={(e) =>
                  updateScene((s) => {
                    s.brightness = Number(e.target.value);
                  })
                }
              />
              <span className="value">{scene.brightness}%</span>
            </label>
            <div className="power">
              <span>{scene.power ? 'On' : 'Off'}</span>
              <Toggle
                checked={scene.power}
                label="All lighting on/off"
                onChange={(power) =>
                  updateScene((s) => {
                    s.power = power;
                  })
                }
              />
            </div>
          </div>
        )}
      </header>

      {!scene ? (
        <main className="loading">
          <div className="spinner" aria-hidden="true" />
          <p>Waiting for the Lumen service on this PC…</p>
          <p className="hint">Start it with <code>npm start</code></p>
        </main>
      ) : (
        <main className="layout">
          <aside className="sidebar">
            <Panel id="zones" title="Zones" info={HELP.zones} className="zones-panel">
              <ZoneList
                scene={scene}
                zones={zones}
                frames={frames}
                selected={selected}
                onSelect={setSelected}
                onToggle={(id, on) =>
                  updateScene((s) => {
                    s.zones[id].enabled = on;
                  })
                }
              />
              <DeviceList devices={devices} demo={demo} />
            </Panel>
          </aside>

          <section className="stage-wrap" aria-label="Preview">
            <Stage
              scene={scene}
              zones={zones}
              devices={devices}
              frames={frames}
              selected={selected}
              onSelect={setSelected}
              intro={intro === 'playing'}
              onPlace={(id, place) =>
                updateScene((sc) => {
                  if (sc.zones[id]) sc.zones[id].place = place;
                })
              }
              onResetLayout={() =>
                updateScene((sc) => {
                  for (const z of Object.values(sc.zones)) delete z.place;
                })
              }
            />
            {!scene.power && <div className="stage-off">Lighting is off</div>}
          </section>

          <aside className="panel">
            {zone ? (
              <ZoneInspector
                key={zone.id}
                zone={zone}
                scene={scene}
                update={updateScene}
                identify={identify}
                onBack={() => setSelected(null)}
              />
            ) : (
              <GlobalInspector scene={scene} update={updateScene} />
            )}
          </aside>
        </main>
      )}
    </div>
  );
}
