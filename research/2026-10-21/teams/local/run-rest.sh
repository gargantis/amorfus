#!/bin/bash
# After Task 2/3: Task 1 images, FREE probe, Task 4 sweep, rule tests. One node process at a time.
cd "$(dirname "$0")"
run() { timeout 590 node --max-old-space-size=700 "$@" >> logs/$LOG.log 2>&1 || echo "FAIL $*" >> logs/rest-fail.log; }
LOG=img1
run img1.mjs FID-0.15 add 6 --view
run img1.mjs FID-0.15 remove 6
run img1.mjs FID-0.15 recolour 6 --view
run img1.mjs FID-0.05 add 6 --view
run img1.mjs FINITE-4 add 6 --view
run img1.mjs FINITE-4 recolour 6
run img1.mjs CAGE-0.25 add 6 --view
run img1.mjs CAGE-0.25 remove 6
run img1.mjs FID-0.15-novol add 6
run img1.mjs FINITE-4-novol add 6
LOG=t1-free; run t1free.mjs
LOG=t3-superpos-redo; for R in FID-0.15 FID-0.05; do rm -f res/t3/superpos-$R.json; run task3.mjs $R superpos; done
LOG=t2-pillar; for R in FID-0.15 FID-0.15-novol FID-0.05 FINITE-4 CAGE-0.25; do run task2.mjs $R pillar; done
LOG=t2-n16; run task2.mjs FID-0.15 seam 16 seam-a2b2L4,seam-a3b3L4; run task2.mjs CAGE-0.25 seam 16 seam-a3b3L4; run task2.mjs FID-0.15 edge 16 edge-k2L4,edge-k3L4
./run-t4.sh
for R in FID-0.15 FID-0.05 FINITE-4 CAGE-0.25 FREE; do LOG=t4rule-$R; run task4rule.mjs $R 16; done
LOG=img23
run img23.mjs FID-0.15 seam; run img23.mjs CAGE-0.25 seam; run img23.mjs FID-0.15 pit; run img23.mjs CAGE-0.25 pit; run img23.mjs FID-0.05 pit
run img23.mjs FID-0.15 bridge; run img23.mjs FID-0.15 seamend
echo done > logs/rest-done
