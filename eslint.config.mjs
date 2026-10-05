import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import genExactOps from './scripts/eslint/gen-exact-ops.mjs';

const local = {
  rules: { 'gen-exact-ops': genExactOps },
};

const NODE_GLOBALS = Object.fromEntries(
  [
    'process', 'console', 'Buffer', 'URL', 'URLSearchParams', 'TextEncoder',
    'TextDecoder', 'fetch', 'crypto', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'queueMicrotask', 'structuredClone',
    'AbortController', 'WebSocket', 'performance', 'Blob', 'Response', 'Request',
  ].map((n) => [n, 'readonly']),
);

// §14 Lint. The generator allowlist guards determinism (C-10); the global
// bans guard the IPFS-subpath contract (§13.3) and the storage rules (§12.1).
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.cache/**',
      '.superpowers/**',
      'research/**',
      'test-results/**',
      'playwright-report/**',
      'scripts/eslint/fixtures/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended.map((c) => ({
    ...c,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['**/*.ts', '**/*.mjs', '**/*.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[property.name='pushState']",
          message: 'The History API breaks IPFS subpath hosting (§13.3).',
        },
        {
          selector: "MemberExpression[property.name='replaceState']",
          message: 'The History API breaks IPFS subpath hosting (§13.3).',
        },
        {
          selector:
            "MemberExpression[object.property.name='serviceWorker'][property.name='register']",
          message: 'A service worker would fight the Service Worker Gateway, which owns / (§13.3).',
        },
        {
          selector: "CallExpression[callee.name='fetch'] > Literal:first-child[value=/^\\u002F/]",
          message: 'Root-absolute URLs break subpath hosting; go through the module graph (§13.3).',
        },
        {
          selector: "NewExpression[callee.name='URL'] > Literal:first-child[value=/^\\u002F/]",
          message: 'Root-absolute URLs break subpath hosting; use new URL(relative, import.meta.url) (§13.3).',
        },
        {
          selector: "NewExpression[callee.name='Worker'] > Literal:first-child",
          message: 'Workers must be new Worker(new URL(…, import.meta.url), {type: "module"}) (§13.3).',
        },
      ],
    },
  },
  {
    files: ['scripts/**', 'e2e/**', '*.config.ts', '*.config.mjs', 'playwright.config.ts'],
    languageOptions: { globals: NODE_GLOBALS },
  },
  {
    // boot.js is a classic pre-module script running in the browser only.
    files: ['public/boot.js'],
    languageOptions: {
      sourceType: 'script',
      globals: Object.fromEntries(
        ['window', 'document', 'location', 'navigator', 'setTimeout', 'clearTimeout'].map(
          (n) => [n, 'readonly'],
        ),
      ),
    },
    rules: {
      'no-unused-vars': ['error', { caughtErrors: 'none' }],
    },
  },
  {
    files: ['src/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'World data lives in IndexedDB (§12.1); gateways delete foreign storage.' },
        { name: 'sessionStorage', message: 'World data lives in IndexedDB (§12.1).' },
        { name: 'caches', message: 'The Service Worker Gateway deletes caches it does not own (§12.1).' },
      ],
    },
  },
  {
    // The determinism allowlist guards SHIPPED generator code; tests may
    // use ordinary arithmetic to describe expectations.
    files: ['src/core/gen/**'],
    ignores: ['src/core/gen/**/*.test.ts'],
    plugins: { local },
    rules: {
      'local/gen-exact-ops': 'error',
    },
  },
  {
    // Vendored FastNoiseLite stays byte-pristine (C-10). gen-exact-ops
    // still applies above; only stylistic rules are relaxed. Its
    // precision-losing literals parse to the same f64 in every engine —
    // literal parsing is exactly specified by ECMA-262.
    files: ['src/core/gen/v1/vendor/FastNoiseLite.js'],
    rules: {
      'no-case-declarations': 'off',
      'no-loss-of-precision': 'off',
    },
  },
  {
    files: ['src/core/**'],
    rules: {
      // §5: src/core is pure TypeScript — no DOM, no GPU.
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'src/core is DOM-free (§5).' },
        { name: 'window', message: 'src/core is DOM-free (§5).' },
        { name: 'navigator', message: 'src/core is DOM-free (§5).' },
        { name: 'localStorage', message: 'World data lives in IndexedDB (§12.1).' },
        { name: 'sessionStorage', message: 'World data lives in IndexedDB (§12.1).' },
        { name: 'caches', message: 'The Service Worker Gateway deletes caches it does not own (§12.1).' },
      ],
    },
  },
);
