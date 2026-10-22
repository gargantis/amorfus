// Summarise Task 4 (res/t4/{sizes,contacts,line}-*.json): which material's
// separate clusters united, per config, regime and variant; then score
// candidate local rules against the physics outcome.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
const dir = new URL('./res/t4/', import.meta.url);
const A = 6, B = 7;
const table = {}; // name -> regime -> variant -> outcome string
const meta = {};
for (const f of readdirSync(dir).filter((f) => /^(sizes|contacts|line)-/.test(f)).sort()) {
  const r = JSON.parse(readFileSync(new URL(f, dir)));
  for (const R of Object.values(r.runs)) {
    const s = R.outcome.start, e = R.outcome.end;
    const uA = (s[A] ?? 0) > 1 && (e[A] ?? 0) < (s[A] ?? 0), uB = (s[B] ?? 0) > 1 && (e[B] ?? 0) < (s[B] ?? 0);
    const lostA = (e[A] ?? 0) === 0 && (s[A] ?? 0) > 0;
    let o = uA && uB ? 'both' : uA ? 'A' : uB ? 'B' : 'none';
    if (uA && (e[A] ?? 0) > 1) o += `(A ${s[A]}->${e[A]})`;
    if (uB && (e[B] ?? 0) > 1) o += `(B ${s[B]}->${e[B]})`;
    if (!R.info.converged && r.regName !== 'FINITE-4') o += '*';
    // any phase that vanished (volume < 0.05)?
    const gone = R.info.phases.filter((p) => p.volume < 0.05).length;
    if (gone) o += `!${gone}gone`;
    ((table[R.name] ??= {})[r.regName] ??= {})[R.variant] = o;
    meta[R.name] = { sa: R.sa, sb: R.sb, note: R.note, nBlocks: R.nBlocks };
  }
}
const regs = ['FID-0.15', 'FID-0.05', 'FINITE-4', 'CAGE-0.25', 'FREE'];
const vars = ['j0', 's1', 's2', 's3', 'rev'];
const summary = {};
for (const [name, byReg] of Object.entries(table)) {
  summary[name] = {};
  for (const reg of regs) {
    const v = byReg[reg]; if (!v) continue;
    const outs = vars.map((k) => v[k] ?? '-');
    const core = outs.map((o) => o.replace(/[*!].*$/, ''));
    const agree = new Set(core.filter((o) => o !== '-')).size === 1;
    summary[name][reg] = { outs, agree, verdict: agree ? core[0] : 'split:' + [...new Set(core)].join('/') };
  }
}
writeFileSync(new URL('./res/t4-summary.json', import.meta.url), JSON.stringify({ variants: vars, table: summary, meta }, null, 1));
console.log('config'.padEnd(20), regs.map((r) => r.padEnd(26)).join(''));
for (const [name, s] of Object.entries(summary)) console.log(name.padEnd(20), regs.map((r) => (s[r] ? `${s[r].verdict} [${s[r].outs.join(',')}]` : '-').slice(0, 25).padEnd(26)).join(''));
