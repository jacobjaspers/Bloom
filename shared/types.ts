// Types shared by the server (Node) and the web UI (Vite/React).
// Kept to erasable TypeScript so Node can run it directly with type stripping.

export type RGB = [number, number, number];

export type ZoneKind = 'fans' | 'ram' | 'gpu' | 'accent';

export type ColorOrder = 'RGB' | 'RBG' | 'GRB' | 'GBR' | 'BRG' | 'BGR';

/** A physically addressable group of LEDs that the user controls as one unit. */
export interface ZoneInfo {
  id: string;
  deviceId: string;
  kind: ZoneKind;
  /** Default display name; the user can override it in ZoneSettings.label. */
  name: string;
  /** Maximum LEDs the hardware channel can address. */
  maxLeds: number;
  /** True when the LED count is configurable (ARGB headers). */
  configurable: boolean;
}

export type EffectId =
  | 'solid'
  | 'breathing'
  | 'rainbow'
  | 'spectrum'
  | 'gradient'
  | 'aurora'
  | 'ripple'
  | 'comet'
  | 'ember';

export type Direction = 'right' | 'left' | 'up' | 'down';

export interface EffectConfig {
  id: EffectId;
  colors: string[];
  /** 0–100 */
  speed: number;
  /** 0–100, effect-specific "scale" (wave length, tail length, noise size…) */
  size: number;
  direction: Direction;
}

export interface ZoneSettings {
  enabled: boolean;
  /** 0–100, multiplied with the master brightness */
  brightness: number;
  /** When true the zone follows the global effect; otherwise it uses `effect`. */
  synced: boolean;
  effect: EffectConfig;
  label?: string;
  /** ARGB only: number of LEDs actually connected. */
  ledCount?: number;
  /** ARGB only: how many fans the LEDs are split across (for layout). */
  fanCount?: number;
  colorOrder: ColorOrder;
}

export interface Scene {
  power: boolean;
  /** 0–100 */
  brightness: number;
  effect: EffectConfig;
  zones: Record<string, ZoneSettings>;
}

export type DeviceState = 'connected' | 'unavailable' | 'error';

export interface DeviceStatus {
  id: string;
  name: string;
  state: DeviceState;
  detail: string;
  /** Optional remediation hint shown in the UI. */
  hint?: string;
}

/** Resolved runtime description of a zone, including its current LED count. */
export interface ZoneRuntime extends ZoneInfo {
  ledCount: number;
}

// ---- WebSocket protocol ----------------------------------------------------

export type ServerMessage =
  | {
      type: 'state';
      scene: Scene;
      zones: ZoneRuntime[];
      devices: DeviceStatus[];
      demo: boolean;
    }
  | { type: 'error'; message: string };

export type ClientMessage =
  | { type: 'scene'; scene: Scene }
  | { type: 'identify'; zoneId: string };

/**
 * Binary preview frames: for each zone in the order of the last `state.zones`,
 * `ledCount * 3` bytes of RGB, concatenated. Prefixed by a 1-byte frame marker.
 */
export const FRAME_MARKER = 0x46; // 'F'
