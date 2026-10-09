# Journal and funder statistical reporting requirements: needs digest

Venue: published author instructions, reporting checklists, editorials announcing statistics policies, minimum-information standards and funder guidance. Each required item is recorded as an observation: the quote is the verbatim requirement, `problem` is what authors routinely fail to do (or what the rule forces them to produce), and `need` is what an analysis/graphing tool would have to output to make the item reportable.

File: `journal-requirements.json`, 160 observations from 46 pages and 37 distinct requirement sources (journals, publishers, guideline bodies and funders). `verify.py` reports `160 observations, 0 with problems`.

## 1. Coverage

**How sources were found.** Direct URLs for the sources in the brief, 9 WebSearch queries (J Physiol statistics policy, JBC "Collecting and presenting data", eLife transparent reporting form, MRC reproducibility annex, BMJ statistician's checklist, ASPET/Michel-Murphy-Motulsky guidelines, J Neurosci statistical table, Cell Press STAR Methods PDF), and about 20 PubMed Central E-utilities title searches to find open-access copies of policy editorials (BJP Curtis 2018, MDAR, MIQE 2.0, MIFlowCyt, Landis 2012, J Neurosci 2017, ARRIVE 2.0, CONSORT 2025, JCB 2004). Every quote comes from the text cached by `fetch.py`.

**Pages fetched and read: about 80 fetch attempts; 46 pages cited.**

| Requirement source (role) | Observations |
|---|---|
| journal requirement, ARRIVE 2.0 Essential 10 | 16 |
| journal requirement, Journal of Biological Chemistry (ASBMB) | 14 |
| journal requirement, British Journal of Pharmacology | 12 |
| journal requirement, PLOS (all journals) | 11 |
| journal requirement, Nature Portfolio (Reporting Summary) | 10 |
| journal requirement, eLife (transparent reporting form) | 9 |
| funder requirement, UKRI Medical Research Council | 7 |
| journal requirement, Scientific Reports | 6 |
| journal requirement, eLife | 6 |
| journal requirement, eNeuro (Society for Neuroscience) | 6 |
| journal requirement, MDAR Framework (multi-publisher) | 5 |
| funder requirement, NC3Rs Experimental Design Assistant | 5 |
| journal requirement, Nature Portfolio (image integrity) | 4 |
| journal requirement, PLOS Biology | 4 |
| funder requirement, NIH/NINDS (Landis et al. workshop recommendations) | 4 |
| journal requirement, PLOS ONE (figures, blots and gels) | 3 |
| journal requirement, Journal of Biological Chemistry (data presentation checklist) | 3 |
| journal requirement, Journal of Neuroscience (editorial) | 3 |
| journal requirement, MIFlowCyt (ISAC standard) | 3 |
| journal requirement, MIAME (FGED) | 3 |
| journal requirement, CHAMP statistical checklist (BMJ / BJSM) | 3 |
| journal requirement, Journal of Cell Biology (Rockefeller University Press) | 3 |
| journal requirement, Nature | 2 |
| journal requirement, Nature Portfolio | 2 |
| journal requirement, Experimental Physiology / Journal of Physiology (statistics policy) | 2 |
| journal requirement, MIQE 2.0 (IJMS editorial) | 2 |
| journal requirement, CONSORT 2025 statement (clinical trials) | 2 |
| journal requirement, Nature (editorial announcement) | 1 |
| journal requirement, Nature Communications | 1 |
| funder requirement, NIH Principles and Guidelines for Reporting Preclinical Research (as reported in Nature) | 1 |
| journal requirement, PLOS ONE (data availability) | 1 |
| journal requirement, Experimental Physiology (The Physiological Society) | 1 |
| journal requirement, Journal of Physiology / British Journal of Pharmacology (editorial) | 1 |
| journal requirement, MDAR Framework (PNAS article) | 1 |
| journal requirement, ARRIVE 2.0 (PLOS Biology article) | 1 |
| funder requirement, Wellcome | 1 |
| journal requirement, Cell Press STAR Methods Key Resources Table (Elsevier) | 1 |
Pages read but not cited: Nature Cell Biology 2013 editorial (duplicates the Nature 2013 announcement), Nature 505612a and 509282a (NIH reproducibility and sex-as-a-biological-variable commentaries; only the standfirst is visible without a subscription), PMC7189406 (Pharmacology Research & Perspectives guideline announcement; no requirement text), Frontiers author guidelines (no statistics requirements found), Springer Nature research data policy page, the MDAR checklist PDF (osf.io/bj3mu; the MDAR Framework PDF was used instead), a Korean CONSORT 2025 translation (the English PLOS Medicine version was used), the eLife journal-policies URL (same text as the author guide), the PLOS ONE publication criteria, the SfN JNeurosci landing page and the Life Science Alliance home page.

**Unreachable: blocked or challenged. Not circumvented, and no archives, caches or mirrors used.**

| Site / URL | Status seen |
|---|---|
| cell.com/star-authors-guide, cell.com/figureguidelines, cell.com/cell/authors (Cell Press STAR Methods, figure guidelines) | 403 (Cloudflare challenge) |
| rupress.org/jcb/pages/submission-guidelines, /editorial-policies (JCB) | 403 |
| bpspubs.onlinelibrary.wiley.com (BJP author guidelines) | 403 |
| physoc.onlinelibrary.wiley.com (J Physiol author guidelines and statistics page) | 403 |
| jneurosci.org/content/information-authors | 403 |
| embopress.org author guide (2 URLs) | 200 but JavaScript "Client Challenge", no content |
| science.org editorial policies | 403 |
| pnas.org author center | 403 |
| jbc.org/collecting-and-presenting-data | 403 (the same guidance was read on asbmb.org) |
| ahajournals.org (Circulation Research instructions, journal page) | 403 |
| journals.physiology.org (APS transparent reporting / statistics guidelines) | 403 |
| jamanetwork.com instructions for authors | 403 |
| bmj.com research article guidance | 403 (the CHAMP checklist, which supersedes the BMJ statistics checklist, was read on eprints.whiterose.ac.uk) |
| grants.nih.gov reproducibility pages (2 URLs), nih.gov preclinical reporting principles, orwh.od.nih.gov SABV policy | 403 |
| academic.oup.com and doi.org for MIQE 2.0 (Clin Chem) | 403 (an open-access MIQE 2.0 editorial on PMC was used instead) |
| journals.asm.org, journals.biologists.com, jpet.aspetjournals.org | 403 |
| aspet.org guideline news | 202, empty |
| jci.org author pages, beilstein-strenda-db.org guidelines | 503 |
| elifesciences.org/content/5/e21070 | 406 |
| bmcbiol.biomedcentral.com, peerj.com author instructions | 200 but near-empty (challenge) |
| nature.com Editorial Policy Checklist PDF | retired ("no longer required") |

NIH requirements are therefore covered indirectly: through the NIH-convened "Principles and Guidelines for Reporting Preclinical Research" as described in Nature (515007a) and the NINDS workshop recommendations (Landis et al. 2012). The NIH SABV policy page itself could not be read. Sex as a variable is covered through the MRC requirement instead.

## 2. Ten most frequent tags

| Tag | Count |
|---|---|
| reporting-methods | 40 |
| reproducibility-audit | 24 |
| n-definition | 22 |
| power-sample-size | 20 |
| technical-vs-biological-replicates | 19 |
| exact-p | 15 |
| which-test | 13 |
| western-blot-densitometry | 13 |
| figure-legend | 12 |
| effect-size | 12 |
Severity split: wrong result risk 83, slows the work 46, blocks the analysis 23 (non-compliance stops publication or funding, e.g. BJP triage rejection, PLOS hold on missing raw blots, Nature/eLife mandatory raw blot files, MRC rejecting "usual practice" sample sizes), cosmetic / preference 8.

## 3. Twenty strongest observations

1. **journal-bjp-design-1** (journal requirement, British Journal of Pharmacology): Technical replicates are counted as n (pseudoreplication).
   > We note that it is common for authors to run three samples ‘in quintuplicate’ then analyse the data with statistical analysis as if it were n = 15 rather than n = 3. This is not acceptable for publication in BJP.

   Why strong: Names the exact pseudoreplication pattern (triplicate/quintuplicate counted as n) and makes it a rejection criterion; a tool can prevent it mechanically.

2. **journal-bjp-design-8** (journal requirement, British Journal of Pharmacology): Missing randomisation/blinding statements, unequal n and n<5 statistics lead to desk rejection.
   > In recently submitted studies that do not currently comply with our requirements, it is often the case that we find all of the following: a lack of randomization and blinding, unequal group sizes, and statistical analysis applied when n is <5. Together, these render a paper fundamentally flawed, and, as Figure 1 indicates, this will now result in triage rejection.

   Why strong: Non-compliance means triage rejection; audit gives compliance rates (randomisation 38%, blinding 35%, equal n 31%).

3. **journal-bjp-design-4** (journal requirement, British Journal of Pharmacology): Normalised-to-control data (control = 1, no variance) are analysed with ANOVA/t-tests.
   > normalization to matched controls will generate a control mean of 1 and no SEM, meaning that parametric tests (ANOVA, etc.) cannot be used (only non‐parametric analysis is acceptable). Any dataset where one group has no SEM (common in Western blot analysis) must be analysed by non‐parametric statistics.

   Why strong: Very common blot/qPCR workflow (normalise to matched control, then ANOVA) is declared invalid; a tool can detect zero-variance control groups.

4. **journal-bjp-design-3** (journal requirement, British Journal of Pharmacology): Software lets users run post hoc tests after a non-significant ANOVA or with unequal variances.
   > post hoc tests may be run only if F achieves the necessary level of statistical significance (i.e. P < 0.05) and there is no significant variance inhomogeneity. ... If these criteria are not met, a post hoc test should not be run (even if the software permits this, which it may ).

   Why strong: Explicitly blames software for permitting post hoc tests after non-significant F; direct design requirement for a stats tool.

5. **journal-nature-rs-1** (journal requirement, Nature Portfolio (Reporting Summary)): Authors give ranges ('n = 3-6') or omit what n counts (cells, mice, wells); the Reporting Summary forces an exact count plus its unit.
   > The exact sample size (n) for each experimental group/condition, given as a discrete number and unit of measurement

   Why strong: Mandatory field in the Nature Portfolio Reporting Summary: exact n as a discrete number plus unit.

6. **journal-nature-rs-5** (journal requirement, Nature Portfolio (Reporting Summary)): Results report only asterisks or P thresholds, without test statistic, df, CI or effect size.
   > For null hypothesis testing, the test statistic (e.g. F, t, r) with confidence intervals, effect sizes, degrees of freedom and P value noted ... Give P values as exact values whenever suitable.

   Why strong: Lists the complete result tuple (statistic, df, CI, effect size, exact P) every results export should carry.

7. **journal-nature-rs-6** (journal requirement, Nature Portfolio (Reporting Summary)): Nested data (cells within animals) are tested at the wrong level, inflating n.
   > For hierarchical and complex designs, identification of the appropriate level for tests and full reporting of outcomes

   Why strong: Requires hierarchical designs to be tested at the right level: the nested-data / SuperPlot problem as a journal rule.

8. **journal-elife-form-3** (journal requirement, eLife (transparent reporting form)): Small-n data are shown as bars only.
   > Raw data should be presented in figures whenever informative to do so (typically when N per group is less than 10)

   Why strong: Concrete threshold (N < 10 per group) for showing raw points; easy to implement as a default.

9. **journal-elife-form-5** (journal requirement, eLife (transparent reporting form)): Non-significant results are reported as 'ns' without exact p or CI.
   > Report exact p-values wherever possible alongside the summary statistics and 95% confidence intervals. These should be reported for all key questions and not only when the p-value is less than 0.05.

   Why strong: Exact p and 95% CI required for all key questions, not only p < 0.05; kills 'ns'-only annotation.

10. **journal-plos-bp-4** (journal requirement, PLOS (all journals)): Only the outlier-removed analysis is reported.
   > Provide details of how outliers were treated and analysis, both with the full dataset and with the outliers removed

   Why strong: Requires analysis both with and without outliers; a tool can run both automatically when a point is excluded.

11. **journal-plosbio-graphs-1** (journal requirement, PLOS Biology): Bar graphs of small-n continuous data hide the distribution.
   > we discourage the use of bar graphs and line plots for continuous data, particularly for studies with small sample sizes (n≤9 independent observations per group).

   Why strong: Bar/line graphs discouraged for n <= 9; sets the default plot type for small-n continuous data.

12. **journal-jbc-data-4** (journal requirement, Journal of Biological Chemistry (ASBMB)): Mean±SEM bar charts without points are rejected.
   > Simple bar graphs to report mean±SEM values are not generally permitted: authors should super-impose a scatter plot to report the reproducibility of independent biological replicates within such data sets, and report mean±S.D. values to make the distribution and variation transparent.

   Why strong: Mean +/- SEM bar graphs 'not generally permitted'; must overlay biological replicates and use SD.

13. **journal-jbc-data-8** (journal requirement, Journal of Biological Chemistry (ASBMB)): Densitometry normalised to housekeeping proteins without validation.
   > Normalize signal intensity to total protein loading (assessed by staining membranes for total protein) whenever possible. “House-keeping” proteins should not be used for normalization without evidence that the experimental manipulations do not affect expression.

   Why strong: Total-protein normalisation over housekeeping proteins; changes the default western-blot densitometry workflow.

14. **journal-jbc-data-13** (journal requirement, Journal of Biological Chemistry (ASBMB)): Km/Vmax obtained from Lineweaver-Burk linearisation without error estimates or software citation.
   > should be estimated using nonlinear fitting (and the software system cited). Parameters should include estimates of error (SD preferred). The use of linear transformations for calculation of Michaelis-Menten parameters is recognized to be inaccurate.

   Why strong: Curve-fitting requirement: nonlinear fit, error estimates, software cited, no Lineweaver-Burk.

15. **journal-srep-stats-1** (journal requirement, Scientific Reports): Papers report 'P < 0.05' without test name, n, alpha, sidedness or justification.
   > it should state the name of the statistical test, the n value for each statistical analysis, the comparisons of interest, a justification for the use of that test ... the alpha level for all tests, whether the tests were one-tailed or two-tailed, and the actual P value for each test (not merely "significant" or "P < 0.05").

   Why strong: Itemised statistical reporting list (test, n, comparisons, justification, alpha, sidedness, actual P) that maps one-to-one to output fields.

16. **journal-eneuro-stats-1** (journal requirement, eNeuro (Society for Neuroscience)): Each analysis needs n with its unit (animals vs slices vs measurements), exact p and a cross-reference into a statistical table.
   > Authors must provide detailed information for each analysis performed, including population size, definition of the population (e.g., number of individual measurements, number of animals, number of slices, number of times treatment was applied, etc.), and specific p values (not > or <), followed by a superscript lowercase letter referring to the statistical table provided at the end of the results section.

   Why strong: Statistical table with superscript cross-references and n defined by unit (animals, slices, measurements); a structured export target.

17. **journal-physoc-policy-1** (journal requirement, Experimental Physiology / Journal of Physiology (statistics policy)): Authors must switch from SEM to SD, give precise P values and supply a statistical summary document.
   > These requirements include, but are not limited to: (1) providing a statistical summary document for revised research articles, which is included as Supporting Information in the published paper; (2) using SD, not SEM (unless clearly justified and exempted); (3) providing mean and SD values in the text and statistical summary document; (4) providing precise

   Why strong: Mandated SD-not-SEM, precise P values and a statistical summary document; defaults that would make compliance effortless.

18. **journal-physoc-news-1** (journal requirement, Experimental Physiology (The Physiological Society)): Re-typing results into a separate statistical summary document duplicates work.
   > However, there was a general consensus that the ‘duplication’ of work required to complete and check this summary document was an unnecessary burden on both time and resources, that did not provide significant benefit.

   Why strong: The statistical summary document was dropped because re-typing results was an 'unnecessary burden'; strong case for auto-generation (88% of authors still supported a strict policy).

19. **journal-nih-ninds-2** (funder requirement, NIH/NINDS (Landis et al. workshop recommendations)): Randomisation, blinding and sample size are almost never reported.
   > A review of 100 articles published in Cancer Research in 2010 revealed that only 28% of papers reported that animals were randomly allocated to treatment groups, just 2% of papers reported that observers were blinded to treatment, and none stated the methods used to determine the number of animals per group

   Why strong: Hard numbers: 28% randomisation, 2% blinding, 0% sample-size method in 100 Cancer Research papers.

20. **journal-mrc-animals-2** (funder requirement, UKRI Medical Research Council): 'n = 6 because that is usual' is rejected by reviewers.
   > In general, we will not consider explanations as adequate if you base them solely in terms of ‘usual practice’.

   Why strong: Funder rejects 'usual practice' as an n justification; a power/sample-size planner is needed at grant stage.

## 4. Surprises and notable patterns

- **Journals blame software directly.** BJP says post hoc tests should not be run after a non-significant F "even if the software permits this, which it may". J Physiol (2011) notes poor statistics persist "despite the widespread availability of ... easily used statistical packages". Requirements are drifting from "report X" towards "the tool must not let you do Y" (gate post hoc tests, no statistics at n < 5, no parametric tests on normalised zero-variance controls).
- **Compliance is low even where it is mandatory.** BJP's own audit found randomisation statements in 38% of papers, blinding statements in 35%, equal n in 31% and a correct Y-axis label after normalisation in 50%, even though every audited paper had declared that it followed the guidelines. ARRIVE 2.0 reports randomisation in 30-40% of papers, blinding in about 20% and sample-size justification in under 10%. The NINDS review of 100 papers found 28% randomisation, 2% blinding and 0% sample-size method. Endorsing a checklist does not produce compliance; making the item a default output might.
- **Re-typing kills policies.** Experimental Physiology dropped its statistical summary document because re-typing results was an "unnecessary burden", although 88% of surveyed authors still supported the strict policy. The same rigour, generated automatically from the analysis, would remove that objection.
- **Requirements converge.** The same rules recur across about a dozen sources: exact n as independent units (Nature, eLife, JBC, BJP, MDAR, ARRIVE, MRC, NC3Rs, NINDS); exact P values (Nature, eLife, PLOS, JBC, Sci Rep, J Neurosci, eNeuro, physoc, CHAMP); SD or CI rather than SEM (JBC, PLOS Biology, physoc, Sci Rep ranges); individual points for small n (eLife n < 10, PLOS Biology n <= 9, JBC scatter overlay). Together they amount to a cross-journal specification of what a results export should contain.
- **Specific graph rules.** eNeuro requires box plots and forbids two-bar graphs. PLOS Biology wants paired data shown so that consistency across individuals is visible. Physoc and JBC want SD. A per-journal "house style" preset (P formatting, error-bar type, plot type, alpha display) would map cleanly onto these rules.
- **Western blots are the most regulated data type.** Requirements cover raw uncropped files (Nature, eLife, PLOS, Nat Commun), lane annotation with "X" marks on omitted lanes (PLOS), same-blot loading controls (Nature), total-protein normalisation and PTM/total ratios (JBC), linear range (JBC), and non-parametric statistics after matched-control normalisation (BJP). Densitometry, normalisation and statistics are tightly coupled here.
- **Curve fitting is under-specified.** Only JBC (nonlinear fit with SD for kinetic parameters, software cited, no linear transforms, Ki over IC50), PLOS (all coefficients with SE/CI and goodness of fit), eLife (model definition files with all parameters) and BJP (pEC50/pIC50) say anything about it. None of the general checklists ask for model equation, constraints, weighting or the fit-comparison test.
- **Funders push design, not reporting.** MRC asks for power calculations "based on justifiable and explicit assumptions" and rejects "usual practice". It also asks for a definition of the experimental unit, both sexes, and planned independent replications. That is a planning-stage need (sample-size and experimental-unit tooling) that comes before any data exist.

## 5. Gaps

- Cell Press STAR Methods "Quantification and statistical analysis" text and the Cell figure guidelines could not be read (403). Only Elsevier's Key Resources Table page was available.
- JCB/RUP current instructions, the EMBO Press author checklist, Science/AAAS, PNAS, Circulation Research/AHA, APS "Guidelines for reporting statistics", JAMA and BMJ were blocked. JCB is represented only by its 2004 image-manipulation editorial and BMJ only by the CHAMP checklist.
- The NIH Rigor and Reproducibility, preclinical reporting principles and SABV pages on nih.gov were blocked. They are covered only through Nature 515007a and Landis et al. 2012.
- The current J Physiol statistics policy and checklist page (Wiley) was blocked. It is covered through the Experimental Physiology 2023 editorial that restates its five requirements.
- The full MIQE 2.0 checklist (Clin Chem, OUP) was blocked. Only an open-access editorial summarising MIQE 2.0 failures was used.
- The full UKRI/Wellcome/NC3Rs funder set was not covered. Wellcome is limited to its data and software sharing policy, and the NC3Rs EDA is represented by its experimental-unit and analysis guidance pages.

## Proposed new tags

These were not used in the JSON, because `verify.py` only accepts tags already in TAGS.md. The closest existing tag was used instead.

- `blinding`: blinding/masking at allocation, conduct, outcome assessment or analysis (mapped to `randomisation`).
- `data-availability`: deposit-ready data, code and source-data exports required by journals and funders (mapped to `reproducibility-audit`).
- `image-integrity`: rules on raw/uncropped blots, splicing, linear adjustments and resolution (mapped to `western-blot-densitometry` / `image-analysis-exports`).
- `experimental-design-planning`: pre-data planning such as experimental unit, sex as a variable and replication plans for grants (mapped to `power-sample-size` / `n-definition`).
