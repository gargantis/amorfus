// §15/C-6 scenario A: a scripted 90 s walk/fly/edit run driven through the
// PRODUCTION player loop. The script yields controller inputs and edit
// actions per scenario-second; the runner collects the C-6 pass criteria.
// A time scale lets the gate replay the whole script in a few seconds.
import type { ControllerInput } from '../core/physics/controller';

export interface ScenarioAction {
  input: ControllerInput;
  /** alternate dig/place at ~10 per scenario-second in the edit phase */
  edit: 'dig' | 'place' | null;
  /** camera pitch the script wants */
  pitch: number;
  done: boolean;
}

/** Stateful script: flight toggles are edges, edits are paced. */
export function createScenarioA(): (tSeconds: number) => ScenarioAction {
  let lastEditAt = -1;
  let editFlip = false;
  let flying = false;

  return (t: number): ScenarioAction => {
    const input: ControllerInput = {
      move: [0, 0], yaw: 0, jump: false, sprint: false, descend: false, toggleFly: false,
    };
    if (t >= 90) return { input, edit: null, pitch: -0.15, done: true };

    let edit: 'dig' | 'place' | null = null;
    let pitch = -0.15;
    if (t < 30) {
      // walk: weave forward, hop every 4 s
      input.move = [0, 1];
      input.yaw = Math.sin(t * 0.35) * 0.9;
      input.jump = t % 4 < 0.08;
    } else if (t < 60) {
      // fly: take off once, climb for 10 s, cruise with sprint bursts
      if (!flying) {
        input.toggleFly = true;
        flying = true;
      }
      input.move = [0, 1];
      input.yaw = t * 0.12;
      input.sprint = t % 10 < 5;
      input.jump = t < 40; // rise
      input.descend = t >= 52; // come back down before the edit phase
    } else {
      // edit: land once, stand, look down, alternate dig/place
      if (flying) {
        input.toggleFly = true;
        flying = false;
      }
      input.move = [0, Math.sin(t) * 0.3];
      input.yaw = t * 0.4;
      pitch = -0.9;
      if (t - lastEditAt >= 0.1) {
        lastEditAt = t;
        editFlip = !editFlip;
        edit = editFlip ? 'dig' : 'place';
      }
    }
    return { input, edit, pitch, done: false };
  };
}

export interface ScenarioReport {
  frames: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  longTasks: number;
  editP95: number;
  editP99: number;
  /** edit transactions that reached the screen during the run */
  edits: number;
  splitSwaps: number;
  /** horizontal path length the player actually covered, in blocks */
  distance: number;
  /** highest point reached above the starting height, in blocks */
  climbed: number;
  tierChanged: boolean;
}

export function summarise(
  intervals: number[],
  longTasks: number,
  editMs: number[],
  splitSwaps: number,
  distance: number,
  climbed: number,
): ScenarioReport {
  const s = [...intervals].sort((a, b) => a - b);
  const q = (p: number): number => s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0;
  const e = [...editMs].sort((a, b) => a - b);
  const eq = (p: number): number => e[Math.min(e.length - 1, Math.floor(p * e.length))] ?? 0;
  return {
    frames: s.length,
    p50: q(0.5),
    p95: q(0.95),
    p99: q(0.99),
    max: s[s.length - 1] ?? 0,
    longTasks,
    editP95: eq(0.95),
    editP99: eq(0.99),
    edits: e.length,
    splitSwaps,
    distance,
    climbed,
    tierChanged: false,
  };
}
