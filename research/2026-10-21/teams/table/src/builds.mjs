// Synthetic "builds": player-made structures on flat ground, as dense grids.
// Grid layout: index (y * NZ + z) * NX + x, value = material (0 air).
// Materials: 1 grass, 2 dirt, 3 stone, 4 sand, 5 planks, 6 brick.
export const GRASS = 1, DIRT = 2, STONE = 3, SAND = 4, PLANKS = 5, BRICK = 6;

export function grid(NX, NY, NZ) {
  const a = new Uint8Array(NX * NY * NZ);
  const at = (x, y, z) => (x < 0 || y < 0 || z < 0 || x >= NX || y >= NY || z >= NZ ? 0 : a[(y * NZ + z) * NX + x]);
  const set = (x, y, z, m) => { if (x >= 0 && y >= 0 && z >= 0 && x < NX && y < NY && z < NZ) a[(y * NZ + z) * NX + x] = m; };
  const box = (x0, y0, z0, x1, y1, z1, m) => { for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) set(x, y, z, m); };
  return { NX, NY, NZ, a, at, set, box };
}

/** Flat ground: stone 0..1, dirt 2, grass 3 (top at y = 4). */
function ground(G, top = GRASS) {
  G.box(0, 0, 0, G.NX - 1, 1, G.NZ - 1, STONE);
  G.box(0, 2, 0, G.NX - 1, 2, G.NZ - 1, DIRT);
  G.box(0, 3, 0, G.NX - 1, 3, G.NZ - 1, top);
}

export const BUILDS = {
  // brick house: 9x9 footprint, 1-thick walls 4 high, door 1x2, windows,
  // planks floor, stepped planks roof
  house() {
    const G = grid(16, 14, 16); ground(G);
    const x0 = 3, z0 = 3, x1 = 11, z1 = 11, y0 = 4;
    G.box(x0, y0 - 1, z0, x1, y0 - 1, z1, PLANKS); // floor replaces grass
    for (let y = y0; y < y0 + 4; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      if (x === x0 || x === x1 || z === z0 || z === z1) G.set(x, y, z, BRICK);
    }
    G.set(7, y0, z0, 0); G.set(7, y0 + 1, z0, 0); // door
    G.set(5, y0 + 2, z0, 0); G.set(9, y0 + 2, z0, 0); G.set(x1, y0 + 2, 7, 0); G.set(x0, y0 + 2, 6, 0); // windows
    for (let k = 0; k < 4; k++) G.box(x0 - 1 + k, y0 + 4 + k, z0 - 1 + k, x1 + 1 - k, y0 + 4 + k, z1 + 1 - k, PLANKS); // stepped roof
    return G;
  },
  // 1:1 stairs: planks, 2 wide, 6 steps; stone stairs 3 wide alongside
  stairs() {
    const G = grid(16, 14, 12); ground(G);
    for (let k = 0; k < 6; k++) G.box(3 + k, 4, 2, 3 + k, 4 + k, 3, PLANKS);
    for (let k = 0; k < 6; k++) G.box(3 + k, 4, 6, 3 + k, 4 + k, 8, STONE);
    return G;
  },
  // the owner's hard case: 1-wide painted diagonal line in the ground's top
  // layer, plus a 2-wide diagonal and a straight 1-wide line
  painted() {
    const G = grid(20, 6, 20); ground(G, STONE);
    for (let k = 0; k < 14; k++) G.set(2 + k, 3, 2 + k, BRICK);
    for (let k = 0; k < 12; k++) { G.set(5 + k, 3, 1 + k, SAND); G.set(6 + k, 3, 1 + k, SAND); }
    for (let z = 2; z < 18; z++) G.set(17, 3, z, PLANKS);
    return G;
  },
  // checkerboard floor (planks / brick) and a checker wall
  checker() {
    const G = grid(16, 10, 14); ground(G);
    for (let z = 2; z < 10; z++) for (let x = 2; x < 10; x++) G.set(x, 3, z, (x + z) % 2 ? PLANKS : BRICK);
    for (let y = 4; y < 8; y++) for (let x = 2; x < 10; x++) G.set(x, y, 11, (x + y) % 2 ? PLANKS : BRICK);
    return G;
  },
  // walls: free-standing 1-thick brick wall with a planks stripe and an
  // L-shaped 2-thick stone wall, a 1x1 brick pillar row
  walls() {
    const G = grid(18, 10, 14); ground(G);
    G.box(2, 4, 2, 12, 7, 2, BRICK); G.box(2, 6, 2, 12, 6, 2, PLANKS);
    G.box(2, 4, 5, 12, 7, 6, STONE); G.box(11, 4, 5, 12, 7, 11, STONE);
    for (let x = 3; x < 10; x += 2) G.box(x, 4, 9, x, 6, 9, BRICK);
    return G;
  },
};
