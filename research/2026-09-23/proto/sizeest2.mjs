import fs from 'node:fs';
const src = fs.readFileSync('./sizeest.mjs','utf8').split('\n// Naive JSON')[0].split('for (const [name, gen]')[0];
eval(src.replace(/^import .*$/m,'').replace(/const |let |class W/g, m => m === 'class W' ? 'globalThis.W = class W' : m));
