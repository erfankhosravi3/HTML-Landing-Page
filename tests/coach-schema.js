'use strict';
/* Would the API actually ACCEPT the request we send?

   This suite exists because the answer was no, in production, for every single
   message. The schema omitted `additionalProperties: false` and the API
   replied:

     invalid_request_error: output_config.format.schema: For 'object' type,
     'additionalProperties' must be explicitly set to false

   Nothing caught it. The browser suites stub fetch, so they happily "succeed"
   against a request the real API would reject, and a keyless probe returns
   authentication_error before the schema is ever inspected — so there is no
   way to validate this against the live endpoint without spending the user's
   money. The rules are documented and stable, so they are asserted here
   directly, on the exact object the app ships.

   The schema was one instance of a general gap: anything about the REQUEST
   that only the live API can judge was untested. So this suite covers the
   whole envelope — parameters that 400 on Opus 5, cache-control shape and
   placement, and the byte-stability invariant that makes caching work at
   all. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const P = require('./lib/paths');

const storage = new Map();
global.localStorage = {
  getItem: function (k) { return storage.has(k) ? storage.get(k) : null; },
  setItem: function (k, v) { storage.set(k, String(v)); },
  removeItem: function (k) { storage.delete(k); }
};
global.window = global;
['util.js', 'exercises.js', 'store.js', 'coach.js'].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(P.JS, f), 'utf8'), { filename: f });
});

let pass = 0; const fails = [];
function ok(c, m) { if (c) pass++; else fails.push(m); }

/* Documented limits for structured-output schemas. Anything here is a 400 on
   every request, not a degraded reply. */
const UNSUPPORTED = ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'multipleOf', 'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems',
  'uniqueItems', 'minProperties', 'maxProperties', 'patternProperties',
  'dependentSchemas', 'if', 'then', 'else', 'not'];

function walk(node, where, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node, where);
  if (node.properties) {
    for (const k in node.properties) walk(node.properties[k], where + '.' + k, visit);
  }
  if (node.items) walk(node.items, where + '[]', visit);
  ['anyOf', 'allOf', 'oneOf'].forEach(function (key) {
    if (Array.isArray(node[key])) {
      node[key].forEach(function (n, i) { walk(n, where + '.' + key + '[' + i + ']', visit); });
    }
  });
}

function check(schema, label) {
  const objects = [];
  const bad = [];
  const unsupported = [];
  walk(schema, label, function (n, where) {
    if (n.type === 'object') {
      objects.push(where);
      // THE rule that broke production.
      if (n.additionalProperties !== false) bad.push(where);
    }
    UNSUPPORTED.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(n, k)) unsupported.push(where + ' has ' + k);
    });
    // required must name real properties, or the schema compiles to something
    // the model can never satisfy.
    if (Array.isArray(n.required) && n.properties) {
      n.required.forEach(function (r) {
        if (!Object.prototype.hasOwnProperty.call(n.properties, r)) {
          unsupported.push(where + ' requires "' + r + '" which it does not define');
        }
      });
    }
  });

  ok(objects.length > 0, label + ': schema contains at least one object');
  ok(bad.length === 0, label + ': EVERY object sets additionalProperties:false' +
    (bad.length ? ' — missing on: ' + bad.join(', ') : ''));
  ok(unsupported.length === 0, label + ': no unsupported keywords' +
    (unsupported.length ? ' — ' + unsupported.join('; ') : ''));
  return objects.length;
}

const n = check(Coach.PROPOSAL_SCHEMA, 'PROPOSAL_SCHEMA');
console.log('objects checked:', n);

/* The forbidden names from P3 must not creep back in through the schema —
   old-client analytics keys on them. */
const asText = JSON.stringify(Coach.PROPOSAL_SCHEMA);
ok(asText.indexOf('exerciseRef') !== -1, 'schema uses exerciseRef');
ok(asText.indexOf('exerciseId') === -1, 'schema never says exerciseId');

/* And the request that actually goes out carries the fixed schema, not a
   copy that drifted. */
const body = Coach.buildRequest({ dossier: 'x', message: 'hi', today: '2026-08-02', user: {} });
ok(body.output_config && body.output_config.format &&
   body.output_config.format.type === 'json_schema',
  'the request declares a json_schema format');
ok(JSON.stringify(body.output_config.format.schema) === asText,
  'the request sends THIS schema, not a divergent copy');
ok(body.output_config.format.schema.additionalProperties === false,
  'the schema on the wire is strict at the root');

/* ==================================================================
   The envelope: every documented constraint checkable without a key
   ================================================================== */

const TODAY = '2026-08-02';
const req = Coach.buildRequest({
  user: { name: 'E' }, today: TODAY, dossier: 'DOSSIER-BODY',
  message: 'what should I train?',
  thread: [{ role: 'user', text: 'earlier question' },
           { role: 'assistant', text: 'earlier answer' }]
});

/* --- parameters that are a 400 on Opus 5, not a warning --- */
ok(req.model === 'claude-opus-5', 'model is claude-opus-5');
ok(!('temperature' in req), 'no temperature');
ok(!('top_p' in req), 'no top_p');
ok(!('top_k' in req), 'no top_k');
ok(req.thinking && req.thinking.type === 'adaptive', 'adaptive thinking');
ok(!('budget_tokens' in (req.thinking || {})), 'no budget_tokens (rejected on Opus 5)');
ok(req.stream === true, 'streams (long input, long output, high max_tokens)');
ok(['low', 'medium', 'high', 'xhigh', 'max'].indexOf(req.output_config.effort) >= 0,
  'effort is one of the documented levels (got ' + req.output_config.effort + ')');

/* --- no assistant prefill: it is a 400 here --- */
const last = req.messages[req.messages.length - 1];
ok(last.role === 'user', 'the final turn is the user, never an assistant prefill');

/* --- cache control: shape, count, and placement --- */
const marks = [];
function findMarks(node, where) {
  if (!node || typeof node !== 'object') return;
  if (node.cache_control) marks.push({ where: where, cc: node.cache_control });
  if (Array.isArray(node)) node.forEach(function (n, i) { findMarks(n, where + '[' + i + ']'); });
  else for (const k in node) if (k !== 'cache_control') findMarks(node[k], where + '.' + k);
}
findMarks(req.system, 'system');
findMarks(req.messages, 'messages');

ok(marks.length > 0, 'the request declares cache breakpoints at all');
ok(marks.length <= 4, 'at most 4 breakpoints (got ' + marks.length + ')');
marks.forEach(function (m) {
  ok(m.cc.type === 'ephemeral', m.where + ': breakpoint type is ephemeral');
  ok(m.cc.ttl === undefined || m.cc.ttl === '5m' || m.cc.ttl === '1h',
    m.where + ': ttl is 5m or 1h if present (got ' + m.cc.ttl + ')');
});
// Render order is tools -> system -> messages; a mark on the LAST system block
// caches everything before it.
ok(!!req.system[req.system.length - 1].cache_control,
  'the last system block carries a breakpoint (caches charter + dossier together)');

/* --- the invariant that makes caching actually pay ---
   Anything volatile inside a cached block changes its bytes and invalidates
   every breakpoint at or after it. Today's date is the obvious offender. */
const cachedPrefix = JSON.stringify(req.system);
ok(cachedPrefix.indexOf(TODAY) === -1,
  'today\'s date does NOT appear in the cached system blocks');
ok(cachedPrefix.indexOf('DOSSIER-BODY') !== -1, 'the dossier IS inside the cached prefix');
ok(last.content.indexOf(TODAY) !== -1, 'today rides the volatile final turn instead');
ok(last.content.indexOf('what should I train?') !== -1, 'so does the new message');

/* --- the transport constant that CORS requires --- */
const src = fs.readFileSync(path.join(P.JS, 'coach.js'), 'utf8');
ok(src.indexOf('anthropic-dangerous-direct-browser-access') !== -1,
  'the browser-access header is still sent (without it Chromium blocks the call)');
ok(src.indexOf('https://api.anthropic.com/v1/messages') !== -1,
  'the API origin is hardcoded, not configurable');

console.log('passed:', pass);
if (fails.length) { fails.forEach(function (f) { console.log('FAIL:', f); }); process.exit(1); }
console.log('PASS: coach schema conformance (' + pass + ' assertions)');
