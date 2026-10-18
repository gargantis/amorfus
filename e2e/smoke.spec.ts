import { test, expect } from '@playwright/test';
import { gatewayState, mountUrl } from './lib/state';
import { watchPage, offendingRequests } from './lib/guards';

// M0 smoke (§15): the skeleton loads on every mount, WebGPU (SwiftShader)
// draws the test shader, pixels verify through offscreen readback, and the
// module worker's nested import resolves. Guards per §14 "Everywhere".

test('skeleton renders and worker probes on this mount', async ({ page }, testInfo) => {
  const s = gatewayState();
  const base = mountUrl(testInfo.project.name, s);
  const guards = watchPage(page);

  if (testInfo.project.name === 'webgpu-path') {
    // §14: the path mount is navigated WITHOUT the trailing slash; the
    // gateway must redirect like kubo does.
    await page.goto(base.slice(0, -1) + '#test=smoke');
    expect(page.url()).toContain(`/ipfs/${s.cid}/`);
  } else {
    await page.goto(base + '#test=smoke');
  }

  await page.waitForFunction(() => (window.__amorfus?.frames ?? 0) >= 60, undefined, {
    timeout: 60_000,
  });

  // Wait for the chunks under the camera to be meshed, then read back.
  await page.waitForFunction(() => {
    const hud = document.getElementById('hud');
    return hud !== null && / queue 0\b/.test(hud.textContent ?? '');
  }, undefined, { timeout: 60_000 });
  const px = await page.evaluate(() => window.__amorfus!.readCenterPixel());
  // #test=smoke looks straight down at generated terrain around the
  // origin: the centre pixel is a lit grass top — green-dominant, opaque,
  // and definitely not the sky/fog clear colour (which is blue-dominant).
  expect(px[3]).toBe(255);
  expect(px[1]).toBeGreaterThan(40); // lit
  expect(px[1]).toBeGreaterThanOrEqual(px[0]); // g ≥ r
  expect(px[1]).toBeGreaterThan(px[2]); // g > b rules out sky


  await page.waitForFunction(() => window.__amorfus?.workerOk === true, undefined, {
    timeout: 20_000,
  });

  if (testInfo.project.name === 'webgpu-plain') {
    // C-10: the golden-hash canary computed by the production bundle in
    // Chromium equals the Node value (same bundle serves every mount).
    const { readFileSync } = await import('node:fs');
    const goldens = JSON.parse(
      readFileSync('src/core/gen/v1/goldens.json', 'utf8'),
    ) as Array<{ seed: [number, number]; chunk: [number, number, number]; hash: string }>;
    for (let i = 0; i < goldens.length; i += 5) {
      const g = goldens[i]!;
      const browserHash = await page.evaluate(
        ([seed, chunk]) => window.__amorfus!.genGolden(seed, chunk),
        [g.seed, g.chunk] as [[number, number], [number, number, number]],
      );
      expect(`${g.chunk.join(',')}:${browserHash}`).toBe(`${g.chunk.join(',')}:${g.hash}`);
    }
  }

  expect(guards.consoleErrors).toEqual([]);
  expect(guards.failedRequests).toEqual([]);
  const allowed = [base, base.slice(0, -1)];
  if (testInfo.project.name === 'webgpu-path') {
    allowed.push(`http://127.0.0.1:${s.plainPort}/ipfs/${s.cid}`);
  }
  expect(offendingRequests(guards, allowed)).toEqual([]);
});

// §7.9: the bevel rule reaches the renderer through the real path —
// main.ts flag → Streaming → worker → GEN_MESH → faceted vertices. On
// binary ground the rule leaves every flat-face corner on the lattice,
// so a large share of surface vertices sit at integer coordinates; the
// hinted default puts almost none there. One mount is enough.
test('the bevel rule meshes the streamed world through the production loop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'webgpu-plain', 'the rule is mount-independent');
  const s = gatewayState();
  const base = mountUrl(testInfo.project.name, s);
  const guards = watchPage(page);

  await page.goto(base + '#test=smoke&rule=bevel');
  await page.waitForFunction(() => (window.__amorfus?.frames ?? 0) >= 60, undefined, {
    timeout: 60_000,
  });
  await page.waitForFunction(() => {
    const hud = document.getElementById('hud');
    return hud !== null && / queue 0\b/.test(hud.textContent ?? '');
  }, undefined, { timeout: 60_000 });

  const stats = await page.evaluate(() => window.__amorfus!.vertexStats());
  expect(stats.total).toBeGreaterThan(1000);
  expect(stats.integerFraction).toBeGreaterThan(0.2);
  expect(stats.rule).toBe('bevel');

  // the centre pixel is still a lit, opaque grass top
  const px = await page.evaluate(() => window.__amorfus!.readCenterPixel());
  expect(px[3]).toBe(255);
  expect(px[1]).toBeGreaterThan(40);
  expect(px[1]).toBeGreaterThanOrEqual(px[0]);
  expect(px[1]).toBeGreaterThan(px[2]);

  // and the default rule, same scene, stays off the lattice. A hash-only
  // navigation would keep the loaded module (and its rule), so reload.
  await page.goto(base + '#test=smoke');
  await page.reload();
  await page.waitForFunction(() => (window.__amorfus?.frames ?? 0) >= 30, undefined, { timeout: 60_000 });
  await page.waitForFunction(() => {
    const hud = document.getElementById('hud');
    return hud !== null && / queue 0\b/.test(hud.textContent ?? '');
  }, undefined, { timeout: 60_000 });
  const plain = await page.evaluate(() => window.__amorfus!.vertexStats());
  expect(plain.rule).toBe('hints');
  expect(plain.integerFraction).toBeLessThan(0.1);

  expect(guards.consoleErrors).toEqual([]);
  expect(guards.failedRequests).toEqual([]);
  expect(offendingRequests(guards, [base, base.slice(0, -1)])).toEqual([]);
});
