// Background runner (Android): REST decoding, what it schedules next to the app's own alarms, and a full run
// against a mocked network. Also the daily summaries and the Firebase config reader.
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeFields, planRun, coveredByApp, runSync, runConfig, monthIds, time12, WINDOW_AHEAD } from '../src/runner.js';
import { digestPlan, plannedAlerts, stamp, okey, MIN } from '../src/time.js';
import { parseFirebaseConfig } from '../scripts/firebase-config.mjs';

const T = (k, hm) => stamp(k, hm);
const task = (o) => ({ id: 't1', title: 'Call bank', date: '2026-10-25', time: '11:00', rep: { k: 'none' }, remind: 10, ...o });
const st = (tasks, extra = {}) => ({ tasks, done: {}, skip: {}, shift: {}, focus: [], settings: { nag: true }, ...extra });

test('decode Firestore REST values', () => {
  const fields = {
    tasks: { mapValue: { fields: { t1: { mapValue: { fields: {
      title: { stringValue: 'Call bank' }, remind: { integerValue: '10' }, prio: { integerValue: '0' },
      deleted: { booleanValue: false }, until: { nullValue: null },
      rep: { mapValue: { fields: { k: { stringValue: 'days' }, days: { arrayValue: { values: [{ integerValue: '6' }, { integerValue: '1' }] } } } } },
    } } } } } },
    empty: { mapValue: {} },
    ratio: { doubleValue: 0.5 },
  };
  const out = decodeFields(fields);
  assert.deepEqual(out.tasks.t1, { title: 'Call bank', remind: 10, prio: 0, deleted: false, until: null, rep: { k: 'days', days: [6, 1] } });
  assert.deepEqual(out.empty, {});
  assert.equal(out.ratio, 0.5);
});

test('runner schedules only what the app does not have, inside its window', () => {
  const now = T('2026-10-25', '10:40');
  const s = st([task({ id: 'a', time: '11:00' }), task({ id: 'b', time: '10:50', remind: 0 }), task({ id: 'c', time: '15:00' })]);
  const all = plannedAlerts(s, now, '2026-10-25', 0);
  const appHas = all.filter((x) => x.occ.task.id === 'b').map((x) => [x.id, x.at]); // the app knew task b
  const out = planRun(s, now, appHas, {}, 'ar');
  const got = out.schedule.map((x) => `${x.key.split('@')[0]}:${new Date(x.at).toTimeString().slice(0, 5)}`);
  // task a: remind 10:50, due 11:00 and the late nudge 11:15 (inside 35 min); b is the app's; c is later
  assert.deepEqual(got, ['a:10:50', 'a:11:00', 'a:11:15']);
  assert.ok(out.schedule.every((x) => x.at <= now + WINDOW_AHEAD));
  assert.equal(out.schedule[0].title, 'Call bank');
  assert.equal(out.schedule[0].body, 'بعد 10 دقيقة · 11:00 ص');
  // the next run does not schedule them again
  const again = planRun(s, now + 5 * MIN, appHas, out.plan, 'ar');
  assert.equal(again.schedule.length, 0);
  assert.equal(again.retire.length, 0);
});

test('runner retires its own alarms when the task is done or moved elsewhere', () => {
  const now = T('2026-10-25', '10:40');
  const s = st([task({ id: 'a', time: '11:00' })]);
  const first = planRun(s, now, [], {}, 'en');
  assert.equal(first.schedule.length, 3);
  assert.equal(first.schedule[1].body, "It's time · 11:00 AM");
  const done = st([task({ id: 'a', time: '11:00' })], { done: { [okey('a', '2026-10-25')]: { at: now } } });
  const after = planRun(done, now + 60000, [], first.plan, 'en');
  assert.equal(after.schedule.length, 0);
  assert.deepEqual(after.retire.sort(), Object.keys(first.plan).map(Number).sort(), 'all its pending alarms retired');
  const moved = st([task({ id: 'a', time: '12:30' })]);
  const m = planRun(moved, now + 60000, [], first.plan, 'en');
  assert.equal(m.retire.length, 3, 'old times retired');
  assert.equal(m.schedule.length, 0, 'new time is beyond the window for now');
});

test('alarms the app takes over are retired from the runner', () => {
  const { retire, keep } = coveredByApp([[5, 100], [6, 200]], { 5: 100, 9: 300 });
  assert.deepEqual(retire, [5]);
  assert.deepEqual(keep, { 9: 300 });
});

test('a missed alert from the last minutes still goes out right away', () => {
  const now = T('2026-10-25', '11:05');
  const s = st([task({ id: 'a', time: '11:00', remind: 0 })]);
  const out = planRun(s, now, [], {}, 'ar');
  assert.equal(out.schedule.length, 2, 'the 11:00 alert (5 minutes late) and the 11:15 nudge');
  assert.ok(out.schedule[0].at >= now && out.schedule[0].at <= now + 5000, 'missed one goes out now');
  assert.equal(out.schedule[1].at, T('2026-10-25', '11:15'));
});

test('time12 and month ids', () => {
  assert.equal(time12('00:05', 'ar'), '12:05 ص');
  assert.equal(time12('12:00', 'ar'), '12:00 م');
  assert.equal(time12('23:45', 'en'), '11:45 PM');
  assert.deepEqual(monthIds(T('2026-01-15', '10:00')), ['2025-12', '2026-01', '2026-02']);
});

function enc(v) {
  if (v === null) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}

test('a full background run: token refresh, account read, alarms, saved state', async () => {
  const kvData = new Map();
  const kv = { get: (k) => (kvData.has(k) ? kvData.get(k) : null), set: (k, v) => kvData.set(k, v), remove: (k) => kvData.delete(k) };
  const scheduled = [];
  const calls = [];
  const now = T('2026-10-25', '10:40');
  const docs = {
    'users/u1': { tasks: { a: task({ id: 'a', time: '11:00' }) }, settings: { nag: true } },
    'users/u1/months/2026-10': { done: {} },
  };
  const fetch = async (url, opts) => {
    calls.push(`${opts.method} ${url.split('?')[0]}`);
    if (url.startsWith('https://securetoken.googleapis.com')) {
      assert.match(opts.body, /grant_type=refresh_token&refresh_token=rt-1/);
      return { status: 200, text: async () => JSON.stringify({ id_token: 'idt', refresh_token: 'rt-2' }) };
    }
    assert.equal(opts.headers.Authorization, 'Bearer idt');
    const p = url.split('/documents/')[1];
    if (!docs[p]) return { status: 404, text: async () => '{"error":{"code":404}}' };
    return { status: 200, text: async () => JSON.stringify({ fields: enc(docs[p]).mapValue.fields }) };
  };
  const env = { kv, fetch, notify: (l) => scheduled.push(...l), now: () => now };
  assert.equal(await runSync(env), 'signed-out', 'nothing to do before the app configures it');
  runConfig(env, { apiKey: 'k', projectId: 'p', uid: 'u1', refreshToken: 'rt-1', lang: 'ar', plan: [] });
  const out = await runSync(env);
  assert.equal(out, 'ok 3/0');
  assert.equal(scheduled.length, 3);
  assert.equal(scheduled[0].channelId, 'miaad_tasks');
  assert.ok(scheduled[0].scheduleAt instanceof Date);
  assert.equal(JSON.parse(kv.get('cfg')).refreshToken, 'rt-2', 'rotated refresh token kept');
  assert.equal(calls.filter((c) => c.includes('/months/')).length, 3, 'previous, current and next month read');
  // the app opens and schedules the same alerts itself: the runner retires its copies
  const appPlan = Object.entries(JSON.parse(kv.get('rplan'))).map(([id, at]) => [Number(id), at]);
  scheduled.length = 0;
  runConfig(env, { apiKey: 'k', projectId: 'p', uid: 'u1', refreshToken: 'rt-2', lang: 'ar', plan: appPlan });
  assert.equal(scheduled.length, 3, 'one retire per alarm the app now covers');
  assert.ok(scheduled.every((s) => s.scheduleAt.getFullYear() === 2099));
  assert.deepEqual(JSON.parse(kv.get('rplan')), {});
  // sign-out clears everything
  runConfig(env, { clear: true });
  assert.equal(kv.get('cfg'), null);
});

test('daily summaries: morning and evening, only for days with open tasks', () => {
  const s = st([
    task({ id: 'a', time: '11:00' }),
    task({ id: 'b', time: '09:30', title: 'Standup' }),
    task({ id: 'c', time: '', title: 'Groceries' }),
  ], { settings: { morning: true, morningAt: '08:00', evening: true, eveningAt: '21:00' } });
  const now = T('2026-10-25', '07:00');
  const plan = digestPlan(s, now, '2026-10-25', 2);
  assert.deepEqual(plan.map((d) => `${d.kind}@${d.date}`), ['morning@2026-10-25', 'evening@2026-10-25'], 'later days have nothing');
  const morning = plan[0];
  assert.equal(morning.count, 3);
  assert.equal(morning.first.task.title, 'Standup', 'first timed task of the day');
  s.done[okey('a', '2026-10-25')] = { at: now };
  s.done[okey('b', '2026-10-25')] = { at: now };
  const evening = digestPlan(s, T('2026-10-25', '12:00'), '2026-10-25', 0);
  assert.equal(evening.length, 1);
  assert.equal(evening[0].kind, 'evening');
  assert.deepEqual(evening[0].open.map((o) => o.task.title), ['Groceries']);
  s.done[okey('c', '2026-10-25')] = { at: now };
  assert.equal(digestPlan(s, T('2026-10-25', '12:00'), '2026-10-25', 0).length, 0, 'all done: no evening reminder');
  s.settings.morning = false;
  s.settings.evening = false;
  s.done = {};
  assert.equal(digestPlan(s, now, '2026-10-25', 0).length, 0, 'switched off');
  const ids = new Set(digestPlan({ ...s, settings: { morning: true, morningAt: '08:00', evening: true, eveningAt: '21:00' } }, now, '2026-10-25', 0).map((d) => d.id));
  assert.equal(ids.size, 2);
});

test('Firebase config from the console snippet or JSON', () => {
  const snippet = `// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyExample-123",
  authDomain: "miaad-1a2b3.firebaseapp.com",
  projectId: "miaad-1a2b3",
  storageBucket: "miaad-1a2b3.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef123456"
};`;
  assert.deepEqual(parseFirebaseConfig(snippet), {
    apiKey: 'AIzaSyExample-123', authDomain: 'miaad-1a2b3.firebaseapp.com', projectId: 'miaad-1a2b3',
    storageBucket: 'miaad-1a2b3.firebasestorage.app', messagingSenderId: '1234567890', appId: '1:1234567890:web:abcdef123456',
  });
  assert.equal(parseFirebaseConfig('{"apiKey":"a","authDomain":"d","projectId":"p","appId":"1:2:web:3"}').projectId, 'p');
  assert.equal(parseFirebaseConfig('apiKey: "only"'), null, 'incomplete config is rejected');
  assert.equal(parseFirebaseConfig(''), null);
});
