#!/bin/bash
# Sequential FREE catalogue (one node process at a time).
P="$(cd "$(dirname "$0")" && pwd)"
small="single pair-same pair-diff line3-same line3-ABA line3-ABC L3-same L3-AAB L3-ABC sq2-same sq2-AAAB sq2-AABB sq2-checker sq2-AABC sq2-ABCD diag-edge diag-corner diag-edge-diff cube2-same cube2-oneB cube2-halves cube2-checker cube2-octants plus5 plus5-mixed ring8 T-mixed pillar3 stairs row-AAB row-ABB L-ABB row-AAAB row-AABB L3-ABA"
big16="slab-dot slab-line slab-stripe tunnel"
big12="ball-r2 ball-AB terrain-step"
for c in $small $big16; do timeout 600 node --max-old-space-size=700 $P/freecat.mjs $c 16 1,2 >> $P/free/log.txt 2>&1 || echo "FAIL $c" >> $P/free/log.txt; done
for c in $big12; do timeout 600 node --max-old-space-size=700 $P/freecat.mjs $c 12 1,2 >> $P/free/log.txt 2>&1 || echo "FAIL $c" >> $P/free/log.txt; done
echo DONE >> $P/free/log.txt
