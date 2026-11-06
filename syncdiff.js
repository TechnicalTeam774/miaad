// Pure sync helpers (no Firebase here, so they run in unit tests and in the background runner).
//
// Cloud layout for one account:
//   users/{uid}                  { tasks: {id: task}, settings: {...}, schema: 1 }
//   users/{uid}/months/{YYYY-MM} { done: {occKey: {at}}, skip: {occKey: 1}, shift: {occKey: 'HH:MM'}, focus: {fid: entry} }
// Every task, completion, snooze or focus entry is its own map field, so two devices editing
// different items never overwrite each other; the same item resolves to the last write.

import { splitKey } from './time.js';

export const DELETE = Symbol('delete');
export const MONTH_FIELDS = ['done', 'skip', 'shift', 'focus'];

/** JSON with sorted keys, so equal objects compare equal whatever their key order. */
export function stable(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
}

/** Month doc id of an occurrence key ("id@2026-10-25" -> "2026-10"). */
export function monthOfKey(key) {
  return splitKey(key)[1].slice(0, 7);
}

/** Month doc id of a focus entry (local time). */
export function monthOfFocus(entry) {
  const d = new Date(entry.at);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Fingerprint of a synced view: field -> key -> stable JSON. */
export function fingerprint(view) {
  const out = { settings: stable(view.settings || {}) };
  for (const f of ['tasks', ...MONTH_FIELDS]) {
    out[f] = {};
    for (const [k, v] of Object.entries(view[f] || {})) out[f][k] = stable(v);
  }
  return out;
}

/**
 * Changes that turn `prev` (fingerprint of what the cloud has) into `next` (current view).
 * Each change: { doc: 'core' | 'YYYY-MM', field, key, value } (value DELETE removes the key;
 * settings is one field without a key).
 */
export function diffViews(prev, nextView) {
  const next = fingerprint(nextView);
  const out = [];
  for (const f of ['tasks', ...MONTH_FIELDS]) {
    const a = prev[f] || {};
    const b = next[f];
    for (const k of Object.keys(b)) {
      if (a[k] !== b[k]) out.push({ doc: docFor(f, k, nextView[f][k]), field: f, key: k, value: nextView[f][k] });
    }
    for (const k of Object.keys(a)) {
      if (!(k in b)) out.push({ doc: docFor(f, k, JSON.parse(a[k])), field: f, key: k, value: DELETE });
    }
  }
  if (prev.settings !== next.settings) out.push({ doc: 'core', field: 'settings', key: null, value: nextView.settings });
  return { changes: out, next };
}

function docFor(field, key, value) {
  if (field === 'tasks') return 'core';
  if (field === 'focus') return monthOfFocus(value);
  return monthOfKey(key);
}

/** Group changes per document: { core: [changes], '2026-10': [changes], ... }. */
export function groupByDoc(changes) {
  const out = {};
  for (const c of changes) (out[c.doc] = out[c.doc] || []).push(c);
  return out;
}

/** Synced view from the cloud documents (core data + month docs data). */
export function viewFromDocs(core, months) {
  const view = { tasks: {}, done: {}, skip: {}, shift: {}, focus: {}, settings: {} };
  if (core) {
    Object.assign(view.tasks, core.tasks || {});
    view.settings = { ...(core.settings || {}) };
  }
  for (const m of months || []) {
    for (const f of MONTH_FIELDS) Object.assign(view[f], (m && m[f]) || {});
  }
  return view;
}
