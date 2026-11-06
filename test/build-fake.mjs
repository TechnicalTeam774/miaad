// Test build: the real app with Firebase and the native-only plugins swapped for in-memory fakes,
// so the sign-in screens and live sync can be exercised in a browser without a Firebase project.
// Output: www-test/ (same files as www/, different app.js). Run `node build.mjs` first.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'www-test';
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync('www', OUT, { recursive: true });
const fake = (f) => path.resolve('test/fakes', f);
await build({
  entryPoints: ['src/main.js'],
  bundle: true,
  minify: false,
  alias: {
    'firebase/app': fake('plugins.js'),
    'firebase/auth': fake('auth.js'),
    'firebase/firestore': fake('firestore.js'),
    '@capacitor-firebase/authentication': fake('plugins.js'),
    '@capacitor/background-runner': fake('plugins.js'),
  },
  define: {
    __APP_VERSION__: '"1.0.test"',
    __FIREBASE_CONFIG__: JSON.stringify({ apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: 'miaad-test', appId: '1:2:web:3' }),
  },
  banner: { js: 'globalThis.__fakePersist = true;' }, // session and "server" survive reloads, like the real ones
  format: 'iife',
  target: ['es2020'],
  outfile: `${OUT}/app.js`,
  allowOverwrite: true,
  logLevel: 'warning',
});
console.log('www-test ready');
