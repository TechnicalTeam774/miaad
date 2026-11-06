// Google sign-in and live sync (Firebase Auth + Firestore). Without a Firebase config the app stays local-only.
//
// Flow: the local state stays the source for the screen. Every local save is diffed against the last
// known cloud copy and only the changed items are written. Firestore snapshots (including this device's
// own pending writes) replace the local copy, so other devices' edits show up live.
import { initializeApp } from 'firebase/app';
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver,
  GoogleAuthProvider, signInWithPopup, signInWithCredential, onAuthStateChanged, signOut as fbSignOut,
} from 'firebase/auth';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, persistentSingleTabManager,
  doc, collection, onSnapshot, writeBatch, deleteField, FieldPath, getDoc, getDocs, terminate, clearIndexedDbPersistence,
} from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { BackgroundRunner } from '@capacitor/background-runner';
import { state, save, onChange, syncedView, applyRemote, mergeViews, wipeLocal } from './store.js';
import { diffViews, fingerprint, groupByDoc, viewFromDocs, DELETE } from './syncdiff.js';

/* global __FIREBASE_CONFIG__ */
const CONFIG = typeof __FIREBASE_CONFIG__ !== 'undefined' ? __FIREBASE_CONFIG__ : null;
const native = Capacitor.isNativePlatform();
const framed = (() => {
  try {
    return window.top !== window.self;
  } catch (e) {
    return true;
  }
})();
export const RUNNER_LABEL = 'app.miaad.tasks.sync';

/** Sign-in needs a Firebase config and a top-level page (an embedded preview cannot sign in). */
export const cloudAvailable = !!(CONFIG && CONFIG.apiKey && CONFIG.projectId && CONFIG.appId) && !framed;

/** status: off | loading | syncing | synced | offline | error */
export const cloud = { ready: !cloudAvailable, user: null, status: 'off', lastSync: 0, error: '' };
const subs = new Set();
export function onCloud(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}
function emit() {
  for (const fn of subs) fn(cloud);
}

let auth = null;
let db = null;
let uid = null;
let shadow = null; // fingerprint of what the cloud holds
let applying = false;
let unsubCore = null;
let unsubMonths = null;
let coreData = null;
let monthDocs = new Map();
let coreSeen = false;
let monthsSeen = false;
let pending = { core: false, months: false };
let errorLog = () => {};

const coreRef = (u) => doc(db, 'users', u);
const monthsCol = (u) => collection(db, 'users', u, 'months');
const monthRef = (u, ym) => doc(db, 'users', u, 'months', ym);

export function initCloud(logError) {
  if (logError) errorLog = logError;
  if (!cloudAvailable) return;
  try {
    const app = initializeApp(CONFIG);
    auth = native
      ? initializeAuth(app, { persistence: indexedDBLocalPersistence })
      : initializeAuth(app, {
        persistence: [indexedDBLocalPersistence, browserLocalPersistence],
        popupRedirectResolver: browserPopupRedirectResolver,
      });
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: native ? persistentSingleTabManager() : persistentMultipleTabManager() }),
      ignoreUndefinedProperties: true,
    });
  } catch (e) {
    fail('init', e);
    return;
  }
  // this device already mirrors an account: edits made before sign-in finishes are diffed from here
  if (state.meta.syncUid) shadow = fingerprint(syncedView());
  cloud.status = state.meta.syncUid ? 'loading' : 'off';
  onChange(pushLocal);
  window.addEventListener('online', updateStatus);
  window.addEventListener('offline', updateStatus);
  onAuthStateChanged(auth, (user) => {
    handleUser(user).catch((e) => fail('account', e));
  });
}

async function handleUser(user) {
  cloud.ready = true;
  if (!user) {
    stopListening();
    uid = null;
    cloud.user = null;
    cloud.status = 'off';
    emit();
    return;
  }
  cloud.user = { uid: user.uid, name: user.displayName || '', email: user.email || '', photo: user.photoURL || '' };
  cloud.status = 'syncing';
  cloud.error = '';
  emit();
  if (state.meta.syncUid && state.meta.syncUid !== user.uid) {
    // another account's copy was on this device: it lives in that account, not here
    wipeLocal();
    shadow = null;
  }
  if (state.meta.syncUid !== user.uid) {
    await firstMerge(user.uid);
  }
  uid = user.uid;
  if (!state.meta.welcomed) {
    state.meta.welcomed = true;
    save();
  }
  pushLocal(); // edits made while signing in
  listen(user.uid);
  runnerConfig();
}

/** First sign-in on this device: keep what the account has and add what only this device has. */
async function firstMerge(u) {
  const [coreSnap, monthsSnap] = await Promise.all([getDoc(coreRef(u)), getDocs(monthsCol(u))]);
  const remote = viewFromDocs(coreSnap.exists() ? coreSnap.data() : null, monthsSnap.docs.map((d) => d.data()));
  const merged = mergeViews(syncedView(), remote);
  shadow = fingerprint(remote);
  state.meta.syncUid = u;
  state.meta.welcomed = true;
  state.meta.seeded = true; // no demo tasks on a device linked to an account
  applying = true; // examples drop out here: the synced view never contains them
  try {
    applyRemote(merged);
  } finally {
    applying = false;
  }
  uid = u;
  pushLocal();
}

function listen(u) {
  stopListening();
  coreSeen = false;
  monthsSeen = false;
  unsubCore = onSnapshot(coreRef(u), { includeMetadataChanges: true }, (snap) => {
    coreData = snap.exists() ? snap.data() : null;
    pending.core = snap.metadata.hasPendingWrites;
    coreSeen = true;
    applySnapshots();
  }, (e) => fail('listen', e));
  unsubMonths = onSnapshot(monthsCol(u), { includeMetadataChanges: true }, (qs) => {
    monthDocs = new Map(qs.docs.map((d) => [d.id, d.data()]));
    pending.months = qs.metadata.hasPendingWrites;
    monthsSeen = true;
    applySnapshots();
  }, (e) => fail('listen', e));
}

function stopListening() {
  if (unsubCore) unsubCore();
  if (unsubMonths) unsubMonths();
  unsubCore = null;
  unsubMonths = null;
}

function sameFingerprint(a, b) {
  if (!a || !b || a.settings !== b.settings) return false;
  for (const f of Object.keys(a)) {
    if (f === 'settings') continue;
    const x = a[f];
    const y = b[f] || {};
    const kx = Object.keys(x);
    if (kx.length !== Object.keys(y).length) return false;
    for (const k of kx) if (x[k] !== y[k]) return false;
  }
  return true;
}

function applySnapshots() {
  if (!coreSeen || !monthsSeen) return;
  const remote = viewFromDocs(coreData, [...monthDocs.values()]);
  const fp = fingerprint(remote);
  if (!sameFingerprint(fp, shadow)) {
    shadow = fp;
    applying = true;
    try {
      applyRemote(remote);
    } finally {
      applying = false;
    }
  }
  updateStatus();
}

/** Write the items that changed locally since the last known cloud copy. */
function pushLocal() {
  if (applying || !db || !uid || !shadow) return;
  const { changes, next } = diffViews(shadow, syncedView());
  if (!changes.length) return;
  shadow = next;
  const batch = writeBatch(db);
  for (const [docId, list] of Object.entries(groupByDoc(changes))) {
    const ref = docId === 'core' ? coreRef(uid) : monthRef(uid, docId);
    const data = {};
    const fields = [];
    for (const c of list) {
      if (c.key === null) {
        data[c.field] = c.value;
        fields.push(new FieldPath(c.field));
      } else {
        data[c.field] = data[c.field] || {};
        data[c.field][c.key] = c.value === DELETE ? deleteField() : c.value;
        fields.push(new FieldPath(c.field, c.key));
      }
    }
    if (docId === 'core') {
      data.schema = 1;
      fields.push(new FieldPath('schema'));
    }
    batch.set(ref, data, { mergeFields: fields });
  }
  batch.commit().then(() => {
    cloud.lastSync = Date.now();
    cloud.error = '';
    updateStatus();
  }).catch((e) => fail('save', e));
  updateStatus();
}

function updateStatus() {
  if (!cloud.user) cloud.status = state.meta.syncUid && !cloud.ready ? 'loading' : 'off';
  else if (cloud.error) cloud.status = 'error';
  else if (typeof navigator !== 'undefined' && navigator.onLine === false) cloud.status = 'offline';
  else if (!coreSeen || !monthsSeen || pending.core || pending.months) cloud.status = 'syncing';
  else {
    cloud.status = 'synced';
    cloud.lastSync = Date.now();
  }
  emit();
}

function fail(where, e) {
  const code = (e && e.code) || '';
  errorLog(`cloud ${where}`, e);
  if (where === 'save' || where === 'listen' || where === 'account') {
    cloud.error = code || (e && e.message) || 'error';
    updateStatus();
  }
}

/** Google sign-in: native account picker on Android, popup on the web. Throws on failure. */
export async function signIn() {
  if (!cloudAvailable || !auth) throw new Error('unavailable');
  if (native) {
    const res = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    const idToken = res && res.credential && res.credential.idToken;
    if (!idToken) throw Object.assign(new Error('no id token'), { code: 'auth/no-id-token' });
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  } else {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    await signInWithPopup(auth, provider);
  }
}

/** Sign out and remove the account's data from this device (it stays in the account). */
export async function signOut() {
  stopListening();
  uid = null;
  shadow = null;
  try {
    if (native) await FirebaseAuthentication.signOut();
  } catch (e) {
    errorLog('cloud signout', e);
  }
  try {
    await fbSignOut(auth);
  } catch (e) {
    errorLog('cloud signout', e);
  }
  await runnerClear();
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (e) {
    errorLog('cloud cache', e);
  }
  wipeLocal();
}

// ---------------------------------------------------------------- background runner (Android)
let runnerSig = '';
let runnerPlan = [];

/** Tell the background runner what it needs: how to read the account and which alerts the app already set. */
export async function runnerConfig(plan) {
  if (plan) runnerPlan = plan;
  if (!native || !auth || !auth.currentUser || !CONFIG) return;
  const details = {
    apiKey: CONFIG.apiKey,
    projectId: CONFIG.projectId,
    uid: auth.currentUser.uid,
    refreshToken: auth.currentUser.refreshToken,
    lang: state.settings.lang,
    plan: runnerPlan,
  };
  const sig = JSON.stringify(details);
  if (sig === runnerSig) return;
  try {
    await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'config', details });
    runnerSig = sig;
  } catch (e) {
    errorLog('runner config', e);
  }
}

async function runnerClear() {
  if (!native) return;
  try {
    await BackgroundRunner.dispatchEvent({ label: RUNNER_LABEL, event: 'config', details: { clear: true } });
    runnerSig = '';
  } catch (e) {
    errorLog('runner clear', e);
  }
}
