import { useEffect, useRef } from 'react';
import type { DeviceStatus, Scene, ZoneKind, ZoneRuntime } from '../../../shared/types.ts';
import { fitCanvas, subscribeFrame } from '../frameLoop.ts';
import type { FrameStore } from '../useBloom.ts';
import { HELP } from '../help.ts';
import { InfoTip, Toggle } from './controls.tsx';

const KIND_LABEL: Record<ZoneKind, string> = { fans: 'Fans', ram: 'Memory', gpu: 'Graphics', accent: 'Board' };

function Strip({ zoneId, frames }: { zoneId: string; frames: FrameStore }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(
    () =>
      subscribeFrame(() => {
        const c = ref.current;
        if (!c) return;
        const ctx = fitCanvas(c);
        const rgb = frames.current.get(zoneId);
        if (!ctx) return;
        const w = c.clientWidth, h = c.clientHeight;
        ctx.clearRect(0, 0, w, h);
        if (!rgb || !rgb.length) return;
        const n = rgb.length / 3;
        const grad = ctx.createLinearGradient(0, 0, w, 0);
        for (let i = 0; i < n; i++) {
          grad.addColorStop(n === 1 ? 0.5 : i / (n - 1), `rgb(${rgb[i * 3]},${rgb[i * 3 + 1]},${rgb[i * 3 + 2]})`);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
      }),
    [zoneId, frames],
  );
  return <canvas ref={ref} className="mini-strip" aria-hidden="true" />;
}

export function ZoneList({
  scene,
  zones,
  frames,
  selected,
  onSelect,
  onToggle,
}: {
  scene: Scene;
  zones: ZoneRuntime[];
  frames: FrameStore;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onToggle: (id: string, on: boolean) => void;
}) {
  const groups = (['fans', 'ram', 'gpu', 'accent'] as ZoneKind[])
    .map((kind) => ({ kind, zones: zones.filter((z) => z.kind === kind) }))
    .filter((g) => g.zones.length);

  return (
    <nav className="zones" aria-label="Lighting zones">
      <button type="button" className={`zone all ${selected === null ? 'active' : ''}`} onClick={() => onSelect(null)}>
        <span className="zone-icon all-icon" aria-hidden="true" />
        <span className="zone-text">
          <span className="zone-name">All zones</span>
          <span className="zone-sub">Global effect</span>
        </span>
      </button>

      {groups.map((g) => (
        <div key={g.kind} className="zone-group">
          <h4>{KIND_LABEL[g.kind]}</h4>
          {g.zones.map((z) => {
            const s = scene.zones[z.id];
            if (!s) return null;
            return (
              <div key={z.id} className={`zone ${selected === z.id ? 'active' : ''} ${s.enabled ? '' : 'off'}`}>
                <button type="button" className="zone-main" onClick={() => onSelect(z.id)}>
                  <span className="zone-text">
                    <span className="zone-name">{s.label || z.name}</span>
                    <span className="zone-sub">
                      {z.ledCount} {z.ledCount === 1 ? 'LED' : 'LEDs'} · {s.synced ? 'Synced' : 'Custom'}
                    </span>
                  </span>
                  <Strip zoneId={z.id} frames={frames} />
                </button>
                <Toggle checked={s.enabled} label={`${s.label || z.name} on/off`} onChange={(v) => onToggle(z.id, v)} />
              </div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function DeviceList({ devices, demo }: { devices: DeviceStatus[]; demo: boolean }) {
  return (
    <div className="devices">
      <h4>
        Hardware
        <InfoTip text={HELP.hardware} label="Hardware" />
        {demo && <span className="pill">demo</span>}
      </h4>
      {devices.map((d) => (
        <div key={d.id} className={`device ${d.state}`}>
          <span className="dot" aria-hidden="true" />
          <div>
            <div className="device-name">{d.name}</div>
            <div className="device-detail">{d.detail}</div>
            {d.hint && <div className="device-hint">{d.hint}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
