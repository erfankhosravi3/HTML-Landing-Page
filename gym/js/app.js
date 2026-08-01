/* IronLog — App shell: router, chrome, overlays, onboarding, settings, profiles.
   Attaches window.App. Views register themselves via App.registerView(). */
(function () {
  'use strict';

  const App = {};

  /* ======================================================================
     Icons — inline 24×24 stroke SVGs (stroke currentColor, 1.8, round caps)
     ====================================================================== */

  function svg(inner) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" ' +
      'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
  }

  const icons = {
    // activity rings / pulse
    dashboard: svg('<path d="M12 3.5a8.5 8.5 0 1 1-8.5 8.5"/><path d="M12 7.75a4.25 4.25 0 1 1-4.25 4.25"/>'),
    // dumbbell
    log: svg('<path d="M6.3 7.7v8.6M3.4 9.7v4.6M17.7 7.7v8.6M20.6 9.7v4.6M6.3 12h11.4"/>'),
    // calendar-clock
    history: svg('<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/><path d="M12 12v2.6l1.9 1.1"/>'),
    // open book
    library: svg('<path d="M12 6.5c-1.4-1.6-3.6-2.3-6-2.3-1 0-1.9.1-2.7.4v14.2c.8-.3 1.7-.4 2.7-.4 2.4 0 4.6.7 6 2.3 1.4-1.6 3.6-2.3 6-2.3 1 0 1.9.1 2.7.4V4.6c-.8-.3-1.7-.4-2.7-.4-2.4 0-4.6.7-6 2.3Z"/><path d="M12 6.5v14.2"/>'),
    // bar chart
    analytics: svg('<path d="M4 20.5h16"/><path d="M7 20.5v-6.5M12 20.5V4.5M17 20.5V10"/>'),
    // body / person
    body: svg('<circle cx="12" cy="5" r="2.6"/><path d="M12 8.6v5.6M12 14.2l-3.2 6.6M12 14.2l3.2 6.6M5.8 11.2 12 9.3l6.2 1.9"/>'),
    // two people
    users: svg('<circle cx="9" cy="8.2" r="3.2"/><path d="M3.6 20c.5-3.3 2.7-5.1 5.4-5.1s4.9 1.8 5.4 5.1"/><path d="M15.4 5.5a3.2 3.2 0 0 1 0 5.4M17.4 15.5c1.7.8 2.8 2.3 3 4.5"/>'),
    // gear
    settings: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.5M12 18.7v2.5M21.2 12h-2.5M5.3 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3 5.5 5.5"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    trash: svg('<path d="M4 7h16M9.5 7V5.2A1.7 1.7 0 0 1 11.2 3.5h1.6a1.7 1.7 0 0 1 1.7 1.7V7"/><path d="M6 7l.9 12.4a1.8 1.8 0 0 0 1.8 1.6h6.6a1.8 1.8 0 0 0 1.8-1.6L18 7"/><path d="M10 11v6M14 11v6"/>'),
    edit: svg('<path d="M4 20h4.2L20.3 7.9a2.1 2.1 0 0 0-3-3L5.2 17v3"/><path d="M14.6 6.6l2.9 2.9"/>'),
    close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
    chevron: svg('<path d="M9 6l6 6-6 6"/>'),
    // stopwatch
    timer: svg('<circle cx="12" cy="13.5" r="7.2"/><path d="M12 10v3.7l2.3 1.5M9.6 2.7h4.8M12 2.7v3.6"/>'),
    trophy: svg('<path d="M8 3.5h8V9a4 4 0 0 1-8 0V3.5Z"/><path d="M8 5H4.8v1.3A3.1 3.1 0 0 0 8 9.4M16 5h3.2v1.3A3.1 3.1 0 0 1 16 9.4"/><path d="M12 13v4.5M8.5 20.5h7M9.8 20.5c0-2 .9-3 2.2-3s2.2 1 2.2 3"/>'),
    flame: svg('<path d="M12 21c3.8 0 6.4-2.5 6.4-6 0-2.4-1.2-4.5-2.9-6.2-.3 1-.9 1.9-1.8 2.5.3-2.7-1-5.6-3.6-7.6.3 3-1 4.6-2.4 6.2C6.4 11.4 5.6 13 5.6 15c0 3.5 2.6 6 6.4 6Z"/>'),
    heart: svg('<path d="M12 20.4S4.2 15.6 4.2 9.9C4.2 7.2 6.1 5.2 8.6 5.2c1.5 0 2.8.7 3.4 1.9.6-1.2 1.9-1.9 3.4-1.9 2.5 0 4.4 2 4.4 4.7 0 5.7-7.8 10.5-7.8 10.5Z"/>'),
    // circular sync arrows
    sync: svg('<path d="M4.5 12a7.5 7.5 0 0 1 13-5.1L19.5 9"/><path d="M19.5 4.5V9H15"/><path d="M19.5 12a7.5 7.5 0 0 1-13 5.1L4.5 15"/><path d="M4.5 19.5V15H9"/>'),
    // apple fruit + leaf
    apple: svg('<path d="M12 7.8c-1-.9-2.4-1.3-3.7-1C5.7 7.4 4.2 10 4.9 13.1c.8 3.6 3 6.7 5.4 6.7.8 0 1.2-.5 1.7-.5s.9.5 1.7.5c2.4 0 4.6-3.1 5.4-6.7.7-3.1-.8-5.7-3.4-6.3-1.3-.3-2.7.1-3.7 1Z"/><path d="M12 7.8c-.1-2 1.1-3.6 3-4.1"/>'),
    search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8 21 21"/>'),
    check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    copy: svg('<rect x="9" y="9" width="11.5" height="11.5" rx="2"/><path d="M5.5 15h-.7A1.8 1.8 0 0 1 3 13.2V4.8A1.8 1.8 0 0 1 4.8 3h8.4A1.8 1.8 0 0 1 15 4.8v.7"/>'),
    download: svg('<path d="M12 3.5V15M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15"/>'),
    upload: svg('<path d="M12 15.5V4M7.5 8.5 12 4l4.5 4.5M4.5 19.5h15"/>'),
    info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11.2v4.8M12 7.9v.2"/>'),
    templates: svg('<rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8.5h8M8 12.5h8M8 16.5h4.5"/>'),
    calendar: svg('<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/>'),
    // ---- v2 (Capability P1) icons ----
    // runner
    run: svg('<circle cx="14.2" cy="4.8" r="1.9"/><path d="M13.4 8.3 9.8 10.6l1.6 3.2-4 6.4"/><path d="M11.4 13.8l4 1.6 1.2 4.8"/><path d="M13.4 8.3l3.3 2.6 3.1-.9"/><path d="M9.8 10.6 6.4 9.5"/>'),
    // backpack
    ruck: svg('<path d="M7.2 8.2h9.6a2.4 2.4 0 0 1 2.4 2.4v8a2.4 2.4 0 0 1-2.4 2.4H7.2a2.4 2.4 0 0 1-2.4-2.4v-8a2.4 2.4 0 0 1 2.4-2.4Z"/><path d="M9 8.2V6.4a3 3 0 0 1 6 0v1.8"/><path d="M4.8 13.4h14.4M9.6 13.4v2.8M14.4 13.4v2.8"/>'),
    // swimmer + waves
    swim: svg('<circle cx="16.2" cy="7" r="1.8"/><path d="M4.5 13.2l5.7-3.9 4 3.1"/><path d="M3 18.2c1.5-1.3 3-1.3 4.5 0s3 1.3 4.5 0 3-1.3 4.5 0 3 1.3 4.5 0"/>'),
    // bicycle
    bike: svg('<circle cx="6.3" cy="16.3" r="3.4"/><circle cx="17.7" cy="16.3" r="3.4"/><path d="M6.3 16.3 9.8 9h5.2l2.7 7.3"/><path d="M9.8 9l3.4 7.3H6.3"/><path d="M14.2 6.4h2.4"/>'),
    // rower on a rail
    row: svg('<circle cx="18.6" cy="6.6" r="1.7"/><path d="M3.4 18.6h17.2"/><path d="M6 15.6h3.4l2.2-2.8 4.6 1 1.6-3.4"/><path d="M8.6 15.6l-1.2 3M13.6 13.6l1 5"/>'),
    // stair steps
    stairs: svg('<path d="M4 20h4v-4h4v-4h4V8h4"/>'),
    // person stretching, arms in an arc
    stretch: svg('<circle cx="12" cy="4.4" r="2"/><path d="M12 7.6v6.2M12 13.8l-4.4 6M12 13.8l4.4 6"/><path d="M4.6 8.4c2.2 2 4.7 3 7.4 3s5.2-1 7.4-3"/>'),
    // folded map
    roadmap: svg('<path d="M9 4.5 3.8 6.3v13.2L9 17.7l6 1.8 5.2-1.8V4.5L15 6.3 9 4.5Z"/><path d="M9 4.5v13.2M15 6.3v13.2"/>'),
    // shield + check
    shield: svg('<path d="M12 3.2l7 2.6v5.6c0 4.5-2.9 8.2-7 9.4-4.1-1.2-7-4.9-7-9.4V5.8l7-2.6Z"/><path d="M9.2 12l2 2 3.6-3.8"/>'),
    // clipboard (tests)
    clipboard: svg('<rect x="5.2" y="4.2" width="13.6" height="16.8" rx="2.4"/><path d="M9.2 4.2a2.8 2.8 0 0 1 5.6 0"/><path d="M8.8 11h6.4M8.8 15h4.2"/>'),
    // warning triangle
    alert: svg('<path d="M12 4.2 21.2 20H2.8L12 4.2Z"/><path d="M12 10.4v4.2M12 17.2v.2"/>'),
    // notebook
    journal: svg('<rect x="4.8" y="3.6" width="14.4" height="16.8" rx="2.4"/><path d="M8.8 3.6v16.8M12.4 8.4h3.6M12.4 12h3.6"/>')
  };
  // aliases used across modules
  icons.pencil = icons.edit;
  icons.x = icons.close;
  icons.gear = icons.settings;
  icons.leaderboard = icons.trophy;
  icons.cardio = icons.run;
  icons.mobility = icons.stretch;
  icons.durability = icons.shield;
  icons.test = icons.clipboard;
  icons.circuit = icons.flame;

  App.icons = icons;

  /* ======================================================================
     View registry + router
     ====================================================================== */

  const views = {};           // id -> {title, icon, render, nav, order}
  const scrollPos = {};       // viewId -> scrollY
  App.current = { view: 'dashboard', params: {} };

  App.registerView = function (id, def) {
    views[id] = {
      title: def.title || id,
      icon: def.icon || icons.dashboard,
      render: def.render || function () {},
      nav: !!def.nav,
      order: typeof def.order === 'number' ? def.order : 99,
      // v2 (P2): optional predicate — nav re-evaluates it on every render and
      // navigating to a view whose predicate is false lands on the dashboard.
      // Views without visible() behave exactly as before.
      visible: typeof def.visible === 'function' ? def.visible : null
    };
  };

  function viewVisible(id) {
    const v = views[id];
    if (!v) return false;
    if (!v.visible) return true;
    try { return !!v.visible(); } catch (e) { return false; }
  }

  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const qi = raw.indexOf('?');
    const id = (qi >= 0 ? raw.slice(0, qi) : raw) || 'dashboard';
    const params = {};
    if (qi >= 0) {
      raw.slice(qi + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        const eq = kv.indexOf('=');
        const k = eq >= 0 ? kv.slice(0, eq) : kv;
        const v = eq >= 0 ? kv.slice(eq + 1) : '';
        try { params[decodeURIComponent(k)] = decodeURIComponent(v); }
        catch (e) { params[k] = v; }
      });
    }
    return { view: id, params: params };
  }

  function hashFor(id, params) {
    let h = '#/' + id;
    if (params) {
      const parts = [];
      for (const k in params) {
        if (params[k] === undefined || params[k] === null) continue;
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
      }
      if (parts.length) h += '?' + parts.join('&');
    }
    return h;
  }

  let navViaApi = false;

  App.navigate = function (id, params) {
    const h = hashFor(id, params);
    if (location.hash === h) { render(); return; }
    // Leaving a view: stale sheets/modals must not survive the switch. Close
    // synchronously so sheets opened right after (post-save check-in) stay up.
    overlayStack.slice().forEach(function (o) { o.close(); });
    navViaApi = true;
    location.hash = h; // hashchange handler renders
  };

  function onHashChange() {
    scrollPos[App.current.view] = window.scrollY;
    closeUserMenu(); // stale popover must not survive navigation
    if (!navViaApi) overlayStack.slice().forEach(function (o) { o.close(); }); // browser back/forward
    navViaApi = false;
    render();
    const y = scrollPos[App.current.view] || 0;
    requestAnimationFrame(function () { window.scrollTo(0, y); });
  }

  /* ======================================================================
     Render core
     ====================================================================== */

  let chromeHidden = null;

  function setChromeHidden(hide) {
    if (chromeHidden === hide) return;
    chromeHidden = hide;
    const app = U.$('#app');
    ['#topbar', '#sidebar', '#tabbar'].forEach(function (sel) {
      const el = U.$(sel);
      if (el) el.style.display = hide ? 'none' : '';
    });
    if (app) {
      app.style.paddingLeft = hide ? '0' : '';
      app.style.paddingBottom = hide ? '0' : '';
    }
  }

  function render() {
    const content = U.$('#content');
    if (!content) return;

    if (!Store.state.users.length) {
      App.current = { view: 'onboarding', params: {} };
      document.title = 'Welcome · IronLog';
      setChromeHidden(true);
      renderOnboarding(content);
      return;
    }
    setChromeHidden(false);

    const route = parseHash();
    let def = views[route.view];
    // unknown view OR a view hidden by its visible() predicate → dashboard.
    // Also correct the URL so the stale hash (e.g. '#/standards' after a
    // switch to a simple-mode user) doesn't linger — replaceState never fires
    // hashchange, so this cannot re-enter render().
    if (!def || !viewVisible(route.view)) {
      route.view = 'dashboard'; route.params = {}; def = views.dashboard;
      if (location.hash && location.hash !== '#/dashboard') {
        try { history.replaceState(null, '', '#/dashboard'); } catch (e) { /* file:// or sandboxed */ }
      }
    }
    App.current = { view: route.view, params: route.params };
    document.title = (def ? def.title + ' · ' : '') + 'IronLog';

    content.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'view';
    content.appendChild(wrap);
    if (def) {
      try {
        def.render(wrap, route.params);
      } catch (e) {
        if (window.console && console.error) console.error('View "' + route.view + '" failed:', e);
        wrap.innerHTML = '<div class="empty">' + icons.info +
          '<h3>Something went wrong</h3><p>This view hit an error. Try another tab.</p></div>';
      }
    } else {
      wrap.innerHTML = '<div class="empty">' + icons.dashboard +
        '<h3>Nothing here yet</h3><p>No views are registered. Check the script tags in index.html.</p></div>';
    }
    updateChrome();
  }

  /* App.rerender re-renders the current view in place, preserving scroll and
     (best-effort) focus. It is auto-wired to Store.subscribe with one guard:
     while the user is typing in an input inside #content on the 'log' view we
     skip the auto rerender entirely — the log view owns its DOM during set
     entry and a rerender would destroy the focused input mid-keystroke. */
  App.rerender = function () {
    const content = U.$('#content');
    const y = window.scrollY;
    const ae = document.activeElement;
    let focusId = null, selStart = null, selEnd = null;
    if (ae && ae.id && content && content.contains(ae)) {
      focusId = ae.id;
      try { selStart = ae.selectionStart; selEnd = ae.selectionEnd; } catch (e) { /* not a text input */ }
    }
    render();
    window.scrollTo(0, y);
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el && el.focus) {
        el.focus();
        if (selStart !== null && selStart !== undefined) {
          try { el.setSelectionRange(selStart, selEnd); } catch (e) { /* ignore */ }
        }
      }
    }
  };

  const scheduleRerender = U.debounce(function () {
    const content = U.$('#content');
    const ae = document.activeElement;
    if (App.current.view === 'log' && ae && content && content.contains(ae) &&
        /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) {
      updateChrome(); // keep chrome fresh (fab dot, avatar) without touching the view
      return;
    }
    App.rerender();
  }, 60);

  /* ======================================================================
     Units + weight formatting
     ====================================================================== */

  App.units = function () {
    const u = window.Store && Store.currentUser && Store.currentUser();
    return (u && u.settings && u.settings.units) === 'kg' ? 'kg' : 'lb';
  };

  // v2 mode gate: performance mode unlocks cardio/ruck logging, guardrails,
  // the pain log and goal tracking. Default ('simple') keeps the v1 UI.
  App.isPerformance = function () {
    const u = window.Store && Store.currentUser && Store.currentUser();
    return !!(u && u.settings && u.settings.trainingProfile === 'performance');
  };

  App.fmtWeight = function (kg, opts) {
    const units = App.units();
    const v = U.kgToDisplay(kg || 0, units);
    const precise = opts && opts.precise;
    const n = precise ? U.round1(v) : Math.round(v);
    const s = precise ? String(n) : n.toLocaleString('en-US');
    return s + ' ' + U.unitLabel(units);
  };

  /* ======================================================================
     Toasts
     ====================================================================== */

  App.toast = function (msg, kind) {
    const wrap = U.$('#toast-wrap');
    if (!wrap) return;
    kind = kind === 'ok' || kind === 'err' ? kind : 'info';
    const icon = kind === 'ok' ? icons.check : kind === 'err' ? icons.close : icons.info;
    const t = U.el('<div class="toast' + (kind !== 'info' ? ' ' + kind : '') + '">' +
      icon + '<span>' + U.esc(msg) + '</span></div>');
    wrap.appendChild(t);
    while (wrap.children.length > 3) wrap.firstElementChild.remove();
    setTimeout(function () {
      t.classList.add('leaving');
      setTimeout(function () { t.remove(); }, 220);
    }, 2600);
  };

  /* ======================================================================
     Overlays — modal / sheet / confirm
     ====================================================================== */

  const overlayStack = [];

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlayStack.length) {
      e.preventDefault();
      e.stopPropagation();
      overlayStack[overlayStack.length - 1].close();
    }
  });

  function openOverlay(opts, cls) {
    opts = opts || {};
    const isSheet = cls === 'sheet';
    const backdrop = U.el('<div class="modal-backdrop' + (isSheet ? ' sheet-backdrop' : '') + '" role="dialog" aria-modal="true"></div>');
    const box = document.createElement('div');
    box.className = cls;

    const head = U.el('<div class="' + cls + '-head"><h3 class="modal-title">' + U.esc(opts.title || '') + '</h3></div>');
    const closeBtn = U.el('<button type="button" class="btn icon ghost" aria-label="Close">' + icons.close + '</button>');
    head.appendChild(closeBtn);
    box.appendChild(head);

    const body = document.createElement('div');
    body.className = cls + '-body';
    if (opts.content instanceof Element) body.appendChild(opts.content);
    else body.innerHTML = opts.content || '';
    box.appendChild(body);

    const prevFocus = document.activeElement;
    let closed = false;
    const api = {
      el: backdrop,
      close: function () {
        if (closed) return;
        closed = true;
        const i = overlayStack.indexOf(api);
        if (i >= 0) overlayStack.splice(i, 1);
        if (!overlayStack.length) document.body.style.overflow = '';
        backdrop.classList.add('closing');
        setTimeout(function () { backdrop.remove(); }, 160);
        if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* gone */ } }
        if (typeof opts.onClose === 'function') opts.onClose();
      }
    };

    if (Array.isArray(opts.actions) && opts.actions.length) {
      const foot = document.createElement('div');
      foot.className = cls + '-foot';
      opts.actions.forEach(function (a) {
        const kindCls = a.kind === 'primary' ? ' primary' : a.kind === 'danger' ? ' danger' : a.kind === 'ghost' ? ' ghost' : '';
        const b = U.el('<button type="button" class="btn' + kindCls + '"></button>');
        b.textContent = a.label || 'OK';
        b.addEventListener('click', function () {
          if (closed) return; // fading out (160ms) — ignore double-taps, onClick isn't idempotent
          if (typeof a.onClick === 'function') a.onClick(api);
          if (!a.keepOpen) api.close();
        });
        foot.appendChild(b);
      });
      box.appendChild(foot);
    }

    backdrop.appendChild(box);
    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) api.close();
    });
    closeBtn.addEventListener('click', api.close);

    document.body.appendChild(backdrop);
    document.body.style.overflow = 'hidden'; // lock page scroll while any overlay is open
    overlayStack.push(api);

    // focus the first sensible control inside — unless the caller's content
    // script already focused something in the box (an explicit focus wins)
    const first = box.querySelector('input, select, textarea, .modal-foot .btn.primary, .sheet-foot .btn.primary') || closeBtn;
    requestAnimationFrame(function () {
      if (box.contains(document.activeElement)) return;
      try { first.focus(); } catch (e) { /* ignore */ }
    });

    return api;
  }

  App.modal = function (opts) { return openOverlay(opts, 'modal'); };
  App.sheet = function (opts) { return openOverlay(opts, 'sheet'); };

  let confirmOpen = false;

  App.confirm = function (opts) {
    opts = opts || {};
    if (confirmOpen) return Promise.resolve(false); // only one confirm at a time
    confirmOpen = true;
    return new Promise(function (resolve) {
      let result = false;
      openOverlay({
        title: opts.title || 'Are you sure?',
        content: '<p class="text-2" style="font-size:14px;line-height:1.55;margin:4px 0 8px">' +
          U.esc(opts.message || '') + '</p>',
        actions: [
          { label: 'Cancel', kind: 'ghost' },
          {
            label: opts.confirmLabel || (opts.danger ? 'Delete' : 'Confirm'),
            kind: opts.danger ? 'danger' : 'primary',
            onClick: function () { result = true; }
          }
        ],
        onClose: function () { confirmOpen = false; resolve(result); }
      }, 'modal');
    });
  };

  /* ======================================================================
     Chrome — topbar / sidebar / tabbar
     ====================================================================== */

  const TABS = ['dashboard', 'history', 'analytics', 'library']; // + center fab

  function wordmarkHTML() {
    return '<span class="wordmark">Iron<span class="accent">Log</span></span>';
  }

  function buildChrome() {
    // ---- topbar ----
    const topbar = U.$('#topbar');
    topbar.innerHTML =
      '<a class="topbar-title" href="#/dashboard" style="display:flex;align-items:center;gap:8px;color:inherit;text-decoration:none">' +
        '<span style="color:var(--accent);display:inline-flex">' + icons.log + '</span>' +
        wordmarkHTML() +
      '</a>' +
      '<div class="topbar-actions">' +
        '<button type="button" class="btn icon ghost" id="sync-btn" title="Sync is off" aria-label="Sync status">' +
          '<span class="sync-dot off" id="sync-dot"></span>' +
        '</button>' +
        '<button type="button" class="avatar" id="user-btn" aria-label="Switch profile" aria-haspopup="menu">💪</button>' +
      '</div>';
    U.$('#sync-btn').addEventListener('click', function () { App.navigate('settings'); });
    U.$('#user-btn').addEventListener('click', function (e) { openUserMenu(e.currentTarget); });

    // ---- sidebar shell — nav items are (re)painted by refreshNav ----
    const sidebar = U.$('#sidebar');
    sidebar.innerHTML =
      '<a class="wordmark" href="#/dashboard">' + icons.log + '<span>Iron<span class="accent">Log</span></span></a>' +
      '<nav id="sidebar-nav"></nav>' +
      '<div class="sidebar-bottom">' +
        '<a class="nav-item" data-view="settings" href="#/settings">' + icons.settings + '<span>Settings</span></a>' +
        '<a class="nav-item" data-view="profiles" href="#/profiles">' + icons.users + '<span>Profiles</span></a>' +
      '</div>';

    // ---- tabbar: dashboard, history, [fab log], analytics, library ----
    // Items are (re)painted by refreshNav, so the fab click is delegated —
    // repaints never lose the handler.
    U.on(U.$('#tabbar'), 'click', '#fab-log', function () { App.navigate('log'); });

    navSig = null;
    refreshNav();
  }

  /* Re-evaluate view visible() predicates and repaint sidebar nav + tabbar.
     Runs on every render (via updateChrome); the signature check keeps it a
     no-op unless the set of visible views actually changed. */
  let navSig = null;

  function sidebarNavIds() {
    return Object.keys(views)
      .filter(function (id) { return views[id].nav && viewVisible(id); })
      .sort(function (a, b) { return views[a].order - views[b].order; });
  }

  function tabbarIds() {
    // A TABS id whose view never registered still renders (graceful fallback);
    // only a visible() predicate returning false hides a tab.
    return TABS.filter(function (id) {
      const v = views[id];
      return !(v && v.visible) || viewVisible(id);
    });
  }

  function refreshNav() {
    const ids = sidebarNavIds();
    const tabs = tabbarIds();
    const sig = ids.join(',') + '|' + tabs.join(',');
    if (sig === navSig) return;
    navSig = sig;

    const nav = U.$('#sidebar-nav');
    if (nav) {
      nav.innerHTML = ids.map(function (id) {
        return '<a class="nav-item" data-view="' + U.esc(id) + '" href="#/' + U.esc(id) + '">' +
          views[id].icon + '<span>' + U.esc(views[id].title) + '</span></a>';
      }).join('');
    }

    const tabbar = U.$('#tabbar');
    if (tabbar) {
      function tabHTML(id) {
        const v = views[id];
        const title = v ? v.title : id.charAt(0).toUpperCase() + id.slice(1);
        const icon = v ? v.icon : icons[id] || icons.dashboard;
        return '<a class="tab" data-view="' + U.esc(id) + '" href="#/' + U.esc(id) + '">' +
          icon + '<span>' + U.esc(title) + '</span></a>';
      }
      tabbar.innerHTML =
        tabs.slice(0, 2).map(tabHTML).join('') +
        '<button type="button" class="fab-log" id="fab-log" aria-label="Log a workout" style="position:relative">' +
          icons.log +
          '<span id="fab-draft-dot" style="display:none;position:absolute;top:6px;right:6px;width:9px;height:9px;' +
            'border-radius:50%;background:var(--orange);border:2px solid var(--bg)"></span>' +
        '</button>' +
        tabs.slice(2).map(tabHTML).join('');
    }
  }

  // Read-only peek at the log view's draft key — owned by views-log.js.
  function hasActiveDraft() {
    try { return !!localStorage.getItem('ironlog/activeWorkout'); }
    catch (e) { return false; }
  }

  function updateChrome() {
    // v2: visible() predicates may have flipped (e.g. mode switch) — repaint nav
    refreshNav();
    // active nav states
    U.$$('.nav-item[data-view], .tab[data-view]').forEach(function (el) {
      el.classList.toggle('active', el.getAttribute('data-view') === App.current.view);
    });
    // avatar
    const btn = U.$('#user-btn');
    const cur = Store.currentUser();
    if (btn) {
      if (cur) {
        btn.textContent = cur.emoji || '💪';
        btn.style.setProperty('--user-color', cur.color || 'var(--accent)');
        btn.title = cur.name;
      } else {
        btn.textContent = '💪';
        btn.title = 'Profiles';
      }
    }
    // fab draft dot (subtle hint that a workout draft is in progress)
    const dot = U.$('#fab-draft-dot');
    if (dot) dot.style.display = hasActiveDraft() ? 'block' : 'none';
    refreshSyncDot();
  }

  function relTime(ms) {
    if (!ms) return 'never';
    const d = Date.now() - ms;
    if (d < 60000) return 'just now';
    if (d < 3600000) return Math.round(d / 60000) + 'm ago';
    if (d < 86400000) return Math.round(d / 3600000) + 'h ago';
    return U.relDate(U.dateToStr(new Date(ms)));
  }

  function refreshSyncDot(st) {
    const dot = U.$('#sync-dot');
    const btn = U.$('#sync-btn');
    if (!dot || !btn) return;
    st = st || (window.Sync && Sync.status ? Sync.status() : null);
    dot.classList.remove('ok', 'err', 'off', 'pulse');
    let title = 'Sync is off — tap to set up';
    if (!st || !st.enabled) {
      dot.classList.add('off');
    } else if (st.lastError) {
      dot.classList.add('err');
      title = 'Sync error: ' + st.lastError;
    } else {
      dot.classList.add('ok');
      if (st.inFlight) dot.classList.add('pulse');
      title = st.inFlight ? 'Syncing…' :
        st.lastSyncAt ? 'Last synced ' + relTime(st.lastSyncAt) : 'Sync enabled — not synced yet';
    }
    btn.title = title;
  }

  /* ---------- user switcher dropdown ---------- */

  let userMenuEl = null;

  function closeUserMenu() {
    if (userMenuEl) { userMenuEl.remove(); userMenuEl = null; }
    document.removeEventListener('click', onDocClickMenu, true);
    document.removeEventListener('keydown', onMenuKey, true);
  }

  function onDocClickMenu(e) {
    if (userMenuEl && !userMenuEl.contains(e.target)) closeUserMenu();
  }

  function onMenuKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeUserMenu(); }
  }

  function openUserMenu(anchor) {
    if (userMenuEl) { closeUserMenu(); return; }
    const cur = Store.currentUser();
    const rows = Store.state.users.map(function (u) {
      const isCur = cur && u.id === cur.id;
      return '<button type="button" class="list-row" data-uid="' + U.esc(u.id) + '" style="min-height:48px;border:0;background:none">' +
        '<span class="leading plain"><span class="avatar sm" style="--user-color:' + U.esc(u.color || '#2ca350') + '">' + U.esc(u.emoji || '💪') + '</span></span>' +
        '<span class="body"><span class="title">' + U.esc(u.name) + '</span></span>' +
        (isCur ? '<span class="trailing" style="color:var(--accent)">' + icons.check + '</span>' : '') +
      '</button>';
    }).join('');
    userMenuEl = U.el(
      '<div role="menu" style="position:fixed;z-index:120;min-width:230px;max-width:300px;background:var(--card-2);' +
        'border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow);overflow:hidden;padding:4px">' +
        rows +
        '<div class="divider" style="margin:4px 0"></div>' +
        '<button type="button" class="list-row" data-manage style="min-height:48px;border:0;background:none">' +
          '<span class="leading plain" style="color:var(--text-2)">' + icons.users + '</span>' +
          '<span class="body"><span class="title">Manage profiles</span></span>' +
        '</button>' +
      '</div>');
    document.body.appendChild(userMenuEl);
    const r = anchor.getBoundingClientRect();
    userMenuEl.style.top = (r.bottom + 8) + 'px';
    userMenuEl.style.right = Math.max(8, window.innerWidth - r.right) + 'px';

    U.on(userMenuEl, 'click', '[data-uid]', function (e, el) {
      const u = Store.state.users.find(function (x) { return x.id === el.getAttribute('data-uid'); });
      closeUserMenu();
      if (u) {
        Store.setCurrentUser(u.id);
        App.rerender();
        App.toast('Switched to ' + u.name, 'ok');
      }
    });
    U.on(userMenuEl, 'click', '[data-manage]', function () {
      closeUserMenu();
      App.navigate('profiles');
    });
    setTimeout(function () {
      document.addEventListener('click', onDocClickMenu, true);
      document.addEventListener('keydown', onMenuKey, true);
    }, 0);
  }

  /* ======================================================================
     Profile form (shared by onboarding, profiles, settings)
     ====================================================================== */

  const EMOJIS = ['💪', '🏋️', '🤸', '🏃', '🚴', '🧗', '⛹️', '🤾', '🏊', '🥊', '🤼', '🧘',
    '🦍', '🐺', '🦁', '🐻', '🦅', '🐂', '🔥', '⚡', '🏆', '🥇', '🎯', '🚀'];

  function seriesColors() {
    return (window.Charts && Charts.SERIES) ||
      ['#2ca350', '#0a84ff', '#cf7c00', '#bf5af2', '#ff375f', '#3399cc'];
  }

  // Returns {el, read()} — read() -> {name, emoji, color, units, goals?} or null when invalid.
  function buildProfileForm(user, opts) {
    opts = opts || {};
    const withGoals = !!opts.withGoals;
    const s = (user && user.settings) || {};
    const state = {
      emoji: (user && user.emoji) || '💪',
      color: (user && user.color) || seriesColors()[0],
      units: s.units === 'kg' ? 'kg' : 'lb',
      // v2 goal question — 'none' | 'general' | 'sfas'
      goal: (user && user.goals && user.goals.preset) || 'none'
    };
    const colors = seriesColors();

    const el = U.el('<form novalidate>' +
      '<div class="field">' +
        '<label for="pf-name">Name</label>' +
        '<input class="input" id="pf-name" type="text" maxlength="30" placeholder="e.g. Alex" ' +
          'autocomplete="off" value="' + U.esc(user ? user.name : '') + '">' +
      '</div>' +
      '<div class="field">' +
        '<label>Avatar</label>' +
        '<div data-emoji-grid style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px">' +
          EMOJIS.map(function (em) {
            return '<button type="button" class="chip" data-emoji="' + em + '" aria-label="Avatar ' + em + '" ' +
              'style="justify-content:center;font-size:18px;padding:6px 0;min-height:40px">' + em + '</button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label>Color</label>' +
        '<div data-color-row style="display:flex;gap:12px;flex-wrap:wrap;padding:2px">' +
          colors.map(function (c) {
            return '<button type="button" data-color="' + U.esc(c) + '" aria-label="Color ' + U.esc(c) + '" ' +
              'style="width:34px;height:34px;border-radius:50%;background:' + U.esc(c) + ';border:0;cursor:pointer"></button>';
          }).join('') +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label>Units</label>' +
        '<div class="segmented block" data-units>' +
          '<button type="button" data-v="lb">Pounds (lb)</button>' +
          '<button type="button" data-v="kg">Kilograms (kg)</button>' +
        '</div>' +
      '</div>' +
      '<div class="field">' +
        '<label>Training for something specific?</label>' +
        '<div class="segmented block" data-goal>' +
          '<button type="button" data-v="none">None</button>' +
          '<button type="button" data-v="general">Getting fit</button>' +
          '<button type="button" data-v="sfas">Military selection (SFAS)</button>' +
        '</div>' +
        '<p class="small-text muted" style="margin:6px 0 0">Picking a goal turns on Performance mode — ' +
          'cardio &amp; ruck logging, training guardrails and goal tracking. You can switch anytime in Settings.</p>' +
      '</div>' +
      (withGoals ?
        '<div class="field-row" style="display:flex;gap:10px">' +
          '<div class="field" style="flex:1">' +
            '<label for="pf-wgoal">Workouts / week</label>' +
            '<select class="select" id="pf-wgoal">' +
              [1, 2, 3, 4, 5, 6, 7].map(function (n) {
                return '<option value="' + n + '"' + (n === (s.weeklyWorkoutGoal || 4) ? ' selected' : '') + '>' + n + '</option>';
              }).join('') +
            '</select>' +
          '</div>' +
          '<div class="field" style="flex:1">' +
            '<label for="pf-sgoal">Sets / muscle / week</label>' +
            '<input class="input" id="pf-sgoal" type="number" min="5" max="25" step="1" value="' +
              (s.weeklySetGoal || 15) + '">' +
          '</div>' +
        '</div>' +
        '<div class="field">' +
          '<label for="pf-rest">Rest timer</label>' +
          '<select class="select" id="pf-rest">' +
            [60, 90, 120, 150, 180].map(function (n) {
              return '<option value="' + n + '"' + (n === (s.restTimerSec || 90) ? ' selected' : '') + '>' +
                (n >= 120 ? (n / 60) + ' min' : n + ' sec') + '</option>';
            }).join('') +
          '</select>' +
        '</div>'
        : '') +
      '</form>');

    function paint() {
      U.$$('[data-emoji]', el).forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-emoji') === state.emoji);
      });
      U.$$('[data-color]', el).forEach(function (b) {
        const on = b.getAttribute('data-color') === state.color;
        b.style.boxShadow = on ? '0 0 0 2px var(--card), 0 0 0 4px ' + state.color : 'none';
        b.style.transform = on ? 'scale(1.08)' : '';
      });
      U.$$('[data-units] button', el).forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-v') === state.units);
      });
      U.$$('[data-goal] button', el).forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-v') === state.goal);
      });
    }
    U.on(el, 'click', '[data-emoji]', function (e, b) { state.emoji = b.getAttribute('data-emoji'); paint(); });
    U.on(el, 'click', '[data-color]', function (e, b) { state.color = b.getAttribute('data-color'); paint(); });
    U.on(el, 'click', '[data-units] button', function (e, b) { state.units = b.getAttribute('data-v'); paint(); });
    U.on(el, 'click', '[data-goal] button', function (e, b) { state.goal = b.getAttribute('data-v'); paint(); });
    el.addEventListener('submit', function (e) { e.preventDefault(); });
    paint();

    return {
      el: el,
      read: function () {
        const name = U.$('#pf-name', el).value.trim();
        if (!name) {
          App.toast('Give this profile a name', 'err');
          U.$('#pf-name', el).focus();
          return null;
        }
        const out = { name: name, emoji: state.emoji, color: state.color, units: state.units, goalPreset: state.goal };
        if (withGoals) {
          out.goals = {
            weeklyWorkoutGoal: U.clamp(parseInt(U.$('#pf-wgoal', el).value, 10) || 4, 1, 7),
            weeklySetGoal: U.clamp(parseInt(U.$('#pf-sgoal', el).value, 10) || 15, 5, 25),
            restTimerSec: parseInt(U.$('#pf-rest', el).value, 10) || 90
          };
        }
        return out;
      }
    };
  }

  // v2: apply the "Training for something specific?" answer. Choosing a goal
  // sets user.goals.preset (Store.setGoals) and enters performance mode;
  // choosing None returns to simple mode. A user whose answer did not change
  // is left completely untouched (no writes) so existing profiles are stable.
  function applyGoalChoice(userId, choice, existingUser) {
    const next = choice === 'sfas' || choice === 'general' ? choice : null;
    const prev = (existingUser && existingUser.goals && existingUser.goals.preset) || null;
    if (existingUser && next === prev) return;
    if (!existingUser && !next) return; // new profile, no goal: defaults stand
    const g = (existingUser && existingUser.goals) || {};
    Store.setGoals(userId, {
      preset: next,
      selectionDate: g.selectionDate || null,
      targets: g.targets || {}
    });
    Store.updateUser(userId, { settings: { trainingProfile: next ? 'performance' : 'simple' } });
  }

  function openProfileModal(user) {
    const form = buildProfileForm(user, { withGoals: !!user });
    App.modal({
      title: user ? 'Edit profile' : 'Add family member',
      content: form.el,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: user ? 'Save' : 'Create',
          kind: 'primary',
          keepOpen: true,
          onClick: function (api) {
            const v = form.read();
            if (!v) return;
            if (user) {
              Store.updateUser(user.id, {
                name: v.name, emoji: v.emoji, color: v.color,
                settings: {
                  units: v.units,
                  weeklyWorkoutGoal: v.goals.weeklyWorkoutGoal,
                  weeklySetGoal: v.goals.weeklySetGoal,
                  restTimerSec: v.goals.restTimerSec
                }
              });
              applyGoalChoice(user.id, v.goalPreset, user);
              App.toast('Profile updated', 'ok');
            } else {
              const u = Store.addUser({ name: v.name, emoji: v.emoji, color: v.color, settings: { units: v.units } });
              Store.setCurrentUser(u.id);
              applyGoalChoice(u.id, v.goalPreset, null);
              App.toast('Welcome, ' + u.name + '!', 'ok');
            }
            api.close();
            App.rerender();
          }
        }
      ]
    });
  }

  /* ======================================================================
     Onboarding (users.length === 0)
     ====================================================================== */

  function onboardingMark() {
    return '<div style="width:84px;height:84px;border-radius:24px;background:var(--card);border:1px solid var(--border);' +
      'display:flex;align-items:center;justify-content:center;color:var(--accent);box-shadow:var(--shadow)">' +
      '<span style="display:inline-flex;transform:scale(1.9) rotate(-30deg)">' + icons.log + '</span></div>';
  }

  function renderOnboarding(content) {
    content.innerHTML = '';
    const wrap = U.el(
      '<div class="view" style="min-height:calc(100dvh - 60px);display:flex;align-items:center;justify-content:center">' +
        '<div id="ob-card" style="width:100%;max-width:400px;display:flex;flex-direction:column;align-items:center;' +
          'text-align:center;gap:14px;padding:24px 8px"></div>' +
      '</div>');
    content.appendChild(wrap);
    renderWelcome();

    function renderWelcome() {
      const card = U.$('#ob-card', wrap);
      card.innerHTML =
        onboardingMark() +
        '<h1 style="font-size:34px;font-weight:800;letter-spacing:-.03em;margin-top:6px">Iron<span style="color:var(--accent)">Log</span></h1>' +
        '<p class="text-2" style="font-size:16px;margin-top:-8px">The gym log for your whole family</p>' +
        '<div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:300px;margin-top:14px">' +
          '<button type="button" class="btn primary block" id="ob-create" style="min-height:48px">Create your profile</button>' +
          '<button type="button" class="btn ghost block" id="ob-demo" style="min-height:48px">Explore with demo data</button>' +
        '</div>';
      U.$('#ob-create', card).addEventListener('click', renderCreate);
      U.$('#ob-demo', card).addEventListener('click', function () {
        Store.seedDemo();
        App.toast('Demo family loaded — look around!', 'ok');
        App.navigate('dashboard');
      });
    }

    function renderCreate() {
      const card = U.$('#ob-card', wrap);
      card.innerHTML =
        '<h2 style="font-size:24px;font-weight:800;letter-spacing:-.02em">Create your profile</h2>' +
        '<div class="card" id="ob-form-slot" style="width:100%;text-align:left"></div>' +
        '<div style="display:flex;gap:10px;width:100%">' +
          '<button type="button" class="btn ghost" id="ob-back" style="flex:1">Back</button>' +
          '<button type="button" class="btn primary" id="ob-save" style="flex:2">Start lifting</button>' +
        '</div>';
      const form = buildProfileForm(null, { withGoals: false });
      U.$('#ob-form-slot', card).appendChild(form.el);
      U.$('#ob-back', card).addEventListener('click', renderWelcome);
      U.$('#ob-save', card).addEventListener('click', function () {
        const v = form.read();
        if (!v) return;
        const u = Store.addUser({ name: v.name, emoji: v.emoji, color: v.color, settings: { units: v.units } });
        Store.setCurrentUser(u.id);
        applyGoalChoice(u.id, v.goalPreset, null);
        App.toast('Welcome, ' + u.name + '! Time to lift.', 'ok');
        App.navigate('dashboard');
      });
      const nameInput = U.$('#pf-name', card);
      if (nameInput) nameInput.focus();
    }
  }

  /* ======================================================================
     Profiles view
     ====================================================================== */

  const MONTHS_S = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function joinedStr(ms) {
    const d = new Date(ms || Date.now());
    return MONTHS_S[d.getMonth()] + ' ' + d.getFullYear();
  }

  function renderProfiles(el) {
    const cur = Store.currentUser();
    el.appendChild(U.el(
      '<div class="view-head"><h1>Profiles</h1>' +
        '<button type="button" class="btn primary" id="add-user">' + icons.plus + ' Add family member</button>' +
      '</div>'));

    const list = U.el('<div class="list"></div>');
    Store.state.users.forEach(function (u) {
      const n = Store.workoutsFor(u.id).length;
      const isCur = cur && u.id === cur.id;
      list.appendChild(U.el(
        '<div class="list-row">' +
          '<button type="button" data-switch="' + U.esc(u.id) + '" aria-label="Switch to ' + U.esc(u.name) + '" ' +
            'style="display:flex;align-items:center;gap:12px;flex:1;min-width:0;border:0;background:none;padding:0;' +
            'cursor:pointer;text-align:left;color:inherit;font:inherit">' +
            '<span class="avatar" style="--user-color:' + U.esc(u.color || '#2ca350') + '">' + U.esc(u.emoji || '💪') + '</span>' +
            '<span class="body">' +
              '<span class="title">' + U.esc(u.name) +
                (isCur ? ' <span class="badge" style="margin-left:6px">Current</span>' : '') + '</span>' +
              '<span class="sub">' + n + (n === 1 ? ' workout' : ' workouts') + ' · Joined ' + joinedStr(u.createdAt) + '</span>' +
            '</span>' +
          '</button>' +
          '<span class="trailing">' +
            '<button type="button" class="btn icon ghost" data-edit="' + U.esc(u.id) + '" aria-label="Edit ' + U.esc(u.name) + '">' + icons.edit + '</button>' +
            '<button type="button" class="btn icon ghost" data-del="' + U.esc(u.id) + '" aria-label="Delete ' + U.esc(u.name) + '">' + icons.trash + '</button>' +
          '</span>' +
        '</div>'));
    });
    el.appendChild(list);

    el.appendChild(U.el(
      '<p class="small-text muted" style="padding:0 4px">Every family member gets their own history, goals and units. ' +
      'Switch anytime from the avatar in the top bar.</p>'));

    U.$('#add-user', el).addEventListener('click', function () { openProfileModal(null); });

    U.on(el, 'click', '[data-switch]', function (e, b) {
      const u = Store.state.users.find(function (x) { return x.id === b.getAttribute('data-switch'); });
      if (!u) return;
      if (cur && u.id === cur.id) return;
      Store.setCurrentUser(u.id);
      App.rerender();
      App.toast('Switched to ' + u.name, 'ok');
    });
    U.on(el, 'click', '[data-edit]', function (e, b) {
      e.stopPropagation();
      const u = Store.state.users.find(function (x) { return x.id === b.getAttribute('data-edit'); });
      if (u) openProfileModal(u);
    });
    U.on(el, 'click', '[data-del]', function (e, b) {
      e.stopPropagation();
      const u = Store.state.users.find(function (x) { return x.id === b.getAttribute('data-del'); });
      if (!u) return;
      const n = Store.workoutsFor(u.id).length;
      App.confirm({
        title: 'Delete ' + u.name + '?',
        message: 'This permanently deletes ' + u.name + '’s profile and all their data — ' +
          n + (n === 1 ? ' workout' : ' workouts') + ', body metrics and health samples. This cannot be undone.',
        danger: true,
        confirmLabel: 'Delete profile'
      }).then(function (ok) {
        if (!ok) return;
        Store.deleteUser(u.id);
        App.toast('Deleted ' + u.name, 'ok');
        App.rerender();
      });
    });
  }

  /* ======================================================================
     Settings view
     ====================================================================== */

  function detailsBlock(summary, innerHTML) {
    return '<details style="margin-top:12px">' +
      '<summary style="cursor:pointer;font-size:14px;font-weight:600;color:var(--text-2);padding:6px 0;list-style-position:inside">' +
        U.esc(summary) + '</summary>' +
      '<div class="small-text text-2" style="padding:8px 2px 2px;line-height:1.6">' + innerHTML + '</div>' +
    '</details>';
  }

  function cardTitle(icon, label) {
    return '<div class="card-title" style="display:flex;align-items:center;justify-content:flex-start;gap:8px">' +
      '<span style="display:inline-flex;color:var(--text-2)">' + icon + '</span>' + U.esc(label) + '</div>';
  }

  function renderSettings(el) {
    const cur = Store.currentUser();
    el.appendChild(U.el('<div class="view-head"><h1>Settings</h1></div>'));

    /* ---- 1. Profile & Units ---- */
    const s = (cur && cur.settings) || {};
    const profCard = U.el('<div class="card">' +
      cardTitle(icons.users, 'Profile & Units') +
      (cur ?
        '<div style="display:flex;align-items:center;gap:12px;margin:10px 0 14px">' +
          '<span class="avatar lg" style="--user-color:' + U.esc(cur.color || '#2ca350') + '">' + U.esc(cur.emoji || '💪') + '</span>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-weight:700;font-size:16px">' + U.esc(cur.name) + '</div>' +
            '<div class="small-text muted">' + (s.weeklyWorkoutGoal || 4) + ' workouts/week goal · rest ' +
              (s.restTimerSec || 90) + 's · ' + (s.units === 'kg' ? 'kilograms' : 'pounds') + '</div>' +
          '</div>' +
          '<button type="button" class="btn ghost small" id="st-edit-profile">' + icons.edit + ' Edit</button>' +
        '</div>' +
        '<div class="field" style="margin-bottom:0"><label>Units</label>' +
          '<div class="segmented block" id="st-units">' +
            '<button type="button" data-v="lb"' + (s.units !== 'kg' ? ' class="active"' : '') + '>Pounds (lb)</button>' +
            '<button type="button" data-v="kg"' + (s.units === 'kg' ? ' class="active"' : '') + '>Kilograms (kg)</button>' +
          '</div></div>'
        : '<p class="text-2 small-text">No profile selected.</p>') +
      '</div>');
    el.appendChild(profCard);
    if (cur) {
      U.$('#st-edit-profile', profCard).addEventListener('click', function () { openProfileModal(cur); });
      U.on(profCard, 'click', '#st-units button', function (e, b) {
        const v = b.getAttribute('data-v');
        if ((s.units === 'kg' ? 'kg' : 'lb') === v) return;
        Store.updateUser(cur.id, { settings: { units: v } });
        App.toast('Units set to ' + (v === 'kg' ? 'kilograms' : 'pounds'), 'ok');
      });
    }

    /* ---- 2. Training (v2 mode gate + goals/profile editor) ---- */
    if (cur) el.appendChild(buildTrainingCard(cur));

    /* ---- 3. Apple Health ---- */
    const ahCard = U.el('<div class="card">' +
      cardTitle(icons.apple, 'Apple Health') +
      '<p class="text-2 small-text" style="margin:6px 0 12px">Import weight, daily activity and workouts from your ' +
        'iPhone’s Health export. Everything stays on this device.</p>' +
      '<div id="ah-drop" role="button" tabindex="0" aria-label="Import Apple Health export" ' +
        'style="border:1.5px dashed var(--border);border-radius:var(--radius-sm);padding:22px 16px;text-align:center;' +
        'cursor:pointer;transition:border-color .15s ease,background .15s ease">' +
        '<span style="display:inline-flex;color:var(--text-2)">' + icons.upload + '</span>' +
        '<div style="font-size:14px;font-weight:600;margin-top:6px">Drop export.zip here, or tap to choose</div>' +
        '<div class="small-text muted" style="margin-top:2px">Accepts export.zip or export.xml</div>' +
      '</div>' +
      '<input type="file" id="ah-file" accept=".zip,.xml,application/zip,text/xml" style="display:none">' +
      '<div class="progress-bar" id="ah-prog" style="display:none;margin-top:12px"><div id="ah-prog-fill" style="width:0%"></div></div>' +
      '<div class="btn-row" style="margin-top:12px">' +
        '<button type="button" class="btn ghost small" id="ah-export">' + icons.download + ' Export workouts CSV</button>' +
      '</div>' +
      detailsBlock('How to export from iPhone', (window.AppleHealth && AppleHealth.shortcutsGuide) ||
        '<ol style="padding-left:18px;display:flex;flex-direction:column;gap:6px">' +
        '<li>Open the <b>Health</b> app on your iPhone.</li>' +
        '<li>Tap your picture (top right) → <b>Export All Health Data</b>.</li>' +
        '<li>Wait for <b>export.zip</b> to be created, then AirDrop / save it here.</li>' +
        '<li>Drop the file above — no need to unzip.</li></ol>') +
      '</div>');
    el.appendChild(ahCard);
    wireAppleHealth(ahCard);

    /* ---- 4. Family Sync ---- */
    const syncState = Store.state.sync || {};
    const st = window.Sync && Sync.status ? Sync.status() : { enabled: false, lastSyncAt: null, lastError: null };
    const syncCard = U.el('<div class="card">' +
      cardTitle(icons.sync, 'Family Sync') +
      '<p class="text-2 small-text" style="margin:6px 0 12px">Share one database and every family member’s log ' +
        'stays in sync across all your devices. Free, using your own Firebase project.</p>' +
      '<div class="field"><label for="sync-url">Database URL</label>' +
        '<input class="input" id="sync-url" type="url" autocomplete="off" spellcheck="false" ' +
          'placeholder="https://your-db-default-rtdb.firebaseio.com/ironlog-x7k2m9" value="' + U.esc(syncState.url || '') + '">' +
      '</div>' +
      '<div class="field"><label for="sync-secret">Database secret <span class="muted">(optional)</span></label>' +
        '<input class="input" id="sync-secret" type="password" autocomplete="off" value="' + U.esc(syncState.secret || '') + '">' +
      '</div>' +
      '<div class="row between" style="margin-bottom:12px">' +
        '<label for="sync-toggle" style="font-size:14px;font-weight:600;display:flex;align-items:center;gap:10px;cursor:pointer;min-height:44px">' +
          '<input type="checkbox" id="sync-toggle" style="width:20px;height:20px;accent-color:var(--accent)"' +
            (st.enabled ? ' checked' : '') + '> Enable sync</label>' +
        '<button type="button" class="btn ghost small" id="sync-now"' + (st.enabled ? '' : ' disabled') + '>' +
          icons.sync + ' Sync now</button>' +
      '</div>' +
      '<div class="small-text" id="sync-status-line">' + syncStatusLine(st) + '</div>' +
      detailsBlock('How to set up (5 min, free)',
        '<ol style="padding-left:18px;display:flex;flex-direction:column;gap:6px">' +
        '<li>Go to <b>console.firebase.google.com</b> and add a project (any name, Analytics off).</li>' +
        '<li>In the left menu: <b>Build → Realtime Database → Create database</b>.</li>' +
        '<li>Choose <b>Start in test mode</b>.</li>' +
        '<li>Copy the database URL (looks like <code>https://myproj-default-rtdb.firebaseio.com/</code>).</li>' +
        '<li>Add a long random path segment to the end, e.g. <code>/ironlog-k9x2m4q8v7</code>, and paste the whole thing above on every family device.</li>' +
        '<li>Optional: in <b>Project settings → Service accounts → Database secrets</b>, copy a secret and paste it above for extra protection.</li>' +
        '</ol>' +
        '<p style="margin-top:8px;color:var(--orange)">⚠️ Test-mode rules let anyone who knows the exact URL read and write it — ' +
        'that long random path segment is your password, so keep the URL private. Test mode also expires after 30 days; ' +
        'when it does, set the rules to <code>{ &quot;.read&quot;: true, &quot;.write&quot;: true }</code> to keep going.</p>') +
      '</div>');
    el.appendChild(syncCard);
    wireSync(syncCard);

    /* ---- 5. Data ---- */
    const noWorkouts = Store.state.workouts.length === 0;
    const dataCard = U.el('<div class="card">' +
      cardTitle(icons.download, 'Data') +
      '<p class="text-2 small-text" style="margin:6px 0 12px">Your data lives in this browser. Back it up to a file ' +
        'any time and restore it anywhere.</p>' +
      '<div class="btn-row">' +
        '<button type="button" class="btn ghost small" id="bk-export">' + icons.download + ' Export backup</button>' +
        '<button type="button" class="btn ghost small" id="bk-import">' + icons.upload + ' Import backup</button>' +
        (noWorkouts ? '<button type="button" class="btn ghost small" id="bk-demo">' + icons.flame + ' Load demo data</button>' : '') +
      '</div>' +
      '<input type="file" id="bk-file" accept=".json,application/json" style="display:none">' +
      '</div>');
    el.appendChild(dataCard);
    wireData(dataCard);

    /* ---- 6. Danger zone ---- */
    const dangerCard = U.el('<div class="card" style="border-color:rgba(255,69,58,.25)">' +
      '<div class="card-title" style="color:#ff6961">Danger zone</div>' +
      '<p class="text-2 small-text" style="margin:6px 0 12px">Erase every profile, workout and setting stored on this device.</p>' +
      '<button type="button" class="btn danger" id="dz-erase">' + icons.trash + ' Erase all data</button>' +
      '</div>');
    el.appendChild(dangerCard);
    U.$('#dz-erase', dangerCard).addEventListener('click', eraseAllData);
  }

  /* ---------- Training card (Settings) ---------- */

  function buildTrainingCard(cur) {
    const tp = (cur.settings && cur.settings.trainingProfile) === 'performance' ? 'performance' : 'simple';
    const goals = cur.goals || {};
    const prof = cur.profile || {};
    const preset = goals.preset === 'sfas' || goals.preset === 'general' ? goals.preset : 'none';

    function seg(id, items, active) {
      return '<div class="segmented block" id="' + id + '">' + items.map(function (it) {
        return '<button type="button" data-v="' + U.esc(it.v) + '"' +
          (it.v === active ? ' class="active"' : '') + '>' + U.esc(it.l) + '</button>';
      }).join('') + '</div>';
    }

    const card = U.el('<div class="card">' +
      cardTitle(icons.shield, 'Training') +
      '<p class="text-2 small-text" style="margin:6px 0 12px">Simple keeps IronLog to lifts — the classic ' +
        'experience. Performance adds run, ruck and other cardio logging, training guardrails, a pain log ' +
        'and goal tracking.</p>' +
      '<div class="field"><label>Mode</label>' +
        seg('tr-mode', [{ v: 'simple', l: 'Simple' }, { v: 'performance', l: 'Performance' }], tp) +
      '</div>' +
      (tp === 'performance' ?
        '<div class="divider"></div>' +
        '<div class="field"><label>Training for something specific?</label>' +
          seg('tr-preset', [
            { v: 'none', l: 'None' },
            { v: 'general', l: 'Getting fit' },
            { v: 'sfas', l: 'Military selection (SFAS)' }
          ], preset) +
        '</div>' +
        '<div class="field"><label for="tr-seldate">Selection date <span class="muted">(optional)</span></label>' +
          '<input class="input" id="tr-seldate" type="date" value="' + U.esc(goals.selectionDate || '') + '">' +
        '</div>' +
        '<div class="field"><label>Sex</label>' +
          seg('tr-sex', [{ v: 'male', l: 'Male' }, { v: 'female', l: 'Female' }], prof.sex || '') +
        '</div>' +
        '<div class="field"><label for="tr-by">Birth year</label>' +
          '<input class="input" id="tr-by" type="number" min="1920" max="2020" step="1" inputmode="numeric" ' +
            'placeholder="e.g. 1998" value="' + (prof.birthYear ? U.esc(String(prof.birthYear)) : '') + '">' +
        '</div>' +
        '<p class="small-text muted" style="margin-top:-4px">Sex and birth year are used for ACFT scoring ' +
          'and heart-rate zones. They never leave this device.</p>'
        : '') +
      '</div>');

    U.on(card, 'click', '#tr-mode button', function (e, b) {
      const v = b.getAttribute('data-v');
      if (v === tp) return;
      Store.updateUser(cur.id, { settings: { trainingProfile: v } });
      App.toast(v === 'performance' ? 'Performance mode on' : 'Back to simple mode', 'ok');
    });
    U.on(card, 'click', '#tr-preset button', function (e, b) {
      const v = b.getAttribute('data-v');
      if (v === preset) return;
      Store.setGoals(cur.id, {
        preset: v === 'none' ? null : v,
        selectionDate: goals.selectionDate || null,
        targets: goals.targets || {}
      });
      App.toast('Goal updated', 'ok');
    });
    const selDate = U.$('#tr-seldate', card);
    if (selDate) {
      selDate.addEventListener('change', function () {
        const v = /^\d{4}-\d{2}-\d{2}$/.test(selDate.value) ? selDate.value : null;
        Store.setGoals(cur.id, { preset: goals.preset || null, selectionDate: v, targets: goals.targets || {} });
        App.toast(v ? 'Selection date set' : 'Selection date cleared', 'ok');
      });
    }
    U.on(card, 'click', '#tr-sex button', function (e, b) {
      const v = b.getAttribute('data-v');
      if (v === prof.sex) return;
      Store.setProfile(cur.id, { sex: v, birthYear: prof.birthYear || null });
      App.toast('Profile updated', 'ok');
    });
    const byInput = U.$('#tr-by', card);
    if (byInput) {
      byInput.addEventListener('change', function () {
        const y = parseInt(byInput.value, 10);
        Store.setProfile(cur.id, { sex: prof.sex || null, birthYear: isFinite(y) ? y : null });
        App.toast('Profile updated', 'ok');
      });
    }
    return card;
  }

  function syncStatusLine(st) {
    if (!st || !st.enabled) return '<span class="muted">Sync is off.</span>';
    let out = '<span class="muted">Last synced: ' + U.esc(relTime(st.lastSyncAt)) + '</span>';
    if (st.lastError) out += '<br><span style="color:#ff6961">Error: ' + U.esc(st.lastError) + '</span>';
    return out;
  }

  /* ---------- Apple Health wiring ---------- */

  function wireAppleHealth(card) {
    const drop = U.$('#ah-drop', card);
    const input = U.$('#ah-file', card);
    const prog = U.$('#ah-prog', card);
    const fill = U.$('#ah-prog-fill', card);

    function setProgress(p) {
      prog.style.display = '';
      let frac = null;
      if (typeof p === 'number' && isFinite(p)) frac = p > 1 ? p / 100 : p;
      else if (p && typeof p === 'object') {
        const done = p.loaded !== undefined ? p.loaded : p.done;
        const total = p.total;
        if (total > 0) frac = done / total;
        else if (typeof p.pct === 'number') frac = p.pct / 100;
      }
      if (frac === null || !isFinite(frac)) {
        fill.style.width = '100%';
        fill.classList.add('pulse');
      } else {
        fill.classList.remove('pulse');
        fill.style.width = Math.round(U.clamp(frac, 0, 1) * 100) + '%';
      }
    }

    function handleFile(file) {
      if (!file) return;
      if (!window.AppleHealth || !AppleHealth.importFile) {
        App.toast('Apple Health import is unavailable', 'err');
        return;
      }
      const cur = Store.currentUser();
      if (!cur) { App.toast('Create a profile first', 'err'); return; }
      setProgress(0);
      AppleHealth.importFile(file, { onProgress: setProgress })
        .then(function (parsed) {
          prog.style.display = 'none';
          fill.style.width = '0%';
          previewAppleImport(parsed, cur);
        })
        .catch(function (e) {
          prog.style.display = 'none';
          fill.style.width = '0%';
          App.toast('Import failed: ' + ((e && e.message) || 'could not read file'), 'err');
        });
    }

    drop.addEventListener('click', function () { input.click(); });
    drop.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
    });
    ['dragover', 'dragenter'].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault();
        drop.style.borderColor = 'var(--accent)';
        drop.style.background = 'rgba(48,209,88,.06)';
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      drop.addEventListener(evt, function (e) {
        e.preventDefault();
        drop.style.borderColor = '';
        drop.style.background = '';
      });
    });
    drop.addEventListener('drop', function (e) {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      handleFile(f);
    });
    input.addEventListener('change', function () {
      handleFile(input.files && input.files[0]);
      input.value = '';
    });

    U.$('#ah-export', card).addEventListener('click', function () {
      const cur = Store.currentUser();
      if (!cur) { App.toast('Create a profile first', 'err'); return; }
      if (!window.AppleHealth || !AppleHealth.exportWorkoutsCSV) {
        App.toast('CSV export is unavailable', 'err');
        return;
      }
      const csv = AppleHealth.exportWorkoutsCSV(cur.id);
      if (!csv) { App.toast('Nothing to export yet', 'err'); return; }
      U.download('ironlog-workouts-' + U.todayStr() + '.csv', csv, 'text/csv');
      App.toast('Workouts CSV downloaded', 'ok');
    });
  }

  function countDaily(daily) {
    let n = 0;
    if (daily && typeof daily === 'object') {
      for (const kind in daily) {
        const m = daily[kind];
        if (m && typeof m === 'object') n += Object.keys(m).length;
      }
    }
    return n;
  }

  function previewAppleImport(parsed, user) {
    const weights = ((parsed.bodyMass || []).length) + ((parsed.bodyFat || []).length);
    const daily = countDaily(parsed.daily);
    const workouts = (parsed.workouts || []).length;
    const rec = parsed.counts || {};
    if (!weights && !daily && !workouts) {
      App.toast('No usable health data found in that file', 'err');
      return;
    }
    App.modal({
      title: 'Apple Health import',
      content:
        '<p class="text-2" style="font-size:14px;line-height:1.55;margin:4px 0 10px">Found in this export' +
          (rec.records ? ' (' + U.fmtNum(rec.records) + ' records scanned)' : '') + ':</p>' +
        '<div class="list" style="margin-bottom:8px">' +
          '<div class="list-row" style="min-height:44px"><span class="body"><span class="title">Weight entries</span></span>' +
            '<span class="trailing tabular">' + U.fmtNum(weights) + '</span></div>' +
          '<div class="list-row" style="min-height:44px"><span class="body"><span class="title">Daily metrics</span></span>' +
            '<span class="trailing tabular">' + U.fmtNum(daily) + '</span></div>' +
          '<div class="list-row" style="min-height:44px"><span class="body"><span class="title">Workouts</span></span>' +
            '<span class="trailing tabular">' + U.fmtNum(workouts) + '</span></div>' +
        '</div>' +
        '<p class="small-text muted">Everything is added to ' + U.esc(user.name) + '’s profile. ' +
          'Existing entries for the same day are updated, not duplicated.</p>',
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Import',
          kind: 'primary',
          onClick: function () {
            try {
              const r = AppleHealth.applyImport(parsed, user.id) || {};
              App.toast('Imported ' + (r.workoutsAdded || 0) + ' workouts, ' + (r.metricsAdded || 0) +
                ' body metrics, ' + (r.samplesAdded || 0) + ' daily samples', 'ok');
              App.rerender();
            } catch (e) {
              App.toast('Import failed: ' + ((e && e.message) || 'unknown error'), 'err');
            }
          }
        }
      ]
    });
  }

  /* ---------- Sync wiring ---------- */

  function wireSync(card) {
    const urlInput = U.$('#sync-url', card);
    const secretInput = U.$('#sync-secret', card);
    const toggle = U.$('#sync-toggle', card);
    const nowBtn = U.$('#sync-now', card);
    const statusLine = U.$('#sync-status-line', card);

    function refreshLine() {
      const st = window.Sync && Sync.status ? Sync.status() : null;
      statusLine.innerHTML = syncStatusLine(st);
      nowBtn.disabled = !(st && st.enabled);
    }

    toggle.addEventListener('change', function () {
      if (!window.Sync || !Sync.configure) {
        App.toast('Sync module unavailable', 'err');
        toggle.checked = false;
        return;
      }
      if (toggle.checked) {
        const url = urlInput.value.trim();
        if (!url) {
          App.toast('Enter your database URL first', 'err');
          toggle.checked = false;
          return;
        }
        Sync.configure({ url: url, secret: secretInput.value.trim() });
        App.toast('Sync enabled', 'ok');
      } else {
        Sync.configure({ url: '', secret: secretInput.value.trim() });
        App.toast('Sync disabled');
      }
      refreshLine();
      refreshSyncDot();
    });

    nowBtn.addEventListener('click', function () {
      if (!window.Sync || !Sync.syncNow) return;
      const orig = nowBtn.innerHTML;
      nowBtn.disabled = true;
      nowBtn.innerHTML = '<span class="pulse" style="display:inline-flex">' + icons.sync + '</span> Syncing…';
      Sync.syncNow().then(function (r) {
        nowBtn.innerHTML = orig;
        nowBtn.disabled = false;
        if (r && r.ok) App.toast('Synced successfully', 'ok');
        else App.toast('Sync failed: ' + ((r && r.error) || 'unknown error'), 'err');
        refreshLine();
        refreshSyncDot();
      }).catch(function (e) {
        nowBtn.innerHTML = orig;
        nowBtn.disabled = false;
        App.toast('Sync failed: ' + ((e && e.message) || 'network error'), 'err');
        refreshLine();
        refreshSyncDot();
      });
    });
  }

  /* ---------- Data (backup/restore/demo) wiring ---------- */

  function wireData(card) {
    U.$('#bk-export', card).addEventListener('click', function () {
      U.download('ironlog-backup-' + U.todayStr() + '.json', Store.exportJSON(), 'application/json');
      App.toast('Backup downloaded', 'ok');
    });

    const fileInput = U.$('#bk-file', card);
    U.$('#bk-import', card).addEventListener('click', function () { fileInput.click(); });
    fileInput.addEventListener('change', function () {
      const f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (!f) return;
      U.readFileText(f).then(function (text) {
        let raw;
        try { raw = JSON.parse(text); } catch (e) { App.toast('Not a valid JSON file', 'err'); return; }
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
          App.toast('Not an IronLog backup', 'err');
          return;
        }
        const users = Array.isArray(raw.users) ? raw.users.length : 0;
        const workouts = Array.isArray(raw.workouts) ? raw.workouts.length : 0;
        App.modal({
          title: 'Import backup',
          content:
            '<p class="text-2" style="font-size:14px;line-height:1.55;margin:4px 0 10px">This backup contains <b>' +
              users + (users === 1 ? ' profile' : ' profiles') + '</b> and <b>' +
              workouts + (workouts === 1 ? ' workout' : ' workouts') + '</b>.</p>' +
            '<p class="small-text muted"><b>Merge</b> combines it with what’s already here (newest wins). ' +
            '<b>Replace</b> wipes this device’s data first.</p>',
          actions: [
            { label: 'Cancel', kind: 'ghost' },
            {
              label: 'Replace',
              kind: 'danger',
              onClick: function () {
                const r = Store.importJSON(text, { merge: false });
                if (r.ok) { App.toast('Backup restored (replaced)', 'ok'); App.rerender(); }
                else App.toast(r.error || 'Import failed', 'err');
              }
            },
            {
              label: 'Merge',
              kind: 'primary',
              onClick: function () {
                const r = Store.importJSON(text, { merge: true });
                if (r.ok) { App.toast('Backup merged', 'ok'); App.rerender(); }
                else App.toast(r.error || 'Import failed', 'err');
              }
            }
          ]
        });
      }).catch(function () {
        App.toast('Could not read that file', 'err');
      });
    });

    const demoBtn = U.$('#bk-demo', card);
    if (demoBtn) {
      demoBtn.addEventListener('click', function () {
        Store.seedDemo();
        App.toast('Demo family loaded', 'ok');
        App.navigate('dashboard');
      });
    }
  }

  function eraseAllData() {
    App.confirm({
      title: 'Erase all data?',
      message: 'This deletes every profile, workout, template, body metric and setting stored on this device.',
      danger: true,
      confirmLabel: 'Erase'
    }).then(function (ok) {
      if (!ok) return;
      return App.confirm({
        title: 'Really erase everything?',
        message: 'Last chance — there is no undo. Consider exporting a backup first.',
        danger: true,
        confirmLabel: 'Erase everything'
      }).then(function (ok2) {
        if (!ok2) return;
        try {
          const kill = [];
          for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.indexOf('ironlog') === 0) kill.push(k);
          }
          kill.forEach(function (k) { localStorage.removeItem(k); });
        } catch (e) { /* storage unavailable */ }
        location.hash = '';
        location.reload();
      });
    });
  }

  /* ======================================================================
     Register own views + init
     ====================================================================== */

  App.registerView('settings', { title: 'Settings', icon: icons.settings, nav: false, order: 90, render: renderSettings });
  App.registerView('profiles', { title: 'Profiles', icon: icons.users, nav: false, order: 91, render: renderProfiles });

  App.init = function () {
    Store.load();
    buildChrome();
    window.addEventListener('hashchange', onHashChange);
    Store.subscribe(scheduleRerender);
    if (window.Sync && Sync.onStatus) Sync.onStatus(refreshSyncDot);
    // another tab may start/finish a workout draft — keep the fab dot honest
    window.addEventListener('storage', function (e) {
      if (e.key === 'ironlog/activeWorkout') updateChrome();
    });
    render();
  };

  window.App = App;
})();
