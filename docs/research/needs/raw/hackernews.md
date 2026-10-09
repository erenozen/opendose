# Hacker News: needs of bench scientists who analyse data

Venue: news.ycombinator.com, searched through the Algolia HN API. Each observation's quote was fetched from the comment's own page (`https://news.ycombinator.com/item?id=<id>`) with `fetch.py` and checked with `verify.py`: **101 observations, 0 with problems**.

## 1. Coverage

- **Queries run:** 112 Algolia queries (255 cached result pages: comment and story tags, up to 3 pages × 100 hits for comment queries). Queries included all the required terms: graphpad, "graphpad prism", prism statistics, lab software, biologist statistics, biologists excel, "wet lab" software, "wet lab" data analysis, IC50, "dose response", excel biology, excel gene names, JASP, jamovi, "R for biologists" (0 hits), SPSS biology, "error bars", p-hacking biology, "western blot", qPCR, "flow cytometry" software, FlowJo, ImageJ, "scientific plotting", "lab notebook" data, origin pro, sigmaplot, statistics for scientists, postdoc statistics. Further queries added: "electronic lab notebook", benchling, statistician biologist, "my PI" data, "my lab" excel, "wet lab" excel/statistics, "standard curve", ELISA, "curve fitting" biology, "Igor Pro", KaleidaGraph, "point and click" statistics, biostatistician, "bench scientist", "former biologist", "western blots", "p-values" biology, "technical replicates", pseudoreplication, minitab, jmp, "Kaplan-Meier", "survival curve", "nonlinear regression", "four parameter", "drug discovery" excel, "n=3", "biological replicates" and others.
- **Raw JSON cache:** `scratchpad/hackernews/cache/` (search pages, plus `item_<id>.json` for full threads).
- **Threads read in full (items API):** about 67 story threads, with comments filtered and read. Another 30 were fetched only for thread-level metadata (points, comment count). Main ones: Scientists rename human genes to stop MS Excel misreading them as dates (621 pts, 506 comments), the 2024 repost, Human genes renamed (2022), Autocorrect errors in Excel still creating genomics headache, Gene name errors are widespread (2016, 2018 posts), One in five genetics papers contains Excel errors (2016/2018), Mistaken Identifiers (2013), Microsoft fixes the Excel feature / Excel will allow auto-conversions to be turned off (2023), Why do we use R rather than Excel?, Is Microsoft Excel an Adequate Statistics Package?, Wizard for Mac, Statwing, A newcomer's (angry) guide to R, Why I use R, Future of Statistical Programming, 50% of neuroscience papers suffer from a major statistical error, That paper with the 'T' error bars was just retracted, Reproducibility trial: biologists get different results from same data, Bad scientific code beats best practices, Challenge to scientists: does your ten-year-old code still run?, Should biologists study computer science?, Successfully collaborating with computational biologists, Biology needs more staff scientists, Open source electronic lab notebook, Lab Notebooks (2020), How to digitize your lab notebooks, Protocols.io, Launch HN: Biodock, How much of Thermo Fisher's antibody data has been manipulated?, Fraud so much fraud, Prism (OpenAI, 2026; the name collision with GraphPad came up), and the threads behind every cited comment.
- **Comments screened:** about 16,100 unique comments in the search hits and thread pool. About 1,800 passed the keyword/first-person filters and were read as excerpts. **90 comment pages** were fetched with `fetch.py` and **88** of them yield the 101 observations.
- **Unreachable:** none. hn.algolia.com and news.ycombinator.com returned 200 for every request.
- **Signal note:** HN comment pages do not show per-comment votes. `signal` therefore holds the parent thread's `points` and comment count, taken from the Algolia items API for that story. It measures how much attention the thread got, not agreement with the individual comment.

## 2. Ten most frequent tags

| tag | count |
|---|---|
| learning-curve | 18 |
| which-test | 13 |
| trust-validation | 13 |
| reproducibility-audit | 13 |
| excel-paste | 13 |
| graph-formatting | 10 |
| file-compatibility | 10 |
| sharing-collaboration | 8 |
| data-entry-table-types | 7 |
| scripting-batch | 6 |

Severity split: wrong result risk: 47, slows the work: 40, cosmetic / preference: 9, blocks the analysis: 5.

## 3. Twenty strongest observations

1. **hn-28212043** (2021-08, biomedical researcher (stated)). A biomedical researcher says neither scripting nor Excel fits lab analysis and names purpose-built tools (JMP, GraphPad) as the better fit.  
   > IMO neither programming languages nor Excel are a great fit for data analysis. Something purpose-made, like JMP or even GraphPad, is probably the better choice in most situations.  
   https://news.ycombinator.com/item?id=28212043  
   *Why strong:* Names the gap directly: spreadsheet-like visibility plus real statistics, with no coding.

2. **hn-42991417** (2025-02, PI, neurogenetics lab (stated)). A PI says untrained grad students or postdocs get handed the lab's statistics and don't know what an outlier, normalization or metadata is.  
   > This grad or postdoc is then charged with running some statistical analyses without any training whatsoever in data science. What is an outlier anyway, what do you mean by “normalize”, what is metadata exactly?  
   https://news.ycombinator.com/item?id=42991417  
   *Why strong:* First-hand, from a PI with decades of lab experience. Shows the tool has to teach while it computes.

3. **hn-19942632** (2019-05, data analyst on biomedical papers (stated)). qPCR array with ΔΔCt normalised to one housekeeping gene: 80 miRNAs go up and none go down, and nobody questions it.  
   > Just today I am working on a qPCR array (yes people still use those) with one "housekeeping" gene replicated 4 times for ddCt normalization. 80 miRs go up, none go down, out of 400. No one sees any problem with this, the data is the data.  
   https://news.ycombinator.com/item?id=19942632  
   *Why strong:* A concrete wrong-result pattern that a ΔΔCt module could detect (reference-gene stability, one-directional shifts).

4. **hn-19942157** (2019-05, postdoc, biomedical research (stated)). A biomedical postdoc is asked almost daily to find differences with 1-2 samples per group.  
   > if a collaborator sends data for analysis where the sample size was too small for the effect, or worse, asked to find statistical differences between 1-2 samples per group, you can't fix that with any amount of algorithmic mumbo-jumbo.  
   https://news.ycombinator.com/item?id=19942157  
   *Why strong:* Strong case for n and power warnings. The postdoc says it happens 'almost daily'.

5. **hn-3285877** (2011-11, role not stated). In academic biology the unpaired t-test is used whatever the design.  
   > To the majority, the unpaired T-Test is the only test that is needed. Ever. Doesn't matter if you have one or two tails, paired or unpaired trials, normally distributed population or skewed.  
   https://news.ycombinator.com/item?id=3285877  
   *Why strong:* The classic which-test failure, stated plainly (pairing, tails, distribution).

6. **hn-21260015** (2019-10, former industry scientist (stated)). A former industry scientist saw switching from t to U after a non-significant t result, with few replicates.  
   > Example: using a non-parametric "U"-test when a parametric "T"-test gave a non-significant result. Along with low numbers of replicates.  
   https://news.ycombinator.com/item?id=21260015  
   *Why strong:* Test shopping. The test choice should be fixed from the design before results are shown.

7. **hn-3285876** (2011-11, role not stated). 'A significant, B not' gets taken as 'B > A' without testing the difference (from the neuroscience 50%-error thread).  
   > If in your data you find that A has no statistically significant effect, but B does have a statistically significant effect, this does not automatically show that B has, with statistical significance, more effect than A. To do that you have to do a statistical test on the difference in the effects.  
   https://news.ycombinator.com/item?id=3285876  
   *Why strong:* Interaction error behind half of the audited neuroscience papers. A tool can test the difference directly.

8. **hn-7226272** (2014-02, PhD student analysing biologists' data (stated)). Biologists insist on P values, then reduce results to asterisks.  
   > They insist I give them p-values or something they can present as though they were p-values. ... Then they throw out all the nuance in the data, put one asterisk for p < 0.05, two asterisks for p < 0.01, etc.  
   https://news.ycombinator.com/item?id=7226272  
   *Why strong:* Shows the demand for stars and the cost of dropping effect sizes and exact P.

9. **hn-49475440** (2026-08, former biophysicist (stated)). Biology data is stored for human reading (column blocks across sheets, labels to the side) and can't be processed.  
   > the data is stored in a convenient way for humans to read, but impossible to process via a script (think patches of columns in separate excel sheets, sometimes the labels are on the side of the value instead of on top).  
   https://news.ycombinator.com/item?id=49475440  
   *Why strong:* Points to an import or reshape need for messy bench spreadsheets.

10. **hn-3980141** (2012-05, role not stated). Western blot densitometry: open hundreds of JPGs one by one, draw a box, type the number into Excel.  
   > The standard solution is this software package that lets you open each .jpg file one by one (there is a folder with hundreds), and you draw little rectangles and it tells you the average brightness inside. You write the number down inside an excel spreadsheet one by one, alt-tabbing back and forth.  
   https://news.ycombinator.com/item?id=3980141  
   *Why strong:* A detailed manual workflow that batch densitometry with direct export would replace.

11. **hn-31914212** (2022-06, modeller working with wet-lab scientists (stated)). Wet-lab scientists fit hundreds of EC50 curves at once, and the curves should share structure.  
   > For example I work with bio folks measuring "EC50" values, basically parameters of titration curves in a wet lab. It seems like a simple curve fitting problem with say 5 parameters. But then these wet lab scientists measure hundreds of curves at once  
   https://news.ycombinator.com/item?id=31914212  
   *Why strong:* Need for global/shared-parameter fitting across many dose-response curves.

12. **hn-24072547** (2020-08, computer-savvy member of a lab collaboration (stated)). A locale decimal mismatch turned 123.456 into 123456 in lab data, and the error could go undetected.  
   > I send them some data in CSV, that when opened in Excel turned 123.456 into 123456 (it was a problem with locales, some people using "," as decimal and some using "."). ... A small quantity of numbers bumped up by a factor of 3 could fly under the radar, and distort further measurements.  
   https://news.ycombinator.com/item?id=24072547  
   *Why strong:* Silent factor-of-1000 error. Import needs explicit separator detection.

13. **hn-24072249** (2020-08, bioinformatician (stated)). Identifiers like 1E123 turn into numbers silently on 0.1% of rows. The commenter asks for a 'scientific mode'.  
   > identifiers in the form of "1E123" get turned into scientific numbers. ... Those things are sneaky: you can have thousands of rows, and Excel/LO doesn't mind if only the 0.1% matches its rules for smartness. They just change without notice, leaving the others intact.  
   https://news.ycombinator.com/item?id=24072249  
   *Why strong:* Silent, partial corruption, plus a concrete feature request.

14. **hn-18326230** (2018-10, computational biologist (stated)). Experimental colleagues using Excel can't remember months later how they transformed the data.  
   > As a computational biologist who uses R I am often frustrated by experimental colleagues who use Excel and often can't remember how they transformed the data months later.  
   https://news.ycombinator.com/item?id=18326230  
   *Why strong:* Reproducibility of point-and-click steps. Needs a recorded step log.

15. **hn-24079798** (2020-08, role not stated). Biologists stay in Excel because nothing else lets them iterate quickly and also present nicely.  
   > there isn't any other software that allows them to easily do whatever they need to do with the data, quickly iterating on the ideas AND then present it nicely.  
   https://news.ycombinator.com/item?id=24079798  
   *Why strong:* Explains why people stay in Excel: speed of iteration and presentation in one place.

16. **hn-24073099** (2020-08, partner of a research group member (stated)). A research group won't juggle a dozen tools and convert data between them 'fifty times an hour'.  
   > They don't want to have a dozen different tools that they have to switch between fifty times an hour, converting data in the meantime, they want to know one or two very well and have the data all there.  
   https://news.ycombinator.com/item?id=24073099  
   *Why strong:* Argues for one integrated workspace.

17. **hn-43546843** (2025-04, role not stated). matplotlib makes the broken x-axis ('one of the most basic need in physical science') a hack. The commenter misses Origin.  
   > matplotlib is simply too disappointing for making publication quality figures. The most recently encountered problem is how to plot with a broken x-axis, which is one of the most basic need in physical science but requires a non-trivial amount of hacking to get with matplotlib.  
   https://news.ycombinator.com/item?id=43546843  
   *Why strong:* A specific graph feature, and it ties to the Origin licence ending after university.

18. **hn-14652080** (2017-06, biologist (stated)). A biologist found Excel and Origin couldn't handle growing data sizes.  
   > At some point Excel and Origin weren't dealing well with ever increasing data sizes in my field (biology).  
   https://news.ycombinator.com/item?id=14652080  
   *Why strong:* Large-data limits in GUI tools, described first-hand.

19. **hn-12374958** (2016-08, author of a biochemical journal article (stated)). A 96-well (12x8) assay table was shown as a 3D column chart in a biochemistry paper.  
   > we had a 96-element datatable (12x8) and limited space in our biochemical journal article. We were looking to graphically show differences in orders of magnitude to help explain the assay. A 3d column chart fit the bill  
   https://news.ycombinator.com/item?id=12374958  
   *Why strong:* Shows a plate-map visualisation need (heatmap, log scale).

20. **hn-30989686** (2022-04, former academic lab researcher (stated)). Data points were selectively thrown out to publish better curve fits.  
   > data they'd collect from experiments would be thrown out selectively so that they could publish better curve-fits.  
   https://news.ycombinator.com/item?id=30989686  
   *Why strong:* Outlier and exclusion audit trail for fits.

## 4. Surprises / notable patterns

- **GraphPad Prism barely comes up on HN.** Only about 5 substantive mentions turned up, for example 'widely-used in academic fields other than the field of statistics, and quite intuitive' (16784092) and 'GraphPad Prism which try to bridge Excel and 'real' stats' (27982493). In January 2026 OpenAI named a writing product 'Prism', and commenters noted the collision with 'one of the last great pieces of optimized native software'. HN users describe bench work through Excel, R/Python and Origin, not Prism.
- **Most voices are second-hand.** Most commenters are bioinformaticians, computational biologists, analysts or partners of bench scientists describing what their wet-lab colleagues do. First-hand bench voices are fewer (a PI, a biophysicist, a haematologist, an immunologist, a pathology resident, biochemists). 65 of 101 observations have a stated role.
- **Silent data mutation is the biggest single theme.** Gene names becoming dates, IDs like 1E123 becoming numbers, locale decimals turning 123.456 into 123456, leading zeros stripped, and paste ignoring a text format already set. Commenters repeatedly ask for a 'scientific mode' that never changes values unless told to.
- **Analysts describe pressure toward p-hacking.** Several analysts report PIs asking them to 'double check' until the result appears, to test 1-2 samples per group, or to 'just run the algorithm' on suspect ΔΔCt data. Test shopping (t→U), subset selection and selective exclusion of points for curve fits show up again and again. These are design-level needs (pre-specified tests, exclusion logs, blinding) more than graphing needs.
- **Excel stays because of speed and presentation, not ignorance.** Several comments argue that scientists know R/Python but stay in Excel because it lets them iterate and present in one place and avoid switching between a 'dozen tools'. Their ask is a better Excel for scientists: typed columns, validation, no auto-conversion, fast with large data.
- **Origin users want the specific features they lost.** Axis breaks, publication defaults and batch fitting come up, along with frustration over .opj files and the licence ending after university.
- **Unexpected visual need.** A 96-well (12x8) assay table was shown as a 3D column chart for a biochemistry paper because no compact plate-map view existed.

## 5. Gaps

- No first-hand bench comments turned up on FlowJo/flow-cytometry analysis, survival/Kaplan-Meier, synergy or growth curves. 'R for biologists' returned 0 hits, and JASP/jamovi hits were mostly fuzzy matches.
- Algolia does fuzzy/typo matching, so short queries (JASP, ImageJ, ELISA, origin pro) returned tens of thousands of irrelevant hits. Only the first 2-3 pages (by relevance) were screened.
- There are no per-comment votes, so prevalence can't be weighted. The thread-level points are only a rough attention signal.
- The Excel gene-name threads are over-represented because they are the largest bench-science threads on HN.
