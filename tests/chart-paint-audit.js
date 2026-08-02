/* End-to-end audit of the ACTUAL rendered chart paints.
   - enumerates every SVG paint attribute on every chart surface
   - asserts series colours equal the computed --s1..--s6, in order
   - measures axis/tick text against its real composited background
   - re-runs the CVD (CIEDE2000) search on the colours actually painted
   Run: node chart-paint-audit.js */
const P = require('./lib/paths');
const { chromium } = P.playwright();
const { serve } = require('./lib/hport');
const cvd = require('./lib/cvd/cvd.js');

const ROOT = P.GYM;

let pass = 0;
const failures = [];
function ok(cond, name) {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { failures.push(name); console.error('  FAIL ' + name); }
}

function toHex(c) {
  const s = String(c || '').trim();
  if (s.charAt(0) === '#') {
    const h = s.slice(1);
    const f = h.length === 3 ? h.split('').map(function (x) { return x + x; }).join('') : h;
    return '#' + f.toLowerCase();
  }
  const m = s.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(parseFloat);
    return '#' + p.slice(0, 3).map(function (v) {
      return Math.round(v).toString(16).padStart(2, '0');
    }).join('');
  }
  return null;
}

// composite src (with alpha) over dst
function over(srcHex, a, dstHex) {
  const s = srcHex.replace('#', '').match(/../g).map(function (h) { return parseInt(h, 16); });
  const d = dstHex.replace('#', '').match(/../g).map(function (h) { return parseInt(h, 16); });
  return '#' + s.map(function (v, i) {
    return Math.round(v * a + d[i] * (1 - a)).toString(16).padStart(2, '0');
  }).join('');
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
  page.on('console', function (m) { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', function (e) { errors.push('[pageerror] ' + e.message); });

  await page.goto('http://127.0.0.1:' + server.port + '/', { waitUntil: 'load' });
  await page.evaluate(function () { Store.seedDemo(); });
  await page.waitForTimeout(400);
  await page.evaluate(function () {
    const u = Store.state.users.find(function (x) { return x.name === 'Erfan'; }) || Store.state.users[0];
    Store.setCurrentUser(u.id);
    // drop the weekly set goal so the muscle-balance chart actually has
    // meets-target bars to inspect (the seed never clears the default 15)
    Store.updateUser(u.id, { settings: Object.assign({}, u.settings, { weeklySetGoal: 2 }) });
  });

  const tokens = await page.evaluate(function () {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6', '--accent', '--card', '--card-2', '--bg',
     '--text', '--text-2', '--text-muted', '--hairline', '--border', '--yellow'].forEach(function (k) {
      out[k] = cs.getPropertyValue(k).trim();
    });
    return out;
  });
  console.log('\nTOKENS ' + JSON.stringify(tokens, null, 0) + '\n');

  const S = ['--s1', '--s2', '--s3', '--s4', '--s5', '--s6'].map(function (k) { return toHex(tokens[k]); });

  /* ---- collect paints per chart slot across every view ---- */
  async function grab(view, waitMs) {
    await page.evaluate(function (v) { App.navigate(v); }, view);
    await page.waitForTimeout(waitMs || 1400);
    return page.evaluate(function () {
      function slotName(el) {
        let n = el;
        while (n && n !== document.body) {
          if (n.getAttribute && n.getAttribute('data-slot')) return n.getAttribute('data-slot');
          n = n.parentElement;
        }
        return 'unknown';
      }
      const out = {};
      Array.from(document.querySelectorAll('.view svg')).forEach(function (svg) {
        const name = slotName(svg);
        const rec = out[name] || (out[name] = { fills: [], strokes: [], texts: [] });
        Array.from(svg.querySelectorAll('*')).forEach(function (n) {
          const f = n.getAttribute('fill');
          const st = n.getAttribute('stroke');
          if (f && f !== 'none' && f !== 'transparent') rec.fills.push(f);
          if (st && st !== 'none') rec.strokes.push(st);
          if (n.tagName.toLowerCase() === 'text') {
            const cs = getComputedStyle(n);
            const r = n.getBoundingClientRect();
            rec.texts.push({ fill: n.getAttribute('fill'), size: cs.fontSize, t: n.textContent,
                             x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
          }
        });
        // legend swatches live in sibling HTML
        const host = svg.closest('[data-slot]') || svg.parentElement;
        if (host) {
          Array.from(host.querySelectorAll('span[style*="background"]')).forEach(function (sp) {
            rec.fills.push(getComputedStyle(sp).backgroundColor);
          });
        }
      });
      return out;
    });
  }

  const views = {};
  views.dashboard = await grab('dashboard');
  views.analytics = await grab('analytics', 2000);
  views.body = await grab('body');
  views.leaderboard = await grab('leaderboard');

  const allSlots = {};
  Object.keys(views).forEach(function (v) {
    Object.keys(views[v]).forEach(function (k) { allSlots[v + '/' + k] = views[v][k]; });
  });

  console.log('--- RENDERED PAINTS PER CHART SLOT ---');
  const seriesLike = new Set();
  Object.keys(allSlots).sort().forEach(function (k) {
    const r = allSlots[k];
    const fills = Array.from(new Set(r.fills.map(toHex).filter(Boolean)));
    const strokes = Array.from(new Set(r.strokes.map(toHex).filter(Boolean)));
    console.log('  ' + k + '\n     fills   ' + JSON.stringify(fills) + '\n     strokes ' + JSON.stringify(strokes));
  });

  /* ---- 1. series colours equal --s1..--s6, in order ---- */
  const seriesChecks = [
    ['analytics/e1rm-chart', 1], ['analytics/vol-chart', 1], ['analytics/rep-donut', 3],
    ['analytics/p4-split', 2], ['analytics/p4-load', 1], ['dashboard/rings', 3],
    ['dashboard/spark-vol', 1],
    ['analytics/heat-cal', 1]
  ];
  /* leaderboard/family-chart is NOT in this list any more, and that is a fix,
     not a hole. It paints one line per member in that member's IDENTITY
     colour (ARCHITECTURE.md P5: identity is keyed off --s1..--s6, never the
     accent), so which slots appear depends on which members are on the
     podium — the demo family holds s5/s2/s3. Asserting "--s1..--s3 in order"
     pinned a pre-identity model and failed on correct output. The check below
     asserts what the contract actually says instead, and is strictly stronger:
     every line must BE some member's live identity colour. */
  seriesChecks.forEach(function (spec) {
    const key = spec[0], n = spec[1];
    const rec = allSlots[key];
    if (!rec) { ok(false, key + ': slot rendered'); return; }
    const paints = Array.from(new Set(rec.fills.concat(rec.strokes).map(toHex).filter(Boolean)));
    const hits = S.slice(0, n).filter(function (c) { return paints.indexOf(c) !== -1; });
    ok(hits.length === n, key + ': paints --s1..--s' + n + ' in order (' + hits.join(',') + ')');
    // no colour from the retired palette
    const retired = ['#2ca350', '#0a84ff', '#cf7c00', '#bf5af2', '#ff375f', '#3399cc', '#30d158',
                     '#6b7683', '#98a2ae', '#1b1f26', '#5a6472'];
    const bad = paints.filter(function (c) { return retired.indexOf(c) !== -1; });
    ok(bad.length === 0, key + ': no retired-palette paint (' + bad.join(',') + ')');
  });

  /* ---- 1b. the family chart wears member IDENTITY colours ---- */
  const identity = await page.evaluate(function () {
    return Store.state.users.map(function (u) {
      return { name: u.name, hex: Store.userColorHex(u) };
    });
  });
  const idHex = identity.map(function (u) { return toHex(u.hex); });
  const fam = allSlots['leaderboard/family-chart'];
  if (fam) {
    const paints = Array.from(new Set(fam.fills.concat(fam.strokes).map(toHex).filter(Boolean)));
    const lines = paints.filter(function (c) { return S.indexOf(c) !== -1; });
    ok(lines.length >= 2, 'family-chart: paints at least two series-slot colours (' +
      lines.join(',') + ')');
    const notIdentity = lines.filter(function (c) { return idHex.indexOf(c) === -1; });
    ok(notIdentity.length === 0,
      'family-chart: every line is a member identity colour (' + idHex.join(',') + ')',
      'unexplained: ' + notIdentity.join(','));
    ok(paints.indexOf(toHex(tokens['--accent'])) === -1,
      'family-chart: no line borrows the GO accent');
    const retiredFam = ['#2ca350', '#0a84ff', '#cf7c00', '#bf5af2', '#ff375f', '#3399cc', '#30d158'];
    ok(paints.filter(function (c) { return retiredFam.indexOf(c) !== -1; }).length === 0,
      'family-chart: no retired-palette paint');
  } else ok(false, 'leaderboard/family-chart slot rendered');

  const hr = allSlots['dashboard/p4-hr-spark'];
  if (hr) {
    const paints = Array.from(new Set(hr.fills.concat(hr.strokes).map(toHex).filter(Boolean)));
    ok(paints.indexOf(S[1]) !== -1 || paints.indexOf(S[4]) !== -1,
      'dashboard/p4-hr-spark: paints --s2 (calm) or --s5 (spike) (' + paints.join(',') + ')');
  } else ok(false, 'p4-hr-spark slot rendered');

  /* muscle-balance: meets-target must be --accent, never a series colour */
  const bal = allSlots['analytics/balance-bars'];
  if (bal) {
    const paints = Array.from(new Set(bal.fills.map(toHex).filter(Boolean)));
    ok(paints.indexOf(toHex(tokens['--accent'])) !== -1,
      'balance-bars: meets-target bars paint --accent (' + paints.join(',') + ')');
    ok(paints.indexOf(S[0]) === -1, 'balance-bars: no longer wears the series-1 colour');
  } else ok(false, 'balance-bars slot rendered');

  /* ---- 2. axis/tick text contrast against its real composited background ---- */
  const mutedHex = toHex(tokens['--text-muted']);
  const text2Hex = toHex(tokens['--text-2']);
  let tickNodes = 0, worstText = { ratio: 99, where: '' };
  const bgProbe = await page.evaluate(function () {
    // walk up from a tick text node to the first opaque background
    function bgOf(el) {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = getComputedStyle(n).backgroundColor;
        if (c && c !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(c)) return c;
        n = n.parentElement;
      }
      return getComputedStyle(document.body).backgroundColor;
    }
    const t = document.querySelector('.view svg text');
    return t ? bgOf(t) : null;
  });
  const cardHex = toHex(bgProbe) || toHex(tokens['--card']);
  Object.keys(allSlots).forEach(function (k) {
    allSlots[k].texts.forEach(function (t) {
      const f = toHex(t.fill);
      if (!f) return;
      tickNodes++;
      const r = cvd.ratio(f, cardHex);
      if (r < worstText.ratio) worstText = { ratio: r, where: k + ' "' + t.t + '" ' + f };
    });
  });
  console.log('\n--- AXIS / TICK TEXT ---');
  console.log('  composited background under chart text: ' + bgProbe + ' -> ' + cardHex);
  console.log('  text nodes measured: ' + tickNodes);
  console.log('  --text-muted ' + mutedHex + ' on ' + cardHex + ' = ' + cvd.ratio(mutedHex, cardHex).toFixed(2) + ':1');
  console.log('  --text-2     ' + text2Hex + ' on ' + cardHex + ' = ' + cvd.ratio(text2Hex, cardHex).toFixed(2) + ':1');
  console.log('  worst measured text node: ' + worstText.ratio.toFixed(2) + ':1  ' + worstText.where);
  ok(worstText.ratio >= 4.5, 'every rendered chart text node clears 4.5:1 on its real background');

  /* ---- 3. CVD on the colours ACTUALLY painted ---- */
  const painted = [];
  Object.keys(allSlots).forEach(function (k) {
    allSlots[k].fills.concat(allSlots[k].strokes).map(toHex).forEach(function (c) {
      if (c && S.indexOf(c) !== -1 && painted.indexOf(c) === -1) painted.push(c);
    });
  });
  painted.sort(function (a, b) { return S.indexOf(a) - S.indexOf(b); });
  console.log('\n--- CVD ON ACTUALLY-PAINTED SERIES COLOURS (' + painted.length + ') ---');
  console.log('  ' + JSON.stringify(painted));
  const models = [
    ['normal', function (h) { return h; }],
    ['protanopia (Vienot)', function (h) { return cvd.vienot(h, 'prot'); }],
    ['deuteranopia (Vienot)', function (h) { return cvd.vienot(h, 'deut'); }],
    ['tritanopia (Vienot)', function (h) { return cvd.vienot(h, 'trit'); }],
    ['protanopia (Machado)', function (h) { return cvd.machado(h, 'prot'); }],
    ['deuteranopia (Machado)', function (h) { return cvd.machado(h, 'deut'); }],
    ['tritanopia (Machado)', function (h) { return cvd.machado(h, 'trit'); }]
  ];
  let globalWorst = { d: Infinity, model: '', a: '', b: '' };
  models.forEach(function (m) {
    let worst = { d: Infinity, a: '', b: '' };
    for (let i = 0; i < painted.length; i++) {
      for (let j = i + 1; j < painted.length; j++) {
        const d = cvd.de2000(m[1](painted[i]), m[1](painted[j]));
        if (d < worst.d) worst = { d: d, a: painted[i], b: painted[j] };
      }
    }
    console.log('  ' + m[0].padEnd(24) + ' worst dE2000 = ' + worst.d.toFixed(2) +
      '  (' + worst.a + ' vs ' + worst.b + ')');
    if (worst.d < globalWorst.d) globalWorst = { d: worst.d, model: m[0], a: worst.a, b: worst.b };
  });
  console.log('\n  END-TO-END WORST-CASE CIEDE2000 (rendered paints) = ' + globalWorst.d.toFixed(2) +
    '  [' + globalWorst.model + ': ' + globalWorst.a + ' vs ' + globalWorst.b + ']');
  ok(globalWorst.d >= 9.0, 'rendered worst-case CIEDE2000 >= 9.0 (measured ' + globalWorst.d.toFixed(2) + ')');

  function worstOver(list) {
    let w = Infinity, tag = '';
    models.forEach(function (m) {
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const d = cvd.de2000(m[1](list[i]), m[1](list[j]));
          if (d < w) { w = d; tag = m[0] + ' ' + list[i] + '/' + list[j]; }
        }
      }
    });
    return w.toFixed(2) + ' [' + tag + ']';
  }
  console.log('  reference · all six --s1..--s6 tokens : ' + worstOver(S));
  console.log('  reference · RETIRED shipped SERIES   : ' +
    worstOver(['#2ca350', '#0a84ff', '#cf7c00', '#bf5af2', '#ff375f', '#3399cc']));

  /* ---- 4. theme-following: flip a token live, re-render, colours follow ---- */
  /* The override goes on the ROOT'S INLINE STYLE, not on a made-up
     data-theme slug. app.js now owns that attribute — applyTheme() rewrites it
     from the profile's theme on every render — so a synthetic ":root[data-theme
     ='probe']" block is wiped the moment the app repaints, and this check
     silently measured the default palette. An inline custom property outranks
     every stylesheet block and survives the rewrite, so the assertion below
     tests what it always meant to test: a token moving under a live app. */
  const themed = await page.evaluate(async function () {
    document.documentElement.style.setProperty('--s1', '#ff00ff');
    document.documentElement.style.setProperty('--text-muted', '#00ffff');
    App.navigate('dashboard');
    await new Promise(function (r) { setTimeout(r, 200); });
    App.navigate('analytics');
    await new Promise(function (r) { setTimeout(r, 1600); });
    const svg = document.querySelector('[data-slot="vol-chart"] svg');
    const paints = svg ? Array.from(svg.querySelectorAll('path')).map(function (p) { return p.getAttribute('stroke') || p.getAttribute('fill'); }) : [];
    const ticks = svg ? Array.from(svg.querySelectorAll('text')).map(function (t) { return t.getAttribute('fill'); }) : [];
    document.documentElement.style.removeProperty('--s1');
    document.documentElement.style.removeProperty('--text-muted');
    return { paints: paints, ticks: ticks };
  });
  ok(themed.paints.some(function (c) { return toHex(c) === '#ff00ff'; }),
    'series colour follows a live theme switch (' + JSON.stringify(Array.from(new Set(themed.paints))) + ')');
  ok(themed.ticks.some(function (c) { return toHex(c) === '#00ffff'; }),
    'tick text follows a live theme switch (' + JSON.stringify(Array.from(new Set(themed.ticks))) + ')');

  console.log('\n' + pass + ' passed, ' + failures.length + ' failed');
  if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
  ok(errors.length === 0, 'no console/page errors');
  await browser.close();
  if (server && typeof server.close === 'function') await server.close();
  process.exit(failures.length ? 1 : 0);
})();
