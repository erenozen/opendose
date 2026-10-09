# Forums: biologists' statistics, graphing and data-handling problems

153 observations from 137 threads. Venues: forum.image.sc (66), support.bioconductor.org (41), help.galaxyproject.org (39), seqanswers.com (7).
Severity: wrong result risk 67, blocks the analysis 44, slows the work 38, cosmetic / preference 4. Every quote passed `verify.py` (0 problems).

## 1. Coverage

| Site | Status | Queries run | Threads fetched and read | Observations |
|---|---|---|---|---|
| help.galaxyproject.org (Discourse) | Reachable (200). Search hit HTTP 429 after 14 rapid queries and worked again after a pause | 19: prism, graphpad, statistics, "t-test", anova, "p-value", "fold change", plot, "bar chart", excel, normalize, replicates, "dose response", ic50, survival, heatmap, volcano, qpcr, "error bars" (graphpad, dose response, ic50 and error bars returned 0 topics) | 53 topics read through `/raw/<id>` | 39 |
| support.bioconductor.org (Biostar HTML search `/post/search/?query=`) | Reachable (200) | 22: prism (0), graphpad (0), "fold change excel", "plot like", "technical replicates", "biological replicates", qpcr, "western blot", "p value excel", excel, "dose response", "t-test", ic50, elisa, "standard curve", "error bars", "bar plot", "sample size", "two-way anova", "survival curve", "growth curve", ddct | 46 posts | 41 |
| forum.image.sc (Discourse) | Reachable this time: HTML search and `search.json` both returned 200 with a browser User-Agent | 24: prism, graphpad, statistics, "export measurements", superplot, "western blot quantification", normalize, "statistical analysis", "t-test", anova, "technical replicates", excel, "bar graph", densitometry, "error bars", "biological replicates", "fold change", "dose response", "standard curve", "which test", "p value", SEM, "how to plot", figure graph publication | 61 topics read through `/raw/<id>` | 66 |
| seqanswers.com | Reachable (200) | 5: prism, graphpad, "excel fold change", "error bars", "t-test qpcr" | 7 threads | 7 |
| protocol-online.org | Root and archive index return 200, but every forum section link (`/biology-forums-2/...`) and `/forums/index.php` return **404**. The forum is gone | probe only | 0 | 0 |
| physicsforums.com | Search page returns 200, but a GET search returns no results (XenForo needs the form POST). WebSearch could not find threads because this session's search budget was used up | probe only | 0 | 0 |
| bitesizebio.com | **403** (unreachable) | probe only | 0 | 0 |
| labroots.com | Search page returns 200, but results are rendered by JavaScript and none are in the HTML | probe only | 0 | 0 |
| the-scientist.com | Search returned **202** with an empty body | probe only | 0 | 0 |
| researchgate.net | **403**, as expected; not retried | probe only | 0 | 0 |

Unreachable or unusable URLs: `https://bitesizebio.com/?s=prism` (403), `https://www.researchgate.net/search?q=graphpad%20prism` (403), `https://www.protocol-online.org/forums/` and `https://www.protocol-online.org/biology-forums-2/*` (404), `https://www.the-scientist.com/search?q=graphpad` (202, empty), `https://www.labroots.com/search?q=graphpad` (JavaScript only), `https://www.physicsforums.com/search/?q=graphpad` (no results from a GET request). stats.stackexchange was out of scope because another agent covers it.

Raw search JSON and HTML are cached in `scratchpad/forums/cache/`. Page texts are in `scratchpad/cache/` (copied to `forums/cache/`).

## 2. Ten most frequent tags

| Tag | Count |
|---|---|
| normalization | 23 |
| n-definition | 19 |
| technical-vs-biological-replicates | 16 |
| image-analysis-exports | 14 |
| which-test | 14 |
| volcano-heatmap | 13 |
| qpcr-ddct | 13 |
| learning-curve | 12 |
| units-and-transforms | 12 |
| excel-paste | 11 |

## 3. Twenty strongest observations

**1. imagesc-118248-1** (forum.image.sc, 2025-12): Torn between N=3 wells and N=15 FOVs (or thousands of cells) for a t-test.  
> I am worried that the second method is pseudoreplication, but the first method feels like I am losing the nuance of the cell-to-cell variability.  
Link: https://forum.image.sc/raw/118248  
Why it is strong: Asks whether N is the well (3) or the field/cell batch (15); worries about pseudoreplication; the lab already bins cells to raise n.

**2. imagesc-33993-1** (forum.image.sc, 2020-02): Wants to pool ~600 cells from three independent repeats and treat each cell as n.  
> Then I decided to pool all treated cells and all controls for a general comparison. The question, more specifically, is: do I have the right, statistically, to do so?  
Link: https://forum.image.sc/raw/33993  
Why it is strong: Pools ~600 cells from 3 independent cultures and treats each cell as n; a reply shows run-to-run variance is significant.

**3. imagesc-86649-2** (forum.image.sc, 2023-09): Splitting images into sub-regions inflates n (pseudoreplication) and can manufacture significance.  
> Some people divide up subsections of images/coverslip to p-hack the results, but I suspect there are issues with that unless you are aware that there is reason for variation across the coverslip.  
Link: https://forum.image.sc/raw/86649  
Why it is strong: An experienced helper says people split images into sub-regions to p-hack, which is pseudoreplication by design.

**4. imagesc-114774-1** (forum.image.sc, 2025-07): Tried several normalisations and is tempted to keep the one that gives the expected result.  
> The only method that showed the changes we would expect for each marker was with the DAPI MGV, but I am concerned that this method is not accurately taking into account the confluence issue we have had with these cells.  
Link: https://forum.image.sc/raw/114774  
Why it is strong: Tried four normalisations and the only one giving the expected direction is the one they doubt: the choice is made by the outcome.

**5. imagesc-46220-1** (forum.image.sc, 2020-12): Two normalisation orders (normalise loading control first vs divide then normalise) give different numbers.  
> Would you please clarify the principle behind each strategy and which one should I follow, as I tried both and got different values!!!  
Link: https://forum.image.sc/raw/46220  
Why it is strong: Two common western-blot normalisation orders give different numbers and the user cannot tell which is right.

**6. galaxy-12496-2** (help.galaxyproject.org, 2024-05): Back-calculates a standard error from logFC/t by hand to get error bars into a graphing program.  
> Without individual sample logFCs I can't really do that statistics. ... I was able to calculate my error bar by > logFC/t and put that in my Prism table.  
Link: https://help.galaxyproject.org/raw/12496  
Why it is strong: Works out an error bar by hand as logFC/t to put into a Prism table because the tool gives no per-replicate values or SE.

**7. bioc-28041-1** (support.bioconductor.org, 2009): Same data give p = 0.025 in Excel and 0.1025 in R because the table was entered as a 2x2 contingency table.  
> When I tried to use chisq.test or fisher.test in bioconductor, I always got higher p-value than that with other sources. ... Using other sources such as Excel from Microsoft, I got p-value 0.025.  
Link: https://support.bioconductor.org/p/28041/  
Why it is strong: Excel gives p = 0.025 and R gives p = 0.1025 for the same counts because one tool read the data as a 2x2 contingency table. Signal: {'views': 1300}.

**8. imagesc-1470-1** (forum.image.sc, 2016-04): Online western blot tutorials teach unreliable quantification.  
> Everything I have found in the web so far was mostly going a in the wrong direction leading to non-reliable measurements! ... So, even while often suggested, drawing boxes around a band is not the proper way!  
Link: https://forum.image.sc/raw/1470  
Why it is strong: An expert says nearly every online western-blot tutorial leads to unreliable measurements.

**9. imagesc-21802-1** (forum.image.sc, 2018-12): Does not know how to compute error bars for biological replicates when each is built from technical replicates.  
> For each biological replicate I have several technical replicates. How do I calculate an error (or the SD for that matter) for the biological replicates that takes into account the errors of the replicates?  
Link: https://forum.image.sc/raw/21802  
Why it is strong: Does not know how to build an error bar for biological replicates that each contain technical replicates (same user returns in 56287).

**10. bioc-3267-1** (support.bioconductor.org, 2003): Unsure whether p-values or fold change are reliable with n=3.  
> I only have 3 replicates of each. Would you recommend a 2 tailed equal variance t test? I also thought I read that with such few replicates, a fold change would be better than a t test?  
Link: https://support.bioconductor.org/p/3267/  
Why it is strong: Asks whether a t-test or a fold change can be trusted with n = 3 (8.5k views). Signal: {'views': 8500}.

**11. bioc-9135173-1** (support.bioconductor.org, 2021): Unsure whether biological replicates may be averaged for display.  
> What alternatives do I have? Is it allowed to do a simple average on the normalized counts of each of the 3 samples converting it into a single normalized count??  
Link: https://support.bioconductor.org/p/9135173/  
Why it is strong: Asks whether biological replicates may be averaged for display (7.6k views). Signal: {'views': 7600}.

**12. bioc-40648-1** (support.bioconductor.org, 2011): No clear way to compare IC50s between groups.  
> I have 4 cell lines, 2 in group A and 2 in group B, for which I calculated IC50. I want to know if there is some difference between the 2 groups: a simple t-test seems to me a not correct test for this case.  
Link: https://support.bioconductor.org/p/40648/  
Why it is strong: Has IC50s for two groups of cell lines and feels a t-test on the IC50s is wrong, but finds no alternative. Signal: {'views': 1700}.

**13. seqanswers-55757-1** (seqanswers.com, 2016-05): Sample-size labels are added by hand in Excel.  
> However, I have to manually create text boxes to put the sample size above the error bar of each bar, and this can be time consuming. Ideally, I would also like the created graph to be editable in powerpoint.  
Link: https://www.seqanswers.com/forum/general/55757-automatically-place-sample-size-label-above-the-error-bar-for-each-bar  
Why it is strong: Adds n labels above every bar by hand in Excel and wants graphs that stay editable in PowerPoint.

**14. bioc-5534-1** (support.bioconductor.org, 2004): Spreadsheet silently converts gene names to dates or numbers.  
> A little detective work traced the problem to default date format conversions and floating-point format conversions in the very useful Excel program package. ... These conversions are irreversible; the original gene names cannot be recovered.  
Link: https://support.bioconductor.org/p/5534/  
Why it is strong: Excel turns gene names into dates and numbers for good. Signal: {'views': 1000}.

**15. imagesc-47079-1** (forum.image.sc, 2020-12): After generating the measurement spreadsheet the user does not know how to test significance or plot without learning to code.  
> How to analyse statistical significances? Is it required to learn R, Python etc., to make a proper plot?  
Link: https://forum.image.sc/raw/47079  
Why it is strong: A new user with a CellProfiler spreadsheet asks whether R or Python must be learned to test significance and make a proper plot.

**16. galaxy-16535-1** (help.galaxyproject.org, 2025-12): Sign of results appears reversed and the user cannot verify which group was the reference.  
> I am checking this because one of my known marker genes (per2, ENSDARG00000034503) shows higher VST expression in KO samples but the DESeq2 log2FC is negative, suggesting that the direction may be reversed  
Link: https://help.galaxyproject.org/raw/16535  
Why it is strong: A known marker gene goes the wrong way, which suggests the reference group was swapped, and the user cannot check this in the saved parameters.

**17. bioc-65804-1** (support.bioconductor.org, 2015): Analysis package cannot read the instrument's native file.  
> The instrument used for it is from Applied Biosystems ViiA7 Software v1.2 which gives out .eds file. How can I use to ddCt to analyse my files?  
Link: https://support.bioconductor.org/p/65804/  
Why it is strong: Cannot load QuantStudio/ViiA7 .eds files into a ddCt tool (3.4k views). Signal: {'views': 3400}.

**18. imagesc-69716-1** (forum.image.sc, 2022-07): Replacement tool lacks standard-curve conversion from optical density to binding units.  
> The MCID system would measure optical density and then convert the value to fmol/mg of receptor binding. ... The challenge I'm facing with image J is that it measures mean gray value.  
Link: https://forum.image.sc/raw/69716  
Why it is strong: Software that turned optical density into fmol/mg is obsolete. ImageJ gives grey values, and three labs in the thread are stuck.

**19. seqanswers-45825-1** (seqanswers.com, 2015-03): Undetected values are dropped as missing, biasing the comparison.  
> Basically, I have the expression data for 9 samples (treatment group) and only for 3-4 of the control. t-test comparison is not giving me any significant difference -but is it the right method to use at all when you have missing data???  
Link: https://www.seqanswers.com/forum/applications-forums/rna-sequencing/45825-rnaseq-validation-with-qpcr-how-to-handle-missing-data  
Why it is strong: qPCR non-detects in controls are dropped as missing before a t-test.

**20. imagesc-48805-1** (forum.image.sc, 2021-02): Exporting a million detections per case for 150 cases as CSV fails, so per-case summaries cannot be built.  
> But I have more than 150 cases which have around 1million data point per case. So when I tried to export the interesting features from detection measurement, it couldn't cope to transfer 150 cases at the same time with csv format.  
Link: https://forum.image.sc/raw/48805  
Why it is strong: 150 cases with about a million detections each break the CSV export, so per-case summaries cannot be made.

## 4. Surprises and patterns

- **Pseudoreplication is the leading statistics problem on the imaging forum.** Image analysis gives hundreds of cells per well, and users keep asking whether a cell, a field, a coverslip or a well is the n (33993, 21802, 56287, 86649, 118248, 73591, 8665, 67143, 43465). The question comes up from 2018 to 2025 without change. Helpers name it outright ("p-hack"; labs "average them into smaller bins") and point to SuperPlots. Several users want the answer computed for them: average to the replicate level, test there, and still show every cell.
- **Normalisation is the most frequent tag (23).** The worrying pattern is choosing a normalisation by its outcome. Users try several denominators and keep the one giving the "expected" result (114774, 96304, western blot 46220). A tool that shows the result under each candidate normalisation, or makes the user fix the choice first, would address this directly.
- **Prism is the place image-analysis exports end up.** CellProfiler's own survey ranks Prism as the 2nd-most-used program for CellProfiler data (13582). Users plan "spreadsheet → ratios → Prism" pipelines (42706, 43465) and back-compute SEs to "put that in my Prism table" (galaxy 12496). The handoff is per-object CSV with hierarchy columns (image, well, group). Clean import plus aggregation by level is the concrete need.
- **qPCR import is a persistent gap on Bioconductor.** Reading StepOnePlus, ViiA7/QuantStudio .eds, Bio-Rad and SDS files, handling technical-replicate wells and non-detects, and using gene-specific efficiencies make up 13 observations. The view counts are among the highest in the set (3.0k to 3.4k).
- **Numbers that differ between tools damage trust:** Excel vs R chi-square (0.025 vs 0.1025), DESeq2 vs edgeR vs limma hit counts, mean of raw vs mean of log fold change, Excel vs PDF curve-fit tables, quartile definitions. Each needs the method stated next to the number.
- **Galaxy users see p-value plumbing problems:** p = 0 underflow on volcano plots, NA rows, q vs p, the sign of a fold change set by factor order, and "log of a log". These belong to transforms and units more than to the choice of test.
- **Concerns about a web tool:** the first question a tester asked a new browser figure tool was where the data is stored (86484). Privacy has to be stated up front.
- **Small but real plotting needs:** n labels above bars without manual text boxes, graphs that stay editable in PowerPoint, significance asterisks on stacked bars, overlaying group curves, a log axis "like in excel", and export other than PDF screenshots.

## 5. Gaps

- protocol-online, bitesizebio, labroots, the-scientist and physicsforums gave no usable threads (blocked, 404, JavaScript-only, or POST-only search). The WebSearch budget was used up, so no physicsforums threads could be discovered.
- Galaxy and Bioconductor lean towards genomics. Pharmacology dose-response, ELISA standard curves and survival analysis are thin (bioc 7179, 87529, 40648, 9161284, 91658, 11240 only). No Galaxy topic matched "dose response", ic50 or graphpad.
- Discourse `/raw/` pages do not show view or like counts, so `signal` is null for image.sc and Galaxy. Bioconductor view counts are recorded.
- Bioconductor dates are the post month, read from the `datetime` attribute of each post page (re-fetched by the coordinator; the first pass had only years estimated from "N years ago"). Discourse dates are topic creation months from the search API.
