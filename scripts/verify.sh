#!/usr/bin/env bash
# Verify the main branch HEAD in a detached worktree, isolated from
# uncommitted work in the main checkout: engine tests, web build, lint,
# unit tests, and every e2e suite against a dev server (e2e-privacy and a
# second e2e-motion run against the built site).
#
# Usage: scripts/verify.sh          (PORT=5190 by default; override with PORT=…)
#        RUN_LARGE=1 scripts/verify.sh   also runs e2e-large (500,000 rows; the
#        browser peaks near 3.7 GB, so give the run about 6 GB of memory)
# Logs: .verify/ (gitignored). Exit status 0 only when everything passes.
set -u
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
S=$ROOT/.verify; mkdir -p "$S"
VT=$ROOT/.claude/worktrees/verify
PORT=${PORT:-5190}
cd "$ROOT"
if [ -e "$VT/.git" ]; then
  git -C "$VT" checkout -q --detach main && git -C "$VT" reset -q --hard main && git -C "$VT" clean -qfd -e node_modules -e public/py
else
  git worktree add -q --detach "$VT" main
fi
echo "== verifying $(git -C "$VT" rev-parse --short HEAD)"
fail=0
echo "== engine"; PYTHONPATH=$VT/engine "$ROOT/.venv/bin/python" -m pytest "$VT/engine/tests" -q -p no:warnings -p no:cacheprovider 2>&1 | tail -1 | tee "$S/engine.txt"
grep -q " failed\| error" "$S/engine.txt" && fail=1
cd "$VT/web"
echo "== npm ci"; npm ci --silent --no-audit --no-fund >/dev/null 2>&1 || { echo "npm ci FAILED"; fail=1; }
echo "== build"; npm run build >"$S/build.log" 2>&1 && echo "build OK" || { echo "BUILD FAILED"; grep -E "error" "$S/build.log" | head -20; fail=1; }
echo "== lint"; npm run lint 2>&1 | grep -E "Found|error" | head -5
echo "== unit"; npm run test:unit 2>&1 | grep -E "^ℹ (pass|fail)" | tee "$S/unit.txt"
grep -q "^ℹ fail [1-9]" "$S/unit.txt" && fail=1
echo "== e2e"
node -e "import('vite').then(async v=>{const s=await v.createServer({server:{port:$PORT,strictPort:true},logLevel:'silent'});await s.listen();console.log('up');setTimeout(()=>{},1e9)})" >"$S/dev-$PORT.log" 2>&1 &
DEVPID=$!
for i in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 1; done
# Warm the dev server: Vite pre-bundles dependencies on the first request and
# reloads the page, which interrupts the engine worker's boot in the first
# suite. Load the app once and wait for live results before any suite runs.
node -e "import('playwright').then(async ({chromium})=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('http://localhost:$PORT/?example=1',{waitUntil:'domcontentloaded'});await p.waitForSelector('.pane-results[data-live=\"true\"] .results-table',{timeout:300000}).then(()=>console.log('warm-up: live results'),()=>console.log('warm-up: no live results within 300 s'));await b.close();})" 2>&1 | tail -1
# e2e-privacy runs last: it checks the security headers (public/_headers)
# that only the production build is served with, so the dev server is
# swapped for scripts/serve-dist.mjs on the same port first.
for suite in e2e-check e2e-tiff e2e-export e2e-share e2e-figures e2e-assays e2e-import e2e-results e2e-models e2e-feedback e2e-primitives e2e-motion e2e-privacy; do
  [ -f "scripts/$suite.mjs" ] || continue
  if [ "$suite" = e2e-privacy ]; then
    kill $DEVPID 2>/dev/null; wait $DEVPID 2>/dev/null
    node scripts/serve-dist.mjs "$PORT" >"$S/dist-$PORT.log" 2>&1 &
    DEVPID=$!
    for i in $(seq 1 30); do curl -s -o /dev/null "http://localhost:$PORT/" && break; sleep 1; done
  fi
  node "scripts/$suite.mjs" "http://localhost:$PORT/" >"$S/$suite.log" 2>&1; rc=$?
  echo "$suite exit=$rc"; [ $rc -eq 0 ] || { fail=1; grep -E "^FAIL|FAILURES|Error" "$S/$suite.log" | head -5; }
done
# Motion again on the built site (still served after e2e-privacy): the CSS
# minifier rewrites tokens (150ms becomes .15s), and code that reads them
# at runtime only breaks there.
if [ -f scripts/e2e-motion.mjs ] && [ -f scripts/e2e-privacy.mjs ]; then
  node scripts/e2e-motion.mjs "http://localhost:$PORT/" >"$S/e2e-motion-dist.log" 2>&1; rc=$?
  echo "e2e-motion (built site) exit=$rc"; [ $rc -eq 0 ] || { fail=1; grep -E "^FAIL|FAILURES|Error" "$S/e2e-motion-dist.log" | head -5; }
fi
# 500,000 rows pasted, graphed and analysed (P-10), on the built site; opt-in
# because of its memory peak.
if [ "${RUN_LARGE:-0}" = 1 ] && [ -f scripts/e2e-large.mjs ]; then
  node scripts/e2e-large.mjs "http://localhost:$PORT/" >"$S/e2e-large.log" 2>&1; rc=$?
  echo "e2e-large (built site) exit=$rc"; [ $rc -eq 0 ] || { fail=1; grep -E "^FAIL|FAILURES|Error" "$S/e2e-large.log" | head -5; }
fi
kill $DEVPID 2>/dev/null; wait $DEVPID 2>/dev/null
echo "== overall: $([ $fail -eq 0 ] && echo PASS || echo FAIL)"
exit $fail
