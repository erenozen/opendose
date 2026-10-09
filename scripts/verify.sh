#!/usr/bin/env bash
# Verify the main branch HEAD in a detached worktree, isolated from
# uncommitted work in the main checkout: engine tests, web build, lint,
# unit tests, and every e2e suite against a dev server.
#
# Usage: scripts/verify.sh          (PORT=5190 by default; override with PORT=…)
# Logs: .verify/ (gitignored). Exit status 0 only when everything passes.
set -u
ROOT=/home/eren/OpenDose
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
for suite in e2e-check e2e-tiff e2e-export e2e-share e2e-figures e2e-assays; do
  [ -f "scripts/$suite.mjs" ] || continue
  node "scripts/$suite.mjs" "http://localhost:$PORT/" >"$S/$suite.log" 2>&1; rc=$?
  echo "$suite exit=$rc"; [ $rc -eq 0 ] || { fail=1; grep -E "^FAIL|FAILURES|Error" "$S/$suite.log" | head -5; }
done
kill $DEVPID 2>/dev/null; wait $DEVPID 2>/dev/null
echo "== overall: $([ $fail -eq 0 ] && echo PASS || echo FAIL)"
exit $fail
