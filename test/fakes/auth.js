// Stand-in for firebase/auth: one signed-in user per "device" (per JS realm), chosen by the test through
// globalThis.__miaadFake.nextUser before the sign-in click.
const hub = () => {
  if (!globalThis.__miaadFake) globalThis.__miaadFake = {};
  return globalThis.__miaadFake;
};

let current = null;
const watchers = new Set();

export const indexedDBLocalPersistence = {};
export const browserLocalPersistence = {};
export const browserPopupRedirectResolver = {};

export function initializeAuth(app) {
  const auth = { app };
  Object.defineProperty(auth, 'currentUser', { get: () => current });
  // a device that was signed in before keeps its session (like Firebase's persisted auth)
  const saved = hub().sessions && hub().sessions[hub().deviceId || 'default'];
  if (saved) current = saved;
  if (globalThis.__fakePersist) {
    try {
      current = JSON.parse(localStorage.getItem('__fake_session') || 'null') || current;
    } catch (e) { /* none */ }
  }
  return auth;
}

export class GoogleAuthProvider {
  setCustomParameters() {}
  static credential(idToken) {
    return { idToken };
  }
}

function setUser(u) {
  current = u;
  const h = hub();
  h.sessions = h.sessions || {};
  h.sessions[h.deviceId || 'default'] = u;
  if (globalThis.__fakePersist) localStorage.setItem('__fake_session', JSON.stringify(u));
  for (const fn of watchers) setTimeout(() => fn(u), 0);
}

export async function signInWithPopup() {
  const u = hub().nextUser;
  if (!u) throw Object.assign(new Error('popup closed by user'), { code: 'auth/popup-closed-by-user' });
  setUser({ refreshToken: `rt-${u.uid}`, ...u });
  return { user: current };
}

export async function signInWithCredential(auth, cred) {
  const u = hub().nextUser;
  if (!u || !cred || !cred.idToken) throw Object.assign(new Error('bad credential'), { code: 'auth/invalid-credential' });
  setUser({ refreshToken: `rt-${u.uid}`, ...u });
  return { user: current };
}

export function onAuthStateChanged(auth, fn) {
  watchers.add(fn);
  setTimeout(() => fn(current), 0);
  return () => watchers.delete(fn);
}

export async function signOut() {
  setUser(null);
}
