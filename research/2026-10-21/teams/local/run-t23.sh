#!/bin/bash
# Task 2 and Task 3 sweeps, one node process at a time.
cd "$(dirname "$0")"
run() { timeout 590 node --max-old-space-size=700 "$@" >> logs/$LOG.log 2>&1 || echo "FAIL $*" >> logs/t23-fail.log; }
for R in FID-0.15 FID-0.05 FINITE-4 CAGE-0.25; do
  for G in seam edge incl pit bump lam; do LOG=t2-$G-$R; run task2.mjs $R $G; done
done
for G in seam edge; do LOG=t2-$G-FID-0.15-novol; run task2.mjs FID-0.15-novol $G; done
LOG=t2-lam-FREE; run task2.mjs FREE lam "" cube1,cube2,cube3,slab2x2x2,plate2x1x2,plate4x1x4,bar1x1x2,bar1x1x4,bar1x1x8,bar2x2x3
for R in FID-0.15 FID-0.05 FINITE-4 CAGE-0.25; do
  for G in bridge seamend superpos; do LOG=t3-$G-$R; run task3.mjs $R $G; done
done
for G in bridge superpos; do LOG=t3-$G-FID-0.15-novol; run task3.mjs FID-0.15-novol $G; done
echo done > logs/t23-done
