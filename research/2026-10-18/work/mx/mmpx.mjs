// MMPX (McGuire & Gagiu, JCGT 2021) 2× rules on material ids, written from
// the published reference listing as I recall it. Luma (tie-breaker: darker
// strokes win) = palette luminance of each material. Output per block: the
// 2×2 sub-blocks J K / L M; a fragment shows the quadrant it falls in.
// src(dx, dy) returns the material at the offset; 25 + 4 distance-3 taps.
import { PALETTE } from '../../harness/raster.mjs';
const LUMA = PALETTE.map(([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b);
export function mmpx(src) {
  const A = src(-1, -1), B = src(0, -1), C = src(1, -1), D = src(-1, 0), E = src(0, 0), F = src(1, 0), G = src(-1, 1), H = src(0, 1), I = src(1, 1);
  let J = E, K = E, L = E, M = E;
  if (A === E && B === E && C === E && D === E && F === E && G === E && H === E && I === E) return [J, K, L, M];
  const P = src(0, -2), S = src(0, 2), Q = src(-2, 0), R = src(2, 0);
  const l = (m) => LUMA[m] ?? 0;
  const Bl = l(B), Dl = l(D), El = l(E), Fl = l(F), Hl = l(H);
  const any3 = (b, a0, a1, a2) => b === a0 || b === a1 || b === a2;
  const all2 = (b, a0, a1) => b === a0 && b === a1;
  const all3 = (b, a0, a1, a2) => b === a0 && b === a1 && b === a2;
  const all4 = (b, a0, a1, a2, a3) => b === a0 && b === a1 && b === a2 && b === a3;
  const none2 = (b, a0, a1) => b !== a0 && b !== a1;
  const none4 = (b, a0, a1, a2, a3) => b !== a0 && b !== a1 && b !== a2 && b !== a3;
  // 1:1 slope rules
  if (D === B && D !== H && D !== F && (El >= Dl || E === A) && any3(E, A, C, G) && (El < Dl || A !== D || E !== P || E !== Q)) J = D;
  if (B === F && B !== D && B !== H && (El >= Bl || E === C) && any3(E, A, C, I) && (El < Bl || C !== B || E !== P || E !== R)) K = B;
  if (H === D && H !== F && H !== B && (El >= Hl || E === G) && any3(E, A, G, I) && (El < Hl || G !== H || E !== S || E !== Q)) L = H;
  if (F === H && F !== B && F !== D && (El >= Fl || E === I) && any3(E, C, G, I) && (El < Fl || I !== H || E !== R || E !== S)) M = F;
  // intersection rules
  if (E !== F && all4(E, C, I, D, Q) && all2(F, B, H) && F !== src(3, 0)) K = M = F;
  if (E !== D && all4(E, A, G, F, R) && all2(D, B, H) && D !== src(-3, 0)) J = L = D;
  if (E !== H && all4(E, G, I, B, P) && all2(H, D, F) && H !== src(0, 3)) L = M = H;
  if (E !== B && all4(E, A, C, H, S) && all2(B, D, F) && B !== src(0, -3)) J = K = B;
  // triangle tips
  if (Bl < El && all4(E, G, H, I, S) && none4(E, A, D, C, F)) J = K = B;
  if (Hl < El && all4(E, A, B, C, P) && none4(E, D, G, I, F)) L = M = H;
  if (Fl < El && all4(E, A, D, G, Q) && none4(E, B, C, I, H)) K = M = F;
  if (Dl < El && all4(E, C, F, I, R) && none4(E, B, A, G, H)) J = L = D;
  // 2:1 slope rules
  if (H !== B) {
    if (H !== A && H !== E && H !== C) {
      if (all3(H, G, F, R) && none2(H, D, src(2, -1))) L = M;
      if (all3(H, I, D, Q) && none2(H, F, src(-2, -1))) M = L;
    }
    if (B !== I && B !== G && B !== E) {
      if (all3(B, A, F, R) && none2(B, D, src(2, 1))) J = K;
      if (all3(B, C, D, Q) && none2(B, F, src(-2, 1))) K = J;
    }
  }
  if (F !== D) {
    if (D !== I && D !== E && D !== C) {
      if (all3(D, A, H, S) && none2(D, B, src(1, 2))) J = L;
      if (all3(D, G, B, P) && none2(D, H, src(1, -2))) L = J;
    }
    if (F !== E && F !== A && F !== G) {
      if (all3(F, C, H, S) && none2(F, B, src(-1, 2))) K = M;
      if (all3(F, I, B, P) && none2(F, H, src(-1, -2))) M = K;
    }
  }
  return [J, K, L, M];
}
export const mmpxEval = (q, fx, fy) => q[(fy < 0.5 ? 0 : 2) + (fx < 0.5 ? 0 : 1)];
