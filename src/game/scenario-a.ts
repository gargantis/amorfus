// §15/C-6 scenario A: a scripted 90 s walk/fly/edit run. The script
// produces controller inputs and edit actions per elapsed second; the
// runner collects the C-6 pass criteria and prints them.
import type { ControllerInput } from '../core/physics/controller';

export interface ScenarioAction {
  input: ControllerInput;
  /** edit per tick: alternate dig/place at ~10/s in the edit phase */
  edit: 'dig' | 'place' | null;
  done: boolean;
}

let lastEditAt = 0;
let editFlip = false;

export function scenarioA(tSeconds: number): ScenarioAction {
  const base: ControllerInput = {
    move: [0, 0], yaw: 0, jump: false, sprint: false, descend: false, toggleFly: false,
  };
  let edit: 'dig' | 'place' | null = null;
  if (tSeconds >= 90) return { input: base, edit: null, done: true };

  if (tSeconds < 30) {
    // walk: weave forward, hop every 4 s
    base.move = [0, 1];
    base.yaw = Math.sin(tSeconds * 0.35) * 0.9;
    base.jump = tSeconds % 4 < 0.08;
  } else if (tSeconds < 60) {
    // fly: climb and cruise with sprint bursts
    base.move = [0, 1];
    base.yaw = tSeconds * 0.12;
    base.sprint = tSeconds % 10 < 5;
    base.jump = tSeconds < 40; // rise
  } else {
    // edit: stand, look down-ish, 10 edits/s alternating dig/place
    base.move = [0, Math.sin(tSeconds) * 0.3];
    base.yaw = tSeconds * 0.4;
    if ((tSeconds - lastEditAt) >= 0.1) {
      lastEditAt = tSeconds;
      editFlip = !editFlip;
      edit = editFlip ? 'dig' : 'place';
    }
  }
  return { input: base, edit, done: false };
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
  splitSwaps: number;
  tierChanged: boolean;
}

export function summarise(
  intervals: number[],
  longTasks: number,
  editMs: number[],
  splitSwaps: number,
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
    splitSwaps,
    tierChanged: false,
  };
}
