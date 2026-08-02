/* IronLog — shared utilities. Loaded first; every module may rely on U. */
(function () {
  'use strict';

  const U = {};

  U.LB_PER_KG = 2.2046226218;

  /* ---------- DOM ---------- */

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  U.el = function (html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };

  U.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // Delegated event listener: U.on(root, 'click', '.btn', (e, matchedEl) => {})
  U.on = function (root, evt, sel, fn) {
    root.addEventListener(evt, function (e) {
      const m = e.target.closest(sel);
      if (m && root.contains(m)) fn(e, m);
    });
  };

  /* ---------- ids ---------- */

  U.uid = function (prefix) {
    const s = Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 8);
    return (prefix ? prefix + '_' : '') + s;
  };

  /* ---------- dates (local timezone, 'YYYY-MM-DD') ---------- */

  U.dateToStr = function (d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + day;
  };

  U.todayStr = () => U.dateToStr(new Date());

  U.strToDate = function (s) {
    const p = s.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]); // local midnight
  };

  U.addDays = function (str, n) {
    const d = U.strToDate(str);
    d.setDate(d.getDate() + n);
    return U.dateToStr(d);
  };

  // Monday-based week start
  U.weekStart = function (str) {
    const d = U.strToDate(str);
    const dow = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
    d.setDate(d.getDate() - dow);
    return U.dateToStr(d);
  };

  U.daysBetween = function (a, b) {
    return Math.round((U.strToDate(b) - U.strToDate(a)) / 86400000);
  };

  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const WDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  U.fmtDate = function (str) {
    const d = U.strToDate(str);
    return MONTHS[d.getMonth()] + ' ' + d.getDate();
  };

  U.fmtDateLong = function (str) {
    const d = U.strToDate(str);
    const yr = d.getFullYear() === new Date().getFullYear() ? '' : ', ' + d.getFullYear();
    return WDAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + yr;
  };

  U.relDate = function (str) {
    const today = U.todayStr();
    if (str === today) return 'Today';
    if (str === U.addDays(today, -1)) return 'Yesterday';
    return U.fmtDate(str);
  };

  U.fmtDuration = function (min) {
    if (!min && min !== 0) return '';
    min = Math.round(min);
    if (min < 60) return min + ' min';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return m ? h + 'h ' + m + 'm' : h + 'h';
  };

  /* ---------- numbers & units ---------- */

  U.round1 = (n) => Math.round(n * 10) / 10;

  U.fmtNum = function (n) {
    if (n === null || n === undefined || isNaN(n)) return '0';
    const abs = Math.abs(n);
    if (abs >= 1000000) return U.round1(n / 1000000) + 'M';
    if (abs >= 10000) return U.round1(n / 1000) + 'k';
    return Math.round(n).toLocaleString('en-US');
  };

  U.kgToDisplay = function (kg, units) {
    const v = units === 'lb' ? kg * U.LB_PER_KG : kg;
    return U.round1(v);
  };

  U.displayToKg = function (v, units) {
    const n = parseFloat(v);
    if (isNaN(n)) return 0;
    return units === 'lb' ? n / U.LB_PER_KG : n;
  };

  U.unitLabel = (units) => (units === 'lb' ? 'lb' : 'kg');

  U.clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  /* ---------- collections ---------- */

  U.groupBy = function (arr, fn) {
    const out = {};
    for (const x of arr) {
      const k = typeof fn === 'function' ? fn(x) : x[fn];
      (out[k] || (out[k] = [])).push(x);
    }
    return out;
  };

  U.sum = function (arr, fn) {
    let s = 0;
    for (const x of arr) s += fn ? fn(x) : x;
    return s;
  };

  U.debounce = function (fn, ms) {
    let t = null;
    return function () {
      const args = arguments;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  };

  /* ---------- files ---------- */

  U.download = function (filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  U.readFileText = function (file) {
    return new Promise(function (resolve, reject) {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsText(file);
    });
  };

  window.U = U;
})();
