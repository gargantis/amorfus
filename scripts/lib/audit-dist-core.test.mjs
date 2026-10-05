import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { auditDist } from './audit-dist-core.mjs';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// §14 Build: audit-dist fails on each planted violation. These tests are the
// planted-failure self-test the plan requires.

let dir;
const opts = () => ({
  allowedHosts: ['relay.damus.io', 'github.com'],
  expectedLicensePackages: [],
});

async function plantClean() {
  await writeFile(join(dir, 'index.html'), '<!doctype html><script type="module" src="./assets/a.js"></script>');
  await mkdir(join(dir, 'assets'), { recursive: true });
  await writeFile(join(dir, 'assets', 'a.js'), 'console.log("hi")');
  await writeFile(join(dir, 'boot.js'), 'document.title = "x"');
  await writeFile(join(dir, '_headers'), '/assets/*\n  Cache-Control: public');
  await writeFile(join(dir, 'THIRD-PARTY-LICENSES.txt'), '');
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'amorfus-audit-'));
  await plantClean();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const whys = (r) => r.findings.map((f) => f.why);

describe('audit-dist', () => {
  it('passes a clean dist', async () => {
    const r = await auditDist(dir, opts());
    expect(r.findings).toEqual([]);
  });

  it('fails on a root-absolute URL in HTML', async () => {
    await writeFile(join(dir, 'index.html'), '<script src="/assets/a.js"></script>');
    expect(whys(await auditDist(dir, opts()))).toContain('root-absolute URL');
  });

  it('fails on a root-absolute url() in CSS', async () => {
    await writeFile(join(dir, 'assets', 's.css'), 'body { background: url(/bg.png); }');
    expect(whys(await auditDist(dir, opts()))).toContain('root-absolute URL');
  });

  it('fails on a root-absolute string URL in JS', async () => {
    await writeFile(join(dir, 'assets', 'a.js'), 'fetch("/api/x")');
    expect(whys(await auditDist(dir, opts()))).toContain('root-absolute URL');
  });

  it('fails on an unresolved relative reference in HTML', async () => {
    await writeFile(join(dir, 'index.html'), '<script type="module" src="./assets/missing.js"></script>');
    expect(whys(await auditDist(dir, opts()))).toContain('unresolved reference');
  });

  it('fails on an external host missing from third-party.json', async () => {
    await writeFile(join(dir, 'assets', 'a.js'), 'fetch("https://evil.example.com/x")');
    expect(whys(await auditDist(dir, opts()))).toContain('host not in third-party.json');
  });

  it('ignores URLs that only appear in JS comments (requests need strings)', async () => {
    await writeFile(
      join(dir, 'assets', 'a.js'),
      '// docs: https://evil.example.com/readme\n/* see https://also-evil.example.com */\nconsole.log("x")',
    );
    expect((await auditDist(dir, opts())).findings).toEqual([]);
  });

  it('allows allowlisted hosts', async () => {
    await writeFile(join(dir, 'assets', 'a.js'), 'const h = "wss://relay.damus.io/"');
    expect(await auditDist(dir, opts())).toHaveProperty('findings', []);
  });

  it('allows loopback literals only in boot.js', async () => {
    await writeFile(join(dir, 'boot.js'), 'msg("serve via http://127.0.0.1:8080/ipfs/")');
    expect((await auditDist(dir, opts())).findings).toEqual([]);
    await writeFile(join(dir, 'assets', 'a.js'), 'fetch("http://127.0.0.1:5001/api")');
    expect(whys(await auditDist(dir, opts()))).toContain('host not in third-party.json');
  });

  it('fails on forbidden file names', async () => {
    await writeFile(join(dir, '_redirects'), '/ /index.html');
    await writeFile(join(dir, 'ipfs-sw-main.js'), '');
    await writeFile(join(dir, '.hidden'), '');
    await writeFile(join(dir, 'CLAUDE.md'), '');
    const w = whys(await auditDist(dir, opts()));
    expect(w.filter((x) => x === 'forbidden file')).toHaveLength(4);
  });

  it('fails on an extension outside the allowlist, exempting _headers', async () => {
    await writeFile(join(dir, 'assets', 'x.exe'), '');
    const r = await auditDist(dir, opts());
    expect(whys(r)).toContain('extension not allowlisted');
    expect(r.findings.some((f) => f.file.endsWith('_headers'))).toBe(false);
  });

  it('fails on a file over 25 MiB', async () => {
    await writeFile(join(dir, 'assets', 'big.js'), Buffer.alloc(25 * 1024 * 1024 + 1));
    expect(whys(await auditDist(dir, opts()))).toContain('file over 25 MiB');
  });

  it('fails on secret patterns', async () => {
    await writeFile(join(dir, 'assets', 'a.js'), 'const k = "AKIAIOSFODNN7EXAMPLE"');
    expect(whys(await auditDist(dir, opts()))).toContain('secret pattern');
  });

  it('fails when the licence list does not match the expected set', async () => {
    await writeFile(join(dir, 'THIRD-PARTY-LICENSES.txt'), '## left-pad@1.0.0\nMIT\n');
    expect(whys(await auditDist(dir, opts({ expectedLicensePackages: [] })))).toContain(
      'licence list mismatch',
    );
  });

  it('fails when THIRD-PARTY-LICENSES.txt is missing an expected package', async () => {
    const o = opts();
    o.expectedLicensePackages = ['wgpu-matrix'];
    expect(whys(await auditDist(dir, o))).toContain('licence list mismatch');
  });
});
