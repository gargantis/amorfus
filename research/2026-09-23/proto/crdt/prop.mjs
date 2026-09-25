import fc from "fast-check";
// op: {k, l, c, p, v}
const cmpTag = (a, b, withValue) => (a.l - b.l) || (a.c - b.c) || (a.p - b.p) || (withValue ? a.v - b.v : 0);
const apply = (state, op, withValue) => { const cur = state.get(op.k); if (!cur || cmpTag(op, cur, withValue) > 0) state.set(op.k, op); };
const replay = (ops, withValue) => { const s = new Map(); for (const o of ops) apply(s, o, withValue); return JSON.stringify([...s.entries()].sort((a,b)=>a[0]-b[0]).map(([k,o])=>[k,o.v])); };
const opArb = fc.record({ k: fc.integer({min:0,max:5}), l: fc.integer({min:0,max:3}), c: fc.integer({min:0,max:1}), p: fc.integer({min:0,max:2}), v: fc.integer({min:0,max:3}) });
for (const withValue of [false, true]) {
  const r = fc.check(fc.property(fc.array(opArb, {maxLength: 30}).chain(ops => fc.tuple(fc.constant(ops), fc.shuffledSubarray(ops.concat(ops), {minLength: ops.length*2, maxLength: ops.length*2}))),
    ([ops, perm]) => replay(ops, withValue) === replay(perm, withValue)), { numRuns: 2000, seed: 42 });
  console.log(`value tiebreak=${withValue}: ${r.failed ? "FAILS, counterexample " + JSON.stringify(r.counterexample[0][0]) : "passes 2000 runs"}`);
}
