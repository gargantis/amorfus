import { test, expect, type Page } from '@playwright/test';
import { gatewayState } from './lib/state';

// Production-path tests (final review, findings #1 and #2): both defects
// were invisible because every harness bypassed the production wiring.
// These drive the real main.ts player loop and the real Host button /
// join link, under SwiftShader, against the local relay.

test.setTimeout(300_000);

interface ScenarioReport {
  distance: number;
  climbed: number;
  edits: number;
  splitSwaps: number;
  frames: number;
}

/** every URL the page touched, WebSockets included */
function trackContacts(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => urls.push(r.url()));
  page.on('websocket', (ws) => urls.push(ws.url()));
  return urls;
}

const nonLoopback = (urls: string[]): string[] =>
  urls.filter((u) => !u.includes('127.0.0.1') && !u.includes('localhost'));

test('scenario A moves, flies and edits through the production loop', async ({ page }) => {
  const s = gatewayState();
  const errors: string[] = [];
  const contacts = trackContacts(page);
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  // The whole 90 s script replayed 6× faster in a radius-32 world, on the
  // Low tier and a small viewport so software rendering yields enough
  // frames per phase.
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto(`http://127.0.0.1:${s.plainPort}/?bench=scenario-a&radius=32&scale=6&tier=low`);
  const handle = await page.waitForFunction(() => window.__scenarioA, undefined, {
    timeout: 240_000,
  });
  const report = (await handle.jsonValue()) as ScenarioReport;
  console.log('scenario A (gate replay):', JSON.stringify(report));
  // Finding #1: with dt ≈ 0 the player never left its spawn.
  expect(report.distance).toBeGreaterThan(2);
  expect(report.climbed).toBeGreaterThan(1); // the fly phase really flew
  expect(report.edits).toBeGreaterThanOrEqual(1); // edits reached the screen
  expect(report.splitSwaps).toBe(0); // §9.4
  expect(errors).toEqual([]);
  // Single-player contacts no third party — and opens no socket at all.
  expect(nonLoopback(contacts)).toEqual([]);
  expect(contacts.filter((u) => u.startsWith('ws'))).toEqual([]);
});

async function gamePage(page: Page, url: string): Promise<string[]> {
  const contacts = trackContacts(page);
  page.on('dialog', (d) => void d.accept()); // privacy sheet, relay hints
  await page.goto(url);
  return contacts;
}

/** poll a page function that may run across a reload */
async function pollPage<T>(page: Page, fn: () => T, want: (v: T) => boolean, timeout: number): Promise<T> {
  let last: T | undefined;
  await expect
    .poll(
      async () => {
        try {
          last = await page.evaluate(fn);
          return want(last);
        } catch {
          return false; // mid-navigation
        }
      },
      { timeout, intervals: [1000] },
    )
    .toBe(true);
  return last as T;
}

test('a second install joins by link, adopts the host world, and sees its edits', async ({ browser }) => {
  const s = gatewayState();
  const relay = encodeURIComponent(`ws://127.0.0.1:${s.relayPort}`);
  const base = `http://127.0.0.1:${s.plainPort}/?radius=32`;

  // Two separate installs: separate storage, so each has its OWN world.
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errorsA: string[] = [];
  a.on('pageerror', (e) => errorsA.push(String(e)));

  const contactsA = await gamePage(a, `${base}#relays=${relay}&ice=none`);
  await pollPage(a, () => window.__amorfusGame?.ready() === true, (v) => v, 180_000);
  const hostWorld = await a.evaluate(() => window.__amorfusGame!.worldId());

  // Host through the real button.
  await a.locator('#net-menu button', { hasText: 'Host world' }).click();
  const secret = await pollPage(a, () => window.__amorfusGame!.secret(), (v) => v !== null, 30_000);

  // Join through the real link.
  const contactsB = await gamePage(b, `${base}#join=${secret}&relays=${relay}&ice=none`);
  // Finding #2: B's own world has a different id. It must adopt the
  // host's world (reloading itself onto it) instead of being refused.
  await pollPage(b, () => window.__amorfusGame?.worldId() ?? '', (v) => v === hostWorld, 180_000);
  // ">= 1": while the joiner reloads onto the adopted world the host may
  // briefly count its old connection as well as the new one.
  await pollPage(a, () => window.__amorfusGame!.connected(), (v) => v >= 1, 120_000);
  await pollPage(b, () => window.__amorfusGame?.connected() ?? 0, (v) => v >= 1, 120_000);

  // An edit made on the host through the production EditManager reaches
  // the joiner's world.
  const cell = await a.evaluate(() => {
    const g = window.__amorfusGame!;
    const [px, , pz] = g.player();
    const x = Math.floor(px);
    const z = Math.floor(pz);
    for (let y = 150; y > -60; y--) {
      const v = g.blockAt(x, y, z);
      if (v !== null && v !== 0) {
        return g.edit(x, y, z, 0) ? ([x, y, z] as [number, number, number]) : null;
      }
    }
    return null;
  });
  expect(cell).not.toBeNull();
  await expect
    .poll(
      async () => b.evaluate(([x, y, z]) => window.__amorfusGame!.blockAt(x, y, z), cell!),
      { timeout: 60_000, intervals: [1000] },
    )
    .toBe(0);

  // The joiner connected twice: once on its own world, once after
  // reloading onto the host's. The first connection has left, so each
  // side counts exactly one player — not a leftover of the first.
  await expect
    .poll(async () => a.evaluate(() => window.__amorfusGame!.connected()), { timeout: 30_000, intervals: [1000] })
    .toBe(1);
  expect(await b.evaluate(() => window.__amorfusGame!.connected())).toBe(1);

  expect(errorsA).toEqual([]);
  // Real Host and Join, and still nothing public was contacted.
  expect(nonLoopback(contactsA)).toEqual([]);
  expect(nonLoopback(contactsB)).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});

// §12.4 world list through the real pause menu: New world (seed text),
// Open, Rename, Delete, Save as copy. Every step is a real click; the
// hooks only read back which world is open.
test('the world list creates, opens, renames and deletes worlds through the real menu', async ({ browser }) => {
  const s = gatewayState();
  const base = `http://127.0.0.1:${s.plainPort}/?radius=32&tier=low`;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  // Rename asks with prompt(), Delete with confirm().
  page.on('dialog', (d) => void (d.type() === 'prompt' ? d.accept('Renamed') : d.accept()));
  await page.setViewportSize({ width: 640, height: 360 });
  const contacts = trackContacts(page);
  await page.goto(base);

  const ready = () => window.__amorfusGame?.ready() === true;
  await pollPage(page, ready, (v) => v, 180_000);
  const first = await page.evaluate(() => window.__amorfusGame!.worldId());
  expect(await page.evaluate(() => window.__amorfusGame!.seed())).toEqual([1, 1]);
  const rows = page.locator('#world-list .world-row');
  // Match on the label only: a row's full text runs its buttons together
  // ("RenameDelete" contains "Renamed").
  const rowNamed = (name: string) =>
    rows.filter({ has: page.locator('.world-label', { hasText: new RegExp(`^${name} · `) }) });
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator('.world-label')).toHaveText(/^My world · seed 1,1 · open$/);

  // New world with a typed seed: the page reloads into it.
  await page.fill('#new-world-name', 'Second');
  await page.fill('#new-world-seed', '7,7');
  await page.locator('#new-world-create').click();
  const second = await pollPage(page, () => window.__amorfusGame?.worldId() ?? '', (v) => v !== '' && v !== first, 180_000);
  await pollPage(page, ready, (v) => v, 180_000);
  expect(await page.evaluate(() => window.__amorfusGame!.seed())).toEqual([7, 7]);
  expect(await page.evaluate(() => window.__amorfusGame!.worldName())).toBe('Second');
  await expect(rows).toHaveCount(2);

  // Save as copy lists the copy and stays on the open world.
  await page.locator('#world-menu button', { hasText: 'Save as copy' }).click();
  await expect(rows).toHaveCount(3);
  expect(await page.evaluate(() => window.__amorfusGame!.worldId())).toBe(second);

  // Rename the first world from its row; delete the copy from its row.
  await rowNamed('My world').locator('button', { hasText: 'Rename' }).click();
  await expect(rowNamed('Renamed')).toHaveCount(1);
  await expect(rowNamed('My world')).toHaveCount(0);
  await rowNamed('Second copy').locator('button', { hasText: 'Delete' }).click();
  await expect(rows).toHaveCount(2);
  // the open world offers neither Open nor Delete
  await expect(rowNamed('Second').locator('button', { hasText: 'Delete' })).toHaveCount(0);
  await expect(rowNamed('Second').locator('button', { hasText: 'Open' })).toHaveCount(0);

  // Open the first world again: reload, same id as before, its own seed.
  await rowNamed('Renamed').locator('button', { hasText: 'Open' }).click();
  await pollPage(page, () => window.__amorfusGame?.worldId() ?? '', (v) => v === first, 180_000);
  await pollPage(page, ready, (v) => v, 180_000);
  expect(await page.evaluate(() => window.__amorfusGame!.seed())).toEqual([1, 1]);
  expect(await page.evaluate(() => window.__amorfusGame!.worldName())).toBe('Renamed');
  await expect(rows).toHaveCount(2);

  expect(errors).toEqual([]);
  expect(nonLoopback(contacts)).toEqual([]);
  await ctx.close();
});
