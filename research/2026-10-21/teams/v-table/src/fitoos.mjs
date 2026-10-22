// v-table: make the out-of-sample 'fit' placement for the 2-fold FINITE-4 fit:
// fitA (trained on even-chunk t1 windows) is used on odd-chunk windows and
// fitB on even-chunk ones; also 'fitIS' (in-sample) for contrast. Other
// sets (t7, builds) are out of sample for both: fit = mean placement fitA.
//   node src/fitoos.mjs <in.json> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
const [inp, out] = process.argv.slice(2);
const R = JSON.parse(readFileSync(inp, 'utf8'));
for (const [name, row] of Object.entries(R.scenes)) {
  const m = /^t(\d+)/.exec(name);
  if (R.set === 't1' && m && row.place.fitA && row.place.fitB) {
    const even = +m[1] % 2 === 0;
    row.place.fitOOS = even ? row.place.fitB : row.place.fitA;
    row.place.fitIS = even ? row.place.fitA : row.place.fitB;
    delete row.place.fitA; delete row.place.fitB;
  } else if (row.place.fitF) { // FID fit trained on t1 chunks 0-3
    if (R.set === 't1' && m && +m[1] < 4) { delete R.scenes[name]; continue; } // in-sample windows dropped
    else { row.place.fitOOS = row.place.fitF; delete row.place.fitF; }
  } else if (row.place.fitA) {
    row.place.fitOOS = row.place.fitA; row.place.fitOOS_B = row.place.fitB;
    delete row.place.fitA; delete row.place.fitB;
  }
}
writeFileSync(out, JSON.stringify(R));
