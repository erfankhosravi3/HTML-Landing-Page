/* Where the app is, computed rather than hardcoded.

   Every suite used to carry the literal string /home/user/HTML-Landing-Page/gym,
   which is true in exactly one container and nowhere else. A test that only
   runs on the machine that wrote it is a test nobody will ever run again.

   Also resolves Playwright, which is installed globally in this environment
   rather than in the repo — require('playwright') from here would throw. */
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..', '..');
const GYM = path.join(REPO, 'gym');
const JS = path.join(GYM, 'js');

function playwright() {
  const tries = [
    'playwright',
    '/opt/node22/lib/node_modules/playwright',
    path.join(REPO, 'node_modules', 'playwright')
  ];
  for (let i = 0; i < tries.length; i++) {
    try { return require(tries[i]); } catch (e) { /* next */ }
  }
  throw new Error('Playwright not found. Browser suites need it:\n' +
    '  npm i -g playwright   (browsers are pre-installed in the dev container)');
}

// The pre-installed Chromium. Falls back to whatever Playwright would pick.
function chromiumPath() {
  const pinned = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (fs.existsSync(pinned)) return pinned;
  const dir = '/opt/pw-browsers';
  if (fs.existsSync(dir)) {
    const hit = fs.readdirSync(dir)
      .filter(function (d) { return d.indexOf('chromium') === 0; })
      .map(function (d) { return path.join(dir, d, 'chrome-linux', 'chrome'); })
      .filter(function (p) { return fs.existsSync(p); });
    if (hit.length) return hit[hit.length - 1];
  }
  return undefined; // let Playwright decide
}

module.exports = { REPO: REPO, GYM: GYM, JS: JS,
  playwright: playwright, chromiumPath: chromiumPath };
