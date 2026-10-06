import { describe, it, expect } from 'vitest';
import { pickRay } from './pick';
import { MeshWorld } from './test-world';
import { makeBlock, AIR } from '../world/block';

// §9.3 picking: an Amanatides–Woo DDA walks the ray; at each block, test
// the quads whose lower block is within Chebyshev distance 1, from
// whichever chunk holds that lower block; Möller–Trumbore on both
// triangles; the nearest hit wins. Remove targets the quad's solid block,
// place its air block.

const STONE = makeBlock(3, false);

describe('pickRay', () => {
  const floor = new MeshWorld((_x, y) => ({ v: y < 8 ? STONE : AIR }));
  floor.build(-1, 0, -1, 1, 0, 1);

  it('hits a floor straight down and targets the right blocks', () => {
    const hit = pickRay(floor, [4.5, 12, 4.5], [0, -1, 0], 8);
    expect(hit).not.toBeNull();
    expect(hit!.position[1]).toBeCloseTo(8, 1);
    expect(hit!.solidBlock).toEqual([4, 7, 4]);
    expect(hit!.airBlock).toEqual([4, 8, 4]);
  });

  it('misses when the ray points away or reach is short', () => {
    expect(pickRay(floor, [4.5, 12, 4.5], [0, 1, 0], 50)).toBeNull();
    expect(pickRay(floor, [4.5, 12, 4.5], [0, -1, 0], 3)).toBeNull();
  });

  it('hits across the −x, −y and −z chunk borders (§14)', () => {
    // A wall at x = −1 (chunk −1) hit by a ray from x = +2 looking −x.
    const wall = new MeshWorld((x, y, _z) => ({ v: x === -1 && y >= 0 && y < 16 ? STONE : AIR }));
    wall.build(-1, -1, -1, 0, 0, 0);
    const hx = pickRay(wall, [2.5, 4.5, 0.5], [-1, 0, 0], 6);
    expect(hx).not.toBeNull();
    expect(hx!.solidBlock).toEqual([-1, 4, 0]);
    expect(hx!.airBlock).toEqual([0, 4, 0]);

    const slab = new MeshWorld((_x, y, _z) => ({ v: y === -1 ? STONE : AIR }));
    slab.build(-1, -1, -1, 0, 0, 0);
    const hy = pickRay(slab, [0.5, 3, 0.5], [0, -1, 0], 6);
    expect(hy).not.toBeNull();
    expect(hy!.solidBlock).toEqual([0, -1, 0]);

    const pane = new MeshWorld((_x, y, z) => ({ v: z === -1 && y < 12 ? STONE : AIR }));
    pane.build(-1, -1, -1, 0, 0, 0);
    const hz = pickRay(pane, [0.5, 4.5, 2.5], [0, 0, -1], 6);
    expect(hz).not.toBeNull();
    expect(hz!.solidBlock).toEqual([0, 4, -1]);
  });

  it('respects reach of 5 blocks for the game path', () => {
    const hit = pickRay(floor, [4.5, 13.2, 4.5], [0, -1, 0], 5);
    expect(hit).toBeNull(); // the surface is 5.2 away
    const hit2 = pickRay(floor, [4.5, 13.2, 4.5], [0, -1, 0], 5.3);
    expect(hit2).not.toBeNull();
  });

  it('hits a smoothed edited bump off-centre (vertices stay in cells)', () => {
    const bump = new MeshWorld((x, y, z) => ({
      v: y < 8 || (x === 4 && y === 8 && z === 4) ? STONE : AIR,
      edited: x === 4 && y === 8 && z === 4,
    }));
    bump.build(0, 0, 0, 0, 0, 0);
    const hit = pickRay(bump, [4.5, 12, 4.5], [0, -1, 0], 8);
    expect(hit).not.toBeNull();
    expect(hit!.solidBlock).toEqual([4, 8, 4]);
    expect(hit!.position[1]).toBeGreaterThan(8.2); // the bump's top
  });
});
