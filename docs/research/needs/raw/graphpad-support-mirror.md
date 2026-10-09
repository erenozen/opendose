# GraphPad's own support surface as a mirror of user problems

Agent: `graphpad-support-mirror` · id prefix `gpsupport-` · read on 2026-10-09 ·
**400 observations** in `graphpad-support-mirror.json`.

What this file is: every new feature in a release note is read as something users
asked for, every fixed bug as a problem a user hit, and every FAQ as a question users
kept asking. Each quote is verbatim. All 400 quotes were checked by script as exact
substrings (whitespace normalised) of the page text fetched with `curl` and converted
from HTML to text.

| Venue | Observations |
|---|---|
| graphpad.com release notes | 275 |
| graphpad.com FAQ | 87 |
| graphpad.com academy (Resources Center) | 22 |
| graphpad.com licensing | 16 |

Severity across all 400: wrong result risk 150, slows the work 123, blocks the
analysis 72, cosmetic / preference 55.

## Coverage

| Site / page | What was read | Status |
|---|---|---|
| `www.graphpad.com/updates` (`?page=1..3`) | 3 listing pages. Their embedded page data lists **50 releases, 8.0.0 (Oct 2018) to 11.1.0 (Aug 2026)** | 200 |
| `www.graphpad.com/updates/<slug>` | **All 50 release-note pages**, read in full: 8.0.0, 8.0.1, 8.0.2, 8.1.0–8.1.2, 8.2.0, 8.2.1, 8.3.0, 8.3.1, 8.4.0–8.4.3, 9.0.0–9.0.2, 9.1.0–9.1.2, 9.2.0, 9.3.0, 9.3.1, 9.4.0, 9.4.1, 9.5.0, 9.5.1, 10.0.0–10.0.3, 10.1.0–10.1.2, 10.2.0–10.2.3, 10.3.0, 10.3.1, 10.4.0–10.4.2, 10.5.0, 10.6.0, 10.6.1, 11.0.0–11.0.2, 11.1.0. They hold 2,983 bullet items, 2,190 of them in bug-fix sections. 275 of them were kept as observations. Bench-relevant items came first; trivial UI glitches, typos and duplicate crash fixes were counted but not kept | 200 |
| `www.graphpad.com/support/faqindex/` | 1 page, **1,540 FAQ titles** (IDs 1–2295), all classified by theme (table below) | 200 |
| `www.graphpad.com/support/faq/<slug>/` | **93 FAQ pages opened**. These are the most fundamental ones (SD vs SEM, normalisation, IC50/EC50, replicates, outliers, P values, multiple comparisons, survival, licence/activation/offline, file compatibility, export, crashes, Excel paste) plus FAQs that document workarounds for features added later. 87 were kept as observations. FAQ pages show no dates; only #2263 carries "Last Updated" | 200 |
| `www.graphpad.com/how-to-buy/`, `/how-to-buy/student/`, `/free-course-licenses` | 3 pages: prices, student and course-licence common questions | 200 |
| `www.graphpad.com/pricing` | — | **404** (the footer "Pricing" link actually points to `/how-to-buy/`) |
| `academy.graphpad.com/` | Redirects to `www.graphpad.com/resources`. The 9.1.0 notes say: "(Update Dec 2025) Prism Academy has been merged into our new Resources Center" | 301 → 200 |
| `www.graphpad.com/resources` + 4 video series (`/series/getting-started`, `/series/how-to-customize-your-graphs`, `/series/learn-to-perform-common-statistical-analyses`, `/series/statistics-bootcamp`) + 2 guides (`/guides/how-to-analyze-data-using-prisms-multiple-variables-data-table`, `/guides/sample-size-and-power`) | 7 pages, 41 lessons listed | 200 |
| `www.graphpad.com/blog`, `/tips`, `/prism-tips`, `/support/prism-tips` | No standalone tips or blog section exists. The "tips" live in the FAQ index as 39 "Graph tip / Prism tip" titles | **404** |

Nothing was blocked: no 403 errors, no login walls, no challenges. The Prism User Guide
was reachable but was not mined, because it falls outside this brief.

### FAQ index (1,540 titles) by theme

This is a keyword heuristic with first-match-wins, so the numbers are approximate.

| Theme | Titles |
|---|---|
| Import/export, Office (Word/PowerPoint/Excel), file formats, sharing | 246 |
| Curve fitting, dose-response, IC50/EC50, binding, standard curves | 222 |
| Graph formatting and layouts | 206 |
| Licensing, activation, install, purchase, accounts | 171 |
| "What's new" / version-specific bug notices (109 titles contain "Bug") | 168 |
| ANOVA, multiple comparisons, post hoc | 74 |
| Data entry, tables, transforms, normalisation | 74 |
| Crashes, errors, OS/platform compatibility, performance | 70 |
| t tests, nonparametric, P values, contingency, power, choosing a test | 65 |
| Descriptive stats, error bars SD/SEM, normality, outliers, replicates | 54 |
| Survival, ROC, Bland-Altman, correlation, PCA, clustering | 52 |
| Scripting and automation | 37 |
| Other / general | 101 |

About 40% of all FAQ titles are about moving data or figures in and out (Excel, Office,
export) or about the software itself (licensing, crashes, version notices), not about
statistics.

## Ten most frequent tags

| Tag | Count |
|---|---|
| trust-validation | 42 |
| price-licence | 39 |
| graph-formatting | 33 |
| multiple-comparisons | 33 |
| file-compatibility | 32 |
| two-way-anova | 26 |
| which-test | 25 |
| ic50-ec50-setup | 25 |
| mac-windows | 24 |
| large-data | 23 |

## Twenty strongest observations

1. **gpsupport-faq-150**: "No. A Prism table is not a spreadsheet and no calculations are possible within a data table." <https://www.graphpad.com/support/faq/can-i-use-a-prism-data-table-as-a-spreadsheet-and-write-a-formula-into-a-cell/>
2. **gpsupport-rn-1100-1** (11.0.0, 2026-02): "This is one of Prism's most requested capabilities. Previously, simple calculations like ratios or log transforms required creating separate analysis sheets, cluttering your Navigator and making it hard to track your workflow." <https://www.graphpad.com/updates/prism-11-0-0-release-notes>
3. **gpsupport-rn-811-1** (8.1.1, 2019-04): "Fixed a severe bug introduced in Prism 8.1: after two-way ordinary balanced ANOVA the multiple comparisons calculations computed the cell means incorrectly (and obviously)." <https://www.graphpad.com/updates/prism-811-release-notes>
4. **gpsupport-faq-2172**: "In these situations, the multiple comparisons results reported by Prism 8.0 to 8.3 were incorrect." <https://www.graphpad.com/support/faq/multiple-comparisons-2-way-RM-ANOVA-no-sphericity/>
5. **gpsupport-rn-920-4** (9.2.0, 2021-07): "Fixed the issue in which Prism would report incorrect results for mixed models with missing data (REML calculations) containing more than one random factor (read more)" <https://www.graphpad.com/updates/prism-920-release-notes>
6. **gpsupport-rn-931-1** (9.3.1, 2021-12): "Fixed the issue in which Prism incorrectly reported confidence intervals for the threshold alpha/2 instead of the family-wise alpha threshold for Dunnett's T3 multiple comparisons test from the One-way ANOVA analysis (more details here)" <https://www.graphpad.com/updates/prism-931-release-notes>
7. **gpsupport-rn-1003-3** (10.0.3, 2023-09): "Fixed the issue in which adjusted P values for Dunnett's correction following two-way ANOVA were incorrect" <https://www.graphpad.com/updates/prism-1003-release-notes>
8. **gpsupport-rn-1003-5** (10.0.3): "Fixed the issue in which data was reassigned to the wrong treatment group in the Extract and Rearrange results after opening a PZFX/PZF file in Prism 10" <https://www.graphpad.com/updates/prism-1003-release-notes>
9. **gpsupport-rn-1030-10** (10.3.0, 2024-07): "Fixed the issue when the data table format unexpectedly changed from 'Mean & SD' to 'Mean & %CV' after saving the file in the .prism format." <https://www.graphpad.com/updates/prism-10-3-0-release-notes>
10. **gpsupport-rn-1040-3** (10.4.0, 2024-10): "Fixed the issue in which "Mean with SD" was plotted instead of "Mean with SEM" on the grouped graph generated for the Extract and Rearrange analysis if the SEM error bar style was selected as the default in Prism's preferences" <https://www.graphpad.com/updates/prism-10-4-0-release-notes>
11. **gpsupport-rn-1030-7** (10.3.0): "(Mac) Fixed the issue when the 1/Y weighting option in the 'Parameters: Nonlinear Regression' dialog was unexpectedly reset to 1/Y^2 after saving a Prism project." <https://www.graphpad.com/updates/prism-10-3-0-release-notes>
12. **gpsupport-rn-901-4** (9.0.1, 2021-01): "Fixed the issue in which the results of multiple linear regression, multiple logistic regression, select and transform, and extract and rearrange analyses unexpectedly changed after deleting or inserting a new column (variable) between existing columns in the source data table" <https://www.graphpad.com/updates/prism-901-release-notes>
13. **gpsupport-rn-1011-1** (10.1.1, 2023-11): "Notably, an issue was fixed which had previously caused files created in earlier versions of Prism to open with seemingly blank data tables and lost data." <https://www.graphpad.com/updates/prism-10-1-1-release-notes>
14. **gpsupport-rn-900-1** (9.0.0, 2020-10): "Because you asked for it. Need we say more? Simply perform an appropriate analysis with multiple pairwise comparisons. Then click once to automatically add these results to the graph." <https://www.graphpad.com/updates/prism-900-release-notes>
15. **gpsupport-rn-830-1** (8.3.0, 2019-10): "One of the most top-requested features has continuously been the ability to perform logistic regression with Prism." <https://www.graphpad.com/updates/prism-830-release-notes>
16. **gpsupport-rn-1000-3** (10.0.0, 2023-07): "With other P value summary methods, a P value of 0.032 might be assigned a single asterisk (*), leading viewers to mistakenly assume it is below the selected alpha threshold of 0.01." <https://www.graphpad.com/updates/prism-1000-release-notes>
17. **gpsupport-faq-201**: "Is it better to plot graphs with SD or SEM error bars? (Answer: Neither)" <https://www.graphpad.com/support/faq/is-it-better-to-plot-graphs-with-sd-or-sem-error-bars-answer-neither/>
18. **gpsupport-faq-1986**: "Starting with Prism 6.07 and 6.0g, you needed to connect to the internet at least every 30 days or 20 launches, whichever comes first." <https://www.graphpad.com/support/faq/prism-connection-problem/>
19. **gpsupport-lic-1** (plans FAQ, last updated 2026-02-20): "Virtualized use is not allowed with our Legacy, Standard and Pro plans." <https://www.graphpad.com/support/faq/new-graphpad-prism-plans/>
20. **gpsupport-rn-1102-1** (11.0.2, 2026-05): "This patch primarily resolves an installation failure on Windows systems where PowerShell script execution was disabled." <https://www.graphpad.com/updates/prism-11-0-2-release-notes>

## Features GraphPad added most recently that users had asked for longest

Method: I looked at the 10.x and 11.x additions. For each one I checked whether the
release note calls it requested ("most requested", "highly requested", "you asked") or
whether an older FAQ documents a missing feature or a manual workaround for it. FAQ
pages carry no dates. Their age is estimated from the FAQ ID: IDs are sequential, and
neighbouring low IDs name old versions. For example, #26 "Prism 3 (Windows) used to work
fine…", #240 "Why does Prism 3 Mac crash when I try to save to a zip drive?", #288
"Prism 3 bug: Paste-linking one cell from Excel 2000…", #651 "Someone e-mailed me a
Prism 3 file…", #793 "Can Prism 3 open my Prism 4 files?". So IDs below roughly 800 date
from the Prism 3/4 era.

1. **In-table formulas / Calculated Variables**: Prism 11.0.0, released 2026-02-17.
   - Release note: "This is one of Prism's most requested capabilities. Previously, simple calculations like ratios or log transforms required creating separate analysis sheets, cluttering your Navigator and making it hard to track your workflow."
   - How long requested: FAQ #150 "Can I use a Prism data table as a spreadsheet, and write a formula into a cell?" answers "No. A Prism table is not a spreadsheet and no calculations are possible within a data table." Its text mentions Prism 5 and "version 3 and later". FAQ #163 "How can I divide one column by another in Prism?" points to a workaround that divides alternating data sets. FAQ #162 "How can I convert my data to "percent of control"…". All three IDs sit among the Prism 3-era FAQs.
   - Catch: the feature is "included with Prism Pro and Enterprise" only.
2. **Multifactor (N-way) ANOVA from one table**: Prism 11.0.0, 2026-02-17.
   - Release note: "Traditional ANOVA in Prism required different data table formats for different numbers of factors - adding a third factor meant completely restructuring your data."
   - How long requested: FAQ #258 "Can I do nested ANOVA with Prism?" (a Prism 3-era ID) answers "No. Prism does one- and two-way ANOVA (with repeated measurements when appropriate), but not more complex variations." FAQ #2163 (Prism 8 era) adds "Currently, three-way ANOVA in Prism 8 is restricted to a 2 x 2 x K design."
   - Also gated to Pro/Enterprise.
3. **Multiple pairwise comparisons of survival curves**: Prism 10.5.0, released 2025-05-29.
   - Release note: "Multiple Pairwise Comparisons*: Simply specify which comparisons Prism should perform and the desired correction methods to receive all necessary statistics, p-values and summaries that you need".
   - How long requested: FAQ #226 (Prism 3-era ID) says pairwise use without adjustment "is really not appropriate unless you make an adjustment for multiple comparisons, something Prism doesn't help you with." FAQ #370 describes the manual workaround: "Click New, and then Duplicate Current Sheet" for each pair, then correct by hand. FAQ #1655 now reads "Starting with version 10.5, Prism offers the ability to perform all of these different comparison methods".
   - Not available on all plans (FAQ #2281 marks it ❌ for "All Plans").
4. **Automatic Number at Risk table under Kaplan-Meier plots**: Prism 10.5.0, 2025-05-29.
   - Release note: "Kaplan-Meier plots now include auto-generated Number at Risk table** for easier interpretation".
   - How long requested: FAQ #492 (Prism 3/4-era ID; reposted as #1435) said "There is no way to automatically add these values to a survival graph." It listed manual workarounds: copy and paste the table, or type each value as a text object.
   - Enterprise-only (FAQ #2281: ❌ All Plans, ❌ Standard, ✅ Enterprise).
5. **Sample size and power analysis**: Prism 10.3.0, released 2024-07-31.
   - Release note: "Sample size and power analysis*: quickly determine the number of samples or subjects that you need for your experimental design…".
   - How long requested: FAQ #43 "Can Prism perform sample size and power calculations?" is one of the first 50 FAQ IDs. It now answers "Yes! Power analysis and sample size calculations are now available through Prism Cloud."
   - Catch: it runs only online, through a Prism Cloud workspace on named-user licences. The power guide says "the tool opens online and connects to your Prism Cloud account."

Runners-up:
- Compact Letter Display (10.2.0, 2024-02), listed under "This version of Prism introduces multiple highly requested features". There is no older FAQ workaround for it, but FAQ #693 on marking asterisks shows the long asterisk-workaround history.
- 95% CI of median survival (10.5.0). FAQ #1300 now opens "Beginning in Prism version 10.5.0…".
- Decimal alpha below 0.01 in t tests (11.1.0, 2026-08). Related to the old FAQ #687 "If you want to know P with more decimal places, you'll need to calculate it elsewhere."
- SVG export (10.6.0, 2025-08). No FAQ evidence that it was requested.

## Anything surprising

- **Bench-standard analyses are now split across price tiers.** Calculated variables,
  Multifactor ANOVA, effect sizes and the Multiple Variables table workflows are
  "Pro/Enterprise". Survival pairwise comparisons are not on the base plan, and the
  number-at-risk table is Enterprise-only. Clustering is "[Enterprise license
  required]". Power analysis is cloud-only. The 11.1.0 notes describe "License-restriction
  banners in analysis dialogs (t tests, ANOVAs, Chi-square, and Simple Survival)". The
  Resources guide says "The Multiple Variables data table, available in Prism Pro or
  Enterprise plans". The plans FAQ says: "newer capabilities and enhancements will be
  reserved for the new plans."
- **Correctness fixes in post-hoc and repeated-measures maths recur in almost every
  major line.** Examples: 8.1.1 two-way cell means; 8.1.2 and 8.2.1 two-way post tests;
  8.4.0, which disabled "misleading" combinations; 9.2.0 REML with missing data; 9.3.1
  Dunnett T3 CI; 10.0.3 Dunnett adjusted P and Geisser-Greenhouse P (Mac); 10.2.0
  Dunnett with large df; 10.5.0 G-G interaction term; 11.1.0 nested ANOVA FDR
  "discoveries" based on raw P and wrong Welch/lognormal post tests (Mac). This makes
  `trust-validation` the top tag. Mac-only wrong-result fixes also show that the same
  analysis gave different numbers on Mac and Windows.
- **Settings and data that change silently on save are a separate failure class.**
  Examples: 1/Y weighting reset to 1/Y² (10.3.0); Mean & SD becoming Mean & %CV
  (10.3.0); Wald CI becoming profile likelihood (10.6.0); regression reference level
  reverting (10.6.1); backups losing excluded values (10.0.3); autosave losing data past
  row 100 (10.4.0).
- **The 2023 move to the open `.prism` format caused a long tail of compatibility
  bugs.** Examples: blank tables and lost data (10.1.1), Greek characters corrupted
  (10.0.1), treatment groups reassigned (10.0.3). Release 10.0.0 itself says "The new functions &
  features of Prism 10 are only compatible with the new file format."
- **Locked-down institutional IT keeps breaking installs and licences.** Examples: proxy
  activation (10.0.3), write-protected working folder corruption (10.2.3), VBScript
  removed for Windows 11 (11.0.1), PowerShell disabled (11.0.2), machine-token activation
  usable only by the activating user on shared lab Macs (11.1.0), the 30-day phone-home
  rule, and no VDI on Standard/Pro.
- **The academy no longer exists as a separate site.** academy.graphpad.com redirects to
  the Resources Center. Its first video series teaches which table type to choose ("Important analyses such
  as two-way and three-way ANOVA and multiple t tests can only be run from a Grouped
  table"). This reads as a mirror of data-layout confusion, which 11.0 is now trying to
  remove with "one table, multiple analyses".
- **A qPCR ΔΔCt workflow (dCt → ddCt → 2^-ddCt) appears in GraphPad's own teaching only
  as a Prism 11 Calculated Variables demo** (Resources guide). No FAQ title in the 1,540 mentions qPCR,
  western blot or flow cytometry.
- **The FAQ contains GraphPad's own statistical stances.** "Answer: Neither" (SD vs
  SEM), "Why we recommend you do not use the Newman-Keuls multiple comparison test",
  "Don't use weighted nonlinear regression with normalized data", "Those values are not
  outliers!" These are the recurring user misconceptions in GraphPad's own words.

## Proposed new tags

None. All tags used are from `TAGS.md`.
