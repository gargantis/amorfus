/// <reference types="vite/client" />

declare module '*.wgsl?raw' {
  const src: string;
  export default src;
}

interface AmorfusTestHooks {
  frames: number;
  workerOk: boolean;
  readCenterPixel: () => Promise<[number, number, number, number]>;
  /** C-10 canary: golden hash of one generated chunk, computed by THIS
   *  bundle in THIS browser; must equal the Node value. */
  genGolden: (seed: [number, number], chunk: [number, number, number]) => Promise<string>;
}

interface AmorfusCoreHooks {
  ready: boolean;
  worldId: string;
  originKind: string;
  banner: string | null;
  editCount: number;
  applyEdit: (x: number, y: number, z: number, value: number) => void;
  flush: () => Promise<void>;
}

interface AmorfusHandoffState {
  role: 'sender' | 'receiver';
  status: string;
  count?: number;
  files?: number;
  rejected?: number;
  nonce?: string;
}

interface AmorfusNetHooks {
  host: () => string;
  join: (code: string) => boolean;
  leave: () => void;
  connected: () => number;
  secret: () => string | null;
  avatars: () => number;
  applyEdit: (x: number, y: number, z: number, value: number) => void;
  getBlock: (x: number, y: number, z: number) => number;
  closeLog: () => string[];
  rekey: () => string;
  worldId: () => string;
}

/** Loopback-only read/drive surface for production-path gate tests. */
interface AmorfusGameHooks {
  ready: () => boolean;
  connected: () => number;
  secret: () => string | null;
  worldId: () => string;
  blockAt: (x: number, y: number, z: number) => number | null;
  edit: (x: number, y: number, z: number, value: number) => boolean;
  player: () => [number, number, number];
}

interface Window {
  __amorfusGame?: AmorfusGameHooks;
  __scenarioA?: unknown;
  __amorfus?: AmorfusTestHooks;
  __amorfusNet?: AmorfusNetHooks;
  __amorfusCore?: AmorfusCoreHooks;
  __amorfusHandoff?: AmorfusHandoffState;
  __amorfusBootReady?: () => void;
}
