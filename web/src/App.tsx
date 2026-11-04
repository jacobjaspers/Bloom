import { useState } from 'react';
import { Toggle } from './components/controls.tsx';
import { GlobalInspector, ZoneInspector } from './components/Inspector.tsx';
import { Stage } from './components/Stage.tsx';
import { DeviceList, ZoneList } from './components/ZoneList.tsx';
import { useLumen } from './useLumen.ts';

export function App() {
  const { state, frames, updateScene, identify } = useLumen();
  const [selected, setSelected] = useState<string | null>(null);
  const { scene, zones, devices, connected, demo } = state;
  const zone = zones.find((z) => z.id === selected) ?? null;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <span className="wordmark">Lumen</span>
          <span className={`conn ${connected ? 'ok' : ''}`}>{connected ? (demo ? 'Demo' : 'Live') : 'Connecting…'}</span>
        </div>
        {scene && (
          <div className="master">
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
          </aside>

          <section className="stage-wrap" aria-label="Preview">
            <Stage
              scene={scene}
              zones={zones}
              devices={devices}
              frames={frames}
              selected={selected}
              onSelect={setSelected}
            />
            {!scene.power && <div className="stage-off">Lighting is off</div>}
          </section>

          <aside className="panel">
            {zone ? (
              <ZoneInspector key={zone.id} zone={zone} scene={scene} update={updateScene} identify={identify} />
            ) : (
              <GlobalInspector scene={scene} update={updateScene} />
            )}
          </aside>
        </main>
      )}
    </div>
  );
}
