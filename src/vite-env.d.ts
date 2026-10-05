/// <reference types="vite/client" />

declare module '*.wgsl?raw' {
  const src: string;
  export default src;
}

interface AmorfusTestHooks {
  frames: number;
  workerOk: boolean;
  readCenterPixel: () => Promise<[number, number, number, number]>;
}

interface Window {
  __amorfus?: AmorfusTestHooks;
  __amorfusBootReady?: () => void;
}
