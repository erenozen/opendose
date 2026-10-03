# How scientists use Prism day to day, and what a free browser tool should do

Research agent report, 2026-10-04. 48 searches, ~70 fetches (~60 pages in
full), YouTube search pages, the public Bluesky API. Reddit and X were not
reachable; Observable docs 429; Benchling G2 and the MBoC article 403.
Quotes came through a summarising fetch; check wording before public use.

## 1. First run and mental model

How GraphPad teaches it: the Welcome dialog has Create (eight table types
with empty or tutorial data), Learn and Open, and recovers unsaved files
from the past four days. The brief tour: pick Column, load the t-test
sample data (with "a floating yellow note that briefly explains the data
format"), Analyze, accept defaults, results with an Analysis checklist,
scatter graph, Pairwise Comparisons button, estimation plot; ~5 minutes.
Graph Portfolio: "browse dozens of polished graphs. Open any of them to
see how they were made." Essential concepts: users "must learn the
distinction between the eight types of data tables"; black grid = raw
data, green/red = results, excluded values "in blue italics".

What confuses people: table types are the number-one learning need (the
most-viewed Prism video is "Tutorial 1 – Introducing Table Types",
495,192 views; "Working with Grouped Data" 326,211). Stacked vs side-by-
side replicates. Row titles that look like X values (GraphPad's own
"Possible point of confusion"). Reviewers: "hard to determine which sort
of graph to use"; "you have to know data tables very well otherwise you
cannot carry out any operation"; "graph to data linkages can sometimes be
very confusing"; "requires watching a lot for tutorials"; "once you get
the hang of it it's a lifesaver". GraphPad's beginner series: tour →
new project → import data (20 min, longest) → navigate → change analysis
choices → move data between tables → key concepts of tables.

A good first five minutes: pick the shape of the data; get data that
already works with a note; run one analysis next to a checklist; graph
with brackets; export. The "aha" moment is hot linking.

## 2. Daily habits

Recycling: "Use duplicate family, clone graph, the Wand tool, or save
templates." Mistakes GraphPad lists: repeating an analysis rather than
fixing it; duplicating a table to make a second graph; repeatedly
formatting related graphs; too-large projects; no milestone backups.
Wand replicates analyses and graphs from an example table; Magic makes
graphs look alike ("a huge time saver"); templates framed as legacy in
favour of example and method files. Users praise both ("quickly make the
same type of graph uniform"). "How To Make Graphs Consistent" 28,523
views.

Excel paste is both the main entry path (22,948-view video) and a known
crash (FAQ 1485). Getting graphs into PowerPoint/Illustrator: Send-to-
Word/PowerPoint (Windows only), the Illustrator FAQ is all workarounds
(EMF vs EMF+, Release Clipping Mask, avoid EPS with transparency). A
Bluesky user built a tool to extract embedded Prism plots from slides.

Project size: "Don't define 'project' too broadly"; Save Family As and
File > Merge. Navigation: rename/reorder, yellow highlight, Family
folder, ping-pong button, colour notes, search (FAQ 1529). Info sheets
record "dates, lot numbers, concentrations… used as constants". Lab
templates on Bluesky: an Illustrator file with sizes and a Prism file
with common chart types and object sizes, with links to raw data.

The "Prism look" (per ggprism's theme_prism): bold text except legend,
base 14 pt, legend title hidden, white background, black text and lines,
no gridlines, offset axis ending at the last tick, optional minor ticks;
named schemes "Colors", "Floral", "Colorblind Safe", art-inspired.

YouTube demand (views, 2026-10-04): Two-way ANOVA 226k; One-way ANOVA
217k; XY graphs 208k; ELISA 172k; GraphPad's own analyze-and-graph 170k;
significance lines 153k; volcano 142k; bar graphs 127k; IC50 117k/105k;
Kaplan–Meier 116k; t test 106k; layout 98k; shared Y axis 95k;
interpolate standard curve 86k; significance values on bars 78k; AUC
75k; normality 58k; chi-square/Fisher 57k; break axis 34k.

## 3. Collaboration and sharing

Version lock-in: "Files created by Prism 10 cannot be opened by Prism 9
or earlier" with a misleading error (FAQ 2241); reviewers: "not backward
compatible". The .prism format is a zip of CSV + JSON, but when a
university dropped its licence: "100s of files… None of the CSVs in the
prism file have names (other than UIDs), nor do they have column or row
headers" (Ian Sudbery). Licence churn on Bluesky: "When the Graphpad
license expires but your PI is asking for data…"; "The annual freak out
is on over the university no longer paying"; "They doubled the price on
it this year… I guess 2025 is the year I finally learn R" (reply: JASP,
"you can even look under the hood and see the exact R code"); a
long-time customer says the new owners "won't honour my licences".
Prism Cloud: viewers must create an account; personal-folder links do
not work; Commenter/Editor roles; browser upload only in Prism 11.
GraphPad's advice: "Send your colleagues complete Prism files rather than
exported images"; free Viewer. Reproducibility criticism: "easy to drag
the wrong data into a chart" (Wildtype One); collaboration "Poor
(standalone)"; reviewers complaining authors "don't provide code or
graphpad prism files"; Galaxy's model records every parameter and
shares by link. JASP praised for APA tables into Word and HTML/PDF
export.

## 4. Trust

Prism's warning conventions: "ambiguous" in the top row, "~" before
best-fit values, "very wide"; "hit constraint" suppresses bands.
Analysis checklists; "Data analysis for scientists, not statisticians".
Validation: NIST StRD ("Prism 4 meets this goal in all but three"); no
FDA validation, "does not maintain an audit trail". Open source as a
trust signal (JASP: proprietary software "frustrates transparency and
learning"); "see the exact R code". Reproducing across tools is a real
job ("replicate an existing immunology paper done with GraphPad Prism in
R… D'Agostino-Pearson"). Builds trust: transparent defaults ("One or
None" asterisks update with alpha), a recommender that explains itself
("it flagged a non-parametric test as more appropriate, and it was
right"). Breaks trust: silent behaviour ("will change/delete your graphs
as it decides"), point-and-click without understanding, AI hallucinating
about Prism.

## 5. Usability complaints

"graph labels are hard to edit after the graph is made"; "hard to place
the legend on the same place in multiple graphs"; "I can only make one
graph per page"; "designed in the early 90s"; crashes under Windows,
with many sheets, with big data; Mac features "less than ideal"; "You
can only do pre-defined data analysis"; "relentless request for
activation code"; eight dialog routes to change a graph (Graph Inspector
added in 10; BioRender pitches "without pop-ups"); file open recalculates
every fit (FAQ 643); layouts with images freeze (FAQ 2287). No primary
source on undo limits. Bluesky: "i am a graphpad prism hater… but at
least it isn't excel".

## 6. Accessibility and figures

8% of men colour-blind; with three male reviewers a 22% chance one is
(Wong, Nat Methods). Prism colour-blind-safe schemes since 8.1, "not to
use transparency" with them (FAQ 2234); Okabe–Ito not built in.
Datawrapper as benchmark: automatic colour-blind check, alt text,
keyboard navigation, "Get the data". Nature figure guide: Arial or
Helvetica 5–7 pt, do not outline text, embed fonts, .ai/.eps/.pdf
preferred, 89 or 183 mm wide, Okabe–Ito, avoid red/green and rainbow.
Dark mode and screen readers: no user sources.

## 7. Teaching

Course licences: undergraduate/high-school only, six months, instructor
must hold a subscription. Workshops depend on a one-time 30-day trial.
Student cost: "you'd need… to have it finished in 30 days using the free
trial… £142 a year". "Stop… letting your students teach each other
GraphPad". Pages instructors reuse: SD vs SEM ("SEM error bars are
harder to interpret than a confidence interval"), analysis checklists,
"which test". Praised elsewhere: jamovi Cloud ("No installation…
Chromebooks, lab computers, tablets"), JASP's data library and
progressive disclosure, Galaxy tutorials with time estimates and
objectives.

## 8. Performance expectations

Across 703 physiology papers the median smallest group was n = 3 and the
median largest n = 10 (Weissgerber 2015). Prism's ceilings 2048 columns ×
512 subcolumns. Slow: many sheets, recalculation on open, profile CIs,
layouts with images. Imaging and omics push to 10⁵ rows.

## (a) 20 ranked UX requirements

1. Explain table types by data shape (mini table + graph preview; "paste
   data and I'll suggest a type").
2. Bulletproof Excel paste (wide, row labels, replicate detection).
3. Make hot linking visible; show which sheets depend on which.
4. One-click live significance brackets and stars.
5. Edit graphs on the canvas without modal dialogs; legend positions
   synced across graphs.
6. Consistency tools: Magic, Wand, clone family, lab template files.
7. Multi-panel layout with alignment, shared axes, panel letters.
8. Warnings in the results themselves (ambiguous, hit constraint, did not
   converge, unequal variances, small n).
9. "Which test" guidance with assumption checklists and Learn links.
10. Every result traceable: equation, method names with citations,
    defaults shown, methods paragraph.
11. Publication-grade vector export with editable fonts and journal
    presets (89/183 mm, 5–7 pt Arial).
12. Colour-blind-safe palette by default plus automatic contrast and CVD
    check; warn about transparency.
13. Read-only share links that open without an account.
14. Open, version-stable file format; import .pzfx/.prism; export tidy
    CSV with headers.
15. No install, no licence expiry; Chromebooks and locked lab PCs.
16. Replicate-aware analysis: biological vs technical, nested, SuperPlots.
17. Show the data by default: dots with mean and CI; SD vs SEM explained;
    estimation plots.
18. A clear navigator: where results live, family view, search.
19. Autosave, crash recovery, deep undo, identical on every platform.
20. Instant at bench scale and smooth around 10⁵ values; lazy recompute.

## (b) First-run flow and in-product guidance

Start screen: picture cards for the eight types (mini table, mini graph,
allowed analyses); "Paste data and let me suggest a type"; open an
example or a .prism/.pzfx. Example opens fully linked with a pinned
note. Coach marks: change a value → graph and P update; Analyze →
recommended test with a one-line reason; results with checklist chips;
add brackets; export or copy share link. End card → gallery and "start
with your own data".

Guidance: numbers in Grouped row titles → "Did you mean an XY table?";
stacked vs side-by-side converter; paired layout detection; n < 3 and
unequal n flagged; biological vs technical prompt; which-test wizard;
normality and variance checks as advice; multiple-comparisons explainer;
ambiguous / hit-constraint / convergence banners; missing-constant
prompt; methods button; SD/SEM/CI tooltip and self-writing error-bar
legend; CVD simulation and contrast warning; font-size check against
journal presets; axis-break helper; legend sync; "opens in any version";
autosave status; share-link scope.

## (c) "Prism-look" defaults to match, and where to differ

Match: white background, black axes and text, no gridlines; bold
Arial/Helvetica, legend title hidden; offset axes ending at the last
tick, optional minor ticks; scatter/column with mean ± error and bars
with points; brackets with asterisks incl. "One or None"; named schemes;
results tables in Prism's layout with "ambiguous", "~", "very wide";
black/green/red grids, excluded values in blue italics.

Differ: default to points + 95% CI (or SD) and always print what the bar
means; Okabe–Ito/Tol palette by default with auto-check and no
transparency; show n per group; estimation-plot toggle next to every
comparison; edit on canvas; journal presets; auto methods paragraph;
never write files an older version cannot read.

## (d) Collaboration and sharing for a browser tool

1. Read-only share links without an account, pinned to a snapshot, with
   optional fork.
2. Projects encoded in the URL fragment for small datasets (PlotsOfData's
   bookmarkable settings).
3. Export bundle: tidy CSV with headers, settings and results JSON, SVG
   and PDF figures, results tables as XLSX/DOCX, methods text, README.
4. Import .pzfx and .prism so departing users recover years of files.
5. Lab template files: style plus analysis recipes.
6. Comment threads pinned to sheets and graph elements.
7. Provenance panel (Galaxy-style history).
8. Assignment mode for teaching.

## Sources

GraphPad user guide: key_concepts_welcome_dialog, a_brief_tour_of_prism,
how_to_learn_prism, graph-portfolio, how_to_begin,
organized_data_tables, everything_is_hot_linked,
helps_you_learn_data_analysis, a_complete_record_of_your_work,
tips_for_using_prism (latest and Prism 9), how_to_change_a_graph,
use_the_wand_to_repeat_analyse, template__method_and_analysis_,
easily_repeat_analyses_and_gra, tips-to-avoid-the-need-for-lar,
stacked_vs__side-by-side_repli, xy_table, prism_cloud_sharing,
difference-between-windows-and, features-in-windows-but-not-ma,
prism_magic_apply_style_from_an_example, prism_file_format (Prism 10).
Curve-fitting/statistics guides: reg_analysischeck_nonlin_ambiguous,
reg_analysischeck_hitconstraint, analysis_checklists2,
statwhentoplotsdvssem. FAQs 1529, 2241, 83, 1066, 2043, 1149, 872, 2234,
2151, 1485, 643, 2287; release notes 9.0.0, 10.0.0, 11.0.0; Prism Academy,
Beginners Guide series, Prism Cloud, free course licences. Capterra pages
2–6; Wildtype One; scientistinprogress; BioRender vs Prism and Graphing;
Weill Cornell library; GRADE Frankfurt workshop PDF; ggprism home,
themes, axes, README; HN 46783752 and Algolia "graphpad"; Bluesky posts by
mcduncanlab, iansudbery, patschloss, pmoyniha, drandyholt, aemonten,
lonelyjoeparker, shinyblackshoe, buntglas, satyrscientist, armanaksoy,
davidrach, rucklecke, wildtypeone, ltl2; YouTube search pages for 14
queries; PlotsOfData (PMC6453475), SuperPlotsOfData GitHub,
estimationstats preprint, Lord 2020 (PMC7265319), Weissgerber 2015
(PMC4406565), jamovi about and cloud, JASP about and getting started,
Datawrapper colour-blind check and accessibility, Galaxy reproduce
tutorial, ColabFold, Nature figure guide; snippets: Wong 2011, figcanvas
Okabe–Ito, Galaxy 2016 NAR.
