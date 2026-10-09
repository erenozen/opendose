# Review sites: needs digest (output `reviews`)

188 observations from first-person reviews of GraphPad Prism and the tools bench scientists use alongside it or instead of it. Collected 2026-10-09. Every quote is verbatim from a page that was read. SelectScience, App Store, SoftwareSuggest and PeerSpot quotes were taken from the raw HTML or embedded JSON and checked as exact substrings by script. AlternativeTo, SourceForge and Product Hunt return 403 to curl, so they were read through WebFetch with a request for verbatim text, and spot-checked with a second verbatim request.

## Coverage

| Site | Status (2026-10-09) | What was read | Reviews read | Observations |
|---|---|---|---|---|
| selectscience.net | Reachable (curl, 200). Reviews sit in the Next.js flight JSON (`"reviews":[...]`) | Product sitemap (34,223 products) filtered to 254 software pages, plus 12 extra candidates, plus all 140 products in the 'data analysis software' technique listing (6 pages). 368 product pages in all; 98 had reviews (668 reviews). GraphPad has only one product page on the site (Prism 6, 3 reviews); the company page lists no other Prism version. SigmaPlot 12 has 2 reviews. OriginPro, JMP, Minitab, SPSS, Stata, BioRender, Systat 13, Statistica, TableCurve, MARS and Prism3 have no review text (0 reviews, or not listed) | 496 read: all 174 reviews of data-analysis, plate-reader, blot, flow, qPCR, ephys and stats software (Gen5 83, Empiria 23, pCLAMP 15, MATLAB 11, NIS-Elements 11 and others), 60 more from the technique listing (HALO 31, EthoVision, ANY-maze, Spike2, Logger Pro, GeneSpring and others), and the 262 Incucyte reviews, keyword-screened, with about 65 software or analysis comments read in full. Mass-spec, chromatography and sequence tools were skipped as off-scope | 109 |
| apps.apple.com | Reachable with a Safari UA and `--compressed`. Intermittent 429 rate-limits: Karo Graph, ScholarPlot and ChartStudio never loaded. The iTunes RSS review feed came back empty for the Mac app | 15 app pages read. Each page shows only about 4 reviews: DataGraph, Plot2, Plot2 Pro, Wizard, Wizard Pro, pro Fit 7, FitPlot, AcaStat, Graph, Vernier Graphical Analysis, Vernier Graphical Analysis GW, Lab.Hacks, Statistics Calculator++, Art of Stat, Fast Chart. StatPlus, StatDataViewer and Stats tester mini showed no reviews | about 50 | 31 |
| alternativeto.net | curl 403. WebFetch returned content | About pages: GraphPad Prism (1 review), OriginPro/originlab (2), SigmaPlot (0), JASP (1, off-topic), jamovi (2), BioRender (0), LabPlot (3), Veusz (3), QtiPlot (2), SciDAVis (2), DataGraph (0), KaleidaGraph (0). Alternatives-page comments: GraphPad Prism (2), OriginPro (11), SigmaPlot (2), SPSS (9), JASP, BioRender and Veusz (0) | 41 | 30 |
| sourceforge.net | curl 403. WebFetch returned content. Note that WebFetch shortens long reviews with '...', so only contiguous sentences were quoted | Project reviews: SciDAVis (page 1, 25 of 41), QtiPlot (9), LabPlot (4), SOFA Statistics (19, all praise, none used), fityk (1), gnuplot (problem reviews only, 4 of 67). The software directory pages for OriginPro and SigmaPlot show 0 reviews. JMP and Veusz pages return 404 | 62 | 9 |
| softwaresuggest.com | Reachable | GraphPad Prism (1 review), SPSS (1), Minitab (6, quality-engineering audience, not used). No pages for Origin, SigmaPlot, JMP, Stata, BioRender, JASP, jamovi, FlowJo or Benchling | 1 used | 3 |
| peerspot.com | Reachable, but `/products/graphpad-prism-reviews` redirects to `/products` (Prism is not listed). JMP, Origin, OriginPro, Stata and SigmaPlot are not listed either. Minitab is listed with 0 reviews. SPSS has 41 reviews, mostly market research | 3 featured SPSS reviews on the product page | 3 | 3 |
| producthunt.com | curl 403. WebFetch returned content | BioRender (0 reviews), Autoplot (6 launch comments, most of them questions to the maker). Search found no Plotivy, PlotNerd, BarelySig or BioRender Graph pages | 6 | 3 |
| selecthub.com | Reachable | GraphPad Prism page: the '202 reviews' are an aggregate pulled from other sites, with analyst-written pros and cons. No first-person reviews, so nothing was quoted | 0 | 0 |
| capterra.com (+ .co.uk/.com.au/.ca/.in/.co.nz/.ie) | **Blocked**: 403 (rechecked once for product 119786) | none | 0 | 0 |
| g2.com, trustradius.com, getapp.com, softwareadvice.com, saasworthy.com | **Blocked**: 403 (rechecked once each) | none | 0 | 0 |
| gartner.com peer insights, trustpilot.com, slashdot.org, crozdesk, biocompare | **Blocked**: 403, as tested by the coordinator on 2026-10-09. Not re-spent | none | 0 | 0 |
| slant.co | **Unreachable**: curl 526, WebFetch 403 | none | 0 | 0 |
| softpedia.com | **Blocked**: 403 | none | 0 | 0 |
| softonic.com | **Unreachable**: 412 | none | 0 | 0 |
| uptodown, financesonline, techradar | 404, no Prism review page | none | 0 | 0 |
| apps.microsoft.com | Reachable, but reviews load client-side and none were in the HTML | none | 0 | 0 |

Search-engine snippets were not used as reviews. No archive, cache or proxy was used.

## Ten most frequent tags

- `learning-curve`: 32
- `price-licence`: 23
- `graph-formatting`: 22
- `tutorials`: 15
- `plate-reader`: 13
- `import-instrument-files`: 12
- `crashes`: 12
- `scripting-batch`: 12
- `file-compatibility`: 10
- `western-blot-densitometry`: 10

## Twenty strongest observations

1. **reviews-ss-44462-1** (selectscience.net, Empiria Studio, blocks the analysis): "If you want to analyze your protein of interest relative to a housekeeping protein or pan-target for post translational modification, you MUST image BOTH the housekeeping protein/pan target AND your protein of interest in the SAME SCAN."<br>Need: Normalisation that supports valid designs such as separate scans for target and loading control. https://www.selectscience.net/product/empiria-studio-software
2. **reviews-ss-32661-1** (selectscience.net, Empiria Studio, blocks the analysis): "With the software you cannot calculate replicates, only triplicates. This is one disadvantage."<br>Need: Any number of replicates. https://www.selectscience.net/product/empiria-studio-software
3. **reviews-at-018** (alternativeto.net, Veusz, LabPlot, Origin, blocks the analysis): "It does curve fits BUT it apparently will not supply uncertainties in the fit parameters, and without that, it is scientifically useless."<br>Need: Standard errors/CIs on every fitted parameter. https://alternativeto.net/software/veusz/about/
4. **reviews-at-022** (alternativeto.net, QtiPlot, OpenOffice, wrong result risk): "When importing from OpenOffice, it modifies zero values to empty field."<br>Need: Import that preserves zeros versus blanks. https://alternativeto.net/software/qtiplot/about/
5. **reviews-ss-15699-1** (selectscience.net, Magellan, Tecan Sunrise, blocks the analysis): "Our Tecan sunrise reader is lying idle because of a permanent licence problem in the computer, we updated the computer and afterwards was unable to reinstall the magellan CD."<br>Need: Licences that survive computer replacement. https://www.selectscience.net/product/magellan-tm-data-analysis-software
6. **reviews-ss-16493-1** (selectscience.net, Gen5, blocks the analysis): "Customer service was not helpful when we had questions about programming protocols, and the existing parallelism protocols."<br>Need: Built-in parallelism (curve-comparison) analysis with guidance. https://www.selectscience.net/product/agilent-biotek-gen5-software-for-detection
7. **reviews-ss-29513-2** (selectscience.net, iQue ForeCyt, wrong result risk): "the software will highlight samples that are outside the linear range of the standard curve with red text, but this formatting is lost upon export to csv."<br>Need: Carry out-of-range flags into exported data. https://www.selectscience.net/product/ique-forecyt-less-than-sup-greater-than-r-less-than-sup-greater-than-software
8. **reviews-ss-13264-1** (selectscience.net, GeneSpring GX, wrong result risk): "The technical support is good but again we still don't really know how it is performing all calculations.  There is limited flexibility to change analysis options."<br>Need: Transparent calculations and adjustable options. https://www.selectscience.net/product/genespring-gx
9. **reviews-ss-42741-1** (selectscience.net, Incucyte, slows the work): "Very effective but bottlenecks analysis. Difficult to analyze across groups. Graphing software needs to be better."<br>Need: Group-level analysis and better graphing of exported kinetic data. https://www.selectscience.net/product/incucyte-r-live-cell-analysis-systems
10. **reviews-ss-26885-1** (selectscience.net, Incucyte, Excel, slows the work): "It offers some basic statistic tools and allows to make good looking figures for presentations, for any more detailed analysis it is best to copy the data to a spreadsheet program like excel."<br>Need: A downstream tool that takes Incucyte exports for proper statistics. https://www.selectscience.net/product/incucyte-r-live-cell-analysis-systems
11. **reviews-ss-16556-1** (selectscience.net, Gen5, Excel, KC4, slows the work): "Don’t even start about data analysis once you get them out. I always have to go back to trusty old excel."<br>Need: Analysis that works directly on exported plate-reader data without detouring through Excel. https://www.selectscience.net/product/agilent-biotek-gen5-software-for-detection
12. **reviews-ss-17254-1** (selectscience.net, MILLIPLEX Analyst 5.1, Luminex xPONENT, Excel, slows the work): "The only thing I don't like about it is that the Excel export file is designed to look nice, but can be cumbersome to select the actual data for our genetic analysis."<br>Need: Tidy machine-readable export alongside the pretty report. https://www.selectscience.net/product/milliplex-r-analyst-5-1-software
13. **reviews-sf-001** (sourceforge.net, SciDAVis, blocks the analysis): "I fail to remember the number of headaches that this software has caused me, the heap of hours wasted on corrupted project files, the amount of pain that I have been through."<br>Need: Project files that never corrupt; autosave/recovery. https://sourceforge.net/projects/scidavis/reviews/
14. **reviews-at-004** (alternativeto.net, GraphPad Prism, SigmaPlot, blocks the analysis): "There is no option to write your own equations and fit a curve to that in Prism, although it's great for general graph plotting."<br>Need: Fitting user-defined equations. https://alternativeto.net/software/sigmaplot/
15. **reviews-ss-16544-2** (selectscience.net, Gen5 2.0, Gen5 1.10, blocks the analysis): "I have not managed to have compatibility between a protocol created by Gen5 2.0 when I install it on another computer that has the Gen5 1.10."<br>Need: Files/protocols that open across versions and computers. https://www.selectscience.net/product/agilent-biotek-gen5-software-for-detection
16. **reviews-ss-36930-1** (selectscience.net, Incucyte, Windows, Mac, blocks the analysis): "The only drawback is the IncuCyte Analysis software is only Windows and not Mac compatible. Hopefully, this will change so I can access and analyze data from home."<br>Need: Cross-platform analysis accessible from home. https://www.selectscience.net/product/incucyte-r-live-cell-analysis-systems
17. **reviews-as-027** (apps.apple.com, Lab.Hacks, wrong result risk): "I absolutely HATE doing calculations on the fly, and almost always ruin whatever experiment/assay I’m doing because of it."<br>Need: Reliable bench calculators for dilutions/recipes. https://apps.apple.com/us/app/id1462593060
18. **reviews-as-016** (apps.apple.com, Wizard, wrong result risk): "In the Model view, I have been searching for the model variance and/or standard deviation, but I cannot find it."<br>Need: Report MSE/residual SD with every model. https://apps.apple.com/us/app/id495152161
19. **reviews-ph-001** (producthunt.com, Autoplot, Python, wrong result risk): "The reproducible-Python export is the right call, because with AI-written analysis the plot that renders cleanly is the one you stop checking."<br>Need: Reproducible exported code and visible assumptions behind each figure. https://www.producthunt.com/products/autoplot
20. **reviews-ss-16516-2** (selectscience.net, Gen5, blocks the analysis): "Moreover, I have freshman students in an inquiry-based lab also using the plate reader, and in the limited time they have to learn the software, Gen 5 is very far beyond their ability to comprehend."<br>Need: A mode simple enough for students to learn after one demonstration. https://www.selectscience.net/product/agilent-biotek-gen5-software-for-detection

## Surprising or notable

- **Plate-reader and imager software is where most analysis friction sits, and it ends in Excel.** Gen5, Incucyte, MILLIPLEX Analyst, iQue ForeCyt and pCLAMP reviewers keep describing the same move: export, then do the real analysis elsewhere. "I always have to go back to trusty old excel"; "for any more detailed analysis it is best to copy the data to a spreadsheet program like excel". They also complain about the exports themselves: built for looks rather than for downstream use, dropping out-of-range flags, one plate at a time, or blocking metadata such as plate numbers. A tool that takes these exports cleanly would sit exactly at this hand-off.
- **Licences tied to one machine stop the work completely.** A Tecan reader "lying idle" after a PC update broke the Magellan licence. The pCLAMP dongle blocks a second person from analysing. Gen5 users ask for an "extra application code". Empiria reviewers want a department-wide licence.
- **The software forces one design.** Empiria Studio refuses normalisation to a housekeeping protein imaged in a different scan and caps replicates at triplicates. Reviewers see this as blocking valid experiments, not as protecting them.
- **Platform gaps are concrete.** The Incucyte analysis software and CFX Maestro are Windows-only ("so I can access and analyze data from home"). Spike2 dropped Mac. Ajay NCSU "used to miss [Origin] badly on MacOs".
- **Fit output without uncertainties is a deal-breaker.** "without that, it is scientifically useless" (Veusz). The same need appears for Wizard's missing MSE and for Prism's lack of user-defined equations (a 2015 comment, which may predate current Prism).
- **Silent data changes.** QtiPlot turned zeros into empty cells on import from OpenOffice, and SciDAVis users lost formatting or whole projects to corrupted files.
- **SelectScience holds very little on GraphPad Prism itself**: one Prism 6 page with 3 reviews. Most Prism reviews live on Capterra, G2 and TrustRadius, which are all blocked today. This file therefore leans on the ecosystem around Prism (instrument software, Origin-like plotters, Mac graphers) rather than on Prism reviews.
- Teaching-lab apps (Vernier Graphical Analysis, 2.1 of 5 from 526 ratings) draw troll reviews. Only the substantive ones were used: graphs lost on close, no free choice of columns, no integral or area-under-curve function.

## Proposed new tags

- `analysis-templates`: saving an analysis (blanks, normalisation, curve fit, layout) as a reusable template or protocol and re-applying it to new plates, replicates or files. It covers migrating those templates across versions.
- `vendor-support`: the reviewer's ability to finish an analysis depends on the vendor's help (programming assays, parallelism, routine data-analysis questions).
- `custom-equations`: fitting a user-written model equation rather than a built-in one.
- `area-under-curve`: integrating a curve or computing AUC, for example in physics teaching labs, glucose tolerance tests or kinetics.
