import { describe, it, expect } from 'vitest';
import { scanText, isProbablyBinary } from './public-scan-core.mjs';

// §13.7: public-scan fails the gate on absolute home paths in tracked text
// files, and on terms from an optional denylist kept outside the repo.
describe('public-scan core', () => {
  // Fixture strings are assembled at runtime so this file itself never
  // contains what the scanner hunts for.
  const sep = '/';
  const home = (base, user) => `${sep}${base}${sep}${user}${sep}`;

  it('flags absolute home paths on all three platforms', () => {
    const text = [
      'ok line',
      `path ${home('home', 'someone')}git/x`,
      `mac ${home('Users', 'Some.One')}code`,
      `win C:${'\\'}Users${'\\'}someone${'\\'}x`,
    ].join('\n');
    const found = scanText('doc.md', text, []);
    expect(found.map((f) => f.line)).toEqual([2, 3, 4]);
  });

  it('flags private key material', () => {
    const marker = ['-----BEGIN OPENSSH', 'PRIVATE KEY-----'].join(' ');
    const found = scanText('a.txt', marker, []);
    expect(found).toHaveLength(1);
  });

  it('flags denylist terms case-insensitively, as whole words', () => {
    const found = scanText('b.md', 'about SECRETWORD here\nsecretwordy is fine', ['secretword']);
    expect(found).toHaveLength(1);
    expect(found[0].line).toBe(1);
  });

  it('never reveals the denylist term in the finding', () => {
    const [f] = scanText('b.md', 'x secretword y', ['secretword']);
    expect(JSON.stringify(f)).not.toContain('secretword');
  });

  it('returns nothing on clean text', () => {
    expect(scanText('c.ts', 'const homeDir = os.homedir();', [])).toEqual([]);
  });

  it('detects binary buffers', () => {
    expect(isProbablyBinary(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1]))).toBe(true);
    expect(isProbablyBinary(Buffer.from('plain text\n'))).toBe(false);
  });
});
