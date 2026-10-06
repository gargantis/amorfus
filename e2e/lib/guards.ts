import type { Page } from '@playwright/test';

// §14 "Everywhere": no failed requests or console errors, and every request
// stays under the mount's base URL or goes to an allowlisted host.
export interface PageGuards {
  consoleErrors: string[];
  failedRequests: string[];
  requests: string[];
}

export function watchPage(page: Page): PageGuards {
  const g: PageGuards = { consoleErrors: [], failedRequests: [], requests: [] };
  page.on('console', (m) => {
    if (m.type() === 'error') g.consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => g.consoleErrors.push(String(e)));
  page.on('requestfailed', (r) => g.failedRequests.push(`${r.url()} (${r.failure()?.errorText})`));
  page.on('request', (r) => g.requests.push(r.url()));
  // WebSockets never raise 'request' — and a relay contact IS a WebSocket,
  // so without this the zero-third-party assertion could not see the one
  // thing it exists to catch.
  page.on('websocket', (ws) => g.requests.push(ws.url()));
  return g;
}

export function offendingRequests(g: PageGuards, allowedPrefixes: string[]): string[] {
  return g.requests.filter((u) => !allowedPrefixes.some((p) => u.startsWith(p)));
}
