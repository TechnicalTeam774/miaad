// Rendering: app shell, Today, Focus, Log, Settings, sheets and toasts.
import {
  state, CATS, taskById, saveTask, setDone, setUndone, removeTask, snooze, focusFor, timerRemaining, storageOk,
} from './store.js';
import {
  dkey, addDays, weekday, parseKey, okey, splitKey, occurrence, dayList, sortOccs, status, isRecurring, span,
  daySummary, rangeStats, streak, scheduledOn, MIN, stamp, pad, earliestDate,
} from './time.js';
import { t, lang, dir, fmtTime, fmtClock, fmtDay, relDay, fmtDur, fmtMins } from './i18n.js';
import { icon } from './icons.js';
import { native, getErrors } from './notify.js';

/* global __APP_VERSION__ */
// set by build.mjs (1.0.<GitHub build number>); same number as the Android versionName
export const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';

export const ui = {
  tab: 'today',
  date: dkey(new Date()),
  today: dkey(new Date()),
  logFilter: 'all',
  sheet: null,
  focusPick: '',
  focusMode: 'focus',
  focusLen: null,
  installEvt: null,
  installHidden: false,
  notif: 'prompt',
  exact: true,
  statusSig: '',
};

export const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const $ = (sel, root = document) => root.querySelector(sel);

// ---------------------------------------------------------------- helpers
export function findOcc(key) {
  const [id, k] = splitKey(key);
  const task = taskById(id);
  if (!task) return null;
  const carried = !isRecurring(task) && k < ui.today;
  return occurrence(state, task, k, { carried });
}

function catLabel(c) {
  return t(`cat_${c || 'other'}`);
}

function repLabel(task) {
  const r = (task.rep && task.rep.k) || 'none';
  if (r === 'days') {
    const names = t('dayNames');
    return (task.rep.days || []).slice().sort().map((d) => names[d]).join('، ');
  }
  return t('repeatsInfo')[r] || '';
}

function pillHTML(o, st, pastDay) {
  const key = esc(o.key);
  if (st.s === 'done') {
    return st.onTime
      ? `<span class="pill is-done">${icon('check')}${esc(fmtClock(o.done.at))}</span>`
      : `<span class="pill is-done-late">${esc(t('doneLate', fmtDur(st.late)))}</span>`;
  }
  if (st.s === 'anytime') return `<span class="pill is-any">${esc(t('anytimeShort'))}</span>`;
  if (st.s === 'overdue' && pastDay && !o.carried) return `<span class="pill is-missed">${esc(t('missedL'))}</span>`;
  const label = st.s === 'overdue' ? t('late') : t('left');
  const val = st.s === 'overdue' ? span(st.by, ` ${t('dayW')}`, ` ${t('hour')}`) : span(st.left, ` ${t('dayW')}`, ` ${t('hour')}`);
  return `<span class="pill is-${st.s}" data-cd="${key}" data-due="${o.due}" data-s="${st.s}"><span class="pl">${esc(label)}</span> <b class="num">${esc(val)}</b></span>`;
}

function taskRow(o, st, now, pastDay) {
  const tk = o.task;
  const meta = [];
  meta.push(`<span class="cat c-${esc(tk.cat || 'other')}"><i></i>${esc(catLabel(tk.cat))}</span>`);
  if (o.timed) meta.push(`<span>${icon('clock')}${esc(fmtTime(o.time))}${o.shifted ? '*' : ''}</span>`);
  if (tk.dur) meta.push(`<span>${esc(fmtDur(tk.dur * MIN))}</span>`);
  if (isRecurring(tk)) meta.push(`<span title="${esc(repLabel(tk))}">${icon('repeat')}</span>`);
  if (tk.remind >= 0 && o.timed) meta.push(`<span>${icon('bell')}</span>`);
  if (o.carried) meta.push(`<span class="carried">${esc(t('fromDay', relDay(o.date, ui.today, addDays)))}</span>`);
  const flag = tk.prio ? `<span class="prio p${tk.prio}" title="${esc(t(`prio${tk.prio}`))}">${icon('flag')}</span>` : '';
  const ex = tk.example ? `<span class="ex">${esc(t('example'))}</span>` : '';
  return `<li class="task st-${st.s} ${o.carried ? 'is-carried' : ''}" data-key="${esc(o.key)}">
    <button class="chk c-${esc(tk.cat || 'other')}" data-act="toggle" aria-label="${esc(t('done'))}" aria-pressed="${st.s === 'done'}">${icon('check')}</button>
    <button class="task-main" data-act="open">
      <span class="task-t">${flag}${esc(tk.title)}${ex}</span>
      <span class="task-m">${meta.join('')}</span>
    </button>
    ${pillHTML(o, st, pastDay)}
  </li>`;
}

function ring(done, total, size = 76) {
  const r = size / 2 - 7;
  const c = 2 * Math.PI * r;
  const p = total ? done / total : 0;
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-bg"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="ring-fg" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p)).toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg><span class="ring-n num">${done}/${total}</span>`;
}

// ---------------------------------------------------------------- shell
const TABS = [['today', 'today', 'tabToday'], ['focus', 'focus', 'tabFocus'], ['log', 'log', 'tabLog'], ['settings', 'gear', 'tabSettings']];

export function renderShell() {
  document.documentElement.lang = lang();
  document.documentElement.dir = dir();
  const app = $('#app');
  app.innerHTML = `
    <main class="view" id="view"></main>
    <button class="fab" data-act="add" aria-label="${esc(t('add'))}">${icon('plus')}</button>
    <nav class="tabs" aria-label="${esc(t('app'))}">${TABS.map(([id, ic, label]) =>
      `<button class="tab" data-tab="${id}" aria-label="${esc(t(label))}">${icon(ic)}<span>${esc(t(label))}</span></button>`).join('')}</nav>
    <div class="scrim" data-act="sheet-close" hidden></div>
    <section class="sheet" role="dialog" aria-modal="true" hidden><div class="grab"></div><div class="sheet-in" id="sheet-in"></div></section>
    <div class="toasts" id="toasts" aria-live="polite"></div>`;
}

export function render() {
  const now = Date.now();
  ui.today = dkey(new Date(now));
  const view = $('#view');
  if (!view) return;
  const views = { today: viewToday, focus: viewFocus, log: viewLog, settings: viewSettings };
  view.innerHTML = (views[ui.tab] || viewToday)(now);
  view.dataset.view = ui.tab;
  for (const b of document.querySelectorAll('.tab')) b.classList.toggle('is-on', b.dataset.tab === ui.tab);
  const fab = $('.fab');
  if (fab) fab.hidden = ui.tab !== 'today';
  ui.statusSig = statusSignature(now);
  if (ui.sheet) refreshSheet();
}

/** Changes whenever any visible task changes status (so lists can be re-grouped). */
export function statusSignature(now) {
  const list = dayList(state, ui.date, ui.today);
  return list.map((o) => `${o.key}:${status(o, now).s}`).join(',') + `|${ui.today}`;
}

// ---------------------------------------------------------------- Today
function weekStrip() {
  const ws = state.settings.weekStart;
  let start = ui.date;
  while (weekday(start) !== ws) start = addDays(start, -1);
  const names = t('dayShort');
  let out = '';
  for (let i = 0; i < 7; i++) {
    const k = addDays(start, i);
    const n = scheduledOn(state, k).length + (k === ui.today ? dayList(state, k, ui.today).filter((o) => o.carried).length : 0);
    const d = parseKey(k).getDate();
    out += `<button class="wd ${k === ui.date ? 'is-sel' : ''} ${k === ui.today ? 'is-today' : ''}" data-day="${k}" aria-label="${esc(fmtDay(k))}">
      <span class="wd-n">${esc(names[weekday(k)])}</span><span class="wd-d num">${d}</span><i class="${n ? 'dot' : 'dot is-empty'}"></i></button>`;
  }
  return `<div class="week">
    <button class="wk-nav" data-act="week" data-step="-7" aria-label="prev">${icon(dir() === 'rtl' ? 'chevR' : 'chevL')}</button>
    <div class="wk-days">${out}</div>
    <button class="wk-nav" data-act="week" data-step="7" aria-label="next">${icon(dir() === 'rtl' ? 'chevL' : 'chevR')}</button>
  </div>`;
}

function hero(rows, now) {
  const total = rows.length;
  const done = rows.filter((r) => r.st.s === 'done').length;
  const over = rows.filter((r) => r.st.s === 'overdue');
  const next = rows.find((r) => r.st.s === 'soon' || r.st.s === 'upcoming');
  let main = '';
  let cls = '';
  if (next) {
    const o = next.o;
    cls = next.st.s === 'soon' ? 'is-soon' : '';
    main = `<span class="hero-k">${esc(t('nextUp'))}${over.length ? ` · <b class="hero-late">${esc(t('overdueCount', over.length))}</b>` : ''}</span>
      <button class="hero-t" data-act="open-key" data-key="${esc(o.key)}">${esc(o.task.title)}</button>
      <span class="hero-cd num" data-cd="${esc(o.key)}" data-due="${o.due}" data-s="${next.st.s}" data-hero="1">${esc(span(next.st.left, ` ${t('dayW')}`, ` ${t('hour')}`))}</span>
      <span class="hero-at">${esc(t('left'))} · ${esc(fmtTime(o.time))}</span>`;
  } else if (over.length) {
    const o = over[0].o;
    cls = 'is-late';
    main = `<span class="hero-k">${esc(t('overdueCount', over.length))}</span>
      <button class="hero-t" data-act="open-key" data-key="${esc(o.key)}">${esc(o.task.title)}</button>
      <span class="hero-cd num" data-cd="${esc(o.key)}" data-due="${o.due}" data-s="overdue" data-hero="1">${esc(span(over[0].st.by, ` ${t('dayW')}`, ` ${t('hour')}`))}</span>
      <span class="hero-at">${esc(t('late'))}</span>`;
  } else if (total && done === total) {
    cls = 'is-clear';
    main = `<span class="hero-k">${esc(t('progress', done, total))}</span><span class="hero-big">${esc(t('allClear'))}</span>`;
  } else {
    main = `<span class="hero-k">${esc(total ? t('progress', done, total) : t('emptyDay'))}</span><span class="hero-big">${esc(total ? t('nothingNext') : t('emptyHint'))}</span>`;
  }
  return `<section class="hero ${cls}"><div class="hero-main">${main}</div><div class="hero-ring">${ring(done, total)}</div></section>`;
}

function installBanner() {
  if (native || ui.installHidden || !state.settings.installHint) return '';
  if (window.top !== window.self) {
    // the one-page preview (build.mjs) runs inside a frame: say where the real app lives instead of how to install
    if (!window.__MIAAD_PREVIEW__) return '';
    return `<div class="banner">${icon('alert')}<div><b>${esc(t('previewTitle'))}</b><span>${esc(t('previewNote'))}</span></div>
      <button class="icon-btn" data-act="install-hide" aria-label="${esc(t('dismiss'))}">${icon('x')}</button></div>`;
  }
  const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (standalone) return '';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const how = ios ? t('installIOS') : t('installAndroid');
  return `<div class="banner">${icon('phone')}<div><b>${esc(t('install'))}</b><span>${esc(how)}</span></div>
    ${ui.installEvt ? `<button class="btn sm primary" data-act="install">${esc(t('installBtn'))}</button>` : ''}
    <button class="icon-btn" data-act="install-hide" aria-label="${esc(t('dismiss'))}">${icon('x')}</button></div>`;
}

function viewToday(now) {
  const isToday = ui.date === ui.today;
  const past = ui.date < ui.today;
  const list = dayList(state, ui.date, ui.today);
  const rows = sortOccs(list, now).map((x) => ({ o: x.o, st: x.st }));
  const groups = { overdue: [], upcoming: [], anytime: [], done: [] };
  for (const r of rows) {
    const g = r.st.s === 'soon' ? 'upcoming' : r.st.s;
    groups[g].push(r);
  }
  const title = relDay(ui.date, ui.today, addDays);
  const sub = fmtDay(ui.date);
  const hour = new Date(now).getHours();
  const greet = isToday ? `<span class="greet">${esc(hour < 12 ? t('greetMorning') : t('greetEvening'))}</span>` : '';
  const head = `<header class="bar">
      <div class="bar-title">${greet}<h1>${esc(title)}</h1><p class="sub">${esc(isToday ? sub : sub)}</p></div>
      ${isToday ? '' : `<button class="btn sm" data-act="go-today">${esc(t('today'))}</button>`}
    </header>`;
  const hasEx = state.tasks.some((x) => x.example && !x.deleted);
  const exBanner = hasEx ? `<div class="banner is-ex">${icon('sparkle')}<div><span>${esc(t('examples'))}</span></div>
    <button class="btn sm" data-act="clear-examples">${esc(t('clearExamples'))}</button></div>` : '';
  const warn = storageOk ? '' : `<div class="banner is-warn">${icon('alert')}<div><span>${esc(t('storageWarn'))}</span></div></div>`;
  const summary = isToday ? hero(rows, now) : dayCard(rows, past);
  const sec = (k, label, arr, extraCls = '') => (arr.length ? `<section class="group ${extraCls}">
      <h3 class="g-h">${esc(label)} <span class="num">${arr.length}</span></h3>
      <ul class="list">${arr.map((r) => taskRow(r.o, r.st, now, past)).join('')}</ul></section>` : '');
  const body = rows.length
    ? sec('overdue', past ? t('missedL') : t('sOverdue'), groups.overdue, 'is-overdue')
      + sec('upcoming', t('sUpcoming'), groups.upcoming)
      + sec('anytime', t('sAnytime'), groups.anytime)
      + sec('done', t('sDone'), groups.done, 'is-done')
    : `<div class="empty">${icon('today')}<p>${esc(t('emptyDay'))}</p><button class="btn primary" data-act="add">${icon('plus')}${esc(t('addTask'))}</button></div>`;
  return `${head}${weekStrip()}${warn}${installBanner()}${summary}${exBanner}${body}<div class="spacer"></div>`;
}

function dayCard(rows, past) {
  const total = rows.length;
  const done = rows.filter((r) => r.st.s === 'done').length;
  const text = total ? t('progress', done, total) : t('emptyDay');
  return `<section class="hero is-plain"><div class="hero-main"><span class="hero-k">${esc(fmtDay(ui.date))}</span>
    <span class="hero-big">${esc(text)}</span></div><div class="hero-ring">${ring(done, total)}</div></section>`;
}

// ---------------------------------------------------------------- Focus
function focusTasks() {
  const now = Date.now();
  return sortOccs(dayList(state, ui.today, ui.today), now).filter((x) => x.st.s !== 'done').map((x) => x.o);
}

function viewFocus(now) {
  const tm = state.timer;
  const s = state.settings;
  const mode = tm ? tm.mode : ui.focusMode;
  const len = tm ? tm.mins : (ui.focusLen || (mode === 'focus' ? s.focusMin : s.breakMin));
  const remaining = tm ? timerRemaining(now) : len * MIN;
  const total = (tm ? tm.mins : len) * MIN;
  const running = tm && tm.endsAt !== null;
  const occ = tm ? (tm.occ ? findOcc(tm.occ) : null) : (ui.focusPick ? findOcc(ui.focusPick) : null);
  const R = 118;
  const C = 2 * Math.PI * R;
  const lens = mode === 'focus' ? [15, 25, 45, 60, 90] : [5, 10, 15, 20];
  const todayFocus = daySummary(state, ui.today, now).focus;
  const sessions = (state.focus || []).filter((f) => dkey(new Date(f.at)) === ui.today).slice(-6).reverse();
  const tasks = focusTasks();
  const ctrl = !tm
    ? `<button class="btn primary big" data-act="timer-start">${icon('play')}${esc(t('start'))}</button>`
    : `${running
      ? `<button class="btn big" data-act="timer-pause">${icon('pause')}${esc(t('pause'))}</button>`
      : `<button class="btn primary big" data-act="timer-resume">${icon('play')}${esc(t('resume'))}</button>`}
       <button class="btn" data-act="timer-add">${esc(t('plus5'))}</button>
       <button class="btn danger-soft" data-act="timer-stop">${icon('stop')}${esc(t('stop'))}</button>`;
  return `<header class="bar"><div class="bar-title"><h1>${esc(t(mode === 'focus' ? 'focusTitle' : 'breakTitle'))}</h1>
      <p class="sub">${esc(t('focusToday'))}: <b class="num">${esc(fmtMins(todayFocus))}</b></p></div></header>
    <div class="seg" role="tablist">
      <button class="${mode === 'focus' ? 'is-on' : ''}" data-act="focus-mode" data-mode="focus" ${tm ? 'disabled' : ''}>${esc(t('focusTitle'))}</button>
      <button class="${mode === 'break' ? 'is-on' : ''}" data-act="focus-mode" data-mode="break" ${tm ? 'disabled' : ''}>${esc(t('breakTitle'))}</button>
    </div>
    <section class="dial ${mode === 'break' ? 'is-break' : ''} ${running ? 'is-running' : ''}">
      <svg viewBox="0 0 280 280" aria-hidden="true"><circle cx="140" cy="140" r="${R}" class="dial-bg"/>
        <circle cx="140" cy="140" r="${R}" class="dial-fg" id="dial-fg" stroke-dasharray="${C.toFixed(1)}"
          stroke-dashoffset="${(C * (1 - remaining / Math.max(total, 1))).toFixed(1)}" transform="rotate(-90 140 140)"/></svg>
      <div class="dial-c"><span class="dial-time num" id="dial-time">${esc(span(remaining))}</span>
        <span class="dial-sub">${esc(mode === 'break' ? t('breakTitle') : occ ? occ.task.title : t('focusNoTask'))}</span></div>
    </section>
    ${tm ? '' : `<div class="chips center">${lens.map((m) => `<button class="chip ${m === len ? 'is-on' : ''}" data-act="focus-len" data-min="${m}">${esc(fmtMins(m))}</button>`).join('')}</div>
    ${mode === 'break' ? '' : `<label class="field"><span class="f-l">${esc(t('pickTask'))}</span>
      <select class="in" data-act="focus-pick"><option value="">${esc(t('focusNoTask'))}</option>${tasks.map((o) =>
        `<option value="${esc(o.key)}" ${o.key === ui.focusPick ? 'selected' : ''}>${esc(o.task.title)}${o.timed ? ` · ${esc(fmtTime(o.time))}` : ''}</option>`).join('')}</select></label>`}`}
    <div class="dial-ctrl">${ctrl}</div>
    ${sessions.length ? `<section class="group"><h3 class="g-h">${esc(t('focusToday'))}</h3><ul class="plain">${sessions.map((f) => {
      const o = f.occ ? findOcc(f.occ) : null;
      return `<li><span class="num">${esc(fmtClock(f.at))}</span><span>${esc(o ? o.task.title : t('focusNoTask'))}</span><b class="num">${esc(fmtMins(f.mins))}</b></li>`;
    }).join('')}</ul></section>` : ''}
    <div class="spacer"></div>`;
}

// ---------------------------------------------------------------- Log
function chart(days) {
  const W = 340;
  const H = 150;
  const top = 16;
  const bottom = 24;
  const ph = H - top - bottom;
  const max = Math.max(1, ...days.map((d) => d.total));
  const band = W / days.length;
  const bw = Math.min(22, band * 0.56);
  const rtl = dir() === 'rtl';
  let out = '';
  days.forEach((d, i) => {
    const idx = rtl ? days.length - 1 - i : i;
    const x = idx * band + (band - bw) / 2;
    let y = top + ph;
    const segs = [['on', d.onTime], ['late', d.late], ['miss', d.missed], ['open', d.pending]];
    segs.forEach(([cls, v], si) => {
      if (!v) return;
      const h = (v / max) * ph;
      const isTop = !segs.slice(si + 1).some(([, w]) => w);
      const r = isTop ? Math.min(4, h) : 0;
      const y0 = y - h;
      out += `<path class="b-${cls}" d="M${x.toFixed(1)},${(y - 0).toFixed(1)}V${(y0 + r).toFixed(1)}${r ? `Q${x.toFixed(1)},${y0.toFixed(1)} ${(x + r).toFixed(1)},${y0.toFixed(1)}H${(x + bw - r).toFixed(1)}Q${(x + bw).toFixed(1)},${y0.toFixed(1)} ${(x + bw).toFixed(1)},${(y0 + r).toFixed(1)}` : `H${(x + bw).toFixed(1)}`}V${y.toFixed(1)}Z"/>`;
      y = y0 - (si < segs.length - 1 ? 0 : 0);
    });
    const nm = t('dayShort')[weekday(d.date)];
    out += `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 6}" class="ax ${d.date === ui.today ? 'is-today' : ''}">${esc(nm)}</text>`;
    if (d.total) out += `<text x="${(x + bw / 2).toFixed(1)}" y="${(top + ph - (d.total / max) * ph - 5).toFixed(1)}" class="vl num">${d.done}/${d.total}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('week'))}">
    <line x1="0" x2="${W}" y1="${top + ph + 0.5}" y2="${top + ph + 0.5}" class="base"/>${out}</svg>
    <div class="legend"><span><i class="b-on"></i>${esc(t('onTimeL'))}</span><span><i class="b-late"></i>${esc(t('lateL'))}</span>
    <span><i class="b-miss"></i>${esc(t('missedL'))}</span><span><i class="b-open"></i>${esc(t('pendingL'))}</span></div>`;
}

function viewLog(now) {
  const rs = rangeStats(state, ui.today, now, 7);
  const st = streak(state, ui.today, now);
  const pct = (v) => `${Math.round(v * 100)}%`;
  const kpis = [[t('completion'), pct(rs.rate)], [t('onTimeRate'), pct(rs.onTimeRate)], [t('streak'), String(st)], [t('focusWeek'), fmtMins(rs.focus)]];
  const cats = Object.entries(rs.cats).sort((a, b) => b[1].total - a[1].total);
  const f = ui.logFilter;
  const first = earliestDate(state);
  const days = [];
  for (let i = 0; i < 60; i++) {
    const k = addDays(ui.today, -i);
    if (k < first) break;
    const s = daySummary(state, k, now);
    let occs = s.occs.map((o) => ({ o, st: status(o, now) }));
    occs = occs.filter(({ o, st: x }) => {
      if (f === 'on') return x.s === 'done' && x.onTime;
      if (f === 'late') return x.s === 'done' && !x.onTime;
      if (f === 'miss') return x.s === 'overdue' && k < ui.today;
      return x.s === 'done' || k < ui.today || x.s === 'overdue';
    });
    if (!occs.length) continue;
    occs.sort((a, b) => a.o.due - b.o.due);
    days.push({ k, s, occs });
  }
  const rows = days.map(({ k, s, occs }) => `<section class="logday"><h3 class="g-h">${esc(relDay(k, ui.today, addDays))}
      <span class="num">${s.done}/${s.total}${s.total ? ` · ${Math.round(s.rate * 100)}%` : ''}</span></h3><ul class="plain log">${occs.map(({ o, st: x }) => {
    let res;
    let cls;
    if (x.s === 'done' && x.onTime) {
      res = `${t('doneOnTime')} · ${fmtClock(o.done.at)}`;
      cls = 'on';
    } else if (x.s === 'done') {
      res = t('doneLate', fmtDur(x.late));
      cls = 'late';
    } else if (k < ui.today) {
      res = t('missedL');
      cls = 'miss';
    } else {
      res = `${t('late')} ${fmtDur(x.by)}`;
      cls = 'late';
    }
    return `<li class="r-${cls}" data-key="${esc(o.key)}"><i class="st">${icon(cls === 'on' ? 'check' : cls === 'late' ? 'clock' : 'x')}</i>
      <span class="lt">${esc(o.task.title)}<small>${o.timed ? esc(fmtTime(o.time)) : esc(t('anytimeShort'))} · ${esc(catLabel(o.task.cat))}</small></span><b>${esc(res)}</b></li>`;
  }).join('')}</ul></section>`).join('');
  return `<header class="bar"><div class="bar-title"><h1>${esc(t('logTitle'))}</h1><p class="sub">${esc(t('week'))}</p></div></header>
    <section class="kpis">${kpis.map(([l, v]) => `<div class="kpi"><span>${esc(l)}</span><b class="num">${esc(v)}</b></div>`).join('')}</section>
    <section class="card">${chart(rs.days)}</section>
    ${cats.length ? `<section class="card"><h3 class="g-h">${esc(t('byCategory'))}</h3><ul class="cats">${cats.map(([c, v]) =>
      `<li><span class="cat c-${esc(c)}"><i></i>${esc(catLabel(c))}</span><span class="bar-track"><i class="c-${esc(c)}" style="width:${Math.round((v.done / Math.max(v.total, 1)) * 100)}%"></i></span><b class="num">${v.done}/${v.total}</b></li>`).join('')}</ul></section>` : ''}
    <div class="chips">${[['all', 'filterAll'], ['on', 'onTimeL'], ['late', 'lateL'], ['miss', 'missedL']].map(([k, l]) =>
      `<button class="chip ${f === k ? 'is-on' : ''}" data-act="log-filter" data-f="${k}">${esc(t(l))}</button>`).join('')}</div>
    ${rows || `<div class="empty">${icon('log')}<p>${esc(t('noHistory'))}</p></div>`}
    <div class="spacer"></div>`;
}

// ---------------------------------------------------------------- Settings
const ACCENTS = ['blue', 'teal', 'violet', 'orange', 'rose'];

function segRow(label, act, value, options) {
  return `<div class="row"><span class="r-l">${esc(label)}</span><div class="seg sm">${options.map(([v, l]) =>
    `<button class="${String(v) === String(value) ? 'is-on' : ''}" data-act="${act}" data-v="${esc(v)}">${esc(l)}</button>`).join('')}</div></div>`;
}

function remindOptions() {
  return [[-1, t('none')], [0, t('atTime')], [5, t('before', 5)], [10, t('before', 10)], [15, t('before', 15)], [30, t('before', 30)], [60, t('before', 60)]];
}

function viewSettings() {
  const s = state.settings;
  const notif = ui.notif === 'granted';
  const errs = getErrors();
  return `<header class="bar"><div class="bar-title"><h1>${esc(t('settingsTitle'))}</h1><p class="sub">${esc(t('app'))} ${VERSION}</p></div></header>
    <section class="card set">
      ${segRow(t('language'), 'set-lang', s.lang, [['ar', 'العربية'], ['en', 'English']])}
      ${segRow(t('appearance'), 'set-theme', s.theme, [['auto', t('themeAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]])}
      <div class="row"><span class="r-l">${esc(t('accent'))}</span><div class="swatches">${ACCENTS.map((a) =>
        `<button class="sw a-${a} ${s.accent === a ? 'is-on' : ''}" data-act="set-accent" data-v="${a}" aria-label="${a}"></button>`).join('')}</div></div>
      ${segRow(t('weekStart'), 'set-week', s.weekStart, [[6, t('dayNames')[6]], [0, t('dayNames')[0]], [1, t('dayNames')[1]]])}
    </section>
    <h3 class="g-h">${esc(t('notifications'))}</h3>
    <section class="card set">
      <div class="row"><span class="r-l">${esc(t('notifStatus'))}</span><span class="badge ${notif ? 'is-on' : ''}">${esc(notif ? t('notifOn') : t('notifOff'))}</span></div>
      <div class="row btns">${notif ? '' : `<button class="btn primary sm" data-act="notif-ask">${icon('bell')}${esc(t('notifAsk'))}</button>`}
        <button class="btn sm" data-act="notif-test">${esc(t('notifTest'))}</button></div>
      ${native && notif && !ui.exact ? `<div class="hint">${icon('alert')}<span>${esc(t('exactOff'))}</span><button class="btn sm" data-act="exact-fix">${esc(t('exactFix'))}</button></div>` : ''}
      ${native ? '' : `<p class="note">${esc(t('webNotifNote'))}</p>`}
      <label class="row"><span class="r-l">${esc(t('defaultRemind'))}</span><select class="in sm" data-act="set-remind">${remindOptions().map(([v, l]) =>
        `<option value="${v}" ${Number(s.remind) === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>
      <label class="row"><span class="r-l">${esc(t('nag'))}</span><input type="checkbox" class="sw-toggle" data-act="set-nag" ${s.nag ? 'checked' : ''}></label>
      <label class="row"><span class="r-l">${esc(t('sound'))}</span><input type="checkbox" class="sw-toggle" data-act="set-sound" ${s.sound ? 'checked' : ''}></label>
    </section>
    <h3 class="g-h">${esc(t('focusSettings'))}</h3>
    <section class="card set">
      <label class="row"><span class="r-l">${esc(t('focusLen'))}</span><select class="in sm" data-act="set-focus">${[15, 20, 25, 30, 45, 50, 60, 90].map((m) =>
        `<option value="${m}" ${s.focusMin === m ? 'selected' : ''}>${esc(fmtMins(m))}</option>`).join('')}</select></label>
      <label class="row"><span class="r-l">${esc(t('breakLen'))}</span><select class="in sm" data-act="set-break">${[3, 5, 10, 15, 20].map((m) =>
        `<option value="${m}" ${s.breakMin === m ? 'selected' : ''}>${esc(fmtMins(m))}</option>`).join('')}</select></label>
    </section>
    <h3 class="g-h">${esc(t('backup'))}</h3>
    <section class="card set">
      <p class="note">${esc(t(native ? 'backupNoteApp' : 'backupNote'))}</p>
      <div class="row btns wrap">
        ${native || window.top !== window.self ? '' : `<button class="btn sm" data-act="export-file">${icon('download')}${esc(t('exportFile'))}</button>`}
        <button class="btn sm" data-act="export-copy">${icon('copy')}${esc(t('exportCopy'))}</button>
        <label class="btn sm file">${icon('upload')}${esc(t('importFile'))}<input type="file" accept=".json,application/json,text/plain" data-act="import-file" hidden></label>
        <button class="btn sm" data-act="import-paste">${esc(t('importPaste'))}</button>
      </div>
    </section>
    <h3 class="g-h">${esc(t('about'))}</h3>
    <section class="card set">
      <div class="row"><span class="r-l">${esc(t('version'))}</span><span class="num">${VERSION}${native ? ' · Android' : ' · Web'}</span></div>
      <details class="row-d"><summary>${esc(t('diag'))} (${errs.length})</summary><pre class="diag">${esc(errs.join('\n') || t('noErrors'))}</pre></details>
    </section>
    <h3 class="g-h is-danger">${esc(t('danger'))}</h3>
    <section class="card set"><div class="row btns"><button class="btn danger sm" data-act="reset-ask">${icon('trash')}${esc(t('resetAll'))}</button></div></section>
    <div class="spacer"></div>`;
}

// ---------------------------------------------------------------- sheets
export function openSheet(sheet) {
  const wasOpen = !!ui.sheet;
  ui.sheet = sheet;
  const el = $('.sheet');
  const scrim = $('.scrim');
  refreshSheet();
  el.hidden = false;
  scrim.hidden = false;
  requestAnimationFrame(() => {
    el.classList.add('is-open');
    scrim.classList.add('is-open');
  });
  if (!wasOpen) {
    try {
      history.pushState({ sheet: 1 }, '');
    } catch (e) {
      /* ignore */
    }
  }
  const first = el.querySelector('[autofocus]');
  if (first && sheet.type === 'edit' && !sheet.id) setTimeout(() => first.focus(), 260);
}

export function closeSheet(fromHistory = false) {
  if (!ui.sheet) return false;
  ui.sheet = null;
  const el = $('.sheet');
  const scrim = $('.scrim');
  el.classList.remove('is-open');
  scrim.classList.remove('is-open');
  setTimeout(() => {
    if (!ui.sheet) {
      el.hidden = true;
      scrim.hidden = true;
      $('#sheet-in').innerHTML = '';
    }
  }, 220);
  if (!fromHistory) {
    try {
      if (history.state && history.state.sheet) history.back();
    } catch (e) {
      /* ignore */
    }
  }
  return true;
}

export function refreshSheet() {
  const s = ui.sheet;
  if (!s) return;
  const box = $('#sheet-in');
  const builders = { edit: sheetEdit, detail: sheetDetail, del: sheetDelete, snooze: sheetSnooze, paste: sheetPaste, reset: sheetReset };
  if (s.type === 'edit' && box.querySelector('form')) return; // keep what the user is typing
  box.innerHTML = (builders[s.type] || (() => ''))(s);
}

function chipRadios(name, value, options, cls = '') {
  return `<div class="chips ${cls}" role="radiogroup">${options.map(([v, l, extra = '']) =>
    `<label class="chip ${extra}"><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(value) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
}

function defaultTime(k) {
  if (k !== ui.today) return '09:00';
  const d = new Date(Date.now() + 60 * MIN);
  return `${pad(d.getHours())}:00`;
}

function sheetEdit(s) {
  const tk = s.id ? taskById(s.id) : null;
  const d = tk || {
    title: '', notes: '', date: s.date || ui.date, time: defaultTime(s.date || ui.date), dur: 0,
    remind: state.settings.remind, rep: { k: 'none', days: [] }, until: '', cat: 'personal', prio: 0,
  };
  const rep = (d.rep && d.rep.k) || 'none';
  const days = (d.rep && d.rep.days) || [weekday(d.date)];
  const names = t('dayShort');
  const order = [6, 0, 1, 2, 3, 4, 5];
  return `<form class="form" id="task-form" novalidate>
    <h2 class="s-h">${esc(tk ? t('edit') : t('add'))}</h2>
    <input class="in in-title" name="title" maxlength="140" placeholder="${esc(t('titlePh'))}" value="${esc(d.title)}" autocomplete="off" autofocus>
    <p class="err" id="err-title" hidden>${esc(t('needTitle'))}</p>
    <div class="grid2">
      <label class="field"><span class="f-l">${esc(t('date'))}</span><input class="in" type="date" name="date" value="${esc(d.date)}" required></label>
      <label class="field"><span class="f-l">${esc(t('time'))}</span><input class="in" type="time" name="time" value="${esc(d.time)}" ${d.time ? '' : 'disabled'}></label>
    </div>
    <label class="check"><input type="checkbox" name="notime" ${d.time ? '' : 'checked'}><span>${esc(t('noTime'))}</span></label>
    <div class="field"><span class="f-l">${esc(t('remind'))}</span>${chipRadios('remind', d.time ? d.remind : -1, remindOptions().map(([v, l]) => [v, esc(l)]))}</div>
    <div class="field"><span class="f-l">${esc(t('duration'))}</span>${chipRadios('dur', d.dur || 0, [[0, esc(t('none'))], [15, '15'], [30, '30'], [45, '45'], [60, '60'], [90, '90'], [120, '120']].map(([v, l]) => [v, v ? `${l} ${esc(t('min'))}` : l]))}</div>
    <div class="field"><span class="f-l">${esc(t('repeat'))}</span>${chipRadios('rep', rep, [['none', esc(t('rep_none'))], ['daily', esc(t('rep_daily'))], ['days', esc(t('rep_days'))], ['weekly', esc(t('rep_weekly'))]])}
      <div class="days-pick" ${rep === 'days' ? '' : 'hidden'}>${order.map((i) => `<label class="dchip"><input type="checkbox" name="days" value="${i}" ${days.includes(i) ? 'checked' : ''}><span>${esc(names[i])}</span></label>`).join('')}</div>
      <label class="field until" ${rep === 'none' ? 'hidden' : ''}><span class="f-l">${esc(t('until'))}</span><input class="in" type="date" name="until" value="${esc(d.until || '')}"></label>
    </div>
    <div class="field"><span class="f-l">${esc(t('category'))}</span>${chipRadios('cat', d.cat || 'personal', CATS.map((c) => [c, `<i class="dot c-${c}"></i>${esc(catLabel(c))}`]), 'catchips')}</div>
    <div class="field"><span class="f-l">${esc(t('priority'))}</span>${chipRadios('prio', d.prio || 0, [[0, esc(t('prio0'))], [1, esc(t('prio1'))], [2, esc(t('prio2'))]])}</div>
    <label class="field"><span class="f-l">${esc(t('notes'))}</span><textarea class="in" name="notes" rows="2" placeholder="${esc(t('notesPh'))}">${esc(d.notes || '')}</textarea></label>
    <div class="s-foot"><button type="button" class="btn" data-act="sheet-close">${esc(t('cancel'))}</button>
      <button type="submit" class="btn primary">${esc(t('save'))}</button></div>
  </form>`;
}

/** Read the editor form into task fields. */
export function readForm(form) {
  const fd = new FormData(form);
  const notime = !!fd.get('notime');
  const rep = fd.get('rep') || 'none';
  const days = fd.getAll('days').map(Number);
  const time = notime ? '' : (fd.get('time') || '');
  return {
    title: String(fd.get('title') || '').trim(),
    notes: String(fd.get('notes') || '').trim(),
    date: fd.get('date') || ui.date,
    time,
    dur: Number(fd.get('dur') || 0),
    remind: time ? Number(fd.get('remind')) : -1,
    rep: { k: rep, days: rep === 'days' ? (days.length ? days : [weekday(fd.get('date') || ui.date)]) : [] },
    until: rep === 'none' ? '' : (fd.get('until') || ''),
    cat: fd.get('cat') || 'other',
    prio: Number(fd.get('prio') || 0),
  };
}

function sheetDetail(s) {
  const o = findOcc(s.key);
  if (!o) return `<p class="note">—</p>`;
  const now = Date.now();
  const st = status(o, now);
  const tk = o.task;
  const when = [relDay(o.date, ui.today, addDays)];
  if (o.timed) when.push(fmtTime(o.time));
  if (tk.dur) when.push(fmtDur(tk.dur * MIN));
  const rl = repLabel(tk);
  const focusMins = focusFor(o.key);
  let big = '';
  if (st.s === 'done') {
    big = `<div class="d-cd is-done">${icon('check')}<span>${esc(st.onTime ? `${t('doneOnTime')} · ${fmtClock(o.done.at)}` : t('doneLate', fmtDur(st.late)))}</span></div>`;
  } else if (st.s === 'anytime') {
    big = `<div class="d-cd is-any"><span>${esc(t('anytime'))}</span></div>`;
  } else {
    const label = st.s === 'overdue' ? t('late') : t('left');
    const v = st.s === 'overdue' ? st.by : st.left;
    big = `<div class="d-cd is-${st.s}"><span class="pl">${esc(label)}</span><b class="num" data-cd="${esc(o.key)}" data-due="${o.due}" data-s="${st.s}" data-bare="1">${esc(span(v, ` ${t('dayW')}`, ` ${t('hour')}`))}</b></div>`;
  }
  const canTomorrow = !isRecurring(tk);
  return `<div class="detail" data-key="${esc(o.key)}">
    <div class="d-top"><span class="cat c-${esc(tk.cat || 'other')}"><i></i>${esc(catLabel(tk.cat))}</span>
      ${tk.prio ? `<span class="prio-t p${tk.prio}">${icon('flag')}${esc(t(`prio${tk.prio}`))}</span>` : ''}
      ${tk.example ? `<span class="ex">${esc(t('example'))}</span>` : ''}
      <button class="icon-btn" data-act="sheet-close" aria-label="${esc(t('close'))}">${icon('x')}</button></div>
    <h2 class="d-title">${esc(tk.title)}</h2>
    <p class="d-when">${esc(when.join(' · '))}${rl ? ` · ${icon('repeat')}${esc(rl)}` : ''}${o.carried ? ` · <span class="carried">${esc(t('fromDay', relDay(o.date, ui.today, addDays)))}</span>` : ''}</p>
    ${big}
    ${tk.notes ? `<p class="d-notes">${esc(tk.notes)}</p>` : ''}
    ${focusMins ? `<p class="d-focus">${icon('focus')}${esc(t('focusTitle'))}: <b class="num">${esc(fmtMins(focusMins))}</b></p>` : ''}
    <div class="d-actions">
      <button class="btn primary big" data-act="toggle">${icon(st.s === 'done' ? 'x' : 'check')}${esc(st.s === 'done' ? t('undo') : t('done'))}</button>
      ${st.s === 'done' ? '' : `<button class="btn" data-act="focus-task">${icon('focus')}${esc(t('startFocus'))}</button>`}
      ${st.s === 'done' ? '' : `<button class="btn" data-act="snooze-menu" ${canTomorrow || o.timed ? '' : 'disabled'}>${icon('snooze')}${esc(t('snooze'))}</button>`}
      <button class="btn" data-act="edit">${icon('edit')}${esc(t('edit'))}</button>
      <button class="btn danger-soft" data-act="delete-ask">${icon('trash')}${esc(t('delete'))}</button>
    </div></div>`;
}

function sheetDelete(s) {
  const o = findOcc(s.key);
  if (!o) return '';
  const rec = isRecurring(o.task);
  return `<div class="confirm" data-key="${esc(o.key)}"><h2 class="s-h">${esc(t('delAsk'))}</h2><p class="note">${esc(o.task.title)}</p>
    <div class="stack">${rec
      ? `<button class="btn" data-act="delete" data-scope="one">${esc(t('delOne'))}</button>
         <button class="btn" data-act="delete" data-scope="future">${esc(t('delFuture'))}</button>
         <button class="btn danger" data-act="delete" data-scope="all">${esc(t('delAll'))}</button>`
      : `<button class="btn danger" data-act="delete" data-scope="all">${esc(t('delete'))}</button>`}
      <button class="btn ghost" data-act="back-detail">${esc(t('cancel'))}</button></div></div>`;
}

function sheetSnooze(s) {
  const o = findOcc(s.key);
  if (!o) return '';
  const rec = isRecurring(o.task);
  return `<div class="confirm" data-key="${esc(o.key)}"><h2 class="s-h">${esc(t('snooze'))}</h2><p class="note">${esc(o.task.title)}</p>
    <div class="stack">
      <button class="btn" data-act="snooze" data-min="10">${esc(t('snooze10'))}</button>
      <button class="btn" data-act="snooze" data-min="60">${esc(t('snooze60'))}</button>
      ${rec ? '' : `<button class="btn" data-act="snooze" data-min="tomorrow">${esc(t('snoozeTomorrow'))}</button>`}
      <button class="btn ghost" data-act="back-detail">${esc(t('cancel'))}</button></div></div>`;
}

function sheetPaste() {
  return `<div class="confirm"><h2 class="s-h">${esc(t('importPaste'))}</h2>
    <textarea class="in mono" id="paste-box" rows="8" placeholder="${esc(t('pasteHere'))}"></textarea>
    <div class="s-foot"><button class="btn" data-act="sheet-close">${esc(t('cancel'))}</button><button class="btn primary" data-act="import-paste-go">${esc(t('restore'))}</button></div></div>`;
}

function sheetReset() {
  return `<div class="confirm"><h2 class="s-h">${esc(t('resetAll'))}</h2><p class="note">${esc(t('resetAsk'))}</p>
    <div class="s-foot"><button class="btn" data-act="sheet-close">${esc(t('cancel'))}</button><button class="btn danger" data-act="reset-go">${esc(t('yesDelete'))}</button></div></div>`;
}

// ---------------------------------------------------------------- toasts
export function toast(msg, action = null, ms = 4200) {
  const box = $('#toasts');
  if (!box) return;
  for (const old of box.querySelectorAll('.toast')) old.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="t-act">${esc(action.label)}</button>` : ''}`;
  if (action) {
    el.querySelector('.t-act').addEventListener('click', () => {
      action.fn();
      el.remove();
    });
  }
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-in'));
  setTimeout(() => {
    el.classList.remove('is-in');
    setTimeout(() => el.remove(), 260);
  }, ms);
}

// ---------------------------------------------------------------- live countdowns
/** Update every countdown in place; returns true if a status changed (caller re-renders). */
export function tickCountdowns(now) {
  let changed = false;
  for (const el of document.querySelectorAll('[data-cd]')) {
    const due = Number(el.dataset.due);
    const prev = el.dataset.s;
    let s;
    let v;
    if (now > due) {
      s = 'overdue';
      v = now - due;
    } else {
      v = due - now;
      s = prev === 'anytime' ? 'anytime' : v <= 15 * MIN ? 'soon' : 'upcoming';
    }
    if (s !== prev) changed = true;
    const txt = span(v, ` ${t('dayW')}`, ` ${t('hour')}`);
    if (el.dataset.bare || el.dataset.hero) {
      el.textContent = txt;
    } else {
      const b = el.querySelector('b');
      if (b) b.textContent = txt;
    }
  }
  const dt = $('#dial-time');
  if (dt && state.timer) {
    const rem = timerRemaining(now);
    dt.textContent = span(rem);
    const fg = $('#dial-fg');
    if (fg) {
      const C = 2 * Math.PI * 118;
      fg.setAttribute('stroke-dashoffset', (C * (1 - rem / Math.max(state.timer.mins * MIN, 1))).toFixed(1));
    }
  }
  return changed;
}

export { stamp };
