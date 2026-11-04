// Stand-in hardware for `npm run demo`: the same zones as the real rig, no USB/SMBus.
// Lets the UI be developed, screenshotted and shown off on any machine.

import type { DeviceStatus, ZoneInfo } from '../../shared/types.ts';
import type { LightDevice } from './device.ts';

export class SimulatedDevice implements LightDevice {
  readonly id: string;
  readonly name: string;
  private readonly zoneList: ZoneInfo[];

  constructor(id: string, name: string, zones: Omit<ZoneInfo, 'deviceId'>[]) {
    this.id = id;
    this.name = name;
    this.zoneList = zones.map((z) => ({ ...z, deviceId: id }));
  }

  status(): DeviceStatus {
    return { id: this.id, name: this.name, state: 'connected', detail: 'Simulated (demo mode)' };
  }
  zones(): ZoneInfo[] {
    return this.zoneList;
  }
  async open(): Promise<void> {}
  write(): void {}
  close(): void {}
}

export function demoDevices(): LightDevice[] {
  return [
    new SimulatedDevice('asrock', 'ASRock Polychrome', [
      { id: 'asrock:argb1', kind: 'fans', name: 'ARGB Header 1', maxLeds: 80, configurable: true },
      { id: 'asrock:argb2', kind: 'fans', name: 'ARGB Header 2', maxLeds: 80, configurable: true },
      { id: 'asrock:pcb', kind: 'accent', name: 'Board Accent', maxLeds: 5, configurable: false },
    ]),
    new SimulatedDevice('ram', 'G.Skill Trident Z RGB', [
      { id: 'ram:39', kind: 'ram', name: 'DIMM 1', maxLeds: 5, configurable: false },
      { id: 'ram:3a', kind: 'ram', name: 'DIMM 2', maxLeds: 5, configurable: false },
    ]),
    new SimulatedDevice('gpu', 'GIGABYTE RTX 3060 Gaming OC', [
      { id: 'gpu:logo', kind: 'gpu', name: 'GPU Logo', maxLeds: 4, configurable: false },
    ]),
  ];
}
