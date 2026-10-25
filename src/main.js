// Wiring: events, theme, live tick, alerts (native + web), back button, service worker, first run.
import { App } from '@capacitor/app';
import { SystemBars, SystemBarsStyle } from '@capacitor/core';
import {
  state, save, flush, onChange, saveTask, setDone, setUndone, removeTask, snooze, taskById, seedExamples,
  timerStart, timerPause, timerResume, timerAdd, timerStop, exportJSON, importJSON, resetAll,
} from './store.js';
import { dkey, addDays, plannedAlerts, nid, MIN, splitKey, isRecurring } from './time.js';
import { t, fmtTime, fmtDur, fmtMins } from './i18n.js';
import {
  ui, renderShell, render, openSheet, closeSheet, refreshSheet, readForm, findOcc, toast, tickCountdowns,
} from './ui.js';
import {
  native, permission, requestPermission, exactAllowed, openExactSettings, setupNative, syncNative, testNative,
  webNotify, webDue, chime, buzz, unlockAudio, logError,
} from './notify.js';

// ---------------------------------------------------------------- theme
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const THEME_BG = { light: '#F3F5F9', dark: '#0B0F16' };

// "auto" leaves data-theme unset so the CSS media query follows the system; the app only removes a value it set itself
let ownTheme = state.settings.theme === 'dark' || state.settings.theme === 'light';

function applyTheme() {
  const s = state.settings;
  const root = document.documentElement;
  if (s.theme === 'dark' || s.theme === 'light') {
    root.dataset.theme = s.theme;
    ownTheme = true;
  } else if (ownTheme) {
    delete root.dataset.theme;
    ownTheme = false;
  }
  root.dataset.accent = s.accent || 'blue';
  const dark = getComputedStyle(root).colorScheme.includes('dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_BG[dark ? 'dark' : 'light']);
  if (native) {
    SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch((e) => logError('bars', e));
  }
}
if (mq && mq.addEventListener) mq.addEventListener('change', () => { applyTheme(); });

// ---------------------------------------------------------------- alerts
function alertPlan(from) {
  const base = plannedAlerts(state, from, dkey(new Date(from)), 7).map((a) => {
    const o = a.occ;
    const at = o.timed ? fmtTime(o.time) : '';
    let body;
    if (a.kind === 'remind') body = `${t('remindTitle', o.task.remind)} · ${at}`;
    else if (a.kind === 'due') body = `${t('dueTitle')} · ${at}`;
    else body = `${t('lateTitle')} · ${t('late')} ${fmtDur(15 * MIN)}`;
    return { id: a.id, at: a.at, title: o.task.title, body, actions: true, extra: { occ: o.key, kind: a.kind } };
  });
  const tm = state.timer;
  if (tm && tm.endsAt !== null && tm.endsAt > from) {
    const o = tm.occ ? findOcc(tm.occ) : null;
    base.push({
      id: nid(`focus|${tm.startedAt}`), at: tm.endsAt, channel: 'miaad_focus', actions: false,
      title: tm.mode === 'focus' ? t('focusDone', tm.mins) : t('breakDone'), body: o ? o.task.title : t('app'), extra: { kind: 'focus' },
    });
  }
  return base.sort((a, b) => a.at - b.at);
}

function resync() {
  syncNative(() => alertPlan(Date.now()));
}

function fireWeb(a) {
  if (document.visibilityState === 'visible') {
    toast(`${a.title} — ${a.body}`, a.extra && a.extra.occ ? { label: t('done'), fn: () => markDone(a.extra.occ) } : null, 8000);
    if (state.settings.sound) chime();
    buzz();
  } else {
    webNotify(a.title, a.body, String(a.id));
  }
}

async function refreshPermission() {
  ui.notif = await permission();
  ui.exact = await exactAllowed();
}

async function askPermission() {
  ui.notif = await requestPermission();
  ui.exact = await exactAllowed();
  resync();
  render();
}

// ---------------------------------------------------------------- actions
function markDone(key, at = Date.now()) {
  const o = findOcc(key);
  if (!o || o.done) return;
  setDone(key, at);
  const late = Math.max(0, at - o.due);
  toast(late ? t('markedLate', fmtDur(late)) : t('markedOnTime'), { label: t('undo'), fn: () => setUndone(key) });
  buzz();
}

function toggle(key) {
  const o = findOcc(key);
  if (!o) return;
  if (o.done) {
    const prev = o.done;
    setUndone(key);
    toast(t('undo'), { label: t('done'), fn: () => setDone(key, prev.at) }, 2500);
  } else {
    markDone(key);
    if (ui.sheet && ui.sheet.type === 'detail') closeSheet();
  }
}

function doDelete(key, scope) {
  const [id, k] = splitKey(key);
  const tk = taskById(id);
  if (!tk) return;
  const snap = { deleted: !!tk.deleted, until: tk.until || '' };
  removeTask(id, k, scope);
  closeSheet();
  toast(t('deleted'), {
    label: t('undo'),
    fn: () => {
      const task = state.tasks.find((x) => x.id === id);
      if (!task) return;
      if (scope === 'one') delete state.skip[key];
      task.deleted = snap.deleted;
      task.until = snap.until;
      save();
    },
  });
}

function clearExamples() {
  for (const tk of state.tasks) if (tk.example) tk.deleted = true;
  for (const key of Object.keys(state.done)) {
    const tk = state.tasks.find((x) => x.id === splitKey(key)[0]);
    if (tk && tk.example) delete state.done[key];
  }
  save();
}

function finishTimer(now) {
  const tm = state.timer;
  const mode = tm.mode;
  const mins = timerStop(now, true);
  if (state.settings.sound) chime();
  buzz();
  if (mode === 'focus') {
    ui.focusMode = 'break';
    ui.focusLen = state.settings.breakMin;
    toast(t('focusDone', mins), { label: t('startBreak', state.settings.breakMin), fn: () => { timerStart('break', state.settings.breakMin, null); } }, 9000);
  } else {
    ui.focusMode = 'focus';
    ui.focusLen = state.settings.focusMin;
    toast(t('breakDone'));
  }
}

async function exportFile() {
  const text = exportJSON();
  const name = `miaad-backup-${dkey(new Date())}.json`;
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  } catch (e) {
    logError('export', e);
    copyText(text);
  }
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('copied'));
  } catch (e) {
    openSheet({ type: 'paste' });
    const box = document.getElementById('paste-box');
    if (box) {
      box.value = text;
      box.select();
    }
    toast(t('copyFailed'), null, 6000);
  }
}

function doImport(text) {
  try {
    importJSON(text);
    applyTheme();
    renderShell();
    render();
    resync();
    toast(t('restored'));
    return true;
  } catch (e) {
    toast(t('badBackup'));
    return false;
  }
}

// ---------------------------------------------------------------- events
function onClick(e) {
  unlockAudio();
  const tab = e.target.closest('.tab[data-tab]');
  if (tab) {
    ui.tab = tab.dataset.tab;
    if (ui.tab === 'focus' && !state.timer && !ui.focusLen) ui.focusLen = state.settings.focusMin;
    render();
    document.getElementById('view').scrollTop = 0;
    window.scrollTo(0, 0);
    return;
  }
  const day = e.target.closest('[data-day]');
  if (day) {
    ui.date = day.dataset.day;
    render();
    return;
  }
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const keyEl = el.closest('[data-key]');
  const key = el.dataset.key || (keyEl && keyEl.dataset.key) || (ui.sheet && ui.sheet.key);
  switch (act) {
    case 'add':
      openSheet({ type: 'edit', date: ui.tab === 'today' ? ui.date : ui.today });
      break;
    case 'toggle':
      toggle(key);
      break;
    case 'open':
    case 'open-key':
      openSheet({ type: 'detail', key });
      break;
    case 'sheet-close':
      closeSheet();
      break;
    case 'edit': {
      const o = findOcc(key);
      if (o) {
        ui.sheet = { type: 'edit', id: o.task.id, key };
        document.getElementById('sheet-in').innerHTML = '';
        refreshSheet();
      }
      break;
    }
    case 'delete-ask':
      ui.sheet = { type: 'del', key };
      refreshSheet();
      break;
    case 'delete':
      doDelete(key, el.dataset.scope);
      break;
    case 'back-detail':
      ui.sheet = { type: 'detail', key };
      refreshSheet();
      break;
    case 'snooze-menu':
      ui.sheet = { type: 'snooze', key };
      refreshSheet();
      break;
    case 'snooze': {
      const o = findOcc(key);
      const m = el.dataset.min === 'tomorrow' ? 'tomorrow' : Number(el.dataset.min);
      if (o && snooze(o, m)) {
        closeSheet();
        toast(t('snoozed'));
      }
      break;
    }
    case 'focus-task':
      ui.focusPick = key;
      ui.tab = 'focus';
      ui.focusMode = 'focus';
      ui.focusLen = (findOcc(key) && findOcc(key).task.dur) || state.settings.focusMin;
      closeSheet();
      render();
      break;
    case 'week':
      ui.date = addDays(ui.date, Number(el.dataset.step));
      render();
      break;
    case 'go-today':
      ui.date = ui.today;
      render();
      break;
    case 'clear-examples':
      clearExamples();
      break;
    case 'install':
      if (ui.installEvt) {
        ui.installEvt.prompt();
        ui.installEvt = null;
        render();
      }
      break;
    case 'install-hide':
      ui.installHidden = true;
      state.settings.installHint = false;
      save();
      break;
    case 'focus-mode':
      ui.focusMode = el.dataset.mode;
      ui.focusLen = el.dataset.mode === 'focus' ? state.settings.focusMin : state.settings.breakMin;
      render();
      break;
    case 'focus-len':
      ui.focusLen = Number(el.dataset.min);
      render();
      break;
    case 'timer-start':
      timerStart(ui.focusMode, ui.focusLen || state.settings.focusMin, ui.focusMode === 'focus' ? (ui.focusPick || null) : null);
      if (ui.notif === 'prompt') askPermission();
      break;
    case 'timer-pause':
      timerPause();
      break;
    case 'timer-resume':
      timerResume();
      break;
    case 'timer-add':
      timerAdd(5);
      break;
    case 'timer-stop': {
      const mins = timerStop();
      if (mins) toast(t('focusDone', mins));
      break;
    }
    case 'log-filter':
      ui.logFilter = el.dataset.f;
      render();
      break;
    case 'set-lang':
      state.settings.lang = el.dataset.v;
      save();
      renderShell();
      render();
      resync();
      break;
    case 'set-theme':
      state.settings.theme = el.dataset.v;
      save();
      applyTheme();
      break;
    case 'set-accent':
      state.settings.accent = el.dataset.v;
      save();
      applyTheme();
      break;
    case 'set-week':
      state.settings.weekStart = Number(el.dataset.v);
      save();
      break;
    case 'notif-ask':
      askPermission();
      break;
    case 'notif-test':
      if (native) {
        if (ui.notif !== 'granted') askPermission();
        else testNative(t('app'), t('notifTestBody'));
      } else if (ui.notif === 'granted') {
        webNotify(t('app'), t('notifTestBody'), 'test');
        toast(t('notifTestBody'));
        if (state.settings.sound) chime();
      } else {
        askPermission().then(() => toast(t('notifTestBody')));
      }
      break;
    case 'exact-fix':
      openExactSettings().then(refreshPermission).then(render);
      break;
    case 'export-file':
      if (native) copyText(exportJSON());
      else exportFile();
      break;
    case 'export-copy':
      copyText(exportJSON());
      break;
    case 'import-paste':
      openSheet({ type: 'paste' });
      break;
    case 'import-paste-go': {
      const box = document.getElementById('paste-box');
      if (box && doImport(box.value)) closeSheet();
      break;
    }
    case 'reset-ask':
      openSheet({ type: 'reset' });
      break;
    case 'reset-go':
      resetAll();
      closeSheet();
      applyTheme();
      renderShell();
      render();
      resync();
      toast(t('resetDone'));
      break;
    default:
      break;
  }
}

function onChangeEvt(e) {
  const el = e.target;
  const act = el.dataset && el.dataset.act;
  if (act === 'focus-pick') {
    ui.focusPick = el.value;
    const o = el.value ? findOcc(el.value) : null;
    if (o && o.task.dur) ui.focusLen = o.task.dur;
    render();
    return;
  }
  if (act === 'set-remind') { state.settings.remind = Number(el.value); save(); return; }
  if (act === 'set-focus') { state.settings.focusMin = Number(el.value); ui.focusLen = null; save(); return; }
  if (act === 'set-break') { state.settings.breakMin = Number(el.value); save(); return; }
  if (act === 'set-nag') { state.settings.nag = el.checked; save(); return; }
  if (act === 'set-sound') { state.settings.sound = el.checked; save(); return; }
  if (act === 'import-file') {
    const f = el.files && el.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => doImport(String(r.result || ''));
    r.readAsText(f);
    el.value = '';
    return;
  }
  const form = el.closest && el.closest('#task-form');
  if (form) formLogic(form, el);
}

function formLogic(form, el) {
  if (el.name === 'notime') {
    const time = form.elements.time;
    time.disabled = el.checked;
    if (!el.checked && !time.value) time.value = '09:00';
    const none = form.querySelector('input[name="remind"][value="-1"]');
    const def = form.querySelector(`input[name="remind"][value="${state.settings.remind}"]`) || form.querySelector('input[name="remind"][value="0"]');
    if (el.checked && none) none.checked = true;
    else if (!el.checked && def) def.checked = true;
  }
  if (el.name === 'rep') {
    form.querySelector('.days-pick').hidden = el.value !== 'days';
    form.querySelector('.until').hidden = el.value === 'none';
  }
  if (el.name === 'title') form.querySelector('#err-title').hidden = true;
}

function onSubmit(e) {
  const form = e.target;
  if (form.id !== 'task-form') return;
  e.preventDefault();
  const data = readForm(form);
  if (!data.title) {
    form.querySelector('#err-title').hidden = false;
    form.elements.title.focus();
    return;
  }
  const s = ui.sheet || {};
  if (s.id) data.id = s.id;
  const task = saveTask(data);
  if (task && ui.tab === 'today' && !isRecurring(task) && data.date !== ui.date && data.date >= ui.today) ui.date = data.date;
  closeSheet();
  toast(t('saved'));
  if (data.time && data.remind >= 0 && ui.notif === 'prompt') askPermission();
}

// ---------------------------------------------------------------- tick
function tick() {
  const now = Date.now();
  const k = dkey(new Date(now));
  if (k !== ui.today) {
    if (ui.date === ui.today) ui.date = k;
    ui.today = k;
    render();
    resync();
  }
  if (state.timer && state.timer.endsAt !== null && state.timer.endsAt <= now) finishTimer(now);
  const changed = tickCountdowns(now);
  if (changed && !(ui.sheet && ui.sheet.type === 'edit')) render();
  if (!native) {
    if (planDirty || now - planAt > 30000) {
      webPlan = alertPlan(now - 10 * MIN);
      planAt = now;
      planDirty = false;
    }
    webDue(webPlan, now, fireWeb);
  }
}

let webPlan = [];
let planAt = 0;
let planDirty = true;

// ---------------------------------------------------------------- boot
let rafPending = false;

function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}

async function boot() {
  applyTheme();
  renderShell();
  seedExamples(ui.today, Date.now(), t);
  render();
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChangeEvt);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });
  window.addEventListener('popstate', () => { closeSheet(true); });
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); ui.installEvt = e; render(); });
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else { tick(); render(); }
  });
  onChange(() => { planDirty = true; scheduleRender(); resync(); });
  setInterval(tick, 1000);
  await refreshPermission();
  render();
  if (native) {
    await setupNative({ channelTasks: t('notifications'), channelFocus: t('focusTitle'), done: t('actDone'), snooze: t('actSnooze') }, (actionId, extra) => {
      if (!extra.occ) return;
      if (actionId === 'done') { setDone(extra.occ, Date.now()); return; }
      if (actionId === 'snooze') { const o = findOcc(extra.occ); if (o) snooze(o, 10); return; }
      const [, k] = splitKey(extra.occ);
      ui.tab = 'today';
      ui.date = k < ui.today ? ui.today : k;
      render();
      openSheet({ type: 'detail', key: extra.occ });
    });
    App.addListener('backButton', () => {
      if (closeSheet()) return;
      if (ui.tab !== 'today') { ui.tab = 'today'; render(); return; }
      App.minimizeApp();
    });
    App.addListener('resume', async () => { await refreshPermission(); tick(); render(); resync(); });
    App.addListener('pause', flush);
    resync();
  } else if ('serviceWorker' in navigator && window.top === window.self && /^https?:/.test(location.protocol)) {
    // a new build takes over in the background; the page reloads the next time it comes back to the screen
    let hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) updateReady = true;
      hadController = true;
    });
    navigator.serviceWorker.register('sw.js').catch((e) => logError('sw', e));
  }
}

let updateReady = false;
document.addEventListener('visibilitychange', () => {
  if (updateReady && document.visibilityState === 'visible' && !ui.sheet) {
    flush();
    location.reload();
  }
});

window.addEventListener('error', (e) => logError('js', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => logError('promise', e.reason));
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export { fmtMins };
