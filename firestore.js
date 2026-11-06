// In-memory stand-in for the parts of firebase/firestore that cloud.js uses. Several "devices" can share one
// server (globalThis.__miaadFake.server) to test sync between them. Semantics copied from Firestore:
//   set(ref, data, { mergeFields }) replaces exactly the listed field paths (deleteField() removes one),
//   listeners get the new data after the write (asynchronously), queries list the docs of a collection.
const hub = () => {
  if (!globalThis.__miaadFake) globalThis.__miaadFake = {};
  const h = globalThis.__miaadFake;
  if (!h.server && globalThis.__fakePersist) {
    try {
      h.server = new Map(JSON.parse(localStorage.getItem('__fake_server') || '[]'));
    } catch (e) { /* empty server */ }
  }
  h.server = h.server || new Map(); // path -> data
  h.listeners = h.listeners || new Set();
  h.log = h.log || [];
  h.failWrites = h.failWrites || false;
  return h;
};

const DEL = { __delete: true };
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

export class FieldPath {
  constructor(...segments) {
    this.segments = segments;
  }
}
export const deleteField = () => DEL;
export const persistentLocalCache = (o) => o;
export const persistentMultipleTabManager = () => ({});
export const persistentSingleTabManager = () => ({});
export function initializeFirestore(app, settings) {
  hub();
  return { app, settings, terminated: false };
}
export const doc = (db, ...path) => ({ db, path: path.join('/'), kind: 'doc', id: path[path.length - 1] });
export const collection = (db, ...path) => ({ db, path: path.join('/'), kind: 'col' });

function getAt(obj, segs) {
  let o = obj;
  for (const s of segs) {
    if (!o || typeof o !== 'object') return undefined;
    o = o[s];
  }
  return o;
}

function setAt(obj, segs, value) {
  let o = obj;
  for (let i = 0; i < segs.length - 1; i++) {
    if (!o[segs[i]] || typeof o[segs[i]] !== 'object') o[segs[i]] = {};
    o = o[segs[i]];
  }
  const last = segs[segs.length - 1];
  if (value === DEL) delete o[last];
  else o[last] = clone(value);
}

function stripUndefined(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

function snapshotFor(l) {
  const h = hub();
  if (l.ref.kind === 'doc') {
    const data = h.server.get(l.ref.path);
    return {
      exists: () => data !== undefined,
      data: () => clone(data),
      id: l.ref.id,
      metadata: { hasPendingWrites: false, fromCache: false },
    };
  }
  const prefix = `${l.ref.path}/`;
  const docs = [];
  for (const [p, data] of h.server) {
    if (p.startsWith(prefix) && !p.slice(prefix.length).includes('/')) {
      docs.push({ id: p.slice(prefix.length), data: () => clone(data) });
    }
  }
  docs.sort((a, b) => a.id.localeCompare(b.id));
  return { docs, metadata: { hasPendingWrites: false, fromCache: false } };
}

function persist() {
  if (globalThis.__fakePersist) localStorage.setItem('__fake_server', JSON.stringify([...hub().server]));
}

function notify(paths) {
  const h = hub();
  persist();
  for (const l of h.listeners) {
    const hit = l.ref.kind === 'doc' ? paths.has(l.ref.path) : [...paths].some((p) => p.startsWith(`${l.ref.path}/`));
    if (hit) setTimeout(() => { if (h.listeners.has(l)) l.next(snapshotFor(l)); }, 0);
  }
}

export function onSnapshot(ref, opts, next, error) {
  const h = hub();
  const l = { ref, next, error };
  h.listeners.add(l);
  setTimeout(() => { if (h.listeners.has(l)) next(snapshotFor(l)); }, 0);
  return () => h.listeners.delete(l);
}

export function writeBatch() {
  const ops = [];
  return {
    set(ref, data, opts) {
      ops.push({ ref, data: data, fields: (opts && opts.mergeFields) || null });
    },
    async commit() {
      const h = hub();
      if (h.failWrites) throw Object.assign(new Error('permission denied'), { code: 'permission-denied' });
      const touched = new Set();
      for (const op of ops) {
        const cur = clone(h.server.get(op.ref.path)) || {};
        if (op.fields) {
          for (const fp of op.fields) setAt(cur, fp.segments, getAt(op.data, fp.segments) === DEL ? DEL : stripUndefined(getAt(op.data, fp.segments)));
        } else {
          Object.assign(cur, clone(op.data));
        }
        h.server.set(op.ref.path, cur);
        touched.add(op.ref.path);
        h.log.push({ path: op.ref.path, fields: op.fields ? op.fields.map((f) => f.segments.join('.')) : ['*'] });
      }
      notify(touched);
    },
  };
}

/** Test helper: a change made by "another device" (writes one field path and notifies listeners). */
export function remoteSet(path, segments, value) {
  const h = hub();
  const cur = clone(h.server.get(path)) || {};
  setAt(cur, segments, value === null ? DEL : value);
  h.server.set(path, cur);
  notify(new Set([path]));
}
if (typeof globalThis !== 'undefined') hub().remoteSet = remoteSet;

export async function getDoc(ref) {
  const data = hub().server.get(ref.path);
  return { exists: () => data !== undefined, data: () => clone(data), id: ref.id };
}

export async function getDocs(ref) {
  return snapshotFor({ ref });
}

export async function terminate(db) {
  db.terminated = true;
}
export async function clearIndexedDbPersistence() {}
