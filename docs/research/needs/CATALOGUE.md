# User-needs catalogue (2026-10-09)

This catalogue turns 3,666 observations of user problems, gathered from 15 kinds of venue (Q&A sites, issue trackers, YouTube comments, reviews, consulting FAQs, blogs, forums, courses, journal rules, the methods literature, GraphPad's own support pages, competitor trackers, Hacker News, the fediverse and non-English communities), into 178 needs: things a tool would have to do. Each need carries its counts, venue mix, severity, engagement, the literature's prevalence figures where they exist, verbatim evidence with links, OpenDose's status with the artefact that shows it, the gap and a proposal. 2,274 observations (62%) fall in needs OpenDose already meets, 1,237 (34%) in needs it meets in part and 155 (4%) in needs it does not meet.

Files: [`needs.json`](needs.json) (the machine-readable catalogue), [`IMPROVEMENT-PLAN.md`](IMPROVEMENT-PLAN.md), [`by-venue.md`](by-venue.md), [`build_catalogue.py`](build_catalogue.py) + [`needs_rules.py`](needs_rules.py) (re-run: `python3 docs/research/needs/build_catalogue.py`).

## Contents

1. [Method](#method)
2. [How needs are ranked](#how-needs-are-ranked)
3. [The needs, by workflow](#the-needs-by-workflow)
4. [What the whole corpus says](#what-the-whole-corpus-says)
5. [Index of all needs](#index-of-all-needs)

## Method

### Sources

| Venue file | Observations | What it is |
|---|---:|---|
| `raw/stackexchange.json` | 698 | Questions and answers on Cross Validated, Biology, Bioinformatics, Chemistry and Stack Overflow. |
| `raw/github.json` | 463 | Issue and discussion threads in R/Python statistics and plotting packages, dose-response and survival packages, and open tools. |
| `raw/graphpad-support-mirror.json` | 400 | GraphPad's public release notes (Prism 8–11), FAQ, academy and licensing pages: the vendor's own record of requests and bug fixes. |
| `raw/youtube.json` | 324 | Comments and replies under the most-viewed tutorials on Prism, IC50, ELISA, qPCR, survival, ANOVA, t tests, error bars and densitometry. |
| `raw/literature.json` | 274 | Methods critiques and meta-research audits; each documented mistake is one observation, with its prevalence where the paper reports one. |
| `raw/competitor-signals.json` | 233 | Trackers, forums and product pages of BarelySig, JASP, jamovi, BioRender Graphing and smaller tools: what other tools think the pain is. |
| `raw/reviews.json` | 188 | First-person software reviews (SelectScience, App Store, AlternativeTo, SourceForge, SoftwareSuggest, PeerSpot). |
| `raw/consulting-faqs.json` | 183 | University statistics-consulting and core-facility FAQs: the questions biologists bring to statisticians. |
| `raw/blogs.json` | 171 | Lab, methods and teaching blogs and their comment threads. |
| `raw/journal-requirements.json` | 160 | Author instructions, reporting checklists and editorials (Nature, eLife, PLOS, Cell Press, JBC, BJP, ARRIVE, MDAR, MIQE, MIFlowCyt…): each required item is one observation. |
| `raw/forums.json` | 153 | forum.image.sc, Bioconductor support, Galaxy help and SEQanswers threads. |
| `raw/courses.json` | 151 | Course and workshop materials that teach Prism and bench statistics, and polls that size the workflows. |
| `raw/non-english.json` | 126 | Chinese, Japanese, Korean, German, French and Turkish communities (muchong, bilibili, Yahoo Chiebukuro, Qiita, BRIC, statistik-forum.de, les-mathematiques, futura-sciences, Ekşi Sözlük); quotes kept in the original language. |
| `raw/hackernews.json` | 101 | Hacker News comments (Algolia API). |
| `raw/social.json` | 41 | Mastodon / fediverse posts by bench and lab scientists. |
| **total** | **3,666** | |

**Observations.** Each research agent read the pages itself and wrote one observation per distinct
user problem (`SCHEMA.md`): a verbatim quote of one to three sentences, the agent's one-line reading
of the problem and of the need, a severity, any engagement counts the page shows, and tags from
`TAGS.md`. Every venue digest (`raw/<venue>.md`) records a script check of each quote against the
cached page text; the digests report no mismatches. Where a site refused the tooling (HTTP 403 or a
bot check) it was skipped and listed, never worked around.

**Unreachable or absent.** Reddit (403 to pages, `.json` and RSS; see `REDDIT.md` for how to add
hand-exported threads, which this script will pick up as `raw/reddit.json`); ResearchGate (403);
Zhihu (403), CSDN, Baidu Zhidao, Jianshu, Naver and Tistory (JavaScript shells) and dxy.cn (bot
check); Capterra, G2 and TrustRadius (blocked today, so most first-person Prism reviews are missing);
Bluesky (403 to the public API); Bitesize Bio, Medium, science.org blogs and Gelman's blog (403);
help.biorender.com and alternativeto.net's Prism page (403); Biostars (no relevant threads surfaced;
not crawled). forum.image.sc, which had blocked earlier tooling, was reachable this time and supplies
most of the forum observations. Spanish- and Portuguese-language Q&A has no usable observations (see
the exclusion below), and Turkish has two.

**Exclusions made by this script.** The non-English digest says six pt/es Stack Overflow
observations were read through `api.stackexchange.com` after the question pages returned 403 and were
to be removed; the JSON still contains them, so `build_catalogue.py` drops every non-English
observation whose URL is an API endpoint (rule `EXCLUDE_RULES`). The social digest records that 15
posts from authors outside bench science were removed before this build.

**Status judgements.** Each need's status (`done`, `partial`, `missing`) was judged against
`README.md`, `docs/ROADMAP.md` (including its open-item lists and site-validation follow-ups),
`web/src/sheets/README.md`, `web/src/guide/explainers.ts`, `web/src/guide/recommend.ts` and the
handler names in `engine/opendose/api.py`, as of 2026-10-09; the justification names the line or
handler. `done` means the capability exists, not that every request in the cluster is met; the gap
field says what is left. Needs marked *met but hard to find* are done, but users who ask for them
would not find them where they look.

### Clustering

The 3,666 observations were clustered into 178 needs (94 done, 69
partial, 15 missing) by explicit rules in `needs_rules.py`, so that a later run with more
data repeats the same assignment. Each need lists keyword patterns (matched against the observation's
`need` text, then its `problem`, quote and workflow) and the tags it covers; every observation goes to
the single need with the highest score (three points per pattern matched in the need text, 1.5 in the
problem, 0.5 in the quote or workflow, 2.5 if its first tag is one of the need's tags, one per further
matching tag, minus 3 for catch-all needs, so that specific needs win ties). 3,435 observations
(94%) were placed by keywords and 225 (6%) by the fallback that maps
their first tag to a default need. Needs left with fewer than three observations are folded into a
named parent (6 observations moved). The `--check` option prints every need with its members for
review; the rules were tuned by reading all 3,666 need texts.

## How needs are ranked

For each need:

```
priority_raw   = ln(1 + n_observations)
               × mean severity weight   (blocks the analysis 3, wrong result risk 2.5,
                                          slows the work 1.5, cosmetic / preference 0.5)
               × sqrt(number of distinct venues)
               × (1 + signal / max signal over all needs)
signal         = log10(1 + votes + views/100 + video views/1000 + HN thread points)
                 (votes = votes, likes, reactions, upvotes, favourites, boosts on the observation;
                  views = page views; video views and HN thread points are counted once per
                  distinct video or thread, not once per comment)
priority_score = 100 × priority_raw / max priority_raw
```

Frequency enters on a log scale so that one venue with hundreds of near-identical comments cannot
dominate; breadth (how many different kinds of venue raise the need) multiplies it, because a need
that appears in the literature, in journal rules, in forums and in YouTube comments is more robust
than one venue's hobby-horse; severity weights a silent wrong result almost as high as a blocked
analysis; signal (engagement) can at most double the score. Literature and journal observations carry
no engagement, which is why signal is bounded.

## The needs, by workflow

Workflows are ordered by the score of their highest-ranked need; needs within a workflow by score. Each need shows its counts, any prevalence figure from the literature, three quotes (verbatim, with links), OpenDose's status with the artefact that shows it, the gap and the proposal.

### Choosing the test

6 needs, 139 observations.

#### 1. Tell me which test fits my design before I run anything

`design-first-test-chooser` · score **100.0** · 51 observations from 14 venues (Statistics-consulting FAQs 7, Stack Exchange 7, YouTube comments 6, Lab blogs 5, Courses and workshops 5, GraphPad support pages 5) · severity: blocks 24, wrong result 11, slows 16 · signal: 24,085 page views; 24 votes/likes; 1,175,921 views of the videos commented on; 37 HN thread points

- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1001756), `lit-baker2014-inappropriate`): “As many as 55% (95% CI 46.7%–62.3%) of studies, however, included analyses based on what we consider to be inappropriate statistical tests, and we saw no consistency in statistical tests of essentially the same hypothesis (part 2 in Text S1 ).”
- **Prevalence** ([eLife](https://pmc.ncbi.nlm.nih.gov/articles/PMC6326723/), `lit-weissgerber2018elife-oneway-misuse`): “Among papers that used one-way ANOVAs, 60.9% (67/110) used a one-way ANOVA for an analysis where the study design included two or more factors.”

> Should I use two-way Repeated Measures ANOVA for this purpose or just two-way is also fine?
>
> — [stats.stackexchange.com, 2011-09](https://stats.stackexchange.com/questions/15982) `stackexchange-stats-15982`

> 以下の実験結果の統計はOne-wayかTwo-wayのどちらになるのでしょうか。それともそれ以外でしょうか。
>
> — [chiebukuro.yahoo.co.jp, 2014-11, cell biologist (drug response, two cell lines)](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q14137692429) `nonen-ja-oneway-twoway-1` *(Gloss: 'Is the statistics for the following experiments one-way or two-way? Or something else?' — Problem: cannot map a time course and a two-cell-line dose series onto one-way vs two-way ANOVA vs t tests (3,408 views).)*

> you mention that the grouped tables and graphs tab would be suitable for cases in which you have four groups, in which the data are time dependent. My doubt is, which statistical analyses would you do for it? ANOVA two way?
>
> — [youtube.com, 2017-10](https://www.youtube.com/watch?v=M0Sl-3eu974&lc=UgjyM5Ab_phUNXgCoAEC) `youtube-M0Sl-3eu974-UgjyM5Ab_phUNXgCoAEC`

- **Status: done** (met, but hard to find). README › Guidance: 'A "Which test?" wizard that asks about the design, runs the data checks it can and opens the recommended analysis pre-configured' (web/src/guide/recommend.ts).
- **Gap:** README describes the wizard as its own dialog and does not say the Analyze dialog offers it when a user picks an analysis; its questions do not use the user's own rows as examples.
- **Proposal (S):** Offer "Which test?" inline in the Analyze dialog (a 'Help me choose' first entry, pre-filled from the table) and phrase its pairing question with the user's own first row ('Is A1 the same animal as B1?').

#### 12. Ask whether the same subjects were measured repeatedly and choose a paired or repeated-measures analysis

`repeated-measures-detection` · score **78.0** · 39 observations from 10 venues (Stack Exchange 19, Courses and workshops 3, GitHub issues 3, GraphPad support pages 3, Journal requirements 3, Non-English communities 3) · severity: blocks 7, wrong result 24, slows 8 · signal: 128,153 page views; 63 votes/likes; 226,702 views of the videos commented on

- **Prevalence** ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0007824), `lit-kilkenny2009-3`): “Further analysis showed that overall only 70% (174/247) of papers that used a statistical method described the method employed, and also presented the numerical results with a measure of variation”
- **Prevalence** ([eLife](https://pmc.ncbi.nlm.nih.gov/articles/PMC6326723/), `lit-weissgerber2018elife-rm-missing`): “Our data suggest that scientists should be cautious about this assumption, as 28.3% of papers that did not indicate that repeated measures were used (52/184) included at least one ANOVA that appeared to require repeated measures.”

> The reason I ask this is that a paper I was recently involved with was criticized by a biologist for using a paired t-test rather than an unpaired t-test.
>
> — [stats.stackexchange.com, 2012-09, mathematician by training (stated in answer by asker)](https://stats.stackexchange.com/questions/38102) `stackexchange-stats-38102`

> The problem that I now have is this: Two of the datasets/groups are paired (group 1 & 2), two are not (group 3 & 4).
>
> — [forum.jamovi.org, 2024-03](https://forum.jamovi.org/viewtopic.php?t=3720) `competitor-jamovi-3720`

> I only wish it could handle paired data.
>
> — [github.com/kassambara/ggpubr, 2018-12, researcher, radiation therapy + immunotherapy lab (GitHub bio)](https://github.com/kassambara/ggpubr/issues/143) `github-ggpubr-143-2`

- **Status: done**. The wizard's design asks whether measurements are paired, matched or repeated (recommend.ts `paired`, `repeated`) and routes to paired t, RM ANOVA, Friedman or the mixed model (README › Statistics).

#### 95. Say in the results and the methods which test was run and why it fits

`explain-test-choice-in-output` · score **36.7** · 10 observations from 7 venues (Lab blogs 2, Hacker News 2, Journal requirements 2, Competitor trackers 1, GitHub issues 1, Methods literature 1) · severity: wrong result 8, slows 2 · signal: 1,223 page views; 1 votes/likes; 267 HN thread points

> Sometimes I face problems in the lab for which I am not able to come up with a sensible answer, due to my lack of statistical knowledge.
>
> — [stats.stackexchange.com, 2017-06, analyst supporting a lab researcher (stated)](https://stats.stackexchange.com/questions/285318) `stackexchange-stats-285318`

> One thing we're trying in my program right now is to introduce "Statistical Thinking" as a mandatory class for both wet lab and computational students, to cover the why of statistics and try to teach people how to think about what they're doing, before they hit the "When X, do Y to collect p-value." stage.
>
> — [news.ycombinator.com, 2023-07, member of a graduate program (stated)](https://news.ycombinator.com/item?id=36782152) `hn-36782152`

> I do not feel 100 % comfortable with this, with very low p-values and large effect sizes between 18 and 48.
>
> — [github.com/jasp-stats/jasp-issues, 2025-05](https://github.com/jasp-stats/jasp-issues/issues/3426) `github-jasp-3426-2`

- **Status: partial**. Results sheets are named after the test and carry a methods paragraph (README › Reporting), and the wizard gives a one-paragraph reason (recommend.ts `reason`), but that reason is not stored on the results sheet.
- **Gap:** The wizard's design answers and reason vanish once the analysis opens; assumption checks that were run are not listed in the methods.
- **Proposal (S):** Store the wizard's answers and reason on the results sheet and print them in the 'Statistical analysis' paragraph ('chosen because the same mice were measured at every time point'); list the assumption checks run and their outcome.

#### 99. When X is a dose or time, model the whole curve instead of testing every dose or time point

`dose-time-not-per-point` · score **35.3** · 13 observations from 5 venues (Stack Exchange 8, Methods literature 2, Forums (image.sc, Bioconductor, Galaxy) 1, GraphPad support pages 1, YouTube comments 1) · severity: blocks 1, wrong result 10, slows 2 · signal: 17,144 page views; 21 votes/likes; 78,308 views of the videos commented on

- **Prevalence** ([Scientific Reports](https://pmc.ncbi.nlm.nih.gov/articles/PMC8044116/), `lit-tumorgrowth2021-typeI`): “Multiple tests used to assess the same hypothesis lead to risk of false discoveries due to multiple comparisons, with type I error rate more than double the commonly specified 5% 8 .”

> For the factorial desgin I get 112 genes a with significant dose effect, and for the regression model (dose is the regressor and study stays a factor) I get 280 genes at the same significance level. Can I conclude that the regression model is more sensitive?
>
> — [support.bioconductor.org, 2005-01, pharma scientist (Aventis address)](https://support.bioconductor.org/p/7179/) `bioc-7179-1`

> what if on day 5 I have 1000 survivors? Do I need to enter zero 1000 times? There must be other option. For example I have already % of survivors at certain hours post infection
>
> — [youtube.com, 2016-10](https://www.youtube.com/watch?v=82YACeWbfpI&lc=UggAm_V8plv3EXgCoAEC) `youtube-82YACeWbfpI-UggAm_V8plv3EXgCoAEC`

> What I have done so far are multiple t-tests ("one per row") between two curves - this gives me individual p values, one for each time point
>
> — [stats.stackexchange.com, 2022-05](https://stats.stackexchange.com/questions/574493) `stackexchange-stats-574493`

- **Status: partial**. Compare fits, AUC and the mixed model exist (README › Curve fitting, Assay modules), and a data-entry prompt flags numeric row titles in a Grouped table (ROADMAP › Theme 1), but the wizard has no 'X is a dose or a time' branch from a grouped table.
- **Gap:** Users with doses or times as rows are still offered per-row tests first.
- **Proposal (S):** When a grouped table's row titles are numeric, make the first suggestion 'fit a curve / compare curves' (dose) or 'mixed model or AUC' (time), with per-row tests demoted and marked as many comparisons.

#### 116. Route counts, proportions and percentages to count models, not t tests on percentages

`counts-proportions-routing` · score **29.0** · 18 observations from 4 venues (Stack Exchange 14, Methods literature 2, GitHub issues 1, GraphPad support pages 1) · severity: blocks 3, wrong result 7, slows 8 · signal: 6,232 page views; 16 votes/likes

- **Prevalence** ([Molecular Biology of the Cell](https://pmc.ncbi.nlm.nih.gov/articles/PMC6724699/), `lit-pollard2019-1`): “Proportions (e.g., 0.84 interphase cells and 0.16 mitotic cells) and percentages (e.g., 84% interphase cells and 16% mitotic cells) are also categorical responses but are often inappropriately treated as numerical responses in statistical test ... They may think that proportions are numerical responses, because they are numbers, but they are not numerical responses.”

> Am I in a setup for a two way ANOVA with replicates?
>
> — [stats.stackexchange.com, 2011-09](https://stats.stackexchange.com/questions/15067) `stackexchange-stats-15067`

> Adding Fisher (and maybe Chi-squared) test options for categorical variables
>
> — [github.com/jbengler/tidyplots, 2025-04, senior computational biologist, cancer center (GitHub bio)](https://github.com/jbengler/tidyplots/discussions/94) `github-tidyplots-94-1`

> Fixed the issue when it was impossible to fit a data set with the Poisson regression method if there were zeros in the source data table.
>
> — [graphpad.com release notes, 2024-07](https://www.graphpad.com/updates/prism-10-3-0-release-notes) `gpsupport-rn-1030-6`

- **Status: partial**. Contingency tests, the binomial test and logistic regression exist (README › Statistics), and the wizard proposes 'Proportion per biological replicate, then a t test or ANOVA' (recommend.ts); there is no binomial or Poisson model with groups and a replicate factor.
- **Gap:** No Poisson/binomial GLM (or GLMM) for counts per group with experiment as a block.
- **Proposal (M):** Add a 'counts' branch that fits a binomial (successes/trials) or Poisson GLM with group and experiment terms, reporting rate or odds ratios with CIs; keep 'proportion per replicate' as the simple alternative.

#### 149. Compare groups adjusting for baseline (ANCOVA) instead of change scores or % of baseline

`ancova-baseline` · score **19.7** · 8 observations from 3 venues (Stack Exchange 5, Statistics-consulting FAQs 2, Courses and workshops 1) · severity: blocks 2, wrong result 3, slows 3 · signal: 7,091 page views; 8 votes/likes

> But what is the best parameter to analyze: absolute difference, percent difference or pre/post ratio?
>
> — [stats.stackexchange.com, 2014-10](https://stats.stackexchange.com/questions/120721) `stackexchange-stats-120721`

> Pretest-posttest studies have been pervasive for many years, however many researchers are still unclear on the statistical methods most appropriate for analyzing such data.
>
> — [cscu.cornell.edu, 2022-04, course/consulting page, audience: Cornell researchers (CSCU consulting handout)](https://cscu.cornell.edu/wp-content/uploads/prepost.pdf) `consult-cornell-prepost`

> Sample Special Topics: Survival, Non-Linear, Growth; MANCOVA ANCOVA MANOVA + GLM (SEM/Mediation); Factor Analysis + Logistic Regression
>
> — [bbsp710.web.unc.edu, 2023-09, 2nd year+ biomedical graduate students, UNC Chapel Hill (course audience)](https://bbsp710.web.unc.edu/wp-content/uploads/sites/22952/2023/07/BBSP710_FALL_2023_final.pdf) `courses-unc-special-topics`

- **Status: partial**. Multiple linear regression on multiple-variables tables can fit an ANCOVA (README › Statistics, 'multiple linear regression'), but no wizard path or template sets it up.
- **Gap:** No pre/post route in the wizard and no ANCOVA output (adjusted difference with CI).
- **Proposal (M):** Add a pre/post design question that opens an ANCOVA template (follow-up ~ group + baseline) reporting the adjusted group difference with its CI and the slope check.

### Replicates, n and experimental units

7 needs, 298 observations.

#### 2. Tell me what n = 1–3 can and cannot show, and refuse P values when there is one independent value

`small-n-honesty` · score **99.0** · 45 observations from 14 venues (Stack Exchange 17, Forums (image.sc, Bioconductor, Galaxy) 5, Methods literature 5, Statistics-consulting FAQs 3, YouTube comments 3, Lab blogs 2) · severity: blocks 9, wrong result 27, slows 5, cosmetic 4 · signal: 385,122 page views; 93 votes/likes; 777,609 views of the videos commented on; 26 HN thread points

- **Prevalence** ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC4406565/), `courses-weissgerber2015-small-n`): “The minimum sample size for any group shown in a figure was four (median number of independent observations), with an interquartile range of three independent observations (25th percentile: n = 3, 75th percentile: n = 6).”
- **Prevalence** ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/), `journal-bjp-design-12`): “To reduce this risk we encourage investigators to acknowledge this and add 50% to the calculated minimum group sizes.”

> I need to extrapolate from this an IC50 value, which is the concentration (x axis) value, for which 50% Activity is seen.
>
> — [stats.stackexchange.com, 2014-09, MSc student (stated)](https://stats.stackexchange.com/questions/115020) `stackexchange-stats-115020`

> I only have 3 replicates of each. Would you recommend a 2 tailed equal variance t test? I also thought I read that with such few replicates, a fold change would be better than a t test?
>
> — [support.bioconductor.org, 2003-12](https://support.bioconductor.org/p/3267/) `bioc-3267-1`

> 自分のデータはn=1なので、やはり有意差をだすだなんて無理な話なのでしょうか。
>
> — [chiebukuro.yahoo.co.jp, 2007-11, student starting biology research](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q1313389723) `nonen-ja-n1-expression-1` *(Gloss: 'My data are n=1, so is getting a significant difference impossible after all?' — Problem: does not understand replication requirements for testing (2,180 views).)*

- **Status: partial**. Assumption chips report n per group (ROADMAP › Theme 1) and the wizard asks for sample size (recommend.ts `SampleSize`), but nothing stops a P value when a group holds a single independent value.
- **Gap:** No hard stop or 'exploratory' label at n = 1 per group; no note of what effect the current n could detect.
- **Proposal (S):** When any group has fewer than two independent values, withhold P and show descriptive results labelled exploratory; at n = 2–3 add a chip with the detectable effect (from the power engine) and the t-based CI width.

#### 3. Nested t test, nested ANOVA or a mixed model with animal, litter or culture as a random effect, without code

`nested-mixed-models` · score **98.7** · 75 observations from 11 venues (Stack Exchange 33, Methods literature 10, Competitor trackers 7, Statistics-consulting FAQs 7, GitHub issues 7, YouTube comments 3) · severity: blocks 13, wrong result 45, slows 17 · signal: 236,916 page views; 123 votes/likes; 511,106 views of the videos commented on

- **Prevalence** ([Journal of General Physiology](https://pmc.ncbi.nlm.nih.gov/articles/PMC7814346/), `lit-eisner2021-fpr29`): “both equal to 0.3, the simulation found that P was <0.05 in 29% of trials. Since there were no real differences in this simulation, these 29% are all false positives.”
- **Prevalence** ([BMC Neuroscience](https://pmc.ncbi.nlm.nih.gov/articles/PMC2817684/), `lit-lazic2010-2`): “37% of the time (and not 5%) the null hypotheses would be (erroneously) rejected. Thus when there is a positive correlation, null hypotheses will be rejected too often”

> I believe some kind of nested model would be the most rigorous, but I'm also worried about how "unfamiliar" tests are perceived.
>
> — [stats.stackexchange.com, 2023-11, works in cell biology (stated)](https://stats.stackexchange.com/questions/630997) `stackexchange-stats-630997`

> what if I have about 100-300 repeated measures from each treatment?
>
> — [youtube.com, 2018-10](https://www.youtube.com/watch?v=PraEKrhJlt8&lc=UgxymcwpnC6RgFmME0V4AaABAg) `youtube-PraEKrhJlt8-UgxymcwpnC6RgFmME0V4AaABAg`

> I'd like to be able to plot the LMM results from Jamovi in Graphpad. This can of course be done in r, but the whole reason I use jamovi is because the GUI is faster (for me) than writing the R code which I'm less familiar with.
>
> — [forum.jamovi.org, 2025-03](https://forum.jamovi.org/viewtopic.php?t=3930) `competitor-jamovi-3930`

- **Status: partial**. Nested t test and nested one-way ANOVA run as mixed models (README › Statistics; handlers `nested_ttest`, `nested_anova`); there is no two-factor nested model and no way to tag a litter or cage column as random elsewhere.
- **Gap:** Grouped + nested (two-way) designs, random effects in other analyses, litter/cage as a grouping column.
- **Proposal (L):** Add a two-way nested mixed model (treatment × genotype with animal random) and a 'grouping column' role on multiple-variables tables that any comparison fits as a random intercept.

#### 4. Ask what the independent unit is (animal, culture, experiment) and compute n from it

`declare-experimental-unit` · score **91.0** · 69 observations from 11 venues (Stack Exchange 17, Methods literature 14, Statistics-consulting FAQs 8, Journal requirements 8, YouTube comments 7, Forums (image.sc, Bioconductor, Galaxy) 6) · severity: blocks 2, wrong result 55, slows 12 · signal: 25,155 page views; 37 votes/likes; 699,097 views of the videos commented on; 231 HN thread points

- **Prevalence** ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0007824), `lit-kilkenny2009-5`): “The experimental unit (e.g. a single animal or a group of animals) was not clearly identified in 13% of the 48 studies assessed in more detail”
- **Prevalence** ([PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0007824), `lit-kilkenny2009-numbers-mismatch`): “In 35% (69/198) of the papers that reported animal numbers in the methods section, the number of animals was either not reported in the results section, was unclear, or was different from that reported in the methods .”

> What alternatives do I have? Is it allowed to do a simple average on the normalized counts of each of the 3 samples converting it into a single normalized count??
>
> — [support.bioconductor.org, 2021-02, newbie (stated)](https://support.bioconductor.org/p/9135173/) `bioc-9135173-1`

> Can I count the cells multiple times or ask someone else to count them and then perform ANOVA or t-test?
>
> — [stats.stackexchange.com, 2022-02, new to statistics (stated)](https://stats.stackexchange.com/questions/563465) `stackexchange-stats-563465`

> so to get average and sd se values, i need to perform multiple qpcr? As for each qpcr, i am getting one del del cT value for control and one for the treated sample.
>
> — [youtube.com, 2022-10](https://www.youtube.com/watch?v=yahM5sRTlVM&lc=UgwHoILNUFOCpYUlxuF4AaABAg) `youtube-yahM5sRTlVM-UgwHoILNUFOCpYUlxuF4AaABAg`

- **Status: partial**. Reporting details and the replicate map give n its unit ('n = 18 cells from 3 independent experiments', README › Reporting) and the 'n might be cells' chip offers 'Assign replicates…' (ROADMAP › Theme 2); ROADMAP open items: replicate assignment exists for column and grouped tables only.
- **Gap:** Not asked at table creation; XY tables and grouped cells cannot be assigned (ROADMAP Open items, Theme 2).
- **Proposal (S):** Ask 'What does each value represent?' (independent experiment / animal / technical repeat / cell) when a table is created or pasted, and extend replicate assignment to XY tables and grouped cells.

#### 19. Treat each independent experiment (day, plate, run) as a block instead of pooling or normalising it away

`experiment-as-block` · score **67.7** · 35 observations from 8 venues (Stack Exchange 23, Methods literature 3, Lab blogs 2, Non-English communities 2, YouTube comments 2, Competitor trackers 1) · severity: blocks 3, wrong result 28, slows 4 · signal: 76,370 page views; 52 votes/likes; 340,164 views of the videos commented on

> I am observing a similar trend, but neither experiment alone reaches statistical significance. Is there a way to combine the two experiments to increase power?
>
> — [stats.stackexchange.com, 2013-10, scientist, not a statistician (stated)](https://stats.stackexchange.com/questions/71626) `stackexchange-stats-71626`

> I use Flow Cytometry to collect my data, and because of the high variability found in most Cytometers, analysis between experiments from different days is often considered non-viable.
>
> — [forum.jamovi.org, 2020-10, Master student, Brazil (stated)](https://forum.jamovi.org/viewtopic.php?t=1449) `competitor-jamovi-1449`

> Are my data from the same day of experiment paired, regarding that they are from the same cell passage? There are many opinions on this issue.
>
> — [quantixed.org, 2021-07, commenter (Ioanna, cell viability researcher)](https://quantixed.org/2016/07/19/the-digital-cell-statistical-tests/) `blog-quantixed-stattests-1`

- **Status: partial**. Repeated-measures one-way ANOVA and the ratio paired t test treat experiment as the matching (README › Statistics), and SuperPlot statistics pair replicate means when linked by experiment (ROADMAP › Theme 2); the wizard's replicate question (recommend.ts `Replicates`) does not ask whether experiments were run on different days.
- **Gap:** No explicit 'experiment' factor in the wizard; no randomised-block two-way ANOVA with experiment as a factor from a column table.
- **Proposal (S):** Ask 'Was each condition run once per experiment, on different days?' and, if yes, open the matched analysis (RM ANOVA / paired) with experiment as the block, and show the experiment-to-experiment variance it removed.

#### 20. Warn me when my n is cells, wells or repeated reads rather than independent units

`pseudoreplication-warning` · score **66.3** · 26 observations from 11 venues (Methods literature 6, Stack Exchange 5, Forums (image.sc, Bioconductor, Galaxy) 4, Lab blogs 3, Journal requirements 2, Competitor trackers 1) · severity: blocks 1, wrong result 25 · signal: 13,108 page views; 19 votes/likes

- **Prevalence** ([Journal of General Physiology](https://pmc.ncbi.nlm.nih.gov/articles/PMC7814346/), `lit-eisner2021-twocells`): “Even when only two cells are used from each animal, the false-positive rate is >10%.”
- **Prevalence** ([BMC Neuroscience](https://pmc.ncbi.nlm.nih.gov/articles/PMC2817684/), `lit-lazic2010-prevalence`): “12% of papers had pseudoreplication and a further 36% were suspected of having pseudoreplication, but it was not possible to determine for certain because insufficient information was provided.”

> Since I've managed to run the blot just once, it is a single observation and I don't have a mean and SD.
>
> — [stats.stackexchange.com, 2016-10, student project (stated)](https://stats.stackexchange.com/questions/239006) `stackexchange-stats-239006`

> The issue of how to deal with technical replicates (such as those obtained when we do dye-swaps of the same biological samples in cDNA arrays) has come up in the BioC list several times. ... tech. reps. are not independent biological reps. which leads to the usual inflation of dfs and deflation of se
>
> — [support.bioconductor.org, 2004-03](https://support.bioconductor.org/p/4292/) `bioc-4292-1`

> I scanned the latest issues of popular cell biology journals and found that over half the papers counted each cell as a separate
>
> — [blog.everydayscientist.com, 2019-11, cell biologist / microscopist (Sam Lord, blog author)](https://blog.everydayscientist.com/?p=3747) `blog-everydayscientist-superplots-2`

- **Status: done**. ROADMAP › Theme 2: the 'n might be cells' chip offers 'Assign replicates…'; ROADMAP open item: on XY tables it advises without the one-click fix and does not look at grouped cells.
- **Gap:** Does not fire on grouped cells; advisory only on XY tables.
- **Proposal (S):** Extend the chip to grouped cells and XY tables (open item) and add it to the results banner, not only the table.

#### 27. Average technical replicates to one value per biological unit before testing

`collapse-technical-replicates` · score **63.6** · 25 observations from 9 venues (Methods literature 5, Stack Exchange 5, Forums (image.sc, Bioconductor, Galaxy) 4, Statistics-consulting FAQs 3, Non-English communities 3, YouTube comments 2) · severity: blocks 3, wrong result 19, slows 3 · signal: 9,769 page views; 37 votes/likes; 569,564 views of the videos commented on

- **Prevalence** ([BMC Neuroscience](https://pmc.ncbi.nlm.nih.gov/articles/PMC2817684/), `lit-lazic2010-sixorders`): “The change in p -value between the two analyses is six orders of magnitude, which demonstrates the importance of dealing with pseudoreplication appropriately.”

> 在使用graphpad绘制分组柱状图时，若一个处理组下有五个重复，每个重复下有五个样本，那这一个处理组的二十五个数据都要填?，还是只填每个重复下的平均值?
>
> — [muchong.com, 2021-08, student, zoology (profile: 动物学)](https://muchong.com/t-14889747-1) `nonen-zh-replicates-grouped-1` *(Gloss: 'When drawing a grouped bar chart in GraphPad, if a treatment group has five replicates and each replicate has five samples, do I enter all 25 values, or only the mean of each replicate?' — Problem: does not know whether nested samples are independent n or must be averaged per replicate before plotting/testing.)*

> I now need to average the expression levels of the two technical replicates, and their corresponding p-values.
>
> — [stats.stackexchange.com, 2012-01](https://stats.stackexchange.com/questions/20616) `stackexchange-stats-20616`

> Are controls 1, 2, and 3 from the same group, and if so why are they treated as separate when averaging the CT values? The only way this makes sense is if each condition was an n of 6, where controls 1,2, and 3 are all the same cell line or whatever.
>
> — [youtube.com, 2022-10](https://www.youtube.com/watch?v=Kkle8T7aXjk&lc=Ugw7o55_rvA0t8LrM9t4AaABAg) `youtube-Kkle8T7aXjk-Ugw7o55_rvA0t8LrM9t4AaABAg`

- **Status: done**. README › Statistics: 'Statistics on replicate means (SuperPlots): … on one value per experiment, n = number of experiments'; import recipes aggregate cell → image → animal (README › Data tables).

#### 105. SuperPlots: every cell coloured by experiment, experiment means on top, statistics on the means

`superplots` · score **34.0** · 23 observations from 9 venues (Methods literature 5, Stack Exchange 5, GitHub issues 4, Lab blogs 3, Courses and workshops 2, Competitor trackers 1) · severity: wrong result 7, slows 8, cosmetic 8 · signal: 17,812 page views; 14 votes/likes

> Is it then allowed to use these medians (one from each cell) as input for a t-test?
>
> — [stats.stackexchange.com, 2020-06](https://stats.stackexchange.com/questions/470386) `stackexchange-stats-470386`

> Next, explain that the person who did the experiments found out that the rapamycin used in the 4th experiment, was prepared from a stock solution which was at the wrong concentration. How can we exclude the n4 data and remake a new SuperPlot
>
> — [r-bloggers.com, 2025-01, PI, cell biology (Stephen Royle, quantixed)](https://www.r-bloggers.com/2025/01/get-better-r-for-cell-biologists/) `blog-quantixed-rforcellbio-4`

> I would like to apply that to my own data, but the distribution is too spread out and I would need a logarithmic scale to be able to compare my different samples.
>
> — [github.com/kynnemall/superviolin, 2023-10](https://github.com/kynnemall/superviolin/issues/2) `github-superviolin-2-1`

- **Status: done** (met, but hard to find). README › Graphs: 'SuperPlot mode on column and grouped graphs (values coloured by experiment, experiment means, statistics on the means with brackets on the graph)'.
- **Gap:** SuperPlot mode is a graph option (README › Graphs); README does not say that importing cell-level data with an experiment column opens a SuperPlot.
- **Proposal (S):** When an import recipe or paste brings a replicate/experiment column, open the graph in SuperPlot mode by default and say so.

### Access: price, platforms, privacy and language

6 needs, 177 observations.

#### 5. A free tool I can use legally, without licences, trials or seat limits

`free-access` · score **86.4** · 98 observations from 12 venues (GraphPad support pages 30, Software reviews 19, Lab blogs 10, Competitor trackers 9, YouTube comments 9, Non-English communities 7) · severity: blocks 23, wrong result 2, slows 67, cosmetic 6 · signal: 316,371 page views; 4 votes/likes; 1,374,905 views of the videos commented on; 401 HN thread points

- **Prevalence** ([becker.wustl.edu](https://becker.wustl.edu/resources/software/graphpad-prism/), `blog-becker-prismlicence-1`): “Personal Prism licenses cost $150 per person per license year.”
- **Prevalence** ([becker.wustl.edu](https://becker.wustl.edu/?p=2127), `courses-becker-licence-shared`): “Consider this option for shared lab workstations because users with personal licenses will deactivate each other’s Prism if they share the same computer.”

> I have recommended jamovi to all my colleagues (most of them have pirated copies of SPSS or Graphpad Prism - I have tried a 30 day trial of Prism and IMHO it is too complicated to use and not worth the price with these wonderful open source alternatives).
>
> — [forum.jamovi.org, 2018-05, clinician, new PhD (stated)](https://forum.jamovi.org/viewtopic.php?t=326) `competitor-jamovi-326`

> Is graphpad prism the only software you can use to calculate EC50? I'm a student and my research group and I can't afford to buy it:(
>
> — [youtube.com, 2024-10, student (stated)](https://www.youtube.com/watch?v=PZRnF2a56RQ&lc=UgxnM_lO0diHxgEO2Th4AaABAg) `youtube-PZRnF2a56RQ-UgxnM_lO0diHxgEO2Th4AaABAg`

> However, you could save yourself a lot of time by using one of the free online data analysis tools such as mycurvefit.com (for 4PL fit)
>
> — [stats.stackexchange.com, 2013-06, commenter](https://stats.stackexchange.com/questions/61144) `stackexchange-stats-61144-c`

- **Status: done**. README: free, open-source (MIT), no account; runs in the browser.

#### 18. Runs on any computer (Mac, Windows, Linux, tablet), with no install, even offline

`runs-anywhere` · score **68.1** · 42 observations from 9 venues (GraphPad support pages 17, Software reviews 8, Competitor trackers 4, Lab blogs 3, GitHub issues 3, YouTube comments 3) · severity: blocks 20, wrong result 2, slows 14, cosmetic 6 · signal: 163,559 page views; 408,700 views of the videos commented on

> Some of my students asked me about the possibility to install JAMOVI on ipad.
>
> — [forum.jamovi.org, 2021-09, statistics teacher (stated)](https://forum.jamovi.org/viewtopic.php?t=1893) `competitor-jamovi-1893`

> Some time ago, my favorite (commercial) software package for making graphs was no longer supported due to a system upgrade. So I was looking for a powerful and flexible alternative for data visualization.
>
> — [thenode.biologists.com, 2018-05, assistant professor, molecular cytology (Joachim Goedhart)](https://thenode.biologists.com/visualizing-data-with-r-ggplot2/education/) `blog-thenode-ggplottime-1`

> I am unable to download on Mac. However the experiance with window was amazing and easy to use
>
> — [selectscience.net, 2025-11, Organisation: Hunan Univesity; application area: I am using the software for  qPCR data analysis. (shown)](https://www.selectscience.net/product/cfx-maestro-tm-software-mac-edition) `reviews-ss-574c5994-624-1`

- **Status: done**. README: all computation client-side in the browser; offline cache after the first visit; ROADMAP › UI/UX pass: mobile single-column reflow.

#### 148. Stable software that autosaves and never loses work

`stable-autosave` · score **19.8** · 14 observations from 4 venues (Software reviews 6, GraphPad support pages 4, GitHub issues 3, Courses and workshops 1) · severity: blocks 5, wrong result 3, slows 5, cosmetic 1 · signal: 1 votes/likes

> In the following example, base R `stats::t.test()` works, but `rstatix::t_test()` doesn't. I think the reason for the error is because of unused factor levels.
>
> — [github.com/kassambara/rstatix, 2021-10](https://github.com/kassambara/rstatix/issues/133) `github-rstatix-133-1`

> sometimes the software loses the communication with the reader, and there is no way to re-establish it during the long run (kinetics).
>
> — [selectscience.net, 2014-06, Organisation: University of Otago; application area: Synergy 2 Plate Reader Fluorescence, Absorbance. (shown)](https://www.selectscience.net/product/agilent-biotek-gen5-software-for-detection) `reviews-ss-16518-1`

> What can I do when Prism freezes or crashes to a "blue screen"?
>
> — [graphpad.com FAQ](https://www.graphpad.com/support/faq/what-can-i-do-when-prism-freezes-or-crashes-to-a-blue-screen/) `gpsupport-faq-346`

- **Status: done**. README › Data tables: autosave in the browser (the last session reopens), project-wide undo/redo.

#### 152. My data never leaves my computer

`privacy-local` · score **18.8** · 10 observations from 5 venues (GitHub issues 3, Competitor trackers 2, Forums (image.sc, Bioconductor, Galaxy) 2, GraphPad support pages 2, Journal requirements 1) · severity: blocks 5, slows 5 · signal: no engagement counts on these pages

> What happens to the data I might upload on the website? I couldn't find any privacy policy about it. How long is it stored, who has access to it, can I request deletion, things like that.
>
> — [github.com/JoachimGoedhart/PlotsOfData, 2019-03, founder/lead developer of a lab software company (GitHub bio)](https://github.com/JoachimGoedhart/PlotsOfData/issues/10) `github-plotsofdata-10-1`

> I have problem creating volcano plot with labelled genes of interest. I upload the gene list of interest, but it is not recognise in "file of label".
>
> — [help.galaxyproject.org, 2019-04](https://help.galaxyproject.org/raw/1027) `galaxy-1027-1`

> Can I opt-out of Prism Cloud if my organization does not allow it?
>
> — [graphpad.com licensing, 2026-02](https://www.graphpad.com/support/faq/new-graphpad-prism-plans/) `gpsupport-lic-4`

- **Status: done**. README: 'Data never leaves the browser'; privacy statement in the info popover (ROADMAP › Theme 5).

#### 161. Interface and help in my language

`localised-ui` · score **15.3** · 10 observations from 3 venues (Non-English communities 7, Software reviews 2, YouTube comments 1) · severity: slows 9, cosmetic 1 · signal: 7,278 page views; 2 votes/likes; 495,956 views of the videos commented on

> 请问谁有Graphpad Prism 5.0 用户指南中文版？
>
> — [muchong.com, 2012-02](https://muchong.com/t-4079388-1) `nonen-zh-chinese-guide-1` *(Gloss: 'Does anyone have the Chinese edition of the GraphPad Prism 5.0 user guide?' — Problem: needs documentation in Chinese; thread drew 15 replies.)*

> اذا ممكن تقديم شرح باللغة العربية مع جزيل الشكر
>
> — [youtube.com, 2017-10](https://www.youtube.com/watch?v=M0Sl-3eu974&lc=UgjfiTM81wZmAXgCoAEC) `youtube-M0Sl-3eu974-UgjfiTM81wZmAXgCoAEC`

> Considering the large number of users in China, it is recommended to enable the Chinese interface
>
> — [selectscience.net, 2022-06, Organisation: Fudan University Shanghai Cancer Center; application area: Analyse cell compenents in tissue samples (shown)](https://www.selectscience.net/product/halo-less-than-sup-greater-than-r-less-than-sup-greater-than-image-analysis-platform) `reviews-ss-57233-3`

- **Status: missing**. README and ROADMAP describe an English-only interface.
- **Gap:** No translation of UI, results or explainers.
- **Proposal (L):** Externalise UI strings and explainers; start with Chinese, Japanese, Korean, German and Spanish for the start screen, wizard and explainers, keeping statistical terms in both languages.

#### 178. Keyboard, screen-reader, contrast and dark-mode support

`accessibility` · score **2.9** · 3 observations from 1 venues (GraphPad support pages 3) · severity: blocks 1, cosmetic 2 · signal: no engagement counts on these pages

> Improved accessibility support for the main document window, including high-contrast color scheme compatibility, screen reader (Narrator) support for tables and notes, and keyboard navigation (F6/Shift+F6) to cycle through panes
>
> — [graphpad.com release notes, 2026-08](https://www.graphpad.com/updates/prism-11-1-0-release-notes) `gpsupport-rn-1110-8`

> Dark mode for macOS: Prism will now adopt your system settings for Dark Mode with re-designed dialogs, toolbars, and table elements in a stylish dark theme
>
> — [graphpad.com release notes, 2024-02](https://www.graphpad.com/updates/prism-10-2-0-release-notes) `gpsupport-rn-1020-2`

> As a result, there's no option in Prism to "disable" Dark Mode when the system is in dark mode.
>
> — [graphpad.com FAQ](https://www.graphpad.com/support/faq/disable-dark-mode/) `gpsupport-faq-2257`

- **Status: done**. README: every select has an accessible name (axe-core audit); ROADMAP › UI/UX pass: focus ring, contrast, theme toggle.

### Dose-response and curve fitting

20 needs, 327 observations.

#### 6. Fit a dose-response curve and get the IC50 without Excel Solver, macros or code

`ic50-no-code-fit` · score **82.6** · 58 observations from 10 venues (Stack Exchange 22, YouTube comments 16, Competitor trackers 5, GitHub issues 4, GraphPad support pages 4, Statistics-consulting FAQs 2) · severity: blocks 17, wrong result 20, slows 18, cosmetic 3 · signal: 46,086 page views; 147 votes/likes; 1,329,697 views of the videos commented on; 371 HN thread points

> The DPPH assays doesnt show linear results as far as I know. Therefore you can't use linear regression to calculate the IC50. Also, it makes no sense to have an IC50 for each concentration.
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=ZQy7Fg3wtfs&lc=UgwCL3CL-SUE1RhDjI14AaABAg) `youtube-ZQy7Fg3wtfs-UgwCL3CL-SUE1RhDjI14AaABAg`

> I am getting stuck at the step of fitting a sigmoidal curve to my data.
>
> — [stackoverflow.com, 2020-08](https://stackoverflow.com/questions/63568848) `stackexchange-stackoverflow-63568848`

> I'm working in screening facility at Montpellier CNRS France. I would like to do dose-response analysis. Have you got any module that does this analysis ?
>
> — [forum.jamovi.org, 2020-12, screening facility, CNRS (stated)](https://forum.jamovi.org/viewtopic.php?t=1529) `competitor-jamovi-1529`

- **Status: done**. README › Curve fitting: nonlinear regression with the dose-response library, absolute and relative IC50/EC50 with asymmetric CIs; a new XY table fits on its own for dose-response-like data.

#### 24. Sensible constraints and automatic starting values so the fit converges

`constraints-initial-values` · score **65.7** · 23 observations from 10 venues (Stack Exchange 7, YouTube comments 4, GraphPad support pages 3, GitHub issues 2, Non-English communities 2, Competitor trackers 1) · severity: blocks 5, wrong result 13, slows 5 · signal: 27,046 page views; 35 votes/likes; 738,922 views of the videos commented on

> My initial value selection is (intentionally) intended to mimic those in GraphPad Prism, and at least for the data set below, the initial values for my three parameters are identical.
>
> — [stats.stackexchange.com, 2011-10, new to R (stated)](https://stats.stackexchange.com/questions/17126) `stackexchange-stats-17126`

> When constructing the predicted curve uses values that you already have for the parameters that you want to predict, it doesn't really help to fit a curve to data when you don't have those values, in a normal situation.
>
> — [youtube.com, 2016-10](https://www.youtube.com/watch?v=fMghQw2Ry2c&lc=UgjwfU3Hf9qK-3gCoAEC) `youtube-fMghQw2Ry2c-UgjwfU3Hf9qK-3gCoAEC`

> 用Graphpad Prism 酸IC50时，所画曲线不收敛，在结果中要么很大达到200，要么Bottom 很小，要么top很大。怎样限制一下Bottom 和 top 。
>
> — [muchong.com, 2012-05, biology researcher (posted in 生物科学)](https://muchong.com/t-4572813-1) `nonen-zh-ic50-converge-1` *(Gloss: 'When calculating IC50 with GraphPad Prism the curve does not converge — the result is either huge (200), or Bottom is very small, or Top very large. How do I constrain Bottom and Top?' — Problem: ill-determined plateaus give absurd parameters and the user cannot find where to constrain them.)*

- **Status: done**. README › Curve fitting: 'Constraints and shared parameters', 'multi-start optimisation'; ROADMAP › Curve fitting: Prism's exact equations and initial values.

#### 33. Flag IC50s outside the tested range or from undefined plateaus, and report them as '> top dose'

`incomplete-curve-flags` · score **60.8** · 20 observations from 9 venues (YouTube comments 6, GitHub issues 3, Courses and workshops 2, Methods literature 2, Non-English communities 2, Stack Exchange 2) · severity: blocks 1, wrong result 19 · signal: 3,769 page views; 13 votes/likes; 539,794 views of the videos commented on

- **Prevalence** ([ucd.ie](https://www.ucd.ie/3dnet/t4media/KalVista_curvefitting.pdf), `consult-ucd-asymptote-72`): “This example of poor lower asymptote estimate underestimates the true IC50 value for the compound. ... Data should run from 100% to 0% control, with a slope of 1 when the interaction is simple competitive one-site.”

> I have three samples, therefore I have three inhibition percentages, my question is what concentration points do I have to take or if I have to take all the concentrations of my initial curve? ... the percentages of inhibition are similar.
>
> — [youtube.com, 2020-10](https://www.youtube.com/watch?v=sq-5rdlUrEI&lc=UgwdlzvZQJuwyBphOPp4AaABAg) `youtube-sq-5rdlUrEI-UgwdlzvZQJuwyBphOPp4AaABAg`

> Fitting a sigmoid dose-response relationship to those data is entirely pointless.
>
> — [stats.stackexchange.com, 2016-12, answerer](https://stats.stackexchange.com/a/250858) `stackexchange-stats-250855-a250858`

> 某化合作用于细胞，上调基因A的倍数随浓度增大而升高，但是没有达到平台期。我使用graphpad中自带的log(agonist) vs. response -- Variable slope公式模拟得到效应曲线，并得到EC50。请问这样得出的EC50可信吗，写paper中数据处理部分要怎么描述我采用何种方法得出的EC50。
>
> — [muchong.com, 2019-05, researcher (gene induction dose-response)](https://muchong.com/t-13400587-1) `nonen-zh-ec50-no-plateau-1` *(Gloss: 'Fold induction rises with concentration but never plateaus. I fitted log(agonist) vs. response – Variable slope in GraphPad and got an EC50. Is it trustworthy, and how do I describe the method in the paper?' — Problem: extrapolated EC50 without a plateau and no ready methods text.)*

- **Status: partial**. ROADMAP › Final round: an IC50 outside the doses tested is badged 'Extrapolated'; the ambiguity flag and banners explain undefined plateaus (ROADMAP › Theme 1).
- **Gap:** The extrapolated value is still reported as a number; tables, sentences and ratios do not carry it as '> highest dose'.
- **Proposal (S):** Offer 'Report as > highest dose' for extrapolated IC50s, carried into the results table, the results sentence and any ratio, with the reason.

#### 47. Compare EC50s or whole curves between conditions with one test and a ratio with its CI

`compare-curves-ec50` · score **55.2** · 26 observations from 7 venues (Stack Exchange 9, Competitor trackers 3, Courses and workshops 3, Forums (image.sc, Bioconductor, Galaxy) 3, GraphPad support pages 3, YouTube comments 3) · severity: blocks 11, wrong result 5, slows 10 · signal: 51,566 page views; 21 votes/likes; 416,054 views of the videos commented on

> However, I would like to find a single test for the overall dose-response relationship.
>
> — [stats.stackexchange.com, 2014-04](https://stats.stackexchange.com/questions/92569) `stackexchange-stats-92569`

> In other words, how can I test whether both sigmoideal curves are the same?
>
> — [forum.jamovi.org, 2024-01](https://forum.jamovi.org/viewtopic.php?t=3675) `competitor-jamovi-3675`

> I have 4 cell lines, 2 in group A and 2 in group B, for which I calculated IC50. I want to know if there is some difference between the 2 groups: a simple t-test seems to me a not correct test for this case.
>
> — [support.bioconductor.org, 2011-08](https://support.bioconductor.org/p/40648/) `bioc-40648-1`

- **Status: partial**. README › Curve fitting: 'Compare fits: two models by the extra-sum-of-squares F test and AICc, or one curve for all data sets against a separate curve for each'; ROADMAP still open: 'relative potency / slope comparison for global nonlinear fits'.
- **Gap:** No EC50 ratio (relative potency) with CI and no comparison of one chosen parameter between a chosen pair of curves.
- **Proposal (M):** Add 'Compare a parameter' to curve fits: pick two data sets and a parameter (logEC50, Hill slope, top), get the difference or ratio with CI and the F test for sharing it.

#### 48. When a fit fails or is ambiguous, tell me why in plain words and what to try

`fit-failure-explained` · score **54.4** · 19 observations from 7 venues (YouTube comments 6, Stack Exchange 5, GitHub issues 3, Non-English communities 2, Competitor trackers 1, Courses and workshops 1) · severity: blocks 8, wrong result 9, slows 1, cosmetic 1 · signal: 8,611 page views; 13 votes/likes; 694,085 views of the videos commented on

> I do not really understand what the error-message is telling me.
>
> — [stackoverflow.com, 2017-09](https://stackoverflow.com/questions/46115880) `stackexchange-stackoverflow-46115880`

> I don't knwo why, but it fits both replicates but returns an error when trying to fit the averaged values.
>
> — [github.com/DoseResponse/drc, 2025-11, MSc bioinformatics student, biomedical engineer (GitHub bio)](https://github.com/DoseResponse/drc/issues/44) `github-drc-44-1`

> I got R square value to be quite low (0.52), is there any way I can perform better fitting to get more reliable result?
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=7NgRqXSByFo&lc=Ugy46GJYuzaiwPV7VKp4AaABAg) `youtube-7NgRqXSByFo-Ugy46GJYuzaiwPV7VKp4AaABAg`

- **Status: done**. ROADMAP › Theme 1: banners for 'ambiguous / hit constraint / did not converge with concrete fixes'; explainers.ts 'What "ambiguous" means in a curve fit'.

#### 64. Judge a fit by residuals, the replicates test and CI width, not R² alone

`fit-diagnostics-beyond-r2` · score **47.9** · 19 observations from 9 venues (GitHub issues 4, GraphPad support pages 3, Stack Exchange 3, Statistics-consulting FAQs 2, Courses and workshops 2, YouTube comments 2) · severity: wrong result 13, slows 4, cosmetic 2 · signal: 7,385 page views; 12 votes/likes; 299,368 views of the videos commented on

> The answer is fairly straightforward in this case, but it is rather unhelpfully hidden in the SPSS output
>
> — [stats.stackexchange.com, 2014-03, answerer](https://stats.stackexchange.com/a/113059) `stackexchange-stats-89982-a113059`

> I noticed that all of my samples have bimodal peaks around 0 fluorescence and I traced this to the MEFLing step of FlowCal in my workflow.
>
> — [github.com/taborlab/FlowCal, 2023-03, synthetic biologist (stated in GitHub bio)](https://github.com/taborlab/FlowCal/issues/359) `github-flowcal-359-1`

> In the Model view, I have been searching for the model variance and/or standard deviation, but I cannot find it.
>
> — [apps.apple.com, 2017-10](https://apps.apple.com/us/app/id495152161) `reviews-as-016`

- **Status: done**. README › Curve fitting: diagnostics (replicates test, runs test, residual normality); explainers.ts 'R² is not a measure of curve quality'.

#### 72. LD50/LC50 from dead/alive counts (probit, logit) and any ECx with its CI

`quantal-ld50-ecx` · score **44.4** · 17 observations from 6 venues (Stack Exchange 8, YouTube comments 3, GraphPad support pages 2, Non-English communities 2, Statistics-consulting FAQs 1, GitHub issues 1) · severity: blocks 8, wrong result 3, slows 6 · signal: 12,167 page views; 17 votes/likes; 435,336 views of the videos commented on

> 请问一下大家都用什么软件计算LC50啊，如果想用这个方法计算的话 Trimmed spearman-karber method ， 该用什么软件啊Graphpad行否？
>
> — [muchong.com, 2010-10, toxicology/ecotoxicology researcher](https://muchong.com/t-2490556-1) `nonen-zh-lc50-sk-1` *(Gloss: 'What software do you use to compute LC50? If I want the Trimmed Spearman-Karber method, which software — can GraphPad do it?' — Problem: required regulatory method not obviously available (5,533 views).)*

> Given that my knowledge of nonlinear regression is low, I am now wondering which of the two methods would be better to analyse the data (drc or glm), so any help on making a decision would be greatly appreciated.
>
> — [stats.stackexchange.com, 2012-09](https://stats.stackexchange.com/questions/37676) `stackexchange-stats-37676`

> can someone please tell me how i calculate the LD50 using graphpad prism??? i have no idea how to use it
>
> — [youtube.com, 2016-10](https://www.youtube.com/watch?v=fMghQw2Ry2c&lc=UggEga6FUZIG0ngCoAEC) `youtube-fMghQw2Ry2c-UggEga6FUZIG0ngCoAEC`

- **Status: done**. README › Clinical statistics: quantal dose-response (probit, logit, cloglog; LD50 / ECx with Fieller CIs).

#### 76. Recommend the model from the data (direction, 3PL/4PL/5PL, fixed slope) and explain the choice

`model-choice-guidance` · score **41.8** · 15 observations from 6 venues (YouTube comments 6, Stack Exchange 3, Competitor trackers 2, Courses and workshops 2, GitHub issues 1, Methods literature 1) · severity: blocks 1, wrong result 9, slows 5 · signal: 44,560 page views; 24 votes/likes; 1,024,249 views of the videos commented on

> I am attempting to write a tool to be used by my lab to automatically generate a 5PL Standard Curve for ELISA data, using an XLSX file template.
>
> — [stats.stackexchange.com, 2019-12](https://stats.stackexchange.com/questions/439362) `stackexchange-stats-439362`

> I suppose a log transformation of concentration values improves the linearity?. Also, after log transformation, and the R-square value is still not great, I am not sure the IC50 would be accurate.
>
> — [youtube.com, 2022-10](https://www.youtube.com/watch?v=0fRoCKpDmh8&lc=UgydLuiEr8gjFCIshdl4AaABAg) `youtube-0fRoCKpDmh8-UgydLuiEr8gjFCIshdl4AaABAg`

> the Bonferroni correction in Jamovi gives me a number that doesn't correspond to what the calculation of the Bonferroni correction (with other software and by hand) gives.
>
> — [forum.jamovi.org, 2020-02](https://forum.jamovi.org/viewtopic.php?t=1191) `competitor-jamovi-1191`

- **Status: done**. recommend.ts curve rules recommend 4PL, 5PL or a fixed Hill slope with reasons; sheets README: autofit picks a dose-response only for dose-response-like data.

#### 79. Binding and Ki models: Cheng-Prusoff, Schild/pA2, tight binding; potency vs affinity

`binding-ki-models` · score **40.7** · 20 observations from 5 venues (Stack Exchange 13, GraphPad support pages 3, Non-English communities 2, GitHub issues 1, Journal requirements 1) · severity: blocks 4, wrong result 11, slows 5 · signal: 29,297 page views; 40 votes/likes

> 现在只是求算出各剂量的ＥＣ５０和对应的标准差，请问怎么去换算，求出ｐＡ２值
>
> — [muchong.com, 2012-09, pharmacology researcher (药效评价)](https://muchong.com/t-4909067-1) `nonen-zh-pa2-1` *(Gloss: 'So far I've only computed each dose's EC50 and SD — how do I convert these to obtain the pA2 value?' — Problem: no guided route from EC50 shifts to pA2 ± SD (4,185 views).)*

> Would it be reasonable to say that the "real" affinity is ~1nM than 100s of nM based on the biochemical assay?
>
> — [biology.stackexchange.com, 2012-08](https://biology.stackexchange.com/questions/3147) `stackexchange-biology-3147`

> for very tight-binding inhibitors four parameter logistic fits are inadequate. We should consider adding Morrison tight binding.
>
> — [github.com/bio-ml/pyzyme, 2023-01](https://github.com/bio-ml/pyzyme/issues/2) `github-pyzyme-2-1`

- **Status: done**. README › Curve fitting: 'binding and competitive binding with Fit Ki', 'Gaddum / Schild with pA2'.
- **Gap:** Morrison tight-binding and ligand-depletion models (ROADMAP still open: 'Kb next to pA2').
- **Proposal (S):** Add the Morrison equation and a quadratic (depletion) binding model to the library.

#### 96. Confidence and prediction bands and weighting options, clearly labelled

`bands-weighting` · score **36.4** · 18 observations from 5 venues (GitHub issues 7, Stack Exchange 6, GraphPad support pages 3, Courses and workshops 1, Methods literature 1) · severity: wrong result 11, slows 7 · signal: 45,334 page views; 74 votes/likes

> I believe the EC50 is equivalent to the xmid parameter ... note the large differences between weighted and unweighted estimates ...
>
> — [stackoverflow.com, 2020-08, answerer (accepted answer)](https://stackoverflow.com/a/63569987) `stackexchange-stackoverflow-63568848-a63569987`

> Shouldn't 95% of the observations be inside the shaded area? Also, why use +/- 3 sigma for a 95% confidence interval?
>
> — [github.com/lmfit/lmfit-py, 2020-03, statistician and developer (stated in GitHub bio)](https://github.com/lmfit/lmfit-py/issues/624) `github-lmfit-624-1`

> Use 1 / SD2 weights for non‐constant variance – Requires many replicates per X • Use other weight schemes to apply unequal weights to one part of the curve
>
> — [github.com, 2010-03, NIAID researchers (BCBB/BSIP seminar audience)](https://github.com/niaid/Prism/blob/master/Lab-7/Curve%20Fitting%20slides.pdf) `courses-niaid-cfs-weighting`

- **Status: done**. README › Curve fitting: 'weighting, asymptotic or profile CIs … confidence and prediction bands'.

#### 98. Export the full fit report: equation, constraints, initial values, weighting and every parameter with SE and CI

`fit-report-complete` · score **36.1** · 10 observations from 8 venues (GitHub issues 3, Forums (image.sc, Bioconductor, Galaxy) 1, GraphPad support pages 1, Journal requirements 1, Non-English communities 1, Software reviews 1) · severity: blocks 2, wrong result 3, slows 5 · signal: 705 page views; 2 votes/likes; 315,979 views of the videos commented on

> How can we define the error or standard deviation from the fitting constant A, k, n ?? e.g. A+/- something, k +/- something and so on.
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=Ewp5CF5ba_w&lc=Ugy36PPcJ8Uvu7MJCw14AaABAg) `youtube-Ewp5CF5ba_w-Ugy36PPcJ8Uvu7MJCw14AaABAg`

> After reading the web site and following the tutorial on Reference-based RNA-Seq data analysis my results did not match with the results of the paper.
>
> — [help.galaxyproject.org, 2022-09, new to the field (stated)](https://help.galaxyproject.org/raw/8767) `galaxy-8767-1`

> Is the documentation incorrect that `e` represents the inflection point?
>
> — [github.com/DoseResponse/drc, 2021-07, biologist/anthropologist (GitHub bio)](https://github.com/DoseResponse/drc/issues/22) `github-drc-22-1`

- **Status: partial**. Results list parameters with SE and CI and a methods paragraph (README › Curve fitting, Reporting); ROADMAP still open: 'the initial values a fit started from'.
- **Gap:** Initial values and the CI method are not part of the exported report.
- **Proposal (S):** Add a 'Fit report' export (CSV and text) with equation, constraints, weighting, initial values, CI method and every parameter with SE and CI.

#### 102. Enzyme kinetics: Michaelis-Menten fits and initial rates from kinetic reads

`enzyme-kinetics-rates` · score **34.6** · 17 observations from 6 venues (Stack Exchange 11, Non-English communities 2, Competitor trackers 1, Journal requirements 1, Software reviews 1, YouTube comments 1) · severity: blocks 2, wrong result 4, slows 10, cosmetic 1 · signal: 34,585 page views; 21 votes/likes; 208,045 views of the videos commented on

> How do I process the data to find Km and Kcat?
>
> — [biology.stackexchange.com, 2018-07](https://biology.stackexchange.com/questions/76225) `stackexchange-biology-76225`

> 我做一个药物的酶动力学时，发现呈底物抑制，但是用GRaphPad拟合算参数时，发现Vmax和Km大得离谱，完全与实际不符，不知道怎么回事
>
> — [muchong.com, 2012-10, drug metabolism researcher](https://muchong.com/t-5020779-1) `nonen-zh-substrate-inhibition-1` *(Gloss: 'My drug's enzyme kinetics show substrate inhibition, but when fitting in GraphPad Vmax and Km are absurdly large, nothing like reality.' — Problem: wrong model (plain Michaelis-Menten) or unconstrained fit gives meaningless parameters.)*

> How can I make Lineweaver Burk plot in GraphPad? ... I can't project the trend line
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=QF6fWNzAYr0&lc=UgwsgfpMtviUP3KTHkp4AaABAg) `youtube-QF6fWNzAYr0-UgwsgfpMtviUP3KTHkp4AaABAg`

- **Status: partial**. README › Curve fitting: 'enzyme kinetics and inhibition'; there is no step that turns kinetic plate reads into initial rates.
- **Gap:** Initial-rate extraction from progress curves (per well) before the Michaelis-Menten or IC50 fit.
- **Proposal (M):** Add 'Initial rates' to XY/plate tables: a linear fit over a chosen early window per well (with R² flag), producing a rates table that feeds Michaelis-Menten or dose-response.

#### 108. Explain relative vs absolute IC50 and report the one I mean

`relative-absolute-ic50` · score **33.0** · 11 observations from 4 venues (YouTube comments 4, GraphPad support pages 3, Stack Exchange 3, GitHub issues 1) · severity: wrong result 11 · signal: 3,380 page views; 2 votes/likes; 622,894 views of the videos commented on

> When I fit the same data in a proprietary program I get a similar plot but with an (correct) EC50 of 45.5
>
> — [stackoverflow.com, 2019-08](https://stackoverflow.com/questions/57568882) `stackexchange-stackoverflow-57568882`

> May I use delta-delta Ct for analyzing absolute qPCR data?
>
> — [youtube.com, 2019-10](https://www.youtube.com/watch?v=Kkle8T7aXjk&lc=Ugx8fIHA0KuBuCHtKwF4AaABAg) `youtube-Kkle8T7aXjk-Ugx8fIHA0KuBuCHtKwF4AaABAg`

> This issue relates to the ED50 calculation being off from where the curve intersects at y=50.
>
> — [github.com/angelovangel/tidydrc, 2021-04, computational biologist, cancer research (GitHub bio)](https://github.com/angelovangel/tidydrc/issues/1) `github-tidydrc-1-1`

- **Status: done**. explainers.ts 'Relative vs absolute IC50; normalise or constrain?'; README › Curve fitting 'absolute and relative IC50 / EC50 with asymmetric CIs'.

#### 111. Fit my own equation with sensible starting values

`custom-equations` · score **31.2** · 7 observations from 5 venues (GraphPad support pages 2, Software reviews 2, Courses and workshops 1, GitHub issues 1, YouTube comments 1) · severity: blocks 3, wrong result 3, slows 1 · signal: 1 votes/likes; 495,956 views of the videos commented on

> how can i use this equation: Y=Baseline+Amplitude*cos(Frecuency*X+Phaseshift).?
>
> — [youtube.com, 2016-10](https://www.youtube.com/watch?v=M0Sl-3eu974&lc=UgjYKobWAf6dAHgCoAEC) `youtube-M0Sl-3eu974-UgjYKobWAf6dAHgCoAEC`

> if we choose fit_wizard+Custom function (we build a linear function) instead the errors of the parameters are systematically smaller. ... We would like to use the software with our students but in these conditions the inconsistency is too evident.
>
> — [github.com/narunlifescience/AlphaPlot, 2025-09, physics lab-course instructor (stated in issue)](https://github.com/narunlifescience/AlphaPlot/issues/48) `github-alphaplot-48-1`

> There is no option to write your own equations and fit a curve to that in Prism, although it's great for general graph plotting.
>
> — [alternativeto.net, 2015-07](https://alternativeto.net/software/sigmaplot/) `reviews-at-004`

- **Status: done**. README › Curve fitting: 'user-defined equations (multi-line editor, initial values, constraints, exchanged as JSON)'.

#### 114. Fit many compounds or plates at once, with one IC50 table and failures isolated

`batch-curve-fitting` · score **30.5** · 11 observations from 7 venues (Stack Exchange 4, Software reviews 2, Forums (image.sc, Bioconductor, Galaxy) 1, GitHub issues 1, Hacker News 1, Non-English communities 1) · severity: blocks 3, wrong result 2, slows 4, cosmetic 2 · signal: 6,241 page views; 6 votes/likes; 104,360 views of the videos commented on; 2 HN thread points

> Prism obviously has the easiest way of doing dose-response curves well, but I can't copy and paste this much data.
>
> — [stackoverflow.com, 2021-03](https://stackoverflow.com/questions/66806526) `stackexchange-stackoverflow-66806526`

> Fitting 3663 individual dose response curves to 3663 proteins. ... I want to obtain the curve fitting for all proteins and not only those that met the above criteria , how can I do it?
>
> — [support.bioconductor.org, 2016-09](https://support.bioconductor.org/p/87529/) `bioc-87529-1`

> actually mam I have 64 samples and all samples R square values less than 0.90
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=sq-5rdlUrEI&lc=UgzR079GQFFyQp8pZbF4AaABAg.9PLDLIzkOuS9PLGCOAWmoC) `youtube-sq-5rdlUrEI-UgzR079GQFFyQp8pZbF4AaABAg.9PLDLIzkOuS9PLGCOAWmoC`

- **Status: partial**. Every data set of an XY table is fitted in one results sheet and the plate wizard imports several plates at once (README › Assay modules); there is no per-compound summary with failure reasons.
- **Gap:** No compound-per-row table of IC50, CI, Hill slope and fit flags across many data sets, exportable as CSV.
- **Proposal (M):** Add a 'Fit summary' table for any XY results sheet: one row per data set with IC50, CI, Hill slope, R², flags (ambiguous, extrapolated, not converged) and a reason, sortable and exportable.

#### 117. Biphasic, bell-shaped and hormesis models when the curve is not monotonic

`biphasic-models` · score **28.7** · 8 observations from 4 venues (Stack Exchange 3, GitHub issues 2, YouTube comments 2, Forums (image.sc, Bioconductor, Galaxy) 1) · severity: blocks 5, wrong result 1, slows 2 · signal: 2,390 page views; 5 votes/likes; 316,592 views of the videos commented on

> As my coding skills are limited, I am unsure whether the offline version supports biphasic curve generation.
>
> — [support.bioconductor.org, 2025-02, limited coding skills (stated)](https://support.bioconductor.org/p/9161284/) `bioc-9161284-1`

> I could not locate the correct library function that helps perform the biphasic dose-response curve fit using the following formula.
>
> — [stackoverflow.com, 2022-06](https://stackoverflow.com/questions/72472432) `stackexchange-stackoverflow-72472432`

> I use a molecule that stimulates the cell growth at a low dose but it inhibits the growth at high concentrations. I want to determine the IC 50, the concentration that inhibits the growth of 50% but the graph is biphasic. How can I determine the IC 50?
>
> — [youtube.com, 2019-10](https://www.youtube.com/watch?v=CD9CZjzDTEE&lc=UgwsP3MpsXUs7R3zv8F4AaABAg) `youtube-CD9CZjzDTEE-UgwsP3MpsXUs7R3zv8F4AaABAg`

- **Status: done**. README › Curve fitting: dose-response 'including 5PL, biphasic and bell-shaped curves'.

#### 134. Use the zero-dose (vehicle) control in a log-dose fit without inventing a concentration

`zero-dose-control` · score **24.8** · 10 observations from 4 venues (YouTube comments 4, Stack Exchange 3, GraphPad support pages 2, Forums (image.sc, Bioconductor, Galaxy) 1) · severity: blocks 1, wrong result 5, slows 1, cosmetic 3 · signal: 66,838 page views; 29 votes/likes; 833,775 views of the videos commented on

> I am trying to fit dose response curves which all have starts of 0, and it goes very odd, but you've got me further in a few minutes than I expected and opened my eyes to what's possible in excel (I don't get coding, despite trying to learn).
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=Ewp5CF5ba_w&lc=UgyGURAxqNm316yxi154AaABAg) `youtube-Ewp5CF5ba_w-UgyGURAxqNm316yxi154AaABAg`

> There is no way of directly adding the drm model curve. I need to rewrite the 4-PL as a function and add it in the form of a stat_function, which is cumbersome to say the least.
>
> — [stackoverflow.com, 2016-04](https://stackoverflow.com/questions/36780357) `stackexchange-stackoverflow-36780357`

> There a strong difference using un-transformed or log transformed values for dose, and since the control dose is 0.0mM which value to add for the log transformation.
>
> — [support.bioconductor.org, 2005-01, pharma scientist (Aventis address)](https://support.bioconductor.org/p/7179/) `bioc-7179-2`

- **Status: partial**. Transform concentrations replaces zero with a chosen value (README › Data tables, Chains) and quantal fits treat dose 0 as the control (sheets README); continuous fits cannot use the vehicle wells as the plateau, and only the left Y axis can be discontinuous (ROADMAP › Format Axes).
- **Gap:** No 'vehicle wells define Top/Bottom' option for continuous fits; no X-axis break to draw the control.
- **Proposal (M):** Add 'Zero-dose rows define the top (or bottom) plateau' to dose-response fits and draw them left of an X-axis break labelled 'vehicle'.

#### 140. Summarise IC50 across independent experiments (mean log IC50 with CI, n = experiments)

`potency-across-experiments` · score **22.3** · 9 observations from 4 venues (Stack Exchange 4, Non-English communities 3, Statistics-consulting FAQs 1, Methods literature 1) · severity: wrong result 6, slows 3 · signal: 4,236 page views; 10 votes/likes

> I wish I had time to answer this right now, but generally in natural products chemistry they're awfully unreliable- there just isn't enough material to do the job properly with multiple runs for verification.
>
> — [chemistry.stackexchange.com, 2017-07, commenter](https://chemistry.stackexchange.com/questions/80415) `stackexchange-chemistry-80415-c`

> Ich habe also in GraphPad 3 Spalten mit den Daten der Experimenten und x stellt die 8 Behandlungskonzentrationen dar (siehe Bild 1).
>
> — [statistik-forum.de, 2019-09, toxicology researcher (cell viability)](http://www.statistik-forum.de/weitere-software-f22/graphpad-prism-curve-fit-unpassend-durch-wenig-daten-t11131.html) `nonen-de-curvefit-few-data-1` *(Gloss: 'So in GraphPad I have 3 columns with the experiments' data and x is the 8 treatment concentrations.' — Problem (thread title: 'curve fit unsuitable due to too little data'): fit looks wrong with few points; unclear whether to fit pooled replicates or per experiment.)*

> If the experiment is inherently variable generate more determinations n=3 or 4. Four pieces of independent information are better than curves with quadruplicate points.
>
> — [ucd.ie, training aide-memoir on dose-response curve fitting, audience: pharmacology trainees (UCD 3DNet)](https://www.ucd.ie/3dnet/t4media/KalVista_curvefitting.pdf) `consult-ucd-independent-71`

- **Status: partial**. recommend.ts rule: 'Fit each experiment, then a paired t test (or RM ANOVA) on the LogIC50 values'; no analysis tabulates potency across experiments.
- **Gap:** No one-click summary of logIC50 across experiments (mean, SD, CI, geometric-mean IC50).
- **Proposal (S):** Add 'Summarise fits across experiments': mean logIC50 (pIC50) with SD and 95% CI, geometric-mean IC50 with asymmetric CI, n = experiments, feeding a t test or ANOVA between compounds.

#### 163. Tell me before the experiment how many doses, what range and spacing a good IC50 needs

`dose-design-advice` · score **14.6** · 4 observations from 2 venues (YouTube comments 3, Stack Exchange 1) · severity: blocks 2, wrong result 1, slows 1 · signal: 2,255 page views; 2 votes/likes; 361,705 views of the videos commented on

> I'd expect the slopes to have the same sign for both data sets but I guess given the low quality of my data a sigmoidal curve is not the way to go.
>
> — [stats.stackexchange.com, 2016-12](https://stats.stackexchange.com/questions/250855) `stackexchange-stats-250855`

> If I don't have a dose-response curve, can I still calculate?
>
> — [youtube.com, 2024-10](https://www.youtube.com/watch?v=7NgRqXSByFo&lc=UgxfRkPkQ0NNG4JNepZ4AaABAg) `youtube-7NgRqXSByFo-UgxfRkPkQ0NNG4JNepZ4AaABAg`

> I tried to find thee IC50 for a drug at 3 different doses using your method, however, it tells me "too few points" and no results appear to me.
>
> — [youtube.com, 2024-10](https://www.youtube.com/watch?v=AEJvkrl7NsU&lc=Ugzke5JJYCXwPBG7aBJ4AaABAg) `youtube-AEJvkrl7NsU-Ugzke5JJYCXwPBG7aBJ4AaABAg`

- **Status: missing**. No dose-design guidance exists among the explainers (explainers.ts) or the power tool (README › Power and sample size).
- **Gap:** Users learn only after the fit that the range did not define the plateaus.
- **Proposal (S):** Add an explainer and a planning card: 8–10 concentrations on a log scale, spanning both plateaus, with a simulation of how CI width changes with range (from the simulate engine).

#### 172. Mark the IC50 on the graph and show the fitted equation and values

`ic50-graph-markers` · score **8.0** · 5 observations from 4 venues (Stack Exchange 2, GitHub issues 1, GraphPad support pages 1, YouTube comments 1) · severity: slows 2, cosmetic 3 · signal: 2,290 page views; 1 votes/likes; 199,065 views of the videos commented on

> I need the IC50 to show up in the plot, or in a table elsewhere so I can put it into the plot myself.
>
> — [stackoverflow.com, 2021-04](https://stackoverflow.com/questions/66917990) `stackexchange-stackoverflow-66917990`

> Is it possible to display the IC50 as a dotted line on the graph itself?
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=7NgRqXSByFo&lc=Ugy8_ThJmqi9Ib4LFNl4AaABAg) `youtube-7NgRqXSByFo-Ugy8_ThJmqi9Ib4LFNl4AaABAg`

> Make IC50s a dot plot rather than a boxplot ... Use Prism colorblind safe theme - [x] Add log ticks on x-axis - [x] Add dotted line for 50% neut
>
> — [github.com/PhilPalmer/AutoPlate, 2020-12, PhD student & bioinformatician (stated in GitHub bio)](https://github.com/PhilPalmer/AutoPlate/issues/16) `github-autoplate-16-1`

- **Status: partial**. README › Graphs: 'live results blocks' embed best-fit values on the graph; there is no one-click IC50 drop line.
- **Gap:** IC50 guide lines must be drawn by hand.
- **Proposal (S):** Add 'Show IC50/EC50 lines' to XY fit graphs: dashed drop lines from the 50% response to the X axis, labelled with the value.

### Data entry and import

11 needs, 232 observations.

#### 7. Paste from Excel exactly: blanks stay missing, decimals and IDs are never mangled

`excel-paste-fidelity` · score **81.8** · 45 observations from 9 venues (GraphPad support pages 14, Hacker News 7, GitHub issues 6, Lab blogs 5, Competitor trackers 5, Statistics-consulting FAQs 3) · severity: blocks 10, wrong result 24, slows 11 · signal: 259,444 page views; 1 votes/likes; 172,484 views of the videos commented on; 2,571 HN thread points

- **Prevalence** ([nature.com](https://www.nature.com/articles/d41586-021-02211-4), `blog-nature-excelgenes-1`): “Despite geneticists being warned about spreadsheet problems, 30% of published papers contain mangled gene names in supplementary data.”

> If I want to export my deskriptive table into Excel to work with it, some values are interpreted as high values, because Excel interpretes the point as a thousend separator (for example: 3.908 is interpreted as 3908).
>
> — [forum.jamovi.org, 2025-06](https://forum.jamovi.org/viewtopic.php?t=3987) `competitor-jamovi-3987`

> is the blank subtracted?
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=5IqqpKSnXfI&lc=Ugw-5PWBTXfRHJ3LPUF4AaABAg) `youtube-5IqqpKSnXfI-Ugw-5PWBTXfRHJ3LPUF4AaABAg`

> I send them some data in CSV, that when opened in Excel turned 123.456 into 123456 (it was a problem with locales, some people using "," as decimal and some using "."). ... A small quantity of numbers bumped up by a factor of 3 could fly under the radar, and distort further measurements.
>
> — [news.ycombinator.com, 2020-08, computer-savvy member of a lab collaboration (stated)](https://news.ycombinator.com/item?id=24072547) `hn-24072547`

- **Status: partial**. README › Data tables: Import dialog with delimiter, decimal comma, encoding, missing code and titles-row detection, offered for large pastes.
- **Gap:** No paste report of cells read as missing or text, and no stated guarantee that identifiers are never converted.
- **Proposal (S):** After every paste or import, show a one-line report ('412 numbers, 3 blanks kept as missing, 2 text cells in numeric columns: B7, C12') and keep text columns as text.

#### 21. Stay fast with tens of thousands of rows and points

`large-data` · score **66.1** · 43 observations from 11 venues (GraphPad support pages 19, Software reviews 9, Hacker News 3, Forums (image.sc, Bioconductor, Galaxy) 2, GitHub issues 2, Mastodon / fediverse 2) · severity: blocks 13, wrong result 3, slows 23, cosmetic 4 · signal: 3,509 page views; 10 votes/likes; 323,899 views of the videos commented on; 640 HN thread points

> However, I'm not sure about doing t test on fold change?
>
> — [stats.stackexchange.com, 2018-12](https://stats.stackexchange.com/questions/379871) `stackexchange-stats-379871`

> At some point Excel and Origin weren't dealing well with ever increasing data sizes in my field (biology).
>
> — [news.ycombinator.com, 2017-06, biologist (stated)](https://news.ycombinator.com/item?id=14652080) `hn-14652080`

> However standard ImageJ (bioformats) file handling doesn’t cope well with such large files.
>
> — [fediscience.org, 2026-01, Runs a spatial proteomics facility, University of Oxford (bio)](https://fediscience.org/@johannes_lehmann/115868153028716998) `mastodon-fediscience.org-115868153028716998`

- **Status: partial**. README: analyses run in a Web Worker with progress and cancel; ROADMAP open items: 'Data-table limits documented (rows, data sets, subcolumns)' is not done.
- **Gap:** No documented limits; grid and graph performance with 10⁵ rows not stated.
- **Proposal (M):** Document and test limits (rows, points per graph), virtualise the grid, and switch dense scatters to WebGL above a threshold.

#### 37. Help me pick the table layout from my experiment, and let me change it later without losing data

`table-layout-chooser` · score **58.5** · 24 observations from 11 venues (GraphPad support pages 5, Software reviews 4, Competitor trackers 3, Courses and workshops 3, GitHub issues 2, YouTube comments 2) · severity: blocks 7, wrong result 2, slows 14, cosmetic 1 · signal: 270 page views; 1 votes/likes; 664,501 views of the videos commented on; 621 HN thread points

> I was thinking a chi-squared test or a t-test somehow but I'm not sure which to do or how to format them.
>
> — [biology.stackexchange.com, 2021-01, student doing a lab (stated)](https://biology.stackexchange.com/questions/97995) `stackexchange-biology-97995`

> i have 3 groups, and in these measurements i have width and depth, so how i do the data entry ?!!
>
> — [youtube.com, 2017-10](https://www.youtube.com/watch?v=PraEKrhJlt8&lc=Uggx3YPUAw8jFHgCoAEC) `youtube-PraEKrhJlt8-Uggx3YPUAw8jFHgCoAEC`

> I am envisioning something with double-entry data checking, enforcement of data types, and rules to check validity.
>
> — [news.ycombinator.com, 2020-08](https://news.ycombinator.com/item?id=24073876) `hn-24073876`

- **Status: partial**. README › Guidance: start screen with picture cards for the eight table types and 'paste data and get a table type'; ROADMAP Theme 1 follow-up: a one-click stacked/side-by-side converter is still open.
- **Gap:** Changing table type after entry, and question-first entry ('I measured the same mice at 4 times') are missing.
- **Proposal (S):** Add 'Convert table to…' (column ↔ grouped ↔ multiple variables, stacked ↔ side by side) and a question-first entry on the start screen that picks the table from the design answers.

#### 54. Accept long (tidy) or wide data and convert between them

`long-wide-tidy` · score **52.3** · 29 observations from 9 venues (Stack Exchange 8, GraphPad support pages 7, Lab blogs 3, Competitor trackers 3, GitHub issues 3, Statistics-consulting FAQs 2) · severity: blocks 2, wrong result 5, slows 22 · signal: 258,062 page views; 12 votes/likes

> Without this option, I can find no straightforward way of plotting repeated-measures data (unless I'm missing something).
>
> — [forum.jamovi.org, 2026-02, teaching staff (stated)](https://forum.jamovi.org/viewtopic.php?t=4133) `competitor-jamovi-4133`

> The tidy data structure is different from the popular spreadsheet format and (in my experience) not intuitive to grasp. Therefore, the conversion of ordinary, spreadsheet data into this structure may present a considerable bottleneck for creating superplots.
>
> — [thenode.biologists.com, 2020-09, researcher, cell biology / dataviz (Joachim Goedhart)](https://thenode.biologists.com/converting-excellent-spreadsheets-part2/research/) `blog-thenode-tidy2-1`

> In my experience, it's much safer to enter paired data into two columns, so each row is the same person (or experimental unit). Otherwise, if you miss entering a single cell, the matching between pairs is destroyed.
>
> — [github.com/kassambara/rstatix, 2021-12, research computing support manager, university (GitHub bio)](https://github.com/kassambara/rstatix/issues/136) `github-rstatix-136-2`

- **Status: done**. README › Data tables: 'Reshape between long and wide', 'From long table…', import recipes pivot to any table type.

#### 69. Open my Prism files without a licence, and send work back to Prism users

`prism-files` · score **46.1** · 14 observations from 7 venues (Competitor trackers 3, GitHub issues 3, Software reviews 2, Mastodon / fediverse 2, Stack Exchange 2, Hacker News 1) · severity: blocks 10, slows 4 · signal: 12,901 page views; 7 votes/likes; 127 HN thread points

> I would like to know if there is any (except scripting by hand in R) way of importing Graphpad files into Jamovi This would help a lot of my students to switch...
>
> — [forum.jamovi.org, 2020-04, teacher (stated: 'my students')](https://forum.jamovi.org/viewtopic.php?t=1232) `competitor-jamovi-1232`

> I'm trying to help people (with 0 coding experience or desire to gain coding experience) transition out of GraphPad PRISM as our uni has removed our license. Does anyone have any thoughts on the best way to get data out of Prism without a licence?
>
> — [genomic.social, 2025-05, Senior Lecturer in Bioinformatics, University of Sheffield (bio); helping non-coding colleagues](https://genomic.social/@IanSudbery/114506754117309085) `mastodon-genomic.social-114506754117309085`

> I am trying to import raw data from Graphpad Prism .pzfx files, which in principle are .xml files.
>
> — [stackoverflow.com, 2014-08](https://stackoverflow.com/questions/25506099) `stackexchange-stackoverflow-25506099`

- **Status: done** (met, but hard to find). README › Data tables: '.prism and .pzfx files (one or all tables)'; README › Sharing: '.pzfx export of XY, column, grouped, contingency and survival tables'.
- **Gap:** Graphs and analyses inside .prism files are not imported (ROADMAP › Final round: 'Analysis output … is skipped').
- **Proposal (S):** Say on the start screen that .prism/.pzfx files open here, and add batch import of a folder of Prism files to CSV.

#### 75. Import instrument exports directly (plate readers, qPCR, LabChart, Incucyte)

`instrument-import` · score **42.2** · 19 observations from 9 venues (Software reviews 7, Forums (image.sc, Bioconductor, Galaxy) 2, Hacker News 2, Mastodon / fediverse 2, YouTube comments 2, Lab blogs 1) · severity: blocks 6, slows 10, cosmetic 3 · signal: 6,663 page views; 3 votes/likes; 319,932 views of the videos commented on; 36 HN thread points

> The instrument used for it is from Applied Biosystems ViiA7 Software v1.2 which gives out .eds file. How can I use to ddCt to analyse my files?
>
> — [support.bioconductor.org, 2015-03](https://support.bioconductor.org/p/65804/) `bioc-65804-1`

> Anyone know of a good way to examine EDS files from a Thermofisher RT-PCR machine that doesn't require installing the software suite? ... But I fundamentally oppose data locked into a proprietary format for long-term archiving.
>
> — [genomic.social, 2026-01, Human genetics / bioinformatics researcher (bio)](https://genomic.social/@thatdnaguy/115865598274212482) `mastodon-genomic.social-115865598274212482`

> please make a tutrial on how to plot data in the form xyxyxyxy I cant believe how hard it is to find any information on how to plot this when 99% of spectrophotometers have data output like this
>
> — [youtube.com, 2022-10](https://www.youtube.com/watch?v=QF6fWNzAYr0&lc=Ugzc1lz_nZrAFdqdzoR4AaABAg) `youtube-QF6fWNzAYr0-Ugzc1lz_nZrAFdqdzoR4AaABAg`

- **Status: partial**. README › Data tables: import recipes for plate-reader grids, qPCR Cq exports, FlowJo, CellProfiler, QuPath and long CSVs.
- **Gap:** No readers for LabChart, Incucyte, Thermo .eds or multi-read plate runs.
- **Proposal (M):** Add recipes for the most requested exports (Incucyte time series, LabChart, multi-wavelength plate runs) and a generic 'save this mapping as a recipe'.

#### 87. Enter mean, SD (or SEM) and n and still get tests and error bars

`summary-data-input` · score **37.9** · 17 observations from 7 venues (Competitor trackers 5, GitHub issues 4, GraphPad support pages 3, Stack Exchange 2, Forums (image.sc, Bioconductor, Galaxy) 1, Journal requirements 1) · severity: blocks 3, wrong result 5, slows 9 · signal: 13,826 page views; 10 votes/likes

> I have only the mean and its st. error, not the raw data. In a research paper they did a paired t test.
>
> — [stats.stackexchange.com, 2013-08](https://stats.stackexchange.com/questions/67724) `stackexchange-stats-67724`

> I need to plot a growth curve (which I already did) with standard deviation bars (which I didn't do yet). I already have the standard deviation values calculated.
>
> — [support.bioconductor.org, 2009-08](https://support.bioconductor.org/p/29269/) `bioc-29269-1`

> With unequal n Prism uses "analysis of unweighted means" (Fisher and van Belle, Biostatistics, 1993), which it says is only approximately correct; we refuse and ask for the values.
>
> — [github.com/BooneAndrewsLab/BarelySig, 2026-09, developer, planned feature (tracker issue)](https://github.com/BooneAndrewsLab/BarelySig/issues/51) `competitor-barelysig-51`

- **Status: done**. README › Data tables: summary data (mean with SD / SEM / %CV / 95% CI, with or without N); analyses run from summary data where possible.

#### 92. Handle unequal n and missing values, and tell me what was dropped

`missing-values-handling` · score **37.0** · 10 observations from 6 venues (GitHub issues 3, GraphPad support pages 3, Journal requirements 1, Non-English communities 1, Stack Exchange 1, YouTube comments 1) · severity: blocks 3, wrong result 6, slows 1 · signal: 79 page views; 2 votes/likes; 217,560 views of the videos commented on

> I was wondering if there is an easy way to run paired test (e.g. wilcoxon) on a tidy data where some observations do not have paired observations (i.e. only perform test on the paired observations).
>
> — [github.com/kassambara/ggpubr, 2020-12](https://github.com/kassambara/ggpubr/issues/360) `github-ggpubr-360-1`

> Removing observations because they are censored is not a good idea.
>
> — [stats.stackexchange.com, 2026-06, answerer](https://stats.stackexchange.com/a/676172) `stackexchange-stats-676154-a676172`

> Will ich drei oder mehr Gruppen vergleichen, habe aber nicht in jeder Gruppe gleich viele Individuen, bekomme ich eine Fehlermeldung, dass Werte fehlen.
>
> — [statistik-forum.de, 2015-04](http://www.statistik-forum.de/test-f8/test-incl-und-mit-prism-t5726.html) `nonen-de-unequal-n-error-1` *(Gloss: 'If I compare three or more groups with unequal numbers of individuals, I get an error that values are missing.' — Problem: unequal group sizes are treated as missing data.)*

- **Status: partial**. Tables accept unequal n and blanks; excluded values are struck through and skipped (README › Data tables); results do not list which values or pairs were dropped.
- **Gap:** No 'n analysed / rows dropped' line in results, e.g. incomplete pairs in a paired test.
- **Proposal (S):** Add an 'Analysed' line to every result: n used per group and which rows or pairs were left out and why.

#### 124. Carry units (µM, nM, days) from entry to axes, results and methods

`units-in-data` · score **27.8** · 14 observations from 4 venues (YouTube comments 6, Stack Exchange 4, Forums (image.sc, Bioconductor, Galaxy) 2, Journal requirements 2) · severity: blocks 1, wrong result 7, slows 3, cosmetic 3 · signal: 14,414 page views; 18 votes/likes; 756,909 views of the videos commented on

> We need to validate some kits by comparing results between our lab and another lab. They reported their values using the AEU/ml unit whilst ours are in RU/ml.
>
> — [biology.stackexchange.com, 2020-09, works in an ELISA department of a laboratory (stated)](https://biology.stackexchange.com/questions/95762) `stackexchange-biology-95762`

> what are the units of the final numbers you got?
>
> — [youtube.com, 2015-10](https://www.youtube.com/watch?v=JlR5v-DsTds&lc=UggSVWC-VaIA3HgCoAEC) `youtube-JlR5v-DsTds-UggSVWC-VaIA3HgCoAEC`

> In selecting a ROI to measure area, IntDen and RawInDen, am I to say IntDen=colour intensity per that selected area=density of fibres in that selected area?
>
> — [forum.image.sc, 2020-11, research student (stated)](https://forum.image.sc/raw/45049) `imagesc-45049-1`

- **Status: missing**. README lists no unit field on columns; units appear only in user-typed titles.
- **Gap:** IC50s and Km values are reported without units unless typed by hand.
- **Proposal (M):** Add an optional unit to X and Y columns, propagated to axis titles, fitted parameters (IC50 in nM), results sentences and methods.

#### 129. Formula columns in the data table (ratios, derived variables)

`calculated-columns` · score **26.0** · 11 observations from 5 venues (GraphPad support pages 6, GitHub issues 2, Statistics-consulting FAQs 1, Forums (image.sc, Bioconductor, Galaxy) 1, YouTube comments 1) · severity: wrong result 5, slows 6 · signal: 141,089 views of the videos commented on

> I think you made a mistake calculating the background. You need to type in =average (b9:m9) but yours is =average (b9,m9) so you actually only selected two cells which made the background average very low.
>
> — [youtube.com, 2022-10](https://www.youtube.com/watch?v=l9tO81ZCeRg&lc=UgylEdZYNrWwdIHeUyt4AaABAg) `youtube-l9tO81ZCeRg-UgylEdZYNrWwdIHeUyt4AaABAg`

> the outcome of dabestr doesn't match the outcome of the standard formula of Cohen's d (paired samples).
>
> — [github.com/ACCLAB/dabestr, 2021-10](https://github.com/ACCLAB/dabestr/issues/122) `github-dabestr-122-1`

> But the exported data is not normalized in cells per mm2 area, right? How to normalize it in fact I want to plot the bar graph in cells per mm2?
>
> — [forum.image.sc, 2021-11](https://forum.image.sc/raw/60323) `imagesc-60323-1`

- **Status: partial**. README › Data tables, Chains: user-defined formula transforms produce linked tables; ROADMAP open items: 'Calculated variables (in-table formulas) on multiple-variables tables'.
- **Gap:** No formula column inside a table.
- **Proposal (M):** Add calculated columns to multiple-variables tables using the existing formula engine (validated live).

#### 151. Merge or join tables by an ID column

`merge-tables` · score **18.9** · 6 observations from 5 venues (Lab blogs 2, Statistics-consulting FAQs 1, Forums (image.sc, Bioconductor, Galaxy) 1, Hacker News 1, Software reviews 1) · severity: blocks 1, wrong result 1, slows 4 · signal: 64 HN thread points

> Some labmates used to apply a vertical look up ... search with Excel but these large files required a lot of RAM memory and they would freeze their monitors or end up crashing their computers. In addition, they would apply this operation manually as many times as the number of samples to merge.
>
> — [rsg-spain.iscbsc.org, 2021-05, PhD student / bioinformatics technician, cancer genetics lab (CNIO; stated)](https://www.rsg-spain.iscbsc.org/a-pandas-mini-course-at-cnio/) `blog-rsgspain-pandas-1`

> Apparently I saved hours of retyping for one person who was doing a manual JOIN on gene names between two CSV files. As in ctrl+f name of gene from file A, copy, paste into another window. For thousands of rows.
>
> — [news.ycombinator.com, 2016-08, programmer helping bioinformatics researchers (stated)](https://news.ycombinator.com/item?id=12350014) `hn-12350014`

> My only problem is I get my results for each dataset as a single file (gene abundance) and I would like to get one excel (or other formats) with all my results from all my datasets.
>
> — [help.galaxyproject.org, 2020-04](https://help.galaxyproject.org/raw/3412) `galaxy-3412-1`

- **Status: missing**. No join or merge operation is listed among the data-table operations in README › Data tables.
- **Gap:** Users go back to Excel VLOOKUP.
- **Proposal (M):** Add 'Merge tables' for multiple-variables tables: join on a key column (left/inner), reporting unmatched keys.

### Assumptions, nonparametric tests and transforms

8 needs, 156 observations.

#### 8. Check assumptions sensibly: residual QQ plots, not a normality-test P that gates the test

`assumption-checks-residuals` · score **81.5** · 38 observations from 12 venues (Statistics-consulting FAQs 7, Stack Exchange 6, Journal requirements 4, Methods literature 4, Courses and workshops 3, GitHub issues 3) · severity: blocks 4, wrong result 27, slows 7 · signal: 12,109 page views; 30 votes/likes; 444,262 views of the videos commented on; 307 HN thread points

> Why is it so often assumed that biological measurements follow a normal distribution? To my knowledge, this isn't known a priori.
>
> — [biology.stackexchange.com, 2015-08, recently entered the life sciences from physics (stated)](https://biology.stackexchange.com/questions/37167) `stackexchange-biology-37167`

> I am using the rstatix package to compare the microbiota between three different groups, and when using the pairwise_wilcox_test I ran into an issue with certain bacteria where it gave the following error
>
> — [github.com/kassambara/rstatix, 2020-11, hematology/oncology fellow (GitHub bio)](https://github.com/kassambara/rstatix/issues/79) `github-rstatix-79-1`

> In your example you have only 5 biological replicate for each cell line. How do you test if your data are normaly distributed before you perform the Two-Way ANOVA test for this type of experiment?
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=sA4lPpKyNyE&lc=UgzsYMHgzYismlR4HJl4AaABAg) `youtube-sA4lPpKyNyE-UgzsYMHgzYismlR4HJl4AaABAg`

- **Status: partial**. Assumption chips for normality and equal SDs (ROADMAP › Theme 1) and explainers.ts 'Normality tests and choosing a nonparametric test'; README lists residual normality only for curve fits, and no QQ plot is mentioned for t tests or ANOVA.
- **Gap:** No residual QQ or residual-vs-fitted plot on t-test and ANOVA results.
- **Proposal (S):** Add a 'Residuals' tab to t-test and ANOVA results with a QQ plot and residual-vs-fitted plot, and word the normality chip as advice that depends on n.

#### 11. Analyse ratios and skewed positive data on the log scale and report back-transformed fold changes

`log-scale-analysis` · score **78.0** · 45 observations from 11 venues (Stack Exchange 19, Forums (image.sc, Bioconductor, Galaxy) 5, Statistics-consulting FAQs 4, GraphPad support pages 3, Software reviews 3, YouTube comments 3) · severity: blocks 3, wrong result 31, slows 9, cosmetic 2 · signal: 34,251 page views; 60 votes/likes; 664,531 views of the videos commented on

> What is the logic of taking the smallest value of triplicate in the control to do relative fold change, could you explain?
>
> — [youtube.com, 2024-10](https://www.youtube.com/watch?v=Uj0uDpNgc7U&lc=UgwvhefzS4BtQhrYFmZ4AaABAg) `youtube-Uj0uDpNgc7U-UgwvhefzS4BtQhrYFmZ4AaABAg`

> First note that the ratio of the largest value of xdata to the smallest is 2 million so we likely want to use log(xdata) in place of xdata.
>
> — [stackoverflow.com, 2017-02, answerer (accepted answer)](https://stackoverflow.com/a/42472087) `stackexchange-stackoverflow-42465934-a42472087`

> I wrote a function to compute fold changes. ... While doing this I get error: Warning message: NaNs produced in: log(x, base)
>
> — [support.bioconductor.org, 2006-05](https://support.bioconductor.org/p/12988/) `bioc-12988-1`

- **Status: partial**. Ratio paired t test, one-sample t on logs and geometric means exist (README › Statistics), and explainers.ts tells users lognormal data should be analysed as logs; no unpaired t test or ANOVA reports a ratio of geometric means.
- **Gap:** No 'analyse on log scale' switch for unpaired t tests and ANOVA; no chip when SD grows with the mean.
- **Proposal (M):** Add 'Analyse log(values)' to unpaired t tests and ANOVA, reporting geometric-mean ratios with CIs, and a chip that suggests it when SDs rise with means.

#### 44. Dunn's (or Conover) after Kruskal-Wallis or Friedman, including each vs control only

`nonparametric-posthoc` · score **56.0** · 29 observations from 8 venues (Stack Exchange 11, GitHub issues 9, Competitor trackers 2, Courses and workshops 2, Non-English communities 2, Lab blogs 1) · severity: blocks 5, wrong result 13, slows 11 · signal: 55,520 page views; 32 votes/likes

> Next, I would like to perform a post-hoc (the dosages were not planned ahead and the reason behind this is kind of complicated; however, I'm not sure if this warrants the use of the term "post-hoc" or not) analysis of the two dosages to the control (essentially, a non-parametric analog of Dunnett's test [1]).
>
> — [stats.stackexchange.com, 2018-06](https://stats.stackexchange.com/questions/350542) `stackexchange-stats-350542`

> will you consider supporting posthoc comparisons for Friedman test with a function for Durbin-Conover test?
>
> — [github.com/kassambara/rstatix, 2019-08, PhD social neuroscience, AI engineer (GitHub bio)](https://github.com/kassambara/rstatix/issues/8) `github-rstatix-8-1`

> GraphPad Prismにデフォルトで入っているDunn検定を試しにRを使って、2群比較を行った結果、より有意差が出たので、本研究でDunn検定がpBM検定に対して、代用可能かどうかが知りたくなりました。
>
> — [chiebukuro.yahoo.co.jp, 2023-08, statistics beginner analysing rat experiments](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q11283818896) `nonen-ja-dunn-vs-pbm-1` *(Gloss: 'I tried the Dunn test that comes by default in GraphPad Prism (via R) and it gave more significant differences, so I want to know whether Dunn can substitute for the permuted Brunner-Munzel test.' — Problem: tempted to switch to whichever test gives significance; unsure of Dunn's assumptions with unequal variances.)*

- **Status: partial**. README › Statistics: 'Kruskal-Wallis with Dunn's; repeated-measures ANOVA … and Friedman'; ROADMAP open item: Dunn's test against a control only.
- **Gap:** Dunn's always corrects for every pair; no vs-control family.
- **Proposal (S):** Add the control-only family to Dunn's (k−1 comparisons) and offer it when a control column is marked.

#### 62. Handle unequal SDs: Welch's t test and Welch's ANOVA, explained, as the safe default

`welch-unequal-sd` · score **48.3** · 17 observations from 8 venues (Stack Exchange 5, YouTube comments 3, Courses and workshops 2, GitHub issues 2, GraphPad support pages 2, Competitor trackers 1) · severity: wrong result 13, slows 4 · signal: 13,965 page views; 27 votes/likes; 323,698 views of the videos commented on

> I find it strange that the p-value from the A-D test is worse than the A-C test
>
> — [stats.stackexchange.com, 2012-05](https://stats.stackexchange.com/questions/28077) `stackexchange-stats-28077`

> Is there a reason to assume equal SDs? Would choosing to perform a Brown-Forsythe and Welch ANOVA tests give you different results, even if your SDs actually are equal?
>
> — [youtube.com, 2020-10](https://www.youtube.com/watch?v=kpGDAetOrFo&lc=Ugwloab2qzEb20yxN-d4AaABAg) `youtube-kpGDAetOrFo-Ugwloab2qzEb20yxN-d4AaABAg`

> • Not meeting the assumptions for parametric tests is not enough to switch to a non-parametric approach • Data exploration is key: • Outliers? • Possible transformation? • Parametric with corrections?
>
> — [www.bioinformatics.babraham.ac.uk, 2025-01, Life-science researchers at the Babraham Institute and external attendees (course audience)](https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/Intro%20to%20statistics%20with%20GraphPad%20Prism%20slides.pdf) `courses-babraham-sl-nonparam-not-default`

- **Status: done**. explainers.ts 'Equal SDs: Welch's t test and Welch's ANOVA'; the wizard recommends Welch's t test by default (recommend.ts rule `welch_t`); README › Statistics: Welch and Brown-Forsythe ANOVA with Games-Howell, Dunnett T3.

#### 100. A route for non-normal two-factor or repeated designs (aligned rank transform, permutation, transform)

`nonparam-factorial` · score **35.1** · 8 observations from 5 venues (Non-English communities 3, Methods literature 2, GitHub issues 1, Stack Exchange 1, YouTube comments 1) · severity: blocks 5, wrong result 3 · signal: 10,086 page views; 5 votes/likes; 226,702 views of the videos commented on

- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1001756), `lit-baker2014-ttest-only`): “Only 4% of EAE papers in these top-ranking journals (1/26; 95% CI 0.7%–18.9%) reported adequate use of a single non-parametric analysis of data on neurological scores, and 67% (95% CI 41.7%–84.8%) used only a t -test, which is not statistically justified [17] .”
- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002128), `lit-weissgerber2015-parametric`): “78.1% of studies performed only parametric analyses. 13.6% of studies used both parametric and nonparametric analyses, whereas 3.8% included only nonparametric analyses.”

> I'm not really fluent in statistics or programming, but I know the basics.
>
> — [stats.stackexchange.com, 2023-06, master's student (stated)](https://stats.stackexchange.com/questions/619413) `stackexchange-stats-619413`

> ①Normality Test をパスしない ②equal variances testをパスしないということから、同テストを行えないということになり（ソフトウェア）ました。
>
> — [chiebukuro.yahoo.co.jp, 2013-11](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q14116496854) `nonen-ja-rm-two-way-nonpar-1` *(Gloss: '(1) it fails the normality test and (2) fails the equal-variances test, so the software says the test cannot be run.' — Problem: software blocks two-way repeated-measures ANOVA on assumption checks and offers no nonparametric alternative (8,181 views).)*

> For those response variables that meet assumptions of normality I am using 2-way ANOVA. But what do I use for those that are non-parametric, and which I am unable to transform to a normal distribution?
>
> — [github.com/RobertsLab/resources, 2021-05, postdoctoral research associate (stated in GitHub bio)](https://github.com/RobertsLab/resources/discussions/1224) `github-robertslab-1224-1`

- **Status: missing**. No aligned-rank-transform or permutation two-way test is listed in README › Statistics or the engine handlers.
- **Gap:** Users fall back to separate Kruskal-Wallis tests.
- **Proposal (M):** Add the aligned rank transform two-way ANOVA (and a permutation option) to grouped tables, with an explainer on when a log transform is the better route.

#### 138. Ordinal scores (clinical scores, ratings) analysed as ordinal data

`ordinal-scores` · score **22.6** · 6 observations from 5 venues (Courses and workshops 2, Statistics-consulting FAQs 1, Methods literature 1, Stack Exchange 1, YouTube comments 1) · severity: blocks 1, wrong result 3, slows 2 · signal: 105 page views; 4 votes/likes; 76,673 views of the videos commented on

- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1001756), `lit-baker2014-eae-scores`): “Thirteen percent (95% confidence interval [CI] 8.7%–18.5%) of articles did not report statistical analyses at all, and only 39% (95% CI 32.5%–46.8%) correctly used non-parametric statistical tests on non-parametric neurological scoring data.”

> I'm a plant scientist in crop protection. My data is based on pesticide efficacy data that I have visually rated in jumps of 5% (standard practice).
>
> — [stats.stackexchange.com, 2026-07, plant scientist in crop protection (stated)](https://stats.stackexchange.com/questions/676709) `stackexchange-stats-676709`

> how to do ANOVA with repeated measurements using graphpad prism, when numerical rating scale is used to measure pain in more than 3 groups of patients.
>
> — [youtube.com, 2019-10](https://www.youtube.com/watch?v=vyAbX_SE-M8&lc=UgzgAsi1Gv0CiQ4UFF54AaABAg) `youtube-vyAbX_SE-M8-UgzgAsi1Gv0CiQ4UFF54AaABAg`

> Some departments routinely use parametric tests to analyse ordinal data.
>
> — [statstutor.ac.uk, course/consulting page, audience: maths/statistics support tutors helping students (statstutor quick guide)](https://www.statstutor.ac.uk/resources/uploaded/tutorsquickguidetostatistics.pdf) `consult-statstutor-ordinal`

- **Status: partial**. Rank tests exist (README › Statistics) and the wizard has a non-normal branch; there is no ordinal regression.
- **Gap:** No ordinal (cumulative link) model, mixed or not.
- **Proposal (L):** Research how often bench users need covariates with ordinal scores; ship a guided rank-test route first and an ordinal logistic model if the need holds.

#### 143. Warn that a rank test with tiny groups cannot reach P < 0.05

`rank-test-small-n` · score **21.3** · 6 observations from 3 venues (Stack Exchange 4, Statistics-consulting FAQs 1, Non-English communities 1) · severity: blocks 1, wrong result 5 · signal: 17,675 page views; 14 votes/likes

> is it expected behavior and does it mean we can't use that test for n=4?
>
> — [stats.stackexchange.com, 2017-10](https://stats.stackexchange.com/questions/308700) `stackexchange-stats-308700`

> n=3이기 때문에, nonparametric으로 One-way-ANOVA인, Kruskal-Wallis test로 통계처리를 하였습니다. 그런데 이렇게 에러바도 작고 차이도 확연한 것 같은데, Positive와 negative간의 유의성이 나오질 않네요..
>
> — [ibric.org, 2025-03, plant researcher (RT-qPCR)](https://www.ibric.org/bric/search.do?qt=prism&menu=%EC%BB%A4%EB%AE%A4%EB%8B%88%ED%8B%B0&section=%EC%BB%A4%EB%AE%A4%EB%8B%88%ED%8B%B0%7BQ_A%7D) `nonen-ko-qpcr-kw-n3-1` *(Gloss: 'Because n=3 I used the nonparametric Kruskal-Wallis test, but even though error bars are small and the difference is obvious, positive vs negative is not significant.' — Problem: picked a rank test with n=3, which cannot reach significance; misunderstands why. (BRIC Q&A detail pages return an empty body to the fetcher; quote is from the question text shown on BRIC's own search-results page))*

> doesn’t work for small samples, only 5 discrete p-values for n=3
>
> — [dag.compbio.dundee.ac.uk, course/consulting page, audience: biologists attending the Dundee Data Analysis Group statistics workshop](https://dag.compbio.dundee.ac.uk/workshops/statistics_lectures/10_Non-parametric_tests.pdf) `consult-dundee-nonparam-smalln-41`

- **Status: missing**. No check of the smallest attainable P exists among the guidance rules (recommend.ts `deriveChecks` covers n, SD ratio, zero variance, normality only).
- **Gap:** Users run Mann-Whitney with n = 3 per group and read 'ns' as no effect.
- **Proposal (S):** When a rank test's smallest attainable P exceeds alpha, say so before the result ('with 3 per group Mann-Whitney cannot give P < 0.1') and suggest the parametric test on a suitable scale.

#### 158. Keep summary and graph consistent with the test (medians with rank tests) and say what the test compares

`summary-matches-test` · score **17.3** · 7 observations from 4 venues (Statistics-consulting FAQs 3, Methods literature 2, Lab blogs 1, Stack Exchange 1) · severity: wrong result 5, slows 1, cosmetic 1 · signal: 1,181 page views; 1 votes/likes

> The Mann-Whitney U test does not compare the means of two groups.
>
> — [stats.stackexchange.com, 2021-04, answerer (accepted answer)](https://stats.stackexchange.com/a/518168) `stackexchange-stats-518150-a518168`

> it condemned the rather common and erroneous practice of depicting means and SD/SEM on bar graphs in figures, and analyzing that data with a non-parametric test which does not look at means, such as the Mann Whitney U test. Sadly, this practice still exists, even in journals as hallowed as Nature.
>
> — [occamstypewriter.org, 2010-09, commenter](https://occamstypewriter.org/boboh/2010/09/20/im_been_meaning_to_write/) `blog-occamstypewriter-statpain-1`

> I ran a Mann-Whitney test on two independent groups that have equal medians, the results were significant. I thought that the Mann-Whitney tested differences in medians.
>
> — [stats.oarc.ucla.edu, client question to UCLA OARC statistical consulting (shown as "A client has sent us the following question")](https://stats.oarc.ucla.edu/other/mult-pkg/faq/general/faq-why-is-the-mann-whitney-significant-when-the-medians-are-equal/) `consult-ucla-mannwhitney`

- **Status: partial**. Mann-Whitney reports Hodges-Lehmann and explainers.ts 'Normality tests and choosing a nonparametric test' explains the choice; nothing switches the summary or graph to median and IQR.
- **Gap:** Mean ± SD graphs sit beside rank-test P values.
- **Proposal (S):** When a rank test is chosen, default the summary to median (IQR) and the graph to median with interquartile range, and state in one line what the test compares.

### Learning and guidance

6 needs, 140 observations.

#### 9. A point-and-click tool as quick as Excel, with no coding and a short learning curve

`no-code-approachable` · score **81.1** · 61 observations from 13 venues (Software reviews 17, Hacker News 15, Lab blogs 10, GitHub issues 4, Forums (image.sc, Bioconductor, Galaxy) 3, Competitor trackers 2) · severity: blocks 14, wrong result 5, slows 37, cosmetic 5 · signal: 1,969 page views; 6 votes/likes; 423,947 views of the videos commented on; 3,416 HN thread points

> Three samples with biological replicates. I wish to do ANOVA.
>
> — [support.bioconductor.org, 2009-01, PhD student (stated)](https://support.bioconductor.org/p/25938/) `bioc-25938-1`

> I am new on this software. I have those variables and i need to enter them into prism for analysis any help and suggestions?
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=PQOhSk1sQMA&lc=Ugy0Q-59ypL57VHH5P54AaABAg) `youtube-PQOhSk1sQMA-Ugy0Q-59ypL57VHH5P54AaABAg`

> My PhD worked on bigger data than could be analysed in the regular biological sciences way (excel + stats software), so I learnt R.
>
> — [news.ycombinator.com, 2021-10, clinical haematologist / cancer researcher (stated)](https://news.ycombinator.com/item?id=28811111) `hn-28811111`

- **Status: done**. README: a browser data grid with Excel paste, analysis controls and graphs, no code; UI/UX pass with Eren planned (memory note).

#### 63. Explain each result in plain words: what it means and how it is often misread

`plain-language-results` · score **48.1** · 17 observations from 9 venues (Competitor trackers 5, Lab blogs 2, Courses and workshops 2, Mastodon / fediverse 2, YouTube comments 2, Statistics-consulting FAQs 1) · severity: blocks 1, wrong result 8, slows 8 · signal: 1,783 page views; 10 votes/likes; 808,712 views of the videos commented on

- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002430), `lit-weissgerber2016e-1`): “show that the ability to understand statistical concepts and apply statistical skills is essential for research; however, biostatistics training is not always required to complete a PhD.”
- **Prevalence** ([www.labome.com](https://www.labome.com/method/Statistical-Analysis-Software-Programs-in-Biomedical-Research.html), `courses-labome-excel-dual-axis`): “The interpretations are not descriptive and so the user needs to obtain the inferences depending on his level of knowledge of statistics.”

> Whenever I learn about a new statistical method: Do I know what I'm doing? - Highly debatable Do I hope for the best? - 100%
>
> — [fediscience.org, 2026-08, Postdoc, applied animal behaviour (bio)](https://fediscience.org/@volephd/117092831216433935) `mastodon-fediscience.org-117092831216433935`

> I'm an undergrad psych student doing a long distance course so most of my learning is driven by myself, and the statistics have been driving me insane; I just don't understand it at all.
>
> — [youtube.com, 2022-10, undergraduate psychology student (stated)](https://www.youtube.com/watch?v=A82brFpdr9g&lc=Ugx_7iFhFkGfbXvA4yB4AaABAg) `youtube-A82brFpdr9g-Ugx_7iFhFkGfbXvA4yB4AaABAg`

> At first, I found it overwhelming to understand what happens once a code is executed. This was because I knew too little at the time to check the processed data files and interpret the output.
>
> — [editage.com, MPhil candidate, plant epigenetics; former wet-lab student (stated)](https://www.editage.com/insights/?p=2324) `blog-editage-wettodry-2`

- **Status: partial**. README › Guidance: plain-language banners on results and sourced explainers; results sentences (README › Reporting); no per-number 'what this means' line.
- **Gap:** Key numbers (P, CI, Hill slope, HR) carry no one-line meaning next to them.
- **Proposal (M):** Add a 'What this means' line under the key result of every analysis ('the drug lowered tumour volume by 38% (95% CI 12–57%); a difference this large would be unusual if the drug had no effect'), with common misreadings.

#### 84. Explanations at the point of choice, tied to my data

`in-context-explainers` · score **38.9** · 23 observations from 9 venues (Lab blogs 4, Statistics-consulting FAQs 4, Methods literature 3, Software reviews 3, Stack Exchange 3, Courses and workshops 2) · severity: blocks 2, wrong result 2, slows 19 · signal: 10,940 page views; 16 votes/likes

- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002430), `lit-weissgerber2016edu-stats-everywhere`): “According to our recent systematic review [ 4 ], 97.2% of original research papers published in the top 25% of physiology journals ( n = 683/703) included some form of statistical analysis ( Fig 1A ).”
- **Prevalence** ([eLife](https://pmc.ncbi.nlm.nih.gov/articles/PMC6326723/), `lit-weissgerber2018elife-training`): “This is problematic because it is possible to complete a PhD without being trained in statistics: only 67.5% of the top NIH-funded physiology departments in the United States required statistics training for some or all PhD programs that the department participated in ( Weissgerber et al., 2016a ).”

> we didn't use this statistical analysis because no one in the lab knows how to work it and I can't learn it fast enough
>
> — [scholar.social, 2018-03, Emergency medicine doctor (bio)](https://scholar.social/@noctiluca/99655618416874622) `mastodon-scholar.social-99655618416874622`

> I work in cell biology where the field standard is now to do 3 biological replicates of experiments. However, each data point is extremely laborious to get and we receive very little statistics training.
>
> — [stats.stackexchange.com, 2023-11, works in cell biology (stated)](https://stats.stackexchange.com/questions/630997) `stackexchange-stats-630997-2`

> Je suis actuellement en stage en recherche contre le cancer et je ne trouve malheureusement pas de référent en stat c'est pourquoi je me tourne vers ce forum.
>
> — [les-mathematiques.net, 2016-03, intern in cancer research (no stats mentor)](https://les-mathematiques.net/vanilla/discussion/1232699/biostatistiques-test-de-viabilite) `nonen-fr-viability-test-1` *(Gloss: 'I'm an intern in cancer research and unfortunately can't find a statistics referent, so I'm turning to this forum.' — Problem: needs to show one cell line survives better across doses (dose × cell line, with repeats) without local statistical help.)*

- **Status: done**. README › Guidance: sourced explainers in a searchable Help panel (Ctrl/Cmd+/), assumption chips and banners on results; ROADMAP › Theme 1: 'Explainers in place: SD vs SEM vs CI, relative vs absolute IC50, which post hoc for which question, log-rank vs Gehan, R² is not curve quality'.
- **Gap:** explainers.ts holds 18 explainers; weighting in curve fits, censoring and survival data entry, dose spacing and analysing on the log scale have none.
- **Proposal (S):** Add explainers for the topics users ask about that have none yet (weighting, censoring, dose spacing, log-scale analysis) and link each explainer from the option it explains.

#### 103. Start from my goal ('I want an IC50') and be walked through the assay

`guided-assay-workflows` · score **34.6** · 13 observations from 7 venues (Software reviews 6, YouTube comments 2, Competitor trackers 1, Statistics-consulting FAQs 1, Forums (image.sc, Bioconductor, Galaxy) 1, GraphPad support pages 1) · severity: blocks 4, slows 8, cosmetic 1 · signal: 864 page views; 2 votes/likes; 553,462 views of the videos commented on

> 现在他们返回了CCK-8的结果，上手时却发现不清楚怎么分析。能否推荐一些参考书或者课程？
>
> — [muchong.com, 2022-03, biomaterials researcher (collaborators ran cell/animal tests)](https://muchong.com/t-15186674-1) `nonen-zh-learn-cck8-1` *(Gloss: 'They sent back the CCK-8 results, but when I started I realised I don't know how to analyse them. Can you recommend books or courses?' — Problem: non-biologist owner of the data lacks a standard analysis path for a viability assay.)*

> I am a little disappointed to learn that bio-tek does not provide test programming instructions for the EPOCH reader because of possible liable.
>
> — [selectscience.net, 2014-07, Organisation: Florida Department of Health; application area: Serology (shown)](https://www.selectscience.net/product/agilent-biotek-gen5-software-for-detection) `reviews-ss-16540-1`

> Can someone quickly tell me where to find easy instructions to performing densitometry on a Western blot? I find the instructions provided to be incomplete and confusing.
>
> — [forum.image.sc, 2019-06](https://forum.image.sc/raw/27133) `imagesc-27133-1`

- **Status: done**. README › Assay modules: 'New data table › Start from an assay' with wizards for plate reader, ELISA, qPCR and blots; start screen with templates and a guided tour.

#### 123. Something my course can require without students paying or pirating

`teaching-use` · score **27.8** · 11 observations from 7 venues (GraphPad support pages 3, Lab blogs 2, Software reviews 2, Competitor trackers 1, Courses and workshops 1, Hacker News 1) · severity: blocks 1, slows 8, cosmetic 2 · signal: 259,641 page views; 271 HN thread points

- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002430), `lit-weissgerber2016edu-notoffered`): “Biostatistics was not required or offered as an elective course for students in 12.5% of departments.”

> I used to teach my students using R commands, under RStudio, to perform import/export data, data wrangling, statistical tests, and plot graphs. For some students, they feel overwhelmed by too much programming.
>
> — [forum.jamovi.org, 2020-09, teacher of statistics to undergraduate biology students (stated)](https://forum.jamovi.org/viewtopic.php?t=1417) `competitor-jamovi-1417`

> Moreover, I have freshman students in an inquiry-based lab also using the plate reader, and in the limited time they have to learn the software, Gen 5 is very far beyond their ability to comprehend.
>
> — [selectscience.net, 2014-07, Organisation: University of Miami; application area: Bradford protein assays (shown)](https://www.selectscience.net/product/agilent-biotek-gen5-software-for-detection) `reviews-ss-16516-2`

> The people with no prior experience found the final session pretty tough so I don't think it would be possible to go through this material in fewer sessions.
>
> — [quantixed.org, 2020-02, PI, cell biology (Stephen Royle)](https://quantixed.org/2020/02/18/get-better-r-for-absolute-beginners/) `blog-quantixed-rbeginners-1`

- **Status: done**. README: free and in the browser; example project and tour (README › Guidance).

#### 125. Worked examples and tutorials inside the tool

`examples-tutorials` · score **27.1** · 15 observations from 6 venues (Software reviews 7, YouTube comments 4, Competitor trackers 1, Courses and workshops 1, GraphPad support pages 1, Mastodon / fediverse 1) · severity: wrong result 1, slows 13, cosmetic 1 · signal: 4 votes/likes; 662,038 views of the videos commented on

> I think a better tutorial, academic lessons, summer school on how properly use it; it’s a very powerful tool and sometimes we don't use it properly
>
> — [selectscience.net, 2013-11, Organisation: Cinvestav; application area: Electrophysiology Records (shown)](https://www.selectscience.net/product/pclamp-10-standard-electrophysiology-software-windows) `reviews-ss-15235-1`

> I am using version 8.4.1 which is released on March 13. 2020, but don't know why I don't have the narrative results tab after the analysis .
>
> — [youtube.com, 2020-10](https://www.youtube.com/watch?v=sA4lPpKyNyE&lc=UgwwlVu2j0dIYFA5GSJ4AaABAg) `youtube-sA4lPpKyNyE-UgwwlVu2j0dIYFA5GSJ4AaABAg`

> This #ImageJ plugin seems perfect for what I want to do, but the documentation on https://microbej.com is not like the interface on my Mac👇, is there a newer manual somewhere?
>
> — [mstdn.science, 2023-03, Senior research engineer, biochemist (bio)](https://mstdn.science/@josyterbeek/110033513018885906) `mastodon-mstdn.science-110033513018885906`

- **Status: done**. README › Guidance: example project with a five-step tour; templates on published data; built-in starters for every assay.

### Normalisation

4 needs, 70 observations.

#### 10. Normalise to % or fold of control in one step that feeds the analyses

`normalise-step` · score **78.7** · 46 observations from 12 venues (Forums (image.sc, Bioconductor, Galaxy) 12, Stack Exchange 8, YouTube comments 7, GraphPad support pages 5, Journal requirements 3, Non-English communities 3) · severity: blocks 8, wrong result 20, slows 18 · signal: 27,205 page views; 15 votes/likes; 510,093 views of the videos commented on

> My main concern is how to calculate the fold change when I have
>
> — [stats.stackexchange.com, 2016-08](https://stats.stackexchange.com/questions/230484) `stackexchange-stats-230484`

> 阻害率(y軸)の求め方がイマイチわかりません。
>
> — [chiebukuro.yahoo.co.jp, 2022-08](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q13267313493) `nonen-ja-inhibition-pct-1` *(Gloss: 'I don't really understand how to compute the % inhibition (y axis).' — Problem: normalisation of raw signal to 0-100% inhibition using controls is the first stumbling block (1,562 views).)*

> I have tried performing the same operation in the MS Excel, this is very tedious and time consuming. I have many large datasets with several hundred rows and columns
>
> — [support.bioconductor.org, 2019-08, new to programming (stated)](https://support.bioconductor.org/p/123962/) `bioc-123962-1`

- **Status: done**. README › Data tables, Chains: 'Normalize … produce a linked table that follows its source'; explainers.ts 'What Normalize does to SD and SEM'.

#### 65. Don't lose the control's variability after normalising; test ratios properly

`normalised-control-variance` · score **47.8** · 14 observations from 7 venues (Stack Exchange 7, Methods literature 2, Competitor trackers 1, GitHub issues 1, Journal requirements 1, Non-English communities 1) · severity: blocks 1, wrong result 13 · signal: 20,405 page views; 9 votes/likes; 352,004 views of the videos commented on

> Theoretically, I would calculate the SD of the 3 independent values, but this means that my control will have no SD since all 3 values were set as 1.
>
> — [stats.stackexchange.com, 2017-08, stats is a foreign language to them (stated)](https://stats.stackexchange.com/questions/299429) `stackexchange-stats-299429`

> why you should have a standard deviation from your control groups in the experiment? i do not really understand this, in my lab they do it the same way but i have read a lot and there are people who is against this
>
> — [youtube.com, 2018-10](https://www.youtube.com/watch?v=Kkle8T7aXjk&lc=UgzDVkqcmtfD9OlAXHV4AaABAg) `youtube-Kkle8T7aXjk-UgzDVkqcmtfD9OlAXHV4AaABAg`

> Ich habe diverse Gruppen, welche ich mit dem t-Test auf Signifikanz im Vergleich zur auf 100% normierten Kontrolle testen möchte.
>
> — [statistik-forum.de, 2013-03, beginner moving from Excel](http://www.statistik-forum.de/test-f8/test-bei-graphpad-prism-t2575.html) `nonen-de-ttest-vs-100-1` *(Gloss: 'I have several groups I want to t-test against the control normalised to 100%.' — Problem: control has no variance after normalisation; could not get Prism to compute it.)*

- **Status: done**. ROADMAP › Theme 1 banner: 'control normalised to 1 has SD 0, use a one-sample or ratio paired t test'; explainers.ts 'Control normalised to 1 (or 100%) has SD 0'; recommend.ts `normalised` design.

#### 167. Propagate error through background subtraction, ratios and normalisation

`error-propagation` · score **12.3** · 6 observations from 2 venues (Stack Exchange 5, GraphPad support pages 1) · severity: wrong result 3, slows 3 · signal: 4,738 page views; 9 votes/likes

> Does it make sense to do this calculation (it seems that the biological variance is ignored and only the initial duplicate sd is actually propagated and presented)?
>
> — [stats.stackexchange.com, 2012-02](https://stats.stackexchange.com/questions/22765) `stackexchange-stats-22765`

> Fixed the issue in which values of lower and upper confidence limits were incorrectly swapped in the Hook Constant dialog for the Contingency Chi-square analysis
>
> — [graphpad.com release notes, 2021-07](https://www.graphpad.com/updates/prism-920-release-notes) `gpsupport-rn-920-6`

> I am worried that it is incorrect just to divide the respective average concentrations and propagate their standard deviations.
>
> — [stats.stackexchange.com, 2023-12](https://stats.stackexchange.com/questions/635715) `stackexchange-stats-635715`

- **Status: partial**. explainers.ts 'What Normalize does to SD and SEM' explains the effect; no transform propagates uncertainty.
- **Gap:** Subtracting a blank or dividing by a control mean ignores their uncertainty.
- **Proposal (M):** Offer 'propagate uncertainty' on Remove baseline and Normalize (delta method), or steer users to analysing raw values with the control as a block.

#### 175. Label normalised axes correctly ('fold of control mean' vs 'fold of matched control')

`normalised-axis-label` · score **5.1** · 4 observations from 3 venues (Methods literature 2, Journal requirements 1, YouTube comments 1) · severity: slows 1, cosmetic 3 · signal: 1 votes/likes; 174,962 views of the videos commented on

- **Prevalence** ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/), `journal-bjp-design-5`): “Following data transformation, the Y axis is often labelled incorrectly (it should be ‘fold matched control values’ or ‘fold of the control mean’, and not ‘fold control’).”

> how do you tag the Y axis in the plot?. Is it ok to label it like: Protein/actin (relative to control)?.
>
> — [youtube.com, 2023-10](https://www.youtube.com/watch?v=ZJaD_6C5nkQ&lc=Ugydas17qMJ6sTx-AVx4AaABAg) `youtube-ZJaD_6C5nkQ-Ugydas17qMJ6sTx-AVx4AaABAg`

> Following data transformation, the Y axis is often labelled incorrectly (it should be ‘fold matched control values’ or ‘fold of the control mean’, and not ‘fold control’).
>
> — [pmc.ncbi.nlm.nih.gov, 2018, journal requirement, British Journal of Pharmacology](https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/) `journal-bjp-design-5`

> If this is done, the correct units for such normalized data is % (or fold) of the control group's mean value, and graph Y axes and figure legends should be appropriately labelled to reflect this (‘fold’ or ‘% control’ is insufficiently clear).
>
> — [British Journal of Pharmacology, 2015-06, peer-reviewed critique, pharmacology (journal guidance editorial)](https://pmc.ncbi.nlm.nih.gov/articles/PMC4507152/) `lit-curtis2015-units`

- **Status: missing**. Axis titles are editable with automatic defaults (ROADMAP › Final round) but README does not say they follow the normalisation applied.
- **Gap:** Normalised graphs keep the raw Y title or a generic one.
- **Proposal (S):** Generate the Y title from the Normalize settings ('% of vehicle mean', 'fold of matched control') and put the same phrase in the legend.

### Standard curves, plate readers and assay QC

7 needs, 109 observations.

#### 13. Interpolate unknowns from a standard curve (ELISA, BCA, copies), with dilution factors

`standard-curve-interpolation` · score **75.8** · 46 observations from 10 venues (Stack Exchange 20, YouTube comments 11, Methods literature 4, Competitor trackers 3, Forums (image.sc, Bioconductor, Galaxy) 2, GraphPad support pages 2) · severity: blocks 15, wrong result 13, slows 15, cosmetic 3 · signal: 51,938 page views; 40 votes/likes; 1,175,807 views of the videos commented on

> How can I do this in R? I want to get the $A$, $B$, $C$ and $D$ values and plot the curve.
>
> — [stats.stackexchange.com, 2013-06, biology student (stated)](https://stats.stackexchange.com/questions/61144) `stackexchange-stats-61144`

> I did what you said but not give me correct number of concentration of cytokines I chose (analyse->nonlinear curve fit-> interpolate unknown samples-> ok ) but no result when I chose linear I get lower number
>
> — [youtube.com, 2018-10](https://www.youtube.com/watch?v=5IqqpKSnXfI&lc=Ugx1Ma9ksmxzB-bggGp4AaABAg) `youtube-5IqqpKSnXfI-Ugx1Ma9ksmxzB-bggGp4AaABAg`

> Are there any package for the analysis of more than fifty serum markers by elisa.
>
> — [support.bioconductor.org, 2017-01](https://support.bioconductor.org/p/91658/) `bioc-91658-1`

- **Status: done**. README › Assay modules: Standard curve / ELISA wizard (standards, blanks and unknowns with dilution factors, 4PL / 5PL / linear / log-log with weighting).

#### 70. From a plate-reader export to a plate map, blanks and % of control in one step

`plate-map-normalise` · score **46.0** · 22 observations from 7 venues (YouTube comments 7, Stack Exchange 6, GitHub issues 3, Software reviews 3, Forums (image.sc, Bioconductor, Galaxy) 1, Hacker News 1) · severity: blocks 5, wrong result 6, slows 9, cosmetic 2 · signal: 12,222 page views; 7 votes/likes; 895,134 views of the videos commented on; 78 HN thread points

> Using either of these explanations, one would assume that the A540 would be relatively uniform across the plate, independent of the A450 of the same well. However, in my experience, that is not the case at all.
>
> — [biology.stackexchange.com, 2015-06](https://biology.stackexchange.com/questions/34880) `stackexchange-biology-34880`

> How does HTqPCR handle technical replicates? Suppose I have 4 samples, 8 primer sets, and 3 replicates on a 96 well plate. ... Do I have to make each technical replicate it's own feature?
>
> — [support.bioconductor.org, 2023-09](https://support.bioconductor.org/p/9154311/) `bioc-9154311-1`

> I have needed to calculate the median of four optical density values and have not been able to make that calculation in the previous software.
>
> — [selectscience.net, 2014-06, Organisation: Instituto Colombiano Agropecuario; application area: ELISA (shown)](https://www.selectscience.net/product/agilent-biotek-gen5-software-for-detection) `reviews-ss-16544-1`

- **Status: done**. README › Assay modules: Plate reader → dose-response wizard (96/384-well plates, plate-map editor, normalised XY tables).

#### 77. Flag samples outside the standards (<LLOQ, >ULOQ) and show back-calculated recovery per standard

`standard-curve-qc` · score **41.2** · 13 observations from 6 venues (YouTube comments 6, Stack Exchange 3, Competitor trackers 1, Statistics-consulting FAQs 1, Methods literature 1, Software reviews 1) · severity: blocks 2, wrong result 8, slows 3 · signal: 44,182 page views; 7 votes/likes; 482,380 views of the videos commented on

> I have additionally gotten solutions that get negative concentrations when I try to use external standards (plugging the solution intensity into the equation and solving backwards)
>
> — [chemistry.stackexchange.com, 2023-11, second-year university student taking lab courses (stated)](https://chemistry.stackexchange.com/questions/177435) `stackexchange-chemistry-177435`

> <Minimum means the amount of sample was below the detection level of the assay. Is it OK to use 0 in these cases?
>
> — [forum.jamovi.org, 2024-07](https://forum.jamovi.org/viewtopic.php?t=3801) `competitor-jamovi-3801`

> if the unkown Y value is out of the standard cure range, is there any method to predict the X value without redo the ELISA?
>
> — [youtube.com, 2019-10](https://www.youtube.com/watch?v=5IqqpKSnXfI&lc=UgxaoV4QbmnGCpjwsD14AaABAg) `youtube-5IqqpKSnXfI-UgxaoV4QbmnGCpjwsD14AaABAg`

- **Status: done**. README › Assay modules: 'back-calculated recovery with ICH M10 acceptance, LLOQ / ULOQ, refitting without a rejected standard, flags'.

#### 142. Plate QC: Z′, control CVs, edge effects and a plate heat map

`plate-qc` · score **21.6** · 13 observations from 5 venues (Stack Exchange 6, Statistics-consulting FAQs 3, GitHub issues 2, Lab blogs 1, Competitor trackers 1) · severity: wrong result 3, slows 8, cosmetic 2 · signal: 7,652 page views; 14 votes/likes

> In my experience with such plates the problems are typically in the outermost wells, the ones most susceptible to desiccation in an incubator.
>
> — [stats.stackexchange.com, 2023-02, commenter](https://stats.stackexchange.com/questions/604687) `stackexchange-stats-604687-c`

> Cell control values which are excessively large - Virus control values which are excessively small - High level of variance in either cell or virus controls.
>
> — [github.com/TKMarkCheng/NormaliseForIC50, 2023-10, resident doctor and visiting researcher, infectious disease lab (GitHub bio)](https://github.com/TKMarkCheng/NormaliseForIC50/issues/1) `github-normaliseforic50-1-1`

> A quick reminder that when using quality controls, it's not sufficient to just run them with each experiment, but you need to track the performance over time.
>
> — [expertcytometry.com, flow cytometry core manager / trainer (Tim Bushnell, PhD; stated)](https://expertcytometry.com/a-numbers-game/) `blog-expertcyto-numbers-3`

- **Status: done**. README › Assay modules: 'Z′ and robust Z′, signal window, control and replicate CVs, edge-effect check'.

#### 147. Limit of blank, detection and quantification from blanks and the curve

`lod-loq` · score **19.8** · 8 observations from 2 venues (Stack Exchange 7, YouTube comments 1) · severity: blocks 2, wrong result 5, slows 1 · signal: 9,958 page views; 20 votes/likes; 217,560 views of the videos commented on

> I am not sure what measure to use in my calculations.
>
> — [biology.stackexchange.com, 2015-12](https://biology.stackexchange.com/questions/41619) `stackexchange-biology-41619`

> sir can you please teach me how to measure limit of detection(LOD) using graphpad prism? i am badly struck and i really need your help sir
>
> — [youtube.com, 2025-11](https://www.youtube.com/watch?v=kpGDAetOrFo&lc=Ugyfet4wW4ySS2fK3hx4AaABAg) `youtube-kpGDAetOrFo-Ugyfet4wW4ySS2fK3hx4AaABAg`

> Would the above equation still apply if I were to apply it to a calibration curve generated through linear regression of $\ln(y)$ on $\ln(x)$?
>
> — [chemistry.stackexchange.com, 2020-10](https://chemistry.stackexchange.com/questions/141369) `stackexchange-chemistry-141369`

- **Status: partial**. LLOQ and ULOQ come from the precision profile (ROADMAP › Theme 3); no LoB/LoD from blank replicates.
- **Gap:** LoB/LoD (CLSI-style) from blanks and low samples; probit LoD for qPCR dilution series.
- **Proposal (S):** Add LoB/LoD/LoQ to the standard-curve wizard from blank and low-level replicates, back-transformed through the fitted curve.

#### 169. Assay validation: spike recovery, dilution linearity, intra- and inter-assay CV, parallelism

`assay-validation-suite` · score **11.9** · 4 observations from 2 venues (Stack Exchange 3, Software reviews 1) · severity: blocks 2, slows 2 · signal: 8,430 page views; 9 votes/likes

> How do I prove that both curves are parallel (meaning no matrix effects are present), within a margin of 5%?
>
> — [chemistry.stackexchange.com, 2017-12](https://chemistry.stackexchange.com/questions/87896) `stackexchange-chemistry-87896`

> Customer service was not helpful when we had questions about programming protocols, and the existing parallelism protocols.
>
> — [selectscience.net, 2014-06, Organisation: University of Arizona; application area: Endocrinology (shown)](https://www.selectscience.net/product/agilent-biotek-gen5-software-for-detection) `reviews-ss-16493-1`

> No mention of any acceptable criteria for the both validation tests
>
> — [biology.stackexchange.com, 2013-04](https://biology.stackexchange.com/questions/7868) `stackexchange-biology-7868`

- **Status: partial**. README › Assay modules: standard-curve wizard has parallelism and CVs; no spike-recovery, dilution-linearity or inter-assay CV report.
- **Gap:** Spike recovery, linearity of dilution and inter-assay CV across runs.
- **Proposal (M):** Add an 'Assay validation' report to the standard-curve wizard: spike recovery %, dilutional linearity, intra- and inter-assay CV with acceptance limits.

#### 173. Give each plate its own plate map and standard curve

`per-plate-curves` · score **7.9** · 3 observations from 3 venues (Statistics-consulting FAQs 1, Software reviews 1, Stack Exchange 1) · severity: wrong result 1, slows 2 · signal: 85 page views; 2 votes/likes

> I don’t need precise quantification at this stage — just a relative comparison to identify top candidates for later confirmation by HPLC.
>
> — [chemistry.stackexchange.com, 2025-08](https://chemistry.stackexchange.com/questions/190539) `stackexchange-chemistry-190539`

> But my main use is with a different plate map for every plate, and Gen 5 wasn't as eager as "Eager" is to accommodate that.
>
> — [selectscience.net, 2014-07, Organisation: University of Miami; application area: Bradford protein assays (shown)](https://www.selectscience.net/product/agilent-biotek-gen5-software-for-detection) `reviews-ss-16516-1`

> A standard curve should be run for every plate or sample run. ... is whether the plate reader or fluoro-/lumino-meter is set to automatically change the reading values based on the maximum fluorescent intensity observed in the plate.
>
> — [ainslielab.web.unc.edu, lab guidance FAQ, audience: lab members running standard curves (UNC)](https://ainslielab.web.unc.edu/wp-content/uploads/sites/12416/2019/03/Standard-Curve-Basics.pdf) `consult-ainslie-perplate-74`

- **Status: partial**. ROADMAP open items (Theme 3): 'one plate map serves every plate of a plate-reader table (no per-plate maps)'.
- **Gap:** Per-plate maps and per-plate standard curves.
- **Proposal (M):** Let each plate in the plate-reader and ELISA wizards carry its own map (copy, then edit) and its own standard curve.

### Planning: power, randomisation and blinding

7 needs, 105 observations.

#### 14. Work out how many animals or replicates I need, with a justification sentence

`power-sample-size` · score **72.8** · 58 observations from 10 venues (Stack Exchange 18, Statistics-consulting FAQs 15, Courses and workshops 7, Journal requirements 5, GraphPad support pages 4, Methods literature 4) · severity: blocks 9, wrong result 14, slows 35 · signal: 205,129 page views; 127 votes/likes

- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.3000410), `lit-arrive2020-2`): “sample size justification (reported in less than 10% of publications), and animal characteristics (all basic characteristics reported in less than 10% of publications)”
- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002273), `lit-macleod2015-samplesize`): “Randomisation was reported in 662 publications (24.8%), blinded assessment of outcome in 788 (29.5%), a sample size calculation in 20 (0.7%), and a statement of potential conflict of interest in 308 (11.5%).”

> I have really little idea of survival analysis.
>
> — [stats.stackexchange.com, 2014-03](https://stats.stackexchange.com/questions/91270) `stackexchange-stats-91270`

> However, I am getting really high numbers per group (400+) . I am not sure if I am doing it right and not many people seem to estimate sample sizes prior to RNAseq experiments.
>
> — [support.bioconductor.org, 2023-07](https://support.bioconductor.org/p/9153165/) `bioc-9153165-1`

> Sample size of N=3 when dealing with multi-omics is *too* small
>
> — [fosstodon.org, 2026-09, Bioinformatician working with clinicians (bio)](https://fosstodon.org/@Mehrad/117332651449828950) `mastodon-fosstodon.org-117332651449828950-3`

- **Status: done** (met, but hard to find). README › Clinical statistics: power and sample size for t tests, ANOVA, proportions, McNemar, chi-square, correlation and log-rank, power curves and an ARRIVE-style justification sentence.
- **Gap:** The tool sits under Tools; it does not read the SD from a pilot table in the project.
- **Proposal (S):** Offer 'Plan the next experiment' from any results sheet, pre-filled with this data's SD and effect.

#### 90. Check my design before the experiment: controls, replicates, units

`design-stage-checks` · score **37.4** · 14 observations from 5 venues (Statistics-consulting FAQs 6, Stack Exchange 5, Lab blogs 1, Hacker News 1, Methods literature 1) · severity: blocks 8, wrong result 3, slows 3 · signal: 4,579 page views; 45 votes/likes; 54 HN thread points

> That because there was no replicate for the control (we only used one control tank) we cannot calculate variance and so we can't compare the sample means of the control and the treatment.
>
> — [stats.stackexchange.com, 2012-11, student lab group (stated)](https://stats.stackexchange.com/questions/44475) `stackexchange-stats-44475`

> When it comes up, many researchers freeze not knowing how to proceed, and they muddle through as best they can.
>
> — [expertcytometry.com, flow cytometry core manager / trainer (Tim Bushnell, PhD; stated)](https://expertcytometry.com/?p=4457) `blog-expertcyto-5steps-1`

> The number one thing that most biologists need (that most scientists need) is a basic understanding of statistics when doing experimental design.
>
> — [news.ycombinator.com, 2016-08, computational biologist (stated)](https://news.ycombinator.com/item?id=12282658) `hn-12282658`

- **Status: partial**. The power tool and the 'Which test?' wizard exist (README › Guidance, Power), but no pre-experiment design check.
- **Gap:** Design mistakes (single control, n = 1 pooled) are found after the data exist.
- **Proposal (M):** Add 'Plan an experiment': the wizard's design questions before data, producing the planned table, analysis, n and a design check list.

#### 122. A blinded analysis mode that hides group names until decisions are locked

`blinding-mode` · score **27.8** · 10 observations from 4 venues (Methods literature 5, Lab blogs 2, Hacker News 2, Journal requirements 1) · severity: wrong result 8, slows 2 · signal: 299 HN thread points

- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.3000410), `lit-arrive2020-1`): “However, despite this level of support, recent studies have shown that important information as set out in the ARRIVE guidelines is still missing from most publications sampled. This includes details on randomisation (reported in only 30%–40% of publications), blinding (reported in only approximately 20% of publications)”
- **Prevalence** ([PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0007824), `lit-kilkenny2009-rand-blind`): “Most of the papers surveyed did not use randomisation (87%) or blinding (86%), to reduce bias in animal selection and outcome assessment.”

> Another requirement was that samples had to be blindly randomized before we analyzed them, so that nobody could manipulate the analytical process to get their desired result.
>
> — [news.ycombinator.com, 2022-04, former academic lab researcher (stated)](https://news.ycombinator.com/item?id=30989686) `hn-30989686-2`

> In recently submitted studies that do not currently comply with our requirements, it is often the case that we find all of the following: a lack of randomization and blinding, unequal group sizes, and statistical analysis applied when n is <5.
>
> — [British Journal of Pharmacology, 2018-03, peer-reviewed critique, pharmacology (journal guidance editorial with compliance audit)](https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/) `lit-curtis2018-triad`

> There is, however, open admission in the Nature article that current PIs often have not been trained in these methods themselves, so training cannot be expected to come from them.
>
> — [ascb.org, 2017-02, Executive Director, Future of Research (Gary McDowell, former bench scientist)](http://www.ascb.org/ascb-post/careers/who-should-be-training-trainees-on-reproducibility-and-ethics/) `blog-ascb-training-1`

- **Status: missing**. No blinding feature is listed in README or ROADMAP.
- **Gap:** Users rename groups by hand to blind themselves.
- **Proposal (M):** Add 'Blind this table': groups shown as codes until the user unblinds; exclusions made while blind are marked as such in the methods.

#### 136. Spread conditions across plates and days, and warn when group and batch coincide

`batch-confounding` · score **23.1** · 7 observations from 5 venues (Methods literature 3, Lab blogs 1, Statistics-consulting FAQs 1, Forums (image.sc, Bioconductor, Galaxy) 1, Stack Exchange 1) · severity: wrong result 6, slows 1 · signal: 1,571 page views; 9 votes/likes

> I suspect (and have some evidence) for row and column effects for this assay, and so row and column balance seems important.
>
> — [stats.stackexchange.com, 2023-02](https://stats.stackexchange.com/questions/604687) `stackexchange-stats-604687`

> If condition A was processed Monday and condition B was processed Thursday, you may not have a treatment effect. You may have a calendar effect. Batch is not always noise. Sometimes batch is the experiment.
>
> — [wildtypeone.substack.com, 2026-06, lab newsletter author (Wildtype One)](https://wildtypeone.substack.com/p/hard-biology-bench-truths-that-take) `blog-wildtypeone-truths-2`

> the heatmap shows the samples belonging to the same dataset as having the same expression profile, while the samples from different datasets seem to have different profiles.
>
> — [help.galaxyproject.org, 2025-05](https://help.galaxyproject.org/raw/15504) `galaxy-15504-1`

- **Status: partial**. Stratified randomisation lists exist (README › Clinical statistics) and the plate wizard checks edge effects; there is no randomised plate layout or confounding warning.
- **Gap:** No plate-layout randomiser; no check that each day contains every group.
- **Proposal (M):** Add a randomised plate-layout generator (blocks per plate, controls spread) and a check that warns when a group is processed on its own day or plate.

#### 153. Generate a recorded random allocation (simple, blocked, stratified)

`randomisation-allocation` · score **18.8** · 6 observations from 4 venues (Journal requirements 2, Methods literature 2, Statistics-consulting FAQs 1, Stack Exchange 1) · severity: wrong result 4, slows 2 · signal: 3,982 page views; 13 votes/likes

- **Prevalence** ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0007824), `lit-kilkenny2009-1`): “Random allocation of animals to experimental groups was reported in 12% of all 271 studies in the sample”
- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002273), `lit-macleod2015-2`): “while some mention of randomisation was present in 47 of 77 publications (61%), the method of randomisation was described in only 1 (3%).”

> This is very common in preclinical research using animals and cell cultures and the researchers commonly report p values in support of their conclusions.
>
> — [stats.stackexchange.com, 2013-11](https://stats.stackexchange.com/questions/74350) `stackexchange-stats-74350`

> The importance of ‘blinding’ throughout an experiment; studies that lack blinding can yield surprisingly biased results.
>
> — [biomedical-sciences.ed.ac.uk, course/consulting page, audience: biomedical science students and researchers (University of Edinburgh)](https://biomedical-sciences.ed.ac.uk/experimental-design-and-data-analysis/what-to-do-with-experiments/chapter-9) `consult-edinburgh-blinding-22`

> Selecting an animal ‘at random’ (i.e. haphazardly or arbitrarily) from a cage is not statistically random as the process involves human judgement. ... Inferential statistics based on non-randomised group allocation are not valid
>
> — [arriveguidelines.org, journal requirement, ARRIVE 2.0 Essential 10](https://arriveguidelines.org/arrive-guidelines/randomisation) `journal-arrive-rand-2`

- **Status: done**. README › Clinical statistics: 'a seeded randomisation list generator (simple, shuffled, permuted blocks, stratified) to CSV'.
- **Gap:** The list is not stored with the project or cited in methods.
- **Proposal (S):** Save the allocation (method, seed) to the project and print it in the methods.

#### 160. Power for nested, multi-group and other complex designs by simulation

`power-complex-designs` · score **16.4** · 7 observations from 4 venues (Statistics-consulting FAQs 3, Stack Exchange 2, Forums (image.sc, Bioconductor, Galaxy) 1, Software reviews 1) · severity: blocks 1, wrong result 1, slows 5 · signal: 2,008 page views; 7 votes/likes

- **Prevalence** ([bioinformatics.babraham.ac.uk](https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/Intro%20to%20statistics%20with%20GraphPad%20Prism%20slides.pdf), `consult-babraham-nonparam-power-8`): “Proper power calculations need to specify which kind of distribution we are dealing with – not easy ... Compute sample size required for a parametric test and add 15%”

> I'm just a biologist and not a statistician, so where possible, please use lay terms.
>
> — [stats.stackexchange.com, 2014-07, biologist (stated)](https://stats.stackexchange.com/questions/107907) `stackexchange-stats-107907`

> How can I estimate the minimum number of cells we should analyse per well?
>
> — [forum.image.sc, 2021-08](https://forum.image.sc/raw/56287) `imagesc-56287-1`

> a power analysis based on standard software can easily lead a researcher to design a study that has high power to detect a factor’s overall effect, but lower power when conducting post-hoc tests.
>
> — [biomedical-sciences.ed.ac.uk, course/consulting page, audience: biomedical science students and researchers (University of Edinburgh)](https://biomedical-sciences.ed.ac.uk/experimental-design-and-data-analysis/what-to-do-with-experiments/chapter-11) `consult-edinburgh-power-posthoc-15`

- **Status: partial**. Monte Carlo repeats a simulation and an analysis up to 10,000 times (README › Data tables, Simulations); ROADMAP open item: 'Monte Carlo power for user-defined models and designs the closed-form power tool does not cover'.
- **Gap:** No guided simulation power for nested (cells within animals) or rank-based designs.
- **Proposal (M):** Add simulation power presets: nested (animals × cells), Mann-Whitney/Kruskal-Wallis, Dunnett family — reusing the Monte Carlo engine.

#### 171. Don't compute 'observed power' after the fact; show the CI and a prospective calculation

`no-post-hoc-power` · score **10.8** · 3 observations from 3 venues (Statistics-consulting FAQs 1, Journal requirements 1, Non-English communities 1) · severity: wrong result 3 · signal: 304 page views

> 検定力が0.10と小さく、「差があるはずなのに、差がないと出てしまう」確率が高いはずです。
>
> — [chiebukuro.yahoo.co.jp, 2019-09, food analysis researcher](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q12213029872) `nonen-ja-n3-power-1` *(Gloss: 'Power is only 0.10, so the chance that it says no difference even though there should be one must be high.' — Problem: with n=3 and p=0.50 does not know whether 'no significant difference' can be stated.)*

> The idea is to show that a “non-significant” hypothesis test failed to achieve significance because it wasn’t powerful enough.
>
> — [library.virginia.edu, course/consulting page, audience: university researchers who consult the UVA Library StatLab](https://library.virginia.edu/data/articles/post-hoc-power-calculations-are-not-useful) `consult-uva-posthoc-power-26`

> 25. Using confidence intervals rather than post-hoc power analysis for interpreting the results of studies
>
> — [eprints.whiterose.ac.uk, 2021, journal requirement, CHAMP statistical checklist (BMJ / BJSM)](https://eprints.whiterose.ac.uk/175755/3/CHAMP-statement.pdf) `journal-champ-3`

- **Status: partial**. README › Power: the tool reports 'a priori n, achieved power or detectable effect'; nothing states that achieved power must not use the observed effect.
- **Gap:** Risk that users compute power from their own observed effect after a non-significant result.
- **Proposal (S):** Label 'achieved power' as 'power for a planned effect' and, from results sheets, offer only the detectable effect and the CI.

### qPCR

5 needs, 112 observations.

#### 15. ΔΔCt from the instrument export to fold change and statistics, with the reference and direction stated

`qpcr-ddct-workflow` · score **70.9** · 41 observations from 10 venues (YouTube comments 15, Stack Exchange 13, Forums (image.sc, Bioconductor, Galaxy) 3, Statistics-consulting FAQs 2, GitHub issues 2, Methods literature 2) · severity: blocks 6, wrong result 19, slows 15, cosmetic 1 · signal: 31,324 page views; 82 votes/likes; 973,053 views of the videos commented on

- **Prevalence** ([International Journal of Molecular Sciences](https://pmc.ncbi.nlm.nih.gov/articles/PMC12154065/), `lit-bustin2025miqe2-foldchange`): “Fold-changes of 1.2- or 1.5-fold are routinely reported as biologically meaningful, even at low expression levels, without any assessment of measurement uncertainty or technical variance [ 14 , 15 ].”

> I have all my data in an excel sheet (approx. 350 samples and their replicates). Each row is a sample and each column states the gene, treatment, Ct values, etc. How do I load this information into R and make the readCtData function to work.
>
> — [support.bioconductor.org, 2016-03, new R user (stated)](https://support.bioconductor.org/p/79067/) `bioc-79067-1`

> I have some data and I want to calculate the copy number of them.
>
> — [biology.stackexchange.com, 2023-09](https://biology.stackexchange.com/questions/113005) `stackexchange-biology-113005`

> But what about having one sample (calibrator) that is usually used to calculate the fold changeby normalising everything to it?
>
> — [youtube.com, 2020-10](https://www.youtube.com/watch?v=Kkle8T7aXjk&lc=UgxcQjoCUg6HlfXrE-B4AaABAg) `youtube-Kkle8T7aXjk-UgxcQjoCUg6HlfXrE-B4AaABAg`

- **Status: done**. README › Assay modules: qPCR wizard (technical-replicate QC, several reference genes, efficiencies, statistics on ΔCq, fold changes with asymmetric CIs on a log2 axis; exports read whatever the instrument calls its columns).

#### 45. Run qPCR statistics on ΔCt and back-transform fold changes with asymmetric error bars

`qpcr-stats-log-scale` · score **55.7** · 23 observations from 7 venues (YouTube comments 9, Stack Exchange 6, Non-English communities 3, Lab blogs 2, Forums (image.sc, Bioconductor, Galaxy) 1, GitHub issues 1) · severity: blocks 3, wrong result 17, slows 2, cosmetic 1 · signal: 36,987 page views; 48 votes/likes; 881,610 views of the videos commented on

- **Prevalence** ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC12154065/), `journal-miqe2-2`): “Fold-changes of 1.2- or 1.5-fold are routinely reported as biologically meaningful, even at low expression levels, without any assessment of measurement uncertainty or technical variance”

> How would you go about calculating the error for 2^ΔΔCт?
>
> — [youtube.com, 2018-10](https://www.youtube.com/watch?v=Kkle8T7aXjk&lc=UgxnMTMlhU-8nJod1_94AaABAg) `youtube-Kkle8T7aXjk-UgxnMTMlhU-8nJod1_94AaABAg`

> Meaning, that I think it is really best to analyze the data on the $C_t$ scale, not after transforming to the multiplicative scale.
>
> — [stats.stackexchange.com, 2014-10, answerer (accepted answer)](https://stats.stackexchange.com/a/126352) `stackexchange-stats-120821-a126352`

> 我仔细看了下仪器的分析结果，好像它的error bar用的是RQ max和RQ min，所以请问一下，这里的error bar难道不是用SD么？
>
> — [muchong.com, 2012-09, clinical-sample qPCR researcher](https://muchong.com/t-4936959-1) `nonen-zh-qpcr-errorbar-1` *(Gloss: 'The instrument's error bars appear to use RQmax and RQmin — shouldn't error bars be SD?' — Problem: does not know how to carry SD of ΔCt onto 2^-ΔΔCt bars (gets bars larger than the bar height).)*

- **Status: done**. README › Assay modules: qPCR 'statistics on ΔCq, fold changes with asymmetric CIs on a log2 axis (MIQE 2.0)'.

#### 53. Primer efficiency from a dilution series and efficiency-corrected (Pfaffl) quantification

`qpcr-efficiency` · score **52.4** · 22 observations from 8 venues (Stack Exchange 9, Methods literature 5, Lab blogs 2, YouTube comments 2, Statistics-consulting FAQs 1, Forums (image.sc, Bioconductor, Galaxy) 1) · severity: blocks 1, wrong result 16, slows 5 · signal: 7,955 page views; 21 votes/likes; 304,257 views of the videos commented on

- **Prevalence** ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0088266), `lit-abdelnour2014-2`): “Unfortunately, PCR efficiency and assay specificity were characterised by inadequate reporting at 24% and 34%, respectively.”
- **Prevalence** ([Molecular Oncology](https://pmc.ncbi.nlm.nih.gov/articles/PMC5528534/), `lit-dijkstra2014-valid3`): “Using even these minimal evaluation criteria, the validity of only three percent (6/179) of the publications can be adequately assessed.”

> Is it possible to use gene specific efficiencies? In the vingnette it is mentioned that it is possible to use them but I have no clue where to change the default parameter
>
> — [support.bioconductor.org, 2020-02](https://support.bioconductor.org/p/128662/) `bioc-128662-1`

> I'm actually getting different fold changes when I use the Livak method or the deltaCt method. Does anyone know what this could mean? Is it an indication of my reaction efficiency?
>
> — [youtube.com, 2020-10](https://www.youtube.com/watch?v=tgp4bbnj-ng&lc=Ugzq6kPRCvF0EbebRud4AaABAg) `youtube-tgp4bbnj-ng-Ugzq6kPRCvF0EbebRud4AaABAg`

> Yesterday, I attempted to perform a qPCR (SYBR green), and the efficiency was -100%.
>
> — [biology.stackexchange.com, 2024-02](https://biology.stackexchange.com/questions/114209) `stackexchange-biology-114209`

- **Status: done**. README › Assay modules: qPCR wizard 'efficiencies'; ROADMAP › Theme 3: 'ΔCt and ΔΔCt with efficiency correction'.

#### 68. Several reference genes with a stability check before normalising

`qpcr-reference-genes` · score **47.3** · 18 observations from 6 venues (Stack Exchange 8, Methods literature 5, Forums (image.sc, Bioconductor, Galaxy) 2, Statistics-consulting FAQs 1, Hacker News 1, YouTube comments 1) · severity: blocks 3, wrong result 14, slows 1 · signal: 5,938 page views; 17 votes/likes; 352,004 views of the videos commented on; 26 HN thread points

- **Prevalence** ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0088266), `lit-abdelnour2014-1`): “Unfortunately, the vast majority of publications use a single reference gene that has not been validated: only 29 papers normalised the expression of their genes of interest to two genes, and only 15 papers used more than two genes.”
- **Prevalence** ([Molecular Oncology](https://pmc.ncbi.nlm.nih.gov/articles/PMC5528534/), `lit-dijkstra2014-single-ref`): “In 92% of the publications, only a single reference gene was used.”

> In the laboratory we have a Biorad RT-PCR. I can export the file generated from the Biorad software onto Exel. ... - how can you perform a t-test using the data?
>
> — [support.bioconductor.org, 2013-09, student (stated)](https://support.bioconductor.org/p/54753/) `bioc-54753-1`

> how do I calculate delta-delta Ct using 2 housekeeping genes? I'm using 18S and beta-actin genes.
>
> — [youtube.com, 2018-10](https://www.youtube.com/watch?v=Kkle8T7aXjk&lc=UgyWFghSwArfAWDe_NV4AaABAg) `youtube-Kkle8T7aXjk-UgyWFghSwArfAWDe_NV4AaABAg`

> The problem is that my housekeeping gene (UBQ 30) got a fold change on the treatment.
>
> — [biology.stackexchange.com, 2014-03](https://biology.stackexchange.com/questions/15897) `stackexchange-biology-15897`

- **Status: partial**. ROADMAP › Theme 3: 'geometric mean of reference genes'; no geNorm/NormFinder-style stability measure is listed.
- **Gap:** Reference-gene stability across conditions is not checked.
- **Proposal (M):** Show each reference gene's Cq across groups with a stability measure (geNorm M or the SD of ΔCq between references) and warn when a reference shifts with treatment.

#### 115. Explicit rules for Undetermined Cts, no-template controls and discordant technical wells

`qpcr-qc-nondetects` · score **29.6** · 8 observations from 4 venues (YouTube comments 4, Forums (image.sc, Bioconductor, Galaxy) 2, Statistics-consulting FAQs 1, Stack Exchange 1) · severity: blocks 2, wrong result 5, slows 1 · signal: 1,850 page views; 13 votes/likes; 769,723 views of the videos commented on

> How to do the calculation when you are using target genes with zero expression in your control?
>
> — [youtube.com, 2023-10](https://www.youtube.com/watch?v=Uj0uDpNgc7U&lc=UgxsAw81bcbd_n2zpod4AaABAg) `youtube-Uj0uDpNgc7U-UgxsAw81bcbd_n2zpod4AaABAg`

> Can I use these results to indicate that my transcript exists (or even may exist?) in the samples I tested?
>
> — [biology.stackexchange.com, 2015-07](https://biology.stackexchange.com/questions/36176) `stackexchange-biology-36176`

> Can nondetects impute a dataset that includes technical replicates? Or do you just toss the replicates that don't work and use the geometric mean of anything remaining?
>
> — [support.bioconductor.org, 2023-11](https://support.bioconductor.org/p/9155044/) `bioc-9155044-1`

- **Status: partial**. ROADMAP › Theme 3: 'technical-replicate averaging with Ct flags'; no stated rule for Undetermined wells or NTC amplification.
- **Gap:** Undetermined Cts and NTC/RT− wells have no explicit rule.
- **Proposal (S):** In the qPCR wizard, ask how to treat 'Undetermined' (exclude, or censor at the cycle cut-off) and flag NTC/RT− amplification and late Cts before ΔΔCt.

### Reporting: P values, effect sizes, methods and legends

12 needs, 247 observations.

#### 16. Name the exact test variant: paired or not, Welch, tails, exact or approximate

`test-variant-named` · score **68.9** · 35 observations from 11 venues (GitHub issues 10, GraphPad support pages 5, Statistics-consulting FAQs 4, Methods literature 4, Stack Exchange 4, Journal requirements 3) · severity: wrong result 27, slows 6, cosmetic 2 · signal: 10,165 page views; 19 votes/likes; 217,560 views of the videos commented on; 182 HN thread points

- **Prevalence** ([Scientific Reports](https://pmc.ncbi.nlm.nih.gov/articles/PMC7870941/), `lit-gosselin2021-laterality`): “The most frequently used tests were one way analysis of variance (ANOVA; used in 53.15% of articles, k = 223 articles), two way ANOVA (28.83%), repeated measure one way ANOVA (9.46%), unpaired Student’s t test (38.74%) and Student’s t test of undefined laterality (26.83% of articles).”
- **Prevalence** ([PLOS One](https://pmc.ncbi.nlm.nih.gov/articles/PMC5597130/), `lit-han2017-1`): “However, whether the statistical tests used were one-sided or two-sided was not reported in approximately 50%”

> The p-values I get for the pairwise comparisons (unadjusted for multiple comparisons) are exactly half what I get in SPSS and GraphPad for the same data.
>
> — [stats.stackexchange.com, 2015-07, writing a PhD thesis in biomedical research (stated)](https://stats.stackexchange.com/questions/160634) `stackexchange-stats-160634`

> The _p_-values from `dunn.test` and `rstatix` don't match up, and I am not sure why there is this discrepancy.
>
> — [github.com/kassambara/rstatix, 2020-05, PhD social neuroscience, AI engineer (GitHub bio)](https://github.com/kassambara/rstatix/issues/50) `github-rstatix-50-1`

> Is the specific type of t test (paired/unpaired; 1/2-tailed, one sample) defined for each use?
>
> — [elsevier.com, journal requirement, Journal of Biological Chemistry (data presentation checklist)](https://legacyfileshare.elsevier.com/promis_misc/jbc-checklist.pdf) `journal-jbc-checklist-2`

- **Status: done**. README › Reporting: legend states 'test and sidedness'; ROADMAP: exact / approximate P labels for rank tests; t printed with its sign and the direction (A − B). Open: one-tailed P for t tests.

#### 36. Effect sizes with confidence intervals next to every P value

`effect-size-ci` · score **59.4** · 29 observations from 10 venues (GitHub issues 8, Methods literature 5, Journal requirements 4, Lab blogs 2, Courses and workshops 2, Hacker News 2) · severity: blocks 2, wrong result 16, slows 10, cosmetic 1 · signal: 615 page views; 5 votes/likes; 182,811 views of the videos commented on; 283 HN thread points

- **Prevalence** ([Biology Letters](https://pmc.ncbi.nlm.nih.gov/articles/PMC6548726/), `lit-halsey2019-1`): “dichotomously as ‘significant’ or ‘not significant’ is particularly egregious for many reasons, but most pertinent here is that this approach encourages failed experiment replication. ... while the probability of one of these studies returning p ≤ 0.05 and the other not is 2 × 80% × 20% = 32%.”
- **Prevalence** ([Naunyn-Schmiedeberg's Archives of Pharmacology](https://pmc.ncbi.nlm.nih.gov/articles/PMC4203998/), `lit-motulsky2014-fpr5`): “Many scientists mistakenly believe that the chance of making a false positive conclusion is 5 %. In fact, in many situations, the chance of making a type I false positive conclusion is much higher than 5 %”

> Sometimes we we want to test if the difference is in population means is equal to a value(not necessarily 0).
>
> — [github.com/kassambara/rstatix, 2023-11, developer / data analyst (GitHub bio)](https://github.com/kassambara/rstatix/issues/200) `github-rstatix-200-1`

> Rather than crunch for significance, could one get away with showing things like confidence intervals, eta^2, Cohen's d, and r values instead over P values?
>
> — [biology.stackexchange.com, 2013-03](https://biology.stackexchange.com/questions/7505) `stackexchange-biology-7505`

> On the flipside, I've seen experiments where they are showing that one population of neurons is 2% more dynamic than another population, and sometimes you just wonder if that really matters at all (or if you are really sampling the population well enough)
>
> — [news.ycombinator.com, 2011-11](https://news.ycombinator.com/item?id=3286408) `hn-3286408`

- **Status: done**. README › Reporting: 'Effect sizes with 95% CIs on every comparison (Cohen's d / Hedges' g, Glass's Δ, d_z, η², …)'.

#### 55. Print the exact n per group (after exclusions and missing values) with its unit

`n-in-output` · score **52.0** · 20 observations from 9 venues (Journal requirements 6, Methods literature 5, GitHub issues 3, Lab blogs 1, Competitor trackers 1, Statistics-consulting FAQs 1) · severity: blocks 2, wrong result 13, slows 5 · signal: 226,702 views of the videos commented on

- **Prevalence** ([British Journal of Pharmacology](https://pmc.ncbi.nlm.nih.gov/articles/PMC7393193/), `lit-bjp2020-1`): “As an example, one systematic review of reports of studies investigating acute lung injury revealed that, of the items expected for ARRIVE compliance, only 45% of those advised for inclusion in the Methods, and only 29% of those for inclusion in the Results section, were present”
- **Prevalence** ([Scientific Reports](https://pmc.ncbi.nlm.nih.gov/articles/PMC7870941/), `lit-gosselin2021-1`): “Insufficient disclosure of tests (median 44.8%, interquartile range (IQR) [33.3–62.5%], k = 16 journals), packages (median 31%, IQR [22.3–39.6%], k = 16) and exact sample sizes (median 44.2%, IQR [35.7–55.4%]), k = 16) occurred particularly frequently.”

> I analyzed these data and inaccurately pasted the data into the analysis software, leading to an incorrect grouping of the data.
>
> — [retractionwatch.com, 2024-03, PI, biomedical (quoted in Retraction Watch)](https://retractionwatch.com/2024/03/08/how-a-sleuths-email-turned-a-correction-into-a-retraction) `blog-retractionwatch-paste-1`

> Je mesure la taille de différents embryons clonés, mais je ne sais pas quel test statistiques utiliser pour montrer qu'il y a une différence ou non.
>
> — [forums.futura-sciences.com, 2010-12, cell biology researcher (cloned embryos)](https://forums.futura-sciences.com/biologie/443336-test-statistique-petits-echantillons.html) `nonen-fr-embryos-small-n-1` *(Gloss: 'I measure the size of different cloned embryos but don't know which statistical test to use to show whether there is a difference.' — Problem: only two samples per clone; test choice with tiny n.)*

> when defining value 9999 as a missing value, both in system preferences as per variable, it is STILL counted as a numerical value in every analysis I do. This can not be right.
>
> — [github.com/jasp-stats/jasp-issues, 2026-09](https://github.com/jasp-stats/jasp-issues/issues/4536) `github-jasp-4536-1`

- **Status: done**. README › Reporting: legend gives 'n with its unit and independent experiments'; sheets README: n from Reporting details or the replicate map.

#### 58. Generate the methods / statistical-analysis paragraph from what I actually ran

`methods-text` · score **49.8** · 24 observations from 10 venues (Methods literature 5, Courses and workshops 4, Competitor trackers 3, Statistics-consulting FAQs 3, GitHub issues 3, GraphPad support pages 2) · severity: wrong result 14, slows 8, cosmetic 2 · signal: 239 page views; 7 votes/likes; 182 HN thread points

- **Prevalence** ([Scientific Reports](https://pmc.ncbi.nlm.nih.gov/articles/PMC7870941/), `lit-gosselin2021-software`): “The most frequently used software was determined to be Prism (mentioned in 59.01% of publications, k = 223) and SPSS (16.22%).”
- **Prevalence** ([PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0007824), `lit-kilkenny2009-methods-error`): “Only 70% of the publications that used statistical methods described their methods and presented the results with a measure of error or variability.”

> Does anyone know the method of multiple comparison procedure in stat_compare_means() - t-test? I used this for the graph; I need to write exactly what it is.
>
> — [github.com/kassambara/ggpubr, 2018-01, PhD student, human medicine bioinformatics (GitHub bio)](https://github.com/kassambara/ggpubr/issues/65) `github-ggpubr-65-2`

> So, for example, if I performed DEseq this way, and I got -2 log fold change for a gene, that would mean that that gene was down regulated by 2 log fold in my "A+B" group or upregulated by 2 log fold change in my "A" group?
>
> — [help.galaxyproject.org, 2024-09](https://help.galaxyproject.org/raw/13546) `galaxy-13546-1`

> One concern of mine is that real knowledge in quantitative methods is scarce and yet as it permeates mainstream biology, there is a lack of prepared peer reviewers.
>
> — [quantixed.org, 2016-06, commenter](https://quantixed.org/2016/06/15/the-digital-cell/) `blog-quantixed-digitalcell-1`

- **Status: done**. README › Reporting: 'the methods text and a "Statistical analysis" paragraph' under each results sheet, plus equivalent R and Python code.

#### 67. Draft the figure legend from the graph: what is plotted, error bars, n and test

`figure-legend` · score **47.3** · 23 observations from 8 venues (Journal requirements 9, Methods literature 6, Stack Exchange 3, Lab blogs 1, Competitor trackers 1, Courses and workshops 1) · severity: wrong result 14, slows 4, cosmetic 5 · signal: 66,231 page views; 15 votes/likes; 702,574 views of the videos commented on

- **Prevalence** ([Scientific Reports](https://pmc.ncbi.nlm.nih.gov/articles/PMC7870941/), `lit-gosselin2021-contradictory`): “A notable proportion of articles (median 18.3%, IQR [6.79–26.7%]), k = 16) present contradictory information. A contradiction is defined as a mismatch between information provided in different parts of the manuscript although they refer to the same object, such as the disclosure of dissimilar statistical tests (in methods and figure legends)”
- **Prevalence** ([Circulation](https://pmc.ncbi.nlm.nih.gov/articles/PMC8947810/), `lit-weissgerber2019reveal-se-bars`): “In most bar graphs in our sample, error bars show the standard error (66.3%) rather than the standard deviation (20.9%) or 95% confidence interval (2.3%).”

> Please clarify/advise: Standard deviation quantifies how much a data entry deviates from the mean, within a data set.
>
> — [youtube.com, 2019-10](https://www.youtube.com/watch?v=A82brFpdr9g&lc=UgxSB2Wwudh6UpdbWLp4AaABAg) `youtube-A82brFpdr9g-UgxSB2Wwudh6UpdbWLp4AaABAg`

> If I plot a symmetrical errorbar (let's say SEM = 0.5), should it show 0.5 on each side, or 0.25 (half) on each side?
>
> — [stats.stackexchange.com, 2018-06](https://stats.stackexchange.com/questions/353276) `stackexchange-stats-353276`

> Sadly, 65% of papers published in 2015 reported the SEM to (presumably) summarize data variability, while another 12.5% of papers included figures with error bars that were not defined (!).
>
> — [scientificallysound.org, 2016-10, neuroscience researcher (Martin Heroux, blog author)](https://scientificallysound.org/2016/10/24/poor-statistical-practices/) `blog-scisound-poorstats-1`

- **Status: done**. README › Reporting: 'the figure legend (what is plotted, n with its unit and independent experiments, test and sidedness, post hoc and correction, star scale, software version)'.

#### 89. Exact P values everywhere, formatted to my journal's style

`exact-p` · score **37.5** · 37 observations from 9 venues (GitHub issues 11, GraphPad support pages 7, Methods literature 7, Journal requirements 5, Forums (image.sc, Bioconductor, Galaxy) 2, Stack Exchange 2) · severity: wrong result 19, slows 6, cosmetic 12 · signal: 575 page views; 10 votes/likes

- **Prevalence** ([PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0202121), `lit-diong2018-sem-exactp`): “Overall, 76-84% of papers with written measures that summarized data variability used standard errors of the mean, and 90-96% of papers did not report exact p-values for primary analyses and post-hoc tests.”
- **Prevalence** ([eLife](https://pmc.ncbi.nlm.nih.gov/articles/PMC6326723/), `lit-weissgerber2018elife-pranges`): “Moreover, 79.7% of the papers that included t-tests reported ranges of p-values instead of exact p-values.”

> I get different results if I want to adjust the p-values downstream of performing the t-test and would prefer if the p-values where not rounded before
>
> — [github.com/kassambara/rstatix, 2025-06](https://github.com/kassambara/rstatix/issues/219) `github-rstatix-219-1`

> With small sample sizes there can be differences in how the p-value is computed: exact, asymptotic, and Monte Carlo.
>
> — [stackoverflow.com, 2021-10, commenter](https://stackoverflow.com/questions/69629089) `stackexchange-stackoverflow-69629089-c`

> Few genes are highly expressed and at the same time have p-value equal to 0; thus, these genes are depicted in the corresponding Volcano at the very top ... Should I exclude these particular genes from the input that I am going to use for the Volcano?
>
> — [help.galaxyproject.org, 2022-10](https://help.galaxyproject.org/raw/8873) `galaxy-8873-1`

- **Status: done**. README › Reporting: one P-value style for the project (GraphPad, APA 7, NEJM) used by tables, sentences, legends and brackets; Preferences: exact-P floor down to 1e-10 or none.

#### 101. Estimation plots: the difference and its CI with all the data

`estimation-plots` · score **34.8** · 16 observations from 9 venues (GitHub issues 3, Methods literature 3, Lab blogs 2, Courses and workshops 2, GraphPad support pages 2, Competitor trackers 1) · severity: blocks 1, wrong result 5, slows 9, cosmetic 1 · signal: 2,458 page views; 24 votes/likes

- **Prevalence** ([Journal of Cell Biology](https://pmc.ncbi.nlm.nih.gov/articles/PMC2064100/), `lit-cumming2007-3`): “Error bars can only be used to compare the experimental to control groups at any one time point. Whether the error bars are 95% CIs or SE bars, they can only be used to assess between group differences (e.g., E1 vs. C1, E3 vs. C3), and may not be used to assess within group differences, such as E1 vs. E2.”

> Can dabestr create estimation plots for categorical outcomes?
>
> — [github.com/ACCLAB/dabestr, 2022-02, psychologist, PhD (GitHub bio)](https://github.com/ACCLAB/dabestr/issues/131) `github-dabestr-131-1`

> Therefore, p-values fail to answer a very relevant question: "How large is the difference between the conditions?"
>
> — [thenode.biologists.com, 2018-10, researcher, molecular cytology (Joachim Goedhart)](https://thenode.biologists.com/quantification-of-differences-as-alternative-for-p-values/research/) `blog-thenode-effectsize-1`

> However, current estimation tools struggle with the complex, multi-group comparisons common in biological research. ... There's institutional-wide need for change in the biological sciences when it comes to statistical handling of data.
>
> — [mathstodon.xyz, 2026-01, Group leader, MRC LMB / Professor, Cambridge, neuroscience (bio)](https://mathstodon.xyz/@albertcardona/115977601390005740) `mastodon-mathstodon.xyz-115977601390005740`

- **Status: done** (met, but hard to find). README › Statistics: 'Estimation plots (Gardner-Altman and Cumming) with BCa or percentile bootstrap CIs and permutation P values'.
- **Gap:** Reached through Analyze → Estimation plot; nothing proposes it next to a t test.
- **Proposal (S):** Add 'Show as estimation plot' to every two-group and multi-group result.

#### 107. Word non-significant results honestly (inconclusive, with the CI), never 'trend'

`nonsig-wording` · score **33.2** · 15 observations from 7 venues (Statistics-consulting FAQs 5, Methods literature 4, GitHub issues 2, Lab blogs 1, Courses and workshops 1, Journal requirements 1) · severity: wrong result 14, slows 1 · signal: 5 votes/likes

- **Prevalence** ([PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0202121), `lit-diong2018-spin`): “Of papers that reported p-values between 0.05 and 0.1, 56-63% interpreted these as trends or statistically significant.”
- **Prevalence** ([dag.compbio.dundee.ac.uk](https://dag.compbio.dundee.ac.uk/workshops/statistics_lectures/14_What_is_wrong.pdf), `consult-dundee-fdr-36`): “If you publish a p<0.05 result, you have a 36% chance of making a fool of yourself”

> Every few days I have the urge to contact authers to tell them, that their p-value being bigger than .05 does NOT mean that there is no effect.
>
> — [ecoevo.social, 2024-12, Doctoral researcher, forest ecosystem science (bio)](https://ecoevo.social/@tillmanreuter/113635240001971348) `mastodon-ecoevo.social-113635240001971348`

> However, the visualization of the effect size does not change despite I set "paired" to TRUE.
>
> — [github.com/ACCLAB/dabestr, 2021-12](https://github.com/ACCLAB/dabestr/issues/127) `github-dabestr-127-1`

> For experimental outcomes, this false dichotomy constrains interpretation to the presence or absence of an effect, instead of a more meaningful consideration of effect size
>
> — [research.a-star.edu.sg, PI, molecular and cell biology (Adam Claridge-Chang, quoted)](https://research.a-star.edu.sg/articles/highlights/the-p-value-is-dead-long-live-the-estimation-plot/) `blog-astar-estimation-1`

- **Status: partial**. README › Reporting generates results sentences, but neither README nor explainers.ts states how non-significant results are worded.
- **Gap:** Wording rules for P > alpha are not documented or checked.
- **Proposal (S):** Make generated sentences for P > alpha say 'not detected (difference X, 95% CI a to b)' and never 'trend' or 'no difference'; add an explainer.

#### 109. Capture randomisation, blinding, exclusions, sample-size rationale and subject details, and print them in methods

`design-reporting-capture` · score **32.3** · 22 observations from 4 venues (Journal requirements 10, Methods literature 10, Statistics-consulting FAQs 1, Mastodon / fediverse 1) · severity: blocks 5, wrong result 9, slows 7, cosmetic 1 · signal: 97 votes/likes

- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1001756), `lit-baker2014-randomisation`): “We found that the percentage of studies, in the two years after endorsement of the ARRIVE guidelines, reporting blinding in their experimental design was similar to that in past surveys (20% in PLOS journals and 21% in Nature journals); however, fewer than 10% of the relevant studies in either Nature or PLOS journals reported randomisation (10% in PLOS journals and 0% in Nature journals), and even fewer mentioned any power/sample size analysis”
- **Prevalence** ([British Journal of Pharmacology](https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/), `lit-curtis2018-1`): “Table 1 illustrates that the outcome has not been as successful as we had hoped. Table 1. Many papers published in BJP do not adhere to all the journal's guidance”

> After students asked for one for years, I have now made a simple figure design checklist. To help all scientists w/o graphic design training create clearer, more accessible, and truthful charts!
>
> — [mastodon.social, 2025-06, Data visualisation researcher, biology/cancer (bio)](https://mastodon.social/@helenajambor/114703376391404539) `mastodon-mastodon.social-114703376391404539`

> In recently submitted studies that do not currently comply with our requirements, it is often the case that we find all of the following: a lack of randomization and blinding, unequal group sizes, and statistical analysis applied when n is <5. Together, these render a paper fundamentally flawed, and, as Figure 1 indicates, this will now result in triage rejection.
>
> — [pmc.ncbi.nlm.nih.gov, 2018, journal requirement, British Journal of Pharmacology](https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/) `journal-bjp-design-8`

> Table 1 illustrates that the outcome has not been as successful as we had hoped. Table 1. Many papers published in BJP do not adhere to all the journal's guidance
>
> — [British Journal of Pharmacology, 2018-03, peer-reviewed editorial with compliance audit, pharmacology](https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/) `lit-curtis2018-1`

- **Status: partial**. README › Reporting: journal checklists (Nature, eLife, Cell STAR, SAMPL, ARRIVE items 1–3, 7, 10) ticked from the project and the power tool's justification sentence; ARRIVE items 4 (randomisation) and 5 (blinding) are not covered.
- **Gap:** No fields for randomisation method, blinding stages, sex/strain or exclusion criteria.
- **Proposal (S):** Add a 'Study design' info sheet (randomisation method and seed, blinding stages, exclusion criteria, sex/strain/age) that feeds the methods paragraph and ARRIVE items 4–6 and 8.

#### 110. A copy-ready results sentence with the statistic, df and exact P

`results-sentence` · score **31.7** · 10 observations from 7 venues (Methods literature 3, Stack Exchange 2, Statistics-consulting FAQs 1, Courses and workshops 1, GitHub issues 1, Journal requirements 1) · severity: wrong result 6, slows 3, cosmetic 1 · signal: 24,567 page views; 17 votes/likes

- **Prevalence** ([BMC Medical Research Methodology](https://pmc.ncbi.nlm.nih.gov/articles/PMC443510/), `lit-garcia2004-1`): “11.6% (21 of 181) and 11.1% (7 of 63) of the statistical results published in Nature and BMJ respectively during 2001 were incongruent, probably mostly due to rounding, transcription, or type-setting errors.”
- **Prevalence** ([eLife](https://pmc.ncbi.nlm.nih.gov/articles/PMC6326723/), `lit-weissgerber2018-6`): “Most of the papers (95.7%; 156/163) did not report the t-statistic (column 2) and over two-thirds (69.3%; 113/163) did not report exact p-values”

> Why does it halve it when there is a Geisser-Greenhouse correction for sphericity?
>
> — [stats.stackexchange.com, 2020-08](https://stats.stackexchange.com/questions/481048) `stackexchange-stats-481048`

> GraphPadPrismの結果Hill係数の部分に、UpperとEstの結果を逆に示すという誤りがあったため修正した。
>
> — [qiita.com, 2022-03, lab member teaching a junior how to get IC50](https://qiita.com/Yomiyama1998/items/14343814d08b0a3a3f0b) `nonen-ja-qiita-hill-misread-1` *(Gloss: 'Corrected an error where, for the GraphPad Prism result, I had swapped the Upper and Est values for the Hill coefficient.' — Problem: even an experienced user mis-transcribed fit output (estimate vs CI bound) when moving results between tools.)*

> Once you have finished writing up your results chapter, your consultant will be able to read through it to ensure that the statistical results are correctly written up and interpreted.
>
> — [rd.mandela.ac.za, course/consulting page, audience: Nelson Mandela University postgraduates and researchers (Unit for Statistical Consultation FAQ)](https://rd.mandela.ac.za/Unit-for-Statistical-Consultation/FAQs) `consult-mandela-interpret`

- **Status: done**. README › Reporting: 'Under each results sheet: a results sentence' in APA, NEJM or GraphPad style.

#### 168. Cite the software and its version in every export

`software-citation` · score **12.0** · 9 observations from 5 venues (Journal requirements 5, Competitor trackers 1, Methods literature 1, Non-English communities 1, Software reviews 1) · severity: wrong result 1, slows 7, cosmetic 1 · signal: no engagement counts on these pages

> All statistical analyses in BioRender Graphing are computed in R, using documented packages and functions.
>
> — [biorender.com](https://biorender.com/product/graph) `competitor-biorender-14`

> 现在我面临的问题就是数据用GraphpadPrism处理，会不会承认可信度？
>
> — [muchong.com, 2011-10](https://muchong.com/bbs/search.php?wd=graphpad&fid=0&search_type=&adfilter=0&order=2&mode=5&page=4) `nonen-zh-journal-accept-1` *(Gloss: 'My problem now is: if the data are processed with GraphPad Prism, will (SCI journals) accept its credibility?' — Problem: unsure whether reviewers trust the tool's statistics. (thread body is login-walled; quote is the public snippet shown on the site's own search-results page))*

> Please provide a version of the software.
>
> — [elifesciences.org, journal requirement, eLife](https://reviewer.elifesciences.org/author-guide/full) `journal-elife-guide-6`

- **Status: done**. README › Reporting: 'How to cite' with the app and SciPy / NumPy versions; version stamped in methods.

#### 170. One statistics table for every test in the project (figure panel, test, n, statistic, df, exact P, CI)

`stats-table-export` · score **11.5** · 7 observations from 3 venues (Journal requirements 5, Methods literature 1, Non-English communities 1) · severity: blocks 1, slows 6 · signal: 502 page views

- **Prevalence** ([physoc.org](https://www.physoc.org/news_article/a-change-to-experimental-physiologys-statistics-policy/), `journal-physoc-news-1`): “However, there was a general consensus that the ‘duplication’ of work required to complete and check this summary document was an unnecessary burden on both time and resources, that did not provide significant benefit.”

> Tenho várias análises do teste de Tukey feitas no R e gostaria de transformar as tabelas obtidas em tabelas com o aspecto que se pode ver na imagem. Existe alguma forma mais ou menos automática para fazer isso?
>
> — [pt.stackoverflow.com, 2019-08](https://api.stackexchange.com/2.3/questions/288975;498352;404181?site=pt.stackoverflow&filter=withbody) `nonen-pt-tukey-table-1` *(Gloss: 'I have several Tukey analyses done in R and would like to turn the tables into tables that look like the image. Is there a more or less automatic way?' — Problem: publication-style post-hoc tables require manual formatting.)*

> These requirements include, but are not limited to: (1) providing a statistical summary document for revised research articles, which is included as Supporting Information in the published paper; (2) using SD, not SEM (unless clearly justified and exempted); (3) providing mean and SD values in the text and statistical summary document; (4) providing precise
>
> — [pmc.ncbi.nlm.nih.gov, 2023-04, journal requirement, Experimental Physiology / Journal of Physiology (statistics policy)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10988475/) `journal-physoc-policy-1`

> However, there was a general consensus that the ‘duplication’ of work required to complete and check this document was an unnecessary and excessive time burden.
>
> — [Experimental Physiology, 2023-04, peer-reviewed critique, physiology journal statistics policy editorial](https://pmc.ncbi.nlm.nih.gov/articles/PMC10988475/) `lit-expphysiol2023-burden`

- **Status: partial**. The export bundle includes results CSV and results sentences (README › Sharing, export and trust); no single project-wide statistics table keyed by figure panel is listed.
- **Gap:** Journals (eLife, Physiological Society, eNeuro) ask for one table of all tests; users assemble it by hand.
- **Proposal (S):** Add 'Statistics table' to the export bundle and the Save menu: one row per comparison across the project with figure/panel, test, n, statistic, df, exact P, effect size and CI.

### Western blots, images and densitometry

5 needs, 113 observations.

#### 17. From band intensities to normalised fold change and statistics in one place

`wb-densitometry-workflow` · score **68.4** · 49 observations from 9 venues (Stack Exchange 11, YouTube comments 9, Journal requirements 8, Software reviews 8, Forums (image.sc, Bioconductor, Galaxy) 5, Non-English communities 3) · severity: blocks 11, wrong result 19, slows 15, cosmetic 4 · signal: 5,038 page views; 42 votes/likes; 647,951 views of the videos commented on; 222 HN thread points

> do you divide Actin Ratio by Protein Ratio or vice versa? You wrote down Actin R/Protein R but do otherwise.
>
> — [youtube.com, 2022-10](https://www.youtube.com/watch?v=ZJaD_6C5nkQ&lc=UgwdO_srOgaGYuqG8GJ4AaABAg) `youtube-ZJaD_6C5nkQ-UgwdO_srOgaGYuqG8GJ4AaABAg`

> I was wondering when combining data from western blot images from different experiments, for a specific protein of interest (e.g. protein X), do all the images have to be taken at the same exposure time?
>
> — [biology.stackexchange.com, 2021-05](https://biology.stackexchange.com/questions/100760) `stackexchange-biology-100760`

> Everything I have found in the web so far was mostly going a in the wrong direction leading to non-reliable measurements! ... So, even while often suggested, drawing boxes around a band is not the proper way!
>
> — [forum.image.sc, 2016-04, image analysis expert (stated)](https://forum.image.sc/raw/1470) `imagesc-1470-1`

- **Status: done**. README › Assay modules: Western blot densitometry wizard (ImageJ / Image Lab exports, background and loading-control normalisation, fold change within blot, ratio paired t test with blot as the pair).

#### 80. Keep the raw, uncropped image and every adjustment linked to the numbers

`raw-image-provenance` · score **40.6** · 11 observations from 6 venues (Journal requirements 3, YouTube comments 3, Mastodon / fediverse 2, Statistics-consulting FAQs 1, Hacker News 1, Stack Exchange 1) · severity: blocks 1, wrong result 8, slows 2 · signal: 890 page views; 18 votes/likes; 174,962 views of the videos commented on; 1,528 HN thread points

> Fighting #ImageJ today. It's losing greyscale calibration when I crop a section from a larger image.
>
> — [8bitorbust.info, 2025-10, Senior Lecturer in Imaging & Calcified Tissues (bio)](https://8bitorbust.info/@dtl/115315620267316809) `mastodon-8bitorbust.info-115315620267316809`

> What if they don't all touch the bottom when you graph it? Thats the issue I'm having, and if I play with the white balance more one of my lanes disappears entirely
>
> — [youtube.com, 2025-10](https://www.youtube.com/watch?v=ZJaD_6C5nkQ&lc=UgzC6F8waCs3I17JP4x4AaABAg) `youtube-ZJaD_6C5nkQ-UgzC6F8waCs3I17JP4x4AaABAg`

> What you should do is to plot your calibration curve without normalising it to the background.
>
> — [chemistry.stackexchange.com, 2018-07, answerer](https://chemistry.stackexchange.com/a/101311) `stackexchange-chemistry-99452-a101311`

- **Status: missing**. OpenDose analyses tables, not images (README › Features); ROADMAP lists no image handling.
- **Gap:** Image provenance lives outside the tool.
- **Proposal (L):** Research only: let a densitometry table carry a link (or embedded thumbnail) of the source blot with lane labels, and export it with the figure; image processing itself stays in ImageJ/Fiji.

#### 82. Import per-cell and per-image tables (Fiji, CellProfiler, QuPath), many files at once, condition from file names

`image-table-import` · score **40.0** · 27 observations from 7 venues (Forums (image.sc, Bioconductor, Galaxy) 8, GitHub issues 6, Lab blogs 5, Software reviews 3, Hacker News 2, Stack Exchange 2) · severity: blocks 5, wrong result 1, slows 21 · signal: 3,049 page views; 14 votes/likes; 218 HN thread points

> I harvested some lentivirus from 293T cells and want to titre the result.
>
> — [biology.stackexchange.com, 2013-09](https://biology.stackexchange.com/questions/10264) `stackexchange-biology-10264`

> I'm not sure how to convert the .tif images to .gpr format, or how to statistically analyze the results I obtained from ImageJ.
>
> — [forum.image.sc, 2025-03, new to protein array analysis (stated)](https://forum.image.sc/raw/110190) `imagesc-110190-1`

> I was curious, whether there is a way to extract information such frequency of ca spikes/min from the csv files? I would like to plot the data in graphpad.
>
> — [github.com/kirkebylab/LUMIN, 2026-04, physiologist (stated in GitHub bio), PhD](https://github.com/kirkebylab/LUMIN/issues/3) `github-lumin-3-1`

- **Status: partial**. README › Data tables: import recipes for CellProfiler and QuPath with metadata from sample names and aggregation cell → image → animal; importing a folder of many files at once is not listed.
- **Gap:** One file at a time; no condition/replicate parsed from file or folder names across many files.
- **Proposal (M):** Accept a multi-file drop (or zip) of per-image CSVs, stack them with the file name as a column, parse condition and repeat from the name pattern, then run the existing recipe.

#### 97. Check the linear range and saturation before quantifying bands

`wb-linear-range` · score **36.2** · 16 observations from 4 venues (Methods literature 7, Lab blogs 4, YouTube comments 4, Journal requirements 1) · severity: wrong result 16 · signal: 3 votes/likes; 355,462 views of the videos commented on

> I have saturated bands, and I am not getting a sharp peak, it's rather a plateau. Should I still consider moving ahead with the estimation of the bands or repeat the experiment
>
> — [youtube.com, 2026-05](https://www.youtube.com/watch?v=wg5xAbS6iTQ&lc=Ugwow0ffR5PGqvBlTJ94AaABAg) `youtube-wg5xAbS6iTQ-Ugwow0ffR5PGqvBlTJ94AaABAg`

> In one case I alerted the authors to this problem, and their response was simply to dial back all the blots in powerpoint (using brightness/contrast), resulting in gray fat bands instead of black fat bands.
>
> — [retractionwatch.com, 2012-04, commenter](https://retractionwatch.com/2012/04/03/can-we-trust-western-blots/) `blog-retractionwatch-trustwb-1`

> If blots are quantitatively analyzed, record how data were obtained, whether signal intensity was linear with antigen loading, and how protein loading was normalized. Some detection methods (e.g., ECL) have a very limited linear range.
>
> — [asbmb.org, journal requirement, Journal of Biological Chemistry (ASBMB)](https://www.asbmb.org/journals/author-resources/collecting-and-presenting-data) `journal-jbc-data-9`

- **Status: missing**. README › Assay modules lists background and loading-control normalisation in the densitometry wizard but no linear-range or saturation check.
- **Gap:** No dilution-series fit for the linear range and no saturation flag on imported values.
- **Proposal (M):** Accept a loading dilution series in the densitometry wizard, fit signal vs load, and flag sample bands outside the linear range; warn on values at the detector maximum.

#### 127. Lane and band detection with background subtraction on the image itself

`image-quantification` · score **26.7** · 10 observations from 4 venues (YouTube comments 7, Forums (image.sc, Bioconductor, Galaxy) 1, Methods literature 1, Software reviews 1) · severity: wrong result 6, slows 4 · signal: 15 votes/likes; 615,688 views of the videos commented on

> What should I do to deal with dirty background? Some background area is even stronger than the band.
>
> — [youtube.com, 2022-10](https://www.youtube.com/watch?v=wg5xAbS6iTQ&lc=UgxY0h63NuCO4oeqhVd4AaABAg) `youtube-wg5xAbS6iTQ-UgxY0h63NuCO4oeqhVd4AaABAg`

> I have been thinking of setting a threshold based on a single control image and just normalizing the background of all images. Does this make sense, or are there potential inaccuracies or errors that can occur from this method?
>
> — [forum.image.sc, 2025-11, amateur with ImageJ (stated)](https://forum.image.sc/raw/117634) `imagesc-117634-1`

> Sometimes we struggle with the analysis of 3D spheroid cultures as it is difficult to mask using the current software
>
> — [selectscience.net, 2019-09, Organisation: University of Antwerp; application area: 3D cultures (shown)](https://www.selectscience.net/product/incucyte-r-live-cell-analysis-systems) `reviews-ss-36998-1`

- **Status: missing**. No image analysis exists (README › Features); the densitometry wizard starts from ImageJ / Image Lab exports.
- **Gap:** Image quantification is ImageJ territory.
- **Proposal (L):** Do not build an image analyser; link to Fiji's gel tools with a short guide and make the hand-off from their exports seamless.

### Trust and validation

5 needs, 78 observations.

#### 22. Explain why my number differs from Prism, R, SPSS or Excel

`numbers-differ-explained` · score **66.1** · 27 observations from 9 venues (GitHub issues 8, Competitor trackers 4, Forums (image.sc, Bioconductor, Galaxy) 4, Stack Exchange 4, Methods literature 2, YouTube comments 2) · severity: wrong result 26, slows 1 · signal: 31,902 page views; 10 votes/likes; 183,232 views of the videos commented on; 256 HN thread points

- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002128), `lit-weissgerber2015-2`): “Our data show that most bar and line graphs present mean ± SE. ... Showing the SE rather than the SD magnifies the apparent visual differences between groups.”

> Why R recognize 4 outliers in a3 and GraphPad does not?
>
> — [stackoverflow.com, 2017-06, new to R, previously used GraphPad Prism 7.0 (stated)](https://stackoverflow.com/questions/44522293) `stackexchange-stackoverflow-44522293`

> In my case, the CI is not identical with other results which utilized Greenwood formulae.
>
> — [forum.jamovi.org, 2023-06](https://forum.jamovi.org/viewtopic.php?t=2609) `competitor-jamovi-2609`

> I used both and find ojut values are similar but minor least different (.1-.3 difference). I used graphpad PRism which is easy then SPSS, and in Graphpad prism LSD test is not available. I need suggestion can we use tukey test in graphpad prism instead of LSD in SPSS.
>
> — [youtube.com, 2024-10](https://www.youtube.com/watch?v=sb47ABpd6T0&lc=UgzpEhqMQlKneb5Haut4AaABAg) `youtube-sb47ABpd6T0-UgzpEhqMQlKneb5Haut4AaABAg`

- **Status: done**. README › Guidance: '"Why your number may differ" notes'; explainers.ts 'Why your number may differ from another program'.

#### 52. Show me the tool is validated against reference software so I can trust the numbers

`validated-results` · score **53.5** · 23 observations from 8 venues (GitHub issues 8, Courses and workshops 4, Hacker News 4, GraphPad support pages 3, Competitor trackers 1, Software reviews 1) · severity: wrong result 15, slows 7, cosmetic 1 · signal: 17 votes/likes; 201,204 views of the videos commented on; 1,536 HN thread points

- **Prevalence** ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC13352756/), `courses-pmc-forero-defaults-differ`): “It is important to identify the statistical software package used in the data analysis because different statistical programs use different algorithms and default options to compute statistics [ 6 ]. Consequently, the findings may differ depending on the software package or algorithm used.”
- **Prevalence** ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC13352756/), `courses-pmc-forero-prism-preclinical`): “For preclinical research, such as cell models and animal models, the proprietary GraphPad Prism software was the most frequently reported (48.4%).”

> Although I grumble about the quality of #scientific #software (and there’s a lot to grumble about) I almost always use mostly-reliable packages rather than writing my own.
>
> — [ecoevo.social, 2023-04, Bioinformaticist / biostatistician (bio)](https://qoto.org/@medigoth/110234359540911172) `mastodon-ecoevo.social-110234359746262096`

> I teach people to be very sceptical of excel in my stats courses, for example (aside from some showstopping bugs and downright dangerous defaults, its RNG is particularly crap).
>
> — [news.ycombinator.com, 2020-08, statistics instructor for biochemists (stated)](https://news.ycombinator.com/item?id=24070783) `hn-24070783`

> is excel accurate?
>
> — [youtube.com, 2024-10, student (stated in parent thread)](https://www.youtube.com/watch?v=PZRnF2a56RQ&lc=UgxnM_lO0diHxgEO2Th4AaABAg.A3KSWWGf9YLA3NWsaoL2HY) `youtube-PZRnF2a56RQ-UgxnM_lO0diHxgEO2Th4AaABAg.A3KSWWGf9YLA3NWsaoL2HY`

- **Status: done** (met, but hard to find). README › Sharing, export and trust: '"How OpenDose is validated": every pinned cross-check (Prism screenshots, NIST, statistics-guide examples, published tables, statsmodels, pingouin, R) with both values and the source'.
- **Gap:** README and ROADMAP do not describe a link from a results sheet to the cross-checks for that analysis.
- **Proposal (S):** Link each results sheet to the validation entries for that analysis ('checked against R and 3 published examples').

#### 74. Never silently drop data or compute a wrong result; show warnings next to the output

`fail-loudly` · score **42.8** · 15 observations from 6 venues (GitHub issues 8, Competitor trackers 2, Hacker News 2, Courses and workshops 1, GraphPad support pages 1, Non-English communities 1) · severity: blocks 1, wrong result 11, slows 3 · signal: 44,299 page views; 417 HN thread points

> I ran into the limitation of 64K characters per entry. It’s handled by trimming html off the end then autofixing broken stuff. It works so well that it took me a while to figure out why the number of rows was decreasing as more rows were filled out.
>
> — [news.ycombinator.com, 2020-09, university lab member (stated)](https://news.ycombinator.com/item?id=24616188) `hn-24616188-2`

> I have tried with different data sets (even the example data set that was published in the article at MBoC in 2021) but it always gives me the same error.
>
> — [github.com/JoachimGoedhart/SuperPlotsOfData, 2025-09](https://github.com/JoachimGoedhart/SuperPlotsOfData/issues/10) `github-superplotsofdata-10-1`

> the problem was in the name of the variables it must not contain spaces or "-" characters.
>
> — [forum.jamovi.org, 2022-07](https://forum.jamovi.org/viewtopic.php?t=2246) `competitor-jamovi-2246`

- **Status: partial**. Guidance chips and banners flag known problems (README › Guidance); README does not state a rule that every engine warning reaches the results sheet.
- **Gap:** Engine warnings and dropped values are not guaranteed to be shown.
- **Proposal (S):** Route every engine warning and every dropped value to a 'Notes' strip on the results sheet, and test that none is swallowed.

#### 146. Pair values by an explicit subject ID, not by row order

`pair-by-subject-id` · score **20.0** · 7 observations from 2 venues (GitHub issues 6, Hacker News 1) · severity: blocks 1, wrong result 6 · signal: 1 votes/likes; 621 HN thread points

> Which one should I use if I want to compare the measurements of the same individuals before and after treatment? And also, how does the function identify the "pairs"?
>
> — [github.com/kassambara/rstatix, 2021-12, postdoc, protein design / aging biology labs (GitHub bio)](https://github.com/kassambara/rstatix/issues/136) `github-rstatix-136-1`

> identifiers in the form of "1E123" get turned into scientific numbers. ... Those things are sneaky: you can have thousands of rows, and Excel/LO doesn't mind if only the 0.1% matches its rules for smartness. They just change without notice, leaving the others intact.
>
> — [news.ycombinator.com, 2020-08, bioinformatician (stated)](https://news.ycombinator.com/item?id=24072249) `hn-24072249`

> The problem was that the data.frame I used for plotting was not sorted by the ID of the patients. Therefore, the samples wer incorrectly paired by stat_compare_means().
>
> — [github.com/kassambara/ggpubr, 2023-03](https://github.com/kassambara/ggpubr/issues/560) `github-ggpubr-560-1`

- **Status: partial**. Paired analyses pair values row by row (sheets README: 'Bland-Altman pairs values row by row'); 'From long table…' maps IDs only for some analyses.
- **Gap:** Long data with a subject column cannot drive a paired test directly; a sorted column silently breaks pairing.
- **Proposal (S):** Let paired and repeated-measures analyses take a subject-ID column (long tables) and show the pairing used; warn when a sort would break row pairing.

#### 157. Let me click a result and see the inputs and intermediate steps

`show-intermediate-values` · score **17.7** · 6 observations from 4 venues (Lab blogs 3, GitHub issues 1, Hacker News 1, Software reviews 1) · severity: wrong result 3, slows 2, cosmetic 1 · signal: 241 HN thread points

> The other motivation was that I wanted to make sure the analysis was correct (I felt back then that Perseus was too "black box" but I no longer hold that view).
>
> — [quantixed.org, 2026-07, PI, cell biology (Stephen Royle, blog author)](https://quantixed.org/2026/07/15/eruption-announcing-new-r-package-volcanoplotr/) `blog-quantixed-volcano-3`

> The technical support is good but again we still don't really know how it is performing all calculations. There is limited flexibility to change analysis options.
>
> — [selectscience.net, 2012-11, Organisation: Wayne State University; application area: Microarray analysis (shown)](https://www.selectscience.net/product/genespring-gx) `reviews-ss-13264-1`

> I love the look of these plots, but I have to say I'm not convinced I trust the output - the mean differences computed are larger than when I compute them manually, sometimes by an order of magnitude.
>
> — [github.com/ACCLAB/dabestr, 2018-12](https://github.com/ACCLAB/dabestr/issues/24) `github-dabestr-24-1`

- **Status: partial**. History records each analysis with its options and table fingerprints (README › Reporting); no drill-down from a number to its inputs.
- **Gap:** Users cannot see, e.g., the ΔCt per sample behind a fold change, or the values behind a bar.
- **Proposal (M):** Make key numbers clickable to show their inputs and intermediate table (e.g. per-sample ΔCt, the means and SDs behind a bar, the 0%/100% used by Normalize).

### Multiple comparisons

9 needs, 185 observations.

#### 23. Pick the post hoc test from my question: each vs control (Dunnett), all pairs (Tukey), a few planned pairs (Šídák)

`posthoc-by-question` · score **65.9** · 37 observations from 8 venues (Stack Exchange 18, GitHub issues 7, Competitor trackers 3, Statistics-consulting FAQs 3, GraphPad support pages 3, Journal requirements 1) · severity: blocks 9, wrong result 16, slows 12 · signal: 128,191 page views; 47 votes/likes; 105,134 views of the videos commented on

> Prism allows for including Bonferroni's post-hoc tests, after quickly checking the Wikipedia article about ANOVA, I believe Dunnett's test might be appropriate, but I have seen publications using Duncan's test, Tukey's test as well as Student's t test for pairwise comparisons in similar setups.
>
> — [stats.stackexchange.com, 2013-01](https://stats.stackexchange.com/questions/48390) `stackexchange-stats-48390`

> I know they are insufficient, but I just need to implement it because my teacher.
>
> — [github.com/statsmodels/statsmodels, 2022-03, student (refers to 'my teacher')](https://github.com/statsmodels/statsmodels/issues/8168) `github-statsmodels-8168-1`

> However, we previously have used Duncan's PostHoc test for the ANOVAs we run, but can no longer use it now that we have switched to Jamovi.
>
> — [forum.jamovi.org, 2021-03, lab group (stated)](https://forum.jamovi.org/viewtopic.php?t=1664) `competitor-jamovi-1664`

- **Status: done**. explainers.ts 'Which multiple comparisons test?' and the wizard's all / control / selected question with its post hoc advice (recommend.ts `postHoc`); Tukey, Dunnett, Šídák, Holm-Šídák, Games-Howell and others in README › Statistics.

#### 32. Correct only for the comparisons I planned (my family), not for every pair

`planned-comparisons-family` · score **61.4** · 22 observations from 9 venues (GitHub issues 7, Stack Exchange 5, Competitor trackers 3, Methods literature 2, Statistics-consulting FAQs 1, GraphPad support pages 1) · severity: blocks 3, wrong result 13, slows 6 · signal: 176,150 page views; 20 votes/likes; 217,560 views of the videos commented on

- **Prevalence** ([eLife](https://pmc.ncbi.nlm.nih.gov/articles/PMC6326723/), `lit-weissgerber2018-4`): “72.8% of papers (164/225) stated what test was used to examine pairwise differences after performing an ANOVA (such as Tukey and Bonferroni). The remaining 27.1% of papers (61/225) did not specify what type of post-hoc tests were performed.”

> I'm very new to R and need some help getting it to do the analysis I want (an analysis that I've been doing in GraphPad Prism but this can't handle large datasets) please.
>
> — [stackoverflow.com, 2014-05](https://stackoverflow.com/questions/23691712) `stackexchange-stackoverflow-23691712`

> For example, currently i'm running a rmANOVA (and comparing the results to a LMM) that has a total number of comparisons of 190 but only 10 of those make sense according to the research question and therefore the number of planned comparisons = 10.
>
> — [forum.jamovi.org, 2025-07](https://forum.jamovi.org/viewtopic.php?t=4012) `competitor-jamovi-4012`

> One issue remains: p-value adjustment does not apply for facetted plots. I think it should.
>
> — [github.com/kassambara/ggpubr, 2018-01, clinical bioinformatician, pharma; former PhD student (GitHub bio)](https://github.com/kassambara/ggpubr/issues/65) `github-ggpubr-65-1`

- **Status: partial**. ROADMAP open items (Theme 1): 'Šídák correction restricted to planned pairs and Dunn's test against a control only' are not done; recommend.ts tells users 'OpenDose applies Šídák's correction to every pair'.
- **Gap:** No way to tick the planned pairs; Dunn's always corrects for every pair.
- **Proposal (M):** Add a 'Comparisons to make' picker (all / vs control / ticked pairs) to every post hoc panel; apply Šídák, Holm or Dunn to exactly that family and print the family size.

#### 43. Say whether each P is adjusted, by which method, and show the unadjusted value beside it

`adjusted-vs-raw-labelled` · score **56.2** · 26 observations from 9 venues (GitHub issues 11, Forums (image.sc, Bioconductor, Galaxy) 4, Methods literature 4, Statistics-consulting FAQs 2, Competitor trackers 1, Courses and workshops 1) · severity: wrong result 21, slows 4, cosmetic 1 · signal: 2,900 page views; 10 votes/likes; 226,702 views of the videos commented on

- **Prevalence** ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0202121), `lit-diong2018-3`): “76-84% of papers that plotted measures to summarize variability used standard errors of the mean, and only 2-4% of papers plotted raw data used to calculate variability.”
- **Prevalence** ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0202121), `lit-diong2018-4`): “There was no evidence that reporting practices improved following publication of the editorial advice.”

> I know that there are differences which have been confirmed by qRT-PCR ( and can be demonstarted by analysing data using fold change only) and these genes have the highest ranked p values in the limma analysis (although not significant when adjusted).
>
> — [support.bioconductor.org, 2004-11, PhD student (stated)](https://support.bioconductor.org/p/6645/) `bioc-6645-1`

> 2 years on and this bug still lurks. How many papers have boxplots with unadjusted p-values on them?
>
> — [github.com/kassambara/ggpubr, 2020-06, research computing associate, brain imaging centre (GitHub bio)](https://github.com/kassambara/ggpubr/issues/293) `github-ggpubr-293-1`

> please make a video for correction of p-value after multiple comparisons
>
> — [youtube.com, 2023-10](https://www.youtube.com/watch?v=sA4lPpKyNyE&lc=UgwYEL-Gd1wgICpCIzx4AaABAg) `youtube-sA4lPpKyNyE-UgwYEL-Gd1wgICpCIzx4AaABAg`

- **Status: partial**. Post tests report multiplicity-adjusted P (README › Statistics) and explainers.ts 'Exact, uncorrected and multiplicity-adjusted P values' explains the difference; README does not say the unadjusted P is shown beside it.
- **Gap:** Unadjusted P and the family size are not shown next to each adjusted P.
- **Proposal (S):** Add 'unadjusted P' and 'family size' columns to every comparisons table and name the correction in its header and in the legend.

#### 49. Correct for multiple comparisons by default and notice when I run many separate t tests

`multiplicity-by-default` · score **54.3** · 21 observations from 10 venues (GitHub issues 5, Methods literature 4, Statistics-consulting FAQs 3, Journal requirements 2, YouTube comments 2, Courses and workshops 1) · severity: wrong result 16, slows 5 · signal: 622 page views; 10 votes/likes; 182,811 views of the videos commented on

- **Prevalence** ([bioinformatics.babraham.ac.uk](https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/Intro%20to%20statistics%20with%20GraphPad%20Prism%20slides.pdf), `consult-babraham-fwer-9`): “Running multiple tests on the same data increases the familywise error rate ... For comparisons between 5 groups, the familywise error rate is 40%”
- **Prevalence** ([www.bioinformatics.babraham.ac.uk](https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/Intro%20to%20statistics%20with%20GraphPad%20Prism%20slides.pdf), `courses-babraham-sl-familywise`): “• Probability has increased from 5% → 14.3% • For comparisons between 5 groups, the familywise error rate is 40% (=1-(0.95)n)”

> we use 2 groups to perform t test but here there are more than 2 columns , why?_
>
> — [youtube.com, 2020-10](https://www.youtube.com/watch?v=PQOhSk1sQMA&lc=Ugw5TTW5esKPmpM6WOJ4AaABAg) `youtube-PQOhSk1sQMA-Ugw5TTW5esKPmpM6WOJ4AaABAg`

> multiple-testing correction needs to be done even though your favorite gene becomes insignificant.
>
> — [fosstodon.org, 2026-09, Bioinformatician working with clinicians (bio)](https://fosstodon.org/@Mehrad/117332651449828950) `mastodon-fosstodon.org-117332651449828950-2`

> This package does not make it clear that `group_by` followed by tests does not correct for p values across groups. Should it?
>
> — [github.com/kassambara/rstatix, 2020-11, software developer (GitHub bio)](https://github.com/kassambara/rstatix/issues/76) `github-rstatix-76-1`

- **Status: partial**. The wizard routes three or more groups to ANOVA with a post hoc test (recommend.ts), but nothing counts the t tests run on one table.
- **Gap:** No project-level count of tests on the same data; no nudge when a user runs t test after t test.
- **Proposal (S):** Count the comparisons run on each table; after the third t test show a chip 'k tests on this table: consider one-way ANOVA with Dunnett, or Holm across them' with one click to either.

#### 50. Many parallel tests (genes, rows, markers) with false discovery rate control

`fdr-many-features` · score **54.2** · 22 observations from 8 venues (GitHub issues 6, Stack Exchange 6, GraphPad support pages 3, Forums (image.sc, Bioconductor, Galaxy) 2, YouTube comments 2, Competitor trackers 1) · severity: blocks 5, wrong result 13, slows 4 · signal: 11,771 page views; 25 votes/likes; 142,058 views of the videos commented on

> What would be the appropriate way to determine the power of a proposed sample size given some assumptions of FDR and an acceptable fold-change?
>
> — [stats.stackexchange.com, 2014-05](https://stats.stackexchange.com/questions/100235) `stackexchange-stats-100235`

> In our lab we calculate normalised R and G values (from M and A values)and then do t test in microsof excel to check for differentially expressed genes.
>
> — [support.bioconductor.org, 2004-02, microarray facility scientist (stated)](https://support.bioconductor.org/p/3682/) `bioc-3682-1`

> hope another tutorial how to do a log(fold change) nd -log(false discovery rate ) of RNA-seq for comparing 6 patients (paired) before and after surgery?
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=oAB3jNspij0&lc=UgyT_cP7_HvVOvk6saB4AaABAg) `youtube-oAB3jNspij0-UgyT_cP7_HvVOvk6saB4AaABAg`

- **Status: done**. README › Statistics: 'multiple t tests per row with FDR or family-wise correction'; handler `fdr_adjust`.

#### 78. Pairwise comparisons after repeated-measures or mixed ANOVA that keep the matching

`rm-posthoc` · score **40.9** · 13 observations from 5 venues (Stack Exchange 4, GitHub issues 3, Competitor trackers 2, Courses and workshops 2, GraphPad support pages 2) · severity: blocks 4, wrong result 6, slows 3 · signal: 218,622 page views; 5 votes/likes

> Would it be possible to have an option to check where the user could ask jamovi to use non-pooled error terms for the post hoc tests ?
>
> — [forum.jamovi.org, 2025-09](https://forum.jamovi.org/viewtopic.php?t=4040) `competitor-jamovi-4040`

> Have you considered repeated-measurements-ANOVA instead of all those t-tests?
>
> — [stats.stackexchange.com, 2016-06, answerer](https://stats.stackexchange.com/a/217544) `stackexchange-stats-217535-a217544`

> I ran into the same problem. For some reason it is very difficult to do this in R.
>
> — [github.com/kassambara/rstatix, 2023-11, analytical chemist (GitHub bio)](https://github.com/kassambara/rstatix/issues/199) `github-rstatix-199-2`

- **Status: partial**. ROADMAP open items (Theme 1): 'pairwise comparisons after repeated-measures one-way ANOVA'; recommend.ts: 'OpenDose's repeated-measures one-way ANOVA reports the overall test only'.
- **Gap:** RM one-way ANOVA has no post hoc tests.
- **Proposal (M):** Add Dunnett (vs baseline) and Tukey comparisons after RM one-way ANOVA and the mixed model, using paired differences and the Geisser-Greenhouse-corrected error.

#### 83. Explain why ANOVA is significant but no pair is (or the reverse)

`omnibus-posthoc-disagree` · score **39.2** · 12 observations from 8 venues (Non-English communities 3, Forums (image.sc, Bioconductor, Galaxy) 2, GitHub issues 2, Courses and workshops 1, GraphPad support pages 1, Journal requirements 1) · severity: blocks 1, wrong result 7, slows 4 · signal: 6,975 page views; 117,527 views of the videos commented on

> My question is how can I get hold on the information on which of the contrast/-s is contributing to the significance? ... Others that have performed similar experiments have used anova and a post-hoc test but I have not been able to find how one should perform a post-hoc test after limmas F-test.
>
> — [support.bioconductor.org, 2010-08](https://support.bioconductor.org/p/35073/) `bioc-35073-1`

> Sorprendentemente el dunn test (package dunn.test) no me dió ninguna combinación de grupos (en este caso meses) con p valor significativo.
>
> — [es.stackoverflow.com, 2016-03, new R user (fish ecology)](https://api.stackexchange.com/2.3/questions/6025;268820;113429?site=es.stackoverflow&filter=withbody) `nonen-es-kw-dunn-1` *(Gloss: 'Surprisingly the Dunn test gave no pair of groups (months) with a significant p value' (while Kruskal-Wallis was significant, p=0.01) — Problem: omnibus significant but no post-hoc pair, with many groups and Bonferroni.)*

> Which test is performed when doing pairwise comparisons + global p value as stated in your docs?
>
> — [github.com/kassambara/ggpubr, 2018-07](https://github.com/kassambara/ggpubr/issues/102) `github-ggpubr-102-3`

- **Status: done**. ROADMAP › Theme 1: plain-language banner 'omnibus-vs-post-hoc disagreement explained next to the table'.

#### 93. After two-way ANOVA: simple effects within each row, or each group vs control within each level

`twoway-posthoc-families` · score **36.9** · 16 observations from 5 venues (GraphPad support pages 6, Competitor trackers 3, GitHub issues 3, Stack Exchange 3, Statistics-consulting FAQs 1) · severity: blocks 7, wrong result 7, slows 2 · signal: 5,008 page views; 6 votes/likes

> I could compare each value to each other value, but this results in irrelevant comparisons being made that decrease significance levels.
>
> — [stats.stackexchange.com, 2018-08](https://stats.stackexchange.com/questions/364730) `stackexchange-stats-364730`

> I would like to show the output of a tukey_hsd on a grouped boxplot/barplot within the categories.
>
> — [github.com/kassambara/ggpubr, 2023-04, postdoc, bacterial dormancy / imaging + transcriptomics (GitHub bio)](https://github.com/kassambara/ggpubr/issues/563) `github-ggpubr-563-1`

> With an empty cell, two-way ANOVA fits main effects only (as Prism) and we report the ANOVA but no multiple comparisons
>
> — [github.com/BooneAndrewsLab/BarelySig, 2026-09, developer, planned feature (tracker issue)](https://github.com/BooneAndrewsLab/BarelySig/issues/52) `competitor-barelysig-52`

- **Status: done**. README › Statistics: two-way ANOVA 'with multiple comparisons, including every cell mean against every other'; ROADMAP › Final round: within rows, within columns, or on main-effect means.

#### 119. Compact letter display (a, b, c) from post hoc results on tables and graphs

`compact-letter-display` · score **28.6** · 16 observations from 5 venues (GitHub issues 7, Non-English communities 4, YouTube comments 3, Competitor trackers 1, GraphPad support pages 1) · severity: blocks 3, slows 12, cosmetic 1 · signal: 7,991 page views; 14 votes/likes; 444,262 views of the videos commented on

> could you help me figuring out how to showcase the significant differences between groups using letters instead of stars? I have seen graphs were each bar has certain letters on top and I believe that if two given bars do not share these letter, the difference are significant. I still have got no clue how to organize this.
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=kpGDAetOrFo&lc=UgyeWlXv1zxekNUZoVZ4AaABAg) `youtube-kpGDAetOrFo-UgyeWlXv1zxekNUZoVZ4AaABAg`

> In plant science this way of summarizing the results of statistic tests is extremely prevalent (by which I mean almost omnipresent). ... That is why the lack of it makes JASP a lot less interesting for scientists active in the plant science field since it takes quite some time to generate the significance 'levels' (with a, b, etc) by hand.
>
> — [github.com/jasp-stats/jasp-issues, 2020-05, plant scientist (stated in issue)](https://github.com/jasp-stats/jasp-issues/issues/342) `github-jasp-342-2`

> 问题二：同问题一，这种带abc的用软件怎么做呀？
>
> — [muchong.com, 2017-12, agronomy researcher (maize yield)](https://muchong.com/t-11876145-1) `nonen-zh-abc-letters-1` *(Gloss: 'Question two: how do I make these tables/graphs with abc letters in software?' — Problem: wants compact letter display of post-hoc results (6,951 views).)*

- **Status: done**. ROADMAP › Annotations: 'Compact letter display for multiple comparisons (engine compact_letters handler…)'; open item: grouped graphs have no compact letters.
- **Gap:** Grouped (two-way) graphs have no letters (ROADMAP Open items).
- **Proposal (S):** Extend compact letters to grouped graphs (within each row) and export the letters with the means table.

### Graphs: formatting, figures and export

16 needs, 365 observations.

#### 25. Significance brackets drawn from the analysis I ran, stacked automatically, on any graph

`brackets-from-analysis` · score **65.2** · 75 observations from 10 venues (GitHub issues 36, Competitor trackers 10, YouTube comments 10, GraphPad support pages 8, Stack Exchange 3, Forums (image.sc, Bioconductor, Galaxy) 2) · severity: blocks 9, wrong result 13, slows 38, cosmetic 15 · signal: 87,650 page views; 64 votes/likes; 1,346,376 views of the videos commented on; 185 HN thread points

> Neither is good for showing significance.
>
> — [stats.stackexchange.com, 2017-02, commenter](https://stats.stackexchange.com/questions/259320) `stackexchange-stats-259320-c`

> it produces an error with 'esc_group' not found). I cannot see anything worng with this. If I run it without the add_pvalue() function, it works fine either way.
>
> — [github.com/csdaw/ggprism, 2025-05, bioinformatics training developer, research institute (GitHub bio)](https://github.com/csdaw/ggprism/issues/36) `github-ggprism-36-1`

> In the multiple comparison page, under summary, we see 4 stars for "control vs drug B" & "drug a vs drug B". Yet in the plot, you add only 1 star. Which one is the correct one?
>
> — [youtube.com, 2023-10](https://www.youtube.com/watch?v=kpGDAetOrFo&lc=Ugx9AUjoiLzeVM7OiRV4AaABAg) `youtube-kpGDAetOrFo-Ugx9AUjoiLzeVM7OiRV4AaABAg`

- **Status: done**. README › Graphs: 'significance brackets and compact letters from the comparisons table'; ROADMAP › Annotations: brackets from one-way, two-way, three-way, multiple t tests and nested comparisons, with stacking.
- **Gap:** Brackets between the panels of the three-way graph (open item); no 'click two groups to compare'.
- **Proposal (S):** Let users click two groups on a graph to add a comparison (run within the current analysis' family).

#### 42. Vector export (SVG, PDF) that opens editable in Illustrator or Inkscape

`vector-export` · score **56.3** · 39 observations from 11 venues (GraphPad support pages 10, GitHub issues 9, Competitor trackers 5, Non-English communities 3, Lab blogs 2, Courses and workshops 2) · severity: blocks 11, slows 15, cosmetic 13 · signal: 254,241 page views; 13 votes/likes; 118 HN thread points

> I'm trying to save vectorized figures from jamovi, to be able to customize color, size of lines etc in Illustrator afterwards. When I save as pdf, I get a grey square with no figure.
>
> — [forum.jamovi.org, 2024-05](https://forum.jamovi.org/viewtopic.php?t=3767) `competitor-jamovi-3767`

> 用Graphpad 导出PDF格式遇到问题, 哪位高人知道是什么原因呢? ,导出后出现字体无法显示 .
>
> — [muchong.com, 2014-04, author preparing a paper (论文投稿)](https://muchong.com/t-7294777-1) `nonen-zh-pdf-fonts-1` *(Gloss: 'Problem exporting PDF from GraphPad — after export the fonts cannot be displayed. Why?' — Problem: exported vector PDF loses fonts.)*

> They want text to remain as text in the EPS file, but for the font definitions to be included in the EPS file.
>
> — [stackoverflow.com, 2012-03, software vendor (stated: "My company has created GraphPad Prism")](https://stackoverflow.com/questions/9725511) `stackexchange-stackoverflow-9725511`

- **Status: done**. README › Graphs: export 'SVG or vector PDF'; layouts export as vector SVG/PDF (ROADMAP › Page layouts).
- **Gap:** EPS/EMF are out of scope (ROADMAP › User-guide review).
- **Proposal (S):** Document how the SVG opens in Illustrator, Inkscape and Office (fonts, editable text).

#### 59. Assemble multi-panel figures with panel letters, shared axes and one font size

`multi-panel-layout` · score **49.8** · 41 observations from 12 venues (GitHub issues 9, Competitor trackers 5, GraphPad support pages 5, Software reviews 5, Lab blogs 4, Courses and workshops 3) · severity: blocks 4, wrong result 4, slows 20, cosmetic 13 · signal: 50 votes/likes; 416,625 views of the videos commented on; 351 HN thread points

- **Prevalence** ([PLOS Biology](https://pmc.ncbi.nlm.nih.gov/articles/PMC8041175/), `lit-jambor2021-allcriteria`): “Papers that met all good practice criteria examined for all image-based figures were uncommon (physiology 16%, cell biology 12%, plant sciences 2%).”
- **Prevalence** ([PLOS Biology](https://pmc.ncbi.nlm.nih.gov/articles/PMC8041175/), `lit-jambor2021-scale`): “Our analysis revealed that 10% to 29% of papers screened failed to provide any scale information and that another third only provided incomplete scale information ( Fig 1B ).”

> I am transitioning from SPSS to prism and I have this problem: ... I can't seem to find a way to input the data with the COLUMN data type so I've inserted it in the grouped data type, each subject's data was placed in a subcolumn ... I wanted to test for normal distribution but what it does instead is analyze the subcolumn
>
> — [youtube.com, 2022-10](https://www.youtube.com/watch?v=kpGDAetOrFo&lc=Ugxdnb6zbdRSDRTTPGp4AaABAg) `youtube-kpGDAetOrFo-Ugxdnb6zbdRSDRTTPGp4AaABAg`

> I read the vignette multiple times but couldn't figure out why this error occurs.
>
> — [github.com/csdaw/ggprism, 2022-08](https://github.com/csdaw/ggprism/discussions/19) `github-ggprism-19-1`

> the data is stored in a convenient way for humans to read, but impossible to process via a script (think patches of columns in separate excel sheets, sometimes the labels are on the side of the value instead of on top).
>
> — [news.ycombinator.com, 2026-08, former biophysicist (stated)](https://news.ycombinator.com/item?id=49475440) `hn-49475440`

- **Status: done**. README › Graphs: 'Page layouts (several live graphs on a page with panel letters, text, a master legend and pictures)'.
- **Gap:** Shared or locked axes across panels and scale bars are not listed (ROADMAP open items: scale bars).
- **Proposal (S):** Add 'link Y axes' across selected panels of a layout.

#### 73. Put graphs and results into PowerPoint and Word, editable

`office-export` · score **43.4** · 19 observations from 10 venues (GraphPad support pages 8, Courses and workshops 2, GitHub issues 2, Lab blogs 1, Competitor trackers 1, Forums (image.sc, Bioconductor, Galaxy) 1) · severity: blocks 4, slows 13, cosmetic 2 · signal: 1 votes/likes; 78,098 views of the videos commented on; 658 HN thread points

> 文章被接收。但是图片一直被要求修改。说PPT里面的突变要可编辑的类型。里面的图大多是graphpad的柱状图和免疫组化的图片。
>
> — [muchong.com, 2020-04, author with accepted paper](https://muchong.com/bbs/search.php?wd=graphpad&fid=0&search_type=&adfilter=0&order=2&mode=5&page=5) `nonen-zh-ppt-editable-1` *(Gloss: 'Paper accepted, but figures keep being sent back: the graphs in the PPT must be editable. Most are GraphPad bar charts and IHC images.' — Problem: graphs pasted as pictures are not editable for the journal. (thread body is login-walled; quote is the public snippet shown on the site's own search-results page))*

> How to copy and paste the outputs to ms word file?
>
> — [youtube.com, 2023-10](https://www.youtube.com/watch?v=sb47ABpd6T0&lc=UgwqK5aBjXAQpErB--h4AaABAg) `youtube-sb47ABpd6T0-UgwqK5aBjXAQpErB--h4AaABAg`

> Plot is not added and get the error, "Error in grid.newpage() : pptx device only supports one page".
>
> — [github.com/kassambara/survminer, 2018-06](https://github.com/kassambara/survminer/issues/314) `github-survminer-314-1`

- **Status: missing**. ROADMAP › User-guide review lists 'Word/PowerPoint one-click send, EPS/EMF/CMYK output' as out of scope; README lists clipboard image copy only.
- **Gap:** No .pptx export and no Word-formatted results tables.
- **Proposal (M):** Add 'Export to PowerPoint' (.pptx, one slide per graph or layout, as SVG pictures that Office keeps editable as shapes) and 'Copy table for Word' (HTML table on the clipboard).

#### 91. Volcano plots and clustered heat maps from my results tables

`volcano-heatmap` · score **37.1** · 24 observations from 7 venues (GitHub issues 8, Forums (image.sc, Bioconductor, Galaxy) 4, YouTube comments 4, GraphPad support pages 3, Lab blogs 2, Stack Exchange 2) · severity: blocks 2, wrong result 6, slows 14, cosmetic 2 · signal: 627 page views; 26 votes/likes; 142,058 views of the videos commented on

> How to show upregulated and downregulated genes in two different colors (red and blue) rather than showing both in single color?
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=oAB3jNspij0&lc=Ugz7jnYjdSPWSDBj6Hl4AaABAg) `youtube-oAB3jNspij0-Ugz7jnYjdSPWSDBj6Hl4AaABAg`

> Could you please help me to understand what type of file should I use, as input, in the Heatmap2 tool in order to produce a heatmap with DEG, presenting as z-scores?
>
> — [help.galaxyproject.org, 2024-08](https://help.galaxyproject.org/raw/13173) `galaxy-13173-1`

> I am getting a volcano plot but it is inverted: Instead of looking like a V, it looks like an A.
>
> — [github.com/JoachimGoedhart/VolcaNoseR, 2021-03, senior research scientist, biostatistics & bioinformatics core, cancer center (GitHub bio)](https://github.com/JoachimGoedhart/VolcaNoseR/issues/9) `github-volcanoser-9-1`

- **Status: done**. README › Assay modules: volcano plots from a fold-change / P table; clustered heat maps with dendrograms, tree cuts and k-means.

#### 112. Export at the journal's size and DPI with the fonts at the right point size

`journal-export-presets` · score **31.2** · 23 observations from 8 venues (Competitor trackers 8, GraphPad support pages 4, Courses and workshops 3, GitHub issues 3, Journal requirements 2, Lab blogs 1) · severity: blocks 1, wrong result 1, slows 13, cosmetic 8 · signal: 113,029 page views; 32 votes/likes

> Thanks for the reply, however im looking for a way to export all plots as SVG or PNG instead of HTML. I've already tried exporting to HTML however, the resolution of the images were very low.
>
> — [forum.jamovi.org, 2024-08](https://forum.jamovi.org/viewtopic.php?t=3833) `competitor-jamovi-3833`

> Use {ggview} to preview plots at the same size and resolution as you want to save them with ggsave() to avoid the annoying resizing
>
> — [fosstodon.org, 2026-10, Data visualisation specialist; Open Source in Pharma workshop (bio)](https://fosstodon.org/@nrennie/117365167359453743) `mastodon-fosstodon.org-117365167359453743`

> When I try to export a layout at high resolution for publication, Prism displays a "Not enough memory..." message.
>
> — [graphpad.com FAQ](https://www.graphpad.com/support/faq/when-i-try-to-export-a-layout-at-high-resolution-for-publication-prism-displays-a-not-enough-memory-message/) `gpsupport-faq-429`

- **Status: done**. README › Graphs: 'export at exact size as PNG, TIFF at a chosen DPI … journal width presets with a font-floor warning'.

#### 120. Publication-ready graphs by default, without fighting the software

`publication-defaults` · score **28.0** · 26 observations from 9 venues (Software reviews 10, Competitor trackers 4, Hacker News 4, GraphPad support pages 3, Lab blogs 1, Courses and workshops 1) · severity: wrong result 1, slows 11, cosmetic 14 · signal: 2,043 page views; 3 votes/likes; 126,698 views of the videos commented on; 1,701 HN thread points

> I need to make a plot (young and old adults) but label the points for women and men differently.
>
> — [youtube.com, 2023-10](https://www.youtube.com/watch?v=jeMy_H-jSz4&lc=UgyB-L7OFS5agiQg46d4AaABAg) `youtube-jeMy_H-jSz4-UgyB-L7OFS5agiQg46d4AaABAg`

> I have already enough frustration dealing with my samples, so I simply want the least frustration from the software I use to plot.
>
> — [news.ycombinator.com, 2025-04](https://news.ycombinator.com/item?id=43546843) `hn-43546843-2`

> For simple schoolwork to sophfisticated journal-style graphics, it was always a chore to prepare exactly the graphic representation of my data with everything in the past (albeit KG was pretty good).
>
> — [apps.apple.com, 2024-08](https://apps.apple.com/us/app/datagraph/id407412840) `reviews-as-001`

- **Status: done**. README › Graphs: Classic theme, colour schemes, journal width presets; ROADMAP › Theme 6.

#### 130. Control axis ranges, ticks, number formats and long or rotated group labels

`axis-label-control` · score **25.8** · 24 observations from 7 venues (GitHub issues 10, GraphPad support pages 5, Competitor trackers 4, Forums (image.sc, Bioconductor, Galaxy) 2, Methods literature 1, Non-English communities 1) · severity: blocks 1, wrong result 3, slows 6, cosmetic 14 · signal: 89,625 page views; 3 votes/likes; 199,065 views of the videos commented on

> I have found a workaround for this: I have added a new row with "3" option marked and created the box plot. Since the new plot is an outlier, represented as a small dot, I have deleted the "dot" from the exported image in MS Paint
>
> — [forum.jamovi.org, 2020-04](https://forum.jamovi.org/viewtopic.php?t=1259) `competitor-jamovi-1259`

> I discovered part of the problem was geom_smooth(nls or nlslm) does not work with log scales.
>
> — [github.com/csdaw/ggprism, 2022-01](https://github.com/csdaw/ggprism/discussions/14) `github-ggprism-14-1`

> I tried to adjust the" Minimum and maximum value for x axis", but the plot didn't change as my seeing
>
> — [help.galaxyproject.org, 2024-08](https://help.galaxyproject.org/raw/13299) `galaxy-13299-1`

- **Status: done**. README › Graphs: Format axes (ranges, log / probability scales, numbering, ticks, grids, gaps, right Y axis, frames).
- **Gap:** Automatic wrapping or rotation of long category labels is not listed.
- **Proposal (S):** Wrap or rotate category labels automatically when they collide.

#### 133. Apply one style or theme to every graph in a project and reuse it in the next one

`graph-style-reuse` · score **24.8** · 19 observations from 8 venues (Competitor trackers 5, Courses and workshops 3, GitHub issues 3, GraphPad support pages 3, Lab blogs 2, Journal requirements 1) · severity: slows 10, cosmetic 9 · signal: 157,610 page views; 1 votes/likes; 495,956 views of the videos commented on

- **Prevalence** ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC7870941/), `courses-gosselin-prism-share`): “The most frequently used software was determined to be Prism (mentioned in 59.01% of publications, k = 223) and SPSS (16.22%). The only non-proprietary package mentioned in the sampled articles is R (used in 4.50% of articles).”
- **Prevalence** ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/), `journal-bjp-design-6`): “a level of probability ( P ) deemed to constitute the threshold for statistical significance (typically in pharmacology this is P < 0.05) should be defined in Methods and not varied later in Results (by presentation of multiple levels of significance).”

> What's the point of moving from another statistical software to jamovi if in the end you can't work with the graphs that jamovi creates?
>
> — [forum.jamovi.org, 2019-04, neuroscientist (stated)](https://forum.jamovi.org/viewtopic.php?t=777) `competitor-jamovi-777`

> graphpad统计图各种参数设置，如何应用于所有图片呢？ 每次都得一一设置颜色等等比较麻烦。
>
> — [muchong.com, 2018-02, molecular biology researcher](https://muchong.com/t-12030332-1) `nonen-zh-apply-style-all-1` *(Gloss: 'How do I apply GraphPad graph settings to all figures? Setting colours etc. one by one every time is tedious.' — Problem: no obvious way to apply one style to all graphs.)*

> how to save a graph template like in ms excel, sir ?
>
> — [youtube.com, 2024-10](https://www.youtube.com/watch?v=M0Sl-3eu974&lc=UgyrMahmU6_5Oazmb1l4AaABAg) `youtube-M0Sl-3eu974-UgyrMahmU6_5Oazmb1l4AaABAg`

- **Status: done**. README › Data tables: 'one graph's format applied to every graph of its kind'; templates keep graph formatting; Classic theme.
- **Gap:** A style applies within one graph kind; no saved lab style across kinds and projects.
- **Proposal (S):** Save a named lab style (fonts, sizes, line widths, group colours) that applies across graph kinds and projects.

#### 141. Italics, Greek letters, µ, superscripts and equations in labels

`rich-text-labels` · score **22.3** · 13 observations from 5 venues (GraphPad support pages 7, GitHub issues 3, Competitor trackers 1, Non-English communities 1, YouTube comments 1) · severity: blocks 4, slows 2, cosmetic 7 · signal: 13,210 page views; 11 votes/likes; 495,956 views of the videos commented on

> I am trying to use Math mode to write equations, but I get a window telling me that Microsoft Equation is needed. I tried downloading it but apparently it is not supported by modern versions of office.
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=M0Sl-3eu974&lc=UgzDvI2UsGeBB2R0YFt4AaABAg) `youtube-M0Sl-3eu974-UgzDvI2UsGeBB2R0YFt4AaABAg`

> But it seems to lack support for Japanese characters.
>
> — [github.com/kassambara/ggpubr, 2017-07](https://github.com/kassambara/ggpubr/issues/15) `github-ggpubr-15-1`

> I'm trying to generate figures for both my thesis and a scientific paper in molecular biology field. Gene names are required to be written in italic, that's the reason.
>
> — [forum.jamovi.org, 2020-05, molecular biology thesis/paper author (stated)](https://forum.jamovi.org/viewtopic.php?t=1309) `competitor-jamovi-1309`

- **Status: partial**. Labels are browser text, but README › Graphs lists fonts and sizes only; no italic, superscript or symbol editing is documented.
- **Gap:** No documented way to italicise a gene name or write µM or 10⁻⁶ in a label.
- **Proposal (S):** Support a small markup in all labels (*italic*, ^superscript^, _subscript_, \mu) with a toolbar, kept in SVG/PDF export.

#### 155. Edit graph elements directly by clicking them, with a live preview

`graph-direct-editing` · score **18.1** · 10 observations from 5 venues (Competitor trackers 3, Courses and workshops 2, GitHub issues 2, Software reviews 2, Lab blogs 1) · severity: slows 8, cosmetic 2 · signal: 44,474 page views; 1 votes/likes

> I know this sounds picky, but after using a plotting program such as GraphPad Prism, one becomes accustomed to the luxury of direct plot editing.
>
> — [forum.jamovi.org, 2018-08](https://forum.jamovi.org/viewtopic.php?t=401) `competitor-jamovi-401`

> I don't have a super strong background in coding, and I would be tripped up a good bit when I thought of something I would like to do but was just unable to put it into code or find a source to put it into code.
>
> — [ctl.duke.edu, 2020-08, undergraduate student, animal physiology (quoted)](https://ctl.duke.edu/blog/2020/08/teaching-students-to-visualize-data-with-r/) `blog-dukectl-rviz-2`

> I can plot multiple columns from multiple data sets in one graph which is great but you can’t pick and chose which columns you want plotted from each data set.
>
> — [apps.apple.com, 2021-01, student (physics lab, stated)](https://apps.apple.com/us/app/id1385963326) `reviews-as-024`

- **Status: partial**. README › Graphs: Format graph / Format axes panels and draggable annotations; no click-on-element editing is listed.
- **Gap:** Formatting is done in side panels, not on the graph.
- **Proposal (M):** Make graph elements clickable to open the matching Format panel section (axis, data set, legend); part of the planned UI/UX pass.

#### 156. Colour-blind-safe palettes by default and a preview of how the figure looks with CVD

`colour-blind-safe` · score **17.8** · 23 observations from 11 venues (Methods literature 6, Lab blogs 4, GraphPad support pages 3, Competitor trackers 2, Journal requirements 2, Statistics-consulting FAQs 1) · severity: wrong result 2, cosmetic 21 · signal: 7,502 page views; 12 votes/likes; 177 HN thread points

- **Prevalence** ([PLOS Biology](https://pmc.ncbi.nlm.nih.gov/articles/PMC8041175/), `lit-jambor2021-deuteranopia`): “Papers without any colorblind accessible figures were uncommon (3% to 6%); however, 45% of cell biology papers and 21% to 24% of physiology and plant science papers contained some images that were inaccessible to readers with deuteranopia ( Fig 2A ).”
- **Prevalence** ([Circulation](https://pmc.ncbi.nlm.nih.gov/articles/PMC8947810/), `lit-weissgerber2019reveal-colourmaps`): “While 12.6% of papers (26/206) used a color map on a graph or clinical image, only 15.4% of these papers (4/26) used color maps in which key features were visible to someone with deuteranopia.”

> If you use Fiji (ImageJ) I made lookup tables (LUTs) using a color blind friendly color set from Okabe & Ito (2002). It provides a few more options for your image stacks beyond the recommended green/magenta combination.
>
> — [mastodon.social, 2023-02, Biologist, evolution of morphogenesis (bio)](https://mastodon.social/@bruvellu/109816897396255021) `mastodon-mastodon.social-109816897396255021`

> Building a colour map on a purely physical rather than a perceptual basis significantly alters how we perceive data; it adds artificial boundaries to some parts of the data range, hiding small-scale variations elsewhere, it prevents any visual intuitive order occurring in the data set, and renders the data unreadable for readers with common colour-vision deficiencies (Fig. 2 ).
>
> — [Nature Communications, 2020-10, peer-reviewed critique, science communication / colour maps](https://pmc.ncbi.nlm.nih.gov/articles/PMC7595127/) `lit-crameri2020-distort`

> A simple approach is to use color coding for the biological replicates, with the same color used for all the technical replicates performed on an animal or sample. (Use colors that can be distinguished by color-blind individuals.)
>
> — [stats.stackexchange.com, 2021-05, answerer (accepted answer)](https://stats.stackexchange.com/a/526175) `stackexchange-stats-525883-a526175`

- **Status: done**. README › Graphs: 'a colour-vision check with CIEDE2000 differences and contrast'; colour schemes including colour-blind safe and print.

#### 162. Log axes with readable ticks in real units

`log-axes` · score **14.8** · 10 observations from 5 venues (YouTube comments 3, GitHub issues 2, GraphPad support pages 2, Stack Exchange 2, Competitor trackers 1) · severity: blocks 1, slows 3, cosmetic 6 · signal: 11,976 page views; 7 votes/likes; 457,775 views of the videos commented on

> I am struggling to create a graph with log-transformed log y-axes. I was able to create it in a trial version of GraphPad but i want to use a jamovie for the job.
>
> — [forum.jamovi.org, 2020-08](https://forum.jamovi.org/viewtopic.php?t=1393) `competitor-jamovi-1393`

> my concentrations in the question im doing range from 0.01 and 100. This means i have to plot some negative figures on my graph but that doesnt seem right to me.
>
> — [youtube.com, 2020-10](https://www.youtube.com/watch?v=PZRnF2a56RQ&lc=Ugy42K4WSNzXDK49vQh4AaABAg) `youtube-PZRnF2a56RQ-Ugy42K4WSNzXDK49vQh4AaABAg`

> However, I would like the bar to continue in the same direction despite being less than 1.
>
> — [stackoverflow.com, 2019-12, novice (stated)](https://stackoverflow.com/questions/59311186) `stackexchange-stackoverflow-59311186`

- **Status: done**. README › Graphs: log / probability scales; ROADMAP › Format Axes: log10, log2, ln, antilog numbering.

#### 165. Several XY series with their own X values on one graph

`per-series-x` · score **12.8** · 3 observations from 2 venues (Lab blogs 2, YouTube comments 1) · severity: blocks 2, slows 1 · signal: 1 votes/likes; 495,956 views of the videos commented on

> How do I plot a scatter curves of 2 data sets with 'different X' and Y columns in the same graph?
>
> — [youtube.com, 2018-10](https://www.youtube.com/watch?v=M0Sl-3eu974&lc=UgzuJloo4M79HOZ9n0h4AaABAg) `youtube-M0Sl-3eu974-UgzuJloo4M79HOZ9n0h4AaABAg`

> Imagine that your data are sampled at different intervals. How would you do that? Dealing with those simple cases in Excel is difficult-to-impossible.
>
> — [quantixed.org, 2016-07, PI, cell biology (Stephen Royle, blog author)](https://quantixed.org/2016/07/07/the-digital-cell-getting-started-with-igorpro/) `blog-quantixed-igor-3`

> This long format with the values for "Time" repeated several times look atypical. But this format offers flexibility, for instance when the measurements for the conditions are taken at different times.
>
> — [thenode.biologists.com, 2017-10, assistant professor, molecular cytology (Joachim Goedhart; stated)](https://thenode.biologists.com/converting-excellent-spreadsheets-tidy-data/education/) `blog-thenode-tidy1-3`

- **Status: partial**. ROADMAP › Site validation, still open: 'one value per data set's own X (Anscombe-style layouts)'.
- **Gap:** All data sets of an XY table share one X column.
- **Proposal (M):** Allow an X subcolumn per data set in XY tables (or overlay several XY tables on one graph).

#### 166. Axis breaks with chosen segments on either axis

`axis-breaks` · score **12.6** · 10 observations from 7 venues (GitHub issues 3, Hacker News 2, Competitor trackers 1, Courses and workshops 1, GraphPad support pages 1, Stack Exchange 1) · severity: slows 2, cosmetic 8 · signal: 2,104 page views; 2 votes/likes; 78,414 views of the videos commented on; 1,806 HN thread points

> I can extend the range of the y axis to make sure the upper limit is included, but then it squashes the bulk of the data points together and doesn't really display the main trend of the bulk of the graph well.
>
> — [stats.stackexchange.com, 2013-04](https://stats.stackexchange.com/questions/56731) `stackexchange-stats-56731`

> I simply need the figure in the minimal amount of time and with the least mental bandwidth, so I can focus on the science and catch the conference deadline. Origin is a very "over-engineered" piece of software, but hey getting a broken axis is so simple
>
> — [news.ycombinator.com, 2025-04](https://news.ycombinator.com/item?id=43550712) `hn-43550712`

> I wonder if tidyplots can work with ggbreak.
>
> — [github.com/jbengler/tidyplots, 2026-02, postdoc, immunogenomics (GitHub bio)](https://github.com/jbengler/tidyplots/discussions/158) `github-tidyplots-158-1`

- **Status: partial**. ROADMAP › Format Axes: 'discontinuous left Y axis'; graph-format limits list 'a discontinuous right Y axis' as open.
- **Gap:** No X-axis break and no unequal segment widths.
- **Proposal (S):** Add breaks to the X axis (also serves the zero-dose control) and segment widths for both axes.

#### 177. Control legends: titles, position, order and visibility

`legend-control` · score **3.5** · 6 observations from 2 venues (GitHub issues 4, YouTube comments 2) · severity: cosmetic 6 · signal: 37 votes/likes; 268,756 views of the videos commented on

> I frequently have heatmaps with very long pathway names, and the legend gets placed half a meter to the right...
>
> — [github.com/raivokolde/pheatmap, 2017-01](https://github.com/raivokolde/pheatmap/issues/31) `github-pheatmap-31-1`

> is there any possibility of creating a legend that will be connected to the color of the dots? I mean to write "upregulated" or "downregulated"
>
> — [youtube.com, 2022-10](https://www.youtube.com/watch?v=oAB3jNspij0&lc=Ugyaw3CQi-od4nK0gvV4AaABAg) `youtube-oAB3jNspij0-Ugyaw3CQi-od4nK0gvV4AaABAg`

> Is there a way to control the size of the whole legend?
>
> — [github.com/raivokolde/pheatmap, 2016-07](https://github.com/raivokolde/pheatmap/issues/26) `github-pheatmap-26-1`

- **Status: done**. ROADMAP › Format Graph: 'Legends: show/hide, position (corners, above, outside right, below), layout, per-dataset text'.

### Reproducibility, provenance and sharing

11 needs, 230 observations.

#### 26. Exclusions need a reason, stay visible and are reported (n enrolled vs analysed)

`exclusion-log` · score **64.1** · 29 observations from 10 venues (Journal requirements 8, Methods literature 5, Lab blogs 3, Courses and workshops 3, GraphPad support pages 3, Statistics-consulting FAQs 2) · severity: blocks 1, wrong result 24, slows 4 · signal: 128 page views; 1 votes/likes; 113,462 views of the videos commented on; 152 HN thread points

- **Prevalence** ([Clinical Science](https://pmc.ncbi.nlm.nih.gov/articles/PMC9366861/), `lit-riedel2022-flowcharts`): “Fewer than 25% of papers use flow charts, which provide information about attrition and the risk of bias.”
- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002430), `lit-weissgerber2016e-2`): “The authors could not determine whether animals were excluded or did not complete the experiment in 64.2% of stroke studies and 72.9% of cancer studies.”

> If an outlier appears after the process of 2^-delta delta CT, can i delete it or use statistical method to process it? I am not sure, since if the outlier comes from my control group, it would change everything.
>
> — [youtube.com, 2023-10](https://www.youtube.com/watch?v=Uj0uDpNgc7U&lc=UgyAEjsFe_rrnfARly14AaABAg) `youtube-Uj0uDpNgc7U-UgyAEjsFe_rrnfARly14AaABAg`

> Is there an statistical procedure/test to remove this (whole) time series which as "outlier" in the set of replicates, that takes into account every time?
>
> — [stats.stackexchange.com, 2023-09](https://stats.stackexchange.com/questions/626672) `stackexchange-stats-626672`

> In general, we will not consider explanations as adequate if you base them solely in terms of ‘usual practice’.
>
> — [ukri.org, funder requirement, UKRI Medical Research Council](https://www.ukri.org/councils/mrc/guidance-for-applicants/proposals-involving-animal-use/4-3-experimental-design-avoidance-of-bias-and-statistical-considerations) `journal-mrc-animals-2`

- **Status: partial**. README › Data tables: excluded values are struck through and skipped; History logs analyses; no reason field or attrition table is listed.
- **Gap:** No reason per excluded value, no 'with/without' comparison, no enrolled-vs-analysed count.
- **Proposal (S):** Ask for a reason when values are excluded, list exclusions per group in results and methods, and offer a one-click 'results with excluded values included'.

#### 30. Record every point-and-click step as a re-runnable recipe or script

`analysis-replay` · score **63.1** · 32 observations from 12 venues (Lab blogs 6, Software reviews 6, Competitor trackers 3, Statistics-consulting FAQs 3, Hacker News 3, Journal requirements 3) · severity: blocks 3, wrong result 12, slows 15, cosmetic 2 · signal: 5 votes/likes; 703 HN thread points

- **Prevalence** ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC7870941/), `courses-gosselin-scripts`): “However, it should become mandatory that such companies make publishable scripts more easily accessible to users.”

> we cannot change the statistical test just because you don't like the p-value
>
> — [fosstodon.org, 2026-09, Bioinformatician working with clinicians (bio)](https://fosstodon.org/@Mehrad/117332651449828950) `mastodon-fosstodon.org-117332651449828950`

> I am more interested in understanding well the specific steps they take computationally and in a sensitivity analysis of their computational portion (if you slightly alter your binning threshold do you still get that fantastic clustering?).
>
> — [news.ycombinator.com, 2020-08, microbiologist, mixed wet-lab/dry-lab (stated)](https://news.ycombinator.com/item?id=24261336) `hn-24261336`

> I am checking this because one of my known marker genes (per2, ENSDARG00000034503) shows higher VST expression in KO samples but the DESeq2 log2FC is negative, suggesting that the direction may be reversed
>
> — [help.galaxyproject.org, 2025-12](https://help.galaxyproject.org/raw/16535) `galaxy-16535-1`

- **Status: partial**. README › Reporting: History (provenance of every analysis with options and table fingerprints), provenance.json, equivalent R and Python code; ROADMAP open item: replaying a provenance file onto new data.
- **Gap:** Provenance cannot be replayed onto new data.
- **Proposal (M):** Let a provenance file (or a project) be applied to a new data file: same tables, analyses, graphs and layouts, with a diff of what changed.

#### 34. An open, documented project format that every version opens and never corrupts

`open-file-format` · score **60.3** · 32 observations from 10 venues (GraphPad support pages 15, GitHub issues 4, Software reviews 4, Competitor trackers 2, Hacker News 2, Courses and workshops 1) · severity: blocks 11, wrong result 1, slows 18, cosmetic 2 · signal: 1,963 page views; 2 votes/likes; 317,809 views of the videos commented on; 798 HN thread points

> I noticed that all her xml files created or appended by Icy, to store the batch data from Spot Detector, but also for ROI information, are in the GraphPadPrism format, whereas mines are in Excel.
>
> — [forum.image.sc, 2023-05](https://forum.image.sc/raw/80923) `imagesc-80923-1`

> I've tried to read tables from graphpad prism version 8 using pzfx. I get and error that suggests the xml isn't interpretable.
>
> — [github.com/Yue-Jiang/pzfx, 2020-07](https://github.com/Yue-Jiang/pzfx/issues/8) `github-pzfx-8-1`

> I fail to remember the number of headaches that this software has caused me, the heap of hours wasted on corrupted project files, the amount of pain that I have been through.
>
> — [sourceforge.net, 2022-09](https://sourceforge.net/projects/scidavis/reviews/) `reviews-sf-001`

- **Status: done**. README › Data tables: 'Project files (JSON, versioned; every release opens every earlier version)'; export bundle with CSV.
- **Gap:** The JSON schema is not published as documentation.
- **Proposal (S):** Publish the project-file schema with a short description of tables, analyses and graphs.

#### 38. Fix the analysis plan before seeing the data and log every later change

`preregistration-plan` · score **58.4** · 17 observations from 9 venues (Hacker News 4, Stack Exchange 4, Forums (image.sc, Bioconductor, Galaxy) 2, Methods literature 2, Lab blogs 1, Statistics-consulting FAQs 1) · severity: wrong result 14, slows 3 · signal: 9,291 page views; 12 votes/likes; 2,626 HN thread points

> I have rarely seen power calculation and Statistical Analysis Plan done prior to data collection in the university hospitals.
>
> — [fosstodon.org, 2026-09, Bioinformatician (bio)](https://fosstodon.org/@Mehrad/117333061316056667) `mastodon-fosstodon.org-117333061316056667`

> Your general tactic here of searching for an effect may eventually bare fruit.
>
> — [stats.stackexchange.com, 2013-10, answerer](https://stats.stackexchange.com/a/71637) `stackexchange-stats-71626-a71637`

> My results are interesting but not statistically significant. Can I test more animals/batches of cells until I reach p<0.05?
>
> — [nc3rs.org.uk, statistician supporting animal researchers (question asked by researchers)](https://nc3rs.org.uk/how-decide-your-sample-size-when-power-calculation-not-straightforward) `blog-nc3rs-samplesize-2`

- **Status: missing**. No planning or locking feature is listed in README; History records what was run, not what was planned.
- **Gap:** No way to declare the primary test, n and exclusion rules up front.
- **Proposal (M):** Add an 'Analysis plan' info sheet (primary comparison, test, n, exclusion rules) that results check against, flagging deviations in the methods.

#### 56. Reopened analyses give the same numbers, and I am told if a version changed them

`stable-results-versions` · score **50.8** · 26 observations from 6 venues (GraphPad support pages 10, GitHub issues 6, Competitor trackers 3, Software reviews 3, Stack Exchange 3, Statistics-consulting FAQs 1) · severity: blocks 6, wrong result 14, slows 6 · signal: 56,883 page views; 24 votes/likes

> As you can see, the above two results differ very slightly, but it's enough to move the final group (F) from two stars to three stars, which I find worrying.
>
> — [stats.stackexchange.com, 2014-01](https://stats.stackexchange.com/questions/83116) `stackexchange-stats-83116`

> I have not managed to have compatibility between a protocol created by Gen5 2.0 when I install it on another computer that has the Gen5 1.10.
>
> — [selectscience.net, 2014-06, Organisation: Instituto Colombiano Agropecuario; application area: ELISA (shown)](https://www.selectscience.net/product/agilent-biotek-gen5-software-for-detection) `reviews-ss-16544-2`

> Been using dabestr for quite some time now and the version change from 0.3.0 to 2023.09.12 crashed our code.
>
> — [github.com/ACCLAB/dabestr, 2024-01](https://github.com/ACCLAB/dabestr/issues/163) `github-dabestr-163-1`

- **Status: partial**. README › Data tables: 'every release opens every earlier version'; version stamped in methods and How to cite.
- **Gap:** Nothing compares stored results with recomputed ones when an older project is reopened.
- **Proposal (S):** Store key results in the project; on reopen with a newer engine, recompute and list any number that changed beyond rounding.

#### 60. Outlier tests that are valid (ROUT, Grubbs, robust), with caveats for small n

`outlier-detection` · score **49.6** · 16 observations from 8 venues (Stack Exchange 6, Competitor trackers 3, Statistics-consulting FAQs 2, Courses and workshops 1, GraphPad support pages 1, Hacker News 1) · severity: wrong result 13, slows 3 · signal: 53,301 page views; 20 votes/likes; 196 HN thread points

> We are working on a paper where we show that 29 % of papers in top journals like Science, Nature & PNAS were skewed by a single influential data point!
>
> — [social.anoxinon.de, 2024-10, Research group in bioanalytics/pharmacology/qPCR (bio)](https://social.anoxinon.de/@RoedigerRG/113362576978151533) `mastodon-social.anoxinon.de-113362576978151533`

> I would like to discard those instances where the three replicates are not consistent, i.e. when there's an outlier
>
> — [stats.stackexchange.com, 2016-03](https://stats.stackexchange.com/questions/202970) `stackexchange-stats-202970`

> This grad or postdoc is then charged with running some statistical analyses without any training whatsoever in data science. What is an outlier anyway, what do you mean by “normalize”, what is metadata exactly?
>
> — [news.ycombinator.com, 2025-02, PI, neurogenetics lab (stated)](https://news.ycombinator.com/item?id=42991417) `hn-42991417`

- **Status: done**. README › Statistics: Grubbs and ROUT outliers; ROUT in curve fits; explainers.ts 'Outliers: flag, don't delete'.

#### 81. Share a project with people who don't have the software

`share-with-collaborators` · score **40.2** · 24 observations from 7 venues (GraphPad support pages 10, Hacker News 4, Lab blogs 3, GitHub issues 3, Competitor trackers 2, Courses and workshops 1) · severity: wrong result 3, slows 21 · signal: 3 votes/likes; 2,806 HN thread points

> Would it be possible to add an parameter for setting the decimals displayed by default in the `write_fzfx` file? ... has caused some confusion when circulating files to collaborators.
>
> — [github.com/Yue-Jiang/pzfx, 2022-07, microbiology researcher (GitHub bio)](https://github.com/Yue-Jiang/pzfx/issues/16) `github-pzfx-16-1`

> I had to use Excel for 100% of my publications and posters in medical services research. ... While I'd love to use only R, most of my collaborators wouldn't be able to use it
>
> — [news.ycombinator.com, 2020-08, medical services researcher (stated)](https://news.ycombinator.com/item?id=24070671) `hn-24070671`

> It would be great to sync between the iPhone and the iPad so I don’t have to put custom solutions in both or put a stopwatch in both.
>
> — [apps.apple.com, 2020-09](https://apps.apple.com/us/app/id1462593060) `reviews-as-029`

- **Status: done**. README › Sharing: share links (the project compressed into the URL fragment, no server) that open read-only with 'Make a copy'.

#### 113. Template an analysis and its graph, and drop new runs of the same assay into it

`templates-new-data` · score **30.8** · 15 observations from 8 venues (Software reviews 5, Lab blogs 3, YouTube comments 2, Competitor trackers 1, Statistics-consulting FAQs 1, Courses and workshops 1) · severity: blocks 1, wrong result 1, slows 11, cosmetic 2 · signal: 7 votes/likes; 367,791 views of the videos commented on

> I want to compare two groups for pre and post situation at the same time. Means 2 groups and 2 situation. any suggestion for related test or analysis.
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=sA4lPpKyNyE&lc=UgxoGCcC4XY7r62Ad6x4AaABAg) `youtube-sA4lPpKyNyE-UgxoGCcC4XY7r62Ad6x4AaABAg`

> No more copy-and-paste a few lines of code, change a few small things, run again and discovering (or not...) that I forgot to change one of the '1's into a '2'.
>
> — [carpentries.org, 2013-09, biologist, self-taught bioinformatician (Lex Nederbragt, Univ. Oslo; stated)](https://carpentries.org/blog/2013/09/lex-nederbragt/) `blog-carpentries-nederbragt-2`

> I promised myself a while back that I wouldn't write any more #ImageJ Macro code. ... And here I am again in ijm hell!
>
> — [biologists.social, 2025-03, Professor of cell biology, PI (bio)](https://biologists.social/@steveroyle/114150012770263099) `mastodon-biologists.social-114150012770263099`

- **Status: done** (met, but hard to find). README › Data tables: 'Templates: a table with its analyses and graph formatting … "Analyze and graph like…" another table'.
- **Gap:** Templates apply to one table at a time.
- **Proposal (S):** Surface 'Analyze and graph like…' when a new table's shape matches an existing one.

#### 128. Apply the same analysis to many files or subsets at once

`batch-many-datasets` · score **26.5** · 15 observations from 7 venues (GraphPad support pages 4, Software reviews 4, Hacker News 3, Forums (image.sc, Bioconductor, Galaxy) 1, GitHub issues 1, Journal requirements 1) · severity: wrong result 1, slows 12, cosmetic 2 · signal: 31 page views; 2 votes/likes; 299 HN thread points

> I did some processing in an afternoon, including writing a python script, that a postdoc had used a month doing manually in Excel.
>
> — [news.ycombinator.com, 2016-08, former bioinformatics programmer (stated)](https://news.ycombinator.com/item?id=12350154) `hn-12350154`

> To create summary stats we are using the 'Group' function. For this, the user need to add a new operation to calculate the mean for each column. Very long process.
>
> — [help.galaxyproject.org, 2025-04, online course student (stated)](https://help.galaxyproject.org/raw/15180) `galaxy-15180-1`

> I like your package very much and use it all the time in my work.
>
> — [github.com/DoseResponse/drc, 2020-05](https://github.com/DoseResponse/drc/issues/12) `github-drc-12-1`

- **Status: partial**. Templates and 'Analyze and graph like…' (README) work one table at a time; 'all graphs as a zip' exports in batch.
- **Gap:** No way to run one template over many files or over each subset of a long table.
- **Proposal (M):** Add 'Run template on files…' (one family per file) and 'Split by column' for long tables, with a combined summary.

#### 144. Data, results and figures stay linked and update together

`linked-live-results` · score **21.1** · 11 observations from 4 venues (Lab blogs 4, Competitor trackers 3, GraphPad support pages 3, Forums (image.sc, Bioconductor, Galaxy) 1) · severity: wrong result 8, slows 3 · signal: 681 page views

> I noticed not too long ago that the curve fitting might be different between the TPP TR results excel that gets generated and the melt curve pdf with the table of reported values underneath.
>
> — [support.bioconductor.org, 2025-03](https://support.bioconductor.org/p/9161480/) `bioc-9161480-1`

> You should always either print the results to the history or put them into a table so that we can check them. Note that the table gets over written if you do the same test with different data, so printing in this case is a good idea.
>
> — [quantixed.org, 2016-07, PI, cell biology (Stephen Royle, blog author)](https://quantixed.org/2016/07/19/the-digital-cell-statistical-tests/) `blog-quantixed-stattests-4`

> There's no re-export, no re-import, and less chance of a figure built from a stale copy of the data.
>
> — [conspecta.bio, 2026-07](https://conspecta.bio/alternatives/graphpad-prism/) `competitor-conspecta-2`

- **Status: done**. README › Data tables: chains of analyses keep linked tables live; results and graphs follow the data.

#### 154. Export the numbers behind each figure panel as source data

`source-data-export` · score **18.6** · 13 observations from 6 venues (Journal requirements 7, GitHub issues 2, Competitor trackers 1, Forums (image.sc, Bioconductor, Galaxy) 1, GraphPad support pages 1, Methods literature 1) · severity: blocks 3, slows 10 · signal: no engagement counts on these pages

- **Prevalence** ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0007824), `lit-kilkenny2009-rawdata`): “Only 8% of the 48 studies assessed presented raw data for individual animals”

> The data availability statement must make the conditions of access to the “minimum dataset” that are necessary to interpret, verify and extend the research in the article, transparent to readers.
>
> — [nature.com, journal requirement, Nature Portfolio](https://www.nature.com/nature-portfolio/editorial-policies/reporting-standards) `journal-nature-std-1`

> Can I get the statistics values as an output of the Violin plot node? Do I have to use another node to calculate the statistics again?
>
> — [forum.image.sc, 2021-03](https://forum.image.sc/raw/50143) `imagesc-50143-1`

> It would be useful to be able to generate an x/y (or x/y/z) csv file that has the same information that is on the current plot, in case you want to plot in a different program or just look at the data in excel.
>
> — [github.com/cytoflow/cytoflow, 2025-03](https://github.com/cytoflow/cytoflow/issues/378) `github-cytoflow-378-1`

- **Status: partial**. README › Sharing: the export bundle holds tidy and wide CSV of every table and results CSV; no per-panel source-data workbook named by figure is listed.
- **Gap:** Nature/eLife-style 'Source Data' per figure panel must be assembled by hand.
- **Proposal (S):** Export a source-data workbook from a layout: one sheet per panel with the plotted points and summaries, named 'Fig 2b'.

### ANOVA, repeated measures and mixed models

7 needs, 121 observations.

#### 28. Recognise two or more factors and set up two-way (factorial) ANOVA instead of many t tests

`two-factor-recognition` · score **63.4** · 22 observations from 10 venues (Stack Exchange 7, Courses and workshops 3, YouTube comments 3, GitHub issues 2, Non-English communities 2, Competitor trackers 1) · severity: blocks 11, wrong result 5, slows 6 · signal: 9,893 page views; 19 votes/likes; 304,800 views of the videos commented on

- **Prevalence** ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0007824), `lit-kilkenny2009-factorial`): “We found that only 62% (75/121) of all the experiments assessed that were amenable to a factorial design (and analysis) reported using one”
- **Prevalence** ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC7870941/), `courses-gosselin-test-frequency`): “The most frequently used tests were one way analysis of variance (ANOVA; used in 53.15% of articles, k = 223 articles), two way ANOVA (28.83%), repeated measure one way ANOVA (9.46%), unpaired Student’s t test (38.74%) and Student’s t test of undefined laterality (26.83% of articles).”

> This is quite a lot of information, but in contrast to the nice examples on the web I can't seem to find the useful part of the information: p values and whether or not there are significant differences.
>
> — [stats.stackexchange.com, 2011-11](https://stats.stackexchange.com/questions/18579) `stackexchange-stats-18579`

> Would I also use two-way anova? If I use Grouped, would the 2 data sets be the diff cell lines? ... Then what are my factors: treatment type only?
>
> — [youtube.com, 2024-10](https://www.youtube.com/watch?v=sA4lPpKyNyE&lc=Ugz40Pzdcrs1_zvml7x4AaABAg) `youtube-sA4lPpKyNyE-Ugz40Pzdcrs1_zvml7x4AaABAg`

> But a problem occrued while I was trying to perform 3 way ANOVA and to display p-value on my plot.
>
> — [github.com/kassambara/ggpubr, 2018-01](https://github.com/kassambara/ggpubr/issues/65) `github-ggpubr-65-3`

- **Status: done**. The wizard asks for one, two or three factors and repeated factors (recommend.ts `Factors`, `RepeatedFactor`) and opens two-way or three-way ANOVA (README › Statistics, Grouped data).

#### 39. Time courses and longitudinal data: a mixed model with sensible covariance, AUC or a summary measure per subject

`time-course-models` · score **58.1** · 23 observations from 10 venues (Stack Exchange 9, Software reviews 3, Lab blogs 2, Competitor trackers 2, Methods literature 2, Statistics-consulting FAQs 1) · severity: blocks 6, wrong result 8, slows 7, cosmetic 2 · signal: 9,623 page views; 19 votes/likes; 57,506 views of the videos commented on; 621 HN thread points

> I think a linear mixed effects model with a dunnett's post-hoc test might be appropriate, but I am new to this and am unsure about it.
>
> — [stats.stackexchange.com, 2025-04](https://stats.stackexchange.com/questions/663685) `stackexchange-stats-663685`

> その折れ線グラフを60～120分の間で野生型とノックアウトで比べたいのですが、折れ線グラフと折れ線グラフの有意差検定はどの検定を使えばいいのでしょうか？
>
> — [chiebukuro.yahoo.co.jp, 2018-03, neuroscience researcher (LTP electrophysiology, WT vs KO)](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q13187551418) `nonen-ja-ltp-curves-1` *(Gloss: 'I want to compare the WT and KO line graphs between 60 and 120 min — which test compares one line graph with another?' — Problem: does not know how to test two time courses (repeated measures over time).)*

> Currently, the difficulty I have is how to scale these experiments (for the 10 days) inorder to get an average intensity-time data for all the repeats
>
> — [forum.image.sc, 2021-06](https://forum.image.sc/raw/54089) `imagesc-54089-1`

- **Status: partial**. README › Assay modules: tumour growth (mixed model on log volume, AUC per animal, time to endpoint) and the AUC analysis; no covariance structures beyond the default and no random slopes.
- **Gap:** AR(1) or unstructured covariance, random slopes, a general time-course wizard outside the tumour module.
- **Proposal (L):** Generalise the tumour-growth controls into a 'time course' analysis for any grouped table with time rows: mixed model (choice of covariance), AUC per subject, or a summary window per subject.

#### 40. When I ask whether an effect differs between groups, run and explain the interaction test

`interaction-question` · score **57.9** · 19 observations from 10 venues (Stack Exchange 6, Methods literature 4, Statistics-consulting FAQs 2, Courses and workshops 1, Forums (image.sc, Bioconductor, Galaxy) 1, GraphPad support pages 1) · severity: blocks 2, wrong result 14, slows 2, cosmetic 1 · signal: 8,455 page views; 11 votes/likes; 226,702 views of the videos commented on; 182 HN thread points

- **Prevalence** ([Nature Neuroscience (author institutional repository record, UvA-DARE)](https://dare.uva.nl/record/1/358198), `lit-nieuwenhuis2011-1`): “In practice, this comparison is often based on an incorrect procedure involving two separate tests in which researchers conclude that effects differ when one effect is significant (P < 0.05) but the other is not (P > 0.05). We reviewed 513 behavioral, systems and cognitive neuroscience articles in five top-ranking journals (Science, Nature, Nature Neuroscience, Neuron and The Journal of Neuroscience) and found that 78 used the correct procedure and 79 used the incorrect procedure. An additional analysis suggests that incorrect analyses of interactions are even more common in cellular and molecular neuroscience.”
- **Prevalence** ([Nature Neuroscience](https://www.nature.com/articles/nn.2886), `lit-nieuwenhuis2011-interaction`): “We reviewed 513 behavioral, systems and cognitive neuroscience articles in five top-ranking journals ... and found that 78 used the correct procedure and 79 used the incorrect procedure.”

> I did the t-test analysis to check the effect of the treatment in every genotype I have, but now I was requested to check the interaction between genotype and the treatment
>
> — [stats.stackexchange.com, 2016-02](https://stats.stackexchange.com/questions/198145) `stackexchange-stats-198145`

> DESeq2 in R seems (I think) to have the ability to input a 2x2 factorial design and retrieve differentially expressed genes significant by interaction. I can't seem to figure out how to perform that in Galaxy though.
>
> — [help.galaxyproject.org, 2023-03](https://help.galaxyproject.org/raw/9670) `galaxy-9670-1`

> 二元配置分散分析をすると交互作用に有意差がありません。
>
> — [chiebukuro.yahoo.co.jp, 2019-06, researcher (WT/KO mice, vehicle vs drug)](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q11209179061) `nonen-ja-interaction-ns-1` *(Gloss: 'In two-way ANOVA the interaction is not significant' (yet the data look like the drug works only in WT; may I publish separate t tests within WT and KO?) — Problem: wants to claim a genotype-specific effect without a significant interaction.)*

- **Status: partial**. Two-way ANOVA reports the interaction (README › Statistics, Grouped data), but no explainer, banner or wizard question addresses 'does the effect differ between genotypes?' (explainers.ts has no interaction entry).
- **Gap:** No plain-language reading of the interaction, no interaction plot, and the wizard never asks the differential-effect question.
- **Proposal (M):** Add a wizard question 'Are you asking whether the treatment effect differs between groups?' that routes to two-way ANOVA with the interaction first, an interaction plot, the difference of differences with its CI, and an explainer on 'significant in one, not the other'.

#### 41. Repeated measures with missing values: fit a mixed model instead of dropping subjects

`rm-missing-mixed-model` · score **57.3** · 26 observations from 8 venues (GitHub issues 10, GraphPad support pages 5, Stack Exchange 4, Methods literature 2, Non-English communities 2, Statistics-consulting FAQs 1) · severity: blocks 14, wrong result 12 · signal: 3,573 page views; 13 votes/likes

> Is it possible to do a paired t-test with unequal sample size?
>
> — [stats.stackexchange.com, 2016-06](https://stats.stackexchange.com/questions/217535) `stackexchange-stats-217535`

> However, I am not **certain** that this is a bug and not intended behaviour - _my dataset contains quite some missing data, which I think are causing the bug or intended error_.
>
> — [github.com/jasp-stats/jasp-issues, 2021-03, PhD, cognitive neuroscience (stated in GitHub bio)](https://github.com/jasp-stats/jasp-issues/issues/1195) `github-jasp-1195-1`

> 要素が3つあるのでThree way ANOVAで解析しようとしたのですが、データが不足しているところがあるためか解析できませんでした。
>
> — [chiebukuro.yahoo.co.jp, 2024-08, biology researcher (time × temperature × strain)](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q13302089753) `nonen-ja-three-way-missing-1` *(Gloss: 'With three factors I tried three-way ANOVA, but it would not run, probably because some data are missing.' — Problem: missing cells block the design-appropriate analysis and the user falls back to two-way.)*

- **Status: done**. README › Statistics: two-way ANOVA 'mixed-effects model when values are missing'; handlers `mixed_rm_oneway`, `mixed_rm_twoway`; explainers.ts 'Missing values in repeated measures: the mixed model'.

#### 61. Apply and explain the Geisser-Greenhouse correction automatically

`sphericity-correction` · score **49.4** · 12 observations from 7 venues (GraphPad support pages 3, Competitor trackers 2, Statistics-consulting FAQs 2, GitHub issues 2, Courses and workshops 1, Stack Exchange 1) · severity: blocks 2, wrong result 10 · signal: 148,996 page views; 1 votes/likes; 226,702 views of the videos commented on

> The same data ran in SPSS, Matlab, GraphPad, etc. produce consistent and correct outcomes. The issue is with Jamovi's algorithm which needs to fixed.
>
> — [forum.jamovi.org, 2024-07](https://forum.jamovi.org/viewtopic.php?t=3802) `competitor-jamovi-3802`

> I have been using the aov function previously to do this, however I have recently learned that it doesn't allow me to account for greenhouse-geisser correction.
>
> — [github.com/kassambara/rstatix, 2020-08, senior scientist, microbiologist (GitHub bio)](https://github.com/kassambara/rstatix/issues/65) `github-rstatix-65-1`

> When using repeated measures, when would you assume sphericity or when not to (Geisser-Greenhouse correction)? Choosing one over another gives out different p-value and its significance.
>
> — [youtube.com, 2020-10](https://www.youtube.com/watch?v=sA4lPpKyNyE&lc=UgyQvHUh_WWKT1IBik54AaABAg) `youtube-sA4lPpKyNyE-UgyQvHUh_WWKT1IBik54AaABAg`

- **Status: done**. README › Statistics: 'repeated-measures ANOVA (Geisser-Greenhouse)'; explainers.ts 'Sphericity and the Geisser-Greenhouse correction'.

#### 118. State the sum-of-squares type, contrast coding and error term so my ANOVA matches other software

`anova-method-transparency` · score **28.6** · 13 observations from 4 venues (GitHub issues 7, Stack Exchange 4, Competitor trackers 1, GraphPad support pages 1) · severity: wrong result 13 · signal: 2,969 page views; 6 votes/likes

> Moreover, although SPSS and Graphpad calculate Type III Sum of Squares, the statsmodel ANOVA output when typ=3 is the most aberrant, whereas typ=1 or 2 are much closer. Why do they disagree?
>
> — [stackoverflow.com, 2018-09, learning Python for statistical analyses (stated)](https://stackoverflow.com/questions/52483819) `stackexchange-stackoverflow-52483819`

> When I run the post-hoc tests I'm a little bit confused by the degrees of freedom used in the calculation; for timepoint * group each session has a df of 18. I thought that in the post-hoc test the pooled error term is used
>
> — [github.com/raphaelvallat/pingouin, 2025-05, self-described new to statistics](https://github.com/raphaelvallat/pingouin/discussions/468) `github-pingouin-468-1`

> unbalanced designs (state the sum of squares type and match Prism), missing cells
>
> — [github.com/BooneAndrewsLab/BarelySig, 2026-09, developer, planned feature (tracker issue)](https://github.com/BooneAndrewsLab/BarelySig/issues/27) `competitor-barelysig-27`

- **Status: done**. ROADMAP › Statistics: 'Two-way ANOVA: Type III SS via effect-coded GLM'; explainers.ts 'Why your number may differ from another program'.

#### 135. Three-way or N-way ANOVA from one long table, with custom contrasts

`nway-anova-contrasts` · score **23.4** · 6 observations from 4 venues (GraphPad support pages 3, Courses and workshops 1, Stack Exchange 1, YouTube comments 1) · severity: blocks 3, wrong result 1, slows 2 · signal: 1,710 page views; 4 votes/likes; 226,702 views of the videos commented on

> I'm on the science side of things (minimal stats expertise) and use Graphpad Prism for basic analyses.
>
> — [stats.stackexchange.com, 2011-01, scientist with minimal stats expertise (stated)](https://stats.stackexchange.com/questions/6368) `stackexchange-stats-6368`

> I have 4 factors and don’t know how to enter data on GraphPad.
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=sA4lPpKyNyE&lc=Ugy7PfWNeWQwmtTHY_l4AaABAg) `youtube-sA4lPpKyNyE-Ugy7PfWNeWQwmtTHY_l4AaABAg`

> Currently, three-way ANOVA in Prism 8 is restricted to a 2 x 2 x K design.
>
> — [graphpad.com FAQ](https://www.graphpad.com/support/faq/yes-prism-can-do-repeated-measures-three-way-anova/) `gpsupport-faq-2163`

- **Status: partial**. Three-way ANOVA exists (README › Statistics, Grouped data; handler `three_way_anova`); there is no N-way model or custom contrast.
- **Gap:** Four or more factors and user-defined contrasts.
- **Proposal (L):** Fit N-way ANOVA from a multiple-variables (long) table with factor roles, and let users enter contrasts by ticking cell means.

### Graphs: what to plot

6 needs, 166 observations.

#### 29. Choose SD, SEM or CI by purpose, with SD (or the points) by default

`error-bar-choice` · score **63.2** · 47 observations from 11 venues (Stack Exchange 10, GitHub issues 8, Competitor trackers 7, YouTube comments 4, Lab blogs 3, Courses and workshops 3) · severity: blocks 1, wrong result 20, slows 14, cosmetic 12 · signal: 157,497 page views; 95 votes/likes; 998,326 views of the videos commented on

- **Prevalence** ([pmc.ncbi.nlm.nih.gov](https://pmc.ncbi.nlm.nih.gov/articles/PMC6093658/), `courses-diong2018-sem-exact-p`): “76-84% of papers that plotted measures to summarize data variability used standard errors of the mean, and only 2-4% of papers plotted raw data used to calculate variability.”

> I later learned here that I was making an incorrect assumption that the CIs couldn't overlap.
>
> — [stats.stackexchange.com, 2016-06](https://stats.stackexchange.com/questions/217592) `stackexchange-stats-217592`

> I'm wondering if there is any way to plot a bar chart with mean and SD (or some other measure of dispersion).
>
> — [forum.jamovi.org, 2017-12, statistics teacher (stated)](https://forum.jamovi.org/viewtopic.php?t=211) `competitor-jamovi-211`

> I have dyscalculia so I need something to visualize in order to understand abstract concepts like this.
>
> — [youtube.com, 2024-10](https://www.youtube.com/watch?v=A82brFpdr9g&lc=UgzGFFhqA2PdICk0THd4AaABAg) `youtube-A82brFpdr9g-UgzGFFhqA2PdICk0THd4AaABAg`

- **Status: done**. explainers.ts 'SD, SEM or 95% CI?'; Preferences: default error bar; ROADMAP › Theme 6: column graphs default to mean ± SD with points.

#### 35. Show every data point by default instead of a bar of the mean

`show-every-point` · score **59.5** · 70 observations from 13 venues (GraphPad support pages 11, Methods literature 10, Stack Exchange 9, Lab blogs 8, Competitor trackers 6, Courses and workshops 6) · severity: blocks 3, wrong result 18, slows 11, cosmetic 38 · signal: 548,881 page views; 55 votes/likes; 374 HN thread points

- **Prevalence** ([PLOS ONE](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0202121), `lit-diong2018-rawdata`): “76-84% of papers that plotted measures to summarize data variability used standard errors of the mean, and only 2-4% of papers plotted raw data used to calculate variability.”
- **Prevalence** ([Clinical Science](https://pmc.ncbi.nlm.nih.gov/articles/PMC9366861/), `lit-riedel2022-fields`): “The proportion of papers that use bar graphs of continuous data varies markedly across fields (range in 2020: 4–58%), with high rates in biochemistry and cell biology, complementary and alternative medicine, physiology, genetics, oncology and carcinogenesis, pharmacology, microbiology and immunology.”

> I want to produce a plot like the one attached. But I have no idea how it was made or what you would call it or anything.
>
> — [support.bioconductor.org, 2016-06](https://support.bioconductor.org/p/84506/) `bioc-84506-1`

> Is there a way to combine more than one variable in the same blot, while spliting it according to a spefic criteria?
>
> — [forum.jamovi.org, 2025-11](https://forum.jamovi.org/viewtopic.php?t=4088) `competitor-jamovi-4088`

> my experience is that folks in that field are much more careful with statistics than in, say, molecular biology labs, but it varies from lab to lab. My PI is exceedingly meticulous about stats -- for instance, we don't report p-values, but rather entire distributions
>
> — [news.ycombinator.com, 2015-06, computational biology PhD student (stated)](https://news.ycombinator.com/item?id=9791267) `hn-9791267`

- **Status: done**. README › Graphs: column scatter / bar / box / violin with beeswarm or symmetric point layouts; ROADMAP › Theme 6: column graphs default to points with mean ± SD and a note when bars hide small groups.

#### 66. Always state what the error bars are, and the n, on the graph and in the legend

`error-bar-labelled` · score **47.4** · 20 observations from 8 venues (GraphPad support pages 4, Lab blogs 3, Competitor trackers 3, Methods literature 3, Statistics-consulting FAQs 2, GitHub issues 2) · severity: wrong result 15, slows 2, cosmetic 3 · signal: 13,333 page views; 408,178 views of the videos commented on

> What do they represent? 95% CI? SD? SE? something else? I can't find this information anywhere
>
> — [forum.jamovi.org, 2021-05](https://forum.jamovi.org/viewtopic.php?t=1715) `competitor-jamovi-1715`

> In their response to my comments, the authors explained they changed the SEM to SD in text, but kept the SEM in figures because this was the convention for the Journal of Neurophysiology!
>
> — [scientificallysound.org, 2016-10, neuroscience researcher (Martin Heroux, blog author)](https://scientificallysound.org/2016/10/24/poor-statistical-practices/) `blog-scisound-poorstats-4`

> I am trying to add error bars using add="mean_se" in ggline(), but am confused about what that intervals represent.
>
> — [github.com/kassambara/ggpubr, 2021-04](https://github.com/kassambara/ggpubr/issues/401) `github-ggpubr-401-1`

- **Status: done**. ROADMAP › Theme 6: 'Error-bar meaning written into the legend automatically; n per group label' (legendSentence in web/src/graph/legend.ts).

#### 85. Before-after lines or paired differences for paired and repeated data

`paired-plots` · score **38.5** · 19 observations from 6 venues (Stack Exchange 6, Methods literature 4, Competitor trackers 3, GitHub issues 3, Courses and workshops 2, Journal requirements 1) · severity: wrong result 12, slows 4, cosmetic 3 · signal: 60,554 page views; 64 votes/likes

- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002484), `lit-weissgerber2016i-1`): “This is problematic, as standard line graphs do not show values for individual participants. The sample size for each group cannot be determined, nor can the viewer assess whether response patterns are similar for all individuals in a particular group.”
- **Prevalence** ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002484), `lit-weissgerber2016interactive-linegraphs`): “The common practice of displaying summary statistics can be misleading, as many different data distributions can lead to the same graph ( Fig 2 ) [ 1 ].”

> (I): That cannot be true. The bars overlap, and we have p=0.03? That's not what I have learned in high school.
>
> — [stats.stackexchange.com, 2013-06, statistician making plots for investigators (stated)](https://stats.stackexchange.com/questions/60767) `stackexchange-stats-60767`

> I was wondering if we can do Jitter plots with pre-post and lines connecting the changes for individual data points in Jamovi.
>
> — [forum.jamovi.org, 2021-05](https://forum.jamovi.org/viewtopic.php?t=1747) `competitor-jamovi-1747`

> I would like to use add_line between variables within a grouped dataframe, but it only allows me to to that if i use split_plot.
>
> — [github.com/jbengler/tidyplots, 2025-02](https://github.com/jbengler/tidyplots/discussions/74) `github-tidyplots-74-1`

- **Status: done**. README › Graphs: before-after (spaghetti) plots, point-to-point lines; estimation plots for paired data.

#### 164. Bars start at zero; warn when an axis is truncated or bars sit on a log axis

`bar-axis-zero` · score **13.4** · 7 observations from 5 venues (Competitor trackers 2, Statistics-consulting FAQs 2, GraphPad support pages 1, Mastodon / fediverse 1, Stack Exchange 1) · severity: wrong result 2, slows 1, cosmetic 4 · signal: 11,982 page views; 5 votes/likes

> In the original scale my error $\Delta y$ goes $\bf{up}$ if my bin-count $y$ goes up. In logarithmic scale, my error $\Delta z$ goes $\bf{\text{down}}$ if my bin-count y goes up.
>
> — [stats.stackexchange.com, 2016-10](https://stats.stackexchange.com/questions/238944) `stackexchange-stats-238944`

> if your scales don't start at zero: indicate this clearly, not only in text but also visually (especially for bar charts etc)
>
> — [social.tchncs.de, 2026-02, Scientist / computer scientist (bio)](https://social.tchncs.de/@Lapizistik/116137477973935585) `mastodon-social.tchncs.de-116137477973935585`

> In previous versions of Prism, the default appearance for the "Scatter plot with bar" graph type didn't rely on this rule of setting the bar baseline to zero.
>
> — [graphpad.com release notes, 2022-06](https://www.graphpad.com/updates/prism-940-release-notes) `gpsupport-rn-940-3`

- **Status: partial**. README › Graphs lists axis ranges and log scales but no check on truncated bar axes or bars on log axes.
- **Gap:** No warning when a bar graph's axis does not start at zero or uses a log scale.
- **Proposal (S):** Warn in the graph settings when a bar graph's value axis does not include zero or is logarithmic, offering points or an axis break instead.

#### 176. Keep each group's colour the same across every graph and panel

`consistent-group-colours` · score **4.6** · 3 observations from 2 venues (Lab blogs 2, GitHub issues 1) · severity: wrong result 1, slows 1, cosmetic 1 · signal: no engagement counts on these pages

> However, if the dataframe did not have any 2s (blue points) for example, without a named list, the colours change order.
>
> — [quantixed.org, 2023-06, PI, cell biology (Stephen Royle, blog author)](https://quantixed.org/2023/06/16/step-by-step-recreating-a-volcano-plot-in-r/) `blog-quantixed-volcanoR-2`

> For example, suppose I wish to use RColorBrewer so as to plot graphs with a colour-blind friendly palette.
>
> — [github.com/kassambara/ggpubr, 2020-05](https://github.com/kassambara/ggpubr/issues/268) `github-ggpubr-268-1`

> Remember that your software tools may have their own default font (e.g., Calibri for Microsoft Office and Myriad Pro for Adobe Illustrator). Use the same font across all figures because having different fonts can be distracting.
>
> — [cloud.wikis.utexas.edu, lab wiki, neuroscience EM lab (Harris lab, UT Austin)](https://cloud.wikis.utexas.edu/wiki/spaces/khlab/pages/53544722) `blog-khlab-figureworkflow-4`

- **Status: partial**. Colour schemes and per-data-set colours exist, and one graph's format can be applied to every graph of its kind (README › Data tables, Templates); there is no project-wide colour per group name.
- **Gap:** 'KO' can be red in one graph and blue in the next.
- **Proposal (S):** Add a project colour map keyed by group name (Preferences), used by every graph unless overridden.

### Survival

6 needs, 136 observations.

#### 31. Enter survival data simply (dates, deaths per day, event yes/no) and preview how each row is read

`survival-data-entry` · score **61.7** · 21 observations from 10 venues (YouTube comments 7, Competitor trackers 2, Courses and workshops 2, GitHub issues 2, Non-English communities 2, Stack Exchange 2) · severity: blocks 6, wrong result 10, slows 5 · signal: 1,386 page views; 20 votes/likes; 469,122 views of the videos commented on; 45 HN thread points

- **Prevalence** ([PLOS ONE](https://pmc.ncbi.nlm.nih.gov/articles/PMC9584398/), `lit-invisibleactors2022-survival-endpoints`): “Most studies reported monitoring experimental animals for days to weeks post-tumour induction and before euthanasia, and 52% reported some sort of “survival analysis” using methods for time to event data (e.g. Kaplan-Meier estimates, Cox proportional hazards regression). However, only 16% (65/400 studies) reported specific humane endpoints.”

> how do I calculate the survival of a single group with regard to primary patency (stent is patent), assisted primary patency (stenosis requiring angioplasty to keep to open), and secondary angioplasty ... Usually, this is shown in a single graph.
>
> — [youtube.com, 2022-10](https://www.youtube.com/watch?v=L_XtKqJg1ug&lc=Ugzduxra1wL2V0ToU0d4AaABAg) `youtube-L_XtKqJg1ug-Ugzduxra1wL2V0ToU0d4AaABAg`

> My supervisor recommended a Kaplan Meier Survival Analysis, however, I don't have the 0-1 data for status.
>
> — [stats.stackexchange.com, 2023-06](https://stats.stackexchange.com/questions/617752) `stackexchange-stats-617752`

> I have the same problem running an old script that used to work.
>
> — [github.com/kassambara/survminer, 2020-01](https://github.com/kassambara/survminer/issues/441) `github-survminer-441-1`

- **Status: partial**. Survival tables take one row per subject with time and 1/0 event (recommend.ts LAYOUT.survival); no entry from counts per day or start/end dates and no per-subject preview.
- **Gap:** Counts-alive-per-day and date-based entry; a preview of events vs censored rows.
- **Proposal (S):** Add 'From counts per day' and 'From dates' to the survival table (expand to per-subject rows) and a preview column 'read as: death on day 12 / censored on day 30'.

#### 46. Hazard ratios with CIs and Cox regression with covariates

`hazard-ratio-cox` · score **55.4** · 31 observations from 8 venues (Stack Exchange 9, GitHub issues 6, YouTube comments 5, Statistics-consulting FAQs 4, GraphPad support pages 3, Courses and workshops 2) · severity: blocks 4, wrong result 11, slows 16 · signal: 70,405 page views; 36 votes/likes; 483,353 views of the videos commented on

- **Prevalence** ([British Journal of Cancer](https://pmc.ncbi.nlm.nih.gov/articles/PMC2033978/), `lit-altman1995-1`): “both logrank and multivariate analyses were frequently reported at most only as P-values [63/84 (75%) and 22/47 (47%) respectively]. Furthermore, although many studies were small, uncertainty of the estimates was rarely indicated [in 13/84 (15%) logrank and 16/47 (34%) multivariate results].”

> Why is there such a big difference in the statistical significance and which one should I choose?
>
> — [stats.stackexchange.com, 2014-03](https://stats.stackexchange.com/questions/89982) `stackexchange-stats-89982`

> Do you have a video for univariate and multivariate analysis for graphpad prism as well?
>
> — [youtube.com, 2024-10](https://www.youtube.com/watch?v=L_XtKqJg1ug&lc=Ugy_5saP1o9vxiO8t0V4AaABAg) `youtube-L_XtKqJg1ug-Ugy_5saP1o9vxiO8t0V4AaABAg`

> But several sources advise using log partial likelihood-based statistics for nested models.
>
> — [github.com/CamDavidsonPilon/lifelines, 2022-08](https://github.com/CamDavidsonPilon/lifelines/discussions/1450) `github-lifelines-1450-1`

- **Status: done** (met, but hard to find). README › Clinical statistics: Cox proportional-hazards regression (hazard ratios, PH test, forest plot, Schoenfeld residuals); sheets README: covariates on survival tables.
- **Gap:** recommend.ts still lists 'Cox regression … (not in OpenDose yet)' in the survival recommendation.
- **Proposal (S):** Fix the stale wizard text and link the Cox analysis from the survival results and the wizard.

#### 57. Kaplan-Meier curves with the log-rank test in the same tool as the rest of my statistics

`km-logrank` · score **50.7** · 24 observations from 8 venues (GitHub issues 7, Competitor trackers 4, Stack Exchange 4, YouTube comments 3, Statistics-consulting FAQs 2, GraphPad support pages 2) · severity: blocks 5, wrong result 9, slows 8, cosmetic 2 · signal: 12,683 page views; 15 votes/likes; 469,122 views of the videos commented on

- **Prevalence** ([British Journal of Cancer](https://pmc.ncbi.nlm.nih.gov/articles/PMC2033978/), `lit-altman1995-3`): “The procedure for categorisation of continuous variables in logrank analyses was explained in only 8/49 (16%) papers.”

> Why the difference? Is one a simplification? Do they make different assumptions? Is one outmoded?
>
> — [stats.stackexchange.com, 2011-09](https://stats.stackexchange.com/questions/15350) `stackexchange-stats-15350`

> what if my data is in percentage? can I input the data in the form of percentage in different time points? I am looking at the survival of cells not patients..
>
> — [youtube.com, 2015-10](https://www.youtube.com/watch?v=82YACeWbfpI&lc=UgiKtsdpb17kx3gCoAEC) `youtube-82YACeWbfpI-UgiKtsdpb17kx3gCoAEC`

> I am trying to plot 4 survival curve on one graph but this seem hard to do in R.
>
> — [support.bioconductor.org, 2005-12](https://support.bioconductor.org/p/11240/) `bioc-11240-1`

- **Status: done**. README › Statistics, Survival: Kaplan-Meier, log-rank (Peto and variance forms), Gehan-Breslow-Wilcoxon, hazard ratios, median survival with CIs.

#### 71. Median survival with CI, explained when 'not reached', and survival at a chosen time

`median-survival-explained` · score **44.7** · 16 observations from 8 venues (Stack Exchange 5, GraphPad support pages 2, Methods literature 2, Non-English communities 2, YouTube comments 2, Competitor trackers 1) · severity: blocks 2, wrong result 6, slows 8 · signal: 46,152 page views; 18 votes/likes; 390,814 views of the videos commented on

> I don't think this particular test is valid, given the small number of individuals in the test.
>
> — [stats.stackexchange.com, 2016-05](https://stats.stackexchange.com/questions/214105) `stackexchange-stats-214105`

> What I need to do is compare the survival for the 2 curves at given time points (e.g. t=20, 40 and 60 weeks), and I'm not sure how to do this...
>
> — [github.com/kassambara/survminer, 2019-02](https://github.com/kassambara/survminer/issues/372) `github-survminer-372-1`

> the mean and median table doesnt appears and also t the software give me those messagues: No statistics have been calculated because all the cases have been censored.
>
> — [youtube.com, 2019-10](https://www.youtube.com/watch?v=Tw1WVxiXHsk&lc=UgzHsQxFm4zzVJnTelh4AaABAg) `youtube-Tw1WVxiXHsk-UgzHsQxFm4zzVJnTelh4AaABAg`

- **Status: partial**. Median survival with CIs (README › Statistics, Survival); no 'not reached' explanation, no restricted mean or survival-at-t comparison is listed.
- **Gap:** 'Undefined' medians are unexplained; no RMST; no events-count warning.
- **Proposal (S):** Explain 'median not reached' in the results, warn when few events drive the test, and add survival at a chosen time and RMST difference with CIs.

#### 88. A publication Kaplan-Meier figure: censor ticks, aligned at-risk table, nudged curves

`km-figure` · score **37.8** · 28 observations from 6 venues (GitHub issues 13, YouTube comments 5, GraphPad support pages 4, Methods literature 3, Competitor trackers 2, Stack Exchange 1) · severity: blocks 5, wrong result 4, slows 12, cosmetic 7 · signal: 70,543 page views; 15 votes/likes; 469,122 views of the videos commented on

- **Prevalence** ([British Journal of Cancer](https://pmc.ncbi.nlm.nih.gov/articles/PMC2033978/), `lit-altman1995-2`): “The quality of graphs was felt to be poor in 43/117 (37%) papers which included at least one survival curve.”

> However, when I try to save the figure with ggsave I got an error message as below. I did some online search but could not really find a solution.
>
> — [github.com/kassambara/survminer, 2017-02, user request relayed by package maintainer (by email)](https://github.com/kassambara/survminer/issues/152) `github-survminer-152-1`

> they will be born by day and there will be days that are born but die, this same prism software can I use it? because I don't know which one to use or what graphic please help me.
>
> — [youtube.com, 2020-10](https://www.youtube.com/watch?v=82YACeWbfpI&lc=Ugy74XLIZxlx9ckYV3d4AaABAg.99J9pQd1dg_99YKDb3lHm2) `youtube-82YACeWbfpI-Ugy74XLIZxlx9ckYV3d4AaABAg.99J9pQd1dg_99YKDb3lHm2`

> To remedy this, we could simply start the y -axis at 40 rather than zero ( Fig 1D ), to emphasize the differences in the response to HH-CSF. ... Also, axes should commence at 0, other than in exceptional circumstances, such as for log scales.
>
> — [EMBO Reports, 2012-03, peer-reviewed critique, cell and molecular biology](https://pmc.ncbi.nlm.nih.gov/articles/PMC3321166/) `lit-vaux2012embo-2`

- **Status: done**. README › Graphs: survival curves with censor marks and nudging; number-at-risk tables (ROADMAP › Annotations).

#### 94. Pairwise log-rank comparisons with multiplicity correction, and a trend test

`pairwise-logrank` · score **36.8** · 16 observations from 5 venues (GitHub issues 8, GraphPad support pages 3, Stack Exchange 3, Competitor trackers 1, YouTube comments 1) · severity: blocks 6, wrong result 4, slows 5, cosmetic 1 · signal: 27,385 page views; 30 votes/likes; 115,859 views of the videos commented on

> Is it necessary to correct for multiple comparisons? If yes, is there a nice way of plotting these multiple comparisons
>
> — [stats.stackexchange.com, 2012-06](https://stats.stackexchange.com/questions/31077) `stackexchange-stats-31077`

> I have one specific question regarding how to perform log rank test for trend? This is important to my research since biomarker data are often ordinal. I am a novice in R
>
> — [github.com/kassambara/survminer, 2017-04, cancer researcher working on biomarkers, self-described in email relayed by maintainer](https://github.com/kassambara/survminer/issues/188) `github-survminer-188-1`

> if we have multiple treatment groups, and we have to compare every treatment with each other, how to interpret this data from the graph ? coz unlike ANOVA, it doesn't provide p value for comparison of each treatment.
>
> — [youtube.com, 2025-10](https://www.youtube.com/watch?v=L_XtKqJg1ug&lc=UgyAKmG8Xx6scI-Drbd4AaABAg) `youtube-L_XtKqJg1ug-UgyAKmG8Xx6scI-Drbd4AaABAg`

- **Status: partial**. recommend.ts tells users the survival results give 'for pairwise comparisons, P values that need correcting for the number of pairs (Bonferroni or Šídák)'; no corrected pairwise table is listed in README.
- **Gap:** Users must correct pairwise log-rank P values by hand.
- **Proposal (S):** Add a pairwise log-rank table (all pairs or vs control) with Bonferroni/Holm-Šídák adjusted P and the log-rank test for trend for ordered groups.

### Other analyses

11 needs, 117 observations.

#### 51. Fisher, chi-square and McNemar tests with odds ratios and the right test for small counts

`contingency-tests` · score **54.0** · 19 observations from 9 venues (Courses and workshops 5, Statistics-consulting FAQs 3, GraphPad support pages 3, Competitor trackers 2, Methods literature 2, Lab blogs 1) · severity: blocks 3, wrong result 10, slows 6 · signal: 64,257 page views; 1 votes/likes

- **Prevalence** ([statstutor.ac.uk](https://www.statstutor.ac.uk/resources/uploaded/tutorsquickguidetostatistics.pdf), `consult-statstutor-chisq`): “80% of expected cell counts >5 SPSS tells you under the test Fisher’s exact (usually for 2x2 tables, but can also be used for others) or merge categories where sensible”

> I think I can do that using the Fisher exact test, but I don't know if I have to combine the counts of the two replicates into a single count
>
> — [stats.stackexchange.com, 2011-05](https://stats.stackexchange.com/questions/11007) `stackexchange-stats-11007`

> When I tried to use chisq.test or fisher.test in bioconductor, I always got higher p-value than that with other sources. ... Using other sources such as Excel from Microsoft, I got p-value 0.025.
>
> — [support.bioconductor.org, 2009-06](https://support.bioconductor.org/p/28041/) `bioc-28041-1`

> To do Fisher's exact test, you need a 2D wave representing a contingency table. McNemar's test for paired binomial data is not available in Igor
>
> — [quantixed.org, 2016-07, PI, cell biology (Stephen Royle, blog author)](https://quantixed.org/2016/07/19/the-digital-cell-statistical-tests/) `blog-quantixed-stattests-3`

- **Status: done**. README › Statistics, Contingency: Fisher (r × c exact too), chi-square with expected counts and standardized residuals, relative risk and odds ratio, McNemar, CMH.

#### 104. PCA and clustering without code

`pca-clustering` · score **34.2** · 17 observations from 7 venues (GitHub issues 4, Stack Exchange 4, Lab blogs 3, Forums (image.sc, Bioconductor, Galaxy) 2, GraphPad support pages 2, Methods literature 1) · severity: blocks 4, wrong result 4, slows 8, cosmetic 1 · signal: 3,453 page views; 10 votes/likes

> My data is based on Ct values (cycle threshold) normalized to 3 reference genes (average of them). ... My question is which approach would you find more suitable to cluster the fold change obtained in my genes (PCA, k-means, clusterProfiler..)
>
> — [support.bioconductor.org, 2022-11, new to gene expression analysis (stated)](https://support.bioconductor.org/p/9147529/) `bioc-9147529-1`

> In order to perform an initial selection of the best candidate strains I compared statistically using Mann-Whitney U test to compare control technical replicates to each of the strain supernatants cultures contained in a plate
>
> — [stats.stackexchange.com, 2017-06](https://stats.stackexchange.com/questions/284771) `stackexchange-stats-284771`

> I'm having a hard time analyzing microarray, SNP or multivariate data with Excel and Access.
>
> — [blog.mozilla.org, 2014-05, workshop learner (grad student/postdoc/faculty, biology; quoted)](https://blog.mozilla.org/foundation-archive/mozilla-science/our-first-data-carpentry-workshop/) `blog-mozilla-datacarp-2`

- **Status: done**. README › Statistics: PCA with parallel analysis on multiple-variables tables; clustered heat maps with k-means.

#### 106. Method comparison: Bland-Altman limits of agreement, Deming or Passing-Bablok

`method-comparison` · score **33.9** · 16 observations from 5 venues (Stack Exchange 8, Forums (image.sc, Bioconductor, Galaxy) 3, GraphPad support pages 3, GitHub issues 1, Hacker News 1) · severity: blocks 1, wrong result 5, slows 10 · signal: 96,786 page views; 49 votes/likes; 621 HN thread points

> In Plain English, how does one interpret a Bland-Altman plot?
>
> — [stats.stackexchange.com, 2010-07](https://stats.stackexchange.com/questions/128) `stackexchange-stats-128`

> I am trying to compare these technical replicates to ensure they are clean.
>
> — [support.bioconductor.org, 2005-02](https://support.bioconductor.org/p/7476/) `bioc-7476-1`

> And if the next step is "yeah, that looks fine - I'll just copy the top 100 genes into this convenient GUI pathway analysis tool", you're suddenly exposed to whatever Excel did to your data.
>
> — [news.ycombinator.com, 2020-08](https://news.ycombinator.com/item?id=24077219) `hn-24077219`

- **Status: done**. README › Clinical statistics: Bland-Altman with CIs on the limits, proportional bias, repeated measurements; Deming (Model II) regression.
- **Gap:** Passing-Bablok regression is not listed.
- **Proposal (S):** Add Passing-Bablok regression next to Deming.

#### 121. ROC curves with AUC, cut-offs and comparison of two markers

`roc-analysis` · score **28.0** · 8 observations from 4 venues (Stack Exchange 3, Competitor trackers 2, YouTube comments 2, Non-English communities 1) · severity: blocks 4, wrong result 1, slows 3 · signal: 53,889 page views; 20 votes/likes; 216,612 views of the videos commented on

> I would like to know if there is a way to test for sensitivity and specificity and plot ROC curves. I would also like to know if there is a way to plot Kaplan Meier survival curves.
>
> — [forum.jamovi.org, 2017-12, clinical medicine MD (stated)](https://forum.jamovi.org/viewtopic.php?t=209) `competitor-jamovi-209`

> What statistical tests should I use to compare these two classifiers.
>
> — [stats.stackexchange.com, 2016-05](https://stats.stackexchange.com/questions/214687) `stackexchange-stats-214687`

> Graphpad Prism7を使用しています。ROC曲線のAUCの差を検定することが、R（EZR)では可能ですが、Prismで同様の操作を行うには、どのようにすればいいでしょうか。
>
> — [chiebukuro.yahoo.co.jp, 2017-05](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q13174825478) `nonen-ja-roc-compare-1` *(Gloss: 'I use GraphPad Prism 7. Testing the difference in AUC between ROC curves is possible in R (EZR) — how do I do the same in Prism?' — Problem: Prism does not compare ROC curves (the answer quotes the manual: compute a Z test by hand).)*

- **Status: done**. README › Clinical statistics: ROC with optimal cut-offs, bootstrap CIs, partial AUC and DeLong's comparison of two markers.

#### 131. Pairwise comparisons of proportions after chi-square, and graphs of contingency tables

`contingency-posthoc-graphs` · score **25.0** · 7 observations from 4 venues (Competitor trackers 2, Statistics-consulting FAQs 2, GitHub issues 2, YouTube comments 1) · severity: wrong result 3, slows 4 · signal: 996,578 page views; 126,698 views of the videos commented on

> I did not find a possibility to check Bonferroni or Holm correction for multiple comparisons ?
>
> — [forum.jamovi.org, 2025-06](https://forum.jamovi.org/viewtopic.php?t=4003) `competitor-jamovi-4003`

> it displaces the error bars when I mix positive and negative values.
>
> — [github.com/kassambara/ggpubr, 2021-09](https://github.com/kassambara/ggpubr/issues/426) `github-ggpubr-426-1`

> how can I do 100% stacked bar chart in prism?and how can I insert a filter to divide my cases in 2 subgroups (example >65 years and <65 years)?
>
> — [youtube.com, 2021-10](https://www.youtube.com/watch?v=jeMy_H-jSz4&lc=UgzoxHSG98DwGRHmq9F4AaABAg) `youtube-jeMy_H-jSz4-UgzoxHSG98DwGRHmq9F4AaABAg`

- **Status: partial**. Standardized residuals are shown (README › Statistics, Contingency); ROADMAP open items: 'Contingency tables have no graphs of their own'.
- **Gap:** No pairwise proportion comparisons with correction; no contingency graphs.
- **Proposal (S):** Add pairwise Fisher/chi-square comparisons with Holm correction after an r × c test, and stacked/percentage bar graphs of contingency tables.

#### 132. Area under the curve with a chosen baseline and its uncertainty

`auc-analysis` · score **24.8** · 9 observations from 5 venues (YouTube comments 5, Courses and workshops 1, GraphPad support pages 1, Non-English communities 1, Software reviews 1) · severity: blocks 2, wrong result 2, slows 5 · signal: 1,681 page views; 10 votes/likes; 75,523 views of the videos commented on

> how to get statistics on AUC for different treatments? p values? how to decide whether these differences in AUC are statistically significant or not?
>
> — [youtube.com, 2020-10](https://www.youtube.com/watch?v=s-K-gT4lQqo&lc=Ugza7R3oB3oCKzrmLhR4AaABAg) `youtube-s-K-gT4lQqo-Ugza7R3oB3oCKzrmLhR4AaABAg`

> In addition and most importantly there needs to be an integral function as I teach physics.
>
> — [apps.apple.com, 2018-05, physics teacher (stated)](https://apps.apple.com/us/app/id522996341) `reviews-as-026`

> 但是graphpad计算曲线下面积只依据一条直线作为baseline，所以我就remove baseline功能，把对照组拉直，然后再计算AUC
>
> — [muchong.com, 2022-02, pharmacology researcher (cAMP assay, posted in 药学/药理学)](https://muchong.com/t-15078352-1) `nonen-zh-auc-baseline-1` *(Gloss: 'GraphPad computes area under the curve only against a straight-line baseline, so I used Remove Baseline to flatten the control group and then computed AUC.' — Problem: wants AUC relative to the control curve, not a constant baseline, and had to improvise with baseline subtraction.)*

- **Status: done**. README › Assay modules: area under the curve (AUC with SE from replicates and comparison between data sets, ROADMAP › Theme 3).

#### 137. Growth curves: lag, growth rate and doubling time with CIs

`growth-curves` · score **22.9** · 10 observations from 5 venues (Stack Exchange 6, Competitor trackers 1, Forums (image.sc, Bioconductor, Galaxy) 1, GitHub issues 1, Software reviews 1) · severity: blocks 3, slows 6, cosmetic 1 · signal: 6,646 page views; 17 votes/likes

> I want to fit the growth curves for cell cultures. I have three independent replicates for each cell type and I have two cell types. After I want to test if the curves are significantly different.
>
> — [support.bioconductor.org, 2012-05](https://support.bioconductor.org/p/45578/) `bioc-45578-1`

> I'm working on a program that calculates the minimum inhibitory concentration (MIC) and minimum lethal concentration (MLC).
>
> — [stats.stackexchange.com, 2019-05, very little statistics experience (stated)](https://stats.stackexchange.com/questions/406963) `stackexchange-stats-406963`

> where the scientist wants more than a generic curve fit — they want the biologically meaningful phases identified
>
> — [github.com/BooneAndrewsLab/BarelySig, 2026-09, wet-lab user note relayed in developer's issue](https://github.com/BooneAndrewsLab/BarelySig/issues/94) `github-barelysig-94-1`

- **Status: done**. README › Assay modules: growth curves (blank and log preprocessing, logistic / Gompertz / Zwietering lag models, doubling time with CI).

#### 139. Compare slopes and intercepts of two regression lines

`compare-slopes` · score **22.4** · 11 observations from 5 venues (Stack Exchange 5, Courses and workshops 2, YouTube comments 2, GitHub issues 1, Non-English communities 1) · severity: wrong result 2, slows 8, cosmetic 1 · signal: 9,122 page views; 18 votes/likes; 207,891 views of the videos commented on

> I thought that slope should be negative. How come it's 5.2?
>
> — [stackoverflow.com, 2016-11](https://stackoverflow.com/questions/40370538) `stackexchange-stackoverflow-40370538`

> is it possible to evaluate also the IC50 slope with Excell? prism is able to give me one, but I have no idea how to do it in excell (because sometimes graphpad prism doesn't like data :C)
>
> — [youtube.com, 2022-10](https://www.youtube.com/watch?v=0fRoCKpDmh8&lc=UgwzSV5ybUVqTXkKnOV4AaABAg) `youtube-0fRoCKpDmh8-UgwzSV5ybUVqTXkKnOV4AaABAg`

> In the formulation used by this software, curves that exhibit increasing response with respect to dose have negative slope.
>
> — [github.com/DoseResponse/medrc, 2023-08, data engineer (GitHub bio)](https://github.com/DoseResponse/medrc/issues/9) `github-medrc-9-1`

- **Status: partial**. Compare fits tests one line against separate lines per data set (sheets README › Notes, compareFits); linear-regression results do not report the slope difference with its CI.
- **Gap:** No 'are the slopes equal?' result with the slope difference and CI in linear regression.
- **Proposal (S):** Add 'Compare slopes and intercepts' to linear regression on XY tables with two or more data sets (F test, difference with CI).

#### 145. Drug-combination synergy (Bliss, Loewe, HSA, ZIP)

`synergy` · score **20.9** · 5 observations from 3 venues (Stack Exchange 3, Competitor trackers 1, YouTube comments 1) · severity: blocks 3, wrong result 2 · signal: 1,595 page views; 13 votes/likes; 117,527 views of the videos commented on

> I get positive value for this BII, so apparently the combination is synergic, but is there any statistical way to test for this?
>
> — [stats.stackexchange.com, 2023-03](https://stats.stackexchange.com/questions/609687) `stackexchange-stats-609687`

> can somebody help me how to calculate ic50 of two drugs that had no constant ratio???
>
> — [youtube.com, 2024-10](https://www.youtube.com/watch?v=CD9CZjzDTEE&lc=UgxLiq7hgMmepGvNeT94AaABAg) `youtube-CD9CZjzDTEE-UgxLiq7hgMmepGvNeT94AaABAg`

> nothing in the repo or in Prism's documentation (Prism 7–11 guides on comparing models, the Compare tab, weighting) says which fit supplies the weights when comparing models or shared vs separate parameters.
>
> — [github.com/BooneAndrewsLab/BarelySig, 2026-10, developer, planned feature (tracker issue)](https://github.com/BooneAndrewsLab/BarelySig/issues/111) `competitor-barelysig-111`

- **Status: done**. README › Assay modules: drug-combination synergy (HSA, Bliss, Loewe, ZIP, Chou–Talalay).

#### 150. Correlation with its scatter plot, fit line and r with CI

`correlation-scatter` · score **19.2** · 9 observations from 5 venues (Forums (image.sc, Bioconductor, Galaxy) 3, GitHub issues 2, Methods literature 2, Courses and workshops 1, Stack Exchange 1) · severity: wrong result 4, slows 5 · signal: 735 page views

> Now my question is, can I calculate the correlation coefficient (Pearson's r) by using the intensities values obtained from the two channel? I'm trying Graphpad Prism as software for the correlation analysis
>
> — [forum.image.sc, 2024-12, new to image analysis (stated)](https://forum.image.sc/raw/106295) `imagesc-106295-1`

> However my correlation coefficient are different compared to if I would just plot my data for one of the groups. Does facet.by include some sort of correction for multiple comparison
>
> — [github.com/kassambara/ggpubr, 2018-10](https://github.com/kassambara/ggpubr/issues/116) `github-ggpubr-116-1`

> In many cases the bigger issue concerns strong correlations among the parameter estimates, because then the univariate confidence intervals don't reflect the joint uncertainty.
>
> — [stats.stackexchange.com, 2020-06, commenter](https://stats.stackexchange.com/questions/474140) `stackexchange-stats-474140-c`

- **Status: done**. README › Statistics: Pearson, Spearman or Kendall correlation; correlation matrix on multiple-variables tables.
- **Gap:** ROADMAP still open: correlation on XY tables; repeated-measures correlation.
- **Proposal (S):** Add correlation to XY tables with the scatter and a warning when points are repeated measures.

#### 159. Simple and multiple logistic regression

`logistic-regression` · score **16.5** · 6 observations from 3 venues (GraphPad support pages 3, Statistics-consulting FAQs 2, Stack Exchange 1) · severity: blocks 3, wrong result 3 · signal: 265 page views

> I would like to check whether there is a significant difference between treatment concentrations (control and three concentrations) and whether there is significant difference between plant extracts
>
> — [stats.stackexchange.com, 2022-06](https://stats.stackexchange.com/questions/578656) `stackexchange-stats-578656`

> some of these types of analyses (logistic regression, linear mixed effects modeling, survival analysis, etc.) can be quite complex and complicated to interpret, and we strongly recommend you come to us at the Rush Biostatistics Core
>
> — [rushu.rush.edu, 2025-10, biostatistics core reference sheet, audience: Rush University investigators](https://www.rushu.rush.edu/sites/default/files/2025-10/Reference%20Table%20for%20Choosing%20the%20Right%20Statistical%20Test.pdf) `consult-rush-complex-65`

> One of the most top-requested features has continuously been the ability to perform logistic regression with Prism.
>
> — [graphpad.com release notes, 2019-10](https://www.graphpad.com/updates/prism-830-release-notes) `gpsupport-rn-830-1`

- **Status: done**. README › Statistics: simple and multiple logistic regression with ROC on multiple-variables tables.

### Flow cytometry

3 needs, 43 observations.

#### 86. Take FlowJo gate statistics (% of parent, MFI) across replicates straight into tests and graphs

`flow-stats-to-tests` · score **37.9** · 23 observations from 8 venues (Stack Exchange 10, Lab blogs 4, Methods literature 3, Software reviews 2, Forums (image.sc, Bioconductor, Galaxy) 1, Journal requirements 1) · severity: blocks 1, wrong result 8, slows 11, cosmetic 3 · signal: 9,633 page views; 19 votes/likes

- **Prevalence** ([Circulation](https://pmc.ncbi.nlm.nih.gov/articles/PMC8947810/), `lit-weissgerber2019reveal-transparency`): “Use semi-transparency or show gradients to make overlapping points visible in scatterplots and flow-cytometry figures: Scatterplots in 89.2% of papers (33/37) had overlapping points, however only 12.1% of papers (4/33) used techniques like semi-transparency, shaded color gradients, or gradient lines to make overlapping points visible.”

> You need to pick your source very carefully, as extensive testing (at my former company) has shown that some isotypes stick non-specifically under certain conditions or with certain samples.
>
> — [biology.stackexchange.com, 2012-08, answerer](https://biology.stackexchange.com/a/5153) `stackexchange-biology-3369-a5153`

> Hello, I would like to do a violin plot from my fcs files.
>
> — [support.bioconductor.org, 2019-10](https://support.bioconductor.org/p/125118/) `bioc-125118-1`

> Before you move to hypothesis testing, it is often best to convert this data to a fold over background, or resolution metric (R
>
> — [expert.cheekyscientist.com, flow cytometry trainer, PhD biology (Tim Bushnell, stated)](https://expert.cheekyscientist.com/?p=1420) `blog-cheekyscientist-flowstats-1`

- **Status: partial**. README › Data tables: FlowJo import recipe; ROADMAP open items (Theme 3): 'flow cytometry has the FlowJo import recipe but no summary-statistics module of its own'.
- **Gap:** No flow module: per-sample median MFI and % of parent per experiment, background subtraction, tests on replicate level.
- **Proposal (M):** Add a flow summary module: FlowJo table in, one value per sample per experiment (median MFI, % of parent), FMO/isotype subtraction, statistics with experiment as block, graphs.

#### 126. Gating hierarchy, compensation and FCS provenance kept with the statistics

`flow-gating-provenance` · score **26.7** · 16 observations from 5 venues (Methods literature 6, Journal requirements 4, GitHub issues 3, Stack Exchange 2, Mastodon / fediverse 1) · severity: wrong result 6, slows 10 · signal: 4,213 page views; 15 votes/likes

> Ever use a #tSNE or #UMAP in #scSeq, #flowcytometry or #masscytometry? It doesn't have to be just a pretty picture anymore - we've developed a statistical test to check for differences.
>
> — [mastodon.au, 2023-01, Medical researcher, immunology lab head (bio)](https://mastodon.au/@ListonLab/109710020351052909) `mastodon-mastodon.au-109710020351052909`

> There are some R packages and a MATLAB code to read an FCS file, but I am looking for standard libraries developed either by the FCS consortium or any other group.
>
> — [bioinformatics.stackexchange.com, 2017-06](https://bioinformatics.stackexchange.com/questions/956) `stackexchange-bioinformatics-956`

> I'm worried that if these ones are wrong, the others are really being calculated wrong as well (ie even though they are giving positive numbers, they are the wrong positive numbers).
>
> — [github.com/cytoflow/cytoflow, 2025-08](https://github.com/cytoflow/cytoflow/issues/387) `github-cytoflow-387-1`

- **Status: missing**. OpenDose does not read FCS files (README › Data tables lists FlowJo statistics exports only).
- **Gap:** Gating lives in FlowJo or Cytobank.
- **Proposal (L):** Research only: keep the gate path text from FlowJo exports as metadata and print it in methods; do not build gating.

#### 174. How many events I need for a target CV, and the CI of a gated percentage

`flow-event-counts` · score **6.2** · 4 observations from 2 venues (Statistics-consulting FAQs 3, Lab blogs 1) · severity: wrong result 1, slows 3 · signal: no engagement counts on these pages

> More often this will give us much more than we need, meaning we use an unnecessary amount of machine time, and slow ourselves down with larger than needed file sizes. It is also possible that we may be under sampling and need to scale up the number of cells in each tube to make more precise repeatable experiments.
>
> — [wp.unil.ch, 2022-06, flow cytometry core facility staff (UNIL FCF newsletter)](https://wp.unil.ch/fcf/mailpoet-email/cba94f80e3a8-fcf-unil-june-2022-how-many-cells-is-enough/) `blog-unilfcf-cells-1`

> This month, in FACS Tips we are answering a recurring question in our facility : Is my population real ? We often have to discuss with users about it and we will provide here an explanation so you can be confident your data is revelant.
>
> — [wp.unil.ch, 2022-06, course/consulting page, audience: users of the UNIL Flow Cytometry Facility (facility newsletter FACS Tips)](https://wp.unil.ch/fcf/mailpoet-email/cba94f80e3a8-fcf-unil-june-2022-how-many-cells-is-enough/) `consult-unil-flow-real`

> How many events do I need to record? When performing a flow cytometry experiment, often samples are just run to completion. ... It is also possible that we may be under sampling
>
> — [wp.unil.ch, 2022-06, core facility newsletter, audience: users of the UNIL Flow Cytometry Facility](https://wp.unil.ch/fcf/mailpoet-email/cba94f80e3a8-fcf-unil-june-2022-how-many-cells-is-enough/) `consult-unil-events-54`

- **Status: missing**. Not in README › Power and sample size or the engine handlers.
- **Gap:** Rare-event planning is done by hand.
- **Proposal (S):** Add a small calculator in Tools: events needed for a target CV at a given frequency (Poisson), and the CI of an observed percentage from its counts.

## What the whole corpus says

**1. The same replicate confusion appears in 14 of 15 venues and in 5 languages.** The seven needs about what n is (declare the unit, collapse technical replicates, warn on pseudoreplication, nested and blocked analyses, SuperPlots, honesty at small n) hold 298 observations, including Chinese, French, German, Japanese posts that ask the identical question in their own words. The literature measures the damage and journals now require the unit to be stated, yet users still meet the problem at the moment they enter data, which is where no guideline reaches them.
  - “もしも統計処理をするとしたら、本来は、同じdishの細胞をまいただけですから、そもそもN=24で統計処理をするべきなのでしょうか？” ([chiebukuro.yahoo.co.jp](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q10115622960), `nonen-ja-three-plates-1`) *(Gloss: 'If I do statistics, since these are just cells from the same dish, should I really analyse with N=24?' — Problem: unclear what the experimental unit is when plates share a cell source.)*
  - “在使用graphpad绘制分组柱状图时，若一个处理组下有五个重复，每个重复下有五个样本，那这一个处理组的二十五个数据都要填?，还是只填每个重复下的平均值?” ([muchong.com](https://muchong.com/t-14889747-1), `nonen-zh-replicates-grouped-1`) *(Gloss: 'When drawing a grouped bar chart in GraphPad, if a treatment group has five replicates and each replicate has five samples, do I enter all 25 values, or only the mean of each replicate?' — Problem: does not know whether nested samples are independent n or must be averaged per replicate before plotting/testing.)*
  - “Then I decided to pool all treated cells and all controls for a general comparison. The question, more specifically, is: do I have the right, statistically, to do so?” ([forum.image.sc](https://forum.image.sc/raw/33993), `imagesc-33993-1`)
  - “12% of papers had pseudoreplication and a further 36% were suspected of having pseudoreplication, but it was not possible to determine for certain because insufficient information was provided.” ([BMC Neuroscience](https://pmc.ncbi.nlm.nih.gov/articles/PMC2817684/), `lit-lazic2010-prevalence`)
  - *For OpenDose:* ask what each value is when a table is created, not only when a chip fires after analysis (`declare-experimental-unit`), and refuse inference at one independent value (`small-n-honesty`).

**2. Journals and methods papers blame the software's defaults, not only the authors.** 24 literature and journal observations name software, packages or defaults as part of the problem: programs that pick the test, packages that allow P values at n < 5 or post hoc tests after a non-significant F, implementations that cannot handle missing time points, rainbow colour maps by default. Because one program dominates bench papers, its defaults act as the field's policy.
  - “Programs that have a user interface often make decisions about what test to use based on the characteristics of the data. Investigators who use these programs may have less knowledge of the specific tests that are being performed or how they are implemented in the statistical software package.” ([PLOS Biology](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002430), `lit-weissgerber2016e-5`)
  - “Some statistical packages may not permit analysis with group sizes below n = 5, whereas others may, thereby making it possible to obtain P < 0.05 with group sizes of less than 5.” ([British Journal of Pharmacology](https://pmc.ncbi.nlm.nih.gov/articles/PMC4507152/), `lit-curtis2015-software-n`)
  - “If these criteria are not met, a post hoc test should not be run (even if the software permits this, which it may ).” ([British Journal of Pharmacology](https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/), `lit-curtis2018-posthoc-F`)
  - “The most frequently used software was determined to be Prism (mentioned in 59.01% of publications, k = 223) and SPSS (16.22%).” ([Scientific Reports](https://pmc.ncbi.nlm.nih.gov/articles/PMC7870941/), `lit-gosselin2021-software`)
  - *For OpenDose:* defaults are the product. SD and points by default, exact P, effect sizes and the unit of n are already defaults (README › Reporting); the open ones are a hard stop at n = 1, residual plots instead of normality-test gating, and the interaction test for differential effects.

**3. GraphPad's own bug-fix history is a map of where analysis tools go wrong.** The release notes read for this catalogue contain 158 bug fixes, 75 of them classed as a wrong-result risk. They cluster in graphs: formatting, figures and export (31), reproducibility, provenance and sharing (27), data entry and import (27), access: price, platforms, privacy and language (21): multiple comparisons after two-way ANOVA, Dunnett and Geisser-Greenhouse P values, profile-likelihood CIs, decimal separators and pasted values, summary formats changing on save, and files rendering differently on another platform or version. These are the places where a careful implementation still breaks.
  - “Fixed a severe bug introduced in Prism 8.1: after two-way ordinary balanced ANOVA the multiple comparisons calculations computed the cell means incorrectly (and obviously).” ([graphpad.com release notes](https://www.graphpad.com/updates/prism-811-release-notes), `gpsupport-rn-811-1`)
  - “Fixed the issue in which adjusted P values for Dunnett's correction following two-way ANOVA were incorrect” ([graphpad.com release notes](https://www.graphpad.com/updates/prism-1003-release-notes), `gpsupport-rn-1003-3`)
  - “(Windows) Fixed the data loss issue in which values containing spaces as group delimiters were partially pasted into Prism’s data table when space was defined as a grouping symbol in Windows regional settings” ([graphpad.com release notes](https://www.graphpad.com/updates/prism-831-release-notes), `gpsupport-rn-831-1`)
  - “Fixed the issue when the data table format unexpectedly changed from 'Mean & SD' to 'Mean & %CV' after saving the file in the .prism format.” ([graphpad.com release notes](https://www.graphpad.com/updates/prism-10-3-0-release-notes), `gpsupport-rn-1030-10`)
  - *For OpenDose:* aim the pinned cross-checks (`docs/prism-validation.md`, the validation page) at exactly these spots (two-way post hoc families, Dunnett after two-way, GG-corrected P, profile CIs, locale paste, project round-trips) and recompute stored results on reopen (`stable-results-versions`).

**4. Price is the trigger for looking elsewhere; the graph editor is what keeps people.** 128 observations from 13 venues are about price or licences (subscriptions, per-machine fees, expired trials, pirated copies), but when users explain why they still return to the paid tool, they name its graphs and its plot editor, and 72 of the 233 competitor-tracker observations (31%) are graph requests.
  - “Following the recent announcement that GraphPad Prism will now require subscriptions, the HAB will be offering a new series of hands-on workshops for non-coders.” ([hab.sites.er.kcl.ac.uk](https://hab.sites.er.kcl.ac.uk/?p=2312), `blog-kclhab-prismtor-1`)
  - “Due to high demand and license cost increase from the vendor, a GraphPad license is now charged $150/year/machine (60% discount compared to public pricing). Students can receive one license for one machine per year for free upon request.” ([library.weill.cornell.edu](https://library.weill.cornell.edu/graphpad-prism), `courses-weill-licence-cost`)
  - “The major advantage of GraphPad Prism over Jamovi is its integrated plot editor. It is also quite easy to assign the same plot design to multiple plots or arrange several plots on one page for a combined graph.” ([forum.jamovi.org](https://forum.jamovi.org/viewtopic.php?t=4043), `competitor-jamovi-4043`)
  - “I know this sounds picky, but after using a plotting program such as GraphPad Prism, one becomes accustomed to the luxury of direct plot editing.” ([forum.jamovi.org](https://forum.jamovi.org/viewtopic.php?t=401), `competitor-jamovi-401`)
  - *For OpenDose:* being free brings the first visit; direct graph editing and style reuse (`graph-direct-editing`, `graph-style-reuse`) decide the second, which is why they belong in the planned UI/UX pass with Eren.

**5. Most of the demand is already met; what is missing is the path to it.** 2,274 of 3,666 observations (62%) fall in needs OpenDose already meets, and 13 of the 20 highest-scoring needs are done. 8 done needs (231 observations) are ones users ask for in places where OpenDose does not offer them: `design-first-test-chooser`, `power-sample-size`, `hazard-ratio-cox`, `validated-results`, `prism-files`, `estimation-plots`, `superplots`, `templates-new-data`. One is hidden by our own text: the survival recommendation in `web/src/guide/recommend.ts` still says Cox regression is "not in OpenDose yet", although the README lists Cox regression with hazard ratios.
  - “The Analyze dialog asks plain questions (how many groups, paired, assume normal?) and suggests the test, explaining why; jargon explained in place.” ([github.com/BooneAndrewsLab/BarelySig](https://github.com/BooneAndrewsLab/BarelySig/issues/29), `competitor-barelysig-29`)
  - “There's also the ... corresponding online tool ... that you can use to plot your data if you are not proficient with coding to do it yourself.” ([forum.image.sc](https://forum.image.sc/raw/54089), `imagesc-54089-2`)
  - “Yes! Power analysis and sample size calculations are now available through Prism Cloud.” ([graphpad.com FAQ](https://www.graphpad.com/support/faq/can-prism-perform-sample-size-and-power-calculations/), `gpsupport-faq-43`)
  - *For OpenDose:* the cheapest wave of improvements is discoverability (IMPROVEMENT-PLAN.md marks these items).

**6. Each venue sees a different failure, so no single venue is a fair sample.** In the literature 73% of observations are silent wrong results, in consulting FAQs 55% and in journal rules 52%; in software reviews only 7% are, while 30% are cosmetic and 46% are about speed. Users who are stuck show up in forums (29% blocked), non-English communities (27%) and YouTube comments (26%). Reviewers judge convenience; the papers count the harm; beginners report the wall they hit.
  - *For OpenDose:* convenience wins reviews and wrong results lose papers, so safe defaults must cost no clicks. The ranking formula multiplies by venue breadth for this reason.

**7. Incomplete dose-response curves produce the same questions in English, Chinese and Korean, and some answers invent data.** The needs about undefined plateaus, extrapolated IC50s, failed or ambiguous fits, the zero-dose control and dose design hold 87 observations from 12 venues (27 YouTube comments; Chinese, Korean posts). Tutorial comment threads show users told to add a concentration they never tested, or to replace the vehicle's zero with an arbitrary number; the toxicology literature shows that normalising to a deviating control biases the curve.
  - “what if I tested my sample at different concentration and none of the concentrations inhibit 50% does that mean I wont be able to calculate the IC50 or it just means I will have an extremely high IC50 value?” ([youtube.com](https://www.youtube.com/watch?v=CD9CZjzDTEE&lc=UgxunbzCG56LnwkXmDF4AaABAg), `youtube-CD9CZjzDTEE-UgxunbzCG56LnwkXmDF4AaABAg`)
  - “Impossible, however u can virtualy take 4th conc sime where in between these three and can plot but that might effect IC50 slightly” ([youtube.com](https://www.youtube.com/watch?v=AEJvkrl7NsU&lc=Ugzke5JJYCXwPBG7aBJ4AaABAg.A2PgvkdHvaiA2Ytud4rCuC), `youtube-AEJvkrl7NsU-Ugzke5JJYCXwPBG7aBJ4AaABAg.A2PgvkdHvaiA2Ytud4rCuC`)
  - “graphpad prism 5로 IC50를 구했는데 IC50 값 앞에 ~표시가 있어서 어떤 의미인지 알고 싶습니다.” ([ibric.org](https://www.ibric.org/bric/search.do?qt=graphpad&menu=%EC%BB%A4%EB%AE%A4%EB%8B%88%ED%8B%B0&section=%EC%BB%A4%EB%AE%A4%EB%8B%88%ED%8B%B0%7BQ_A%7D), `nonen-ko-tilde-ic50-1`) *(Gloss: 'I got an IC50 in GraphPad Prism 5 and there is a ~ sign in front of the value; what does it mean?' — Problem: the 'ambiguous fit' marker is not self-explanatory. (BRIC Q&A detail pages return an empty body to the fetcher; quote is from the question text shown on BRIC's own search-results page))*
  - “The negative control data sometimes deviate from the values measured for low (ineffective) test compound concentrations. In such cases, normalization of the data with respect to control values leads to biased estimates of the parameters of the concentration-response curve. Low quality estimates of effective concentrations can be the consequence. In a literature study, we found that this problem occurs in a large percentage of toxicological publications.” ([Archives of Toxicology](https://pmc.ncbi.nlm.nih.gov/articles/PMC7603474/), `lit-devctrl2020-1`)
  - *For OpenDose:* report '> highest dose' instead of an extrapolated number (`incomplete-curve-flags`), let vehicle wells define the plateau (`zero-dose-control`) and advise on dose spacing before the experiment (`dose-design-advice`).

**8. Competing tools converge on the same backlog, so table stakes are shared and the difference must come from elsewhere.** The most frequent needs in competitor trackers are `brackets-from-analysis` (10), `free-access` (9), `journal-export-presets` (8), `nested-mixed-models` (7), `error-bar-choice` (7), `show-every-point` (6): brackets drawn from the analysis, being free, journal export, nested data, error-bar choice and showing the points. JASP and jamovi users ask for brackets, compact letters and Prism-file import; the newest browser tool lists the same features OpenDose ships.
  - “How can I add a significance brackets with * between boxplots? Can this be done automatically by JASP? Or do you really all do it afterwards in an image editor?” ([forum.cogsci.nl (JASP forum)](https://forum.cogsci.nl/discussion/9495/figures-in-jasp), `competitor-jaspforum-9495`)
  - “Especially with a lot of comparisons (i.e. with >5 treatments) it is quite tough to manually calculate the letter-based grouping (necessary for graphs and tables), while it would/could be quite simple automatically.” ([github.com/jasp-stats/jasp-issues](https://github.com/jasp-stats/jasp-issues/issues/342), `competitor-jasp-342`)
  - “I would like to know if there is any (except scripting by hand in R) way of importing Graphpad files into Jamovi This would help a lot of my students to switch...” ([forum.jamovi.org](https://forum.jamovi.org/viewtopic.php?t=1232), `competitor-jamovi-1232`)
  - *For OpenDose:* match the table stakes (done for most), and compete on what the corpus says no tool does well: design-level guidance about n and replicates, validation against reference values, and reporting that journals accept without retyping.

**9. Reporting guidelines alone barely move practice; checks inside the tool might.** Several audits in the corpus measure compliance before and after a journal policy and find little change. The British Journal of Pharmacology's own audit found n ≥ 5 in 73%, a randomisation statement in 38%, a blinding statement in 35%, a correct post hoc test in 69% of submissions (`journal-bjp-design-8`). Authors of those audits ask for the checks to live in the analysis software.
  - “Reporting of the Landis 4 items The proportion of NPG in vivo studies reaching full compliance with the Landis 4 criteria increased from 0% (0/203) to 16.4% (31/189) (Χ²=36.1, df=1, p=1.8×10 −9 ), but remained significantly lower than the target of 80% (95% CI 11.6% to 22.6%, Wald test versus 80% z=−15.4, p=2.2×10 −16 ).” ([BMJ Open Science](https://pmc.ncbi.nlm.nih.gov/articles/PMC8647608/), `lit-npqip2019-landis`)
  - “There was no evidence that reporting practices improved following publication of the editorial advice.” ([PLOS One](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0202121), `lit-diong2018-4`)
  - “The main lesson learnt (from internal journal audit) that we may now share is that the guidelines that have been journal requirements since 2015 are not being routinely followed by authors and this is being missed during the peer review process.” ([British Journal of Pharmacology](https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/), `lit-curtis2018-noncompliance`)
  - *For OpenDose:* the journal checklists are already filled from the project (README › Reporting); the missing pieces are the design facts they ask for (randomisation, blinding, exclusions: `design-reporting-capture`, `exclusion-log`).

**10. Non-English communities ask the same statistical questions, plus two of their own: language and legal access.** 101 of 126 non-English observations (80%) fall in needs that English-language venues raise at least ten times (Chinese 44, Japanese 26, Korean 22, German 18, French 8, Portuguese 4, Turkish 2, Spanish 2). The needs where non-English observations outnumber English ones are `localised-ui`: the interface language (7 observations) and, within access (7), trial copies passed between students, cracked installers with high view counts and localised editions at a premium. Compact letter displays recur too.
  - “最近处理数据临时突击了一下，怎奈何没有中文版以及中文使用说明，好在英文马马虎虎，照着帮助中的英文，对其中要用到的非线性回归的做法狠看了一遍” ([muchong.com](https://muchong.com/bbs/search.php?wd=graphpad&fid=0&search_type=&adfilter=0&order=2&mode=5&page=6), `nonen-zh-no-chinese-1`) *(Gloss: 'I crammed it for my data recently, but there is no Chinese version or Chinese manual; luckily my English is so-so, so I read the English help on nonlinear regression hard.' — Problem: English-only software and help slows learning. (thread body is login-walled; quote is the public snippet shown on the site's own search-results page))*
  - “我的是一个师兄给传的，没想到是试用版30天过期了，他人也走了，我下了好多其他的都说有病毒” ([muchong.com](https://muchong.com/bbs/search.php?wd=graphpad&fid=0&search_type=&adfilter=0&order=2&mode=5&page=2), `nonen-zh-trial-expired-1`) *(Gloss: 'Mine was passed to me by a senior labmate; it turned out to be a 30-day trial that expired, he has left, and the other copies I downloaded were reported as viruses.' — Problem: access depends on informal copies; licence lapses mid-project. (thread body is login-walled; quote is the public snippet shown on the site's own search-results page))*
  - “同ソフトは、DeltaGraf経験者であれば、完全日本語版（14万円台と高価）でなくても、日本語サポート版や英語版でも、使用は可能でしょうか。” ([chiebukuro.yahoo.co.jp](https://detail.chiebukuro.yahoo.co.jp/qa/question_detail/q10144304665), `nonen-ja-japanese-version-price-1`) *(Gloss: 'For someone experienced with DeltaGraph, could I use the Japanese-support or English version rather than the fully Japanese version (expensive, ~¥140,000)?' — Problem: the localised edition costs more, forcing a trade-off between language and price.)*
  - “모든 실험군이 컨트롤과 차이가 없으니 a를 공유해야 하는 것 아닌가요” ([ibric.org](https://www.ibric.org/bric/search.do?qt=%ED%86%B5%EA%B3%84%20%EA%B2%80%EC%A0%95&menu=%EC%BB%A4%EB%AE%A4%EB%8B%88%ED%8B%B0&section=%EC%BB%A4%EB%AE%A4%EB%8B%88%ED%8B%B0%7BQ_A%7D), `nonen-ko-letters-control-1`) *(Gloss: 'Since no group differs from the control, shouldn't they all share the letter a?' — Problem: converting many post-hoc results into compact letters by hand is confusing. (BRIC Q&A detail pages return an empty body to the fetcher; quote is from the question text shown on BRIC's own search-results page))*
  - *For OpenDose:* free and in the browser already answers access; localisation of the wizard, explainers and banners (`localised-ui`, effort L) is the one need here that nothing in the roadmap covers.

## Index of all needs

| Rank | Need | Workflow | Score | Obs | Venues | Status | Effort |
|---:|---|---|---:|---:|---:|---|---|
| 1 | Tell me which test fits my design before I run anything `design-first-test-chooser` | Choosing the test | 100.0 | 51 | 14 | done | S |
| 2 | Tell me what n = 1–3 can and cannot show, and refuse P values when there is one independent value `small-n-honesty` | Replicates, n and experimental units | 99.0 | 45 | 14 | partial | S |
| 3 | Nested t test, nested ANOVA or a mixed model with animal, litter or culture as a random effect, without code `nested-mixed-models` | Replicates, n and experimental units | 98.7 | 75 | 11 | partial | L |
| 4 | Ask what the independent unit is (animal, culture, experiment) and compute n from it `declare-experimental-unit` | Replicates, n and experimental units | 91.0 | 69 | 11 | partial | S |
| 5 | A free tool I can use legally, without licences, trials or seat limits `free-access` | Access: price, platforms, privacy and language | 86.4 | 98 | 12 | done | S |
| 6 | Fit a dose-response curve and get the IC50 without Excel Solver, macros or code `ic50-no-code-fit` | Dose-response and curve fitting | 82.6 | 58 | 10 | done | S |
| 7 | Paste from Excel exactly: blanks stay missing, decimals and IDs are never mangled `excel-paste-fidelity` | Data entry and import | 81.8 | 45 | 9 | partial | S |
| 8 | Check assumptions sensibly: residual QQ plots, not a normality-test P that gates the test `assumption-checks-residuals` | Assumptions, nonparametric tests and transforms | 81.5 | 38 | 12 | partial | S |
| 9 | A point-and-click tool as quick as Excel, with no coding and a short learning curve `no-code-approachable` | Learning and guidance | 81.1 | 61 | 13 | done | S |
| 10 | Normalise to % or fold of control in one step that feeds the analyses `normalise-step` | Normalisation | 78.7 | 46 | 12 | done | S |
| 11 | Analyse ratios and skewed positive data on the log scale and report back-transformed fold changes `log-scale-analysis` | Assumptions, nonparametric tests and transforms | 78.0 | 45 | 11 | partial | M |
| 12 | Ask whether the same subjects were measured repeatedly and choose a paired or repeated-measures analysis `repeated-measures-detection` | Choosing the test | 78.0 | 39 | 10 | done | S |
| 13 | Interpolate unknowns from a standard curve (ELISA, BCA, copies), with dilution factors `standard-curve-interpolation` | Standard curves, plate readers and assay QC | 75.8 | 46 | 10 | done | S |
| 14 | Work out how many animals or replicates I need, with a justification sentence `power-sample-size` | Planning: power, randomisation and blinding | 72.8 | 58 | 10 | done | S |
| 15 | ΔΔCt from the instrument export to fold change and statistics, with the reference and direction stated `qpcr-ddct-workflow` | qPCR | 70.9 | 41 | 10 | done | S |
| 16 | Name the exact test variant: paired or not, Welch, tails, exact or approximate `test-variant-named` | Reporting: P values, effect sizes, methods and legends | 68.9 | 35 | 11 | done | S |
| 17 | From band intensities to normalised fold change and statistics in one place `wb-densitometry-workflow` | Western blots, images and densitometry | 68.4 | 49 | 9 | done | S |
| 18 | Runs on any computer (Mac, Windows, Linux, tablet), with no install, even offline `runs-anywhere` | Access: price, platforms, privacy and language | 68.1 | 42 | 9 | done | S |
| 19 | Treat each independent experiment (day, plate, run) as a block instead of pooling or normalising it away `experiment-as-block` | Replicates, n and experimental units | 67.7 | 35 | 8 | partial | S |
| 20 | Warn me when my n is cells, wells or repeated reads rather than independent units `pseudoreplication-warning` | Replicates, n and experimental units | 66.3 | 26 | 11 | done | S |
| 21 | Stay fast with tens of thousands of rows and points `large-data` | Data entry and import | 66.1 | 43 | 11 | partial | M |
| 22 | Explain why my number differs from Prism, R, SPSS or Excel `numbers-differ-explained` | Trust and validation | 66.1 | 27 | 9 | done | S |
| 23 | Pick the post hoc test from my question: each vs control (Dunnett), all pairs (Tukey), a few planned pairs (Šídák) `posthoc-by-question` | Multiple comparisons | 65.9 | 37 | 8 | done | S |
| 24 | Sensible constraints and automatic starting values so the fit converges `constraints-initial-values` | Dose-response and curve fitting | 65.7 | 23 | 10 | done | S |
| 25 | Significance brackets drawn from the analysis I ran, stacked automatically, on any graph `brackets-from-analysis` | Graphs: formatting, figures and export | 65.2 | 75 | 10 | done | S |
| 26 | Exclusions need a reason, stay visible and are reported (n enrolled vs analysed) `exclusion-log` | Reproducibility, provenance and sharing | 64.1 | 29 | 10 | partial | S |
| 27 | Average technical replicates to one value per biological unit before testing `collapse-technical-replicates` | Replicates, n and experimental units | 63.6 | 25 | 9 | done | S |
| 28 | Recognise two or more factors and set up two-way (factorial) ANOVA instead of many t tests `two-factor-recognition` | ANOVA, repeated measures and mixed models | 63.4 | 22 | 10 | done | S |
| 29 | Choose SD, SEM or CI by purpose, with SD (or the points) by default `error-bar-choice` | Graphs: what to plot | 63.2 | 47 | 11 | done | S |
| 30 | Record every point-and-click step as a re-runnable recipe or script `analysis-replay` | Reproducibility, provenance and sharing | 63.1 | 32 | 12 | partial | M |
| 31 | Enter survival data simply (dates, deaths per day, event yes/no) and preview how each row is read `survival-data-entry` | Survival | 61.7 | 21 | 10 | partial | S |
| 32 | Correct only for the comparisons I planned (my family), not for every pair `planned-comparisons-family` | Multiple comparisons | 61.4 | 22 | 9 | partial | M |
| 33 | Flag IC50s outside the tested range or from undefined plateaus, and report them as '> top dose' `incomplete-curve-flags` | Dose-response and curve fitting | 60.8 | 20 | 9 | partial | S |
| 34 | An open, documented project format that every version opens and never corrupts `open-file-format` | Reproducibility, provenance and sharing | 60.3 | 32 | 10 | done | S |
| 35 | Show every data point by default instead of a bar of the mean `show-every-point` | Graphs: what to plot | 59.5 | 70 | 13 | done | S |
| 36 | Effect sizes with confidence intervals next to every P value `effect-size-ci` | Reporting: P values, effect sizes, methods and legends | 59.4 | 29 | 10 | done | S |
| 37 | Help me pick the table layout from my experiment, and let me change it later without losing data `table-layout-chooser` | Data entry and import | 58.5 | 24 | 11 | partial | S |
| 38 | Fix the analysis plan before seeing the data and log every later change `preregistration-plan` | Reproducibility, provenance and sharing | 58.4 | 17 | 9 | missing | M |
| 39 | Time courses and longitudinal data: a mixed model with sensible covariance, AUC or a summary measure per subject `time-course-models` | ANOVA, repeated measures and mixed models | 58.1 | 23 | 10 | partial | L |
| 40 | When I ask whether an effect differs between groups, run and explain the interaction test `interaction-question` | ANOVA, repeated measures and mixed models | 57.9 | 19 | 10 | partial | M |
| 41 | Repeated measures with missing values: fit a mixed model instead of dropping subjects `rm-missing-mixed-model` | ANOVA, repeated measures and mixed models | 57.3 | 26 | 8 | done | S |
| 42 | Vector export (SVG, PDF) that opens editable in Illustrator or Inkscape `vector-export` | Graphs: formatting, figures and export | 56.3 | 39 | 11 | done | S |
| 43 | Say whether each P is adjusted, by which method, and show the unadjusted value beside it `adjusted-vs-raw-labelled` | Multiple comparisons | 56.2 | 26 | 9 | partial | S |
| 44 | Dunn's (or Conover) after Kruskal-Wallis or Friedman, including each vs control only `nonparametric-posthoc` | Assumptions, nonparametric tests and transforms | 56.0 | 29 | 8 | partial | S |
| 45 | Run qPCR statistics on ΔCt and back-transform fold changes with asymmetric error bars `qpcr-stats-log-scale` | qPCR | 55.7 | 23 | 7 | done | S |
| 46 | Hazard ratios with CIs and Cox regression with covariates `hazard-ratio-cox` | Survival | 55.4 | 31 | 8 | done | S |
| 47 | Compare EC50s or whole curves between conditions with one test and a ratio with its CI `compare-curves-ec50` | Dose-response and curve fitting | 55.2 | 26 | 7 | partial | M |
| 48 | When a fit fails or is ambiguous, tell me why in plain words and what to try `fit-failure-explained` | Dose-response and curve fitting | 54.4 | 19 | 7 | done | S |
| 49 | Correct for multiple comparisons by default and notice when I run many separate t tests `multiplicity-by-default` | Multiple comparisons | 54.3 | 21 | 10 | partial | S |
| 50 | Many parallel tests (genes, rows, markers) with false discovery rate control `fdr-many-features` | Multiple comparisons | 54.2 | 22 | 8 | done | S |
| 51 | Fisher, chi-square and McNemar tests with odds ratios and the right test for small counts `contingency-tests` | Other analyses | 54.0 | 19 | 9 | done | S |
| 52 | Show me the tool is validated against reference software so I can trust the numbers `validated-results` | Trust and validation | 53.5 | 23 | 8 | done | S |
| 53 | Primer efficiency from a dilution series and efficiency-corrected (Pfaffl) quantification `qpcr-efficiency` | qPCR | 52.4 | 22 | 8 | done | S |
| 54 | Accept long (tidy) or wide data and convert between them `long-wide-tidy` | Data entry and import | 52.3 | 29 | 9 | done | S |
| 55 | Print the exact n per group (after exclusions and missing values) with its unit `n-in-output` | Reporting: P values, effect sizes, methods and legends | 52.0 | 20 | 9 | done | S |
| 56 | Reopened analyses give the same numbers, and I am told if a version changed them `stable-results-versions` | Reproducibility, provenance and sharing | 50.8 | 26 | 6 | partial | S |
| 57 | Kaplan-Meier curves with the log-rank test in the same tool as the rest of my statistics `km-logrank` | Survival | 50.7 | 24 | 8 | done | S |
| 58 | Generate the methods / statistical-analysis paragraph from what I actually ran `methods-text` | Reporting: P values, effect sizes, methods and legends | 49.8 | 24 | 10 | done | S |
| 59 | Assemble multi-panel figures with panel letters, shared axes and one font size `multi-panel-layout` | Graphs: formatting, figures and export | 49.8 | 41 | 12 | done | S |
| 60 | Outlier tests that are valid (ROUT, Grubbs, robust), with caveats for small n `outlier-detection` | Reproducibility, provenance and sharing | 49.6 | 16 | 8 | done | S |
| 61 | Apply and explain the Geisser-Greenhouse correction automatically `sphericity-correction` | ANOVA, repeated measures and mixed models | 49.4 | 12 | 7 | done | S |
| 62 | Handle unequal SDs: Welch's t test and Welch's ANOVA, explained, as the safe default `welch-unequal-sd` | Assumptions, nonparametric tests and transforms | 48.3 | 17 | 8 | done | S |
| 63 | Explain each result in plain words: what it means and how it is often misread `plain-language-results` | Learning and guidance | 48.1 | 17 | 9 | partial | M |
| 64 | Judge a fit by residuals, the replicates test and CI width, not R² alone `fit-diagnostics-beyond-r2` | Dose-response and curve fitting | 47.9 | 19 | 9 | done | S |
| 65 | Don't lose the control's variability after normalising; test ratios properly `normalised-control-variance` | Normalisation | 47.8 | 14 | 7 | done | S |
| 66 | Always state what the error bars are, and the n, on the graph and in the legend `error-bar-labelled` | Graphs: what to plot | 47.4 | 20 | 8 | done | S |
| 67 | Draft the figure legend from the graph: what is plotted, error bars, n and test `figure-legend` | Reporting: P values, effect sizes, methods and legends | 47.3 | 23 | 8 | done | S |
| 68 | Several reference genes with a stability check before normalising `qpcr-reference-genes` | qPCR | 47.3 | 18 | 6 | partial | M |
| 69 | Open my Prism files without a licence, and send work back to Prism users `prism-files` | Data entry and import | 46.1 | 14 | 7 | done | S |
| 70 | From a plate-reader export to a plate map, blanks and % of control in one step `plate-map-normalise` | Standard curves, plate readers and assay QC | 46.0 | 22 | 7 | done | S |
| 71 | Median survival with CI, explained when 'not reached', and survival at a chosen time `median-survival-explained` | Survival | 44.7 | 16 | 8 | partial | S |
| 72 | LD50/LC50 from dead/alive counts (probit, logit) and any ECx with its CI `quantal-ld50-ecx` | Dose-response and curve fitting | 44.4 | 17 | 6 | done | S |
| 73 | Put graphs and results into PowerPoint and Word, editable `office-export` | Graphs: formatting, figures and export | 43.4 | 19 | 10 | missing | M |
| 74 | Never silently drop data or compute a wrong result; show warnings next to the output `fail-loudly` | Trust and validation | 42.8 | 15 | 6 | partial | S |
| 75 | Import instrument exports directly (plate readers, qPCR, LabChart, Incucyte) `instrument-import` | Data entry and import | 42.2 | 19 | 9 | partial | M |
| 76 | Recommend the model from the data (direction, 3PL/4PL/5PL, fixed slope) and explain the choice `model-choice-guidance` | Dose-response and curve fitting | 41.8 | 15 | 6 | done | S |
| 77 | Flag samples outside the standards (<LLOQ, >ULOQ) and show back-calculated recovery per standard `standard-curve-qc` | Standard curves, plate readers and assay QC | 41.2 | 13 | 6 | done | S |
| 78 | Pairwise comparisons after repeated-measures or mixed ANOVA that keep the matching `rm-posthoc` | Multiple comparisons | 40.9 | 13 | 5 | partial | M |
| 79 | Binding and Ki models: Cheng-Prusoff, Schild/pA2, tight binding; potency vs affinity `binding-ki-models` | Dose-response and curve fitting | 40.7 | 20 | 5 | done | S |
| 80 | Keep the raw, uncropped image and every adjustment linked to the numbers `raw-image-provenance` | Western blots, images and densitometry | 40.6 | 11 | 6 | missing | L |
| 81 | Share a project with people who don't have the software `share-with-collaborators` | Reproducibility, provenance and sharing | 40.2 | 24 | 7 | done | S |
| 82 | Import per-cell and per-image tables (Fiji, CellProfiler, QuPath), many files at once, condition from file names `image-table-import` | Western blots, images and densitometry | 40.0 | 27 | 7 | partial | M |
| 83 | Explain why ANOVA is significant but no pair is (or the reverse) `omnibus-posthoc-disagree` | Multiple comparisons | 39.2 | 12 | 8 | done | S |
| 84 | Explanations at the point of choice, tied to my data `in-context-explainers` | Learning and guidance | 38.9 | 23 | 9 | done | S |
| 85 | Before-after lines or paired differences for paired and repeated data `paired-plots` | Graphs: what to plot | 38.5 | 19 | 6 | done | S |
| 86 | Take FlowJo gate statistics (% of parent, MFI) across replicates straight into tests and graphs `flow-stats-to-tests` | Flow cytometry | 37.9 | 23 | 8 | partial | M |
| 87 | Enter mean, SD (or SEM) and n and still get tests and error bars `summary-data-input` | Data entry and import | 37.9 | 17 | 7 | done | S |
| 88 | A publication Kaplan-Meier figure: censor ticks, aligned at-risk table, nudged curves `km-figure` | Survival | 37.8 | 28 | 6 | done | S |
| 89 | Exact P values everywhere, formatted to my journal's style `exact-p` | Reporting: P values, effect sizes, methods and legends | 37.5 | 37 | 9 | done | S |
| 90 | Check my design before the experiment: controls, replicates, units `design-stage-checks` | Planning: power, randomisation and blinding | 37.4 | 14 | 5 | partial | M |
| 91 | Volcano plots and clustered heat maps from my results tables `volcano-heatmap` | Graphs: formatting, figures and export | 37.1 | 24 | 7 | done | S |
| 92 | Handle unequal n and missing values, and tell me what was dropped `missing-values-handling` | Data entry and import | 37.0 | 10 | 6 | partial | S |
| 93 | After two-way ANOVA: simple effects within each row, or each group vs control within each level `twoway-posthoc-families` | Multiple comparisons | 36.9 | 16 | 5 | done | S |
| 94 | Pairwise log-rank comparisons with multiplicity correction, and a trend test `pairwise-logrank` | Survival | 36.8 | 16 | 5 | partial | S |
| 95 | Say in the results and the methods which test was run and why it fits `explain-test-choice-in-output` | Choosing the test | 36.7 | 10 | 7 | partial | S |
| 96 | Confidence and prediction bands and weighting options, clearly labelled `bands-weighting` | Dose-response and curve fitting | 36.4 | 18 | 5 | done | S |
| 97 | Check the linear range and saturation before quantifying bands `wb-linear-range` | Western blots, images and densitometry | 36.2 | 16 | 4 | missing | M |
| 98 | Export the full fit report: equation, constraints, initial values, weighting and every parameter with SE and CI `fit-report-complete` | Dose-response and curve fitting | 36.1 | 10 | 8 | partial | S |
| 99 | When X is a dose or time, model the whole curve instead of testing every dose or time point `dose-time-not-per-point` | Choosing the test | 35.3 | 13 | 5 | partial | S |
| 100 | A route for non-normal two-factor or repeated designs (aligned rank transform, permutation, transform) `nonparam-factorial` | Assumptions, nonparametric tests and transforms | 35.1 | 8 | 5 | missing | M |
| 101 | Estimation plots: the difference and its CI with all the data `estimation-plots` | Reporting: P values, effect sizes, methods and legends | 34.8 | 16 | 9 | done | S |
| 102 | Enzyme kinetics: Michaelis-Menten fits and initial rates from kinetic reads `enzyme-kinetics-rates` | Dose-response and curve fitting | 34.6 | 17 | 6 | partial | M |
| 103 | Start from my goal ('I want an IC50') and be walked through the assay `guided-assay-workflows` | Learning and guidance | 34.6 | 13 | 7 | done | S |
| 104 | PCA and clustering without code `pca-clustering` | Other analyses | 34.2 | 17 | 7 | done | S |
| 105 | SuperPlots: every cell coloured by experiment, experiment means on top, statistics on the means `superplots` | Replicates, n and experimental units | 34.0 | 23 | 9 | done | S |
| 106 | Method comparison: Bland-Altman limits of agreement, Deming or Passing-Bablok `method-comparison` | Other analyses | 33.9 | 16 | 5 | done | S |
| 107 | Word non-significant results honestly (inconclusive, with the CI), never 'trend' `nonsig-wording` | Reporting: P values, effect sizes, methods and legends | 33.2 | 15 | 7 | partial | S |
| 108 | Explain relative vs absolute IC50 and report the one I mean `relative-absolute-ic50` | Dose-response and curve fitting | 33.0 | 11 | 4 | done | S |
| 109 | Capture randomisation, blinding, exclusions, sample-size rationale and subject details, and print them in methods `design-reporting-capture` | Reporting: P values, effect sizes, methods and legends | 32.3 | 22 | 4 | partial | S |
| 110 | A copy-ready results sentence with the statistic, df and exact P `results-sentence` | Reporting: P values, effect sizes, methods and legends | 31.7 | 10 | 7 | done | S |
| 111 | Fit my own equation with sensible starting values `custom-equations` | Dose-response and curve fitting | 31.2 | 7 | 5 | done | S |
| 112 | Export at the journal's size and DPI with the fonts at the right point size `journal-export-presets` | Graphs: formatting, figures and export | 31.2 | 23 | 8 | done | S |
| 113 | Template an analysis and its graph, and drop new runs of the same assay into it `templates-new-data` | Reproducibility, provenance and sharing | 30.8 | 15 | 8 | done | S |
| 114 | Fit many compounds or plates at once, with one IC50 table and failures isolated `batch-curve-fitting` | Dose-response and curve fitting | 30.5 | 11 | 7 | partial | M |
| 115 | Explicit rules for Undetermined Cts, no-template controls and discordant technical wells `qpcr-qc-nondetects` | qPCR | 29.6 | 8 | 4 | partial | S |
| 116 | Route counts, proportions and percentages to count models, not t tests on percentages `counts-proportions-routing` | Choosing the test | 29.0 | 18 | 4 | partial | M |
| 117 | Biphasic, bell-shaped and hormesis models when the curve is not monotonic `biphasic-models` | Dose-response and curve fitting | 28.7 | 8 | 4 | done | S |
| 118 | State the sum-of-squares type, contrast coding and error term so my ANOVA matches other software `anova-method-transparency` | ANOVA, repeated measures and mixed models | 28.6 | 13 | 4 | done | S |
| 119 | Compact letter display (a, b, c) from post hoc results on tables and graphs `compact-letter-display` | Multiple comparisons | 28.6 | 16 | 5 | done | S |
| 120 | Publication-ready graphs by default, without fighting the software `publication-defaults` | Graphs: formatting, figures and export | 28.0 | 26 | 9 | done | S |
| 121 | ROC curves with AUC, cut-offs and comparison of two markers `roc-analysis` | Other analyses | 28.0 | 8 | 4 | done | S |
| 122 | A blinded analysis mode that hides group names until decisions are locked `blinding-mode` | Planning: power, randomisation and blinding | 27.8 | 10 | 4 | missing | M |
| 123 | Something my course can require without students paying or pirating `teaching-use` | Learning and guidance | 27.8 | 11 | 7 | done | S |
| 124 | Carry units (µM, nM, days) from entry to axes, results and methods `units-in-data` | Data entry and import | 27.8 | 14 | 4 | missing | M |
| 125 | Worked examples and tutorials inside the tool `examples-tutorials` | Learning and guidance | 27.1 | 15 | 6 | done | S |
| 126 | Gating hierarchy, compensation and FCS provenance kept with the statistics `flow-gating-provenance` | Flow cytometry | 26.7 | 16 | 5 | missing | L |
| 127 | Lane and band detection with background subtraction on the image itself `image-quantification` | Western blots, images and densitometry | 26.7 | 10 | 4 | missing | L |
| 128 | Apply the same analysis to many files or subsets at once `batch-many-datasets` | Reproducibility, provenance and sharing | 26.5 | 15 | 7 | partial | M |
| 129 | Formula columns in the data table (ratios, derived variables) `calculated-columns` | Data entry and import | 26.0 | 11 | 5 | partial | M |
| 130 | Control axis ranges, ticks, number formats and long or rotated group labels `axis-label-control` | Graphs: formatting, figures and export | 25.8 | 24 | 7 | done | S |
| 131 | Pairwise comparisons of proportions after chi-square, and graphs of contingency tables `contingency-posthoc-graphs` | Other analyses | 25.0 | 7 | 4 | partial | S |
| 132 | Area under the curve with a chosen baseline and its uncertainty `auc-analysis` | Other analyses | 24.8 | 9 | 5 | done | S |
| 133 | Apply one style or theme to every graph in a project and reuse it in the next one `graph-style-reuse` | Graphs: formatting, figures and export | 24.8 | 19 | 8 | done | S |
| 134 | Use the zero-dose (vehicle) control in a log-dose fit without inventing a concentration `zero-dose-control` | Dose-response and curve fitting | 24.8 | 10 | 4 | partial | M |
| 135 | Three-way or N-way ANOVA from one long table, with custom contrasts `nway-anova-contrasts` | ANOVA, repeated measures and mixed models | 23.4 | 6 | 4 | partial | L |
| 136 | Spread conditions across plates and days, and warn when group and batch coincide `batch-confounding` | Planning: power, randomisation and blinding | 23.1 | 7 | 5 | partial | M |
| 137 | Growth curves: lag, growth rate and doubling time with CIs `growth-curves` | Other analyses | 22.9 | 10 | 5 | done | S |
| 138 | Ordinal scores (clinical scores, ratings) analysed as ordinal data `ordinal-scores` | Assumptions, nonparametric tests and transforms | 22.6 | 6 | 5 | partial | L |
| 139 | Compare slopes and intercepts of two regression lines `compare-slopes` | Other analyses | 22.4 | 11 | 5 | partial | S |
| 140 | Summarise IC50 across independent experiments (mean log IC50 with CI, n = experiments) `potency-across-experiments` | Dose-response and curve fitting | 22.3 | 9 | 4 | partial | S |
| 141 | Italics, Greek letters, µ, superscripts and equations in labels `rich-text-labels` | Graphs: formatting, figures and export | 22.3 | 13 | 5 | partial | S |
| 142 | Plate QC: Z′, control CVs, edge effects and a plate heat map `plate-qc` | Standard curves, plate readers and assay QC | 21.6 | 13 | 5 | done | S |
| 143 | Warn that a rank test with tiny groups cannot reach P < 0.05 `rank-test-small-n` | Assumptions, nonparametric tests and transforms | 21.3 | 6 | 3 | missing | S |
| 144 | Data, results and figures stay linked and update together `linked-live-results` | Reproducibility, provenance and sharing | 21.1 | 11 | 4 | done | S |
| 145 | Drug-combination synergy (Bliss, Loewe, HSA, ZIP) `synergy` | Other analyses | 20.9 | 5 | 3 | done | S |
| 146 | Pair values by an explicit subject ID, not by row order `pair-by-subject-id` | Trust and validation | 20.0 | 7 | 2 | partial | S |
| 147 | Limit of blank, detection and quantification from blanks and the curve `lod-loq` | Standard curves, plate readers and assay QC | 19.8 | 8 | 2 | partial | S |
| 148 | Stable software that autosaves and never loses work `stable-autosave` | Access: price, platforms, privacy and language | 19.8 | 14 | 4 | done | S |
| 149 | Compare groups adjusting for baseline (ANCOVA) instead of change scores or % of baseline `ancova-baseline` | Choosing the test | 19.7 | 8 | 3 | partial | M |
| 150 | Correlation with its scatter plot, fit line and r with CI `correlation-scatter` | Other analyses | 19.2 | 9 | 5 | done | S |
| 151 | Merge or join tables by an ID column `merge-tables` | Data entry and import | 18.9 | 6 | 5 | missing | M |
| 152 | My data never leaves my computer `privacy-local` | Access: price, platforms, privacy and language | 18.8 | 10 | 5 | done | S |
| 153 | Generate a recorded random allocation (simple, blocked, stratified) `randomisation-allocation` | Planning: power, randomisation and blinding | 18.8 | 6 | 4 | done | S |
| 154 | Export the numbers behind each figure panel as source data `source-data-export` | Reproducibility, provenance and sharing | 18.6 | 13 | 6 | partial | S |
| 155 | Edit graph elements directly by clicking them, with a live preview `graph-direct-editing` | Graphs: formatting, figures and export | 18.1 | 10 | 5 | partial | M |
| 156 | Colour-blind-safe palettes by default and a preview of how the figure looks with CVD `colour-blind-safe` | Graphs: formatting, figures and export | 17.8 | 23 | 11 | done | S |
| 157 | Let me click a result and see the inputs and intermediate steps `show-intermediate-values` | Trust and validation | 17.7 | 6 | 4 | partial | M |
| 158 | Keep summary and graph consistent with the test (medians with rank tests) and say what the test compares `summary-matches-test` | Assumptions, nonparametric tests and transforms | 17.3 | 7 | 4 | partial | S |
| 159 | Simple and multiple logistic regression `logistic-regression` | Other analyses | 16.5 | 6 | 3 | done | S |
| 160 | Power for nested, multi-group and other complex designs by simulation `power-complex-designs` | Planning: power, randomisation and blinding | 16.4 | 7 | 4 | partial | M |
| 161 | Interface and help in my language `localised-ui` | Access: price, platforms, privacy and language | 15.3 | 10 | 3 | missing | L |
| 162 | Log axes with readable ticks in real units `log-axes` | Graphs: formatting, figures and export | 14.8 | 10 | 5 | done | S |
| 163 | Tell me before the experiment how many doses, what range and spacing a good IC50 needs `dose-design-advice` | Dose-response and curve fitting | 14.6 | 4 | 2 | missing | S |
| 164 | Bars start at zero; warn when an axis is truncated or bars sit on a log axis `bar-axis-zero` | Graphs: what to plot | 13.4 | 7 | 5 | partial | S |
| 165 | Several XY series with their own X values on one graph `per-series-x` | Graphs: formatting, figures and export | 12.8 | 3 | 2 | partial | M |
| 166 | Axis breaks with chosen segments on either axis `axis-breaks` | Graphs: formatting, figures and export | 12.6 | 10 | 7 | partial | S |
| 167 | Propagate error through background subtraction, ratios and normalisation `error-propagation` | Normalisation | 12.3 | 6 | 2 | partial | M |
| 168 | Cite the software and its version in every export `software-citation` | Reporting: P values, effect sizes, methods and legends | 12.0 | 9 | 5 | done | S |
| 169 | Assay validation: spike recovery, dilution linearity, intra- and inter-assay CV, parallelism `assay-validation-suite` | Standard curves, plate readers and assay QC | 11.9 | 4 | 2 | partial | M |
| 170 | One statistics table for every test in the project (figure panel, test, n, statistic, df, exact P, CI) `stats-table-export` | Reporting: P values, effect sizes, methods and legends | 11.5 | 7 | 3 | partial | S |
| 171 | Don't compute 'observed power' after the fact; show the CI and a prospective calculation `no-post-hoc-power` | Planning: power, randomisation and blinding | 10.8 | 3 | 3 | partial | S |
| 172 | Mark the IC50 on the graph and show the fitted equation and values `ic50-graph-markers` | Dose-response and curve fitting | 8.0 | 5 | 4 | partial | S |
| 173 | Give each plate its own plate map and standard curve `per-plate-curves` | Standard curves, plate readers and assay QC | 7.9 | 3 | 3 | partial | M |
| 174 | How many events I need for a target CV, and the CI of a gated percentage `flow-event-counts` | Flow cytometry | 6.2 | 4 | 2 | missing | S |
| 175 | Label normalised axes correctly ('fold of control mean' vs 'fold of matched control') `normalised-axis-label` | Normalisation | 5.1 | 4 | 3 | missing | S |
| 176 | Keep each group's colour the same across every graph and panel `consistent-group-colours` | Graphs: what to plot | 4.6 | 3 | 2 | partial | S |
| 177 | Control legends: titles, position, order and visibility `legend-control` | Graphs: formatting, figures and export | 3.5 | 6 | 2 | done | S |
| 178 | Keyboard, screen-reader, contrast and dark-mode support `accessibility` | Access: price, platforms, privacy and language | 2.9 | 3 | 1 | done | S |
