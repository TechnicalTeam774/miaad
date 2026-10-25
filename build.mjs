// Build: src/ + static/ -> www/ (GitHub Pages + Capacitor), and preview/miaad-preview.html (one self-contained page).
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const OUT = 'www';
const PREVIEW = 'preview';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// same numbering as the APK (android/app/build.gradle): 1.0.<GitHub Actions run number>
const APP_VERSION = `1.0.${process.env.GITHUB_RUN_NUMBER || '0'}`;

await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: true,
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  format: 'iife',
  target: ['es2020', 'safari15'],
  outfile: `${OUT}/app.js`,
  legalComments: 'none',
  logLevel: 'warning',
});

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f);
    const d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

copyDir('static/icons', `${OUT}/icons`);
copyDir('static/fonts', `${OUT}/fonts`);
fs.copyFileSync('static/manifest.webmanifest', `${OUT}/manifest.webmanifest`);
fs.copyFileSync('src/styles.css', `${OUT}/styles.css`);
const early = fs.readFileSync('static/early.js', 'utf8').trim();
const html = fs.readFileSync('static/index.html', 'utf8').replace('<!--EARLY-->', `<script>${early}</script>`);
fs.writeFileSync(`${OUT}/index.html`, html);

// service worker with a content hash so every build refreshes the offline cache
const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(OUT);
const hash = crypto.createHash('sha256');
for (const f of files.sort()) hash.update(fs.readFileSync(f));
const version = hash.digest('hex').slice(0, 10);
const assets = ['./', ...files.map((f) => path.relative(OUT, f).split(path.sep).join('/')).filter((f) => !f.endsWith('icon.svg'))];
const sw = fs.readFileSync('static/sw.js', 'utf8').replace('__VERSION__', version).replace('__ASSETS__', JSON.stringify(assets));
fs.writeFileSync(`${OUT}/sw.js`, sw);

// one-file preview (fonts and script inlined; no manifest / service worker)
fs.mkdirSync(PREVIEW, { recursive: true });
let css = fs.readFileSync('src/styles.css', 'utf8');
css = css.replace(/url\('fonts\/([^']+)'\)/g, (m, f) => `url(data:font/woff2;base64,${fs.readFileSync(`static/fonts/${f}`).toString('base64')})`);
const js = fs.readFileSync(`${OUT}/app.js`, 'utf8').replace(/<\/script/gi, '<\\/script');
// the artifact page already pads :root by the safe-area insets, so .app drops its own top inset there
const preview = `<title>ميعاد</title>
<meta name="claude:viewport-fit-sides" content="cover">
<script>${early}</script>
<style>${css}
.app{padding-top:0}</style>
<div id="app" class="app"></div>
<script>window.__MIAAD_PREVIEW__ = true;</script>
<script>${js}</script>
`;
fs.writeFileSync(`${PREVIEW}/miaad-preview.html`, preview);
console.log(`www: ${files.length + 1} files, sw ${version}; preview ${(preview.length / 1024).toFixed(0)} KB`);
