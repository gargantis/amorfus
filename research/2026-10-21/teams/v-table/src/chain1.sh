#!/bin/bash
# v-table: sim chain after FID batch 2 (one node process at a time)
cd "$(dirname "$0")/.."
N="node --max-old-space-size=700"
timeout 400 $N src/simcache.mjs t7 FINITE-4 12 all > logs/simcache-t7-FINITE-4.log 2>&1
for n in 12 16 20; do timeout 500 $N src/simcache.mjs n1 FINITE-4 $n all > logs/simcache-n1-FINITE-4-n$n.log 2>&1; done
timeout 300 $N src/simcache.mjs b FID-0.15 12 all > logs/simcache-b-FID.log 2>&1
timeout 590 $N src/simcache.mjs t7 FID-0.15 12 u0a,u0s,u1a,u1s,u2a,u2s,u3a,u3s,u4a,u4s > logs/simcache-t7-FID.log 2>&1
timeout 590 $N src/simcache.mjs t1 FINITE-4-nv 12 all > logs/simcache-t1-FINITE-4-nv.log 2>&1
echo chain1-done > logs/chain1.done
