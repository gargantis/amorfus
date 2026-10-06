import { defineConfig } from '@playwright/test';

// §14 E2E. Mount URLs depend on the dist CID, which exists only after
// global setup packs dist/ — so specs read e2e/.gateway.json and build
// their own URLs instead of using baseURL.

const SWIFTSHADER_ARGS = [
  '--enable-unsafe-webgpu',
  '--enable-features=Vulkan',
  '--use-angle=swiftshader',
  '--use-webgpu-adapter=swiftshader',
];

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.spec\.ts/,
  globalSetup: './e2e/global-setup.mjs',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { headless: true },
  projects: [
    { name: 'webgpu-plain', testMatch: /smoke\.spec\.ts/, use: { launchOptions: { args: SWIFTSHADER_ARGS } } },
    { name: 'webgpu-path', testMatch: /smoke\.spec\.ts/, use: { launchOptions: { args: SWIFTSHADER_ARGS } } },
    { name: 'webgpu-subdomain', testMatch: /smoke\.spec\.ts/, use: { launchOptions: { args: SWIFTSHADER_ARGS } } },
    { name: 'webgpu-headers', testMatch: /smoke\.spec\.ts/, use: { launchOptions: { args: SWIFTSHADER_ARGS } } },
    { name: 'webgpu-csp', testMatch: /smoke\.spec\.ts/, use: { launchOptions: { args: SWIFTSHADER_ARGS } } },
    { name: 'core', testMatch: /core\.spec\.ts/ },
    {
      name: 'net',
      testMatch: /network\.spec\.ts/,
      // Real WebRTC mesh formation can lose a pair under load (upstream
      // trystero #195/#196; the plan schedules the 0.25.5 bump). One
      // retry keeps the gate honest without being flaky.
      retries: 1,
      use: { launchOptions: { args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] } },
    },
    { name: 'no-webgpu', testMatch: /fallbacks\.spec\.ts/ },
    { name: 'no-adapter', testMatch: /fallbacks\.spec\.ts/, use: { launchOptions: { args: ['--disable-gpu'] } } },
    {
      name: 'insecure',
      testMatch: /fallbacks\.spec\.ts/,
      use: { launchOptions: { args: ['--host-resolver-rules=MAP insecure.test 127.0.0.1'] } },
    },
    { name: 'file', testMatch: /fallbacks\.spec\.ts/ },
  ],
});
