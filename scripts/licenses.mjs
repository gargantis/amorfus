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
  // graph) and vendored sources, each { name, version, license, file },
  // `file` relative to the repo root, where npm runs the build.
  extra: [
    // §6.4: the vendored file is npm fastnoise-lite 1.1.1 byte for byte,
    // though its header still reads VERSION 1.1.0. That package ships no
    // LICENSE, so this one is the upstream repository's.
    { name: 'FastNoiseLite', version: '1.1.1', license: 'MIT', file: 'src/core/gen/v1/vendor/LICENSE' },
  ],
});
