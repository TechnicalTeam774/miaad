// State, persistence (localStorage, guarded), task operations, focus timer and backups.
import { okey, splitKey, dkey, isRecurring, MIN, hhmm, addDays } from './time.js';

const KEY = 'miaad.v1';
const listeners = new Set();

export const CATS = ['work', 'personal', 'health', 'study', 'home', 'other'];

export const DEFAULT_SETTINGS = {
  lang: 'ar',
  theme: 'auto', // auto | light | dark
  accent: 'blue',
  weekStart: 6, // 6 = Saturday, 0 = Sunday, 1 = Monday
  remind: 10, // default minutes before; -1 = none, 0 = at time
  nag: true, // second alert 15 min after the time if still open
  focusMin: 25,
  breakMin: 5,
  sound: true,
  installHint: true,
};

function fresh() {
  return {
    v: 1,
    tasks: [],
    done: {},
    skip: {},
    shift: {},
    focus: [],
    timer: null,
    settings: { ...DEFAULT_SETTINGS },
    meta: { created: new Date().toISOString(), seeded: false },
  };
}

export const state = load();

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch (e) {
    /* storage blocked: run in memory */
  }
  if (!raw) return fresh();
  try {
    return migrate(JSON.parse(raw));
  } catch (e) {
    return fresh();
  }
}

export function migrate(s) {
  const base = fresh();
  const out = { ...base, ...s };
  out.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  out.meta = { ...base.meta, ...(s.meta || {}) };
  for (const k of ['done', 'skip', 'shift']) if (!out[k] || typeof out[k] !== 'object') out[k] = {};
  if (!Array.isArray(out.tasks)) out.tasks = [];
  if (!Array.isArray(out.focus)) out.focus = [];
  return out;
}

let saveTimer = null;
export let storageOk = true;

export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 120);
  for (const fn of listeners) fn();
}

export function flush() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    storageOk = true;
  } catch (e) {
    storageOk = false;
  }
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function taskById(id) {
  return state.tasks.find((t) => t.id === id && !t.deleted);
}

export function saveTask(data) {
  const now = new Date().toISOString();
  if (data.id) {
    const t = taskById(data.id);
    if (!t) return null;
    const timeChanged = t.time !== data.time || t.date !== data.date;
    Object.assign(t, data, { updated: now });
    if (timeChanged) {
      // a new time replaces per-occurrence snoozes from today on
      for (const key of Object.keys(state.shift)) {
        const [id, k] = splitKey(key);
        if (id === t.id && k >= dkey(new Date())) delete state.shift[key];
      }
    }
    save();
    return t;
  }
  const t = { id: uid(), created: now, ...data };
  state.tasks.push(t);
  save();
  return t;
}

export function setDone(key, at = Date.now()) {
  state.done[key] = { at };
  save();
}

export function setUndone(key) {
  delete state.done[key];
  save();
}

/** Delete one occurrence (recurring) or the whole task (one-off / all). */
export function removeTask(id, k, scope = 'all') {
  const t = taskById(id);
  if (!t) return;
  if (scope === 'one' && isRecurring(t)) {
    state.skip[okey(id, k)] = 1;
  } else if (scope === 'future' && isRecurring(t)) {
    t.until = addDays(k, -1);
    if (t.until < t.date) t.deleted = true;
  } else {
    t.deleted = true;
  }
  save();
}

/** Snooze: same day for any task; "tomorrow" moves a one-off task. */
export function snooze(occ, minutes, now = Date.now()) {
  const t = occ.task;
  if (minutes === 'tomorrow') {
    if (isRecurring(t)) return false;
    t.date = addDays(dkey(new Date(now)), 1);
    delete state.shift[occ.key];
    save();
    return true;
  }
  const base = Math.max(now, occ.timed ? occ.due : now);
  const target = base + minutes * MIN;
  const d = new Date(target);
  if (dkey(d) !== occ.date && !occ.carried) return false; // keep snoozes inside the day
  if (occ.carried) {
    t.date = dkey(d);
    t.time = hhmm(target);
  } else if (isRecurring(t)) {
    state.shift[occ.key] = hhmm(target);
  } else {
    t.time = hhmm(target);
  }
  save();
  return true;
}

// ---------------------------------------------------------------- focus timer
export function timerStart(mode, minutes, occKey = null, now = Date.now()) {
  state.timer = { mode, occ: occKey, mins: minutes, startedAt: now, endsAt: now + minutes * MIN, left: null, spent: 0 };
  save();
}

export function timerPause(now = Date.now()) {
  const t = state.timer;
  if (!t || t.endsAt === null) return;
  t.left = Math.max(0, t.endsAt - now);
  t.spent += now - (t.resumedAt || t.startedAt);
  t.endsAt = null;
  save();
}

export function timerResume(now = Date.now()) {
  const t = state.timer;
  if (!t || t.endsAt !== null) return;
  t.endsAt = now + t.left;
  t.resumedAt = now;
  t.left = null;
  save();
}

export function timerAdd(minutes, now = Date.now()) {
  const t = state.timer;
  if (!t) return;
  if (t.endsAt !== null) t.endsAt += minutes * MIN;
  else t.left += minutes * MIN;
  t.mins += minutes;
  save();
}

export function timerRemaining(now = Date.now()) {
  const t = state.timer;
  if (!t) return 0;
  return t.endsAt !== null ? Math.max(0, t.endsAt - now) : t.left;
}

/** Stop (or finish) the timer; focus minutes are logged. Returns the logged minutes. */
export function timerStop(now = Date.now(), finished = false) {
  const t = state.timer;
  if (!t) return 0;
  let spent = t.spent + (t.endsAt !== null ? Math.min(now, t.endsAt) - (t.resumedAt || t.startedAt) : 0);
  if (finished) spent = t.mins * MIN;
  const mins = Math.round(spent / MIN);
  if (t.mode === 'focus' && mins >= 1) state.focus.push({ at: t.startedAt, mins, occ: t.occ });
  state.timer = null;
  save();
  return t.mode === 'focus' ? mins : 0;
}

export function focusFor(occKey) {
  return state.focus.filter((f) => f.occ === occKey).reduce((a, f) => a + f.mins, 0);
}

// ---------------------------------------------------------------- backup
export function exportJSON() {
  return JSON.stringify({ app: 'miaad', exported: new Date().toISOString(), data: state }, null, 1);
}

export function importJSON(text) {
  const obj = JSON.parse(text);
  const data = obj && obj.app === 'miaad' ? obj.data : obj;
  if (!data || !Array.isArray(data.tasks)) throw new Error('bad backup');
  const next = migrate(data);
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
  save();
  flush();
}

export function resetAll() {
  const keepLang = state.settings.lang;
  const next = fresh();
  next.settings.lang = keepLang;
  next.meta.seeded = true;
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, next);
  save();
  flush();
}

/** First-run examples (clearly marked) so the app opens in a working state. */
export function seedExamples(todayK, now, t) {
  if (state.meta.seeded || state.tasks.length) return;
  const at = (offsetMin) => hhmm(now + offsetMin * MIN);
  const ex = [
    { title: t('ex1'), time: at(45), dur: 30, remind: 10, cat: 'work', prio: 1, rep: { k: 'none' } },
    { title: t('ex2'), time: at(150), dur: 45, remind: 10, cat: 'health', prio: 0, rep: { k: 'daily' } },
    { title: t('ex3'), time: '', dur: 0, remind: -1, cat: 'home', prio: 0, rep: { k: 'none' } },
    { title: t('ex4'), time: at(-30), dur: 15, remind: 0, cat: 'personal', prio: 2, rep: { k: 'none' } },
  ];
  for (const e of ex) {
    if (e.time && e.time < at(0) && e.title !== t('ex4')) e.time = '23:30';
    saveTask({ notes: '', date: todayK, until: '', example: true, ...e });
  }
  state.meta.seeded = true;
  save();
}
