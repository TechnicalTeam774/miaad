// Sync between devices: the real store.js + cloud.js, with Firebase replaced by in-memory fakes that share
// one "server". Each device runs in its own JS realm (own localStorage, own module state).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fake = (f) => path.join(root, 'test/fakes', f);

const bundle = (await build({
  entryPoints: [fake('device-entry.js')],
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  alias: {
    'firebase/app': fake('plugins.js'),
    'firebase/auth': fake('auth.js'),
    'firebase/firestore': fake('firestore.js'),
    '@capacitor-firebase/authentication': fake('plugins.js'),
    '@capacitor/background-runner': fake('plugins.js'),
    '@capacitor/core': fake('capacitor-core.js'),
  },
  define: {
    __FIREBASE_CONFIG__: JSON.stringify({ apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: 'miaad-test', appId: '1:2:web:3' }),
  },
  logLevel: 'error',
})).outputFiles[0].text;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const settle = () => sleep(30);

function memoryStorage(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

function device(hub, id, { native = false, storage = memoryStorage() } = {}) {
  const win = { addEventListener() {}, removeEventListener() {} };
  win.top = win;
  win.self = win;
  const ctx = {
    __miaadFake: hub, __deviceNative: native, setTimeout, clearTimeout, console, Date, JSON, Math, Promise,
    localStorage: storage, navigator: { onLine: true }, window: win,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  hub.deviceId = id;
  vm.runInContext(bundle, ctx);
  const d = ctx.device;
  d.storage = storage;
  d.id = id;
  d.init = () => {
    hub.deviceId = id;
    d.initCloud(() => {});
  };
  d.login = async (user) => {
    hub.deviceId = id;
    hub.nextUser = user;
    await d.signIn();
    await settle();
  };
  return d;
}

const U = { uid: 'u1', email: 'jimy@example.com', displayName: 'Jimy' };
const V = { uid: 'u2', email: 'other@example.com', displayName: 'Other' };
// arrays from another realm fail deepStrictEqual on their prototype: copy into this realm first
const titles = (d) => [...d.state.tasks.filter((t) => !t.deleted).map((t) => t.title)].sort();

test('two devices stay in sync through one account', async () => {
  const hub = {};
  // laptop: used the web app before signing in
  const laptop = device(hub, 'laptop');
  laptop.saveTask({ title: 'Bank recon', date: '2026-10-25', time: '11:30', rep: { k: 'none' }, remind: 10 });
  const daily = laptop.saveTask({ title: 'Morning review', date: '2026-10-20', time: '08:00', rep: { k: 'daily' }, remind: 0 });
  laptop.setDone(`${daily.id}@2026-10-24`, Date.parse('2026-10-24T08:05:00+03:00'));
  laptop.init();
  await settle();
  assert.equal(laptop.cloud.user, null, 'not signed in yet');
  await laptop.login(U);
  assert.equal(laptop.cloud.user.uid, 'u1');
  assert.equal(laptop.state.meta.syncUid, 'u1');
  const core = hub.server.get('users/u1');
  assert.equal(Object.keys(core.tasks).length, 2, 'laptop tasks uploaded');
  assert.ok(hub.server.get('users/u1/months/2026-10').done[`${daily.id}@2026-10-24`], 'completion uploaded to its month');

  // phone: had one task and the first-run examples, then signs in to the same account
  const phone = device(hub, 'phone', { native: true });
  phone.seedExamples('2026-10-25', Date.parse('2026-10-25T10:00:00+03:00'), (k) => `example ${k}`);
  phone.saveTask({ title: 'Gym', date: '2026-10-25', time: '18:00', rep: { k: 'days', days: [6, 1] }, remind: 15 });
  phone.init();
  await settle();
  await phone.login(U);
  await settle();
  assert.deepEqual(titles(phone), ['Bank recon', 'Gym', 'Morning review'], 'phone has both sides, examples dropped');
  assert.deepEqual(titles(laptop), ['Bank recon', 'Gym', 'Morning review'], 'laptop got the phone task live');
  assert.ok(!Object.values(hub.server.get('users/u1').tasks).some((t) => t.example), 'examples never reach the account');
  assert.ok(phone.state.done[`${daily.id}@2026-10-24`], 'phone sees the laptop completion');

  // live edits in both directions
  const x = laptop.saveTask({ title: 'Call the bank', date: '2026-10-25', time: '14:00', rep: { k: 'none' }, remind: 10 });
  await settle();
  assert.ok(titles(phone).includes('Call the bank'), 'new laptop task shows on the phone');
  const key = `${x.id}@2026-10-25`;
  hub.log.length = 0;
  phone.setDone(key, Date.parse('2026-10-25T14:02:00+03:00'));
  await settle();
  assert.ok(laptop.state.done[key], 'phone completion shows on the laptop');
  assert.deepEqual([...hub.log.map((l) => `${l.path}:${l.fields.join(',')}`)], [`users/u1/months/2026-10:done.${key}`], 'one completion = one field write');

  // concurrent edits to different items both survive
  const bank = laptop.state.tasks.find((t) => t.title === 'Bank recon');
  laptop.saveTask({ ...bank, id: bank.id, title: 'Bank recon (NBE)' });
  const gym = phone.state.tasks.find((t) => t.title === 'Gym');
  phone.setDone(`${gym.id}@2026-10-25`, Date.parse('2026-10-25T18:10:00+03:00'));
  await settle();
  for (const d of [laptop, phone]) {
    assert.ok(titles(d).includes('Bank recon (NBE)'), `${d.id}: rename kept`);
    assert.ok(d.state.done[`${gym.id}@2026-10-25`], `${d.id}: gym completion kept`);
  }

  // undo, delete and settings
  phone.setUndone(key);
  laptop.removeTask(x.id, '2026-10-25', 'all');
  laptop.state.settings.morningAt = '07:30';
  laptop.state.settings.installHint = false;
  laptop.save();
  await settle();
  assert.ok(!laptop.state.done[key], 'undo reached the laptop');
  assert.ok(!('done' in hub.server.get('users/u1/months/2026-10') && hub.server.get('users/u1/months/2026-10').done[key]), 'undo removed the field');
  assert.ok(!titles(phone).includes('Call the bank'), 'deleted on the phone too');
  assert.equal(phone.state.settings.morningAt, '07:30', 'settings follow the account');
  assert.equal(phone.state.settings.installHint, true, 'device-only settings stay per device');

  // phone signs out: its copy is wiped, the account and the laptop keep everything
  await phone.signOut();
  await settle();
  assert.equal(phone.state.tasks.length, 0, 'nothing of the account left on the phone');
  assert.equal(phone.state.meta.syncUid, null);
  assert.equal(laptop.state.tasks.filter((t) => !t.deleted).length, 3, 'laptop untouched');
  assert.ok(hub.runnerEvents.some((e) => e.details && e.details.clear), 'background runner told to forget the account');

  // another account on a third device sees nothing of u1
  const other = device(hub, 'other');
  other.init();
  await settle();
  await other.login(V);
  await settle();
  assert.equal(other.state.tasks.length, 0, 'accounts are separate');
});

test('reopening the app: edits made before sign-in restores are still saved', async () => {
  const hub = {};
  const store = memoryStorage();
  const a = device(hub, 'a', { storage: store });
  a.init();
  await settle();
  await a.login(U);
  a.saveTask({ title: 'First', date: '2026-10-25', time: '', rep: { k: 'none' }, remind: -1 });
  await settle();
  a.flush();
  // same device, app restarted: local copy + saved session
  const again = device(hub, 'a', { storage: memoryStorage(store.dump()) });
  again.init();
  again.saveTask({ title: 'Typed while loading', date: '2026-10-25', time: '', rep: { k: 'none' }, remind: -1 });
  await settle();
  await settle();
  const cloudTitles = [...Object.values(hub.server.get('users/u1').tasks).map((t) => t.title)].sort();
  assert.deepEqual(cloudTitles, ['First', 'Typed while loading']);
});

test('a write the server refuses shows as a sync error', async () => {
  const hub = {};
  const a = device(hub, 'a');
  a.init();
  await settle();
  await a.login(U);
  hub.failWrites = true;
  a.saveTask({ title: 'Refused', date: '2026-10-25', time: '', rep: { k: 'none' }, remind: -1 });
  await settle();
  assert.equal(a.cloud.status, 'error');
  assert.equal(a.cloud.error, 'permission-denied');
});
