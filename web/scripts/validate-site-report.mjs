// Markdown report for validate-site.mjs: summary table per dataset,
// findings ordered by severity (wrong numbers, missing features, friction),
// the performance table, and a per-dataset appendix of what was not shown.

const esc = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
const fmt = (v) => (typeof v === "number" ? (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(6) : String(Number(v.toPrecision(10)))) : esc(v));
const sec = (ms) => (ms === null || ms === undefined ? "n/a" : `${(ms / 1000).toFixed(2)} s`);

export function renderMarkdown(out) {
  const L = [];
  const ds = out.datasets;
  const S = out.summary;
  L.push("# OpenDose site validation (live site, through the UI)");
  L.push("");
  L.push(`Site: ${out.site} · run ${out.run_at.slice(0, 16).replace("T", " ")} UTC${out.partial_run ? " · **partial run**" : ""}`);
  L.push("");
  L.push("Produced by `web/scripts/validate-site.mjs` (Playwright, headless Chromium). Every dataset of the reference corpus "
    + "(`docs/validation/datasets/manifest.json` and, when present, the local-only `docs/validation/private/datasets/manifest.json`) "
    + "is entered the way a user would (New data table, paste into the grid or the Import dialog / recipes, Analyze menu, options), "
    + "and every reference quantity is compared with the number the results sheet shows. Screenshots: `docs/validation/site-screens/<id>.png`.");
  L.push("");
  L.push(`Results precision: Preferences offer ${(out.session.digitsOffered ?? []).join(", ")} significant digits; the run used ${out.session.digitsUsed ?? "?"}. `
    + `Tolerance: ${out.tolerance_rule}. Re-expressions (e.g. a scale parameter from a Hill slope, F = t²) are marked in the notes.`);
  L.push("");
  if (out.engine_run) {
    L.push(`Cross-reference: \`${out.engine_run.file}\` (the engine run natively on the repository's current code) is matched per quantity; `
      + "a quantity that fails here and passes there is fixed in the repository's engine but not yet on the live site (not deployed, or not wired into the UI).");
    L.push("");
  }
  L.push(`**${S.datasets} datasets**: ${S.pass} pass, ${S.partial} pass with some quantities not shown, ${S.fail} with at least one failing quantity, `
    + `${S.not_comparable} not comparable. **${S.refs} reference quantities**: ${S.refs_pass} pass, ${S.refs_fail} fail, ${S.refs_missing} not shown / not available, `
    + `${S.refs_info} informational (source marked inconsistent or approximate).`);
  L.push("");

  // ---------------------------------------------------------- summary table
  L.push("## Summary per dataset");
  L.push("");
  L.push("| dataset | workflow | refs | pass | fail | not shown | info | time | engine (long tasks) | status |");
  L.push("|---|---|---:|---:|---:|---:|---:|---:|---:|---|");
  for (const d of ds) {
    const lt = d.engine.reduce((a, e) => a + (e.longTaskMs || 0), 0);
    L.push(`| \`${d.id}\`${d.private ? " (private)" : ""} | ${d.workflow} | ${d.refs_total} | ${d.pass} | ${d.fail} | ${d.missing} | ${d.info} | ${d.seconds} s | ${(lt / 1000).toFixed(1)} s | ${d.status} |`);
  }
  L.push("");

  // ------------------------------------------------------------- findings
  L.push("## Findings, by severity");
  L.push("");
  const fails = ds.flatMap((d) => d.refs.filter((r) => r.status === "fail").map((r) => ({ d, r })));
  const unexplained = fails.filter(({ r }) => !r.explained);
  const explained = fails.filter(({ r }) => r.explained);
  const wrongFr = out.frictions.filter((f) => f.kind === "wrong");
  L.push("### 1. Wrong numbers and wrong behaviour");
  L.push("");
  if (wrongFr.length) {
    for (const f of wrongFr) L.push(`- ${esc(f.text)}${f.datasets.length ? ` (${f.datasets.join(", ")})` : ""}`);
    L.push("");
  }
  const bySize = (size) => unexplained.filter(({ r }) => (r.size ?? "") .startsWith(size));
  for (const [title, size] of [["Substantive (> 1% off)", "substantive"], ["Small (≤ 1% off)", "small"], ["Last digits (≤ 1e-4 relative)", "last"]]) {
    const list = bySize(size);
    if (!list.length) continue;
    L.push(`**${title}: ${list.length} quantities**`);
    L.push("");
    L.push("| dataset | quantity | reference | page shows | rel. diff | engine run (native, repo HEAD) | note |");
    L.push("|---|---|---:|---|---:|---|---|");
    for (const { d, r } of list) {
      const e = r.engine ? `${r.engine.status}${r.engine.ours !== null && r.engine.ours !== undefined ? ` (${fmt(r.engine.ours)})` : ""}` : "not in the engine run";
      L.push(`| \`${d.id}\` | ${esc(r.quantity)} | ${fmt(r.reference)} | ${esc(r.shown)} | ${r.rel_diff === null ? "" : r.rel_diff.toExponential(1)} | ${esc(e)} | ${esc(r.note ?? "")} |`);
    }
    L.push("");
  }
  if (explained.length) {
    L.push(`**Differences traced to the reference, not the page: ${explained.length} quantities** (still counted as failures above)`);
    L.push("");
    L.push("| dataset | quantity | reference | page shows | why |");
    L.push("|---|---|---:|---|---|");
    for (const { d, r } of explained) L.push(`| \`${d.id}\` | ${esc(r.quantity)} | ${fmt(r.reference)} | ${esc(r.shown)} | ${esc(r.explained)} |`);
    L.push("");
  }
  const info = ds.flatMap((d) => d.refs.filter((r) => r.status === "info-fail").map((r) => ({ d, r })));
  if (info.length) {
    L.push(`**Informational only** (the corpus marks these sources inconsistent or approximate): ${info.length} quantities differ, in `
      + [...new Set(info.map(({ d }) => d.id))].map((x) => `\`${x}\``).join(", ") + ". See the JSON for the values.");
    L.push("");
  }
  const errored = ds.filter((d) => d.error);
  if (errored.length) {
    L.push("**Driver errors** (the UI step could not be completed):");
    L.push("");
    for (const d of errored) L.push(`- \`${d.id}\`: ${esc(d.error)}`);
    L.push("");
  }

  L.push("### 2. Missing features (a reference quantity the page cannot produce or does not show)");
  L.push("");
  for (const f of out.frictions.filter((x) => x.kind === "missing")) L.push(`- ${esc(f.text)}${f.datasets.length ? ` (${f.datasets.join(", ")})` : ""}`);
  const reasons = new Map();
  for (const d of ds) for (const r of d.refs.filter((x) => x.status === "missing")) {
    const k = r.note || "not shown on the page";
    const e = reasons.get(k) ?? { n: 0, ds: new Set() };
    e.n++; e.ds.add(d.id); reasons.set(k, e);
  }
  for (const [k, e] of [...reasons.entries()].sort((a, b) => b[1].n - a[1].n)) {
    L.push(`- ${esc(k)}: ${e.n} quantities (${[...e.ds].join(", ")})`);
  }
  L.push("");

  L.push("### 3. Usability friction");
  L.push("");
  for (const f of out.frictions.filter((x) => x.kind === "friction")) L.push(`- ${esc(f.text)}${f.datasets.length ? ` (seen in ${f.datasets.length} dataset${f.datasets.length > 1 ? "s" : ""}: ${f.datasets.slice(0, 6).join(", ")}${f.datasets.length > 6 ? ", …" : ""})` : ""}`);
  const slowSteps = ds.flatMap((d) => d.engine.filter((e) => e.longTaskMs > 5000 || e.ms > 5000)
    .map((e) => `\`${d.id}\` ${e.label}: ${sec(Math.max(e.ms, e.longTaskMs))}`));
  if (slowSteps.length) L.push(`- Steps that froze the page for more than 5 s (main-thread busy time measured with long-task timing; the engine runs on the page's main thread, with no progress indicator or cancel): ${slowSteps.join("; ")}.`);
  const consoleFr = out.frictions.filter((x) => x.kind === "console");
  if (consoleFr.length) L.push(`- Console errors: ${consoleFr.map((f) => esc(f.text)).join(" · ")}`);
  L.push("");

  // ------------------------------------------------------------ performance
  if (out.perf) {
    L.push("## Performance and robustness probe");
    L.push("");
    L.push(`Each step is timed from the user action to the result on screen (slow = over ${out.perf.slow_threshold_ms / 1000} s).`);
    L.push("");
    L.push("| probe | time | slow? | detail |");
    L.push("|---|---:|---|---|");
    for (const r of out.perf.rows) L.push(`| ${esc(r.probe)} | ${sec(r.ms)} | ${r.error ? "**error**" : r.slow ? "**yes**" : ""} | ${esc(r.detail)} |`);
    L.push("");
  }

  // --------------------------------------------------------- per dataset
  L.push("## Per dataset: notes and timing");
  L.push("");
  for (const d of ds) {
    const steps = d.engine.map((e) => `${e.label} ${sec(e.ms)} (long tasks ${sec(e.longTaskMs)})`).join("; ");
    const notes = (d.notes ?? []).filter(Boolean).join(" · ");
    L.push(`- \`${d.id}\` (${d.status}): ${steps || "no engine step timed"}${notes ? `. ${esc(notes)}` : ""}${d.console_errors.length ? `. Console: ${esc(d.console_errors.join("; ").slice(0, 200))}` : ""}`);
  }
  L.push("");
  return L.join("\n");
}
