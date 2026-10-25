// Small stroke icon set (24x24, currentColor). Drawn for this app.
const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  bell: '<path d="M6.5 16.5h11l-1.3-1.8V10a4.2 4.2 0 0 0-8.4 0v4.7z"/><path d="M10.3 19a1.9 1.9 0 0 0 3.4 0"/>',
  repeat: '<path d="M4.5 11V9.5A3.5 3.5 0 0 1 8 6h10.5"/><path d="M16 3.5L18.5 6 16 8.5"/><path d="M19.5 13v1.5A3.5 3.5 0 0 1 16 18H5.5"/><path d="M8 15.5L5.5 18 8 20.5"/>',
  today: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/><circle cx="12" cy="15" r="1.6" fill="currentColor" stroke="none"/>',
  focus: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9.5V13l2.2 1.6M10 3.5h4M12 3.5v2"/>',
  log: '<path d="M5 19.5V11M10 19.5V5M15 19.5v-6M20 19.5V8.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5l1.6 2.2 2.7-.5.6 2.7 2.4 1.3-1 2.5 1 2.5-2.4 1.3-.6 2.7-2.7-.5L12 20.5l-1.6-2.2-2.7.5-.6-2.7-2.4-1.3 1-2.5-1-2.5 2.4-1.3.6-2.7 2.7.5z"/>',
  chevL: '<path d="M14.5 6l-6 6 6 6"/>',
  chevR: '<path d="M9.5 6l6 6-6 6"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7"/>',
  edit: '<path d="M14.5 5.5l4 4L9 19H5v-4z"/>',
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>',
  pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/>',
  snooze: '<circle cx="12" cy="13" r="7.5"/><path d="M9.5 10.5h5l-5 5h5M4 5.5l3-2.5M20 5.5l-3-2.5"/>',
  flag: '<path d="M6 20.5V4.5M6 5h10.5l-2 3.5 2 3.5H6"/>',
  alert: '<path d="M12 4l9 15.5H3z"/><path d="M12 10v4M12 16.8v.2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z"/>',
  download: '<path d="M12 4.5v11M7.5 11l4.5 4.5 4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15.5v-11M7.5 9L12 4.5 16.5 9M5 19.5h14"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M5.5 15.5h-1v-11h11v1"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.2"/>',
  phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
  sparkle: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/>',
};

export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
