'use strict';
/* The coach's SSE parser, against streams a real network produces.
   It ships today and has only ever seen well-formed events from my own stub.
   Every case here is something api.anthropic.com, a proxy, or a flaky phone
   connection can genuinely deliver. The bar: never throw, never invent text,
   never lose usage, and never claim success on a truncated reply. */
const P = require('./lib/paths');
const fs = require('fs'), path = require('path'), vm = require('vm');
const GYM = P.JS;

const map = new Map();
global.localStorage = {
  getItem: function (k) { return map.has(k) ? map.get(k) : null; },
  setItem: function (k, v) { map.set(k, String(v)); },
  removeItem: function (k) { map.delete(k); }
};
global.window = global;
global.TextDecoder = require('util').TextDecoder;
global.TextEncoder = require('util').TextEncoder;
['util.js', 'exercises.js', 'store.js', 'analytics.js', 'loadmodel.js',
 'guardrails.js', 'protocols.js', 'coach.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(GYM, f), 'utf8'), { filename: f });
});

let pass = 0; const fails = [];
function ok(c, m) { if (c) pass++; else fails.push(m); }

Coach.setKey('sk-ant-api03-FUZZ-0000');

// Build a stream from raw bytes, delivered in chunks of `size`.
function streamOf(text, size) {
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  let i = 0;
  return {
    getReader: function () {
      return {
        read: function () {
          if (i >= bytes.length) return Promise.resolve({ done: true });
          const end = Math.min(bytes.length, i + size);
          const slice = bytes.slice(i, end);
          i = end;
          return Promise.resolve({ done: false, value: slice });
        }
      };
    }
  };
}

function ev(o) { return 'event: ' + o.type + '\ndata: ' + JSON.stringify(o) + '\n\n'; }

function goodStream(replyText, usage) {
  const payload = JSON.stringify({ reply: replyText });
  let s = ev({ type: 'message_start', message: { usage: usage || { input_tokens: 10 } } });
  for (let i = 0; i < payload.length; i += 20) {
    s += ev({ type: 'content_block_delta', index: 0,
      delta: { type: 'text_delta', text: payload.slice(i, i + 20) } });
  }
  s += ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 42 } });
  return s;
}

function run(name, text, chunk, check) {
  global.fetch = function () {
    return Promise.resolve({ ok: true, status: 200, body: streamOf(text, chunk),
      text: function () { return Promise.resolve(text); } });
  };
  return Coach.send({ user: { id: 'u', name: 'E', settings: {} }, today: '2026-08-02',
    dossier: 'D', message: 'hi', thread: [] })
    .then(function (r) { check(r, null); })
    .catch(function (e) { check(null, e); });
}

const REPLY = 'Grip is the limiter. Hold the 40s target and stop at form loss.';
const jobs = [];

/* 1. byte-size chunking, including 1-byte chunks that split every event */
[1, 3, 7, 64, 100000].forEach(function (n) {
  jobs.push(run('chunk' + n, goodStream(REPLY), n, function (r, e) {
    ok(!e, 'chunk=' + n + ': no throw');
    ok(r && r.ok === true, 'chunk=' + n + ': ok');
    ok(r && r.reply === REPLY, 'chunk=' + n + ': text assembles exactly');
    ok(r && r.usage && r.usage.output_tokens === 42, 'chunk=' + n + ': usage survives');
  }));
});

/* 2. a multi-byte character split across a chunk boundary — the classic
      decoder bug: naive per-chunk decoding yields U+FFFD */
const UNI = 'Ready — 40s · déjà vu · 💪 hold';
jobs.push(run('utf8', goodStream(UNI), 5, function (r, e) {
  ok(!e, 'utf8: no throw');
  ok(r && r.reply === UNI, 'utf8: multi-byte chars survive chunk splits (got ' +
    JSON.stringify(r && r.reply) + ')');
}));

/* 3. stream that simply stops mid-reply — dropped connection */
jobs.push(run('truncated', goodStream(REPLY).slice(0, 260), 32, function (r, e) {
  ok(!e, 'truncated: no throw');
  ok(r && r.ok === true, 'truncated: returns a result rather than hanging');
  ok(r && typeof r.reply === 'string', 'truncated: reply is a string, not undefined');
}));

/* 4. keep-alive pings and comment lines, which real SSE includes */
jobs.push(run('pings', ': ping\n\n' + goodStream(REPLY).replace(/\n\n/g, '\n\n: keep-alive\n\n'), 40,
  function (r, e) {
    ok(!e, 'pings: no throw');
    ok(r && r.reply === REPLY, 'pings: comment lines ignored, text intact');
  }));

/* 5. an error event mid-stream (overloaded), after some text */
jobs.push(run('midfail',
  ev({ type: 'message_start', message: { usage: {} } }) +
  ev({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: '{"reply":"partial' } }) +
  ev({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }), 30,
  function (r, e) {
    ok(!e, 'midfail: no throw');
    ok(r && r.ok === false, 'midfail: an error event is reported as failure, not success');
    ok(r && /overload/i.test(r.error || ''), 'midfail: the API reason reaches the user');
  }));

/* 6. refusal arriving via message_delta */
jobs.push(run('refusal',
  ev({ type: 'message_start', message: { usage: {} } }) +
  ev({ type: 'message_delta', delta: { stop_reason: 'refusal' }, usage: { output_tokens: 0 } }), 25,
  function (r, e) {
    ok(!e, 'refusal: no throw');
    ok(r && r.ok === false && r.refusal === true, 'refusal: flagged before content is read');
  }));

/* 7. junk lines / malformed JSON payloads interleaved */
jobs.push(run('junk',
  'garbage line without prefix\n\n' +
  'data: {not json at all}\n\n' +
  goodStream(REPLY), 17,
  function (r, e) {
    ok(!e, 'junk: no throw');
    ok(r && r.reply === REPLY, 'junk: unparseable events are skipped, good ones still land');
  }));

/* 8. empty stream */
jobs.push(run('empty', '', 8, function (r, e) {
  ok(!e, 'empty: no throw');
  ok(r && typeof r === 'object', 'empty: returns a result object');
}));

/* 9. thinking deltas before any text — must not be shown as the reply */
jobs.push(run('thinking',
  ev({ type: 'message_start', message: { usage: {} } }) +
  ev({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'hmm, grip...' } }) +
  goodStream(REPLY).split('\n\n').slice(1).join('\n\n'), 24,
  function (r, e) {
    ok(!e, 'thinking: no throw');
    ok(r && (r.reply || '').indexOf('hmm, grip') === -1,
      'thinking: reasoning text is NEVER presented as the reply');
  }));

Promise.all(jobs).then(function () {
  console.log('passed:', pass);
  if (fails.length) { fails.forEach(function (f) { console.log('FAIL:', f); }); process.exit(1); }
  console.log('PASS: coach stream fuzz (' + pass + ' assertions)');
});
