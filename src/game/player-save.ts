// §12.1 players store value: position, look, fly flag, held material.
export interface PlayerSave {
  position: [number, number, number];
  yaw: number;
  pitch: number;
  flying: boolean;
  held?: number;
}
