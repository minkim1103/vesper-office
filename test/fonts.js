import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../public/fonts/v1/', import.meta.url);
const css = readFileSync(new URL('fonts.css', root), 'utf8');
const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
const refs = [...css.matchAll(/url\(\.\/([^)]*)\)/g)].map(m => m[1]);
assert.equal(refs.length, 98);
assert.ok(!/url\(https?:/.test(css));
for (const name of refs) {
  const data = readFileSync(new URL(name, root));
  assert.equal(data.subarray(0, 4).toString(), 'wOF2');
  assert.equal(data.length, manifest.find(f => f.file === name).bytes);
}
for (const name of ['Pretendard-LICENSE.txt', 'SourceSerif4-OFL.txt']) {
  assert.match(readFileSync(new URL(name, root), 'utf8'), /SIL OPEN FONT LICENSE/);
}
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
assert.ok(html.includes('/fonts/v1/fonts.css'));
assert.ok(!/fonts.googleapis|fonts.gstatic|cdn.jsdelivr/.test(html));
// Exercise service-worker cache behavior: fetched subsets remain readable offline.
const listeners = {}, data = new Map();
let requests = 0, offline = false;
const cache = { match: async req => data.get(req.url)?.clone(), put: async (req, res) => { data.set(req.url, res); } };
const context = vm.createContext({
  importScripts: () => vm.runInContext(readFileSync(new URL('../public/shared/font-cache.js',import.meta.url),'utf8'),context),
  self: { addEventListener: (name, fn) => { listeners[name] = fn; } },
  URL, location: { origin: 'https://vesper.example' },
  caches: { open: async () => cache },
  fetch: async () => { requests++; if (offline) throw Error('offline'); return new Response('font-data'); },
});
vm.runInContext(readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
const request = new Request('https://vesper.example/fonts/v1/' + refs[0]);
const load = async () => {
  let response;
  listeners.fetch({ request, respondWith: result => { response = result; } });
  return (await response).text();
};
assert.equal(await load(), 'font-data');
offline = true;
assert.equal(await load(), 'font-data');
assert.equal(requests, 1, 'cached fonts never need a second network request');
console.log('✓ Fonts: 98 valid local WOFF2 subsets, licenses, no external stylesheet and offline cache reuse');
