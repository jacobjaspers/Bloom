// Types shared by the server (Node) and the web UI (Vite/React).
// Kept to erasable TypeScript so Node can run it directly with type stripping.

export type RGB = [number, number, number];

export type ZoneKind = 'fans' | 'ram' | 'gpu' | 'accent' | 'device';

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
  /** Set when the zone is driven through another program (e.g. "OpenRGB"). */
  via?: string;
  /** Keyboard-style LED grid: map[row * width + col] = LED index in the zone, or 0xFFFFFFFF for a gap. */
  grid?: { width: number; height: number; map: number[] };
}

export type EffectId =
  | 'solid'
  | 'gradient'
  | 'breathing'
  | 'wave'
  | 'cycle'
  | 'aurora'
  | 'ripple'
  | 'comet'
  | 'twinkle'
  | 'ember';

/** Shape of an effect's motion over one cycle. */
export type Curve = 'smooth' | 'linear' | 'pulse' | 'hard' | 'saw';

/** How a layer combines with the layers beneath it. */
export type BlendMode = 'normal' | 'add' | 'screen' | 'multiply';

export interface ColorStop {
  /** 0..1 along the gradient */
  pos: number;
  color: string;
}

/** One effect in a stack. Every control is 0–100 unless noted. */
export interface Layer {
  /** Stable id for React keys and selection. */
  key: string;
  effect: EffectId;
  enabled: boolean;
  palette: ColorStop[];
  speed: number;
  /** Effect-specific scale: wave length, tail length, cloud size… */
  size: number;
  /** Direction of travel in degrees, 0 = left→right, 90 = bottom→top. */
  angle: number;
  reverse: boolean;
  curve: Curve;
  /** How strongly brightness varies (0 = flat, 100 = full contrast). */
  intensity: number;
  minBrightness: number;
  maxBrightness: number;
  /** Slow hue drift, in degrees either side of the palette (0–180). */
  hueDrift: number;
  /** 0 = every zone in lockstep, 100 = each zone a full cycle apart. */
  spread: number;
  blend: BlendMode;
  opacity: number;
}

/** Layers render bottom (index 0) to top. */
export interface EffectStack {
  layers: Layer[];
}

export interface Preset {
  id: string;
  name: string;
  stack: EffectStack;
  builtin?: boolean;
  /** Easter-egg note shown on a built-in (e.g. the developer's own favorite). */
  credit?: string;
}

export interface ZoneSettings {
  enabled: boolean;
  /** 0–100, multiplied with the master brightness */
  brightness: number;
  /** When true the zone follows the global effect; otherwise it uses `effect`. */
  synced: boolean;
  effect: EffectStack;
  label?: string;
  /** ARGB only: number of LEDs actually connected. */
  ledCount?: number;
  /** ARGB only: how many fans the LEDs are split across (for layout). */
  fanCount?: number;
  colorOrder: ColorOrder;
  /** Build editor: where this part sits in the case, if the user moved it. */
  place?: Placement;
}

/** Where the user placed a zone in the Build editor: its centre, plus quarter turns. */
export interface Placement {
  x: number;
  y: number;
  rot: 0 | 1 | 2 | 3;
  /** Size multiplier (1 = automatic size). */
  scale?: number;
}

/** Unlit case parts the Build editor can move. */
export type PartId = 'cpu' | 'board';

export interface Scene {
  power: boolean;
  /** 0–100 */
  brightness: number;
  effect: EffectStack;
  zones: Record<string, ZoneSettings>;
  /** The user's saved presets (built-ins live in shared/presets.ts). */
  presets: Preset[];
  /** Build editor placements for the CPU and motherboard. */
  parts?: Partial<Record<PartId, Placement>>;
  /** Preset the global effect was last loaded from or saved to, if any. */
  activePreset?: string;
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
