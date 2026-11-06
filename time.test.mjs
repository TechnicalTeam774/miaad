// Unit tests for the date/recurrence/status/stats logic. Run: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  occursOn, dayList, status, daySummary, plannedAlerts, streak, span, stamp, addDays, okey, rangeStats, MIN, weekday, scheduledOn,
} from '../src/time.js';

const T = (k, hm) => stamp(k, hm);
const base = (tasks, extra = {}) => ({ tasks, done: {}, skip: {}, shift: {}, focus: [], settings: { nag: true }, ...extra });
const task = (o) => ({ id: o.id || 't1', title: 'x', date: '2026-10-20', time: '', rep: { k: 'none' }, remind: -1, ...o });

test('recurrence rules', () => {
  const once = task({ date: '2026-10-20' });
  assert.equal(occursOn(once, '2026-10-20'), true);
  assert.equal(occursOn(once, '2026-10-21'), false);
  const daily = task({ rep: { k: 'daily' }, until: '2026-10-25' });
  assert.equal(occursOn(daily, '2026-10-19'), false, 'not before start');
  assert.equal(occursOn(daily, '2026-10-22'), true);
  assert.equal(occursOn(daily, '2026-10-26'), false, 'not after until');
  const weekly = task({ rep: { k: 'weekly' } }); // 2026-10-20 is a Tuesday
  assert.equal(weekday('2026-10-20'), 2);
  assert.equal(occursOn(weekly, '2026-10-27'), true);
  assert.equal(occursOn(weekly, '2026-10-28'), false);
  const days = task({ rep: { k: 'days', days: [6, 1] } }); // Saturday + Monday
  assert.equal(occursOn(days, '2026-10-24'), true);
  assert.equal(occursOn(days, '2026-10-26'), true);
  assert.equal(occursOn(days, '2026-10-25'), false);
  assert.equal(occursOn({ ...days, deleted: true }, '2026-10-24'), false);
});

test('carry-over of open one-off tasks into today', () => {
  const s = base([task({ id: 'a', date: '2026-10-22', time: '10:00' }), task({ id: 'b', date: '2026-10-22' }), task({ id: 'c', date: '2026-10-23' })]);
  s.done[okey('b', '2026-10-22')] = { at: T('2026-10-22', '18:00') }; // done on its day: not carried
  s.done[okey('c', '2026-10-23')] = { at: T('2026-10-24', '09:00') }; // done today (late): listed today as done
  const list = dayList(s, '2026-10-24', '2026-10-24');
  const ids = list.map((o) => o.task.id).sort();
  assert.deepEqual(ids, ['a', 'c']);
  assert.ok(list.every((o) => o.carried));
  const a = list.find((o) => o.task.id === 'a');
  assert.equal(status(a, T('2026-10-24', '08:00')).s, 'overdue');
  // past day views do not carry anything
  assert.equal(dayList(s, '2026-10-23', '2026-10-24').length, 1);
});

test('statuses', () => {
  const s = base([task({ id: 'a', date: '2026-10-24', time: '10:00' }), task({ id: 'n', date: '2026-10-24' })]);
  const [a, n] = scheduledOn(s, '2026-10-24');
  assert.equal(status(a, T('2026-10-24', '09:00')).s, 'upcoming');
  assert.equal(status(a, T('2026-10-24', '09:50')).s, 'soon');
  assert.equal(status(a, T('2026-10-24', '09:50')).left, 10 * MIN);
  assert.equal(status(a, T('2026-10-24', '10:25')).by, 25 * MIN);
  assert.equal(status(n, T('2026-10-24', '22:00')).s, 'anytime');
  s.done[a.key] = { at: T('2026-10-24', '10:12') };
  const [a2] = scheduledOn(s, '2026-10-24');
  const st = status(a2, T('2026-10-24', '11:00'));
  assert.equal(st.s, 'done');
  assert.equal(st.onTime, false);
  assert.equal(st.late, 12 * MIN);
  s.shift[a.key] = '10:30'; // snoozed occurrence: due moves, so 10:12 is on time
  const [a3] = scheduledOn(s, '2026-10-24');
  assert.equal(status(a3, T('2026-10-24', '11:00')).onTime, true);
});

test('day summary and missed', () => {
  const s = base([task({ id: 'd', rep: { k: 'daily' }, time: '08:00' })]);
  s.done[okey('d', '2026-10-21')] = { at: T('2026-10-21', '07:55') };
  s.done[okey('d', '2026-10-22')] = { at: T('2026-10-22', '09:00') };
  const now = T('2026-10-24', '12:00');
  const d21 = daySummary(s, '2026-10-21', now);
  assert.deepEqual([d21.total, d21.onTime, d21.late, d21.missed], [1, 1, 0, 0]);
  const d22 = daySummary(s, '2026-10-22', now);
  assert.deepEqual([d22.onTime, d22.late], [0, 1]);
  const d23 = daySummary(s, '2026-10-23', now);
  assert.equal(d23.missed, 1);
  const d24 = daySummary(s, '2026-10-24', now);
  assert.equal(d24.missed, 0, 'today is never missed yet');
  assert.equal(d24.pending, 1);
  s.skip[okey('d', '2026-10-23')] = 1;
  assert.equal(daySummary(s, '2026-10-23', now).total, 0, 'skipped occurrence');
});

test('alert plan', () => {
  const s = base([
    task({ id: 'r', date: '2026-10-24', time: '10:00', remind: 15 }),
    task({ id: 'z', date: '2026-10-24', time: '11:00', remind: 0 }),
    task({ id: 'q', date: '2026-10-24', time: '12:00', remind: -1 }),
    task({ id: 'w', date: '2026-10-24', time: '', remind: 10 }),
  ]);
  const now = T('2026-10-24', '09:00');
  const plan = plannedAlerts(s, now, '2026-10-24', 0);
  const got = plan.map((a) => `${a.occ.task.id}:${a.kind}@${new Date(a.at).toTimeString().slice(0, 5)}`);
  assert.deepEqual(got, ['r:remind@09:45', 'r:due@10:00', 'r:late@10:15', 'z:due@11:00', 'z:late@11:15']);
  s.settings.nag = false;
  assert.equal(plannedAlerts(s, now, '2026-10-24', 0).filter((a) => a.kind === 'late').length, 0);
  s.done[okey('r', '2026-10-24')] = { at: now };
  assert.ok(!plannedAlerts(s, now, '2026-10-24', 0).some((a) => a.occ.task.id === 'r'));
  assert.equal(plannedAlerts(s, T('2026-10-24', '10:50'), '2026-10-24', 0).length, 1, 'past alerts dropped');
  const ids = new Set(plan.map((a) => a.id));
  assert.equal(ids.size, plan.length, 'unique ids');
  assert.ok(plan.every((a) => a.id > 0 && a.id < 2147483647));
});

test('streak and range stats', () => {
  const s = base([task({ id: 'd', rep: { k: 'daily' }, date: '2026-10-18', time: '08:00' })]);
  for (const k of ['2026-10-21', '2026-10-22', '2026-10-23']) s.done[okey('d', k)] = { at: T(k, '07:00') };
  const now = T('2026-10-24', '07:30');
  assert.equal(streak(s, '2026-10-24', now), 3);
  s.done[okey('d', '2026-10-24')] = { at: now };
  assert.equal(streak(s, '2026-10-24', now), 4);
  const r = rangeStats(s, '2026-10-24', now, 7);
  assert.equal(r.days.length, 7);
  assert.equal(r.total, 7);
  assert.equal(r.done, 4);
  assert.equal(r.missed, 3); // 18, 19, 20
  assert.equal(Math.round(r.rate * 100), 57);
  assert.equal(r.onTimeRate, 1);
});

test('countdown text', () => {
  assert.equal(span(65 * 1000), '01:05');
  assert.equal(span(3 * 3600 * 1000 + 5 * 60000 + 9000), '3:05:09');
  assert.equal(span(2 * 86400000 + 3 * 3600000, 'd', 'h'), '2d 3h');
  assert.equal(span(-5000), '00:00');
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});
