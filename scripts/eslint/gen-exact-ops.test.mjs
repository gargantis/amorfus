import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import rule from './gen-exact-ops.mjs';

// §6.4: in src/core/gen/** only exactly rounded operations are allowed.
// Allowed Math members: sqrt floor ceil round trunc abs min max fround imul clz32.
// Everything else on Math is banned, as are Date, performance, crypto and
// Math.random (covered by the Math allowlist).

const tester = new RuleTester({
  languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
});

describe('gen-exact-ops rule', () => {
  it('accepts allowed operations and rejects the rest', () => {
    tester.run('gen-exact-ops', rule, {
      valid: [
        'const a = Math.sqrt(2) + Math.imul(3, 4);',
        'const b = Math.min(Math.max(x, 0), 1) | 0;',
        'const c = Math.fround(x) * Math.abs(y) % Math.floor(z);',
        'const d = Math.clz32(n) + Math.trunc(m) - Math.ceil(k) + Math.round(j);',
      ],
      invalid: [
        { code: 'const a = Math.pow(x, 2);', errors: 1 },
        { code: 'const a = Math.tanh(x);', errors: 1 },
        { code: 'const a = Math.sin(x);', errors: 1 },
        { code: 'const a = Math.random();', errors: 1 },
        { code: 'const a = Math.exp(x);', errors: 1 },
        { code: 'const a = Math["pow"](x, 2);', errors: 1 },
        { code: 'const a = x ** 2;', errors: 1 },
        { code: 'const t = Date.now();', errors: 1 },
        { code: 'const t = new Date();', errors: 1 },
        { code: 'const t = performance.now();', errors: 1 },
        { code: 'const r = crypto.getRandomValues(buf);', errors: 1 },
      ],
    });
  });
});
