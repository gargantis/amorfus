#!/bin/bash
# Pattern (c) double-bubble runs, pinning-law runs, 2D slab-line cross-check.
P="$(cd "$(dirname "$0")" && pwd)"
mkdir -p $P/doubles
for c in pair-diff row-ABB L-ABB L3-AAB row-AAB sq2-AAAB row-AAAB sq2-AABB row-AABB cube2-oneB cube2-halves T-mixed plus5-mixed L3-ABA diag-edge-diff slab-dot; do
  timeout 600 node --max-old-space-size=700 $P/doubles.mjs $c 16 >> $P/doubles/log.txt 2>&1 || echo "FAIL $c" >> $P/doubles/log.txt
done
timeout 600 node --max-old-space-size=700 $P/doubles.mjs ball-AB 12 >> $P/doubles/log.txt 2>&1 || echo "FAIL ball-AB" >> $P/doubles/log.txt
echo DONE >> $P/doubles/log.txt
bash $P/runpin.sh
timeout 900 node --max-old-space-size=600 $P/cross2d.mjs slab-line "32:0.2:0:1,32:0.2:0.001:1,32:0.2:0.001:2,64:0.2:0:1,64:0.2:0.001:1" > $P/cross2d/slab-line.log 2>&1
echo ALLDONE >> $P/doubles/log.txt
