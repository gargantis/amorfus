#!/bin/bash
# v-table: patch-error table fits (resumable 8-minute runs) and their out-of-sample scoring
cd "$(dirname "$0")/.."
N="node --max-old-space-size=700"
EV=$(cat logs/names-t1-even.txt); OD=$(cat logs/names-t1-odd.txt)
FIDTR=t0a,t0b,t0s,t1a,t1b,t1s,t2a,t2b,t2s,t3a,t3b,t3s
for i in 1 2 3; do timeout 590 $N src/patchfit.mjs FINITE-4 D t1 $EV res/fit/fitA-FINITE-4.json --minutes 8 --name fitA >> logs/patchfit-fitA-FINITE-4.log 2>&1; done
for i in 1 2 3; do timeout 590 $N src/patchfit.mjs FINITE-4 D t1 $OD res/fit/fitB-FINITE-4.json --minutes 8 --name fitB >> logs/patchfit-fitB-FINITE-4.log 2>&1; done
for i in 1 2 3; do timeout 590 $N src/patchfit.mjs FID-0.15 D t1 $FIDTR res/fit/fitF-FID.json --minutes 8 --name fitF >> logs/patchfit-fitF-FID.log 2>&1; done
F4="fitA=res/fit/fitA-FINITE-4.json,fitB=res/fit/fitB-FINITE-4.json"
timeout 590 $N src/score.mjs t1 FINITE-4 12 all --fit $F4 --tag fit > logs/score-t1-FINITE-4-fit.log 2>&1
timeout 400 $N src/score.mjs t7 FINITE-4 12 all --fit $F4 --tag fit > logs/score-t7-FINITE-4-fit.log 2>&1
timeout 300 $N src/score.mjs b FINITE-4 12 all --fit $F4 --tag fit > logs/score-b-FINITE-4-fit.log 2>&1
FF="fitF=res/fit/fitF-FID.json"
timeout 590 $N src/score.mjs t1 FID-0.15 12 all --fit $FF --tag fit > logs/score-t1-FID-fit.log 2>&1
timeout 300 $N src/score.mjs t7 FID-0.15 12 all --fit $FF --tag fit > logs/score-t7-FID-fit.log 2>&1
timeout 300 $N src/score.mjs b FID-0.15 12 all --fit $FF --tag fit > logs/score-b-FID-fit.log 2>&1
timeout 400 $N src/simcache.mjs t8 FINITE-4 12 all > logs/simcache-t8-FINITE-4.log 2>&1
timeout 500 $N src/score.mjs t8 FINITE-4 12 all --fit $F4 --tag fit > logs/score-t8-FINITE-4-fit.log 2>&1
timeout 590 $N src/simcache.mjs t8 FID-0.15 12 v0a,v0s,v1a,v1s,v2a,v2s,v3a,v3s,v10a,v11a > logs/simcache-t8-FID.log 2>&1
timeout 400 $N src/score.mjs t8 FID-0.15 12 all --fit $FF --tag fit > logs/score-t8-FID-fit.log 2>&1
echo chain3-done > logs/chain3.done
