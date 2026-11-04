import type { DeviceStatus, ZoneInfo } from '../../shared/types.ts';

/**
 * A piece of RGB hardware. Drivers expose one or more zones and accept a frame of
 * already-computed, already-dimmed RGB bytes per zone (R,G,B order — drivers apply
 * any controller-specific byte order themselves).
 */
export interface LightDevice {
  readonly id: string;
  readonly name: string;
  status(): DeviceStatus;
  zones(): ZoneInfo[];
  open(): Promise<void>;
  write(frame: Map<string, Uint8Array>): void;
  close(): void;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
