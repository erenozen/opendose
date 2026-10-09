# YouTube tutorial comments: needs digest

Venue: comments under the most-viewed YouTube tutorials on GraphPad Prism, IC50/EC50 and dose-response fitting, ELISA standard curves, qPCR ddCt, Kaplan-Meier survival, one- and two-way ANOVA, t-tests, error bars and western blot / gel densitometry in ImageJ. Raw observations: `youtube.json` (324 observations).

## 1. Coverage

**Searches (22).** Each one was run as `https://www.youtube.com/results?search_query=...` with curl and a desktop browser User-Agent, parsing `ytInitialData` for title, videoId, channel and view count. The queries were: graphpad prism tutorial; IC50 calculation graphpad prism; EC50 dose response curve prism; how to calculate IC50; dose response curve fitting; ELISA standard curve analysis; ELISA standard curve graphpad prism; qPCR delta delta Ct analysis excel; qPCR data analysis graphpad prism; kaplan meier survival curve graphpad prism; kaplan meier curve tutorial; two way ANOVA graphpad prism; one way ANOVA post hoc tukey prism; t test graphpad prism; error bars graphpad prism; western blot quantification imagej; western blot densitometry analysis; graphpad prism column graph statistics; prism grouped bar graph significance stars; MTT assay IC50 calculation; nonlinear regression graphpad prism; standard deviation vs standard error error bars. All searches returned HTTP 200. They found 295 distinct videos, which I ranked by view count. I then took the 45 most-viewed videos that actually teach data analysis (I skipped wet-lab protocol and lecture videos such as 'Western Blot explained' and 'ELISA full training').

**How comments were read.** For each video I fetched the watch page (curl, browser User-Agent). From that page I took `INNERTUBE_API_KEY`, `INNERTUBE_CONTEXT` and the comment-section continuation token, then POSTed them to `https://www.youtube.com/youtubei/v1/next?key=<page key>`, which is the same public JSON call the page itself makes. Settings:

- Up to 5 continuation pages per video in the default 'Top comments' order, so at most about 100 top-level comments.
- One reply page for up to 12 threads per video, choosing threads that look like questions, so that creator and peer answers were captured.
- 1.2 s pause between requests.

In total: 45 watch pages, about 460 `next` requests and **2,249 comments and replies read**. No request returned 403, 429 or a consent wall. Raw HTML and JSON are cached in `scratchpad/youtube/cache/` (`watch_<id>.html`, `next_<id>_*.json`).

**Verification cache (note).** The quote verifier looks up the cached text by observation URL. For each `watch?v=<id>&lc=<commentId>` URL, the build script wrote a text file into `scratchpad/cache/`. That file holds the comment texts for that video, taken verbatim from the fetched `youtubei/v1/next` JSON. It is not a separate `fetch.py` download, because the watch HTML does not contain comments. `verify.py`: **324 observations, 0 with problems.**

**Dates are approximate.** YouTube shows relative times ('6 years ago'), which I converted to YYYY-MM relative to 2026-10-09. `signal` holds `likes` and `replies` as shown in the comment toolbar and `video_views` from search results at fetch time. Replies also carry `is_reply_to`, and the video creator's own replies carry `author_is_video_creator`.

**Videos** (views at fetch time; top-level comments and replies read; observations taken):

| videoId | title | channel | views | top-level read | replies read | obs |
|---|---|---|---|---|---|---|
| A82brFpdr9g | Standard Deviation vs Standard Error, Clearly Explained!!! | StatQuest with Josh Starmer | 702,574 | 100 | 34 | 3 |
| M0Sl-3eu974 | GraphPad Prism Tutorial 1 - Introducing Table Types | protocolplace | 495,956 | 44 | 7 | 10 |
| Kkle8T7aXjk | How To Perform The Delta-Delta Ct Method (In Excel) | Steven Bradburn | 352,004 | 90 | 17 | 20 |
| fMghQw2Ry2c | EC50 and IC50 Determination in Excel | Dr. Gerard Verschuuren | 317,809 | 24 | 9 | 8 |
| Ewp5CF5ba_w | How to fit non-linear equations in excel using solver | Taylor Sparks | 315,979 | 100 | 14 | 4 |
| tgp4bbnj-ng | Real Time QPCR Data Analysis Tutorial (part 2) | americanbiotech | 304,257 | 40 | 12 | 9 |
| Tw1WVxiXHsk | Kaplan-Meier Procedure (Survival Analysis) in SPSS | Dr. Todd Grande | 274,955 | 33 | 6 | 9 |
| JlR5v-DsTds | Using ImageJ to quantify protein bands on a PAGE gel. | MCBiology | 271,643 | 36 | 16 | 7 |
| sA4lPpKyNyE | Two-way ANOVA in GraphPad Prism | Dory Video | 226,702 | 61 | 15 | 21 |
| kpGDAetOrFo | Performing a one-way ANOVA in GraphPad Prism | Dory Video | 217,560 | 63 | 14 | 14 |
| QF6fWNzAYr0 | GraphPad Prism Tutorial 2 - Making XY Graphs | protocolplace | 208,045 | 61 | 1 | 6 |
| PZRnF2a56RQ | How to plot a dose response curve and measure EC50.  Key concepts in pharmacology. | Professor G - Pharmacology | 201,204 | 15 | 8 | 6 |
| 7NgRqXSByFo | How to calculate IC50 | Dr.DanielAddoGyan | 199,065 | 96 | 14 | 24 |
| otqk4eIDMcg | A Guide to Error Bars | The DataViz Cat | 190,618 | 15 | 11 | 3 |
| ZQy7Fg3wtfs | Radical Scavenging Activity Measurement and IC50 Calculation DPPH Assay in Excel | Bio-Resource | 181,841 | 46 | 24 | 9 |
| ZJaD_6C5nkQ | Quantification of western blot using imageJ for beginners / western blot quantification / imagej / | Biology Lectures | 174,962 | 45 | 15 | 12 |
| 5IqqpKSnXfI | ELISA Tutorial 6: How to Analyze ELISA Data with GraphPad Prism | protocolplace | 172,484 | 46 | 5 | 10 |
| Ja0QMElDY6E | How To Analyze and Graph Your Data in Prism | GraphPad Software | 170,930 | 0 | 0 | 0 |
| PraEKrhJlt8 | Graphpad Prism - running a two-way ANOVA analysis | Dory Video | 168,545 | 9 | 3 | 5 |
| YKsYY6MihWU | How To Add Significance Lines In GraphPad Prism | Steven Bradburn | 153,065 | 11 | 3 | 2 |
| oAB3jNspij0 | How To Create A Volcano Plot In GraphPad Prism | Steven Bradburn | 142,058 | 45 | 15 | 8 |
| l9tO81ZCeRg | ELISA Tutorial 5: Preparing ELISA Data in Excel for Analysis with GraphPad Prism | protocolplace | 141,089 | 27 | 5 | 6 |
| 0fRoCKpDmh8 | How to calculate IC50 value | Learn Microbiology From Dr. Gaurav Kumar | 136,066 | 69 | 15 | 8 |
| jeMy_H-jSz4 | How To Make Bar Graphs In GraphPad Prism | Steven Bradburn | 126,698 | 15 | 3 | 5 |
| CD9CZjzDTEE | the best way to calculate the IC50 using graphpad prism 8 | Accro Informatique | 117,527 | 55 | 19 | 17 |
| L_XtKqJg1ug | How to do a Kaplan Meier survival analysis in GraphPad Prism | Dory Video | 115,859 | 51 | 14 | 10 |
| Uj0uDpNgc7U | qRT PCR calculation for beginners delta delta Ct method in Excel / Relative fold Change | Biology Lectures | 113,462 | 43 | 19 | 10 |
| yahM5sRTlVM | How to Analyze Real time PCR Data? / Real Time PCR Gene Expression Fold Change Calculation | Learn Innovatively with Me | 111,887 | 68 | 17 | 6 |
| PQOhSk1sQMA | Performing a t-test in GraphPad Prism | Dory Video | 106,138 | 27 | 13 | 7 |
| AEJvkrl7NsU | IC50 values by using GraphPad Prism ‪@MajidAli2020‬ | Dr. Majid Ali | 105,134 | 37 | 21 | 9 |
| sq-5rdlUrEI | ic50 determination in excel | Infinite Learning | 104,360 | 23 | 26 | 4 |
| IV_P47ScoYo | Image Lab Software: Densitometric Analysis of Gels and Western Blots | Bio-Rad Laboratories | 98,259 | 0 | 0 | 0 |
| pxRCpcRupgU | Kaplan Meier curve and hazard ratio tutorial (Kaplan Meier curve and hazard ratio made simple!) | Eric McCoy | 92,539 | 100 | 15 | 1 |
| b0Y2C9p1jAY | How to calculate delta delta Ct in Excel | Bio-Resource | 91,443 | 9 | 2 | 1 |
| tsP617goc-Q | How To Interpolate A Standard Curve In GraphPad Prism | Steven Bradburn | 85,679 | 17 | 4 | 4 |
| xfQFrQ-rfN0 | western blot analysis with imageJ | Yousuf Ali | 85,264 | 13 | 7 | 1 |
| wg5xAbS6iTQ | How to quantify gel bands in imageJ / common quantification mistake | Alicerita | 83,819 | 55 | 20 | 7 |
| ifAwro4kHiI | ELISA Analysis in Excel with 4PL | MyAssays | 83,128 | 18 | 13 | 7 |
| A5m8n2s8I3g | How to add Significance Values in Bar Graph / Graphpad Prism / Statistics Bio7 | Statistics Bio7 | 78,414 | 6 | 5 | 4 |
| 82YACeWbfpI | GraphPad Prism - Survival (Kaplan-Meier) Curves | Dory Video | 78,308 | 26 | 15 | 5 |
| sb47ABpd6T0 | One way ANOVA  #GraphPad #Prism | Learn Innovatively with Me | 78,098 | 18 | 10 | 3 |
| vyAbX_SE-M8 | How To Perform A One-Way ANOVA In GraphPad Prism | Steven Bradburn | 76,673 | 19 | 11 | 4 |
| s-K-gT4lQqo | Graphpad Prism - Performing area under the curve (AUC) calculations | Dory Video | 75,523 | 19 | 12 | 6 |
| CqKQIvEeIW8 | Example of non linear regression dose response data in GraphPad Prism | Dory Video | 71,825 | 8 | 4 | 5 |
| 69u6s0bYgN4 | How to determine Potency (EC50 value) in Prism? / Step by Step / GraphPad Prism // Dr Junaid Asghar | Dr Junaid Asghar | 57,506 | 21 | 12 | 4 |

**Unreachable / no comments:** no site blocked access. Two videos have **comments turned off**, so nothing could be read from them: GraphPad Software's own 'How To Analyze and Graph Your Data in Prism' (Ja0QMElDY6E, 171k views) and Bio-Rad's 'Image Lab Software: Densitometric Analysis…' (IV_P47ScoYo, 98k views). I did not use any descriptions, so every observation comes from a comment or a reply. One watch page (sq-5rdlUrEI) came in a different page layout (`<script id="yt-initial-data">`); after a parser fix it was read normally.

## 2. Ten most frequent tags

| tag | count |
|---|---|
| ic50-ec50-setup | 66 |
| qpcr-ddct | 44 |
| which-test | 43 |
| fit-diagnostics | 32 |
| normalization | 28 |
| western-blot-densitometry | 28 |
| standard-curve-interpolation | 26 |
| survival | 26 |
| learning-curve | 24 |
| trust-validation | 23 |

Severity: wrong result risk 125, slows the work 105, blocks the analysis 83, cosmetic / preference 11.

## 3. Twenty strongest observations

1. **youtube-ZQy7Fg3wtfs-UgwCL3CL-SUE1RhDjI14AaABAg**: Popular tutorial computes IC50 by linear regression and per concentration; viewers flag it as wrong  
   > "The DPPH assays doesnt show linear results as far as I know. Therefore you can't use linear regression to calculate the IC50. Also, it makes no sense to have an IC50 for each concentration."  
   [https://www.youtube.com/watch?v=ZQy7Fg3wtfs&lc=UgwCL3CL-SUE1RhDjI14AaABAg](https://www.youtube.com/watch?v=ZQy7Fg3wtfs&lc=UgwCL3CL-SUE1RhDjI14AaABAg) · likes 94, replies 15, video views 181,841 · *Why strong:* Most-liked problem comment in the set (94 likes, 15 replies) on a 182k-view tutorial that teaches linear-regression IC50 per concentration; the correction lives only in the comments.

2. **youtube-Kkle8T7aXjk-UgycbdNVFXKdiRZ5NDh4AaABAg**: Disagreement whether to subtract the control-group average or a matched control per experiment  
   > "Each biological replicate should be compared to itself and not the average of all the control experiments."  
   [https://www.youtube.com/watch?v=Kkle8T7aXjk&lc=UgycbdNVFXKdiRZ5NDh4AaABAg](https://www.youtube.com/watch?v=Kkle8T7aXjk&lc=UgycbdNVFXKdiRZ5NDh4AaABAg) · likes 36, replies 4, video views 352,004 · *Why strong:* 36 likes on the most-viewed ddCt tutorial (352k); paired vs pooled reference is a real wrong-result risk that spreadsheets hide.

3. **youtube-7NgRqXSByFo-UgwJCRrcxA_IxRkdOvx4AaABAg**: Prism IC50 (1.7) and Excel linear-trend IC50 (50 µg/ml) differ 30-fold  
   > "After creating the IC50 value in GraphPad it shows Log IC50=0.2247, IC50=1.678, and R2=0.9440. At the same I make IC 50 value using scatter graph with a linear trend line in XL sheet. After, using the equation (Y=8.4762x-3.7778), I got the IC 50 value at 50.44 µg/ml. I don’t know which one is correct"  
   [https://www.youtube.com/watch?v=7NgRqXSByFo&lc=UgwJCRrcxA_IxRkdOvx4AaABAg](https://www.youtube.com/watch?v=7NgRqXSByFo&lc=UgwJCRrcxA_IxRkdOvx4AaABAg) · likes 0, replies 1, video views 199,065 · *Why strong:* A 30-fold disagreement between a sigmoidal fit and an Excel linear trendline, and the user cannot tell which to trust.

4. **youtube-AEJvkrl7NsU-Ugzke5JJYCXwPBG7aBJ4AaABAg.A2PgvkdHvaiA2Ytud4rCuC**: Tutorial creator advises inventing a fourth concentration point to get a fit  
   > "Impossible, however u can virtualy take 4th conc sime where in between these three and can plot but that might effect IC50 slightly"  
   [https://www.youtube.com/watch?v=AEJvkrl7NsU&lc=Ugzke5JJYCXwPBG7aBJ4AaABAg.A2PgvkdHvaiA2Ytud4rCuC](https://www.youtube.com/watch?v=AEJvkrl7NsU&lc=Ugzke5JJYCXwPBG7aBJ4AaABAg.A2PgvkdHvaiA2Ytud4rCuC) · likes 1, replies 0, video views 105,134 · *Why strong:* The tutorial author advises inventing a concentration to get past a 'too few points' refusal; shows beginners being pushed towards fabricated data.

5. **youtube-Uj0uDpNgc7U-UgyMuiFHb6iRrUlBa8Z4AaABAg.9eAlGCTKejX9eD8pTuj_rR**: Creator tells viewer technical replicates can substitute for biological ones  
   > "If there are no biological replicates, you can also use technical replicates. and do the analysis."  
   [https://www.youtube.com/watch?v=Uj0uDpNgc7U&lc=UgyMuiFHb6iRrUlBa8Z4AaABAg.9eAlGCTKejX9eD8pTuj_rR](https://www.youtube.com/watch?v=Uj0uDpNgc7U&lc=UgyMuiFHb6iRrUlBa8Z4AaABAg.9eAlGCTKejX9eD8pTuj_rR) · likes 0, replies 0, video views 113,462 · *Why strong:* The creator of a 113k-view qPCR tutorial says technical replicates can replace biological ones; pseudo-replication taught directly.

6. **youtube-82YACeWbfpI-UggAm_V8plv3EXgCoAEC**: One-row-per-subject survival entry is impractical for large cohorts or % survival data  
   > "what if on day 5 I have 1000 survivors? Do I need to enter zero 1000 times? There must be other option. For example I have already % of survivors at certain hours post infection"  
   [https://www.youtube.com/watch?v=82YACeWbfpI&lc=UggAm_V8plv3EXgCoAEC](https://www.youtube.com/watch?v=82YACeWbfpI&lc=UggAm_V8plv3EXgCoAEC) · likes 9, replies 1, video views 78,308 · *Why strong:* One-row-per-animal survival entry does not scale to real cohorts or to data already summarised as % survival (9 likes, plus a 'same problem' reply).

7. **youtube-5IqqpKSnXfI-Ugy4Nl6EK0F5caMbqxR4AaABAg**: Interpolation returns concentrations for blank-level readings  
   > "The problem I am experiencing is that Prism would just "make up" values for the readings that were negative or 0. Even though in one run I had a zero standard given with the absorbance and concentration of zero it would calculate a concentration of 50 for another sample that had the same absorbance?!"  
   [https://www.youtube.com/watch?v=5IqqpKSnXfI&lc=Ugy4Nl6EK0F5caMbqxR4AaABAg](https://www.youtube.com/watch?v=5IqqpKSnXfI&lc=Ugy4Nl6EK0F5caMbqxR4AaABAg) · likes 0, replies 0, video views 172,484 · *Why strong:* Interpolation returns plausible-looking concentrations for blank-level readings: a silent wrong result.

8. **youtube-PZRnF2a56RQ-UgxnM_lO0diHxgEO2Th4AaABAg**: Student research group cannot afford the licence  
   > "Is graphpad prism the only software you can use to calculate EC50? I'm a student and my research group and I can't afford to buy it:("  
   [https://www.youtube.com/watch?v=PZRnF2a56RQ&lc=UgxnM_lO0diHxgEO2Th4AaABAg](https://www.youtube.com/watch?v=PZRnF2a56RQ&lc=UgxnM_lO0diHxgEO2Th4AaABAg) · likes 0, replies 2, video views 201,204 · *Why strong:* A student research group cannot afford the licence for a basic EC50; the creator's answer is to draw it by hand on paper.

9. **youtube-Kkle8T7aXjk-UgxnMTMlhU-8nJod1_94AaABAg**: Does not know how to propagate error to 2^-ddCt  
   > "How would you go about calculating the error for 2^ΔΔCт?"  
   [https://www.youtube.com/watch?v=Kkle8T7aXjk&lc=UgxnMTMlhU-8nJod1_94AaABAg](https://www.youtube.com/watch?v=Kkle8T7aXjk&lc=UgxnMTMlhU-8nJod1_94AaABAg) · likes 19, replies 0, video views 352,004 · *Why strong:* 19 likes; error propagation to 2^-ddCt is something spreadsheet users can't do on their own.

10. **youtube-CD9CZjzDTEE-Ugw7rdoW15eIWWRxFi94AaABAg**: Cannot tell which of several IC50 routes/models to use  
   > "What is the difference to calculate IC50 between this method and log(inhibitor) vs normalised response-variable slope."  
   [https://www.youtube.com/watch?v=CD9CZjzDTEE&lc=Ugw7rdoW15eIWWRxFi94AaABAg](https://www.youtube.com/watch?v=CD9CZjzDTEE&lc=Ugw7rdoW15eIWWRxFi94AaABAg) · likes 17, replies 1, video views 117,527 · *Why strong:* 17 likes; the model-choice question comes up again on 3 other IC50 videos.

11. **youtube-fMghQw2Ry2c-UgjwfU3Hf9qK-3gCoAEC**: Excel/Solver approach needs parameter guesses the user does not have  
   > "When constructing the predicted curve uses values that you already have for the parameters that you want to predict, it doesn't really help to fit a curve to data when you don't have those values, in a normal situation."  
   [https://www.youtube.com/watch?v=fMghQw2Ry2c&lc=UgjwfU3Hf9qK-3gCoAEC](https://www.youtube.com/watch?v=fMghQw2Ry2c&lc=UgjwfU3Hf9qK-3gCoAEC) · likes 18, replies 0, video views 317,809 · *Why strong:* 18 likes; spreadsheet curve fitting needs starting values the user doesn't have, which is exactly the barrier a fitting tool removes.

12. **youtube-l9tO81ZCeRg-UgylEdZYNrWwdIHeUyt4AaABAg**: Spreadsheet formula error in a popular tutorial silently changes background subtraction  
   > "I think you made a mistake calculating the background. You need to type in =average (b9:m9) but yours is =average (b9,m9) so you actually only selected two cells which made the background average very low."  
   [https://www.youtube.com/watch?v=l9tO81ZCeRg&lc=UgylEdZYNrWwdIHeUyt4AaABAg](https://www.youtube.com/watch?v=l9tO81ZCeRg&lc=UgylEdZYNrWwdIHeUyt4AaABAg) · likes 0, replies 0, video views 141,089 · *Why strong:* A typo-level spreadsheet error (comma instead of colon) in a 141k-view ELISA tutorial silently changes background subtraction.

13. **youtube-Uj0uDpNgc7U-UgwqfZb3Sva2isqd3hV4AaABAg.9oGygclN9l69oHA4EizuQI**: Independent experiments agree in trend but differ in level; unsure how to combine  
   > "Is it necessary to aggregate the data from three experiments? However, this increases the error. Because qRT-PCR is too sensitive, data from three independent experiments may be consistent in trends but vary greatly in the original data. What is the correct way to analyze the data?"  
   [https://www.youtube.com/watch?v=Uj0uDpNgc7U&lc=UgwqfZb3Sva2isqd3hV4AaABAg.9oGygclN9l69oHA4EizuQI](https://www.youtube.com/watch?v=Uj0uDpNgc7U&lc=UgwqfZb3Sva2isqd3hV4AaABAg.9oGygclN9l69oHA4EizuQI) · likes 1, replies 0, video views 113,462 · *Why strong:* Clear statement of the 'experiments agree in trend, differ in level' problem that blocked/SuperPlot-style analysis solves.

14. **youtube-sA4lPpKyNyE-Ugzn9AdljiOQl8CQJeV4AaABAg**: Needs compact letter display for post-hoc results  
   > "most researcher have used different superscript letters like a, b, c along with the data. It is written " the values with different superscript letters in a column are significantly different (p<0.05)". So what is the meaning of these letters and how these are denoted"  
   [https://www.youtube.com/watch?v=sA4lPpKyNyE&lc=Ugzn9AdljiOQl8CQJeV4AaABAg](https://www.youtube.com/watch?v=sA4lPpKyNyE&lc=Ugzn9AdljiOQl8CQJeV4AaABAg) · likes 1, replies 1, video views 226,702 · *Why strong:* Compact letter display (a/b/c) is asked for 5 times across 3 ANOVA videos; no tutorial answers it.

15. **youtube-kpGDAetOrFo-Ugx9AUjoiLzeVM7OiRV4AaABAg**: Stars drawn by hand on the graph do not match the analysis output  
   > "In the multiple comparison page, under summary, we see 4 stars for "control vs drug B" & "drug a vs drug B". Yet in the plot, you add only 1 star. Which one is the correct one?"  
   [https://www.youtube.com/watch?v=kpGDAetOrFo&lc=Ugx9AUjoiLzeVM7OiRV4AaABAg](https://www.youtube.com/watch?v=kpGDAetOrFo&lc=Ugx9AUjoiLzeVM7OiRV4AaABAg) · likes 1, replies 1, video views 217,560 · *Why strong:* Hand-drawn stars disagree with the analysis output in the tutorial itself; the same mismatch is reported on the t-test video.

16. **youtube-QF6fWNzAYr0-Ugzc1lz_nZrAFdqdzoR4AaABAg**: Instrument exports interleaved XYXY columns that are hard to plot  
   > "please make a tutrial on how to plot data in the form xyxyxyxy I cant believe how hard it is to find any information on how to plot this when 99% of spectrophotometers have data output like this"  
   [https://www.youtube.com/watch?v=QF6fWNzAYr0&lc=Ugzc1lz_nZrAFdqdzoR4AaABAg](https://www.youtube.com/watch?v=QF6fWNzAYr0&lc=Ugzc1lz_nZrAFdqdzoR4AaABAg) · likes 0, replies 0, video views 208,045 · *Why strong:* Instrument export format (interleaved XYXY) blocks plotting; a concrete import need.

17. **youtube-CqKQIvEeIW8-Ugy8ZchcWw_dc65XUsB4AaABAg**: Confuses potency (EC50) with efficacy (Emax) when comparing compounds  
   > "The EC50s indicate D4 to be the most potent (lowest EC50), however the data shows that D1 is able to increase gene expression at each concentration more than D4 ... How can D4 be more potent when it is unable to achieve the same level of gene expression - at any concentration - as D1?"  
   [https://www.youtube.com/watch?v=CqKQIvEeIW8&lc=Ugy8ZchcWw_dc65XUsB4AaABAg](https://www.youtube.com/watch?v=CqKQIvEeIW8&lc=Ugy8ZchcWw_dc65XUsB4AaABAg) · likes 1, replies 0, video views 71,825 · *Why strong:* Potency vs efficacy confusion when ranking 5 compounds; the tool reports EC50 alone without Emax context.

18. **youtube-7NgRqXSByFo-Ugwc131DD7tXEe9EFpZ4AaABAg**: Conflicting guidance on log transform and units cost a student marks  
   > "I used your video method for a university coursework, but got a really bad grade saying that I should not log values when calculating IC50, and even if I do, log value should have nM units next to it."  
   [https://www.youtube.com/watch?v=7NgRqXSByFo&lc=Ugwc131DD7tXEe9EFpZ4AaABAg](https://www.youtube.com/watch?v=7NgRqXSByFo&lc=Ugwc131DD7tXEe9EFpZ4AaABAg) · likes 0, replies 2, video views 199,065 · *Why strong:* Following a popular tutorial cost a student marks; conflicting guidance on log concentration and units.

19. **youtube-tsP617goc-Q-UgwSe7xKcmb7QE1OJMR4AaABAg**: Back-calculated standards differ from nominal and user concludes the tool is inaccurate  
   > "IT IS NOT ACCURATE, TRY PUT THE SAME ABSORBANCE OF THE  S1 OR S2 AS UNKNOWN. YOU WILL SEE DIFFERENT CONCENTRATION."  
   [https://www.youtube.com/watch?v=tsP617goc-Q&lc=UgwSe7xKcmb7QE1OJMR4AaABAg](https://www.youtube.com/watch?v=tsP617goc-Q&lc=UgwSe7xKcmb7QE1OJMR4AaABAg) · likes 0, replies 1, video views 85,679 · *Why strong:* A user decides the software is 'NOT ACCURATE' because back-calculated standards are not exact; the tool should show %recovery to set expectations.

20. **youtube-JlR5v-DsTds-Ugjv_QPaBPGijngCoAEC**: ImageJ gel-lane tool jumps back to the first lane; must restart (many replies report the same)  
   > "Each time then go to "select next lane", the selection automatically moves back to the first region, labelled with two. I can then not remove both overlapping selections, without staring again."  
   [https://www.youtube.com/watch?v=JlR5v-DsTds&lc=Ugjv_QPaBPGijngCoAEC](https://www.youtube.com/watch?v=JlR5v-DsTds&lc=Ugjv_QPaBPGijngCoAEC) · likes 10, replies 7, video views 271,643 · *Why strong:* 10 likes and 7 replies all reporting the same ImageJ gel-lane bug with no reliable fix.

## 4. Surprises and notable patterns

- **The tutorials are often wrong, and the corrections sit in the comments.** The DPPH IC50 tutorial (182k views) fits a linear regression and reports an IC50 per concentration. The two linear-trendline IC50 videos (136k and 104k views) also teach linear back-calculation. Viewers keep posting corrections, sometimes with dozens of likes, and new learners keep asking which version is right.
- **Creators' replies give risky advice.** Examples: inventing a 4th concentration point to get past a "too few points" refusal; "you can also use technical replicates" in place of biological ones; "use any one of the three values" from the control as the qPCR reference; "multiple stars are not relevant". A tool that explains its own choices would replace this informal help desk.
- **Excel is the main competitor for IC50 work, not another statistics package.** Many viewers use Solver, linear trendlines or 4PL add-ins. They then find 30-fold disagreements with Prism (412 vs 12.79 ppm; 50.44 vs 1.678 µg/ml), negative IC50s, and IC50s beyond the highest dose, and cannot tell which number to trust.
- **Zero dose and log concentration confuse people constantly.** Users ask about substituting 0 with 1, 0.1 or 0.001, read negative log values as errors, and ask whether to add a (0,0) point. This is the single most frequent IC50 confusion.
- **qPCR ddCt has several sticking points that keep coming back.** The control mean not coming out as 1 (asked at least 3 times), which reference to use (control mean, calibrator, smallest control replicate, paired), what to do with two reference genes, which scale to test on and put error bars on, undetermined Ct, and which direction a fold change goes.
- **Compact letter display (a/b/c) is wanted repeatedly.** It was asked 5 times across 3 ANOVA videos and never answered. Automatic significance brackets were also requested at least 5 times.
- **Licensing and version lock-in show up a lot.** Broken trial links, "cannot use free trial", "can't afford it" (student), a request for an activation key, a country where the site is blocked (Kazakhstan), a paid serial for an Excel 4PL add-in, and older licensed versions (Prism 5/6/8) missing features shown in tutorials (interpolation, narrative results, one-way ANOVA options, hazard ratio).
- **Survival data entry is the main survival barrier.** One row per subject cannot hold 1000 survivors, 70 insects with daily death counts, or % survival. Viewers also asked for a numbers-at-risk table, pairwise log-rank tests, and help with replicate cohorts.
- **Densitometry users struggle with the image, not the statistics.** Lane-selection bugs, 8-bit/JPEG/RGB images, saturated bands, contrast adjustments that erase faint bands, uneven background, and arbitrary units, followed by "how do I get from areas to a graph and a test".
- **Several languages appear.** Comments came in Arabic, Portuguese, Japanese, Spanish, French and Hindi/Urdu. Several English comments also mention following tutorials in a second language.
- **The companies' own videos have comments turned off** (GraphPad, Bio-Rad), so these community videos are where questions about their software end up.

## 5. Gaps

- About 100 top-level comments at most per video, in 'Top' order. On videos with thousands of comments (StatQuest, the Solver video), most remain unread. Those two are mostly praise anyway.
- Replies were fetched for up to 12 threads per video, chosen by question words. Some reply threads with answers were not expanded.
- Search results came from one region (the page context reported `gl=TR`) and are a snapshot. Channel-level listings were not used, so some high-view videos may have been missed.
- Not covered by this video set: flow cytometry, synergy (only one comment), power and sample size, PCA, Bland-Altman, export/DPI for journals, and multipanel layouts. Searches aimed at those topics would be needed.
- Dates are approximate (converted from relative times). Like counts are as displayed; small values are exact, while large ones may be rounded by YouTube.
