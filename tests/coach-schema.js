'use strict';
/* Does the API actually ACCEPT the structured-output schema we send?

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
   directly, on the exact object the app ships. */
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

console.log('passed:', pass);
if (fails.length) { fails.forEach(function (f) { console.log('FAIL:', f); }); process.exit(1); }
console.log('PASS: coach schema conformance (' + pass + ' assertions)');
