import { describe, it, expect } from 'vitest';
import { messageFor } from './gpu-messages';

// §8.2: mapping a gpu-init result to a user-facing message is a pure,
// unit-tested function. Codes: A no-adapter, W fallback warning,
// D device-rejected, R device-lost.
describe('messageFor', () => {
  it('maps a null adapter to message A with platform guidance', () => {
    const m = messageFor({ kind: 'no-adapter' });
    expect(m.code).toBe('A');
    expect(m.fatal).toBe(true);
    expect(m.body.join(' ')).toMatch(/Windows x64|supported platforms/i);
    expect(m.copyable).toContain('chrome://gpu');
    expect(m.link?.href).toMatch(/^https:\/\/github\.com\/gpuweb/);
  });

  it('maps a fallback adapter to non-fatal warning W', () => {
    const m = messageFor({ kind: 'fallback-adapter' });
    expect(m.code).toBe('W');
    expect(m.fatal).toBe(false);
  });

  it('maps a rejected device to D and includes the reason', () => {
    const m = messageFor({ kind: 'device-rejected', reason: 'out of memory' });
    expect(m.code).toBe('D');
    expect(m.fatal).toBe(true);
    expect(m.body.join(' ')).toContain('out of memory');
  });

  it('maps device-lost to R with the save reassurance by storage kind', () => {
    const saved = messageFor({ kind: 'device-lost', storage: 'stable' });
    expect(saved.code).toBe('R');
    expect(saved.body.join(' ')).toMatch(/saved/i);
    const unsaved = messageFor({ kind: 'device-lost', storage: 'no-storage' });
    expect(unsaved.body.join(' ')).toMatch(/Export before reloading/i);
  });

  it('every fatal message names its cause and how to serve correctly', () => {
    for (const r of [{ kind: 'no-adapter' }, { kind: 'device-rejected', reason: 'x' }] as const) {
      const m = messageFor(r);
      expect(m.title.length).toBeGreaterThan(0);
      expect(m.body.join(' ')).toMatch(/https|localhost/i);
    }
  });
});
