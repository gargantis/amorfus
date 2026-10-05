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
