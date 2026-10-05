import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// §13.4: amorf.us is assets-only. A unit test asserts no Worker script can
// ever run: no "main", no "run_worker_first". Plus the D-16 departures.
const raw = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const config = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, ''));

describe('wrangler.jsonc', () => {
  it('is assets-only: no main, no run_worker_first', () => {
    expect(config.main).toBeUndefined();
    expect(config.run_worker_first).toBeUndefined();
    expect(config.assets?.run_worker_first).toBeUndefined();
  });

  it('serves ./dist with not_found_handling none (D-16)', () => {
    expect(config.assets.directory).toBe('./dist');
    expect(config.assets.not_found_handling).toBe('none');
  });

  it('keeps observability off (C-15, D-16)', () => {
    expect(config.observability).toEqual({ enabled: false });
  });

  it('routes the apex as a custom domain', () => {
    expect(config.routes).toEqual([{ pattern: 'amorf.us', custom_domain: true }]);
  });
});
