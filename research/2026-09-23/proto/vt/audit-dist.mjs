// Prototype: fail on anything in dist/ that would break under /ipfs/<CID>/ or a Helia loader.
import fs from 'node:fs'; import path from 'node:path';
import * as acorn from 'acorn'; import * as walk from 'acorn-walk'; import { parse } from 'parse5';
const DIST = path.resolve(process.argv[2] ?? 'dist');
const ALLOWED_EXT = new Set(['.html', '.js', '.css', '.wasm', '.json', '.svg', '.png', '.webp', '.ico', '.txt', '.map', '.bin', '.webmanifest']);
const ALLOWED_HOSTS = new Set(JSON.parse(process.env.THIRD_PARTY ?? '[]')); // e.g. signaling relays, named in the plan
const ASSET_RE = /\.(js|mjs|css|wasm|json|png|svg|webp|bin|wgsl|html|ico)(\?|#|$)/i;
const errors = []; const err = (f, m) => errors.push(`${path.relative(DIST, f)}: ${m}`);
const files = []; (function walkDir(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); e.isDirectory() ? walkDir(p) : files.push(p); } })(DIST);
function checkRef(file, ref, kind) {
  if (!ref || ref.startsWith('#') || ref.startsWith('data:') || ref.startsWith('blob:')) return;
  if (ref.startsWith('//')) return err(file, `protocol-relative ${kind}: ${ref}`);
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) { const u = new URL(ref); if (!ALLOWED_HOSTS.has(u.host)) err(file, `external ${kind} not in third-party allowlist: ${ref}`); return; }
  if (ref.startsWith('/')) return err(file, `root-absolute ${kind}: ${ref}`);
  const target = path.resolve(path.dirname(file), ref.split(/[?#]/)[0]);
  if (!target.startsWith(DIST)) return err(file, `${kind} escapes dist: ${ref}`);
  if (!fs.existsSync(target)) err(file, `${kind} target missing: ${ref}`);
}
for (const f of files) {
  const base = path.basename(f), ext = path.extname(f).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) err(f, `extension ${ext || '(none)'} not in MIME-safe allowlist`);
  if (base === '_redirects') err(f, `_redirects would be interpreted by IPFS gateways and Cloudflare`);
  if (base.startsWith('ipfs-sw-')) err(f, `ipfs-sw-* is reserved by the Service Worker Gateway`);
  if (fs.statSync(f).size > 25 * 1024 * 1024) err(f, `> 25 MiB (Cloudflare static asset limit)`);
  const text = ['.html', '.js', '.css'].includes(ext) ? fs.readFileSync(f, 'utf8') : null;
  if (ext === '.html') {
    const visit = n => { for (const a of n.attrs ?? []) if (['src', 'href', 'poster', 'data'].includes(a.name)) checkRef(f, a.value, `<${n.nodeName} ${a.name}>`); if (n.nodeName === 'base') err(f, '<base> element'); (n.childNodes ?? []).forEach(visit); if (n.content) visit(n.content); };
    visit(parse(text));
  } else if (ext === '.css') {
    for (const m of text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) checkRef(f, m[2], 'css url()');
    for (const m of text.matchAll(/@import\s+(['"])([^'"]+)\1/g)) checkRef(f, m[2], 'css @import');
  } else if (ext === '.js') {
    const ast = acorn.parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
    const lit = (node, s) => { if (/^\/(?!\/)/.test(s) && ASSET_RE.test(s)) err(f, `root-absolute string literal: ${s}`); if (/^(https?|wss?):\/\//i.test(s)) { try { if (!ALLOWED_HOSTS.has(new URL(s).host)) err(f, `external URL literal not in allowlist: ${s}`); } catch {} } };
    walk.full(ast, n => {
      if (n.type === 'Literal' && typeof n.value === 'string') lit(n, n.value);
      if (n.type === 'TemplateLiteral') for (const q of n.quasis) lit(n, q.value.cooked ?? '');
      if ((n.type === 'ImportExpression' || n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source) {
        const s = n.source.type === 'Literal' ? n.source.value : n.source.type === 'TemplateLiteral' && n.source.expressions.length === 0 ? n.source.quasis[0].value.cooked : null;
        if (typeof s === 'string') checkRef(f, s, 'import specifier');
      }
      if (n.type === 'NewExpression' && n.callee.name === 'URL' && n.arguments.length === 2 && n.arguments[1].type === 'MetaProperty') {
        const a = n.arguments[0]; const s = a.type === 'Literal' ? a.value : a.type === 'TemplateLiteral' && a.expressions.length === 0 ? a.quasis[0].value.cooked : null;
        if (typeof s === 'string') checkRef(f, s.startsWith('.') ? s : './' + s, 'new URL(…, import.meta.url)');
      }
      if (n.type === 'MemberExpression' && !n.computed && ['pushState', 'replaceState'].includes(n.property.name)) err(f, `history.${n.property.name} (history-API routing forbidden)`);
      if (n.type === 'MemberExpression' && !n.computed && n.property.name === 'register' && n.object.type === 'MemberExpression' && n.object.property?.name === 'serviceWorker') err(f, 'serviceWorker.register (would displace a Helia SW gateway)');
    });
  }
}
if (errors.length) { console.error(`dist audit FAILED (${errors.length}):\n  ` + errors.join('\n  ')); process.exit(1); }
console.log(`dist audit OK: ${files.length} files`);
