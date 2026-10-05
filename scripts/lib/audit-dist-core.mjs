// §14 Build: the dist audit. Pure directory-in, findings-out, so the
// planted-failure self-test runs in vitest without a real build.
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, posix, dirname } from 'node:path';

const TEXT_EXT = new Set(['.html', '.css', '.js', '.txt', '.json']);
const ALLOWED_EXT = new Set(['.html', '.css', '.js', '.txt', '.ico', '.png', '.svg', '.webmanifest']);
const MAX_BYTES = 25 * 1024 * 1024;

const SECRET_PATTERNS = [
  /AKIA[0-9A-Z]{16}/, // AWS access key id
  /ghp_[A-Za-z0-9]{36}/, // GitHub token
  /github_pat_[A-Za-z0-9_]{22,}/,
  /sk-[A-Za-z0-9]{20,}/, // generic secret-key shape
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /eyJ[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]{20,}/, // JWT
];

const URL_RE = /(?:https?|wss?):\/\/([A-Za-z0-9.-]+)(?::\d+)?/g;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0']);

export async function auditDist(dir, { allowedHosts, expectedLicensePackages }) {
  const findings = [];
  const files = await walk(dir);
  const relFiles = new Set(files.map((f) => toPosix(relative(dir, f))));

  for (const abs of files) {
    const rel = toPosix(relative(dir, abs));
    const base = posix.basename(rel);
    const ext = extOf(base);

    // Forbidden names (§13.3): gateway-owned names, host-specific config,
    // dotfiles, and any markdown (a stray CLAUDE.md must never ship).
    if (base.startsWith('ipfs-sw-') || base === '_redirects' || base.startsWith('.') || ext === '.md') {
      findings.push({ file: rel, why: 'forbidden file' });
      continue;
    }

    if (base !== '_headers' && !ALLOWED_EXT.has(ext)) {
      findings.push({ file: rel, why: 'extension not allowlisted' });
    }

    const st = await stat(abs);
    if (st.size > MAX_BYTES) findings.push({ file: rel, why: 'file over 25 MiB' });

    if (!TEXT_EXT.has(ext) && base !== '_headers') continue;
    const text = await readFile(abs, 'utf8');

    for (const re of SECRET_PATTERNS) {
      if (re.test(text)) findings.push({ file: rel, why: 'secret pattern' });
    }

    for (const m of text.matchAll(URL_RE)) {
      const host = m[1].toLowerCase();
      if (LOOPBACK.has(host)) {
        if (base !== 'boot.js') findings.push({ file: rel, why: 'host not in third-party.json', detail: host });
        continue;
      }
      // Spec-namespace URLs that never produce requests (xmlns etc.).
      if (host === 'www.w3.org') continue;
      if (!allowedHosts.includes(host)) {
        findings.push({ file: rel, why: 'host not in third-party.json', detail: host });
      }
    }

    if (ext === '.html') checkRefs(htmlRefs(text), rel, relFiles, findings);
    else if (ext === '.css') checkRefs(cssRefs(text), rel, relFiles, findings);
    else if (ext === '.js') {
      for (const s of jsStringLiterals(text)) {
        if (s.startsWith('/') && !s.startsWith('//')) {
          findings.push({ file: rel, why: 'root-absolute URL', detail: s });
        }
      }
    }
  }

  // Licence list vs the expected package set (§13.2).
  if (relFiles.has('THIRD-PARTY-LICENSES.txt')) {
    const text = await readFile(join(dir, 'THIRD-PARTY-LICENSES.txt'), 'utf8');
    const present = new Set(
      [...text.matchAll(/^## (@?[A-Za-z0-9._/-]+?)@[0-9]/gm)].map((m) => m[1]),
    );
    const expected = new Set(expectedLicensePackages);
    for (const p of present) if (!expected.has(p)) findings.push({ file: 'THIRD-PARTY-LICENSES.txt', why: 'licence list mismatch', detail: `unexpected ${p}` });
    for (const p of expected) if (!present.has(p)) findings.push({ file: 'THIRD-PARTY-LICENSES.txt', why: 'licence list mismatch', detail: `missing ${p}` });
  }

  return { findings };
}

function checkRefs(refs, rel, relFiles, findings) {
  for (const r of refs) {
    if (/^(?:https?|wss?):/.test(r) || r.startsWith('data:') || r.startsWith('#') || r.startsWith('mailto:')) continue;
    if (r.startsWith('/')) {
      findings.push({ file: rel, why: 'root-absolute URL', detail: r });
      continue;
    }
    const target = posix.normalize(posix.join(toPosix(dirname(rel)), r.split(/[?#]/)[0]));
    if (!relFiles.has(target)) {
      findings.push({ file: rel, why: 'unresolved reference', detail: r });
    }
  }
}

function htmlRefs(text) {
  return [...text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1]);
}

function cssRefs(text) {
  return [...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]);
}

function jsStringLiterals(text) {
  const out = [];
  for (const m of text.matchAll(/(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g)) out.push(m[2]);
  return out;
}

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true, recursive: true })) {
    if (e.isFile()) out.push(join(e.parentPath, e.name));
  }
  return out;
}

const extOf = (base) => {
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i).toLowerCase();
};
const toPosix = (p) => p.split('\\').join('/');
