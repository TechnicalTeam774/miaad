(function () {
  // runs before the first paint: saved theme, accent and language, so the page never flashes the wrong look.
  // "auto" sets no data-theme: the stylesheet then follows the system setting.
  try {
    var s = JSON.parse(localStorage.getItem('miaad.v1') || '{}').settings || {};
    var r = document.documentElement;
    if (s.theme === 'dark' || s.theme === 'light') r.setAttribute('data-theme', s.theme);
    r.setAttribute('data-accent', s.accent || 'blue');
    if (s.lang === 'en') { r.setAttribute('lang', 'en'); r.setAttribute('dir', 'ltr'); }
  } catch (e) {}
})();
