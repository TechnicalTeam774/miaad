// Stand-in for @capacitor/core: "native" is decided per device by the test.
export const Capacitor = { isNativePlatform: () => !!globalThis.__deviceNative };
export const SystemBars = { setStyle: async () => {} };
export const SystemBarsStyle = { Dark: 'DARK', Light: 'LIGHT' };
export function registerPlugin() {
  return new Proxy({}, { get: () => async () => ({}) });
}
