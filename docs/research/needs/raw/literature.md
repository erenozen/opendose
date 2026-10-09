# Literature: published critiques of statistical practice in bench biology

Venue: peer-reviewed methodological critiques and meta-research audits that measure how often bench scientists make particular analysis and reporting mistakes. Each documented mistake is one observation. The quote is the sentence that states the mistake or its prevalence, and `signal` holds the prevalence the paper reports (papers audited, % with the error), or null if it reports none.

**274 observations from 66 distinct papers. 100 carry a quantitative prevalence signal.** verify.py: `274 observations, 0 with problems`.

## Coverage

How the papers were found: the brief's seed list (Weissgerber 2015/2016/2017/2018/2019, Lord 2020, Lazic 2010/2013/2018, Eisner 2021, Pollard 2019, Vaux 2012 (Nature and EMBO Rep), Cumming 2007, Motulsky 2014, Nieuwenhuis 2011, Makin & Orban de Xivry 2019, Krzywinski & Altman, Nuzzo 2014, Curtis 2015/2018, Kilkenny 2009, NPQIP, Strasak 2007, SAMPL, Diong 2018, Halsey 2015, Belia 2005, Ho 2019, Sebaugh 2011). Titles were resolved to PMC IDs through the Europe PMC search API. Topical web searches covered survival misuse in preclinical studies, flow-cytometry statistics, dose-response fitting pitfalls, MIQE compliance and ELISA standard curves. Every quote comes from the full text, or from the abstract where the full text was paywalled, as cached by fetch.py.

This file merges two literature researchers who ran in parallel on the same venue. Their entries were deduplicated by url+quote, keeping the richer entry, and every merged entry passed verify.py; the merge script is scratchpad/work-literature/merge.py. Entries with source-style ids (lit-<paper>-<slug>) come from the primary set; numbered ids (lit-<paper>-<n>) come from the parallel agent.

Pages read and used, per site (distinct article URLs / observations):

| site | articles | observations |
|---|---|---|
| pmc.ncbi.nlm.nih.gov | 47 | 196 |
| journals.plos.org | 10 | 51 |
| www.nature.com | 5 | 9 |
| smw.ch | 1 | 8 |
| www.equator-network.org | 1 | 6 |
| www.biorxiv.org | 1 | 3 |
| dare.uva.nl | 1 | 1 |

Unreachable or only partly readable:

- Sebaugh 2011, *Pharmaceutical Statistics* (EC50/IC50 guidelines): onlinelibrary.wiley.com returned **403**. Not used.
- Nagele 2003, *Br J Anaesth* (SEM misuse): academic.oup.com returned **403**. Not used.
- Belia et al. 2005, *Psychological Methods* (error-bar misunderstanding): psycnet.apa.org served a JavaScript shell with no text (82 chars). Not used.
- Lang 2004, *Croatian Medical Journal* (Twenty statistical errors): the cmj.hr PDF URL returned an empty body. Not used.
- Findlay & Dillard 2007, *AAPS J*: link.springer.com served a client challenge, and the PMC full text is a scanned PDF that could not be fetched. Only the PMC abstract was used.
- Nieuwenhuis 2011 (*Nat Neurosci*), Halsey 2015 (*Nat Methods*), Krzywinski & Altman 2013 'Error bars' (*Nat Methods*) and Nuzzo 2014 (*Nature*) are paywalled on nature.com. Only the abstract or standfirst was used. For Nieuwenhuis, the parallel literature agent also used the UvA-DARE institutional repository record.
- BJP pages on bpspubs.onlinelibrary.wiley.com and the JGP page on rupress.org were blocked (100-120 chars); the PMC copies were used instead. pmc.ncbi.nlm.nih.gov briefly served a reCAPTCHA page after rapid requests, and the same URLs fetched normally after a pause. The Europe PMC fullTextXML endpoint returned 500 for the scanned 2007-2011 BJP papers.
- Not covered (no open full text found): Krzywinski & Altman's 'Survival analysis' and 'Nested designs' columns, Curran-Everett & Benos's APS reporting guidelines, and a peer-reviewed ELISA standard-curve misuse audit (only vendor blogs turned up).

Severity mix: wrong result risk: 200, slows the work: 52, cosmetic / preference: 20, blocks the analysis: 2

## Ten most frequent tags

| tag | count |
|---|---|
| reporting-methods | 57 |
| n-definition | 42 |
| which-test | 29 |
| show-the-points | 27 |
| error-bars-sd-sem | 27 |
| technical-vs-biological-replicates | 23 |
| normalization | 21 |
| randomisation | 20 |
| graph-formatting | 18 |
| reproducibility-audit | 18 |

## Twenty strongest observations

Chosen for the size of the measured prevalence and how directly a tool default could prevent the mistake.

1. **lit-weissgerber2015-bargraphs** (PLOS Biology, 2015-04): "Bar graphs were the most commonly used figures for presenting continuous data. 85.6% of papers included at least one bar graph."  
   *Problem:* Continuous data from small samples shown as bar graphs that hide the distribution. *Need:* Default graph for continuous group data should show every point (dot/box/violin) rather than a bar of the mean. *Signal:* {"papers_audited": 703, "pct_with_bar_graph": 85.6}. [source](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002128)
2. **lit-weissgerber2015-sem** (PLOS Biology, 2015-04): "Most of these papers used bar graphs that showed mean ± SE (77.6%, Panel B in S2 Fig ), rather than mean ± SD (15.3%)."  
   *Problem:* Error bars default to SEM, which looks smaller and does not describe variability. *Need:* Make SD (or the raw points) the default for describing spread and require an explicit, labelled choice of SEM/CI. *Signal:* {"papers_audited": 703, "pct_bar_graphs_mean_se": 77.6, "pct_mean_sd": 15.3}. [source](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002128)
3. **lit-weissgerber2018elife-anova-type** (eLife, 2018-12): "However, papers in our sample were routinely missing essential information about both types of tests: 213 papers (95% of the papers that used ANOVA) did not contain the information needed to determine what type of ANOVA was performed, and 26.7% of papers did not specify what post-hoc test was performed."  
   *Problem:* Methods sections do not say which ANOVA (factors, repeated measures) or which post-hoc test was run. *Need:* Auto-generate a complete methods paragraph naming the ANOVA type, factors, between/within status and post-hoc test. *Signal:* {"papers_audited": 328, "papers_with_anova": 225, "pct_anova_type_unclear": 95, "pct_posthoc_unspecified": 26.7}. [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC6326723/)
4. **lit-weissgerber2018elife-oneway-misuse** (eLife, 2018-12): "Among papers that used one-way ANOVAs, 60.9% (67/110) used a one-way ANOVA for an analysis where the study design included two or more factors."  
   *Problem:* One-way ANOVA used when the design has two or more factors. *Need:* Design-first test chooser that asks how many factors define the groups and steers multi-factor designs to two-way ANOVA. *Signal:* {"papers_with_oneway_anova": 110, "pct_oneway_for_multifactor_design": 60.9}. [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC6326723/)
5. **lit-weissgerber2018elife-rm-missing** (eLife, 2018-12): "Our data suggest that scientists should be cautious about this assumption, as 28.3% of papers that did not indicate that repeated measures were used (52/184) included at least one ANOVA that appeared to require repeated measures."  
   *Problem:* Repeated-measures structure ignored or unreported in ANOVA. *Need:* Ask whether the same subjects were measured repeatedly and default to RM/mixed analysis when they were. *Signal:* {"papers_audited": 184, "pct_apparently_needing_rm": 28.3}. [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC6326723/)
6. **lit-lazic2018-prevalence** (PLOS Biology, 2018-04): "Nearly half of the studies (46%, 95% CI = 38%–53%) had pseudoreplication while 32% (95% CI = 26%–39%) provided insufficient information to make a judgement."  
   *Problem:* Pseudoreplication in prenatal/litter studies. *Need:* Design wizard that asks what was randomised to treatment (the experimental unit) and sets N accordingly. *Signal:* {"papers_audited": 200, "pct_pseudoreplication": 46, "pct_unclear": 32, "pct_valid": 22}. [source](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.2005282)
7. **lit-lazic2013litter-prevalence** (BMC Neuroscience, 2013-03): "Results A review of the VPA literature showed that only 9% (3/34) of studies correctly determined that the experimental unit ( n ) was the litter and therefore made valid statistical inferences."  
   *Problem:* Litter effects ignored; pups treated as independent n. *Need:* Support litter (or cage) as a random/grouping factor and warn when pups from the same litter are counted as n. *Signal:* {"papers_audited": 34, "pct_correct_unit": 9}. [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC3661356/)
8. **lit-lazic2010-sixorders** (BMC Neuroscience, 2010-01): "The change in p -value between the two analyses is six orders of magnitude, which demonstrates the importance of dealing with pseudoreplication appropriately."  
   *Problem:* Analysing 20 within-rat measurements as independent gives P=2.7e-7 instead of 0.287. *Need:* Average sub-samples per experimental unit (or fit a mixed model) automatically when a grouping column is given. *Signal:* {"p_incorrect": 2.7e-07, "p_correct": 0.287}. [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC2817684/)
9. **lit-lord2020superplots-cell-as-n** (Journal of Cell Biology, 2020-06): "The resulting P values are worse than useless: counting each cell as a separate n can easily result in false-positive rates of >50% ( Aarts et al., 2015 )."  
   *Problem:* Each cell counted as n, inflating significance. *Need:* Require the user to identify biological replicates and compute the test on replicate means (or a mixed model), not on cells. *Signal:* {"false_positive_rate": ">50%"}. [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC7265319/)
10. **lit-nieuwenhuis2011-interaction** (Nature Neuroscience, 2011-08): "We reviewed 513 behavioral, systems and cognitive neuroscience articles in five top-ranking journals ... and found that 78 used the correct procedure and 79 used the incorrect procedure."  
   *Problem:* Difference between significant and non-significant treated as significant (no interaction test). *Need:* Steer 'does the effect differ between groups' questions to an interaction test and explain why. *Signal:* {"papers_audited": 513, "papers_comparing_effects": 157, "incorrect": 79, "correct": 78}. [source](https://www.nature.com/articles/nn.2886)
11. **lit-diong2018-sem-exactp** (PLOS ONE, 2018-08): "Overall, 76-84% of papers with written measures that summarized data variability used standard errors of the mean, and 90-96% of papers did not report exact p-values for primary analyses and post-hoc tests."  
   *Problem:* SEM as variability measure and non-exact P values persist after editorial advice. *Need:* Defaults: SD for variability, exact P everywhere. *Signal:* {"pct_sem_for_variability": "76-84", "pct_no_exact_p": "90-96"}. [source](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0202121)
12. **lit-diong2018-spin** (PLOS ONE, 2018-08): "Of papers that reported p-values between 0.05 and 0.1, 56-63% interpreted these as trends or statistically significant."  
   *Problem:* P between 0.05 and 0.1 reported as 'trend' (spin). *Need:* Result wording generator that avoids 'trend' language and reports effect sizes with CIs. *Signal:* {"pct_spin_p_0.05_0.1": "56-63"}. [source](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0202121)
13. **lit-baker2014-eae-scores** (PLOS Biology, 2014-01): "Thirteen percent (95% confidence interval [CI] 8.7%–18.5%) of articles did not report statistical analyses at all, and only 39% (95% CI 32.5%–46.8%) correctly used non-parametric statistical tests on non-parametric neurological scoring data."  
   *Problem:* Parametric tests on ordinal clinical scores. *Need:* When data are ordinal scores, steer to nonparametric tests. *Signal:* {"pct_no_stats": 13, "pct_correct_nonparametric": 39}. [source](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1001756)
14. **lit-dijkstra2014-single-ref** (Molecular Oncology, 2014-01): "In 92% of the publications, only a single reference gene was used."  
   *Problem:* Single reference gene normalisation. *Need:* Support and encourage geometric mean of multiple reference genes. *Signal:* {"papers_audited": 179, "pct_single_reference_gene": 92}. [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC5528534/)
15. **lit-butler2019wb-ratio** (BioMed Research International, 2019-01): "We also confirm that when data to be normalised are not directly proportional to protein abundance, it is a mistake to use the normalisation technique of dividing densitometry data from the protein-of-interest with densitometry data from loading control protein(s), as this can cause the normalised data to be unusable for making comparisons."  
   *Problem:* Dividing target by loading control when signals are non-proportional. *Need:* Fit the signal-vs-load relationship (linear with intercept / hyperbolic) and normalise via the fitted curve, warning when ratio normalisation is invalid. *Signal:* no prevalence figure. [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC6360618/)
16. **lit-curtis2015-normalise-ctrl** (British Journal of Pharmacology, 2015-07): "For example, individual experimental (test) group values should not be normalized to the matched experimental control group values and subjected to parametric analysis since the experimental control group will have no variance"  
   *Problem:* Test values are divided by matched controls (control = 1, no variance) and then analysed parametrically. *Need:* Detect a zero-variance control column after normalization and block parametric tests; offer ratio-paired or log-ratio one-sample analysis instead. *Signal:* no prevalence figure. [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC4507152/)
17. **lit-tumorgrowth2021-rmanova-limits** (Scientific Reports, 2021-04): "However, the classic implementation of this analysis found in common laboratory software packages is severely limited by the requirement of equally spaced and complete data for each mouse over the entire study period, as well as the assumptions of equal variance at all time points and equal correlation between repeated measurements regardless of the length of time (lag) between the two observations."  
   *Problem:* Lab-software RM ANOVA cannot handle mice dropping out or unequal spacing. *Need:* Mixed model with flexible covariance that accepts missing time points from dropouts. *Signal:* no prevalence figure. [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC8044116/)
18. **lit-furuya2014-hourly** (mBio, 2014-03): "With this in mind, it has become apparent that in many recent publications in various highly respected journals, animals were monitored for survival multiple times a day or even hourly to obtain statistically significant results."  
   *Problem:* Survival monitored hourly so log-rank detects trivial differences. *Need:* Survival analysis that reports median survival difference with CI and flags tiny absolute differences that are 'significant'. *Signal:* no prevalence figure. [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC3958799/)
19. **lit-gosselin2021-software** (Scientific Reports, 2021-02): "The most frequently used software was determined to be Prism (mentioned in 59.01% of publications, k = 223) and SPSS (16.22%)."  
   *Problem:* Most preclinical analyses are done in point-and-click GUI software, so reporting quality depends on what that software outputs. *Need:* GUI tool must emit complete, reproducible reporting text and analysis records by default. *Signal:* {"articles": 223, "pct_prism": 59.01, "pct_spss": 16.22, "pct_r": 4.5}. [source](https://pmc.ncbi.nlm.nih.gov/articles/PMC7870941/)
20. **lit-kilkenny2009-rand-blind** (PLOS ONE, 2009-11): "Most of the papers surveyed did not use randomisation (87%) or blinding (86%), to reduce bias in animal selection and outcome assessment."  
   *Problem:* Randomisation and blinding not used/reported. *Need:* Built-in randomisation and blinding-code generator, recorded in the methods. *Signal:* {"papers_audited": 271, "pct_no_randomisation": 87, "pct_no_blinding": 86}. [source](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0007824)

## Surprising findings

- **Journals blame the software.** BJP's editors write that post-hoc tests get run after a non-significant F "even if the software permits this" and that "some statistical packages" will return P < 0.05 for groups smaller than 5. A scoping review of preclinical papers found one point-and-click package named in 59% of them (lit-gosselin2021-software). In this literature, what the software allows by default is a recognised cause of errors.
- **Guidelines alone do not move the numbers.** Diong 2018 found no change in SEM use (~80%), non-exact P values (90-96%) or spin after a joint J Physiol/BJP editorial series. Full Landis-4 compliance in Nature journals rose only from 0% to 16% (3.3% for in vitro work). BJP's 2018 audit found that papers citing its 2015 guidance still did not follow it. *Experimental Physiology* then dropped its mandatory statistical summary document because authors found filling it in an "excessive time burden" (lit-expphysiol2023-burden). That is a direct case for generating the summary automatically.
- **The repeated-measures ANOVA in common lab software is criticised by name** in xenograft tumour-growth work, because it needs complete, equally spaced data and mice drop out (lit-tumorgrowth2021-rmanova-limits). Mixed models that tolerate missing time points are the stated need.
- **Pseudoreplication dominates in every field.** It shows up as cells per animal (Eisner: more than 10% false positives with just 2 cells per animal), pups per litter (only 9% of valproic-acid studies used the litter as n), triplicate wells (Vaux, Cumming, Curtis: "n = 4, not 3 or 12") and calcium sparks. Lazic 2018 argues the 'biological vs technical replicate' labels themselves are unhelpful and that N should be defined by the experimental unit. That matters for how a tool asks the question.
- **Interaction errors are worse at the bench.** Nieuwenhuis et al. found that half of the neuroscience papers comparing two effects did it wrongly, and "even more common in cellular and molecular neuroscience".
- **Survival P values can be manufactured** by checking survival hourly, because the log-rank test only uses the order of deaths (lit-furuya2014-hourly). Separately, 52% of mouse oncology papers ran survival analyses but only 16% stated their humane endpoints.
- In qPCR the error is nearly universal rather than common: 92% of colorectal-cancer qPCR papers used a single reference gene, and only 3% could be assessed for validity.

## Proposed new tags

None were used: every observation uses tags from TAGS.md, because verify.py rejects unknown tags. Two candidates the coordinator may want to add:

- `assumption-checks`: checking normality or equal variance before a test, and what to do when n is too small to check (now spread across `nonparametric`, `fit-diagnostics` and `which-test`).
- `randomisation-blinding-reporting`: capturing and reporting randomisation, blinding, sample-size rationale and exclusions (ARRIVE/Landis items). Now folded into `randomisation` plus `reporting-methods`.

## Papers used

| venue | date | url | observations |
|---|---|---|---|
| PLOS Biology | 2015-04 | https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002128 | 7 |
| eLife | 2018-12 | https://pmc.ncbi.nlm.nih.gov/articles/PMC6326723/ | 11 |
| PLOS Biology | 2016-06 | https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002484 | 4 |
| Circulation | 2019-10 | https://pmc.ncbi.nlm.nih.gov/articles/PMC8947810/ | 10 |
| Journal of Biological Chemistry | 2017-12 | https://pmc.ncbi.nlm.nih.gov/articles/PMC5733595/ | 3 |
| Clinical Science | 2022-08 | https://pmc.ncbi.nlm.nih.gov/articles/PMC9366861/ | 4 |
| Journal of Cell Biology | 2020-06 | https://pmc.ncbi.nlm.nih.gov/articles/PMC7265319/ | 8 |
| BMC Neuroscience | 2010-01 | https://pmc.ncbi.nlm.nih.gov/articles/PMC2817684/ | 6 |
| PLOS Biology | 2018-04 | https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.2005282 | 7 |
| BMC Neuroscience | 2013-03 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3661356/ | 4 |
| Journal of General Physiology | 2021-01 | https://pmc.ncbi.nlm.nih.gov/articles/PMC7814346/ | 6 |
| Molecular Biology of the Cell | 2019-06 | https://pmc.ncbi.nlm.nih.gov/articles/PMC6724699/ | 11 |
| Nature | 2012-12 | https://www.nature.com/articles/492180a | 4 |
| EMBO Reports | 2012-04 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3321166/ | 5 |
| Journal of Cell Biology | 2007-04 | https://pmc.ncbi.nlm.nih.gov/articles/PMC2064100/ | 6 |
| Naunyn-Schmiedeberg's Archives of Pharmacology | 2014-09 | https://pmc.ncbi.nlm.nih.gov/articles/PMC4203998/ | 8 |
| eLife | 2019-10 | https://pmc.ncbi.nlm.nih.gov/articles/PMC6785265/ | 12 |
| Nature Neuroscience | 2011-08 | https://www.nature.com/articles/nn.2886 | 2 |
| Nature Methods | 2015-03 | https://www.nature.com/articles/nmeth.3288 | 1 |
| Nature Methods | 2013-10 | https://www.nature.com/articles/nmeth.2659 | 1 |
| Nature | 2014-02 | https://www.nature.com/articles/506150a | 1 |
| British Journal of Pharmacology | 2015-07 | https://pmc.ncbi.nlm.nih.gov/articles/PMC4507152/ | 6 |
| British Journal of Pharmacology | 2018-03 | https://pmc.ncbi.nlm.nih.gov/articles/PMC5843711/ | 11 |
| PLOS ONE | 2018-08 | https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0202121 | 5 |
| PLOS ONE | 2009-11 | https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0007824 | 8 |
| PLOS Biology | 2014-01 | https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1001756 | 4 |
| BMJ Open Science | 2019-02 | https://pmc.ncbi.nlm.nih.gov/articles/PMC8647608/ | 4 |
| PLOS Biology | 2015-10 | https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002273 | 4 |
| BioMed Research International | 2019-01 | https://pmc.ncbi.nlm.nih.gov/articles/PMC6360618/ | 4 |
| Molecular Biotechnology | 2013-05 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3840294/ | 4 |
| BioMed Research International | 2014-03 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3971489/ | 3 |
| International Journal of Molecular Sciences | 2025-05 | https://pmc.ncbi.nlm.nih.gov/articles/PMC12154065/ | 4 |
| Biomolecular Detection and Quantification | 2014-12 | https://pmc.ncbi.nlm.nih.gov/articles/PMC5121206/ | 3 |
| Molecular Oncology | 2014-01 | https://pmc.ncbi.nlm.nih.gov/articles/PMC5528534/ | 4 |
| American Journal of Physiology - Lung Cellular and Molecular Physiology | 2009-11 | https://pmc.ncbi.nlm.nih.gov/articles/PMC2822558/ | 3 |
| mBio | 2014-03 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3958799/ | 3 |
| PLOS ONE | 2022-10 | https://pmc.ncbi.nlm.nih.gov/articles/PMC9584398/ | 3 |
| Scientific Reports | 2021-04 | https://pmc.ncbi.nlm.nih.gov/articles/PMC8044116/ | 3 |
| Journal of Pharmacogenomics & Pharmacoproteomics | 2014-03 | https://pmc.ncbi.nlm.nih.gov/articles/PMC4125024/ | 3 |
| Scientific Reports | 2021-02 | https://pmc.ncbi.nlm.nih.gov/articles/PMC7870941/ | 5 |
| PLOS Biology | 2021-03 | https://pmc.ncbi.nlm.nih.gov/articles/PMC8041175/ | 3 |
| Nature Communications | 2020-10 | https://pmc.ncbi.nlm.nih.gov/articles/PMC7595127/ | 3 |
| British Journal of Pharmacology | 2007-07 | https://pmc.ncbi.nlm.nih.gov/articles/PMC2042955/ | 2 |
| British Journal of Pharmacology | 2007-07 | https://pmc.ncbi.nlm.nih.gov/articles/PMC2042947/ | 3 |
| British Journal of Pharmacology | 2008-09 | https://pmc.ncbi.nlm.nih.gov/articles/PMC2597241/ | 2 |
| British Journal of Pharmacology | 2011-05 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3087125/ | 2 |
| Swiss Medical Weekly | 2007-01 | https://smw.ch/index.php/smw/article/download/693/690/1374 | 8 |
| SAMPL Guidelines (Lang & Altman, EQUATOR Network) | 2013-03 | https://www.equator-network.org/wp-content/uploads/2013/03/SAMPL-Guidelines-3-13-13.pdf | 6 |
| bioRxiv (preprint of Nature Methods paper) | 2018-07 | https://www.biorxiv.org/content/10.1101/377978.full.pdf | 3 |
| PLOS Biology | 2016-04 | https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002430 | 8 |
| Experimental Physiology | 2023-04 | https://pmc.ncbi.nlm.nih.gov/articles/PMC10988475/ | 2 |
| The AAPS Journal | 2007-06 | https://pmc.ncbi.nlm.nih.gov/articles/PMC2751416/ | 4 |
| Cytometry Part A | 2008-10 | https://pmc.ncbi.nlm.nih.gov/articles/PMC2773297/ | 2 |
| Nature Neuroscience (author institutional repository record, UvA-DARE) | 2011-09 | https://dare.uva.nl/record/1/358198 | 1 |
| British Journal of Pharmacology | 2020-07 | https://pmc.ncbi.nlm.nih.gov/articles/PMC7393193/ | 1 |
| PLOS Biology | 2020-07 | https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.3000410 | 2 |
| British Journal of Cancer | 1995-08 | https://pmc.ncbi.nlm.nih.gov/articles/PMC2033978/ | 3 |
| BMC Cancer | 2019-07 | https://pmc.ncbi.nlm.nih.gov/articles/PMC6643318/ | 2 |
| BMC Medical Research Methodology | 2004-05 | https://pmc.ncbi.nlm.nih.gov/articles/PMC443510/ | 1 |
| PLOS One | 2017-09 | https://pmc.ncbi.nlm.nih.gov/articles/PMC5597130/ | 1 |
| Archives of Toxicology | 2020-09 | https://pmc.ncbi.nlm.nih.gov/articles/PMC7603474/ | 2 |
| Indian Journal of Pharmacology | 2010-10 | https://pmc.ncbi.nlm.nih.gov/articles/PMC2959222/ | 1 |
| PLOS One | 2014-02 | https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0088266 | 2 |
| Scientific Reports | 2016-02 | https://pmc.ncbi.nlm.nih.gov/articles/PMC4748244/ | 2 |
| Nature Reviews Immunology | 2012-02 | https://pmc.ncbi.nlm.nih.gov/articles/PMC3409649/ | 1 |
| Biology Letters | 2019-05 | https://pmc.ncbi.nlm.nih.gov/articles/PMC6548726/ | 2 |

## Addendum: coverage notes from the parallel (numbered-id) literature agent

The parallel agent's set was 137 observations from 48 papers, and every one passed verify.py on its own. It is saved as scratchpad/work-literature/numbered-set.json. 89 of these entries survive in the merged file; the rest were deduplicated against the primary set by url+quote. Searching ran about 26 web searches plus PMC idconv/eutils lookups by DOI and title, and about 80 page fetches.

Other unreachable pages it hit:

- elifesciences.org/articles/36163 and /48175 (Weissgerber 2018, Makin & Orban de Xivry 2019): **HTTP 406** to the fetch tool. The PMC copies (PMC6326723, PMC6785265) were used instead.
- sciencedirect.com S0003269719310279 (Pillai-Kastoori 2020, *Anal Biochem*, quantitative Western blot): **403 reCAPTCHA**. Not used.
- molpharm.aspetjournals.org/content/97/1/49 (Michel, Murphy & Motulsky 2020 author guidelines): **403** (Cloudflare challenge). Not used.
- NCBI Bookshelf NBK91994 (Assay Guidance Manual, curve fitting), PMC9632797 and PMC4443815: **reCAPTCHA** after rapid requests. Not used.
- arro.anglia.ac.uk eprint 312053 (Dijkstra 2014, qPCR colorectal appraisal, author repository): the fetch failed and returned no content. Not used.
- Nature Methods Points of Significance (nmeth.2659, .2698, .2900, .2813, .3005, .2937, .3137, plus the .pdf variants) served only the subscription preview through this tooling. Not used.
- PMC IDs returned by idconv for some DOIs (PMC5121211, PMC4961577, PMC4801026) resolved to unrelated articles. They were discarded. Jarvis & Williams 2016 (*TIPS*) could not be located in PMC.

Proposed new tag: `repeated-measures`. Within-subject or repeated-measures designs analysed as independent are now tagged `which-test` with `mixed-model-missing-values` or `two-way-anova`.
