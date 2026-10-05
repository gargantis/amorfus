// §8.2: pure mapping from a typed gpu-init (or runtime) result to the
// message the UI shows. boot.js owns the pre-module codes F/S/U/L; this
// module owns A/W/D/R. Never a blank page.

export type GpuFailure =
  | { kind: 'no-adapter' }
  | { kind: 'fallback-adapter' }
  | { kind: 'device-rejected'; reason: string }
  | { kind: 'device-lost'; storage: 'stable' | 'no-storage' };

export interface GpuMessage {
  code: 'A' | 'W' | 'D' | 'R';
  fatal: boolean;
  title: string;
  body: string[];
  /** Plain text the user can copy (diagnostics). */
  copyable?: string;
  link?: { href: string; label: string };
}

const PLATFORMS =
  'WebGPU is on by default in Chrome and Edge on Windows x64, macOS, ChromeOS, ' +
  'and Linux with Intel Gen12+ or NVIDIA on Wayland. These are the supported platforms.';

const SERVE =
  'Amorfus needs a secure context: open it over https, or serve the folder ' +
  'with any static server on this machine and open it via localhost.';

const STATUS_LINK = {
  href: 'https://github.com/gpuweb/gpuweb/wiki/Implementation-Status',
  label: 'WebGPU implementation status',
};

export function messageFor(result: GpuFailure): GpuMessage {
  switch (result.kind) {
    case 'no-adapter':
      return {
        code: 'A',
        fatal: true,
        title: 'No compatible GPU found',
        body: [
          'Your browser has WebGPU, but it did not offer a GPU adapter on this machine.',
          PLATFORMS,
          SERVE,
          'To see what your browser thinks of your GPU, open the address below in a new tab and look for "WebGPU".',
        ],
        copyable: 'chrome://gpu',
        link: STATUS_LINK,
      };
    case 'fallback-adapter':
      return {
        code: 'W',
        fatal: false,
        title: 'Software rendering',
        body: [
          'The browser offered a software (fallback) GPU adapter. Amorfus will run, but slowly.',
        ],
      };
    case 'device-rejected':
      return {
        code: 'D',
        fatal: true,
        title: 'The GPU refused a connection',
        body: [
          `Requesting a GPU device failed twice: ${result.reason}.`,
          'This usually clears after closing other GPU-heavy tabs or applications, or reloading.',
          PLATFORMS,
          SERVE,
        ],
        copyable: 'chrome://gpu',
        link: STATUS_LINK,
      };
    case 'device-lost':
      return {
        code: 'R',
        fatal: true,
        title: 'The GPU was reset',
        body:
          result.storage === 'stable'
            ? ['The GPU was reset. Your world is saved.', 'Reload to continue playing.']
            : [
                'The GPU was reset, and this page cannot save worlds.',
                'Export before reloading, or this world is lost.',
              ],
      };
  }
}
