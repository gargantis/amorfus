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

interface Window {
  __amorfus?: AmorfusTestHooks;
  __amorfusBootReady?: () => void;
}
