#!/bin/bash
# Task 4 sweep, one node process at a time (n = 16).
cd "$(dirname "$0")"
run() { timeout 590 node --max-old-space-size=700 "$@" >> logs/$LOG.log 2>&1 || echo "FAIL $*" >> logs/t4-fail.log; }
for R in FID-0.15 FID-0.05 FINITE-4 CAGE-0.25 FREE; do
  LOG=t4-sizes-$R; run task4.mjs $R sizes 16 j0,s1,s2,s3,rev
  LOG=t4-contacts-$R; run task4.mjs $R contacts 16 j0,s1,s2,s3,rev
done
for R in FID-0.15 FID-0.05 FINITE-4 CAGE-0.25; do
  LOG=t4-line-$R; run task4.mjs $R line 16 j0,s1,s2,rev slab-line,slab-line4,slab-antiline
  run task4.mjs $R line 16 j0,s1 slab-line-2high
done
LOG=t4-line-FREE; run task4.mjs FREE line 16 j0,s1,rev slab-line,slab-line4,slab-antiline
echo done > logs/t4-done
