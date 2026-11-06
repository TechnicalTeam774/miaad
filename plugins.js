// Stand-ins for firebase/app and the two Capacitor plugins that need native code.
const hub = () => {
  if (!globalThis.__miaadFake) globalThis.__miaadFake = {};
  return globalThis.__miaadFake;
};

export function initializeApp(config) {
  return { options: config };
}

export const FirebaseAuthentication = {
  async signInWithGoogle() {
    return { credential: { idToken: 'fake-id-token' } };
  },
  async signOut() {},
};

export const BackgroundRunner = {
  async dispatchEvent(opts) {
    const h = hub();
    (h.runnerEvents = h.runnerEvents || []).push(opts);
  },
};
