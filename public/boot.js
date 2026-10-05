// §8.2 pre-module boot checks. Classic script, no imports: it must run even
// where modules cannot. Codes: F file://, S insecure context, U no WebGPU,
// L load timeout. The module entry calls window.__amorfusBootReady() to
// cancel the timeout. Never a blank page.
(function () {
  'use strict';
  var SERVE_LOCAL =
    'To run from a local folder, serve it and open http://localhost — for example: ' +
    'npx serve . — or http://127.0.0.1:8080/ipfs/<CID>/ through a local IPFS gateway.';
  var PLATFORMS =
    'WebGPU is on by default in Chrome and Edge on Windows x64, macOS, ChromeOS, ' +
    'and Linux with Intel Gen12+ or NVIDIA on Wayland.';
  var STATUS_URL = 'https://github.com/gpuweb/gpuweb/wiki/Implementation-Status';

  function show(code, title, paras, copyable) {
    var main = document.getElementById('fallback');
    if (!main) return;
    var h = document.getElementById('fallback-title');
    h.textContent = title;
    var note = document.getElementById('fallback-note');
    if (note) note.remove();
    for (var i = 0; i < paras.length; i++) {
      var p = document.createElement('p');
      p.textContent = paras[i];
      main.appendChild(p);
    }
    if (copyable) {
      var pc = document.createElement('p');
      pc.appendChild(document.createTextNode('Diagnostics address (copy into a new tab): '));
      var c = document.createElement('code');
      c.textContent = copyable;
      pc.appendChild(c);
      main.appendChild(pc);
    }
    var pl = document.createElement('p');
    var a = document.createElement('a');
    a.href = STATUS_URL;
    a.textContent = 'WebGPU implementation status';
    a.rel = 'noreferrer';
    pl.appendChild(a);
    main.appendChild(pl);
    main.setAttribute('data-boot-code', code);
    h.focus();
  }

  // C-22: mobile is out of scope, but Android Chrome ships WebGPU.
  try {
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
      var banner = document.getElementById('banner');
      if (banner) {
        banner.textContent = 'Amorfus needs a desktop keyboard and mouse.';
        banner.hidden = false;
      }
    }
  } catch (e) { /* non-fatal */ }

  if (location.protocol === 'file:') {
    show('F', 'Amorfus cannot run from a file:// URL', [
      'Browsers do not run JavaScript modules from files opened directly.',
      SERVE_LOCAL,
    ]);
    return;
  }
  if (!window.isSecureContext) {
    show('S', 'Amorfus needs a secure context', [
      'This page was loaded over plain http from a non-local address, so the browser ' +
        'disables WebGPU and the connection APIs.',
      'Open it over https, or from localhost on this machine.',
      SERVE_LOCAL,
    ]);
    return;
  }
  if (!('gpu' in navigator)) {
    show('U', 'This browser does not offer WebGPU here', [
      'Amorfus renders with WebGPU, which this browser did not enable on this page.',
      PLATFORMS,
      'Current desktop Chrome or Edge on a supported platform is the reliable way to play.',
    ], 'chrome://gpu');
    return;
  }

  var timer = setTimeout(function () {
    show('L', 'Amorfus is taking too long to load', [
      'The page passed its checks but the application did not start within 20 seconds.',
      'A content blocker, a broken connection, or a partial deployment can cause this. ' +
        'Reload to retry.',
    ]);
  }, 20000);
  window.__amorfusBootReady = function () {
    clearTimeout(timer);
  };
})();
