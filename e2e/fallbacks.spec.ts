import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gatewayState } from './lib/state';

// §8.2/§14: every fallback shows its reason — never a blank page — and
// passes axe. Codes: F file://, S insecure context, U no WebGPU,
// A no adapter.

async function expectFallback(page: Page, code: string, headingPattern: RegExp) {
  const main = page.locator('#fallback');
  await expect(main).toHaveAttribute(code.length === 1 && 'FSUL'.includes(code) ? 'data-boot-code' : 'data-gpu-code', code, { timeout: 30_000 });
  await expect(page.locator('#fallback-title')).toHaveText(headingPattern);
  await expect(page.locator('#fallback-title')).toBeFocused();
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
}

test('shows the right failure message for this project', async ({ page }, testInfo) => {
  const s = gatewayState();
  switch (testInfo.project.name) {
    case 'no-webgpu': {
      await page.addInitScript(() => {
        // Simulate a browser without WebGPU before any page script runs.
        // @ts-expect-error deleting a platform property
        delete Navigator.prototype.gpu;
      });
      await page.goto(`http://127.0.0.1:${s.plainPort}/`);
      await expectFallback(page, 'U', /does not offer WebGPU/i);
      break;
    }
    case 'no-adapter': {
      await page.goto(`http://127.0.0.1:${s.plainPort}/`);
      await expectFallback(page, 'A', /No compatible GPU/i);
      break;
    }
    case 'insecure': {
      await page.goto(`http://insecure.test:${s.plainPort}/`);
      await expectFallback(page, 'S', /secure context/i);
      break;
    }
    case 'file': {
      await page.goto(pathToFileURL(join(s.dist, 'index.html')).href);
      await expectFallback(page, 'F', /file:\/\/ URL/i);
      break;
    }
    default:
      throw new Error(`unexpected project ${testInfo.project.name}`);
  }
});
