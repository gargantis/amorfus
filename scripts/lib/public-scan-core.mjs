// Core of §13.7 public-scan: pure functions over file text, so the gate's
// behaviour is unit-tested without touching git or the filesystem.

const BUILTIN = [
  { re: /\/home\/[A-Za-z0-9._-]+\//, why: 'absolute home path' },
  { re: /\/Users\/[A-Za-z0-9._-]+\//, why: 'absolute home path' },
  { re: /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+/, why: 'absolute home path' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'private key material' },
];

/** Scan one file's text. `extraTerms` come from the out-of-repo denylist;
 *  findings never echo the matched denylist term. */
export function scanText(path, text, extraTerms) {
  const findings = [];
  const terms = extraTerms.map((t) => ({
    re: new RegExp(`(?<![A-Za-z0-9])${escapeRe(t)}(?![A-Za-z0-9])`, 'i'),
  }));
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { re, why } of BUILTIN) {
      const m = re.exec(line);
      if (m) findings.push({ path, line: i + 1, match: m[0], why });
    }
    for (const { re } of terms) {
      if (re.test(line)) {
        findings.push({ path, line: i + 1, match: '<private term>', why: 'denylist term' });
      }
    }
  }
  return findings;
}

export function isProbablyBinary(buf) {
  const n = Math.min(buf.length, 8192);
  for (let i = 0; i < n; i++) {
    const b = buf[i];
    if (b === 0) return true;
    if (b < 7 && b !== 0) return true;
  }
  return false;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
