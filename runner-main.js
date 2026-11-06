// Entry of the background runner bundle (www/runners/sync.js). The runner calls these listeners with
// (resolve, reject, args); every path must resolve or reject.
/* global CapacitorKV, CapacitorNotifications */
import { runSync, runConfig } from './runner.js';

const env = {
  kv: {
    get: (k) => {
      const r = CapacitorKV.get(k);
      return r && typeof r === 'object' ? r.value : r;
    },
    set: (k, v) => CapacitorKV.set(k, v),
    remove: (k) => CapacitorKV.remove(k),
  },
  fetch: (url, opts) => fetch(url, opts),
  notify: (list) => CapacitorNotifications.schedule(list),
  now: () => Date.now(),
};

addEventListener('sync', async (resolve, reject) => {
  try {
    const out = await runSync(env);
    console.log(`miaad sync: ${out}`);
    resolve();
  } catch (e) {
    console.error(`miaad sync failed: ${e && e.message}`);
    reject(e);
  }
});

addEventListener('config', (resolve, reject, args) => {
  try {
    const out = runConfig(env, args);
    console.log(`miaad config: ${out}`);
    resolve();
  } catch (e) {
    console.error(`miaad config failed: ${e && e.message}`);
    reject(e);
  }
});
