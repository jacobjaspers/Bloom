import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FRAME_MARKER,
  type ClientMessage,
  type DeviceStatus,
  type Scene,
  type ServerMessage,
  type ZoneRuntime,
} from '../../shared/types.ts';

export interface BloomState {
  connected: boolean;
  demo: boolean;
  scene: Scene | null;
  zones: ZoneRuntime[];
  devices: DeviceStatus[];
  conflicts: string[];
}

/** Latest LED colors per zone id (RGB bytes), updated ~30×/s without re-rendering React. */
export type FrameStore = { current: Map<string, Uint8Array> };

export function useBloom() {
  const [state, setState] = useState<BloomState>({ connected: false, demo: false, scene: null, zones: [], devices: [], conflicts: [] });
  const ws = useRef<WebSocket | null>(null);
  const zonesRef = useRef<ZoneRuntime[]>([]);
  const frames: FrameStore = useRef(new Map<string, Uint8Array>());
  const sendTimer = useRef<number | null>(null);
  const pendingScene = useRef<Scene | null>(null);

  useEffect(() => {
    let stopped = false;
    let retry: number | undefined;

    const connect = () => {
      const sock = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
      sock.binaryType = 'arraybuffer';
      ws.current = sock;

      sock.onmessage = (ev) => {
        if (ev.data instanceof ArrayBuffer) {
          const bytes = new Uint8Array(ev.data);
          if (bytes[0] !== FRAME_MARKER) return;
          // When an LED count changes, a few frames in flight still have the old layout.
          // Slicing those with the new zone table misaligns every zone, so drop any frame
          // whose size doesn't match and keep showing the previous one.
          const expected = 1 + zonesRef.current.reduce((n, z) => n + z.ledCount * 3, 0);
          if (bytes.length !== expected) return;
          let off = 1;
          const map = new Map<string, Uint8Array>();
          for (const z of zonesRef.current) {
            const n = z.ledCount * 3;
            map.set(z.id, bytes.subarray(off, off + n));
            off += n;
          }
          frames.current = map;
          return;
        }
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        if (msg.type === 'state') {
          zonesRef.current = msg.zones;
          setState((s) => ({
            ...s,
            connected: true,
            demo: msg.demo,
            // Don't clobber an edit that is still waiting to be sent.
            scene: pendingScene.current ?? msg.scene,
            zones: msg.zones,
            devices: msg.devices,
            conflicts: msg.conflicts ?? [],
          }));
        }
      };
      sock.onopen = () => setState((s) => ({ ...s, connected: true }));
      sock.onclose = () => {
        setState((s) => ({ ...s, connected: false }));
        if (!stopped) retry = window.setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      stopped = true;
      window.clearTimeout(retry);
      ws.current?.close();
    };
  }, [frames]);

  const send = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  }, []);

  /** Apply a change locally right away and send it to the server (throttled for sliders). */
  const updateScene = useCallback(
    (mutate: (draft: Scene) => void) => {
      setState((s) => {
        if (!s.scene) return s;
        const next = structuredClone(s.scene);
        mutate(next);
        pendingScene.current = next;
        if (sendTimer.current === null) {
          sendTimer.current = window.setTimeout(() => {
            sendTimer.current = null;
            if (pendingScene.current) send({ type: 'scene', scene: pendingScene.current });
            pendingScene.current = null;
          }, 40);
        }
        return { ...s, scene: next };
      });
    },
    [send],
  );

  const identify = useCallback((zoneId: string) => send({ type: 'identify', zoneId }), [send]);

  return { state, frames, updateScene, identify };
}
