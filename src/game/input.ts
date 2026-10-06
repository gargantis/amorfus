// §9.2 controls. All keys use KeyboardEvent.code so WASD is layout-
// independent. Ctrl is never bound (Ctrl+W closes the tab). Pointer lock
// asks for unadjustedMovement and falls back to a plain lock on
// NotSupportedError; Chrome 131+ shows a permission prompt the first
// time, which the click-to-play overlay says.

export interface FrameInput {
  move: [number, number];
  yaw: number;
  pitch: number;
  jump: boolean;
  sprint: boolean;
  descend: boolean;
  toggleFly: boolean; // edge
  remove: boolean; // edge
  place: boolean; // edge
  pickMaterial: boolean; // edge
  toggleSharpTarget: boolean; // edge
  material: number;
  sharpMode: boolean;
  locked: boolean;
}

const DOUBLE_TAP_MS = 300;

export class InputManager {
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = -0.2;
  private material = 5; // planks
  private sharpMode = false;
  private sprint = false;
  private edges = {
    toggleFly: false,
    remove: false,
    place: false,
    pickMaterial: false,
    toggleSharpTarget: false,
  };
  private lastW = 0;
  private lastSpace = 0;
  private locked = false;
  onPauseChange: ((paused: boolean) => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    document.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      switch (e.code) {
        case 'KeyW': {
          const now = performance.now();
          if (now - this.lastW < DOUBLE_TAP_MS) this.sprint = true;
          this.lastW = now;
          break;
        }
        case 'Space': {
          const now = performance.now();
          if (now - this.lastSpace < DOUBLE_TAP_MS) this.edges.toggleFly = true;
          this.lastSpace = now;
          e.preventDefault();
          break;
        }
        case 'KeyF':
          this.edges.toggleFly = true;
          break;
        case 'KeyQ':
          this.sharpMode = !this.sharpMode;
          break;
        case 'KeyR':
          this.edges.toggleSharpTarget = true;
          break;
        default:
          if (e.code.startsWith('Digit')) {
            const n = Number(e.code.slice(5));
            if (n >= 1 && n <= 6) this.material = n;
          }
      }
    });
    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyW') this.sprint = this.sprint && false;
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0024;
      this.pitch -= e.movementY * 0.0024;
      const lim = Math.PI / 2 - 0.01;
      this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) this.edges.remove = true;
      else if (e.button === 1) this.edges.pickMaterial = true;
      else if (e.button === 2) this.edges.place = true;
      e.preventDefault();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      this.material = ((this.material - 1 + dir + 6) % 6) + 1;
      e.preventDefault();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      this.keys.clear();
      this.sprint = false;
      this.onPauseChange?.(!this.locked);
    });
  }

  async requestLock(canvas: HTMLCanvasElement): Promise<void> {
    try {
      await (canvas.requestPointerLock as (o?: { unadjustedMovement?: boolean }) => Promise<void> | undefined)
        .call(canvas, { unadjustedMovement: true });
    } catch (err) {
      if ((err as Error | null)?.name === 'NotSupportedError') {
        canvas.requestPointerLock();
      }
    }
  }

  frame(): FrameInput {
    const forward = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    const strafe = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
    if (forward <= 0) this.sprint = false;
    const out: FrameInput = {
      move: [strafe, forward],
      yaw: this.yaw,
      pitch: this.pitch,
      jump: this.keys.has('Space'),
      sprint: this.sprint,
      descend: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      toggleFly: this.edges.toggleFly,
      remove: this.edges.remove,
      place: this.edges.place,
      pickMaterial: this.edges.pickMaterial,
      toggleSharpTarget: this.edges.toggleSharpTarget,
      material: this.material,
      sharpMode: this.sharpMode,
      locked: this.locked,
    };
    this.edges.toggleFly = false;
    this.edges.remove = false;
    this.edges.place = false;
    this.edges.pickMaterial = false;
    this.edges.toggleSharpTarget = false;
    return out;
  }

  setMaterial(m: number): void {
    this.material = m;
  }
}
