#!/bin/bash
# 3D validation over (n, s) settings, one process per case (sequential).
P="$(cd "$(dirname "$0")" && pwd)"
cases="single pair-same cube2-same pair-diff row-ABB cube2-oneB L3-ABC"
run() { for c in $cases; do timeout 600 node --max-old-space-size=700 $P/validate3d.mjs $1 $2 $c $3 >> $P/val3d/log.txt 2>&1 || echo "FAIL $1 $2 $c" >> $P/val3d/log.txt; done; }
run 16 0.2 0.5
run 12 0.2
run 24 0.2 0.5
run 16 0.3
run 24 0.1 0.5
run 24 0.3 0.5
run 32 0.2 0.5
echo DONE >> $P/val3d/log.txt
