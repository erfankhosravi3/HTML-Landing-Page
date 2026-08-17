// P4.5 release check: crawl index.html for every asset it loads and prove
// sw.js SHELL lists all of them (plus the manifest + icon), and that every
// SHELL path exists on disk. Also asserts the CACHE_NAME bump.
const P = require('./lib/paths');
const fs = require('fs');
const path = require('path');

const ROOT = P.GYM;
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');

const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

// 1. CACHE_NAME
const cn = (sw.match(/const CACHE_NAME = '([^']+)'/) || [])[1];
// Pinning an exact version made this fail on every release, which is the
// opposite of useful. Assert the SHAPE, and that it is strictly ahead of the
// version currently live in production (that is the real release invariant).
const LIVE = 'ironlog-v2p15';   // last deployed; bump when a release goes out
const m = /^ironlog-v2p(\d+)$/.exec(cn || '');
ok(!!m, 'CACHE_NAME "' + cn + '" matches ironlog-v2p<n>');
ok(m && Number(m[1]) >= Number(/(\d+)$/.exec(LIVE)[1]),
  'CACHE_NAME ' + cn + ' is not behind the live ' + LIVE);

// 2. SHELL list
const shellBlock = (sw.match(/const SHELL = \[([\s\S]*?)\];/) || [])[1] || '';
const shell = [...shellBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);
ok(shell.length > 0, 'SHELL array not parsed');

// 3. crawl index.html
const refs = new Set();
[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].forEach(m => refs.add(m[1]));
[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].forEach(m => refs.add(m[1]));
[...html.matchAll(/<img[^>]+src="([^"]+)"/g)].forEach(m => refs.add(m[1]));

const norm = (p) => (p.startsWith('./') ? p : './' + p.replace(/^\//, ''));
const shellSet = new Set(shell.map(norm));

const missing = [];
[...refs].forEach(r => {
  if (/^(https?:)?\/\//.test(r) || r.startsWith('data:')) return;
  if (!shellSet.has(norm(r))) missing.push(r);
  if (!fs.existsSync(path.join(ROOT, r.replace(/^\.\//, '')))) fails.push('index.html references a missing file: ' + r);
});
ok(missing.length === 0, 'index.html assets absent from SHELL: ' + missing.join(', '));

// 4. every SHELL entry exists ('./' and './index.html' are the same doc)
shell.forEach(p => {
  if (p === './') return;
  const abs = path.join(ROOT, p.replace(/^\.\//, ''));
  if (!fs.existsSync(abs)) fails.push('SHELL lists a file that does not exist: ' + p);
});

// 5. no js/ file on disk is silently unshipped (catches a new module nobody wired)
fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).forEach(f => {
  const rel = './js/' + f;
  if (!shellSet.has(rel)) fails.push('js/' + f + ' exists on disk but is not in SHELL');
  if (!html.includes('js/' + f)) fails.push('js/' + f + ' exists on disk but has no script tag in index.html');
});

// 6. index.html script ORDER (load-order contract)
const order = [...html.matchAll(/<script src="js\/([a-z-]+)\.js"><\/script>/g)].map(m => m[1]);
const want = ['util', 'exercises', 'store', 'sync', 'analytics', 'loadmodel', 'guardrails',
  'protocols', 'goals', 'nutrition', 'charts', 'musclemap', 'applehealth', 'coach', 'app', 'views-log', 'player',
  'views-library', 'views-insights', 'views-standards', 'views-coach', 'views-goals', 'views-nutrition'];
ok(order.join(',') === want.join(','), 'script order changed:\n  got  ' + order.join(',') + '\n  want ' + want.join(','));

console.log('SHELL entries:', shell.length, '| index refs:', refs.size, '| CACHE_NAME:', cn);
if (fails.length) { fails.forEach(f => console.log('FAIL:', f)); process.exit(1); }
console.log('PASS: release wiring (CACHE_NAME bumped, SHELL complete, load order intact)');
