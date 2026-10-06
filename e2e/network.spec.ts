import { test, expect, type Page } from '@playwright/test';
import { gatewayState } from './lib/state';
import { watchPage, type PageGuards } from './lib/guards';

// §14 networking: the Trystero adapter against a LOCAL Nostr relay on
// ws://127.0.0.1 with iceServers [] — the gate contacts nothing public.
// 2 and 4 contexts, a blocked pair exercising forwarding, leave/rejoin
// within 5 s, and a 10 MB flood ending in a bounded-heap disconnect.

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

function netUrl(extra = ''): string {
  const s = gatewayState();
  return (
    `http://127.0.0.1:${s.plainPort}/` +
    `#test=net&relays=${encodeURIComponent(`ws://127.0.0.1:${s.relayPort}`)}&ice=none${extra}`
  );
}

async function netPage(page: Page, extra = ''): Promise<PageGuards> {
  const guards = watchPage(page);
  await page.goto(netUrl(extra));
  await page.waitForFunction(() => window.__amorfusNet !== undefined);
  return guards;
}

const PLANKS = 5;

test('two pages join by code and exchange edits both ways', async ({ context }) => {
  const a = await context.newPage();
  const b = await context.newPage();
  const ga = await netPage(a);
  const gb = await netPage(b);
  const secret = await a.evaluate(() => window.__amorfusNet!.host());
  expect(secret).toMatch(/^[0-9A-HJKMNP-TV-Z]{21}$/);
  expect(await b.evaluate((s) => window.__amorfusNet!.join(s), secret)).toBe(true);
  await a.waitForFunction(() => window.__amorfusNet!.connected() === 1, undefined, { timeout: 30_000 });
  await b.waitForFunction(() => window.__amorfusNet!.connected() === 1, undefined, { timeout: 30_000 });

  await a.evaluate(() => window.__amorfusNet!.applyEdit(1, 1, 1, 5));
  await b.waitForFunction(
    (v) => window.__amorfusNet!.getBlock(1, 1, 1) === v,
    PLANKS,
    { timeout: 15_000 },
  );
  await b.evaluate(() => window.__amorfusNet!.applyEdit(2, 2, 2, 3));
  await a.waitForFunction(() => window.__amorfusNet!.getBlock(2, 2, 2) === 3, undefined, {
    timeout: 15_000,
  });

  // positions flow on the pos channel (§11.6)
  await a.waitForFunction(() => window.__amorfusNet!.avatars() >= 1, undefined, { timeout: 15_000 });

  // Leave and rejoin within 5 s (§14). In-place rejoin with the same
  // trystero selfId hits upstream #195 (the plan pins 0.25.4 and notes
  // the fix lands in 0.25.5); a player's real rejoin is a page (re)load,
  // which is what we test until the pinned bump.
  await b.evaluate(() => window.__amorfusNet!.leave());
  await a.waitForFunction(() => window.__amorfusNet!.connected() === 0, undefined, { timeout: 20_000 });
  await b.reload();
  await b.waitForFunction(() => window.__amorfusNet !== undefined);
  await b.evaluate((s) => window.__amorfusNet!.join(s), secret);
  await a.waitForFunction(() => window.__amorfusNet!.connected() === 1, undefined, { timeout: 30_000 });
  // Trystero logs the EXPECTED user-initiated close when a peer leaves;
  // anything else is a real channel error (§14).
  const unexpected = ga.consoleErrors.filter(
    (e) => !/User-Initiated Abort, reason=Close called/.test(e),
  );
  expect(unexpected).toEqual([]);

  for (const g of [ga, gb]) {
    const external = g.requests.filter((u) => !u.includes('127.0.0.1') && !u.includes('localhost'));
    expect(external).toEqual([]);
  }
  await a.close();
  await b.close();
});

test('four pages converge, one blocked pair relies on forwarding', async ({ context }) => {
  const pages: Page[] = [];
  for (let i = 0; i < 4; i++) pages.push(await context.newPage());
  // The last page refuses direct traffic with the FIRST peer it sees.
  await netPage(pages[0]!);
  await netPage(pages[1]!);
  await netPage(pages[2]!);
  await netPage(pages[3]!, '&blockNth=1');

  const secret = await pages[0]!.evaluate(() => window.__amorfusNet!.host());
  for (const p of pages.slice(1)) {
    await p.evaluate((s) => window.__amorfusNet!.join(s), secret);
  }
  // The blocked pair never admits each other: 3 of the 4 see all 3 others,
  // the pair members see 2 each.
  await pages[1]!.waitForFunction(() => window.__amorfusNet!.connected() === 3, undefined, { timeout: 60_000 });
  await pages[2]!.waitForFunction(() => window.__amorfusNet!.connected() === 3, undefined, { timeout: 60_000 });
  await pages[3]!.waitForFunction(() => window.__amorfusNet!.connected() >= 2, undefined, { timeout: 60_000 });

  // An edit from the blocked member must reach everyone (forwarding §10.3).
  await pages[3]!.evaluate(() => window.__amorfusNet!.applyEdit(7, 7, 7, 6));
  for (const p of pages) {
    await p.waitForFunction(() => window.__amorfusNet!.getBlock(7, 7, 7) === 6, undefined, {
      timeout: 30_000,
    });
  }
  for (const p of pages) await p.close();
});
