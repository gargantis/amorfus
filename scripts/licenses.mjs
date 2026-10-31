#!/usr/bin/env node
// §13.2: the shared notice writer (vendor/hermet) merges Vite's npm licence
// JSON with the worker-only and vendored notices below into
// dist/THIRD-PARTY-LICENSES.txt, then deletes the JSON so audit-dist never
// sees it. The audit cross-checks the result against
// scripts/expected-licenses.json.
import { writeLicenseNotices } from '../vendor/hermet/licenses.mjs';

await writeLicenseNotices({
  product: 'Amorfus',
  // Dependencies that ship in workers only (invisible to the HTML entry's
  // graph) and vendored sources, each { name, version, license, file }.
  extra: [],
});
