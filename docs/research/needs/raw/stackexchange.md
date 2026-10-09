# Stack Exchange network: needs digest

Source file: `stackexchange.json` (698 observations, every quote checked by
script as a verbatim substring of the API-returned post, comment or answer).

## Coverage

**Access route.** Everything was fetched through the public Stack Exchange
API v2.3 (`api.stackexchange.com`), unauthenticated, with a custom filter
that embeds question bodies, answers and comments in each search result, so
one request returned up to 100 complete threads. HTML pages were not fetched
(they are blocked to the research tooling); nothing was unreachable through
the API. Raw responses are cached in the session scratchpad
(`se-research/raw/*.json`, one file per request) and were never refetched.

**Quota.** This agent made 148 requests (1 filter creation, 147
`search/advanced` calls, all logged and cached). The per-IP
`quota_remaining` fell from 298 to 129 over the session, more than these 148
calls, so the 300/day quota was evidently shared with other processes on the
same IP; it was never exhausted and no backoff was returned. Two calls were
wasted on `intitle=` (not a valid parameter for `search/advanced`; it silently
returned unfiltered results, which were discarded) and were re-run with
`title=`.

**Volume.** 4,018 unique threads were returned across six sites (stats 2,524 ·
stackoverflow 679 · biology 654 · chemistry 111 · bioinformatics 47 ·
academia 3). Titles were screened by a lab-keyword relevance score; every title
scoring ≥3 (and ≥2 outside Stack Overflow), every GraphPad/Prism hit, and
low-scoring titles matching target terms (Dunnett, error bars, Bland-Altman,
Kaplan-Meier, replicates, outliers…) were reviewed by hand. **532 threads were read** (question body up to ~1,100 characters, the accepted or
top-voted answer up to ~750, the second answer up to ~350 and the
highest-scored comment; quotes that ran past the excerpt were completed from
the full cached text): stats 332 · biology 109 ·
stackoverflow 59 · chemistry 20 · bioinformatics 12. **505 threads yielded
observations** (stats 328 · biology 95 · stackoverflow 58 · chemistry 13 ·
bioinformatics 11); 27 read threads were wet-lab troubleshooting with no
analysis need and produced none. Academia returned nothing relevant.

**Observations.** 494 are the asker's problem/need; 204 capture an
answerer's (or commenter's) recurring advice and are marked with
`role: "answerer"`, `"answerer (accepted answer)"` or `"commenter"`; for
those, `url` points at the answer, and `signal.votes` is the answer's score
(views/answers are the thread's). Severity: wrong result risk 301 · slows the
work 247 · blocks the analysis 107 · cosmetic 43.

**False positives filtered.** `prism` (chemistry prisms, prismane, PRISM
climate rasters, ABI PRISM qPCR instruments kept only where the analysis was
relevant); `mice` (the R `mice` imputation package dominated "kaplan meier
mice", "hazard ratio mice", "survival curve mice"); `plate reader`,
`doubling time`, `normalize to control` on Stack Overflow/CV (mostly
unrelated programming/ML); `compare roc curves` (machine-learning
classifiers); `MFI` (multinomial/IRT models, not mean fluorescence
intensity); `hill slope` (hierarchical-model slopes).

**Gaps.** IncuCyte: 0 relevant hits on any site. Superplot: 2 threads in
total (both read). Synergy/Bliss: 2 threads. ROC: only machine-learning
comparisons, no bench biomarker threads. Glucose tolerance tests: 2 threads.
The network skews toward statistics-method questions; graph-formatting needs
show up mainly on Stack Overflow as "make R/Python look like Prism".

### Queries run (site: returned/total matches; sort = votes, pagesize 100)

| Label | Query | Results per site |
|---|---|---|
| graphpad | `q="graphpad"` | stats 76/76, biology 2/2, bioinformatics 3/3, academia 1/1, chemistry 2/2, stackoverflow 57/57 |
| prism | `q="prism"` | stats 85/85, biology 4/4, academia 2/2, bioinformatics 4/4, chemistry 13/13 |
| IC50 | `q="IC50"` | stats 7/7, biology 17/17, chemistry 6/6, stackoverflow 56/56, bioinformatics 2/2 |
| EC50 | `q="EC50"` | stats 16/16, biology 7/7, stackoverflow 72/72 |
| dose response | `q="dose response"` | stats 100/153, biology 29/29, stackoverflow 100/429, chemistry 4/4 |
| four parameter logistic | `q="four parameter logistic"` | stats 32/32, stackoverflow 11/11, biology 0/0 |
| 4PL | `q="4PL"` | stats 3/3, stackoverflow 27/27 |
| ELISA | `q="ELISA"` | stats 14/14, biology 40/40, chemistry 6/6, stackoverflow 100/268 |
| interpolate standard curve | `q="standard curve"` | stats 100/573, biology 31/31, chemistry 44/44 |
| qPCR | `q="qPCR"` | stats 24/24, biology 74/74, bioinformatics 11/11 |
| delta ct | `q="delta ct"` | stats 7/7, biology 5/5 |
| western blot | `q="western blot"` | stats 12/12, biology 76/76 |
| technical replicates | `q="technical replicates"` | stats 99/99, biology 16/16, bioinformatics 19/19 |
| biological replicates | `q="biological replicates"` | stats 100/115, biology 40/40 |
| pseudoreplication | `q="pseudoreplication"` | stats 100/121, biology 0/0 |
| which statistical test | `q="which statistical test"` | biology 21/21 |
| which test mice | `q="which test mice"` | stats 80/80 |
| which test cells | `q="which test cell line"` | stats 39/39 |
| post hoc | `q="post hoc"` | biology 4/4 |
| post hoc mice | `q="post hoc mice"` | stats 10/10 |
| post hoc treatment control | `q="post hoc treatment control group anova"` | stats 25/25 |
| Dunnett | `q="Dunnett"` | stats 75/75, biology 0/0 |
| Tukey vs (invalid parameter, discarded) | `intitle="tukey"` | stats 100/219721 |
| two-way ANOVA | `q="two-way anova"` | biology 0/0 |
| two-way ANOVA mice | `q="two-way anova mice"` | stats 21/21 |
| two-way ANOVA interaction genotype | `q="two-way anova genotype treatment"` | stats 12/12 |
| repeated measures missing | `q="repeated measures anova missing values"` | stats 51/51 |
| repeated measures mice | `q="repeated measures mice"` | stats 38/38 |
| mixed model mice | `q="mixed model mice"` | stats 40/40 |
| mixed model cells | `q="mixed model cell culture"` | stats 5/5 |
| mixed model | `q="mixed model"` | biology 9/9 |
| kaplan meier mice | `q="kaplan meier mice"` | stats 4/4 |
| kaplan meier small | `q="kaplan meier small sample"` | stats 6/6 |
| kaplan meier | `q="kaplan meier"` | biology 1/1 |
| log-rank (invalid parameter, discarded) | `intitle="log-rank"` | stats 100/219721 |
| hazard ratio | `q="hazard ratio"` | biology 0/0 |
| hazard ratio mice | `q="hazard ratio mice"` | stats 6/6 |
| error bars SEM | `q="error bars SEM"` | stats 22/22, biology 1/1, academia 1/1 |
| error bars | `q="error bars"` | biology 7/7 |
| normalize to control | `q="normalize to control"` | stats 100/1006, biology 15/15 |
| percent of control | `q="percent of control"` | stats 100/110, biology 7/7 |
| fold change t test | `q="fold change t-test"` | stats 25/25, biology 0/0 |
| outlier biology | `q="outlier"` | biology 14/14 |
| outlier remove mice | `q="outlier remove mice"` | stats 3/3 |
| outlier remove replicates | `q="outlier remove replicates"` | stats 9/9 |
| nonparametric small sample | `q="nonparametric small sample"` | stats 44/44 |
| mann whitney n=3 | `q="mann whitney n=3"` | stats 0/0 |
| triplicate | `q="triplicate"` | stats 66/66, biology 10/10 |
| superplot | `q="superplot"` | stats 2/2, biology 0/0 |
| plate reader | `q="plate reader"` | stats 4/4, biology 14/14, stackoverflow 91/91 |
| flow cytometry | `q="flow cytometry"` | stats 12/12, biology 25/25, bioinformatics 11/11 |
| MFI | `q="MFI"` | stats 11/11 |
| IncuCyte | `q="incucyte"` | stats 0/0, biology 0/0, stackoverflow 1/1 |
| growth curve doubling | `q="doubling time"` | stats 100/415, biology 49/49, stackoverflow 100/30397 |
| bacterial growth curve | `q="growth curve bacteria"` | stats 6/6, biology 6/6 |
| Michaelis | `q="michaelis menten"` | stats 12/12, biology 28/28, chemistry 38/38, stackoverflow 28/28 |
| synergy drug | `q="synergy drug"` | stats 1/1, biology 1/1 |
| Bliss | `q="bliss independence"` | stats 1/1 |
| Bland Altman | `q="bland altman"` | stats 72/72, biology 0/0 |
| compare ROC | `q="compare roc curves"` | stats 100/176 |
| power analysis mice | `q="power analysis mice"` | stats 4/4 |
| sample size animals | `q="sample size animals"` | stats 98/98, biology 2/2 |
| sample size pilot | `q="sample size pilot study"` | stats 74/74 |
| Tukey vs (title) | `title="tukey"` | stats 100/131 |
| log-rank (title) | `title="log-rank"` | stats 52/52 |
| independent experiments | `q="independent experiments replicates"` | stats 88/88 |
| 96-well | `q="96-well"` | stats 49/49, biology 28/28 |
| hill slope | `q="hill slope"` | stats 17/17 |
| drc package | `q="drc package"` | stats 14/14, stackoverflow 83/83 |
| glucose tolerance AUC | `q="glucose tolerance test"` | stats 3/3 |
| Kruskal Dunn | `q="kruskal-wallis dunn"` | stats 85/85 |
| housekeeping normalization | `q="housekeeping gene"` | stats 3/3, biology 20/20 |
| standard deviation vs SEM error bars (title) | `title="error bars"` | stats 94/94 |
| statistics (biology top) | `q="statistics"` | biology 100/210 |
| t-test (biology) | `q="t-test"` | biology 37/37 |
| anova (biology) | `q="anova"` | biology 9/9 |
| survival curve mice | `q="survival curve mice"` | stats 4/4 |
| log ratio paired fold change | `q="ratio paired t-test log"` | stats 6/6 |
| cell viability | `q="cell viability"` | stats 8/8, biology 58/58 |
| biologist | `q="biologist"` | stats 100/183 |
| lab experiment replicates wells | `q="wells replicates"` | stats 100/285 |
| kaplan (title) | `title="kaplan"` | stats 100/196 |
| log-rank animals | `q="log-rank animals"` | stats 2/2 |
| ROC biomarker | `q="ROC biomarker assay"` | stats 0/0 |
| survival curve | `q="survival curve"` | biology 3/3 |
| dose response (stats page 2) | `q="dose response" (page 2)` | stats 53/153 |

## Ten most frequent tags

| Tag | All obs | Asker obs | Advice obs |
|---|---|---|---|
| technical-vs-biological-replicates | 99 | 73 | 26 |
| ic50-ec50-setup | 95 | 72 | 23 |
| which-test | 79 | 69 | 10 |
| normalization | 69 | 53 | 16 |
| n-definition | 58 | 41 | 17 |
| multiple-comparisons | 56 | 48 | 8 |
| qpcr-ddct | 53 | 37 | 16 |
| fit-diagnostics | 52 | 36 | 16 |
| repeated-measures | 52 | 45 | 7 |
| power-sample-size | 49 | 34 | 15 |

Next: units-and-transforms 47 · error-bars-sd-sem 47 · nonparametric 46 ·
standard-curve-interpolation 46 · post-hoc-choice 45 ·
mixed-model-missing-values 43 · two-way-anova 41 · paired-design 36 ·
numbers-differ-between-tools 34 · survival 33 · learning-curve 32 ·
plate-reader 31 · compare-curves 28.

Three tags were added to `TAGS.md` because nothing fitted:
`repeated-measures`, `paired-design`, `assay-validation`.

Software named in observations: R 107 (plus drc 37, ggplot2 12, nlme/lme4,
emmeans, multcomp) · GraphPad Prism 98 · Excel 20 · SPSS 11 · MATLAB 5 ·
ImageJ 4 · SAS 3 · G*Power 3 · FlowJo 2 · SigmaPlot 2 · JMP 1 · Statistica 1.

## Twenty strongest observations

Ranked by severity × log(views) + votes, then hand-picked to cover distinct needs.

1. **4PL standard curve with back-calculation** (blocks; 30,219 views) —
   "How can I do this in R? I want to get the $A$, $B$, $C$ and $D$ values and
   plot the curve." Biology student fitting ELISA/Bradford standards.
   <https://stats.stackexchange.com/questions/61144>
2. **What n=2 means** (wrong result risk; 142,470 views) — "But due to time
   limitation, complexity of my experiment and costs involved, I can only do
   two replicates." Answer: honest 95% bars need a ×12.71 multiplier.
   <https://stats.stackexchange.com/questions/230171>
3. **Paired vs unpaired for matched mice** (wrong result risk; 27,125 views,
   24 votes) — "a paper I was recently involved with was criticized by a
   biologist for using a paired t-test rather than an unpaired t-test."
   <https://stats.stackexchange.com/questions/38102>
4. **Which post-hoc after two-way ANOVA** (blocks; 11,782 views) — "Prism
   allows for including Bonferroni's post-hoc tests, after quickly checking
   the Wikipedia article about ANOVA, I believe Dunnett's test might be
   appropriate, but I have seen publications using Duncan's test, Tukey's
   test as well as Student's t test…" <https://stats.stackexchange.com/questions/48390>
5. **Is it repeated measures?** (blocks; 9,073 views) — "Should I use two-way
   Repeated Measures ANOVA for this purpose or just two-way is also fine?"
   <https://stats.stackexchange.com/questions/15982>
6. **One test for whole curves** (blocks; 11,306 views, unanswered) — "However,
   I would like to find a single test for the overall dose-response
   relationship." People compare A/Ci curves by SE-bar overlap or per-point
   ANOVA. <https://stats.stackexchange.com/questions/92569>
7. **Dose-response at screening scale** (blocks) — "Prism obviously has the
   easiest way of doing dose-response curves well, but I can't copy and paste
   this much data." <https://stackoverflow.com/questions/66806526>
8. **Nested model vs reviewer familiarity** (wrong result risk) — "I believe
   some kind of nested model would be the most rigorous, but I'm also worried
   about how "unfamiliar" tests are perceived." Cell biologist, 20 images × 3
   days × 6 conditions. <https://stats.stackexchange.com/questions/630997>
9. **One blot, no n** (blocks; 5,522 views) — "Since I've managed to run the
   blot just once, it is a single observation and I don't have a mean and
   SD." Asks whether re-reading densitometry three times gives n.
   <https://stats.stackexchange.com/questions/239006>
10. **Black-box qPCR statistics** (wrong result risk; 18,458 views) — "Often
    reliance is given to a computer program like RealTime StatMiner, which in
    addition to putting the stats on the back-end, could easily be misused by
    a user." Accepted answer: analyse on the Ct scale.
    <https://stats.stackexchange.com/questions/120821>
11. **Same test, P values halved** (wrong result risk) — "The p-values I get
    for the pairwise comparisons (unadjusted for multiple comparisons) are
    exactly half what I get in SPSS and GraphPad for the same data." (R's
    dunn.test is one-sided.) <https://stats.stackexchange.com/questions/160634>
12. **%-of-control removes control variance** (wrong result risk) —
    "Therefore, my control has no variance (100% for all three experimental
    days) while my knockdown clones do have variance."
    <https://stats.stackexchange.com/questions/74667>
13. **Pairwise survival comparisons** (blocks; 10,792 views) — "Is it
    necessary to correct for multiple comparisons? If yes, is there a nice way
    of plotting these multiple comparisons"
    <https://stats.stackexchange.com/questions/31077>
14. **Animal numbers for a log-rank test** (blocks; 6,544 views) — "I have
    really little idea of survival analysis."
    <https://stats.stackexchange.com/questions/91270>
15. **Prism's two-way comparison menu** (blocks) — "I could compare each value
    to each other value, but this results in irrelevant comparisons being made
    that decrease significance levels."
    <https://stats.stackexchange.com/questions/364730>
16. **Publication dose-response plot outside Prism** (slows; 29,845 views) —
    "There is no way of directly adding the drm model curve. I need to rewrite
    the 4-PL as a function and add it in the form of a stat_function, which is
    cumbersome to say the least." Also wants the zero-dose control on a log
    axis. <https://stackoverflow.com/questions/36780357>
17. **Error bars that contradict a paired test** (wrong result risk; 10,269
    views, 21 votes) — "(I): That cannot be true. The bars overlap, and we have
    p=0.03? That's not what I have learned in high school."
    <https://stats.stackexchange.com/questions/60767>
18. **Rule-of-thumb replicates vs power** (slows; 28 votes) — "Should I be
    doing a power analysis each time I design an experiment, or can I just use
    one of the common biology rules of thumb?"
    <https://biology.stackexchange.com/questions/963>
19. **Cytometry exports unusable downstream** (slows) — "The way flow-jo
    exports is in wide rather than long format." … "Running statistical
    programs or databases is intractable with the export options Flowjo
    gives." <https://bioinformatics.stackexchange.com/questions/19645>
20. **Survival data recorded as counts alive** (blocks) — "My supervisor
    recommended a Kaplan Meier Survival Analysis, however, I don't have the 0-1
    data for status." 10 treatments × 6 replicate vials × 12 animals, counted
    daily. <https://stats.stackexchange.com/questions/617752>

## Recurring answerer advice (204 observations)

The same handful of corrections is given again and again; each implies a
default a tool could apply instead of leaving it to a forum:

- **Average technical replicates, or model them; never count them as n**
  (26 advice obs; e.g. "Your 20 images for each combination of condition and
  biological replicate are simply technical replicates.", stats-630997;
  "Failure to do so results in a higher false positive rate than you
  intend.", stats-534070). Need: a replicate-structure step that sets n to
  the experimental unit and offers a nested/mixed model or SuperPlot.
- **Analyse qPCR on the Ct (log) scale, compute per well, validate reference
  genes, correct for efficiency** (16) — "it is really best to analyze the
  data on the $C_t$ scale, not after transforming to the multiplicative
  scale" (stats-120821).
- **Log-transform ratios, fold changes, concentrations and CFU** (13) — "Log
  ratios are symmetric, and can be added and subtracted." (stats-220672).
- **Fit the curve and compare parameters; do not t-test each dose or time
  point** (the most common dose-response and curve-comparison advice) — "Good call on not using multiple t-tests." (biology-58119);
  "Using 250 separate t-tests is both inefficient and potentially
  misleading." (stats-574493).
- **Use Dunnett when only comparisons with control matter** (stats-78324,
  stats-600650, stats-651607, stats-676922, stats-424471).
- **Keep pairing/blocking by experiment day instead of normalising to 100%**
  (13 paired-design advice) — "consider using a two-way ANOVA on the raw data
  with the within day variance accounted for in the manner of a paired test"
  (stats-74667).
- **Show every point; say what the error bar is** (11) — "With fewer than
  100 or so values, create a scatter plot that shows every value."
  (stats-310875); "The most important thing is that you state clearly what
  the error bar represents." (stats-12588).
- **Get variance from a pilot before powering** (15) — "In order to calculate
  power, you need to know the variance of the data being collected."
  (biology-963).
- **Don't choose the test by a normality pre-test** — "Choosing whether to do
  a parametric or non-parametric test based on an initial assessment of
  normality is not good practice." (stats-641514).
- **Flag what the data cannot support** (fit-diagnostics 16): flat curves
  have no EC50, plateaus must be reached, two-site binding, out-of-range ODs
  must not be extrapolated.

## Surprises

- **Cross-tool disagreement is a core trust problem (34 observations).**
  Bench users validate by re-running in a second package and panic when
  numbers differ: Dunn's one- vs two-sided P (stats-160634), box-plot
  quantile definitions (stackoverflow-44522293), Type III sums of squares
  (stackoverflow-52483819), log-rank variance formula (stats-15350), Excel
  truncating fractional df so Prism's Geisser-Greenhouse P "looks halved"
  (stats-481048), Monte Carlo Dunnett P changing between runs (stats-83116),
  relative vs absolute EC50 in drc (stackoverflow-57568882,
  stackoverflow-62040872). A tool that names the exact method behind every
  number, and matches reference outputs, addresses a real anxiety.
- **Data-entry orientation silently changes the analysis.** Two threads show
  repeated-measures/Friedman results "differing" from R only because the
  table told Prism the wrong values were matched (stats-29280,
  stats-596638).
- **The vendor uses Cross Validated as a design forum.** A self-identified
  GraphPad developer asks how to compute P values for FDR after
  Kruskal-Wallis "to allow users of GraphPad Prism" (stats-162679), an
  answerer writing as the vendor says Dunnett was being extended to 256
  groups (stats-29859), and on Stack Overflow asks how
  to embed fonts in EPS because journal production staff could not edit
  exported text (stackoverflow-9725511).
- **Scale and format limits push people to R/Python, where they then lose
  Prism's defaults**: "can't handle large datasets" (stackoverflow-23691712),
  "can't copy and paste this much data" (stackoverflow-66806526), biphasic
  and Boltzmann models only known from Prism (stackoverflow-72472432,
  stats-620620, stackoverflow-69814007), and a cluster of "make ggplot/seaborn
  look like Prism" questions (column scatter, beeswarm, P-value brackets on
  growth curves, zero dose on a log axis).
- **Social pressure, not statistics, often drives the question.** Reviewers
  demand P values for obvious effects (stats-93431), SE bars on paired data
  (stats-60767), or object to pooled quantal counts (stats-677208);
  supervisors and statisticians disagree on pooling replicates
  (stats-459984, stats-663411: "a bench scientist who thinks that Prism is
  the last word in statistical software"); a junior author worries about a
  shared control (stats-676922).
- **Small-n nonparametric dead ends are common**: Wilcoxon/Mann-Whitney
  cannot reach P<0.05 at n=3-5, yet users choose them after failing normality
  tests (biology-112938, stats-308700, stats-409611).
