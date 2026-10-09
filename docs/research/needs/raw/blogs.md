# Needs catalogue: lab blogs and personal posts (venue `blogs`)

171 observations from 71 posts on 40 sites. Every quote was checked against the cached page text with `verify.py`, which reported 0 problems.

Two research runs worked on this venue at the same time: run A (`scratchpad/work-blogs/`) and run B (`scratchpad/work-blogs-b/`). Their results were merged by source. Where both runs covered the same post, the run with more observations from it was kept, and observations quoting the same text were dropped from run B. The merge script is `work-blogs-b/merge_final.py` and can be re-run safely.

## Coverage

**Searched (WebSearch, then fetched with fetch.py):** switching from Prism to R; why I still use Prism; Prism tips; PhD student statistics struggles; biologists learning R; superplots tutorial; PlotsOfData; ELISA 4PL in Excel; qPCR analysis in Excel; error bars (SD vs SEM); quantifying western blots in ImageJ; flow cytometry statistics; figure workflows with Illustrator and Prism; dose-response/IC50 blogs; Data/Software Carpentry learner stories; Gelman, Derek Lowe, Medium, Substack, ASCB, eLife Labs, Physiological Society, Biochemical Society and PLOS blogs; Retraction Watch; FocalPlane; preLights; the Node; Simply Statistics; Scientifically Sound; Occam's Typewriter.

**Pages that yielded observations, per site** (posts / observations):

- quantixed.org: 8 / 23
- thenode.biologists.com: 8 / 18
- wildtypeone.substack.com: 4 / 17
- retractionwatch.com: 4 / 8
- scientificallysound.org: 3 / 7
- expertcytometry.com: 3 / 7
- nature.com: 3 / 6
- prelights.biologists.com: 3 / 6
- myphdiary.substack.com: 2 / 6
- blog.mozilla.org: 1 / 6
- blog.addgene.org: 2 / 5
- r-bloggers.com: 1 / 4
- plantae.org: 1 / 4
- cloud.wikis.utexas.edu: 1 / 4
- blogs.nature.com: 1 / 4
- blog.everydayscientist.com: 1 / 3
- editage.com: 1 / 3
- nc3rs.org.uk: 1 / 3
- ctl.duke.edu: 1 / 3
- rsg-spain.iscbsc.org: 1 / 3
- babraham.ac.uk: 1 / 2
- bmedia.nl: 1 / 2
- nature.com/scitable: 1 / 2
- lsl.sinica.edu.tw: 1 / 2
- occamstypewriter.org: 1 / 2
- sardanalab.vet.cornell.edu: 1 / 2
- becker.wustl.edu: 2 / 2
- ascb.org: 1 / 2
- heareresearch.blogspot.com: 1 / 2
- thebiochemistblog.com: 1 / 2
- carpentries.org: 1 / 2
- hab.sites.er.kcl.ac.uk: 1 / 1
- simplystatistics.org: 1 / 1
- focalplane.biologists.com: 1 / 1
- expert.cheekyscientist.com: 1 / 1
- research.a-star.edu.sg: 1 / 1
- researcherblogs.ki.se: 1 / 1
- onishlab.colostate.edu: 1 / 1
- openwetware.org: 1 / 1
- wp.unil.ch: 1 / 1

**Read but gave no usable observation (run B):** ecrcommunity.plos.org (about switching labs, not about data); focalplane.biologists.com ?p=21356 and ?p=11038 (index and anniversary pages); third-bit.com biological-computing user stories (invented personas, not real users, so left out); towardsdatascience.com dose-response tutorial (no pain stated); news.cuanschutz.edu (a consulting-service announcement); quantixed.org tag pages; thenode.biologists.com tag pages; metricgate.com pricing (a vendor blog). Run A also read pages on becker.wustl.edu, onishlab.colostate.edu, researcherblogs.ki.se and other sites, listed in `work-blogs/fetchlog.tsv`.

**Blocked or unreachable (not worked around):** bitesizebio.com: HTTP 403 on every article tried (qPCR ddCt, western blot quantification, error bars). medium.com: 403. science.org (Derek Lowe's *In the Pipeline* and *Working Life*): 403. statmodeling.stat.columbia.edu (Gelman): 403. newsnetwork.mayoclinic.org: 403. qubeshub.org: 403. Not found (404): mcdussault.netlify.com, brieflybio.substack.com, thebiologist.rsb.org.uk, quantixed.org/2016/06/20 (the right URL was then found and fetched). spark.mcmaster.ca failed to extract.

## Ten most frequent tags

- learning-curve: 39
- reproducibility-audit: 20
- excel-paste: 17
- graph-formatting: 15
- show-the-points: 15
- teaching: 13
- which-test: 13
- error-bars-sd-sem: 13
- technical-vs-biological-replicates: 12
- trust-validation: 12

Severity: slows the work 80, wrong result risk 62, blocks the analysis 15, cosmetic / preference 14.

Software named most often: R (38), GraphPad Prism (26), Excel (25), ggplot2 (10), Python (9), IgorPro (9), Adobe Illustrator (6), Fiji (4), PlotsOfData (3), DABEST (3).

## Twenty strongest observations

1. **blog-rsgspain-pandas-1** (rsg-spain.iscbsc.org, 2021-05; PhD student / bioinformatics technician, cancer genetics lab (CNIO; stated); *blocks the analysis*)  
   > Some labmates used to apply a vertical look up ... search with Excel but these large files required a lot of RAM memory and they would freeze their monitors or end up crashing their computers. In addition, they would apply this operation manually as many times as the number of samples to merge.  
   Need: Join/merge tables by an ID column at scale without manual per-sample repetition. <https://www.rsg-spain.iscbsc.org/a-pandas-mini-course-at-cnio/>
2. **blog-carpentries-nederbragt-2** (carpentries.org, 2013-09; biologist, self-taught bioinformatician (Lex Nederbragt, Univ. Oslo; stated); *wrong result risk*)  
   > No more copy-and-paste a few lines of code, change a few small things, run again and discovering (or not...) that I forgot to change one of the '1's into a '2'.  
   Need: Re-run the same analysis on new inputs without manual edits (templates/batch). <https://carpentries.org/blog/2013/09/lex-nederbragt/>
3. **blog-quantixed-stattests-1** (quantixed.org, 2021-07; commenter (Ioanna, cell viability researcher); *blocks the analysis*)  
   > Are my data from the same day of experiment paired, regarding that they are from the same cell passage? There are many opinions on this issue.  
   Need: A test chooser that asks how replicates were generated (same passage/day) and explains pairing/blocking consequences. <https://quantixed.org/2016/07/19/the-digital-cell-statistical-tests/>
4. **blog-thenode-tidy2-1** (thenode.biologists.com, 2020-09; researcher, cell biology / dataviz (Joachim Goedhart); *blocks the analysis*)  
   > The tidy data structure is different from the popular spreadsheet format and (in my experience) not intuitive to grasp. Therefore, the conversion of ordinary, spreadsheet data into this structure may present a considerable bottleneck for creating superplots.  
   Need: Accept wide spreadsheets (condition and replicate as header rows) and convert to long format automatically. <https://thenode.biologists.com/converting-excellent-spreadsheets-part2/research/>
5. **blog-wildtypeone-prism-goodbye-1** (wildtypeone.substack.com, 2025-05; lab newsletter author (Wildtype One); *wrong result risk*)  
   > In Prism, it's easy to: Drag the wrong data into a chart ... Forget which condition was which ... Copy-paste the wrong result into your figure  
   Need: Keep data, statistics and figure linked so a figure is always regenerated from the source table, with an audit trail of every change. <https://wildtypeone.substack.com/p/are-we-kissing-graphpad-prism-goodbye>
6. **blog-retractionwatch-paste-1** (retractionwatch.com, 2024-03; PI, biomedical (quoted in Retraction Watch); *wrong result risk*)  
   > I analyzed these data and inaccurately pasted the data into the analysis software, leading to an incorrect grouping of the data.  
   Need: Show group membership and n per group clearly after paste/import and keep a link to the raw data file. <https://retractionwatch.com/2024/03/08/how-a-sleuths-email-turned-a-correction-into-a-retraction>
7. **blog-retractionwatch-trustwb-3** (retractionwatch.com, 2013-07; commenter; *wrong result risk*)  
   > All his Western blot bands were saturated and when the post-doc was challenged it was quite clear he had no idea about basic densitometry.  
   Need: Built-in densitometry checks and explanations (saturation, background, linear range). <https://retractionwatch.com/2012/04/03/can-we-trust-western-blots/>
8. **blog-quantixed-volcano-2** (quantixed.org, 2026-07; PI, cell biology (Stephen Royle, blog author); *blocks the analysis*)  
   > R is the main language we use in the lab these days and because IGOR is closed source and is no longer developed for mac, I am ported VolcanoPlot to R.  
   Need: Cross-platform, open tool so lab pipelines are not stranded by vendor platform decisions. <https://quantixed.org/2026/07/15/eruption-announcing-new-r-package-volcanoplotr/>
9. **blog-thenode-ggplottime-1** (thenode.biologists.com, 2018-05; assistant professor, molecular cytology (Joachim Goedhart); *blocks the analysis*)  
   > Some time ago, my favorite (commercial) software package for making graphs was no longer supported due to a system upgrade. So I was looking for a powerful and flexible alternative for data visualization.  
   Need: Platform-independent tool (e.g. browser-based) whose files keep opening after OS upgrades. <https://thenode.biologists.com/visualizing-data-with-r-ggplot2/education/>
10. **blog-biochemist-genomics-1** (thebiochemistblog.com, 2020-09; PhD student, epigenetics (Natalia Benetti; stated); *blocks the analysis*)  
   > I had no experience in coding prior to my PhD and found that this was a huge hurdle to overcome because there is a threshold level of coding knowledge required to be able to even start looking at your data.  
   Need: Point-and-click visualisation and statistics for sequencing-derived tables. <https://thebiochemistblog.com/2020/09/14/learning-genomic-data-analysis-as-a-wet-lab-biologist/>
11. **blog-prelights-tidyplots-1** (prelights.biologists.com, 2025; ECR preLights reviewers (life scientists); *wrong result risk*)  
   > Additionally, many scientists are not able to afford commercial licenses for more mainstream programs that take care of data analysis and visualization, which can sometimes lead to inadequate data assessing and analysis.  
   Need: Free tool with the standard analyses and graph types so cost does not degrade analysis quality. <https://prelights.biologists.com/highlights/tidyplots-empowers-life-scientists-with-easy-code-based-data-visualization/>
12. **blog-dukectl-rviz-1** (ctl.duke.edu, 2020-08; biology course instructors, Duke (blog authors); *wrong result risk*)  
   > One of the main issues with excel is that students can click random buttons to produce error bars or regression lines without understanding their meaning or knowing whether they are actually correct.  
   Need: Error bars and fits that state what they represent and are computed from the data shown. <https://ctl.duke.edu/blog/2020/08/teaching-students-to-visualize-data-with-r/>
13. **blog-quantixed-igor-2** (quantixed.org, 2016-07; PI, cell biology (Stephen Royle, blog author); *wrong result risk*)  
   > Not good for biological data – Transcription factor Oct4 gets converted to a date.  
   Need: Never auto-convert text identifiers on paste/import. <https://quantixed.org/2016/07/07/the-digital-cell-getting-started-with-igorpro/>
14. **blog-kclhab-prismtor-1** (hab.sites.er.kcl.ac.uk, n.d.; institutional analysis hub (King's College London HAB) news post; *blocks the analysis*)  
   > Following the recent announcement that GraphPad Prism will now require subscriptions, the HAB will be offering a new series of hands-on workshops for non-coders.  
   Need: Free tool that covers the everyday Prism analyses (t-tests, ANOVA, regression, mixed models, graphs) without retraining in code. <https://hab.sites.er.kcl.ac.uk/?p=2312>
15. **blog-wildtypeone-testguide-3** (wildtypeone.substack.com, 2025-04; lab newsletter author (Wildtype One); *wrong result risk*)  
   > Note: By default, Prism's Dunn can be without correction (which is anticonservative) or you can apply Bonferroni to the Dunn p-values.  
   Need: Corrected post-hoc by default with an explicit warning when uncorrected. <https://wildtypeone.substack.com/p/the-biology-researchers-guide-to>
16. **blog-mozilla-datacarp-3** (blog.mozilla.org, 2014-05; workshop learner (grad student/postdoc/faculty, biology; quoted); *slows the work*)  
   > I'm re-entering data over and over again by hand and know there's a better way.  
   Need: Import once from instrument/spreadsheet files and reuse. <https://blog.mozilla.org/foundation-archive/mozilla-science/our-first-data-carpentry-workshop/>
17. **blog-expertcyto-5steps-1** (expertcytometry.com, n.d.; flow cytometry core manager / trainer (Tim Bushnell, PhD; stated); *blocks the analysis*)  
   > When it comes up, many researchers freeze not knowing how to proceed, and they muddle through as best they can.  
   Need: Plan the analysis (hypothesis, alpha, power) at experiment design time and carry it into the analysis. <https://expertcytometry.com/?p=4457>
18. **blog-scisound-poorstats-4** (scientificallysound.org, 2016-10; neuroscience researcher (Martin Heroux, blog author); *wrong result risk*)  
   > In their response to my comments, the authors explained they changed the SEM to SD in text, but kept the SEM in figures because this was the convention for the Journal of Neurophysiology!  
   Need: Keep error-bar type consistent between figure and text and explain the choice. <https://scientificallysound.org/2016/10/24/poor-statistical-practices/>
19. **blog-wildtypeone-truths-2** (wildtypeone.substack.com, 2026-06; lab newsletter author (Wildtype One); *wrong result risk*)  
   > If condition A was processed Monday and condition B was processed Thursday, you may not have a treatment effect. You may have a calendar effect. Batch is not always noise. Sometimes batch is the experiment.  
   Need: Record processing batch/day as a factor and warn when it is confounded with treatment. <https://wildtypeone.substack.com/p/hard-biology-bench-truths-that-take>
20. **blog-quantixed-igor-3** (quantixed.org, 2016-07; PI, cell biology (Stephen Royle, blog author); *blocks the analysis*)  
   > Imagine that your data are sampled at different intervals. How would you do that? Dealing with those simple cases in Excel is difficult-to-impossible.  
   Need: Baseline subtraction, scaling and averaging of XY traces with unequal X values. <https://quantixed.org/2016/07/07/the-digital-cell-getting-started-with-igorpro/>

## Surprising

- **Platforms that went away stranded lab pipelines.** One cell biology lab rewrote its proteomics volcano-plot tool because IGOR "is no longer developed for mac" (quantixed.org, 2026). Goedhart moved to R after his commercial graphing package stopped working when the operating system was upgraded (thenode, 2018). A KCL training hub started Prism-to-R courses "following the recent announcement that GraphPad Prism will now require subscriptions". Licensing and platform risk drive people to switch tools as much as features do.
- **Admin rights block installation.** At CNIO, people had to install Python without admin rights because "Admin privileges are reserved to the IT department". Analysis that needs no install (for example, in the browser) removes a real barrier.
- **Spreadsheets fail silently at scale.** VLOOKUP merges of about 500,000 rows froze or crashed lab computers and had to be repeated by hand for each sample. Gene names turning into dates (Oct4) comes up in several posts.
- **The commonest statistics complaints concern the experimental unit, not test theory.** Cells counted as n, technical replicates plotted as biological ones, treatment confounded with processing day, SEM chosen because it looks tighter. Bloggers want the tool to make the replicate structure explicit.
- **Even fluent coders find the long (tidy) data format hard.** Joachim Goedhart, who now teaches R to biologists, wrote that he is "still not confident that I fully understand it". Converting wide spreadsheets to long format is described as "a considerable bottleneck" for making SuperPlots.
- **One post claims Prism's Dunn post-hoc test can run uncorrected by default** (Wildtype One). This is a single source and has not been checked against the software.

## Proposed new tags

None. Every tag used is in TAGS.md.


## Gaps

- **Blocked sites.** Bitesize Bio, Medium, science.org (In the Pipeline comments on IC50s, and Working Life) and Gelman's blog all returned 403 and were not worked around. These were expected to be the richest sources of first-person comment threads, especially the Bitesize Bio qPCR ddCt comment sections. As a result, novice voices on qPCR and IC50 are under-represented.
- **Thin topics.** There is little first-person blog material on ELISA 4PL standard curves, IC50 fitting, survival analysis, two-way / repeated-measures ANOVA and mixed models. Searches mostly surfaced vendor or SEO blogs, which were excluded.
- **No usable posts** from eLife Labs, ecrLife, PLOS blogs, the British Pharmacological Society or the Physiological Society blogs were found through search.
- **Authorship bias.** Many observations come from expert or educator bloggers (Goedhart, Royle, Heroux, Lord) rather than struggling novices. Comment threads supply most of the novice voice: quantixed, Scientifically Sound, Retraction Watch, the Node and Occam's Typewriter.
- **Dedupe.** The merge removed run A observations where run B had more observations from the same post. Five run A quotes are not in the final file: quantixed stattests-1 and -4, thenode tidy1-1, addgene qpcr-1 and -2. Run A's full set stays in `scratchpad/work-blogs/obs.py`.
