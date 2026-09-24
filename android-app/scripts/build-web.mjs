// Builds android-app/www from ../vocab and swaps every CDN dependency for a
// bundled local copy, so the Android app works fully offline.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const src = path.resolve(root, '../vocab');
const out = path.join(root, 'www');
const nm = path.join(root, 'node_modules');

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true });

// Charts
copy(path.join(nm, 'chart.js/dist/chart.umd.js'), path.join(out, 'vendor/chart.umd.js'));

// Text recognition: library, worker, WebAssembly core and language data
copy(path.join(nm, 'tesseract.js/dist/tesseract.min.js'), path.join(out, 'vendor/tesseract/tesseract.min.js'));
copy(path.join(nm, 'tesseract.js/dist/worker.min.js'), path.join(out, 'vendor/tesseract/worker.min.js'));
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js']) {
  copy(path.join(nm, 'tesseract.js-core', f), path.join(out, 'vendor/tesseract-core', f));
}
// Stored uncompressed: Android's asset packaging and the WebView's local server
// don't reliably pass .gz files through byte-for-byte.
for (const lang of ['eng', 'deu']) {
  const gz = fs.readFileSync(path.join(nm, `@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`));
  fs.mkdirSync(path.join(out, 'vendor/lang'), { recursive: true });
  fs.writeFileSync(path.join(out, `vendor/lang/${lang}.traineddata`), zlib.gunzipSync(gz));
}

// Font
const fontDir = path.join(nm, '@fontsource/plus-jakarta-sans');
let fontCss = '';
for (const w of [400, 500, 600, 700, 800]) {
  const css = fs.readFileSync(path.join(fontDir, `latin-${w}.css`), 'utf8');
  fontCss += css;
  for (const m of css.matchAll(/url\(\.\/files\/([^)]+)\)/g)) copy(path.join(fontDir, 'files', m[1]), path.join(out, 'vendor/fonts/files', m[1]));
}
fs.writeFileSync(path.join(out, 'vendor/fonts/fonts.css'), fontCss);

// Rewrite index.html to use the local copies
const indexPath = path.join(out, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const replaceOnce = (pattern, replacement) => {
  if (!pattern.test(html)) throw new Error(`build-web: pattern not found in index.html: ${pattern}`);
  html = html.replace(pattern, replacement);
};
replaceOnce(/\s*<link rel="preconnect"[^>]*>/g, '');
replaceOnce(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="vendor/fonts/fonts.css" />');
replaceOnce(/https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@[^"]+/, 'vendor/chart.umd.js');
replaceOnce(/https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js@[^"]+/, 'vendor/tesseract/tesseract.min.js');
replaceOnce(/<script type="module"/, `<script>
window.VOKABO_LOCAL = {
  tesseract: {
    workerPath: new URL('vendor/tesseract/worker.min.js', location.href).href,
    corePath: new URL('vendor/tesseract-core/', location.href).href,
    langPath: new URL('vendor/lang', location.href).href,
    gzip: false,
  },
};
</script>
<script type="module"`);
fs.writeFileSync(indexPath, html);

if (/cdn\.jsdelivr\.net|fonts\.googleapis/.test(html)) throw new Error('build-web: index.html still references a CDN');
console.log(`Built ${path.relative(process.cwd(), out)} with bundled libraries`);
