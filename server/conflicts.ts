// Spots other RGB apps that fight Bloom for the same hardware (two programs sending
// colors to one device makes it flicker or ignore one of them), so the UI can say so
// in plain words.

import { execFile } from 'node:child_process';

/** Process name (lower case) → name people recognise. */
const KNOWN: Record<string, string> = {
  'signalrgb.exe': 'SignalRGB',
  'signalrgblauncher.exe': 'SignalRGB',
  'icue.exe': 'Corsair iCUE',
  'armourycrate.exe': 'ASUS Armoury Crate',
  'lightingservice.exe': 'ASUS Aura (Armoury Crate)',
  'rgbfusion.exe': 'GIGABYTE RGB Fusion',
  'gcc.exe': 'GIGABYTE Control Center',
  'mysticlight.exe': 'MSI Mystic Light',
  'msi.centralserver.exe': 'MSI Center',
  'polychromesync.exe': 'ASRock Polychrome SYNC',
  'polychrome rgb.exe': 'ASRock Polychrome RGB',
  'nzxt cam.exe': 'NZXT CAM',
  'l-connect 3.exe': 'Lian Li L-Connect',
  'l-connect.exe': 'Lian Li L-Connect',
  'jacknetrgbsync.exe': 'JackNet RGB Sync',
};

function scan(): Promise<string[]> {
  return new Promise((resolve) => {
    execFile('tasklist.exe', ['/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 8000 }, (err, out) => {
      if (err) return resolve([]);
      const found = new Set<string>();
      for (const line of out.split(/\r?\n/)) {
        const name = line.match(/^"([^"]+)"/)?.[1]?.toLowerCase();
        if (name && KNOWN[name]) found.add(KNOWN[name]);
      }
      resolve([...found].sort());
    });
  });
}

/** Checks now and every 20 s; calls `onChange` whenever the list changes. */
export function watchConflicts(onChange: (apps: string[]) => void): { current: () => string[] } {
  let current: string[] = [];
  const tick = async () => {
    if (process.platform !== 'win32') return;
    const next = await scan();
    if (next.join('|') !== current.join('|')) {
      current = next;
      onChange(current);
    }
  };
  void tick();
  setInterval(() => void tick(), 20_000).unref();
  return { current: () => current };
}
