# Consulting and core-facility FAQ pages: needs digest

Venue type: statistics-consulting, statistics-help and core-facility FAQ / guidance pages at universities and institutes (the questions biologists bring to consultants). 183 observations from 51 distinct sites; severity mix: wrong result risk 101, slows the work 53, blocks the analysis 19, cosmetic / preference 10.

Each observation is a recurring question, warning or mistake stated on the page itself. `role` records the page audience ("course/consulting page, audience: ..."); where the page reports a specific client question (UCLA Mann-Whitney FAQ, UVA StatLab Dunnett article, Babraham PhD blog) the role says so.

## Coverage

Searched (WebSearch, US): "statistical consulting frequently asked questions", "before your consultation" biostatistics, "which test should I use"/"choosing a test" (MASH, statstutor), Cornell CSCU StatNews, UVA StatLab, qPCR / RNA-seq / flow / imaging / Luminex core-facility FAQs, "how many biological replicates" core FAQ, survival/Kaplan-Meier consulting lectures, SD vs SEM error bars, Harrell manuscript checklist, Melbourne SCC / UNSW Stats Central, Glasgow/Edinburgh/Bristol/Oxford stats advice. Pages were fetched with curl + text extraction (shared cache) and quotes checked with verify.py.

Pages read that yielded observations, per site:

| Site | Pages read (with observations) | Observations |
|---|---|---|
| cscu.cornell.edu | 13 | 17 |
| stats.oarc.ucla.edu | 10 | 13 |
| library.virginia.edu | 10 | 13 |
| bioinformatics.babraham.ac.uk | 1 | 12 |
| biomedical-sciences.ed.ac.uk | 9 | 12 |
| dag.compbio.dundee.ac.uk | 5 | 11 |
| statstutor.ac.uk | 1 | 7 |
| iths.org | 1 | 5 |
| uni-muenster.de | 1 | 5 |
| ucd.ie | 1 | 5 |
| med.stanford.edu | 1 | 4 |
| globalhealth.duke.edu | 1 | 4 |
| rd.mandela.ac.za | 1 | 4 |
| prism.northwestern.edu | 1 | 4 |
| nc3rs.org.uk | 1 | 4 |
| wp.unil.ch | 1 | 3 |
| dkfz.de | 1 | 3 |
| online.stat.psu.edu | 2 | 3 |
| bioinfocore.usu.edu | 1 | 3 |
| medicine.nus.edu.sg | 1 | 3 |
| mass-spec.stanford.edu | 1 | 2 |
| frdo.unm.edu | 1 | 2 |
| med.unc.edu | 1 | 2 |
| babraham.ac.uk | 1 | 2 |
| guides.library.lincoln.ac.uk | 1 | 2 |
| crick.ac.uk | 1 | 2 |
| med.virginia.edu | 1 | 2 |
| sheffield.ac.uk | 1 | 2 |
| bio.cam.ac.uk | 1 | 2 |
| nigms.nih.gov | 1 | 2 |
| libguides.shu.ac.uk | 2 | 2 |
| rushu.rush.edu | 1 | 2 |
| ainslielab.web.unc.edu | 1 | 2 |
| barricklab.org | 1 | 2 |
| satqpcr.sophia.inrae.fr | 1 | 2 |
| genomics.uci.edu | 1 | 2 |
| fharrell.com | 1 | 2 |
| pedsresearch.org | 1 | 1 |
| news.cuanschutz.edu | 1 | 1 |
| research.unt.edu | 1 | 1 |
| jku.at | 1 | 1 |
| uvm.edu | 1 | 1 |
| research.ucdavis.edu | 1 | 1 |
| research.lehigh.edu | 1 | 1 |
| umt.edu | 1 | 1 |
| maths.lu.se | 1 | 1 |
| stat.purdue.edu | 1 | 1 |
| leddy.uwindsor.ca | 1 | 1 |
| biostat.duke.edu | 1 | 1 |
| stat.fu-berlin.de | 1 | 1 |
| web.natur.cuni.cz | 1 | 1 |

Also read but no observation taken (generic service info only): warwick.ac.uk statistics clinics (1), auckland.ac.nz SCC FAQ (1), analytical.unsw.edu.au Stats Central (1), stat.berkeley.edu (1, personal page), medschool.cuanschutz.edu PCR core (1, service description only), guides/indices: stats.oarc.ucla.edu FAQ index (2), cscu.cornell.edu handout index + FAQ (2), library.virginia.edu article index (1), sheffield.ac.uk MASH statistics index (1).

Blocked or unreachable (not circumvented):

- dnatech.ucdavis.edu FAQ ("Why should I avoid technical replicates and pseudoreplicates?") - HTTP 403
- functionalgenomicscore.ucsf.edu/faq - HTTP 403
- scc.ms.unimelb.edu.au (Melbourne Statistical Consulting Centre, incl. outliers resource) - HTTP 403
- ctsi.ucsf.edu biostatistics consultation page - HTTP 403; surgerybiostat.ucsf.edu consult case-study PDF - HTTP 403
- mayo.edu BERD "preparing for an appointment" - Access Denied (403, Akamai)
- Harrell manuscript checklist: hbiostat.org/bib/checklist 404, biostat.app.vumc.org wiki retired, vumc.org/biostatistics/manuscript-checklist 404
- imperial.ac.uk stats advice service - 404; nigms.nih.gov replicates module PDF - 404; rrc.uic.edu informatics FAQ - 404; utmb.edu genomics core real-time PCR page - 404; stat.iastate.edu/consulting and medicine.utah.edu SDBC FAQ - 404; stat.fsu.edu consulting report - 404
- maths.shu.ac.uk (Sheffield Hallam "Which Test" tool) - DNS failure
- www.stat.ncsu.edu/consulting, cehs.usu.edu Stat Studio, publichealth.jhu.edu biostatistics center - connection failed (curl 000)
- sun.ac.za epidemiology/biostatistics FAQ - redirects to university home page; canr.msu.edu/scc/faq - JavaScript-only (80 chars); libguides.coventry.ac.uk sigma stats-test page - "not currently available due to visibility settings"; catalyst.harvard.edu/biostatistics - unusable response
- Note: online.stat.psu.edu and analytical.unsw.edu.au failed TLS verification (incomplete certificate chain / expired certificate) with default curl; these public pages were fetched with certificate verification disabled (not an access block).

## Ten most frequent tags

| Tag | Count |
|---|---|
| power-sample-size | 38 |
| which-test | 37 |
| technical-vs-biological-replicates | 24 |
| reporting-methods | 18 |
| nonparametric | 16 |
| n-definition | 15 |
| fit-diagnostics | 15 |
| effect-size | 14 |
| multiple-comparisons | 12 |
| reproducibility-audit | 12 |

## Twenty strongest observations

1. **consult-uva-dunnett-puzzle** (library.virginia.edu, wrong result risk; tags: post-hoc-choice, multiple-comparisons, trust-validation)  
   > Later, they learned that individual t-tests were not appropriate, so they used Dunnett’s test instead. However, they were puzzled: after adding just one more compound to the analysis, a result that had been significant became non-significant.  
   Problem: Users do not understand why adding a group changes other comparisons' adjusted p-values in Dunnett's test. Need: Explain multiplicity in the output: show how many comparisons the correction covers and why p changed. <https://library.virginia.edu/data/articles/understanding-dunnetts-test>

2. **consult-uva-dunnett-ttests** (library.virginia.edu, wrong result risk; tags: multiple-comparisons, post-hoc-choice, which-test)  
   > The data were analyzed using a one-way ANOVA, and then t-tests between each compound and the control to determine whether the differences were significant—that is, 20-30 comparisons against the control.  
   Problem: Labs run 20-30 uncorrected t-tests after ANOVA. Need: Default to Dunnett (vs control) after one-way ANOVA when a control column is marked. <https://library.virginia.edu/data/articles/understanding-dunnetts-test>

3. **consult-ucla-mannwhitney** (stats.oarc.ucla.edu, wrong result risk; tags: nonparametric, trust-validation)  
   > I ran a Mann-Whitney test on two independent groups that have equal medians, the results were significant. I thought that the Mann-Whitney tested differences in medians.  
   Problem: Researchers misread what the Mann-Whitney test actually tests (rank sums, not medians). Need: Nonparametric results that state plainly what was compared (mean ranks / distributions) and show medians alongside. <https://stats.oarc.ucla.edu/other/mult-pkg/faq/general/faq-why-is-the-mann-whitney-significant-when-the-medians-are-equal/>

4. **consult-cornell-pseudo** (cscu.cornell.edu, wrong result risk; tags: technical-vs-biological-replicates, n-definition)  
   > The mistake that the experimenters have made is that they have not replicated their treatments correctly. They actually have false “replicates” or subsamples.  
   Problem: Researchers treat subsamples within one treated unit as independent replicates (pseudoreplication). Need: Ask what unit received the treatment and set n to the number of experimental units, flagging subsamples. <https://cscu.cornell.edu/wp-content/uploads/pseudo.pdf>

5. **consult-babbio-whatisn** (bioinformatics.babraham.ac.uk, wrong result risk; tags: technical-vs-biological-replicates, n-definition, superplots)  
   > Technical versus biological replicates Not always easy to tell the difference • Design 1: One value per glass slide e.g. cell count • After quantification: 6 values • Sample size: n = 1  
   Problem: Six measured values from one culture are often counted as n=6 when n=1. Need: Data table that records the replicate hierarchy (day/culture/well) and computes n at the right level. <https://www.bioinformatics.babraham.ac.uk/training/GraphPadPrism/Intro%20to%20statistics%20with%20GraphPad%20Prism%20slides.pdf>

6. **consult-dkfz-replicates** (dkfz.de, wrong result risk; tags: technical-vs-biological-replicates, n-definition)  
   > The same sample on different arrays is considered a technical replicate , but the same treatment (different RNAs) on different arrays is a biological replicate .  
   Problem: "How many replicates?" is the first FAQ, and users confuse technical with biological replicates. Need: Replicate-type labels in the data table so technical repeats are averaged and n counts biological replicates. <https://www.dkfz.de/en/molecular-profiling-and-screening/expression-profiling-service/faq>

7. **consult-cornell-rm-missing** (cscu.cornell.edu, wrong result risk; tags: mixed-model-missing-values, missing-values, long-vs-wide)  
   > In contrast, in analyzing data in wide format, subjects with even only one missing repeated measurement will be completely excluded from the analysis.  
   Problem: Wide-format repeated-measures ANOVA silently drops any subject with one missing value. Need: A mixed-model fit that keeps subjects with missing time points, and a warning when rows are dropped. <https://cscu.cornell.edu/wp-content/uploads/repeatedmeasures.pdf>

8. **consult-cornell-posthoc-spss** (cscu.cornell.edu, blocks the analysis; tags: post-hoc-choice, two-way-anova, multiple-comparisons)  
   > In the SPSS menus, only post-hoc testing on main effects can be done. In order to do more sophisticated analyses, you need to use the syntax.  
   Problem: Menu-driven software cannot do simple-effects post-hoc comparisons within an interaction. Need: Point-and-click simple-effects comparisons (factor A within each level of B) after two-way ANOVA. <https://cscu.cornell.edu/wp-content/uploads/post.pdf>

9. **consult-nwu-surv-ttest** (prism.northwestern.edu, wrong result risk; tags: survival, which-test)  
   > Compare mean time between groups - T-test, linear regression? - Not normally distributed - Ignores subjects without events  
   Problem: Researchers compare mean time-to-event with t-tests, ignoring censored subjects. Need: Route time-to-event data to Kaplan-Meier/log-rank automatically. <https://prism.northwestern.edu/records/cag23-vdz25/files/BCC%20Statistically%20Speaking%20Survival%20Analysis%202019_LaurenBalmert.pdf?download=1>

10. **consult-ucla-onetailed** (stats.oarc.ucla.edu, wrong result risk; tags: which-test, reproducibility-audit)  
   > Choosing a one-tailed test after running a two-tailed test that failed to reject the null hypothesis is not appropriate, no matter how "close" to significant the two-tailed test was.  
   Problem: Researchers switch to one-tailed tests post hoc to reach significance. Need: Default two-tailed, require the tail choice to be made and recorded before seeing results. <https://stats.oarc.ucla.edu/other/mult-pkg/faq/general/faq-what-are-the-differences-between-one-tailed-and-two-tailed-tests/>

11. **consult-statstutor-normtests** (statstutor.ac.uk, wrong result risk; tags: nonparametric, fit-diagnostics)  
   > There are statistical tests for normality such as the Shapiro-Wilk and Kolmogorov-Smirnoff tests but for small sample sizes (n < 20), the tests are unlikely to detect non-normality and for larger sample sizes (n > 50), the tests can be too sensitive.  
   Problem: Normality tests are unreliable at the small n typical of lab work yet drive test choice. Need: De-emphasise normality-test p-values for small n; show QQ plots and guidance. <https://www.statstutor.ac.uk/resources/uploaded/tutorsquickguidetostatistics.pdf>

12. **consult-cornell-ci-overlap** (cscu.cornell.edu, wrong result risk; tags: error-bars-sd-sem, effect-size)  
   > In this document, we address the following question: can we judge whether two statistics are significantly different based on whether or not their confidence intervals overlap? The short answer is: not always.  
   Problem: Researchers judge significance by eye from overlapping CI/error bars. Need: Show the CI of the difference (estimation plot) rather than leaving readers to infer significance from overlapping bars. <https://cscu.cornell.edu/wp-content/uploads/ci.pdf>

13. **consult-iths-nonsig** (iths.org, wrong result risk; tags: effect-size, reporting-methods)  
   > Studies A and B are both “nonsignificant” •Only study B ruled out clinically important differences  
   Problem: Non-significant p-values are read as "no effect" without looking at the CI width. Need: Report effect size with CI next to every p-value so non-significance can be judged. <https://www.iths.org/wp-content/uploads/CDS-How-to-Prepare-for-your-Biostats-Consult__-final-10_4_2023-PDF.pdf>

14. **consult-unil-flow-real** (wp.unil.ch, wrong result risk; tags: flow-cytometry, trust-validation)  
   > This month, in FACS Tips we are answering a recurring question in our facility : Is my population real ? We often have to discuss with users about it and we will provide here an explanation so you can be confident your data is revelant.  
   Problem: Users repeatedly ask whether a small gated population is real. Need: Report CI for gated percentages based on event counts and controls. <https://wp.unil.ch/fcf/mailpoet-email/cba94f80e3a8-fcf-unil-june-2022-how-many-cells-is-enough/>

15. **consult-unm-postcollection** (frdo.unm.edu, blocks the analysis; tags: randomisation, power-sample-size, which-test)  
   > If you have already collected data without seeking biostatistical advice, expect –A lot of questions from the biostatistician! –Requests for considerable data clean-up on your behalf. –The possibility that the data you have collected may not answer the question(s) intended.  
   Problem: Data collected without design input often need heavy cleanup or cannot answer the question. Need: Design-stage guidance (replicates, groups, randomisation) before the experiment is run. <https://frdo.unm.edu/sites/default/files/Biostatistics_Support.pdf>

16. **consult-cornell-clust** (cscu.cornell.edu, wrong result risk; tags: technical-vs-biological-replicates, n-definition, superplots)  
   > All such data violate the assumption of independence of observations that we typically make in regression models. This is particularly influential on the variability of the model estimates, often resulting in standard errors that are smaller than they should be and thus leading to incorrect inference.  
   Problem: Nested data (cells within animals, repeated measures) analysed as independent gives too-small SEs. Need: Nested/hierarchical analysis options (nested t-test/ANOVA, mixed model) surfaced when data are clustered. <https://cscu.cornell.edu/wp-content/uploads/clust.pdf>

17. **consult-crick-bioimage** (crick.ac.uk, wrong result risk; tags: image-analysis-exports, superplots, technical-vs-biological-replicates)  
   > In particular, the use of appropriate controls and experimental repetition is critical for drawing meaningful conclusions. However, there are times when both are inadequately applied or overlooked in favour of 'statistical significance', often derived from misused or misinterpreted statistical tests.  
   Problem: Image-analysis results lean on p-values from misused tests instead of proper repetition and controls. Need: Image-derived data analysed per experiment (superplot style) with effect sizes. <https://www.crick.ac.uk/research/publications/practical-statistics-for-bioimage-analysis-a-guide-to-experimental-design-and-data-interpretation>

18. **consult-usu-degtools** (bioinfocore.usu.edu, wrong result risk; tags: numbers-differ-between-tools, normalization)  
   > All the DEG analysis tools are developed based on different normalization methods and assumptions. There is no single tool that can be declared better over other.  
   Problem: Different DE tools give different results because of different normalisation assumptions. Need: Transparent statement of normalisation method and a way to compare methods side by side. <https://bioinfocore.usu.edu/faq>

19. **consult-ucla-excel-mixed** (stats.oarc.ucla.edu, wrong result risk; tags: excel-paste, missing-values)  
   > If any further values in that column do not match the format of your first value, SPSS may convert that value to missing (as is the case with observation 9) or it may truncate the information to match the detected format.  
   Problem: Mixed-format cells are silently converted to missing on import. Need: Flag non-numeric cells on paste instead of silently dropping them. <https://stats.oarc.ucla.edu/other/mult-pkg/faq/general/tips-for-creating-an-excel-file-that-can-be-easily-moved-to-a-statistical-program-for-analysis/>

20. **consult-stanford-ortho-case** (med.stanford.edu, wrong result risk; tags: excel-paste, contingency)  
   > Example: “no”, “NO”, and “No” are treated as 3 different responses by statistical software, so ensure that capitalization and spelling are consistent  
   Problem: Inconsistent capitalisation of categories splits one group into several. Need: Detect near-duplicate category labels on import and offer to merge them. <https://med.stanford.edu/content/dam/sm/ortho/documents/Orthopaedic%20Biostatistics%20Consulting%20Information%2020180806.pdf>

## Anything surprising

- Design questions dominate, not software questions. power-sample-size and which-test together appear on most pages; consultants keep saying the real damage happens before data collection (DKFZ quoting Fisher's "post mortem", UNM, Duke, Penn State STAT 503, Cambridge "DECIDE ON YOUR STATISTICAL PROCEDURES ... BEFORE YOU COLLECT THE DATA"). A tool that only analyses finished tables misses the most-asked question.
- Core facilities (DKFZ arrays, USU/UNT RNA-seq, UNC/Emory/UNIL flow, UVA Luminex) all field "how many replicates?" and "technical vs biological?" themselves and then refer users to a statistician. The UNIL flow facility had to hand out its own Excel tool for event-count CIs, and UVA Luminex users get two large Excel reports and must dig for high-CV duplicates by hand.
- The UVA StatLab Dunnett article (2026) is a clean real-world case: a chemistry lab could not understand why adding one compound made another comparison non-significant, and why another lab got significance for the same effect. Multiplicity is invisible in typical output.
- Very old handouts are still the live answer: Cornell CSCU handouts date from 1996-2014 (updated 2022) and the UCLA FAQ still demonstrates Excel-to-SPSS import breakage (merged header rows, mixed-format columns silently turned into missing values).
- Several pages warn against exactly the defaults many lab tools make easy: switching to nonparametric tests whenever a normality test fails (Babraham, statstutor), normality tests at n<20 (statstutor), one-tailed tests chosen after the fact (UCLA, Babraham), judging significance from overlapping CIs (Cornell), and mean-time t-tests on survival data (Northwestern).
- Harrell's manuscript checklist, a classic reference for this venue, is no longer reachable at any of its known Vanderbilt/hbiostat URLs.

## Proposed new tags

None were used in the JSON (all observations use TAGS.md tags so verify.py passes). Suggested for the coordinator to consider:

- `repeated-measures`: within-subject / before-after designs (sphericity, wide vs long, pre-post); currently spread over two-way-anova and mixed-model-missing-values (Cornell rm-sphericity, rm-missing, prepost; statstutor-sphericity).
- `experimental-design`: design-stage questions before any data exist (what is the experimental unit, decide analysis before collecting, randomisation/blocking); currently approximated with power-sample-size, randomisation and which-test (DKFZ, UNM, Duke, Cambridge, Penn State STAT 503).

## Merged second researcher set

This file merges two independent passes over the same venue. The counts, tag table and per-site table above are
computed from the merged JSON (183 observations). The second pass contributed the observations whose ids
were not produced by the first pass (Edinburgh course, Dundee Data Analysis Group, UCD 3DNet dose-response
aide-memoir, NC3Rs, NUS survival, IACUC pages, Barrick/SATqPCR/Ainslie qPCR and standard-curve guidance and
others); 26 of its observations duplicated the first pass on the same URL and quote and were dropped.
Its strongest picks still in the merged file include consult-edinburgh-pseudorep-11, consult-nc3rs-subsample-49,
consult-uci-cells-n-86, consult-dundee-nonparam-smalln-41, consult-dundee-normality-test-40,
consult-ucd-independent-71, consult-ucd-constrain-70, consult-ainslie-perplate-74, consult-barrick-refgene-76,
consult-nus-censoring-81, consult-ucdavis-sem-power-83, consult-edinburgh-power-posthoc-15, consult-nigms-outliers-58.

### Second pass: coverage
**Web searches run (about 30):**
- "statistical consulting FAQ biologists technical/biological replicates"
- "common statistical mistakes" biologists consulting university guide
- flow cytometry core statistics FAQ biological replicates
- biostatistics consulting "before your consultation" what to bring
- qPCR core data analysis ΔΔCt replicates (two variants)
- UVA StatLab error bars / repeated measures / pseudoreplication
- "what is n" cell culture technical vs biological
- Cornell CSCU StatNews error bars
- statistics advisory service FAQ "which statistical test" .ac.uk
- Vanderbilt "statistical problems to document and to avoid"
- Harrell manuscript checklist / dynamite plots
- NC3Rs experimental unit
- ELISA standard curve 4PL core guide
- western blot densitometry core guide
- imaging core quantification "n" cells per field
- NIGMS clearinghouse replicates module
- "statistics for biologists" pseudoreplication SEM course notes
- GraphPad Prism workshop handout university
- Harvard Catalyst biostatistics FAQ
- libguides "choosing a statistical test"
- Penn State STAT 502 experimental unit
- Monash/UNSW/Melbourne consulting FAQ
- "how many samples do I need" consulting FAQ
- Duke "10 things" biostatistician
- dynamite plot / show individual points biostatistics policy
- EMBL/Crick replicates guidance
- Assay Guidance Manual curve fitting
- normalised-to-control statistics
- survival Kaplan-Meier common mistakes
- IACUC statistics guide experimental unit
- flow MFI mean vs median core FAQ
- microscopy core image analysis guidelines
- CSCAR pseudoreplication
- n = 3 independent experiments
- Imperial statistical advisory service

**Pages fetched with fetch.py:** about 115 URLs. About 95 returned content and were read, and 58 pages yielded observations.

Main sources and the number of observations from each:
- University of Edinburgh "Experimental design and data analysis" course (12 chapters fetched, 9 used): 12
- Dundee Data Analysis Group statistics lectures (8 PDFs fetched, 6 used): 11
- Babraham Institute "Intro to statistics with GraphPad Prism" slides and exercises: 10
- UVA Library StatLab (12 articles fetched, 9 used): 9
- UCLA OARC FAQs and whatstat (12 pages fetched, 5 used): 5
- UCD 3DNet dose-response curve-fitting aide-memoir: 5
- NC3Rs experimental-unit guidance: 4
- University of Münster "Statistics for Biologists" course page: 4
- NUS Research Support Unit survival article: 3
- 25 further sites with 1–2 observations each:
  - core facilities: UNC Flow, UNIL Flow, DKFZ, UVM CBSR, Charles University microscopy, UCI Biostatistics Shared Resource
  - IACUC pages: UC Davis, Lehigh, Montana
  - consult and FAQ pages: ITHS, CU Anschutz, Lund, Purdue, Windsor, Mandela, Duke, FU Berlin, Rush, Stanford Ortho, Sheffield Hallam
  - lab and tool guidance: Ainslie lab (UNC), Barrick lab, SATqPCR (INRAE)
  - other guidance: NIGMS training module, Harrell (Vanderbilt)

**UNREACHABLE (not circumvented):**
- https://www.statstutor.ac.uk/resources/ returned 403.
- https://university.open.ac.uk/stem/mathematics-and-statistics/research/statistical-advisory-service returned 403.
- https://www.mayo.edu/research/centers-programs/center-clinical-translational-science/resources/consultative-resources/biostatistics-epidemiology-and-research-design-berd-resource/preparing-for-an-appointment returned 403.
- https://www.nih.gov/sites/default/files/research-training/initiatives/reproducibility/module4-biological-and-technical-replicates.pdf returned 403.
- https://www.ncbi.nlm.nih.gov/books/NBK91994/ (NCATS Assay Guidance Manual) returned a reCAPTCHA "Checking your browser" page, which counts as a captcha.
- https://online.stat.psu.edu (STAT 502 and STAT 555 notes) failed with a TLS certificate error (curl exit 60), so no content was obtained.
- These fetches failed with status 000 and no content:
  - https://ssamg.stat.fsu.edu/consult/cfaq.php
  - https://stemedhub.org/resources/1443
  - https://med.uvm.edu/mic/rigor_and_reproducibility
- https://catalyst.harvard.edu/biostatistics/consultations returned an unusual status (781) and no usable content.
- These URLs returned 404, mostly because the pages have moved:
  - Babraham `training/Intro_Stats_Prism/`
  - Vanderbilt biostat wiki `ManuscriptChecklist` and `StatisticalPolicy`
  - hbiostat `bib/checklist`
  - vumc.org manuscript-checklist
  - Imperial SAS pages and advice form
  - SFU complex designs
  - UW Carbone flow lecture PDF
  - research.charlotte.edu sample-size page
  - the old NIGMS `training/documents` path (the `sites/nigms/files/migrated/` copy was used instead)
  - two guessed UCLA FAQ URLs
- These pages returned 200 but had no usable content:
  - Stellenbosch FAQ, which redirected to the homepage
  - Sheffield MASH statistics and Cornell CSCU news, which contained navigation only

### Second pass: surprises
- **"What is n?" is the most common theme across sources.** The same pseudoreplication warning appears in:
  - the Prism course (Babraham)
  - university courses (Edinburgh, Dundee)
  - core facilities (UNC Flow, DKFZ)
  - IACUC guidance (Lehigh)
  - national guidance (NC3Rs)
  - an omics biostatistics core (UCI)

  NC3Rs goes further and argues that the labels "biological/technical replicate" are part of the problem, and recommends the experimental-unit / observational-unit vocabulary instead.
- **Consultants push back on the usual software flowchart, "not normal → Mann-Whitney".**
  - UCLA (a client question), UVA and Edinburgh all address the Mann-Whitney-as-median-test misconception.
  - Edinburgh does not teach non-parametric tests at all.
  - Dundee shows that n = 3 gives only 5 possible p-values.
  - Dundee, UVA and Windsor all advise against gating on a normality test of raw data. They recommend checking residuals instead.
- **Institutional guidance can be wrong itself.** The UC Davis IACUC page says to use the SEM as the variability input for power analysis. This builds the SD/SEM confusion into the official guidance.
- **Multiplicity confusion appears even after a correction has been applied.** The UVA case is students who switched to Dunnett's test, then could not understand why adding one more compound turned a significant result non-significant.
- **Consulting capacity is scarce.** Mandela has 2 consultants for all campuses, Lund's unit is unfunded, CU Anschutz offers one hour, and FU Berlin and Duke will advise but not implement. Several FAQs exist mainly to send people to self-service. This is a direct opening for guided, self-serve analysis.
- **Graphing advice is consistent across sources:**
  - show the points
  - label the error-bar type
  - use colour-blind-safe palettes
  - no bars on log axes
- **Dose-response and standard-curve guidance comes from training aides and lab FAQs, not from consulting centres.** It focuses on enforceable checks:
  - constrain at most one parameter
  - plateaus must be defined
  - one curve per plate
  - samples bracketed by at least two standards

### Second pass: gaps
- **Western blot densitometry:** search results were dominated by vendor pages (Bio-Rad, LI-COR, Abcam, Boster), which are outside this venue. No university core page was found.
- **Not covered at all:** synergy, Bland-Altman, ROC, enzyme kinetics, growth curves and PCA. Consulting FAQ pages rarely address them.
- **Flow cytometry MFI (mean vs median):** only vendor and blog pages were found.
- **Blocked or missing sources:**
  - NCBI Assay Guidance Manual (captcha) and Penn State online notes (TLS failure)
  - Vanderbilt checklist pages (moved, 404), so Harrell's manuscript checklist is represented only by his errmed blog page
- **Imaging cores:** these pages seldom state statistical rules. The Charles University and UVM pages are about consult preparation and ethics, not about n.
- **Overlap with other venues:** some sources are lecture and course material rather than Q&A FAQs. They are included because they are written as answers to recurring consultant questions. ARRIVE and journal guidelines were left to other venues.
