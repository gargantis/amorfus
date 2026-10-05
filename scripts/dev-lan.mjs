#!/usr/bin/env node
// C-5: navigator.gpu and crypto.subtle are undefined on http://<LAN IP>.
// dev:lan serves Vite over https with a self-signed certificate so a second
// machine on the LAN gets a secure context. Browsers will warn once.
import { spawnSync, spawn } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = join(process.cwd(), '.cache', 'lan-cert');
const key = join(dir, 'key.pem');
const cert = join(dir, 'cert.pem');

if (!existsSync(key) || !existsSync(cert)) {
  mkdirSync(dir, { recursive: true });
  const r = spawnSync('openssl', [
    'req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
    '-keyout', key, '-out', cert, '-days', '30', '-nodes',
    '-subj', '/CN=amorfus-dev-lan',
  ], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('dev-lan: openssl failed; is it installed?');
    process.exit(1);
  }
  console.log('dev-lan: created a 30-day self-signed certificate in .cache/lan-cert');
}

const child = spawn('npx', ['vite', '--host'], {
  stdio: 'inherit',
  env: { ...process.env, AMORFUS_LAN_KEY: key, AMORFUS_LAN_CERT: cert },
});
child.on('exit', (code) => process.exit(code ?? 0));
