#!/bin/bash
# Pinning-law runs (sequential, one node process at a time).
P="$(cd "$(dirname "$0")" && pwd)"
mkdir -p $P/pinning
r() { timeout 600 node --max-old-space-size=700 $P/pinning.mjs "$@" >> $P/pinning/log.txt 2>&1 || echo "FAIL $*" >> $P/pinning/log.txt; }
for s in "12 0.2" "16 0.2" "16 0.3" "12 0.3"; do r cube2 $s; r cube3 $s; r cube4 $s; done
r cube2 24 0.2 0.5; r cube3 24 0.2 0.5
r tunnel 16 0.3; r tunnel 12 0.3
echo DONE >> $P/pinning/log.txt
