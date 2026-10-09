# Needs catalogue: social (Bluesky and Mastodon)

Venue family: Bluesky and the Mastodon fediverse. Collected 2026-10-09. Raw observations are in `social.json`. The agent collected 56 observations from 53 posts (`verify.py`: 56 observations, 0 with problems). The coordinator then removed 15 from authors outside bench and lab science (psychology, sociology, politics, digital humanities, geography, survey design, presentation training, and a general methodology account), leaving **41**.

**About the `url` field.** Each observation's `url` is the human permalink. A Mastodon permalink returns only an HTML shell with a truncated title, so quotes were checked against the public status JSON (`https://<host>/api/v1/statuses/<id>`), which holds the full text. `venue` is the host that served that JSON. Two posts federated from non-Mastodon servers have object URLs as their permalinks.

## 1. Coverage

### Bluesky: unreachable

Re-tested once with a desktop Chrome User-Agent (`Mozilla/5.0 (Windows NT 10.0; Win64; x64) ... Chrome/124`):

| Endpoint | HTTP | Body |
|---|---|---|
| `https://bsky.social/xrpc/app.bsky.feed.searchPosts?q=graphpad&limit=100` | **401** | `{"error":"AuthMissing","message":"Authentication Required"}` |
| `https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=graphpad&limit=100` | **403** | HTML `403 Forbidden` page |

Both refused, so Bluesky is listed as UNREACHABLE and no further Bluesky calls were made. A few Bluesky posts bridged into Mastodon via Bridgy Fed (`bsky.brid.gy`) showed up in hashtag timelines, but none yielded an observation.

### Mastodon: what was tried

**Full-text status search** (`/api/v2/search?q=...&type=statuses`, unauthenticated). Queries `graphpad`, `graphpad prism`, `IC50` and `error bars`. Every reachable instance returned **HTTP 200 with zero statuses**, because unauthenticated full-text search is disabled:

| Instance | Status search | Hashtag timelines |
|---|---|---|
| mastodon.social | 200, 0 results | 200. Hit transient **429** after ~400 requests at 0.6 s spacing (17 × 429); bulk paging there was stopped. Single status/thread fetches later returned 200 |
| fediscience.org | 200, 0 results | 200 (406 requests) |
| mstdn.science | 200, 0 results | 200 (368 requests) |
| ecoevo.social | 200, 0 results | 200 (407 requests) |
| neuromatch.social | 200, 0 results | **422** on every tag timeline (public timelines need auth); 21 tags tried |
| genomic.social | **429** (first request) | **429**. UNREACHABLE for bulk harvest. Single status fetches later returned 200, and its posts were also read through federated copies |
| scholar.social | **429** (first request) | **429**. UNREACHABLE for bulk harvest; one status fetch later returned 200 |
| sciencemastodon.com | connection failed (HTTP 000) | connection failed (000, also `/api/v1/instance`). UNREACHABLE |

`/api/v2/search?q=graphpad&type=hashtags` works without auth and confirmed that `#graphpad` exists on mastodon.social and fediscience.org. WebSearch was also tried for `site:` discovery of Mastodon posts and returned no Mastodon results.

**Hashtag timelines** (`/api/v1/timelines/tag/<tag>?limit=40`, paginated with `max_id`). These are federated, so each instance's timeline also carries posts from other servers it knows about.

- Round 1, mastodon.social (up to 25 pages): graphpad (2 posts), graphpadprism (0), prism (729, almost all photography, optics, NSA or software), ic50 (0), ec50 (1), superplots (0), superplot (0), labrats (31), lablife (316), phdlife (1000), westernblot (13), qpcr (35), flowcytometry (51), biostatistics (262), biostats (16), pharmacology (667), statistics, rstats, dataviz, stats, datavisualization, excel, phdchat, academicchatter, cellbiology, immunology, microbiology (1000 each), neuroscience (200, then 429), and reproducibility, errorbars, pvalue, anova, curvefitting, doseresponse (1 page each before 429).
- Round 1, fediscience.org, mstdn.science and ecoevo.social (up to 15 pages): graphpad (1/1/2), graphpadprism (0), prism (166/47/74), ic50 (0), superplots (0), labrats, lablife, phdlife, westernblot, qpcr, flowcytometry, biostatistics, statistics, rstats, dataviz, stats, excel, pharmacology, academicchatter, errorbars, anova.
- Round 2, fediscience.org, mstdn.science and ecoevo.social (up to 10 pages): overlyhonestmethods, scientistsonmastodon, postdoc, postdoclife, phdstudent, wetlab, labtech, molecularbiology, biochemistry, microscopy, imagej, fiji, elisa, flowjo, ggplot2, ggplot, figures, scientificfigures, openscience, statstab, nhst, pvalues, spss, sigmaplot, originlab, jmp, cellbio, neuro, drugdiscovery, cancerresearch, datavis, biology, immunology, microbiology, cellbiology, neuroscience, reproducibility, science. Round 2 on mastodon.social was abandoned after page 1 of each tag returned 429.

**Volume read.**

- 26,780 unique statuses were harvested (deduplicated by `uri`). The raw JSON is in `scratchpad/social/cache/`.
- 1,347 passed a keyword filter (stats, graphing, software and bench terms). About 640 of those were read by hand in four triage passes; the rest were obvious noise such as photography, hockey and news bots.
- 32 reply threads were requested through `/api/v1/statuses/{id}/context`; 26 returned 200 (fosstodon.org, genomic.social, scholar.social and biologists.social returned 429 on some context calls). That is about 120 replies read.
- 53 individual statuses were fetched with `fetch.py` as quote sources.

**Yield.** 56 observations came from 53 posts. The fediverse has few hashtag-scoped posts from bench scientists about analysis pain: #graphpad has 1–2 posts per instance, and #ic50 and #superplots have none. Most signal came from #prism threads, #qpcr, #imagej/#fiji, #spss, #ggplot, #statistics and #academicchatter. I did not pad to reach 40+ with generic Excel complaints from non-scientists; those were excluded.

## 2. Ten most frequent tags

| Tag | Count |
|---|---|
| file-compatibility | 6 |
| price-licence | 5 |
| scripting-batch | 5 |
| graph-formatting | 5 |
| image-analysis-exports | 5 |
| reproducibility-audit | 4 |
| mac-windows | 3 |
| which-test | 3 |
| learning-curve | 3 |
| multiple-comparisons | 3 |

Severity split: wrong result risk 18, slows the work 16, blocks the analysis 5, cosmetic / preference 2.

## 3. Twenty strongest observations

**1. `mastodon-genomic.social-114506754117309085`**: University dropped the Prism licence; non-coders cannot open or move their own Prism data  
> I'm trying to help people (with 0 coding experience or desire to gain coding experience) transition out of GraphPad PRISM as our uni has removed our license. Does anyone have any thoughts on the best way to get data out of Prism without a licence?  
Why strong: A university dropped its Prism licence and non-coders were left unable to reach their own data. This is the clearest licence-to-lock-in story in the venue.  
Link: https://genomic.social/@IanSudbery/114506754117309085 (role: Senior Lecturer in Bioinformatics, University of Sheffield (bio); helping non-coding colleagues; date 2025-05-14)

**2. `mastodon-genomic.social-114506754634454595`**: Hundreds of .prism files per person, a decade of work, with no parser for the new format  
> There appear to be both python and R parsers for the old .pzfx files, but not the new .prism ones. I'm talking about over a decade of work in some peoples cases - 100s of files.  
Why strong: Gives the scale: a decade of work and hundreds of .prism files per person, with no parser for the new format.  
Link: https://genomic.social/@IanSudbery/114506754634454595 (role: Senior Lecturer in Bioinformatics (bio); date 2025-05-14)

**3. `mastodon-genomic.social-114506830596065070`**: Perceives the new Prism file format as a closed lock-in of users' own data  
> What I've seen is that it's completely closed format intended to lock people into the product. ... Hopefully they'll change direction and realize that locking up people's data is just going to drive many people away to use R and Python only.  
Why strong: An independent second researcher in the same thread reads the new format as deliberate lock-in.  
Link: https://genomic.social/@thatdnaguy/114506830596065070 (role: Human genetics / bioinformatics researcher (bio); date 2025-05-14)

**4. `mastodon-ecoevo.social-110677979190555740`**: Needed Prism for work on Linux; ended up with a cracked copy under Wine  
> it is for my job, I ended up having to crack it and using wine but I kind of hate it  
Why strong: A biologist who needed Prism for work ended up with a cracked copy under Wine. Shows what platform and licence gaps push people into.  
Link: https://peculiar.florist/notes/9gxfc2e9dro393ij (role: Biologist (bio: double master's in biology); date 2023-07-08)

**5. `mastodon-scholar.social-99655618416874622`**: The right analysis was skipped because nobody in the lab could run it  
> we didn't use this statistical analysis because no one in the lab knows how to work it and I can't learn it fast enough  
Why strong: The right analysis was skipped purely because no one in the lab could run it. The tool's learning curve changed the science.  
Link: https://scholar.social/@noctiluca/99655618416874622 (role: Emergency medicine doctor (bio); date 2018-03-09)

**6. `mastodon-mastodon.social-100148566883057939`**: A PI has to research for themselves whether to run ANOVA or t-tests  
> Diving deep into #Statistics, #R and #prism to try to figure out whether to use #ANOVA or #ttest to analyse our results. ... It can be a luxury as a busy PI  
Why strong: A professor and PI researching ANOVA vs t-test herself across R and Prism. The test choice is unresolved even at PI level.  
Link: https://mastodon.social/@paulasalgado/100148566883057939 (role: Professor of Structural Microbiology, PI (bio); date 2018-06-04)

**7. `mastodon-fosstodon.org-117332651449828950`**: PI wants to switch tests after seeing the p-value  
> we cannot change the statistical test just because you don't like the p-value  
Why strong: A bioinformatician pressured to switch tests after seeing the p-value. A direct wrong-result risk.  
Link: https://fosstodon.org/@Mehrad/117332651449828950 (role: Bioinformatician working with clinicians (bio); date 2026-09-25)

**8. `mastodon-mathstodon.xyz-117333598594724198`**: Pressure from scientists to swap tests and drop FDR correction  
> I've faced *exactly* that situation in the past. (Right down to "change the stat so the p-value is better", and "stop with the FDR correction because my favorite gene isn't high enough".)  
Why strong: Independent corroboration: asked to drop FDR correction, and escalated to an ethics board.  
Link: https://mathstodon.xyz/@weekend_editor/117333598594724198 (role: Retired physicist, ML and stats for cancer drug discovery (bio); date 2026-09-25)

**9. `mastodon-fosstodon.org-117333061316056667`**: Power calculations and analysis plans are rarely done before data collection  
> I have rarely seen power calculation and Statistical Analysis Plan done prior to data collection in the university hospitals.  
Why strong: Power calculations and analysis plans are rarely done before data collection in university hospitals.  
Link: https://fosstodon.org/@Mehrad/117333061316056667 (role: Bioinformatician (bio); date 2026-09-25)

**10. `mastodon-genomic.social-115865598274212482`**: qPCR instrument output (.eds) cannot be read without the vendor suite  
> Anyone know of a good way to examine EDS files from a Thermofisher RT-PCR machine that doesn't require installing the software suite? ... But I fundamentally oppose data locked into a proprietary format for long-term archiving.  
Why strong: qPCR run files (.eds) can only be opened with the vendor suite, which is a barrier to import and archiving.  
Link: https://genomic.social/@thatdnaguy/115865598274212482 (role: Human genetics / bioinformatics researcher (bio); date 2026-01-09)

**11. `mastodon-social.anoxinon.de-113362576978151533`**: A single influential point skews results in many published papers  
> We are working on a paper where we show that 29 % of papers in top journals like Science, Nature & PNAS were skewed by a single influential data point!  
Why strong: Puts a number on it (claimed, from a paper in progress): 29% of top-journal papers were skewed by one influential point.  
Link: https://social.anoxinon.de/@RoedigerRG/113362576978151533 (role: Research group in bioanalytics/pharmacology/qPCR (bio); date 2024-10-24)

**12. `mastodon-ecoevo.social-114440041747939117`**: Image scale is silently lost after rotate/crop, so scale bars come out wrong  
> I took images with the same magnification and zoom. I rotated and cropped them in FIJI and added scale bars. The scale bar on one of the images is longer than the others. What is going on. I am literally about to lose it.  
Why strong: A cell-biology lab manager's scale bars silently came out wrong after rotate/crop. The error is invisible until it is published.  
Link: https://qoto.org/@Drosmel/114440041699396307 (role: Research scientist and lab manager, cell biology PhD (bio); date 2025-05-02)

**15. `mastodon-fosstodon.org-116013906772213820`**: Wet-lab spreadsheets are messy and inconsistently named, which breaks downstream analysis  
> Experimental folks in the biological sciences really need to learn how to fill out an Excel sheet. The sheet starts in row 1, column A. ... Plus, you can't keep changing the nomenclature.  
Why strong: Wet-lab spreadsheets break downstream analysis: columns move and sample names keep changing.  
Link: https://fosstodon.org/@rohitfarmer/116013906772213820 (role: Computational biologist (bio); date 2026-02-04)

**16. `mastodon-mathstodon.xyz-115977601390005740`**: Estimation (effect-size) tools do not handle shared-control, repeated-measures and two-way designs  
> However, current estimation tools struggle with the complex, multi-group comparisons common in biological research. ... There's institutional-wide need for change in the biological sciences when it comes to statistical handling of data.  
Why strong: Estimation tools do not cover the shared-control, repeated-measures and two-way designs common in biology (10 favourites, 9 boosts).  
Link: https://mathstodon.xyz/@albertcardona/115977601390005740 (role: Group leader, MRC LMB / Professor, Cambridge, neuroscience (bio); date 2026-01-29)

**17. `mastodon-mastodon.social-114773280307710791`**: Six tumour growth panels with different y-axis scales mislead comparison  
> the use of six tumor growth plots with mismatched Y-axis scales weakens the data’s clarity and scientific integrity.  
Why strong: Six tumour growth panels with mismatched y-axes in an immunology preprint: a multi-panel default that misleads readers.  
Link: https://bookstodon.com/@BOOKidealist/114773280194272146 (role: Reader commenting on an immunology preprint (bio: news/books account); date 2025-06-30)

**19. `mastodon-genomic.social-111632643369774216`**: FlowJo's built-in tools fall short, so the lab hard-codes its own analyses  
> this appears to make a lot of the analyses that our lab has hard-coded into a very nifty interactive web-app!! Really awesome way to make complex #FlowCytometry analysis accessible when built-in tools to #FlowJo don't quite deliver!  
Why strong: FlowJo's built-in tools fall short, so an immunology lab hard-codes its own downstream cytometry analysis.  
Link: https://genomic.social/@carondanielp/111632643369774216 (role: PhD candidate, immunology (bio); date 2023-12-24)

**20. `mastodon-mastodon.au-109710020351052909`**: Group differences on tSNE/UMAP plots are judged by eye, with no test  
> Ever use a #tSNE or #UMAP in #scSeq, #flowcytometry or #masscytometry? It doesn't have to be just a pretty picture anymore - we've developed a statistical test to check for differences.  
Why strong: Group differences on cytometry tSNE/UMAP plots are judged by eye. The poster built a statistical test for this.  
Link: https://mastodon.au/@ListonLab/109710020351052909 (role: Medical researcher, immunology lab head (bio); date 2023-01-18)

## 4. Surprises and notable patterns

- **Prism's newer `.prism` format is a live pain point.** The single richest thread (genomic.social, May 2025) is about a university dropping its licence and leaving years of `.prism` files unreadable. Parsers exist for `.pzfx` but not `.prism`. Even a bioinformatician cannot work out the sheet/table/dataset model. The need is an open, documented format and a licence-free reader or importer.
- **Lock-in recurs across vendors.** Thermo qPCR `.eds`, proprietary microscope formats, SPSS 7.5 `.por`, Prism `.prism`, FlowJo's limits. People want to open instrument and analysis files without the vendor suite, and to batch-convert them.
- **Linux and price come up together.** Prism has no Linux build. One biologist cracked it and ran it under Wine. Students are asked to pirate SPSS. People learn R so they don't depend on paid software at their next job.
- **Integrity pressure.** Two independent statisticians describe PIs or clinicians asking them to change the test after seeing p, or to drop FDR correction for a favourite gene. One escalated to an ethics board. A tool that records the pre-specified test and makes correction the default would help them say no.
- **Image analysis silently corrupts units.** Fiji/ImageJ loses spatial or greyscale calibration after rotate or crop, so scale bars come out wrong. Two independent reports.
- **Plotting basics still cost hours.** A grouped mean ± error bar with joined means took a statistical methodologist hours in ggplot. She also worried that computing summaries outside the plot introduces errors.
- **The bench-scientist voice is thin; the voice of methodologists and bioinformaticians around bench scientists is loud.** Many posts describe bench scientists from the outside: messy Excel sheets, misread p-values, N=3. This is useful but second-hand.

## 5. Gaps

- **Bluesky** (401/403) was not covered at all, even though more of the bench-biology community has moved there than to Mastodon.
- **Mastodon full-text search** is disabled without authentication everywhere, so posts that mention Prism or IC50 without a hashtag were missed. Discovery was limited to hashtags and reply threads.
- **Rate limits.** mastodon.social round 2 tags were limited to one page each after the 429s. genomic.social and scholar.social were reached only through single-status fetches and federated copies, and sciencemastodon.com not at all. neuromatch.social needs auth for timelines (422).
- **Topics with no hashtag traffic:** IC50/EC50 curve fitting, superplots, normalisation, Western blot densitometry analysis and survival curves produced no observations.
- **Signal numbers** (favourites, boosts, replies) are as served by the host in `url`. A federated copy can undercount compared with the origin server.

## Appendix: permalinks

| id | permalink |
|---|---|
| mastodon-genomic.social-114506754117309085 | https://genomic.social/@IanSudbery/114506754117309085 |
| mastodon-genomic.social-114506754634454595 | https://genomic.social/@IanSudbery/114506754634454595 |
| mastodon-genomic.social-114506830596065070 | https://genomic.social/@thatdnaguy/114506830596065070 |
| mastodon-genomic.social-114506867222722017 | https://genomic.social/@IanSudbery/114506867222722017 |
| mastodon-biologists.social-114507592244107884 | https://biologists.social/@steveroyle/114507592244107884 |
| mastodon-ecoevo.social-110469736129269329 | https://akko.koifu.re/objects/6135c331-ce9d-4ad3-9788-28db6e2b1c03 |
| mastodon-ecoevo.social-110677979190555740 | https://peculiar.florist/notes/9gxfc2e9dro393ij |
| mastodon-mastodon.social-100148566883057939 | https://mastodon.social/@paulasalgado/100148566883057939 |
| mastodon-fosstodon.org-117332651449828950 | https://fosstodon.org/@Mehrad/117332651449828950 |
| mastodon-fosstodon.org-117332651449828950-2 | https://fosstodon.org/@Mehrad/117332651449828950 |
| mastodon-fosstodon.org-117332651449828950-3 | https://fosstodon.org/@Mehrad/117332651449828950 |
| mastodon-fosstodon.org-117333061316056667 | https://fosstodon.org/@Mehrad/117333061316056667 |
| mastodon-mathstodon.xyz-117333598594724198 | https://mathstodon.xyz/@weekend_editor/117333598594724198 |
| mastodon-sfba.social-117332717783484204 | https://sfba.social/@dplattsf/117332717783484204 |
| mastodon-genomic.social-115865598274212482 | https://genomic.social/@thatdnaguy/115865598274212482 |
| mastodon-mastodon.social-110769142014694234 | https://mastodon.social/@PaddyKTaylor/110769142014694234 |
| mastodon-ecoevo.social-113635240001971348 | https://ecoevo.social/@tillmanreuter/113635240001971348 |
| mastodon-mathstodon.xyz-117331697045655539 | https://mathstodon.xyz/@Daniel_Hoffmann/117331697045655539 |
| mastodon-mathstodon.xyz-115977601390005740 | https://mathstodon.xyz/@albertcardona/115977601390005740 |
| mastodon-mastodon.social-114773280307710791 | https://bookstodon.com/@BOOKidealist/114773280194272146 |
| mastodon-mastodon.social-114703376391404539 | https://mastodon.social/@helenajambor/114703376391404539 |
| mastodon-social.tchncs.de-116137477973935585 | https://social.tchncs.de/@Lapizistik/116137477973935585 |
| mastodon-social.tchncs.de-116137477973935585-2 | https://social.tchncs.de/@Lapizistik/116137477973935585 |
| mastodon-fosstodon.org-117365167359453743 | https://fosstodon.org/@nrennie/117365167359453743 |
| mastodon-social.anoxinon.de-113362576978151533 | https://social.anoxinon.de/@RoedigerRG/113362576978151533 |
| mastodon-mastodon.social-115995169354646594 | https://mastodon.social/@FabMusacchio/115995169354646594 |
| mastodon-mastodon.au-109710020351052909 | https://mastodon.au/@ListonLab/109710020351052909 |
| mastodon-ecoevo.social-110234359746262096 | https://qoto.org/@medigoth/110234359540911172 |
| mastodon-fediscience.org-117092831216433935 | https://fediscience.org/@volephd/117092831216433935 |
| mastodon-scholar.social-99655618416874622 | https://scholar.social/@noctiluca/99655618416874622 |
| mastodon-fosstodon.org-116013906772213820 | https://fosstodon.org/@rohitfarmer/116013906772213820 |
| mastodon-biologists.social-114709090932207911 | https://biologists.social/@steveroyle/114709090932207911 |
| mastodon-biologists.social-114150012770263099 | https://biologists.social/@steveroyle/114150012770263099 |
| mastodon-ecoevo.social-114440041747939117 | https://qoto.org/@Drosmel/114440041699396307 |
| mastodon-8bitorbust.info-115315620267316809 | https://8bitorbust.info/@dtl/115315620267316809 |
| mastodon-biologists.social-114415479750505635 | https://biologists.social/@JontyTownson/114415479750505635 |
| mastodon-fediscience.org-115868153028716998 | https://fediscience.org/@johannes_lehmann/115868153028716998 |
| mastodon-mstdn.science-110033513018885906 | https://mstdn.science/@josyterbeek/110033513018885906 |
| mastodon-mstdn.science-109783546566069385 | https://mstdn.science/@AnhHLe2702/109783546566069385 |
| mastodon-genomic.social-111632643369774216 | https://genomic.social/@carondanielp/111632643369774216 |
| mastodon-mastodon.social-109816897396255021 | https://mastodon.social/@bruvellu/109816897396255021 |
