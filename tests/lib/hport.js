/* Ephemeral-port helper for the gym harnesses.

   WHY: several probes hardcoded a port (8963/8964/8791/8795/8974/8981...). A
   stale `python3 -m http.server` squatting one of those ports does NOT make
   spawn() fail — the second server exits, the first keeps answering, and the
   probe silently measures whatever tree that old server was rooted in. That is
   how p45-lift-bytediff once compared a P4.5 tree against itself and reported
   "byte-identical".

   serve(root) binds port 0 (the OS hands out a free port), waits until the
   server actually answers, and asserts the answer comes from THIS root by
   fetching a sentinel file. Callers get {port, url, kill}. */
const { spawn } = require('child_process');
const net = require('net');
const http = require('http');
const fs = require('fs');
const path = require('path');

function freePort() {
  return new Promise(function (res, rej) {
    const s = net.createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', function () {
      const p = s.address().port;
      s.close(function () { res(p); });
    });
  });
}

function get(url) {
  return new Promise(function (res, rej) {
    const req = http.get(url, function (r) {
      let b = '';
      r.on('data', function (c) { b += c; });
      r.on('end', function () { res({ status: r.statusCode, body: b }); });
    });
    req.on('error', rej);
    req.setTimeout(3000, function () { req.destroy(new Error('timeout')); });
  });
}

// Boot a static server for `root` on a guaranteed-free port and prove it is
// serving THAT root (byte-compare js/player.js's first 400 chars).
async function serve(root) {
  const sentinel = path.join(root, 'js/player.js');
  const want = fs.readFileSync(sentinel, 'utf8').slice(0, 400);
  for (let attempt = 0; attempt < 5; attempt++) {
    const port = await freePort();
    const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
      { cwd: root, stdio: 'ignore' });
    let live = false;
    for (let i = 0; i < 60; i++) {
      await new Promise(function (r) { setTimeout(r, 100); });
      try {
        const r = await get('http://127.0.0.1:' + port + '/js/player.js');
        if (r.status === 200) { live = true; break; }
      } catch (e) { /* not up yet */ }
    }
    if (live) {
      const r = await get('http://127.0.0.1:' + port + '/js/player.js');
      if (r.body.slice(0, 400) !== want) {
        server.kill();
        throw new Error('port ' + port + ' is served by a DIFFERENT tree than ' + root);
      }

      /* LEAK-PROOFING. Two independent failures conspired here and left 22
         orphaned servers running for up to two hours:

         1. This returned `kill` only, while every harness called
            `if (server.close) server.close()` — always falsy, so nothing was
            ever shut down and the guard silently did nothing. `close` is now
            an alias, so the calls that were already written start working.
         2. Even with the right name, a harness that throws or calls
            process.exit() first never runs its cleanup. So cleanup no longer
            depends on the harness remembering: the child is killed on parent
            exit, whatever the exit path.

         An API whose misuse is silent is a bad API; both halves are fixed. */
      let dead = false;
      function stop() {
        if (dead) return;
        dead = true;
        try { server.kill(); } catch (e) { /* already gone */ }
      }
      process.once('exit', stop);
      process.once('SIGINT', function () { stop(); process.exit(130); });
      process.once('SIGTERM', function () { stop(); process.exit(143); });
      process.once('uncaughtException', function (e) {
        stop();
        console.error('UNCAUGHT:', (e && e.message) || e);
        process.exit(1);
      });

      return {
        port: port,
        url: 'http://127.0.0.1:' + port + '/',
        kill: stop,
        close: stop,
        pid: server.pid
      };
    }
    server.kill();
  }
  throw new Error('could not start a server for ' + root);
}

/* A baseline tree is only a baseline if it IS the revision it claims to be.
   p45-head-gym drifting (or being regenerated from the wrong rev) is how a
   byte-diff ends up comparing a tree against itself. Throws on mismatch. */
function assertTreeIsRev(tree, rev, repo) {
  repo = repo || '/home/user/HTML-Landing-Page';
  const { execFileSync } = require('child_process');
  const os = require('os');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'baserev-'));
  execFileSync('bash', ['-c', 'cd ' + JSON.stringify(repo) + ' && git archive ' + rev +
    ' gym | tar -x -C ' + JSON.stringify(tmp)]);
  let diff = '';
  try {
    diff = execFileSync('diff', ['-rq', path.join(tmp, 'gym'), tree]).toString();
  } catch (e) {
    diff = String((e.stdout || '')) + String((e.stderr || ''));
  }
  execFileSync('rm', ['-rf', tmp]);
  if (diff.trim()) throw new Error('baseline ' + tree + ' is NOT git ' + rev + ':\n' + diff);
  return true;
}

module.exports = { serve: serve, freePort: freePort, assertTreeIsRev: assertTreeIsRev };
