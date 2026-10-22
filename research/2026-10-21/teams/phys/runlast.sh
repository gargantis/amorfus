#!/bin/bash
P="$(cd "$(dirname "$0")" && pwd)"
for c in checker-smallA checker-smallB; do timeout 600 node --max-old-space-size=700 $P/freecat.mjs $c 16 1,2 >> $P/free/log.txt 2>&1; done
L=$P/free/merge-timing.log; : > $L
for s in 1 2 3; do timeout 600 node --max-old-space-size=700 $P/mergetiming.mjs sq2-checker 3 $s >> $L 2>&1; done
for s in 1 2 3 4; do timeout 600 node --max-old-space-size=700 $P/mergetiming.mjs sq2-checker 2 $s >> $L 2>&1; done
timeout 600 node --max-old-space-size=700 $P/mergetiming.mjs sq2-checker 2 4 0.01 >> $L 2>&1
timeout 600 node --max-old-space-size=700 $P/mergetiming.mjs slab-line 3 2 >> $L 2>&1
timeout 600 node --max-old-space-size=700 $P/mergetiming.mjs slab-line 3 1 >> $L 2>&1
timeout 600 node --max-old-space-size=400 $P/solvercheck.mjs > $P/cross2d/solvercheck.log 2>&1
echo DONE >> $L
