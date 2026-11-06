import { useState } from 'react';
import type { DeviceStatus, ZoneRuntime } from '../../../shared/types.ts';

const KEY = 'bloom.welcomed';

export function useWelcome(): [boolean, () => void, () => void] {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== '1';
    } catch {
      return false;
    }
  });
  const close = () => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* shown again next time */
    }
  };
  return [open, close, () => setOpen(true)];
}

/** Plain-words warning when another RGB app is running. */
export function ConflictBanner({ apps }: { apps: string[] }) {
  if (!apps.length) return null;
  const list = apps.length === 1 ? apps[0] : `${apps.slice(0, -1).join(', ')} and ${apps[apps.length - 1]}`;
  return (
    <div className="conflict" role="alert">
      <strong>{list} {apps.length === 1 ? 'is' : 'are'} running</strong>
      <span>
        Two lighting apps controlling the same lights makes them flicker or ignore Bloom. Close {apps.length === 1 ? 'it' : 'them'}, and
        turn off {apps.length === 1 ? 'its' : 'their'} “start with Windows” setting.
      </span>
    </div>
  );
}

/** First-run walkthrough: what Bloom found, anything to fix, and where to start. */
export function Welcome({
  devices,
  zones,
  conflicts,
  onClose,
}: {
  devices: DeviceStatus[];
  zones: ZoneRuntime[];
  conflicts: string[];
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const lit = zones.length;
  const ram = devices.find((d) => d.id === 'ram');
  const needsPawnIo = ram && ram.state !== 'connected' && /PawnIO/i.test(ram.detail);
  const openrgb = devices.find((d) => d.id === 'openrgb');
  const groups = [...new Set(zones.map((z) => ({ fans: 'Fans', ram: 'Memory', gpu: 'Graphics card', accent: 'Lighting strips', device: 'Devices' })[z.kind]))];

  const steps = [
    <>
      <div className="welcome-mark" aria-hidden="true" />
      <h2>Welcome to Bloom</h2>
      <p>
        Design your own lighting for your whole PC. Pick a look, make it yours, and watch it come alive across your fans, memory, graphics card
        and more.
      </p>
    </>,
    <>
      <h2>{lit ? `Found ${lit} light${lit === 1 ? '' : 's'} to control` : 'Looking for your lights…'}</h2>
      {lit > 0 && <p className="welcome-found">{groups.join(' · ')}</p>}
      <ul className="welcome-checks">
        {conflicts.length > 0 && (
          <li className="warn">
            <b>Close {conflicts.join(', ')}.</b> Another lighting app is running and will fight Bloom for your lights.
          </li>
        )}
        {needsPawnIo && (
          <li className="warn">
            <b>Want RAM lighting?</b> Install the free PawnIO driver from{' '}
            <a href="https://pawnio.eu" target="_blank" rel="noreferrer">
              pawnio.eu
            </a>
            , then restart your PC.
          </li>
        )}
        {lit === 0 && (
          <li className="warn">
            <b>Nothing lit up yet.</b> If your RGB device isn’t found after a minute, it may not be supported yet. Let us know its make and model on
            GitHub.
          </li>
        )}
        {!conflicts.length && !needsPawnIo && lit > 0 && <li className="ok">Everything looks good.</li>}
      </ul>
      {openrgb && <p className="hint">Support for most devices comes from OpenRGB, which Bloom runs quietly in the background.</p>}
    </>,
    <>
      <h2>Make it yours</h2>
      <ul className="welcome-tips">
        <li>
          <b>Presets</b> are ready-made looks. Click one to try it.
        </li>
        <li>
          <b>Customize</b> lets you pick effects, colors and motion, then save your own preset.
        </li>
        <li>
          <b>Edit layout</b> (top right of the picture) lets you move parts so the picture matches your PC.
        </li>
        <li>
          Look for the <b>ⓘ</b> buttons for a quick explanation of anything.
        </li>
      </ul>
    </>,
  ];

  const last = step === steps.length - 1;
  return (
    <div className="welcome-backdrop" role="dialog" aria-modal="true" aria-label="Welcome to Bloom">
      <div className="welcome">
        <div className="welcome-body" key={step}>
          {steps[step]}
        </div>
        <div className="welcome-foot">
          <div className="welcome-dots" aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} className={i === step ? 'on' : ''} />
            ))}
          </div>
          {step > 0 && (
            <button type="button" className="ghost-btn" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          <button type="button" className="primary-btn" onClick={() => (last ? onClose() : setStep(step + 1))}>
            {last ? 'Get started' : 'Next'}
          </button>
        </div>
        <button type="button" className="icon-btn welcome-skip" onClick={onClose} aria-label="Skip the welcome">
          ×
        </button>
      </div>
    </div>
  );
}
