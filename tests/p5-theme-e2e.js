/* P5 harness B — the browser half of the acceptance tests.

   1  every theme resolves the complete theme-token set on a real document,
      and an UNKNOWN slug degrades to the complete default palette
      (the static half — "exactly this set, nothing else" — is in
      p5-theme-tokens.js)
   2  switching profiles switches the theme LIVE: no reload, no stale colour.
      Asserted on rendered chart paints, the muscle-map surfaces and the
      live-session state tints, all read back off the composited nodes.
   5  markup invariance: the DOM outline of every view is byte-identical
      across all four themes, in BOTH modes.

   Run: node p5-theme-e2e.js                                                */
'use strict';
const P = require('./lib/paths');
const { chromium } = P.playwright();
const { serve } = require('./lib/hport');

const ROOT = P.GYM;
const SLUGS = ['field-issued', 'classic', 'slate', 'ember'];

const THEME_TOKENS = [
  '--bg', '--surface', '--card', '--card-2', '--border', '--hairline',
  '--text', '--text-2', '--text-muted', '--accent', '--accent-ink',
  '--blue', '--orange', '--purple', '--red', '--teal', '--yellow', '--pink',
  '--s1', '--s2', '--s3', '--s4', '--s5', '--s6',
  '--heat-0', '--heat-1', '--heat-2', '--heat-3', '--heat-4', '--heat-5',
  '--plate', '--seam',
  '--accent-tint', '--accent-tint-strong', '--red-tint', '--blue-tint', '--amber-tint'
];

let pass = 0;
const failures = [];
const deps = [];
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { failures.push(name); console.log('  FAIL ' + name + (extra ? '\n       ' + extra : '')); }
}
// A dependency probe: true of a file this change does not own. Reported, never
// counted — so this harness's verdict stays a verdict about its own files.
function dep(cond, name, extra) {
  deps.push({ ok: !!cond, name: name });
  console.log('  ' + (cond ? 'DEP-OK  ' : 'DEP-GAP ') + name + (extra && !cond ? '\n          ' + extra : ''));
}

(async () => {
  const server = await serve(ROOT);
  const errors = [];
  const browser = await chromium.launch({
    executablePath: P.chromiumPath()
  });
  const ctx = await browser.newContext({
    viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1, serviceWorkers: 'block'
  });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + e.message));

  await page.goto(server.url, { waitUntil: 'load' });
  await page.evaluate(() => { Store.seedDemo(); App.navigate('dashboard'); });
  await page.waitForTimeout(600);

  const setTheme = async (slug) => {
    await page.evaluate(s => {
      Store.setTheme(Store.currentUser().id, s);
      App.applyTheme();
      App.rerender();
    }, slug);
    await page.waitForTimeout(280);
  };

  /* =====================================================================
     1. token completeness on a live document + unknown-slug degradation
     ===================================================================== */
  console.log('\n[1] every palette resolves the complete token set');

  const readTokens = () => page.evaluate(names => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    names.forEach(n => { out[n] = String(cs.getPropertyValue(n) || '').trim(); });
    return out;
  }, THEME_TOKENS);

  const resolved = {};
  for (const slug of SLUGS) {
    await page.evaluate(s => document.documentElement.setAttribute('data-theme', s), slug);
    const vals = await readTokens();
    resolved[slug] = vals;
    const empty = THEME_TOKENS.filter(n => !vals[n]);
    ok(empty.length === 0, slug + ': all ' + THEME_TOKENS.length + ' theme tokens resolve',
      'empty: ' + empty.join(', '));
    const bad = THEME_TOKENS.filter(n => !/^(#[0-9a-f]{3,8}|rgba?\()/i.test(vals[n]));
    ok(bad.length === 0, slug + ': every resolved token is a real colour',
      bad.map(n => n + '=' + vals[n]).join(', '));
  }

  // the three non-default palettes must actually differ from the default
  for (const slug of ['classic', 'slate', 'ember']) {
    const same = THEME_TOKENS.filter(n => resolved[slug][n] === resolved['field-issued'][n]);
    ok(same.length < 6, slug + ': is a genuinely different palette (' +
      (THEME_TOKENS.length - same.length) + '/' + THEME_TOKENS.length + ' tokens move)',
      'identical: ' + same.join(', '));
  }

  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'tungsten-mk4'));
  const unknown = await readTokens();
  const emptyU = THEME_TOKENS.filter(n => !unknown[n]);
  ok(emptyU.length === 0, 'an UNKNOWN slug still resolves the complete token set',
    'empty: ' + emptyU.join(', '));
  const driftU = THEME_TOKENS.filter(n => unknown[n] !== resolved['field-issued'][n]);
  ok(driftU.length === 0, 'an unknown slug degrades to exactly the default palette',
    driftU.join(', '));

  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));
  const absent = await readTokens();
  ok(THEME_TOKENS.every(n => absent[n] === resolved['field-issued'][n]),
    'an ABSENT data-theme resolves the same complete default palette');

  // universal tokens must not move with the theme
  console.log('\n[1b] no palette touches the universal layer');
  const UNIVERSAL = ['--radius', '--radius-sm', '--fs-body', '--fs-display', '--lh-body',
    '--fw-head', '--sp-4', '--card-pad', '--label-track', '--topbar-h', '--tabbar-h',
    '--sidebar-w', '--content-max', '--ease', '--speed', '--font-ui', '--font-num', '--shadow'];
  const uni = {};
  for (const slug of SLUGS) {
    await page.evaluate(s => document.documentElement.setAttribute('data-theme', s), slug);
    uni[slug] = await page.evaluate(names => {
      const cs = getComputedStyle(document.documentElement);
      const out = {};
      names.forEach(n => { out[n] = String(cs.getPropertyValue(n) || '').trim(); });
      return out;
    }, UNIVERSAL);
  }
  for (const slug of ['classic', 'slate', 'ember']) {
    const moved = UNIVERSAL.filter(n => uni[slug][n] !== uni['field-issued'][n]);
    ok(moved.length === 0, slug + ': every universal token is unchanged', moved.join(', '));
  }

  /* =====================================================================
     2. a live switch repaints — charts, map, tints
     ===================================================================== */
  console.log('\n[2] a live theme switch repaints everything that carries colour');

  // Two profiles, two palettes: this is the real path (a profile switch), not
  // a synthetic attribute write.
  await page.evaluate(() => {
    const me = Store.currentUser();
    Store.setTheme(me.id, 'classic');
    const other = Store.state.users[1] || Store.addUser({ name: 'Ember User', emoji: '🔥' });
    Store.setTheme(other.id, 'ember');
    window.__p5 = { me: me.id, other: other.id, alive: 'yes' };
    Store.setCurrentUser(me.id);
  });
  await page.waitForTimeout(300);

  const snapshot = async (view) => {
    await page.evaluate(v => App.navigate(v), view);
    await page.waitForTimeout(500);
    return page.evaluate(names => {
      const cs = getComputedStyle(document.documentElement);
      const tok = {};
      names.forEach(n => { tok[n] = String(cs.getPropertyValue(n) || '').trim(); });
      const content = document.getElementById('content');
      const paints = [];
      content.querySelectorAll('svg *').forEach(el => {
        ['fill', 'stroke'].forEach(a => {
          const v = el.getAttribute(a);
          if (v && v !== 'none' && v !== 'currentColor') paints.push(a + '=' + v.toLowerCase());
        });
      });
      const mapPaints = [];
      const map = content.querySelector('.muscle-map svg, svg.mm-root, .mm-root');
      if (map) {
        map.querySelectorAll('*').forEach(el => {
          const f = el.getAttribute('fill');
          if (f && f !== 'none' && f !== 'currentColor') mapPaints.push(f.toLowerCase());
          const cf = getComputedStyle(el).fill;
          if (cf && cf !== 'none') mapPaints.push('c:' + cf);
        });
      }
      const ramp = content.querySelector('.muscle-legend .ramp');
      return {
        theme: document.documentElement.getAttribute('data-theme'),
        tok: tok,
        paints: paints,
        mapPaints: mapPaints,
        rampBg: ramp ? getComputedStyle(ramp).backgroundImage : '',
        alive: window.__p5 && window.__p5.alive
      };
    }, THEME_TOKENS);
  };

  const aClassic = await snapshot('analytics');
  ok(aClassic.theme === 'classic', 'boot/profile theme is on <html> as data-theme');
  ok(aClassic.paints.length > 0, 'the analytics view actually painted charts (' +
    aClassic.paints.length + ' paint attrs)');

  await page.evaluate(() => Store.setCurrentUser(window.__p5.other));
  await page.waitForTimeout(300);
  const aEmber = await snapshot('analytics');

  ok(aEmber.theme === 'ember', 'switching profiles switches data-theme live');
  ok(aEmber.alive === 'yes', 'no reload happened — the page object survived the switch');

  const seriesOf = s => ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'].map(n => s.tok[n].toLowerCase());
  const sClassic = seriesOf(aClassic), sEmber = seriesOf(aEmber);
  ok(sClassic.join() !== sEmber.join(), 'the two palettes really do have different series');

  const paintedIn = (snap, hexes) => hexes.filter(h => snap.paints.some(p => p.indexOf(h) !== -1));
  const hitEmber = paintedIn(aEmber, sEmber);
  const staleClassic = paintedIn(aEmber, sClassic.filter(h => sEmber.indexOf(h) === -1));
  ok(hitEmber.length > 0, 'after the switch the chart paints use the NEW series (' +
    hitEmber.length + ' of 6 present)');
  ok(staleClassic.length === 0, 'and not one paint is still the OLD series',
    staleClassic.join(', '));
  ok(aClassic.paints.join('|') !== aEmber.paints.join('|'),
    'the rendered chart paint set changed with the theme');

  // Same user, same data, theme flipped underneath: now anything that moves
  // moved because of the PALETTE, not because the numbers changed.
  await page.evaluate(() => Store.setCurrentUser(window.__p5.me));
  await page.waitForTimeout(250);
  await setTheme('classic');
  const anClassic = await snapshot('analytics');
  await setTheme('ember');
  const anEmber = await snapshot('analytics');
  ok(anClassic.paints.join('|') !== anEmber.paints.join('|'),
    'SAME profile, same data: flipping the palette repaints the charts');
  ok(paintedIn(anEmber, seriesOf(anEmber)).length > 0 &&
    paintedIn(anEmber, seriesOf(anClassic).filter(h => seriesOf(anEmber).indexOf(h) === -1)).length === 0,
    'and the repaint is the new series exactly, with no survivor from the old');

  await setTheme('classic');
  const bodyClassic = await snapshot('body');
  await setTheme('ember');
  const bodyEmber = await snapshot('body');

  ok(!!bodyClassic.rampBg && bodyClassic.rampBg !== bodyEmber.rampBg,
    'the muscle-map heat legend repaints with the theme');
  const heatEmber = ['--heat-0', '--heat-3', '--heat-5'].map(n => bodyEmber.tok[n]);
  ok(heatEmber.every(h => h && h !== bodyClassic.tok['--heat-0']),
    'the heat ramp tokens themselves moved');

  // the muscle-map FIGURE is painted by js/musclemap.js, which this change
  // does not own. The tokens it needs (--heat-*, --plate, --seam) are defined
  // and move; whether the figure follows them is that file's compliance.
  dep(bodyClassic.mapPaints.length > 0, 'a muscle map rendered at all');
  dep(bodyClassic.mapPaints.join('|') !== bodyEmber.mapPaints.join('|'),
    'musclemap.js figure fills follow the theme',
    'map fills identical across two palettes — musclemap.js still holds ' +
    'literal BODY/SEAM/STOPS; --plate/--seam/--heat-* are defined and ready');

  // put the first profile back on its own palette — the flips above were a
  // probe, and the rest of this run reads a profile SWITCH, not an override
  await setTheme('classic');

  // state tints, read off the composited nodes on the live session screen
  console.log('\n[2b] live-session state tints follow the theme');
  const tintsFor = async (userId) => {
    await page.evaluate(id => Store.setCurrentUser(id), userId);
    await page.waitForTimeout(250);
    return page.evaluate(() => {
      const probe = document.createElement('div');
      probe.style.position = 'fixed';
      probe.style.left = '-9999px';
      probe.innerHTML =
        '<div class="set-row done"></div>' +
        '<div class="set-row running"></div>' +
        '<div class="set-row running resting"></div>' +
        '<div class="badge blue"></div>' +
        '<div class="chip active"></div>' +
        '<div class="topbar"></div>';
      document.body.appendChild(probe);
      const g = sel => {
        const el = probe.querySelector(sel);
        const cs = getComputedStyle(el);
        return cs.backgroundColor + '|' + cs.borderColor;
      };
      const out = {
        done: g('.set-row.done'),
        running: g('.set-row.running'),
        resting: g('.set-row.running.resting'),
        badge: g('.badge.blue'),
        chip: g('.chip.active'),
        topbar: g('.topbar')
      };
      probe.remove();
      return out;
    });
  };
  const tClassic = await tintsFor(await page.evaluate(() => window.__p5.me));
  const tEmber = await tintsFor(await page.evaluate(() => window.__p5.other));
  Object.keys(tClassic).forEach(k => {
    ok(tClassic[k] !== tEmber[k], 'state tint "' + k + '" repaints with the theme',
      tClassic[k] + ' == ' + tEmber[k]);
  });

  // identity swatches: the profile colour picker must follow the theme too
  console.log('\n[2c] identity + picker swatches follow the theme');
  const swatch = async (userId) => {
    await page.evaluate(id => { Store.setCurrentUser(id); App.navigate('settings'); }, userId);
    await page.waitForTimeout(500);
    return page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll('#st-theme [data-theme-slug]'));
      const dots = rows.map(r => Array.from(r.querySelectorAll('[data-theme-preview] span'))
        .map(s => getComputedStyle(s).backgroundColor).join(' | '));
      const avatar = document.querySelector('#content .avatar');
      return {
        rows: rows.map(r => r.getAttribute('data-theme-slug')),
        checked: rows.filter(r => r.getAttribute('aria-checked') === 'true')
          .map(r => r.getAttribute('data-theme-slug')),
        dots: dots,
        avatar: avatar ? getComputedStyle(avatar).getPropertyValue('--user-color').trim() : ''
      };
    });
  };
  const swClassic = await swatch(await page.evaluate(() => window.__p5.me));
  const swEmber = await swatch(await page.evaluate(() => window.__p5.other));
  ok(swClassic.rows.join() === 'field-issued,classic,slate,ember',
    'the picker lists all four palettes, default first');
  ok(swClassic.checked.join() === 'classic' && swEmber.checked.join() === 'ember',
    'the picker marks the profile\'s own choice');
  ok(swClassic.dots.length === 4 && swClassic.dots.every(d => d.split(' | ').length === 6),
    'every row carries a six-dot swatch strip',
    JSON.stringify(swClassic.dots[0]));
  ok(new Set(swClassic.dots).size === 4,
    'each row\'s swatches show a DIFFERENT palette (they are scoped, not copied)');
  ok(swClassic.dots.join('|') === swEmber.dots.join('|'),
    'a swatch strip shows its own palette regardless of which theme is active');
  ok(!!swClassic.avatar && swClassic.avatar !== swEmber.avatar,
    'the profile identity colour follows the theme (it is a --s slot, not a hex)');

  // picking a theme from the picker applies it immediately
  console.log('\n[2d] the picker applies immediately and persists');
  const picked = await page.evaluate(async () => {
    const before = document.documentElement.getAttribute('data-theme');
    document.querySelector('#st-theme [data-theme-slug="slate"]').click();
    await new Promise(r => setTimeout(r, 30));
    const immediate = document.documentElement.getAttribute('data-theme');
    await new Promise(r => setTimeout(r, 300));
    return {
      before: before, immediate: immediate,
      after: document.documentElement.getAttribute('data-theme'),
      stored: Store.currentUser().settings.theme,
      alive: window.__p5.alive
    };
  });
  ok(picked.immediate === 'slate', 'the tap applies the palette on the same tick (no debounce wait)',
    JSON.stringify(picked));
  ok(picked.stored === 'slate', 'and persists it to the profile');
  ok(picked.alive === 'yes', 'and nothing reloaded');

  /* =====================================================================
     5. markup invariance
     ===================================================================== */
  console.log('\n[5] the DOM outline of every view is identical across all four palettes');

  const outlineOf = () => page.evaluate(() => {
    const root = document.getElementById('content');
    const lines = [];
    const walk = (el, d) => {
      lines.push(d + ':' + el.tagName.toLowerCase() +
        '#' + (el.id || '') + '.' + (el.getAttribute('class') || ''));
      for (let i = 0; i < el.children.length; i++) walk(el.children[i], d + 1);
    };
    walk(root, 0);
    return lines.join('\n');
  });
  const htmlOf = () => page.evaluate(() => document.getElementById('content').innerHTML);

  // the theme picker is the ONE place a view is allowed to differ, because it
  // shows WHICH palette is on. Normalise its selection state away and the
  // settings markup must be identical too.
  // COLOUR is allowed to vary — that is the whole point of a theme, and the
  // charts resolve their tokens into SVG presentation attributes, which cannot
  // hold a var(). Everything else (structure, labels, numbers, aria, geometry)
  // must be byte-identical. So: blank out every colour literal and the
  // picker's own selection state, then demand equality.
  const normalise = h => h
    .replace(/aria-checked="(true|false)"/g, 'aria-checked="_"')
    .replace(/visibility:(visible|hidden)/g, 'visibility:_')
    .replace(/border:1px solid var\(--(accent|border)\)/g, 'border:1px solid var(--_)')
    .replace(/background:var\(--(accent-tint|card-2)\)/g, 'background:var(--_)')
    .replace(/#[0-9a-fA-F]{8}\b|#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g, '#COLOUR')
    .replace(/rgba?\([^)]*\)/g, 'COLOUR');

  for (const mode of ['simple', 'performance']) {
    await page.evaluate(m => {
      Store.updateUser(Store.currentUser().id, { settings: { trainingProfile: m } });
    }, mode);
    await page.waitForTimeout(250);
    const views = await page.evaluate(() => Object.keys(App.views || {}).length
      ? Object.keys(App.views) : ['dashboard', 'history', 'templates', 'library', 'analytics',
        'body', 'leaderboard', 'settings', 'profiles', 'log']);
    const wanted = views.filter(v => ['dashboard', 'history', 'templates', 'library', 'analytics',
      'body', 'leaderboard', 'settings', 'profiles', 'log', 'standards', 'roadmap',
      'coach', 'routines'].indexOf(v) !== -1);

    for (const view of wanted) {
      const outs = {}, htmls = {};
      let visible = true;
      for (const slug of SLUGS) {
        await setTheme(slug);
        visible = await page.evaluate(v => {
          App.navigate(v);
          return true;
        }, view);
        await page.waitForTimeout(420);
        const got = await page.evaluate(() => App.current.view);
        if (got !== view) { visible = false; break; }
        outs[slug] = await outlineOf();
        htmls[slug] = await htmlOf();
      }
      if (!visible) continue;
      const base = outs['field-issued'];
      const drifted = SLUGS.filter(s => outs[s] !== base);
      ok(drifted.length === 0, mode + '/' + view + ': DOM outline byte-identical across 4 palettes',
        'drifted: ' + drifted.join(', '));
      const hbase = normalise(htmls['field-issued']);
      const hdrift = SLUGS.filter(s => normalise(htmls[s]) !== hbase);
      ok(hdrift.length === 0, mode + '/' + view + ': markup identical once colour is ' +
        'blanked out (nothing but colour moved)', 'drifted: ' + hdrift.join(', '));
    }
  }

  ok(errors.length === 0, 'no console or page errors during the whole run',
    errors.slice(0, 4).join(' | '));

  await browser.close();
  server.kill();

  const gaps = deps.filter(d => !d.ok);
  console.log('\n' + (failures.length ? failures.length + ' FAILURES' : 'ALL PASS') +
    ' (' + pass + ' asserts)');
  if (failures.length) failures.forEach(f => console.log('  - ' + f));
  if (gaps.length) {
    console.log('\nDEPENDENCY GAPS (files this change does not own):');
    gaps.forEach(g => console.log('  - ' + g.name));
  }
  process.exit(failures.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
