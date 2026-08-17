#!/usr/bin/env bash
# Run the IronLog suites. Node-only ones need nothing; browser ones need
# Playwright (npm i -g playwright) — browsers are pre-installed in the dev
# container at /opt/pw-browsers.
#
#   ./run.sh          every suite
#   ./run.sh node     only the fast node suites (no browser)
#   ./run.sh p6       only suites whose name matches p6
cd "$(dirname "$0")"

NODE_ONLY="gtest.js gtest2.js guardrails.test.js test-store.js test-session-core.js
           p6-coach-core.js coach-stream-fuzz.js p6-fleet-safety.js import-fuzz.js
           p45-shell-crawl.js coach-schema.js health-link.js health-drain.js
           db-rules.js sync-split.js goals-core.js nutrition-core.js"

case "${1:-all}" in
  node) SUITES=$NODE_ONLY ;;
  all)  SUITES=$(ls *.js) ;;
  *)    SUITES=$(ls *.js | grep -- "$1") ;;
esac

pass=0; fail=0; failed=""
for t in $SUITES; do
  printf '%-26s ' "$t"
  if out=$(timeout 240 node "$t" 2>&1); then
    echo "PASS  $(echo "$out" | grep -oE '\([0-9]+ assertions\)' | head -1)"
    pass=$((pass+1))
  else
    echo "FAIL"
    echo "$out" | grep -E '^(FAIL|HARNESS|Error)' | head -3 | sed 's/^/    /'
    fail=$((fail+1)); failed="$failed $t"
  fi
done
echo
echo "$pass passed, $fail failed"
[ -n "$failed" ] && { echo "failed:$failed"; exit 1; }
exit 0
