// Background check (Android, via @capacitor/background-runner). Runs every ~15 minutes while the app is
// closed: reads the account over the Firestore REST API and schedules alerts the app has not set yet
// (tasks added or moved on another device). The app schedules everything it knows itself; the runner
// only fills that gap for the next half hour, so a task edited elsewhere is never alerted from stale data.
//
// Pure functions are exported for tests; runner-main.js wires them to the runner's globals.
import { plannedAlerts, dkey, MIN } from './time.js';
import { viewFromDocs } from './syncdiff.js';

export const WINDOW_AHEAD = 35 * MIN; // next run is ~15 min away; the rest is slack for Doze delays
export const WINDOW_BEHIND = 20 * MIN; // alerts missed since the last run still go out if this recent
const FAR = new Date(2099, 0, 1).getTime(); // rescheduling here retires a runner alarm

// ---------------------------------------------------------------- Firestore REST values
export function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return decodeFields((v.mapValue && v.mapValue.fields) || {});
  if ('arrayValue' in v) return ((v.arrayValue && v.arrayValue.values) || []).map(decodeValue);
  return null;
}

export function decodeFields(fields) {
  const out = {};
  for (const k of Object.keys(fields || {})) out[k] = decodeValue(fields[k]);
  return out;
}

export function monthIds(now) {
  const d = new Date(now);
  const ids = [];
  for (const off of [-1, 0, 1]) {
    const x = new Date(d.getFullYear(), d.getMonth() + off, 1);
    ids.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  return ids;
}

// ---------------------------------------------------------------- texts (no Intl in the runner)
const TEXT = {
  ar: { remind: (m) => `بعد ${m} دقيقة`, due: 'جه الميعاد', late: 'لسه ما خلصتش', lateBy: 'متأخرة 15 د', am: 'ص', pm: 'م' },
  en: { remind: (m) => `In ${m} minutes`, due: "It's time", late: 'Still open', lateBy: 'Late 15 min', am: 'AM', pm: 'PM' },
};

export function time12(hhmm, lang) {
  if (!hhmm) return '';
  const tx = TEXT[lang] || TEXT.ar;
  const [h, m] = hhmm.split(':').map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? tx.am : tx.pm}`;
}

export function alertText(a, lang) {
  const tx = TEXT[lang] || TEXT.ar;
  const o = a.occ;
  const at = time12(o.time, lang);
  let body;
  if (a.kind === 'remind') body = `${tx.remind(o.task.remind)} · ${at}`;
  else if (a.kind === 'due') body = `${tx.due} · ${at}`;
  else body = `${tx.late} · ${tx.lateBy}`;
  return { title: o.task.title, body };
}

// ---------------------------------------------------------------- planning
/** State shape the shared date logic expects, from the account's documents. */
export function stateFromDocs(core, months) {
  const view = viewFromDocs(core, months);
  return {
    tasks: Object.values(view.tasks),
    done: view.done,
    skip: view.skip,
    shift: view.shift,
    focus: [],
    settings: view.settings || {},
  };
}

/**
 * What to schedule now. Alerts the app already set (same id and minute) are left to the app.
 * Returns { schedule: [{id, at, title, body}], retire: [id], plan: {id: at} }.
 */
export function planRun(st, now, appPlan, runnerPlan, lang) {
  const app = new Map((appPlan || []).map(([id, at]) => [id, at]));
  const all = plannedAlerts(st, now - WINDOW_BEHIND, dkey(new Date(now)), 1);
  const wanted = new Map();
  for (const a of all) wanted.set(a.id, a);
  const schedule = [];
  const plan = {};
  for (const a of all) {
    if (a.at > now + WINDOW_AHEAD) continue;
    const appAt = app.get(a.id);
    if (appAt !== undefined && Math.abs(appAt - a.at) < MIN) continue; // the app has it
    if (runnerPlan[a.id] !== undefined && Math.abs(runnerPlan[a.id] - a.at) < MIN) {
      plan[a.id] = runnerPlan[a.id]; // already set by an earlier run
      continue;
    }
    const { title, body } = alertText(a, lang);
    schedule.push({ id: a.id, at: Math.max(a.at, now + 2000), title, body, key: a.occ.key });
    plan[a.id] = a.at;
  }
  // alarms this runner set earlier for something that is no longer due (done, deleted or moved)
  const retire = [];
  for (const id of Object.keys(runnerPlan)) {
    const n = Number(id);
    if (plan[n] !== undefined) continue;
    const at = runnerPlan[id];
    if (app.has(n)) {
      if (at > now) retire.push(n); // the app covers it now
      continue;
    }
    const w = wanted.get(n);
    if (w && Math.abs(w.at - at) < MIN) {
      if (at > now - WINDOW_BEHIND) plan[n] = at; // still right; forget it once it is long past
      continue;
    }
    if (at > now) retire.push(n);
  }
  return { schedule, retire, plan };
}

/** Alarms the runner set that the app now covers itself (so a task finished in the app stays quiet). */
export function coveredByApp(appPlan, runnerPlan) {
  const app = new Map((appPlan || []).map(([id, at]) => [id, at]));
  const retire = [];
  const keep = {};
  for (const id of Object.keys(runnerPlan || {})) {
    if (app.has(Number(id))) retire.push(Number(id));
    else keep[id] = runnerPlan[id];
  }
  return { retire, keep };
}

// ---------------------------------------------------------------- I/O (env-injected for tests)
function readJSON(kv, key, fallback) {
  try {
    const v = kv.get(key);
    return v ? JSON.parse(v) : fallback;
  } catch (e) {
    return fallback;
  }
}

async function getJSON(env, url, opts) {
  const res = await env.fetch(url, opts || {});
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (e) {
    body = null;
  }
  return { status: res.status, ok: res.status >= 200 && res.status < 300, body };
}

async function idToken(env, cfg) {
  const r = await getJSON(env, `https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(cfg.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(cfg.refreshToken)}`,
  });
  if (!r.ok || !r.body || !r.body.id_token) return null;
  if (r.body.refresh_token && r.body.refresh_token !== cfg.refreshToken) {
    cfg.refreshToken = r.body.refresh_token;
    env.kv.set('cfg', JSON.stringify(cfg));
  }
  return r.body.id_token;
}

function schedule(env, list) {
  if (!list.length) return;
  env.notify(list.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    scheduleAt: new Date(n.at),
    channelId: 'miaad_tasks',
    smallIcon: 'ic_stat_miaad',
    autoCancel: true,
    extra: n.key ? { occ: n.key } : {},
  })));
}

function retire(env, ids) {
  if (!ids.length) return;
  env.notify(ids.map((id) => ({ id, title: ' ', body: ' ', scheduleAt: new Date(FAR), channelId: 'miaad_tasks', smallIcon: 'ic_stat_miaad' })));
}

/** Periodic event. Returns a short outcome string (logged by the runner). */
export async function runSync(env) {
  const cfg = readJSON(env.kv, 'cfg', null);
  if (!cfg || !cfg.uid || !cfg.refreshToken) return 'signed-out';
  const now = env.now();
  const token = await idToken(env, cfg);
  if (!token) return 'no-token';
  const base = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/users/${cfg.uid}`;
  const headers = { Authorization: `Bearer ${token}` };
  const core = await getJSON(env, base, { method: 'GET', headers });
  if (!core.ok && core.status !== 404) return `core-${core.status}`;
  const months = [];
  for (const ym of monthIds(now)) {
    const m = await getJSON(env, `${base}/months/${ym}`, { method: 'GET', headers });
    if (m.ok && m.body) months.push(decodeFields(m.body.fields));
  }
  const st = stateFromDocs(core.ok && core.body ? decodeFields(core.body.fields) : null, months);
  const appPlan = readJSON(env.kv, 'plan', []);
  const runnerPlan = readJSON(env.kv, 'rplan', {});
  const out = planRun(st, now, appPlan, runnerPlan, cfg.lang || 'ar');
  schedule(env, out.schedule);
  retire(env, out.retire);
  env.kv.set('rplan', JSON.stringify(out.plan));
  env.kv.set('lastRun', String(now));
  return `ok ${out.schedule.length}/${out.retire.length}`;
}

/** Event from the app: account details and the alerts the app scheduled itself. */
export function runConfig(env, details) {
  if (!details || details.clear) {
    const old = readJSON(env.kv, 'rplan', {});
    retire(env, Object.keys(old).map(Number).filter((id) => old[id] > env.now()));
    for (const k of ['cfg', 'plan', 'rplan', 'lastRun']) env.kv.remove(k);
    return 'cleared';
  }
  const cfg = {
    apiKey: details.apiKey,
    projectId: details.projectId,
    uid: details.uid,
    refreshToken: details.refreshToken,
    lang: details.lang || 'ar',
  };
  env.kv.set('cfg', JSON.stringify(cfg));
  const plan = Array.isArray(details.plan) ? details.plan : [];
  env.kv.set('plan', JSON.stringify(plan));
  const { retire: ids, keep } = coveredByApp(plan, readJSON(env.kv, 'rplan', {}));
  retire(env, ids);
  env.kv.set('rplan', JSON.stringify(keep));
  return `configured ${plan.length}`;
}
