#!/bin/bash
# v-table: catalogue reconciliation with fast C11, class-11 seam on labels, rescore builds FID
cd "$(dirname "$0")/.."
N="node --max-old-space-size=700"
timeout 590 $N src/catscore.mjs FID-0.15 all > logs/catscore-FID.log 2>&1
timeout 590 $N src/catscore.mjs FINITE-4 all > logs/catscore-FINITE-4.log 2>&1
rm -f res/classseam.jsonl
for r in FINITE-4 FID-0.15; do for n in 12 16 20; do timeout 200 $N src/classseam.mjs $r $n >> logs/classseam.log 2>&1; timeout 200 $N src/classseam.mjs $r $n --novol >> logs/classseam.log 2>&1; done; done
echo chain4-done > logs/chain4.done
