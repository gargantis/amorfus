#!/bin/bash
# v-table: class tables at other n, n-study scoring, remaining scoring (one node process at a time)
cd "$(dirname "$0")/.."
N="node --max-old-space-size=700"
timeout 500 $N src/classtab.mjs FINITE-4 12 60 > logs/classtab-FINITE-4-n12.log 2>&1
timeout 590 $N src/classtab.mjs FINITE-4 20 60 > logs/classtab-FINITE-4-n20.log 2>&1
timeout 590 $N src/classtab.mjs FINITE-4 24 25 > logs/classtab-FINITE-4-n24.log 2>&1
F="tabNV12m=res/table-mine/FINITE-4_E2c_n12_clu-novol.json,tabNV20=res/table-mine/FINITE-4_E2c_n20_clu-novol.json"
for n in 12 16 20; do timeout 400 $N src/score.mjs n1 FINITE-4 $n all --fit $F > logs/score-n1-FINITE-4-n$n.log 2>&1; done
timeout 300 $N src/cmpcache.mjs n1 FINITE-4 12 FINITE-4 20 res/cmp-n1-FINITE-4-n12-vs-n20.json > logs/cmp-n1-12-20.log 2>&1
timeout 300 $N src/cmpcache.mjs n1 FINITE-4 16 FINITE-4 20 res/cmp-n1-FINITE-4-n16-vs-n20.json > logs/cmp-n1-16-20.log 2>&1
timeout 400 $N src/score.mjs t7 FINITE-4 12 all > logs/score-t7-FINITE-4.log 2>&1
timeout 590 $N src/score.mjs t1 FID-0.15 12 all > logs/score-t1-FID.log 2>&1
timeout 300 $N src/score.mjs b FID-0.15 12 all > logs/score-b-FID.log 2>&1
timeout 300 $N src/score.mjs t7 FID-0.15 12 all > logs/score-t7-FID.log 2>&1
timeout 400 $N src/cmpcache.mjs t1 FINITE-4 12 FINITE-4-nv 12 res/cmp-t1-FINITE-4-vol-vs-nv.json > logs/cmp-t1-vol-nv.log 2>&1
echo chain2-done > logs/chain2.done
