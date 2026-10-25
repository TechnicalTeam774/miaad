// Notifications: native (Android APK via Capacitor Local Notifications) or web (while the page is alive).
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export const native = Capacitor.isNativePlatform();
const errors = [];

export function logError(where, e) {
  const msg = (e && (e.message || e.errorMessage)) || String(e);
  errors.push(`${new Date().toLocaleTimeString()} · ${where}: ${msg}`);
  if (errors.length > 40) errors.shift();
}

export const getErrors = () => errors.slice().reverse();

export function webSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** 'granted' | 'denied' | 'prompt' | 'unsupported' */
export async function permission() {
  try {
    if (native) {
      const p = await LocalNotifications.checkPermissions();
      return p.display === 'granted' ? 'granted' : p.display === 'denied' ? 'denied' : 'prompt';
    }
    if (!webSupported()) return 'unsupported';
    return Notification.permission === 'default' ? 'prompt' : Notification.permission;
  } catch (e) {
    logError('permission', e);
    return 'unsupported';
  }
}

export async function requestPermission() {
  try {
    if (native) {
      const p = await LocalNotifications.requestPermissions();
      return p.display === 'granted' ? 'granted' : 'denied';
    }
    if (!webSupported()) return 'unsupported';
    const r = await Notification.requestPermission();
    return r === 'default' ? 'prompt' : r;
  } catch (e) {
    logError('requestPermission', e);
    return 'denied';
  }
}

/** Android 12+: may alarms fire at the exact minute? */
export async function exactAllowed() {
  if (!native) return true;
  try {
    const r = await LocalNotifications.checkExactNotificationSetting();
    return r.exact_alarm === 'granted';
  } catch (e) {
    return true; // older Android: always exact
  }
}

export async function openExactSettings() {
  if (!native) return;
  try {
    await LocalNotifications.changeExactNotificationSetting();
  } catch (e) {
    logError('exactSettings', e);
  }
}

export async function setupNative(labels, onAction) {
  if (!native) return;
  try {
    await LocalNotifications.createChannel({
      id: 'miaad_tasks', name: labels.channelTasks, description: labels.channelTasks,
      importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#2F6BFF',
    });
    await LocalNotifications.createChannel({
      id: 'miaad_focus', name: labels.channelFocus, description: labels.channelFocus,
      importance: 4, visibility: 1, vibration: true,
    });
    await LocalNotifications.registerActionTypes({
      types: [{ id: 'TASK', actions: [{ id: 'done', title: labels.done }, { id: 'snooze', title: labels.snooze }] }],
    });
    await LocalNotifications.addListener('localNotificationActionPerformed', (ev) => {
      try {
        onAction(ev.actionId, (ev.notification && ev.notification.extra) || {});
      } catch (e) {
        logError('action', e);
      }
    });
  } catch (e) {
    logError('setupNative', e);
  }
}

let syncTimer = null;
let lastSig = '';

/** Debounced: replace every pending native notification with the current plan. */
export function syncNative(getPlan) {
  if (!native) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => doSync(getPlan()), 700);
}

async function doSync(plan) {
  try {
    const sig = plan.map((a) => `${a.id}:${a.at}:${a.title}`).join('|');
    if (sig === lastSig) return;
    if ((await permission()) !== 'granted') return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }
    const exact = await exactAllowed();
    const list = plan.slice(0, 64).map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      schedule: { at: new Date(a.at), allowWhileIdle: true },
      channelId: a.channel || 'miaad_tasks',
      actionTypeId: a.actions ? 'TASK' : undefined,
      smallIcon: 'ic_stat_miaad',
      iconColor: '#2F6BFF',
      autoCancel: true,
      foreground: true,
      isExactNotification: exact,
      extra: a.extra || {},
    }));
    if (list.length) await LocalNotifications.schedule({ notifications: list });
    lastSig = sig;
  } catch (e) {
    logError('schedule', e);
  }
}

export async function testNative(title, body) {
  try {
    await LocalNotifications.schedule({
      notifications: [{
        id: 7, title, body, schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
        channelId: 'miaad_tasks', smallIcon: 'ic_stat_miaad', iconColor: '#2F6BFF', foreground: true, isExactNotification: false,
      }],
    });
  } catch (e) {
    logError('test', e);
  }
}

// ---------------------------------------------------------------- web
let audio = null;

export function unlockAudio() {
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
  } catch (e) {
    audio = null;
  }
}

export function chime() {
  try {
    if (!audio) return;
    const t0 = audio.currentTime;
    [[880, 0], [1175, 0.16]].forEach(([f, d]) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.32);
      o.connect(g).connect(audio.destination);
      o.start(t0 + d);
      o.stop(t0 + d + 0.35);
    });
  } catch (e) {
    /* ignore */
  }
}

export function buzz() {
  try {
    if (navigator.vibrate) navigator.vibrate([90, 60, 90]);
  } catch (e) {
    /* ignore */
  }
}

/** Show a system notification from the web app (only when allowed and the page is hidden). */
export async function webNotify(title, body, tag) {
  if (!webSupported() || Notification.permission !== 'granted') return false;
  try {
    const reg = navigator.serviceWorker && (await navigator.serviceWorker.getRegistration());
    if (reg) {
      await reg.showNotification(title, { body, tag, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png' });
    } else {
      new Notification(title, { body, tag, icon: 'icons/icon-192.png' });
    }
    return true;
  } catch (e) {
    logError('webNotify', e);
    return false;
  }
}

const FIRED_KEY = 'miaad.fired';
let fired = new Set();
try {
  fired = new Set(JSON.parse(sessionStorage.getItem(FIRED_KEY) || '[]'));
} catch (e) {
  fired = new Set();
}

/** Fire web alerts whose time has come (within the last 10 minutes). */
export function webDue(plan, now, fire) {
  if (native) return;
  for (const a of plan) {
    if (a.at > now || now - a.at > 10 * 60000) continue;
    const k = `${a.id}:${a.at}`;
    if (fired.has(k)) continue;
    fired.add(k);
    fire(a);
  }
  try {
    sessionStorage.setItem(FIRED_KEY, JSON.stringify([...fired].slice(-200)));
  } catch (e) {
    /* ignore */
  }
}
