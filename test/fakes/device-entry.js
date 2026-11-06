// One "device" for the sync tests: the real store + cloud modules wired to the fakes.
import * as store from '../../src/store.js';
import * as cloud from '../../src/cloud.js';
globalThis.device = { ...store, ...cloud, store, cloudMod: cloud };
