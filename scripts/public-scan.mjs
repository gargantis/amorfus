#!/usr/bin/env node
// §13.7: the shared public-scan (vendor/hermet) scans tracked text files
// for absolute home paths and (locally) for terms from a denylist file kept
// OUTSIDE the repo via $AMORFUS_PRIVATE_TERMS. CI has no denylist and runs
// the built-in patterns only.
import { runPublicScan } from '../vendor/hermet/public-scan.mjs';

runPublicScan({ termsEnv: 'AMORFUS_PRIVATE_TERMS' });
