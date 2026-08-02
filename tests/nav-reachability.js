// Reachability measured in TAPS, not in DOM presence.
//
// The previous version of this test counted anchors and passed while Coach,
// Standards, Body and Leaderboard were sealed inside a display:none sidebar on
// every phone. Presence is not reachability. This walks the visible chrome and
// the More sheet the way a thumb does.
const P = require('./lib/paths');
const { chromium } = P.playwright();
const { serve } = require('./lib/hport');

const MUST_REACH = ['dashboard','history','library','analytics','body','standards','coach','leaderboard','settings','profiles'];

(async () => {
  const server = await serve(P.GYM);
  let pass = 0; const fails = [];
  function ok(c,m){ if(c) pass++; else fails.push(m); }

  const b = await chromium.launch({ executablePath: P.chromiumPath() });

  async function run(width, label) {
    const c = await b.newContext({ viewport:{width:width,height:844}, serviceWorkers:'block' });
    const p = await c.newPage();
    const errs=[]; p.on('pageerror', function(e){ errs.push(e.message); });
    await p.goto('http://127.0.0.1:' + server.port + '/', { waitUntil:'load' });
    await p.waitForTimeout(800);
    await p.evaluate(function () {
      Store.seedDemo();
      const u = Store.state.users.find(function(x){return x.name==='Erfan';}) || Store.state.users[0];
      Store.setCurrentUser(u.id);
      Store.updateUser(u.id,{settings:Object.assign({},u.settings,{trainingProfile:'performance'})});
      Coach.setKey('sk-ant-api03-REACH-0000');
    });

    for (const view of MUST_REACH) {
      await p.evaluate(function(){ App.navigate('dashboard'); });
      await p.waitForTimeout(220);
      // close anything left open
      await p.keyboard.press('Escape').catch(function(){});
      await p.waitForTimeout(120);

      const taps = await p.evaluate(function (target) {
        function visible(el) {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && el.offsetParent !== null &&
            getComputedStyle(el).visibility !== 'hidden';
        }
        function findDirect() {
          return Array.from(document.querySelectorAll('a[href="#/' + target + '"]')).filter(visible)[0];
        }
        // 1 tap: a visible link in the chrome. CLICK it — an earlier version
        // of this test located the link and returned without tapping, so every
        // "did it actually land" assertion failed for the wrong reason.
        const direct = findDirect();
        if (direct) { direct.click(); return 1; }

        // 2 taps: through the More sheet
        const more = document.querySelector('#tab-more');
        if (visible(more)) {
          more.click();
          const row = Array.from(document.querySelectorAll('[data-go="' + target + '"]')).filter(visible)[0];
          if (row) { row.click(); return 2; }
        }
        // 2 taps: through the avatar menu
        const av = document.querySelector('#user-btn');
        if (visible(av)) {
          av.click();
          const row = Array.from(document.querySelectorAll('[data-settings],[data-manage]')).filter(visible)
            .filter(function (b2) {
              return (target === 'settings' && b2.hasAttribute('data-settings')) ||
                     (target === 'profiles' && b2.hasAttribute('data-manage'));
            })[0];
          if (row) { row.click(); return 2; }
        }
        return 99;
      }, view);

      await p.waitForTimeout(450);
      const landed = await p.evaluate(function(){ return location.hash; });
      ok(taps <= 2, label + ': ' + view + ' reachable in <=2 taps (took ' + (taps===99?'NO PATH':taps) + ')');
      if (taps <= 2) ok(landed.indexOf(view) !== -1, label + ': tapping through actually lands on ' + view + ' (got ' + landed + ')');
    }
    ok(errs.length===0, label + ': no page errors — ' + errs.slice(0,2).join(' | '));
    await c.close();
  }

  await run(390, 'phone');
  await run(1100, 'desktop');

  console.log('passed:', pass);
  if (fails.length) fails.forEach(function(f){ console.log('FAIL:', f); });
  await b.close(); if (server.close) server.close();
  console.log(fails.length ? 'FAIL: reachability' : 'PASS: reachability (' + pass + ' assertions)');
  process.exit(fails.length?1:0);
})().catch(function(e){ console.error('HARNESS:', e.message); process.exit(2); });
