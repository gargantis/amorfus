#!/bin/bash
# After run-rest.sh: Task 4 images. One node process at a time.
cd "$(dirname "$0")"
run() { timeout 590 node --max-old-space-size=700 "$@" >> logs/$LOG.log 2>&1 || echo "FAIL $*" >> logs/final-fail.log; }
LOG=img4
run img4.mjs FREE s1 checker-A1-B1,checker-A1-B4,checker-A4-B1,checker-A2-B2
run img4.mjs FID-0.15 j0 checker-A1-B1,checker-A1-B4,checker-A4-B1,diag-edge,cube2-checker
run img4.mjs CAGE-0.25 j0 checker-A1-B4,checker-A4-B1,diag-edge
echo done > logs/final-done
