import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface GatewayState {
  cid: string;
  cid2: string;
  plainPort: number;
  cspPort: number;
  headersPort: number;
  dist: string;
}

export function gatewayState(): GatewayState {
  const raw = readFileSync(join(process.cwd(), 'e2e', '.gateway.json'), 'utf8');
  return JSON.parse(raw) as GatewayState;
}

/** The mount URL (directory, trailing slash) for a webgpu-* project. */
export function mountUrl(project: string, s: GatewayState): string {
  switch (project) {
    case 'webgpu-plain':
      return `http://127.0.0.1:${s.plainPort}/`;
    case 'webgpu-path':
      return `http://127.0.0.1:${s.plainPort}/ipfs/${s.cid}/`;
    case 'webgpu-subdomain':
      return `http://${s.cid}.ipfs.localhost:${s.plainPort}/`;
    case 'webgpu-headers':
      return `http://127.0.0.1:${s.headersPort}/`;
    case 'webgpu-csp':
      return `http://127.0.0.1:${s.cspPort}/`;
    default:
      throw new Error(`no mount for project ${project}`);
  }
}
