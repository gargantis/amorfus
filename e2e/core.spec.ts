import { test, expect } from '@playwright/test';
import { gatewayState } from './lib/state';
import { watchPage, offendingRequests } from './lib/guards';

// §14 `core` project: #test=core boots world, storage and net WITHOUT the
// renderer — reload persistence, the CSP mount, zero third-party
// requests, and the §12.5 handoff, all CI-safe without a GPU.

test('saves survive reloads on every storage-capable mount', async ({ page }) => {
  const s = gatewayState();
  const mounts = [
    `http://127.0.0.1:${s.plainPort}/`,
    `http://${s.cid}.ipfs.localhost:${s.plainPort}/`,
    `http://127.0.0.1:${s.headersPort}/`,
  ];
  for (const base of mounts) {
    const guards = watchPage(page);
    await page.goto(`${base}#test=core`);
    await page.waitForFunction(() => window.__amorfusCore?.ready === true);
    const before = await page.evaluate(() => window.__amorfusCore!.editCount);
    await page.evaluate(async () => {
      window.__amorfusCore!.applyEdit(1, 1, 1, 3);
      await window.__amorfusCore!.flush();
    });
    await page.reload();
    await page.waitForFunction(() => window.__amorfusCore?.ready === true);
    const after = await page.evaluate(() => window.__amorfusCore!.editCount);
    expect(after, base).toBeGreaterThan(before);
    expect(guards.consoleErrors).toEqual([]);
    expect(offendingRequests(guards, [base])).toEqual([]);
  }
});

test('the release-pinned banner shows on a cid origin and classification is right', async ({ page }) => {
  const s = gatewayState();
  await page.goto(`http://${s.cid}.ipfs.localhost:${s.plainPort}/#test=core`);
  await page.waitForFunction(() => window.__amorfusCore?.ready === true);
  expect(await page.evaluate(() => window.__amorfusCore!.originKind)).toBe('release-pinned');
  expect(await page.evaluate(() => window.__amorfusCore!.banner)).toMatch(/stay with this version/i);
  await page.goto(`http://127.0.0.1:${s.plainPort}/#test=core`);
  await page.waitForFunction(() => window.__amorfusCore?.ready === true);
  expect(await page.evaluate(() => window.__amorfusCore!.originKind)).toBe('stable');
});

test('core boots under the CSP-restricted mount with no console errors', async ({ page }) => {
  const s = gatewayState();
  const guards = watchPage(page);
  await page.goto(`http://127.0.0.1:${s.cspPort}/#test=core`);
  await page.waitForFunction(() => window.__amorfusCore?.ready === true);
  expect(guards.consoleErrors).toEqual([]);
});

test('handoff: the sender posts worlds to the receiver origin, exact match only', async ({ page }) => {
  const s = gatewayState();
  const senderBase = `http://${s.cid}.ipfs.localhost:${s.plainPort}/`;
  const receiverUrl =
    `http://${s.cid2}.ipfs.localhost:${s.plainPort}/` +
    `#test=handoff-receiver&target=${encodeURIComponent(senderBase)}`;

  const popupPromise = page.waitForEvent('popup');
  await page.goto(receiverUrl);
  const popup = await popupPromise;
  await popup.waitForFunction(() => window.__amorfusHandoff?.status === 'awaiting-confirm');
  await popup.click('button');
  await page.waitForFunction(() => window.__amorfusHandoff?.status === 'received', undefined, {
    timeout: 20_000,
  });
  const files = await page.evaluate(() => window.__amorfusHandoff!.files);
  expect(files).toBeGreaterThanOrEqual(1);

  // A wrong nonce must be rejected (§12.5 receiver checks).
  await page.evaluate(() => {
    postMessage({ type: 'amorfus-handoff', nonce: 'WRONG', files: [] }, location.origin);
  });
  await page.waitForFunction(() => (window.__amorfusHandoff?.rejected ?? 0) >= 1);

  // A disallowed destination refuses before any UI (§12.5 allowlist).
  const evil = await page.context().newPage();
  await evil.goto(`${senderBase}#amorfus-handoff=zzz&to=${encodeURIComponent('https://evil.example.com')}`);
  await evil.waitForFunction(() => window.__amorfusHandoff?.status === 'refused-origin');
  await evil.close();
});
