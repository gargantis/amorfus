import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

// §14 Lint: the project config must (a) fail the banned-ops fixture when it
// sits under src/core/gen/, (b) pass the same shapes elsewhere, and (c) ban
// the navigation/storage escapes everywhere.
describe('eslint project config', () => {
  const eslint = new ESLint({ cwd: root });

  it('fails the generator fixture under src/core/gen/', async () => {
    const code = await readFile(
      new URL('./fixtures/gen-banned.ts.fixture', import.meta.url),
      'utf8',
    );
    const [res] = await eslint.lintText(code, {
      filePath: 'src/core/gen/v1/fixture.ts',
    });
    // tanh, pow, **, Date, performance, random — at least 6 findings.
    expect(res.errorCount).toBeGreaterThanOrEqual(6);
  });

  it('allows exact ops under src/core/gen/', async () => {
    const [res] = await eslint.lintText(
      'export const f = (x: number): number => Math.fround(Math.sqrt(x));\n',
      { filePath: 'src/core/gen/v1/ok.ts' },
    );
    expect(res.errorCount).toBe(0);
  });

  it('does not apply the generator allowlist outside src/core/gen/', async () => {
    const [res] = await eslint.lintText(
      'export const f = (x: number): number => Math.sin(x);\n',
      { filePath: 'src/render/ok.ts' },
    );
    expect(res.errorCount).toBe(0);
  });

  it('bans the History API, service worker registration, and root-absolute URLs everywhere', async () => {
    const [res] = await eslint.lintText(
      [
        'history.pushState({}, "", "x");',
        'navigator.serviceWorker.register("sw.js");',
        'fetch("/absolute");',
        'export {};',
      ].join('\n'),
      { filePath: 'src/ui/bad.ts' },
    );
    expect(res.errorCount).toBeGreaterThanOrEqual(3);
  });

  it('bans localStorage and caches in src', async () => {
    const [res] = await eslint.lintText(
      'localStorage.setItem("w", "x"); caches.open("w");\nexport {};\n',
      { filePath: 'src/storage/bad.ts' },
    );
    expect(res.errorCount).toBeGreaterThanOrEqual(2);
  });
});
