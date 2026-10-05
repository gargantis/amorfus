import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// §13.2: every emitted URL must be relative, workers must be ES modules
// (the default 'iife' silently inlined worker dynamic imports), and the
// npm licence JSON feeds scripts/licenses.mjs which merges and deletes it.
// dev:lan (scripts/dev-lan.mjs) passes a self-signed cert through the
// environment so a second LAN machine gets a secure context (C-5).
const lanKey = process.env.AMORFUS_LAN_KEY;
const lanCert = process.env.AMORFUS_LAN_CERT;

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  server:
    lanKey && lanCert
      ? { https: { key: readFileSync(lanKey), cert: readFileSync(lanCert) } }
      : {},
  build: {
    target: 'esnext',
    sourcemap: false,
    // Never inline CSS into a <style> tag: CSP-restricted gateways
    // (default-src 'self', e.g. ipfs.filebase.io) reject inline styles (C-16).
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    license: { fileName: '.license-npm.json' },
  },
});
