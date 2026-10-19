// gn-best-style edit-zone shading normals as a post-pass over a decoded mesh
// (study only): for vertices whose cell has a non-sharp shape-edited block
// within `reach` blocks, the normal is the mean of the unit face normals of
// the triangles touching any vertex within `rings` mesh-edge rings. Shading
// only; positions untouched. Reach in production: positions (d₀, 9 blocks
// for R = 8) + rings + 1 → apron 13 for 3 rings.
export function ringNormals(mesh, region, { rings = 3, reach = 2 } = {}) {
  const { V, T, tri, pos } = mesh;
  const { nx, ny, nz, apron, shapeEdited, blocks } = region;
  // vertex adjacency and incident triangles
  const adj = Array.from({ length: V }, () => new Set());
  const vt = Array.from({ length: V }, () => []);
  const fn = new Float64Array(T * 3);
  for (let t = 0; t < T; t++) {
    const a = tri[t * 3], b = tri[t * 3 + 1], c = tri[t * 3 + 2];
    adj[a].add(b); adj[a].add(c); adj[b].add(a); adj[b].add(c); adj[c].add(a); adj[c].add(b);
    vt[a].push(t); vt[b].push(t); vt[c].push(t);
    const ux = pos[b * 3] - pos[a * 3], uy = pos[b * 3 + 1] - pos[a * 3 + 1], uz = pos[b * 3 + 2] - pos[a * 3 + 2];
    const wx = pos[c * 3] - pos[a * 3], wy = pos[c * 3 + 1] - pos[a * 3 + 1], wz = pos[c * 3 + 2] - pos[a * 3 + 2];
    let x = uy * wz - uz * wy, y = uz * wx - ux * wz, z = ux * wy - uy * wx;
    const l = Math.sqrt(x * x + y * y + z * z);
    if (l > 0) { x /= l; y /= l; z /= l; }
    fn[t * 3] = x; fn[t * 3 + 1] = y; fn[t * 3 + 2] = z;
  }
  // positional merge: vertices split per material share a corner; join them
  const key = (v) => `${mesh.corner[v * 3]},${mesh.corner[v * 3 + 1]},${mesh.corner[v * 3 + 2]}`;
  const byKey = new Map();
  for (let v = 0; v < V; v++) { if (mesh.flags[v] & 1) continue; const k = key(v); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(v); }
  for (const list of byKey.values()) for (const v of list) for (const w of list) if (v !== w) adj[v].add(w);
  const bi = (x, y, z) => (y * nz + z) * nx + x;
  const inZone = (v) => {
    const cx = mesh.corner[v * 3] + apron, cy = mesh.corner[v * 3 + 1] + apron, cz = mesh.corner[v * 3 + 2] + apron;
    for (let y = cy - 1 - reach; y <= cy + reach; y++) for (let z = cz - 1 - reach; z <= cz + reach; z++) for (let x = cx - 1 - reach; x <= cx + reach; x++) {
      if (x < 0 || y < 0 || z < 0 || x >= nx || y >= ny || z >= nz) continue;
      const i = bi(x, y, z);
      if (shapeEdited[i] === 1 && (blocks[i] & 256) === 0) return true;
    }
    return false;
  };
  const out = Float64Array.from(mesh.nrm);
  for (let v = 0; v < V; v++) {
    if (mesh.flags[v] & 1) continue;
    if (!inZone(v)) continue;
    const seen = new Set([v]);
    let frontier = [v];
    for (let r = 0; r < rings; r++) {
      const next = [];
      for (const u of frontier) for (const w of adj[u]) if (!seen.has(w)) { seen.add(w); next.push(w); }
      frontier = next;
    }
    const tris = new Set();
    for (const u of seen) for (const t of vt[u]) tris.add(t);
    let x = 0, y = 0, z = 0;
    for (const t of tris) { x += fn[t * 3]; y += fn[t * 3 + 1]; z += fn[t * 3 + 2]; }
    const l = Math.sqrt(x * x + y * y + z * z);
    if (l > 1e-9) { out[v * 3] = x / l; out[v * 3 + 1] = y / l; out[v * 3 + 2] = z / l; }
  }
  mesh.nrm = out;
  return mesh;
}
