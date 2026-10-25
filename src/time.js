// Pure date/time logic for ميعاد: local day keys, recurrence, occurrences, statuses, stats and alert plans.
// Everything here is deterministic given (state, now) so it can be unit-tested without a browser.

export const pad = (n) => String(n).padStart(2, '0');
export const MIN = 60000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

export function dkey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(k, n) {
  const d = parseKey(k);
  d.setDate(d.getDate() + n);
  return dkey(d);
}

export function weekday(k) {
  return parseKey(k).getDay(); // 0 = Sunday … 6 = Saturday
}

/** Whole days from a to b (b - a), DST-safe. */
export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / DAY);
}

/** Timestamp of a day key at "HH:MM"; without a time it is the last millisecond of that day. */
export function stamp(k, hhmm) {
  const d = parseKey(k);
  if (hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    d.setHours(h, m, 0, 0);
  } else {
    d.setHours(23, 59, 59, 999);
  }
  return d.getTime();
}

export function dayStart(k) {
  return parseKey(k).getTime();
}

export function hhmm(ms) {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const okey = (id, k) => `${id}@${k}`;

export function splitKey(key) {
  const i = key.lastIndexOf('@');
  return [key.slice(0, i), key.slice(i + 1)];
}

/** Does a task occur on day k (ignoring skips)? */
export function occursOn(task, k) {
  if (!task || task.deleted) return false;
  if (k < task.date) return false;
  if (task.until && k > task.until) return false;
  const r = (task.rep && task.rep.k) || 'none';
  if (r === 'none') return k === task.date;
  if (r === 'daily') return true;
  if (r === 'weekly') return weekday(k) === weekday(task.date);
  if (r === 'days') return (task.rep.days || []).includes(weekday(k));
  return false;
}

export const isRecurring = (task) => !!(task.rep && task.rep.k && task.rep.k !== 'none');

/** Build one occurrence record. */
export function occurrence(state, task, k, extra = {}) {
  const key = okey(task.id, k);
  const time = (state.shift && state.shift[key]) || task.time || '';
  const done = (state.done && state.done[key]) || null;
  return {
    key,
    task,
    date: k,
    time,
    shifted: !!(state.shift && state.shift[key]),
    timed: !!time,
    due: stamp(k, time),
    done,
    carried: false,
    ...extra,
  };
}

/** Occurrences scheduled on day k (no carry-over). */
export function scheduledOn(state, k) {
  const out = [];
  for (const t of state.tasks) {
    if (!occursOn(t, k)) continue;
    const key = okey(t.id, k);
    if (state.skip && state.skip[key]) continue;
    out.push(occurrence(state, t, k));
  }
  return out;
}

/**
 * What the day view lists for day k.
 * For today it also lists one-off tasks from earlier days that are still open (carried over)
 * and earlier one-off tasks that were completed today.
 */
export function dayList(state, k, todayK) {
  const list = scheduledOn(state, k);
  if (k === todayK) {
    const t0 = dayStart(todayK);
    for (const t of state.tasks) {
      if (t.deleted || isRecurring(t) || t.date >= todayK) continue;
      const key = okey(t.id, t.date);
      if (state.skip && state.skip[key]) continue;
      const occ = occurrence(state, t, t.date, { carried: true });
      if (!occ.done || occ.done.at >= t0) list.push(occ);
    }
  }
  return list;
}

/**
 * Status of an occurrence at `now`:
 *   done      – completed (late = ms after due, 0 when on time)
 *   overdue   – open and past due (by = ms late)
 *   soon      – open, due within `soonMs`
 *   upcoming  – open, timed, later
 *   anytime   – open, no time set, day not over
 */
export function status(occ, now, soonMs = 15 * MIN) {
  if (occ.done) {
    const late = Math.max(0, occ.done.at - occ.due);
    return { s: 'done', late, onTime: late === 0 };
  }
  if (now > occ.due) return { s: 'overdue', by: now - occ.due };
  if (!occ.timed) return { s: 'anytime', left: occ.due - now };
  const left = occ.due - now;
  return { s: left <= soonMs ? 'soon' : 'upcoming', left };
}

const ORDER = { overdue: 0, soon: 1, upcoming: 2, anytime: 3, done: 4 };

export function sortOccs(list, now) {
  return list
    .map((o) => ({ o, st: status(o, now) }))
    .sort((a, b) => {
      const d = ORDER[a.st.s] - ORDER[b.st.s];
      if (d) return d;
      if (a.st.s === 'done') return b.o.done.at - a.o.done.at;
      if (a.o.due !== b.o.due) return a.o.due - b.o.due;
      if ((b.o.task.prio || 0) !== (a.o.task.prio || 0)) return (b.o.task.prio || 0) - (a.o.task.prio || 0);
      return (a.o.task.created || '').localeCompare(b.o.task.created || '');
    });
}

/** Summary of a past or current day (carried-over items belong to their original day). */
export function daySummary(state, k, now) {
  const occs = scheduledOn(state, k);
  const r = { date: k, total: occs.length, onTime: 0, late: 0, missed: 0, pending: 0, focus: 0, occs };
  for (const o of occs) {
    if (o.done) {
      if (o.done.at > o.due) r.late++;
      else r.onTime++;
    } else if (now > stamp(k, '')) {
      r.missed++;
    } else if (now > o.due) {
      r.pending++; // overdue but the day is not over yet
    } else {
      r.pending++;
    }
  }
  r.done = r.onTime + r.late;
  r.rate = r.total ? r.done / r.total : 0;
  const s0 = dayStart(k);
  const s1 = s0 + DAY;
  for (const f of state.focus || []) {
    if (f.at >= s0 && f.at < s1) r.focus += f.mins;
  }
  return r;
}

/** Days in a row (ending today or yesterday) with at least `goal` of tasks done; empty days are skipped. */
export function streak(state, todayK, now, goal = 0.8, maxDays = 400) {
  let n = 0;
  const today = daySummary(state, todayK, now);
  if (today.total && today.rate >= goal) n++;
  for (let i = 1; i <= maxDays; i++) {
    const k = addDays(todayK, -i);
    if (k < earliestDate(state)) break;
    const s = daySummary(state, k, now);
    if (!s.total) continue;
    if (s.rate >= goal) n++;
    else break;
  }
  return n;
}

export function earliestDate(state) {
  let k = '9999-12-31';
  for (const t of state.tasks) if (t.date < k) k = t.date;
  return k;
}

/** Totals for the `days` days ending today. */
export function rangeStats(state, todayK, now, days = 7) {
  const out = { days: [], total: 0, done: 0, onTime: 0, late: 0, missed: 0, focus: 0, cats: {} };
  for (let i = days - 1; i >= 0; i--) {
    const k = addDays(todayK, -i);
    const s = daySummary(state, k, now);
    out.days.push(s);
    out.total += s.total;
    out.done += s.done;
    out.onTime += s.onTime;
    out.late += s.late;
    out.missed += s.missed;
    out.focus += s.focus;
    for (const o of s.occs) {
      const c = o.task.cat || 'other';
      out.cats[c] = out.cats[c] || { total: 0, done: 0 };
      out.cats[c].total++;
      if (o.done) out.cats[c].done++;
    }
  }
  out.rate = out.done + out.missed > 0 ? out.done / (out.done + out.missed) : 0;
  out.onTimeRate = out.done ? out.onTime / out.done : 0;
  return out;
}

/** 31-bit positive id for notification scheduling (FNV-1a). */
export function nid(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2147483646 + 1;
}

/**
 * Alerts to schedule from `now` for the next `horizon` days:
 *   remind – `task.remind` minutes before the time (remind > 0)
 *   due    – at the time (remind >= 0)
 *   late   – 15 minutes after the time if still open (settings.nag)
 */
export function plannedAlerts(state, now, todayK, horizon = 7) {
  const out = [];
  const nag = state.settings ? state.settings.nag !== false : true;
  for (let i = 0; i <= horizon; i++) {
    const k = addDays(todayK, i);
    for (const o of scheduledOn(state, k)) {
      if (!o.timed || o.done) continue;
      const r = o.task.remind;
      if (r === undefined || r === null || r < 0) continue;
      if (r > 0) out.push({ kind: 'remind', at: o.due - r * MIN, occ: o });
      out.push({ kind: 'due', at: o.due, occ: o });
      if (nag) out.push({ kind: 'late', at: o.due + 15 * MIN, occ: o });
    }
  }
  return out
    .filter((a) => a.at > now)
    .map((a) => ({ ...a, id: nid(`${a.occ.key}|${a.kind}`) }))
    .sort((a, b) => a.at - b.at);
}

/** Countdown text: "1:05:09", "05:09", or "2d 3h". */
export function span(ms, dayWord = 'd', hourWord = 'h') {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d >= 1) return `${d}${dayWord} ${h}${hourWord}`;
  if (h >= 1) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

/** Rounded duration in words-friendly parts: {d, h, m}. */
export function parts(ms) {
  const mins = Math.max(0, Math.round(ms / MIN));
  return { d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60, mins };
}
