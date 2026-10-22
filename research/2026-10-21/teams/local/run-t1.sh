#!/bin/bash
# Task 1 sweep, one node process at a time.
cd "$(dirname "$0")"
D=1,2,3,4,6,8,10
for R in FID-0.15 FID-0.05 FINITE-4 CAGE-0.25; do
  for K in add remove recolour; do
    timeout 590 node --max-old-space-size=700 task1.mjs $R $K $D >> logs/t1-$R-$K.log 2>&1 || echo "FAIL $R $K" >> logs/t1-fail.log
  done
done
for R in FID-0.15-novol FID-0.05-novol FINITE-4-novol CAGE-0.25-novol; do
  for K in add remove recolour; do
    timeout 590 node --max-old-space-size=700 task1.mjs $R $K 1,2,4,8 >> logs/t1-$R-$K.log 2>&1 || echo "FAIL $R $K" >> logs/t1-fail.log
  done
done
for R in FID-0.15 FID-0.05 FINITE-4 CAGE-0.25 FID-0.15-novol FINITE-4-novol; do
  timeout 590 node --max-old-space-size=700 task1seam.mjs $R $D >> logs/t1seam-$R.log 2>&1 || echo "FAIL seam $R" >> logs/t1-fail.log
done
echo done > logs/t1-done
