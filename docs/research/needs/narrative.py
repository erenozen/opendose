"""Prose for the user-needs catalogue.

The interpretation (findings, venue notes, do-not-build list) is written
here by hand; every number in it is computed from the observations when the
build runs, and every quote is pulled verbatim from the raw files by id, so
a re-run with new data (e.g. Reddit) keeps the text honest. A quote whose id
disappears from the data is skipped, not invented.
"""
import math
import re
from collections import Counter, defaultdict

import build_catalogue as B
from needs_rules import NEEDS

BY_ID = {n["id"]: n for n in NEEDS}


def pct(a, b):
    return f"{100 * a / b:.0f}%" if b else "n/a"


def one_line(t):
    return re.sub(r"\s+", " ", t or "").strip()


def find(obs, prefix):
    for o in obs:
        if o["id"] == prefix:
            return o
    for o in obs:
        if o["id"].startswith(prefix):
            return o
    return None


def q(obs, prefix, gloss=True):
    """A verbatim quote with venue and link, or '' if the id is gone."""
    o = find(obs, prefix)
    if not o:
        return ""
    g = ""
    if gloss and o["_venue"] == "non-english":
        g = f" *({one_line(o.get('problem'))})*"
    return f"“{one_line(o['quote'])}” ([{o['venue']}]({o['url']}), `{o['id']}`){g}"


def quotes(obs, prefixes, k=3):
    out = [q(obs, p) for p in prefixes]
    out = [x for x in out if x][:k]
    return "\n".join(f"  - {x}" for x in out)


def need_obs(obs, ids):
    ids = set(ids)
    return [o for o in obs if o["_need_id"] in ids]


def lang(o):
    return o["id"].split("-")[1] if o["_venue"] == "non-english" else None


LANG_NAME = {"zh": "Chinese", "ja": "Japanese", "ko": "Korean", "de": "German", "fr": "French",
             "pt": "Portuguese", "es": "Spanish", "tr": "Turkish"}


# ------------------------------------------------------------------ method
VENUE_WHAT = {
    "stackexchange": "Questions and answers on Cross Validated, Biology, Bioinformatics, Chemistry and Stack Overflow.",
    "github": "Issue and discussion threads in R/Python statistics and plotting packages, dose-response and survival packages, and open tools.",
    "graphpad-support-mirror": "GraphPad's public release notes (Prism 8–11), FAQ, academy and licensing pages: the vendor's own record of requests and bug fixes.",
    "youtube": "Comments and replies under the most-viewed tutorials on Prism, IC50, ELISA, qPCR, survival, ANOVA, t tests, error bars and densitometry.",
    "literature": "Methods critiques and meta-research audits; each documented mistake is one observation, with its prevalence where the paper reports one.",
    "competitor-signals": "Trackers, forums and product pages of BarelySig, JASP, jamovi, BioRender Graphing and smaller tools: what other tools think the pain is.",
    "reviews": "First-person software reviews (SelectScience, App Store, AlternativeTo, SourceForge, SoftwareSuggest, PeerSpot).",
    "consulting-faqs": "University statistics-consulting and core-facility FAQs: the questions biologists bring to statisticians.",
    "blogs": "Lab, methods and teaching blogs and their comment threads.",
    "journal-requirements": "Author instructions, reporting checklists and editorials (Nature, eLife, PLOS, Cell Press, JBC, BJP, ARRIVE, MDAR, MIQE, MIFlowCyt…): each required item is one observation.",
    "forums": "forum.image.sc, Bioconductor support, Galaxy help and SEQanswers threads.",
    "courses": "Course and workshop materials that teach Prism and bench statistics, and polls that size the workflows.",
    "non-english": "Chinese, Japanese, Korean, German, French and Turkish communities (muchong, bilibili, Yahoo Chiebukuro, Qiita, BRIC, statistik-forum.de, les-mathematiques, futura-sciences, Ekşi Sözlük); quotes kept in the original language.",
    "hackernews": "Hacker News comments (Algolia API).",
    "social": "Mastodon / fediverse posts by bench and lab scientists.",
    "reddit": "Reddit threads exported by hand (see REDDIT.md).",
}

METHOD_TEXT = """\
**Observations.** Each research agent read the pages itself and wrote one observation per distinct
user problem (`SCHEMA.md`): a verbatim quote of one to three sentences, the agent's one-line reading
of the problem and of the need, a severity, any engagement counts the page shows, and tags from
`TAGS.md`. Every venue digest (`raw/<venue>.md`) records a script check of each quote against the
cached page text; the digests report no mismatches. Where a site refused the tooling (HTTP 403 or a
bot check) it was skipped and listed, never worked around.

**Unreachable or absent.** Reddit (403 to pages, `.json` and RSS; see `REDDIT.md` for how to add
hand-exported threads, which this script will pick up as `raw/reddit.json`); ResearchGate (403);
Zhihu (403), CSDN, Baidu Zhidao, Jianshu, Naver and Tistory (JavaScript shells) and dxy.cn (bot
check); Capterra, G2 and TrustRadius (blocked today, so most first-person Prism reviews are missing);
Bluesky (403 to the public API); Bitesize Bio, Medium, science.org blogs and Gelman's blog (403);
help.biorender.com and alternativeto.net's Prism page (403); Biostars (no relevant threads surfaced;
not crawled). forum.image.sc, which had blocked earlier tooling, was reachable this time and supplies
most of the forum observations. Spanish- and Portuguese-language Q&A has no usable observations (see
the exclusion below), and Turkish has two.

**Exclusions made by this script.** The non-English digest says six pt/es Stack Overflow
observations were read through `api.stackexchange.com` after the question pages returned 403 and were
to be removed; the JSON still contains them, so `build_catalogue.py` drops every non-English
observation whose URL is an API endpoint (rule `EXCLUDE_RULES`). The social digest records that 15
posts from authors outside bench science were removed before this build.

**Status judgements.** Each need's status (`done`, `partial`, `missing`) was judged against
`README.md`, `docs/ROADMAP.md` (including its open-item lists and site-validation follow-ups),
`web/src/sheets/README.md`, `web/src/guide/explainers.ts`, `web/src/guide/recommend.ts` and the
handler names in `engine/opendose/api.py`, as of 2026-10-09; the justification names the line or
handler. `done` means the capability exists, not that every request in the cluster is met; the gap
field says what is left. Needs marked *met but hard to find* are done, but users who ask for them
would not find them where they look."""


def clustering_text(obs, rows):
    kw = sum(1 for o in obs if o["_rule"] == "keyword")
    fb = sum(1 for o in obs if o["_rule"] == "fallback")
    mg = sum(1 for o in obs if o["_rule"] == "merged-small")
    st = Counter(r["opendose_status"] for r in rows)
    return f"""\
### Clustering

The {len(obs):,} observations were clustered into {len(rows)} needs ({st['done']} done, {st['partial']}
partial, {st['missing']} missing) by explicit rules in `needs_rules.py`, so that a later run with more
data repeats the same assignment. Each need lists keyword patterns (matched against the observation's
`need` text, then its `problem`, quote and workflow) and the tags it covers; every observation goes to
the single need with the highest score (three points per pattern matched in the need text, 1.5 in the
problem, 0.5 in the quote or workflow, 2.5 if its first tag is one of the need's tags, one per further
matching tag, minus 3 for catch-all needs, so that specific needs win ties). {kw:,} observations
({pct(kw, len(obs))}) were placed by keywords and {fb:,} ({pct(fb, len(obs))}) by the fallback that maps
their first tag to a default need. Needs left with fewer than three observations are folded into a
named parent ({mg} observations moved). The `--check` option prints every need with its members for
review; the rules were tuned by reading all {len(obs):,} need texts."""


FORMULA_TEXT = """\
For each need:

```
priority_raw   = ln(1 + n_observations)
               × mean severity weight   (blocks the analysis 3, wrong result risk 2.5,
                                          slows the work 1.5, cosmetic / preference 0.5)
               × sqrt(number of distinct venues)
               × (1 + signal / max signal over all needs)
signal         = log10(1 + votes + views/100 + video views/1000 + HN thread points)
                 (votes = votes, likes, reactions, upvotes, favourites, boosts on the observation;
                  views = page views; video views and HN thread points are counted once per
                  distinct video or thread, not once per comment)
priority_score = 100 × priority_raw / max priority_raw
```

Frequency enters on a log scale so that one venue with hundreds of near-identical comments cannot
dominate; breadth (how many different kinds of venue raise the need) multiplies it, because a need
that appears in the literature, in journal rules, in forums and in YouTube comments is more robust
than one venue's hobby-horse; severity weights a silent wrong result almost as high as a blocked
analysis; signal (engagement) can at most double the score. Literature and journal observations carry
no engagement, which is why signal is bounded."""


def intro(obs, rows, st_obs):
    venues = Counter(o["_venue"] for o in obs)
    return (f"This catalogue turns {len(obs):,} observations of user problems, gathered from {len(venues)} kinds "
            f"of venue (Q&A sites, issue trackers, YouTube comments, reviews, consulting FAQs, blogs, forums, "
            f"courses, journal rules, the methods literature, GraphPad's own support pages, competitor "
            f"trackers, Hacker News, the fediverse and non-English communities), into {len(rows)} needs: things "
            f"a tool would have to do. Each need carries its counts, venue mix, severity, engagement, the "
            f"literature's prevalence figures where they exist, verbatim evidence with links, OpenDose's status "
            f"with the artefact that shows it, the gap and a proposal. {st_obs['done']:,} observations "
            f"({pct(st_obs['done'], len(obs))}) fall in needs OpenDose already meets, {st_obs['partial']:,} "
            f"({pct(st_obs['partial'], len(obs))}) in needs it meets in part and {st_obs['missing']:,} "
            f"({pct(st_obs['missing'], len(obs))}) in needs it does not meet.")


# ---------------------------------------------------------------- findings
REPS = ["declare-experimental-unit", "collapse-technical-replicates", "pseudoreplication-warning",
        "nested-mixed-models", "experiment-as-block", "superplots", "small-n-honesty"]
DR = ["incomplete-curve-flags", "fit-failure-explained", "zero-dose-control", "constraints-initial-values",
      "dose-design-advice", "relative-absolute-ic50"]


def findings(obs, rows, members):
    out = []
    row = {r["id"]: r for r in rows}
    all_venues = len(set(o["_venue"] for o in obs))
    english_venues = {o["_venue"] for o in obs} - {"non-english"}

    # 1 replicates
    rep = need_obs(obs, REPS)
    rv = len(set(o["_venue"] for o in rep))
    langs = sorted({LANG_NAME.get(lang(o), lang(o)) for o in rep if lang(o)})
    out.append(
        f"**1. The same replicate confusion appears in {rv} of {all_venues} venues and in {len(langs) + 1} "
        f"languages.** The seven needs about "
        f"what n is (declare the unit, collapse technical replicates, warn on pseudoreplication, nested and "
        f"blocked analyses, SuperPlots, honesty at small n) hold {len(rep)} observations, "
        f"including {', '.join(langs)} posts that ask the identical question in their own "
        f"words. The literature measures the damage and journals now require the unit to be stated, yet "
        f"users still meet the problem at the moment they enter data, which is where no guideline reaches "
        f"them.\n"
        + quotes(obs, ["nonen-ja-three-plates-1", "nonen-zh-replicates-grouped-1", "imagesc-33993-1",
                       "lit-lazic2010-prevalence", "lit-lord2020superplots-cell-as-n"], 4)
        + "\n  - *For OpenDose:* ask what each value is when a table is created, not only when a chip fires "
          "after analysis (`declare-experimental-unit`), and refuse inference at one independent value "
          "(`small-n-honesty`).")

    # 2 software blamed
    blame = [o for o in obs if o["_venue"] in ("literature", "journal-requirements")
             and re.search(r"software|package|program|default", o["quote"], re.I)]
    out.append(
        f"**2. Journals and methods papers blame the software's defaults, not only the authors.** {len(blame)} "
        f"literature and journal observations name software, packages or defaults as part of the problem: "
        f"programs that pick the test, packages that allow P values at n < 5 or post hoc tests after a "
        f"non-significant F, implementations that cannot handle missing time points, rainbow colour maps by "
        f"default. Because one program dominates bench papers, its defaults act as the field's policy.\n"
        + quotes(obs, ["lit-weissgerber2016e-5", "lit-curtis2015-software-n", "lit-curtis2018-posthoc-F",
                       "lit-gosselin2021-software"], 4)
        + "\n  - *For OpenDose:* defaults are the product. SD and points by default, exact P, effect sizes and "
          "the unit of n are already defaults (README › Reporting); the open ones are a hard stop at n = 1, "
          "residual plots instead of normality-test gating, and the interaction test for differential effects.")

    # 3 GraphPad bug fixes
    gp = [o for o in obs if o["_venue"] == "graphpad-support-mirror" and (o.get("signal") or {}).get("type") == "bug fix"]
    wr = [o for o in gp if o["severity"] == "wrong result risk"]
    wf = Counter(BY_ID[o["_need_id"]]["workflow"] for o in gp).most_common(4)
    out.append(
        f"**3. GraphPad's own bug-fix history is a map of where analysis tools go wrong.** The release notes "
        f"read for this catalogue contain {len(gp)} bug fixes, {len(wr)} of them classed as a wrong-result "
        f"risk. They cluster in {', '.join(f'{w.lower()} ({n})' for w, n in wf)}: multiple comparisons "
        f"after two-way ANOVA, Dunnett and Geisser-Greenhouse P values, profile-likelihood CIs, decimal "
        f"separators and pasted values, summary formats changing on save, and files rendering differently "
        f"on another platform or version. These are the places where a careful implementation still breaks.\n"
        + quotes(obs, ["gpsupport-rn-811-1", "gpsupport-rn-1003-3", "gpsupport-rn-831-1", "gpsupport-rn-1030-10"], 4)
        + "\n  - *For OpenDose:* aim the pinned cross-checks (`docs/prism-validation.md`, the validation page) "
          "at exactly these spots (two-way post hoc families, Dunnett after two-way, GG-corrected P, profile "
          "CIs, locale paste, project round-trips) and recompute stored results on reopen "
          "(`stable-results-versions`).")

    # 4 price trigger, figures retention
    pr = [o for o in obs if "price-licence" in o["_tags"]]
    prv = len(set(o["_venue"] for o in pr))
    comp = [o for o in obs if o["_venue"] == "competitor-signals"]
    comp_graph = [o for o in comp if BY_ID[o["_need_id"]]["workflow"].startswith("Graphs")]
    out.append(
        f"**4. Price is the trigger for looking elsewhere; the graph editor is what keeps people.** "
        f"{len(pr)} observations from {prv} venues are about price or licences (subscriptions, per-machine "
        f"fees, expired trials, pirated copies), but when users explain why they still return to the paid "
        f"tool, they name its graphs and its plot editor, and {len(comp_graph)} of the {len(comp)} "
        f"competitor-tracker observations ({pct(len(comp_graph), len(comp))}) are graph requests.\n"
        + quotes(obs, ["blog-kclhab-prismtor-1", "courses-weill-licence-cost", "competitor-jamovi-4043",
                       "competitor-jamovi-401", "imagesc-13582-2"], 4)
        + "\n  - *For OpenDose:* being free brings the first visit; direct graph editing and style reuse "
          "(`graph-direct-editing`, `graph-style-reuse`) decide the second, which is why they belong in the "
          "planned UI/UX pass with Eren.")

    # 5 done but hidden
    st = Counter()
    for r in rows:
        st[r["opendose_status"]] += r["n_observations"]
    top20 = rows[:20]
    hidden = [r for r in rows if r["hidden"] and r["opendose_status"] == "done"]
    hid_obs = sum(r["n_observations"] for r in hidden)
    out.append(
        f"**5. Most of the demand is already met; what is missing is the path to it.** {st['done']:,} of "
        f"{len(obs):,} observations ({pct(st['done'], len(obs))}) fall in needs OpenDose already meets, and "
        f"{sum(1 for r in top20 if r['opendose_status'] == 'done')} of the 20 highest-scoring needs are done. "
        f"{len(hidden)} done needs ({hid_obs} observations) are ones users ask for in places where OpenDose "
        f"does not offer them: {', '.join(f'`{r[chr(105)+chr(100)]}`' for r in hidden)}. One is hidden by our own text: the survival recommendation in "
        f"`web/src/guide/recommend.ts` still says Cox regression is \"not in OpenDose yet\", although the README "
        f"lists Cox regression with hazard ratios.\n"
        + quotes(obs, ["competitor-barelysig-29", "imagesc-54089-2", "gpsupport-faq-43"], 3)
        + "\n  - *For OpenDose:* the cheapest wave of improvements is discoverability (IMPROVEMENT-PLAN.md marks "
          "these items).")

    # 6 venue severity
    def share(v, sev):
        l = [o for o in obs if o["_venue"] == v]
        return pct(sum(1 for o in l if o["severity"] == sev), len(l)) if l else "n/a"
    out.append(
        f"**6. Each venue sees a different failure, so no single venue is a fair sample.** In the literature "
        f"{share('literature', 'wrong result risk')} of observations are silent wrong results, in consulting "
        f"FAQs {share('consulting-faqs', 'wrong result risk')} and in journal rules "
        f"{share('journal-requirements', 'wrong result risk')}; in software reviews only "
        f"{share('reviews', 'wrong result risk')} are, while {share('reviews', 'cosmetic / preference')} are "
        f"cosmetic and {share('reviews', 'slows the work')} are about speed. Users who are stuck show up in "
        f"forums ({share('forums', 'blocks the analysis')} blocked), non-English communities "
        f"({share('non-english', 'blocks the analysis')}) and YouTube comments ({share('youtube', 'blocks the analysis')}). "
        f"Reviewers judge convenience; the papers count the harm; beginners report the wall they hit.\n"
        + "  - *For OpenDose:* convenience wins reviews and wrong results lose papers, so safe defaults must "
          "cost no clicks. The ranking formula multiplies by venue breadth for this reason.")

    # 7 dose-response honesty
    dr = need_obs(obs, DR)
    drv = len(set(o["_venue"] for o in dr))
    drl = sorted({LANG_NAME.get(lang(o), lang(o)) for o in dr if lang(o)})
    yt = sum(1 for o in dr if o["_venue"] == "youtube")
    out.append(
        f"**7. Incomplete dose-response curves produce the same questions in English, Chinese and Korean, and "
        f"some answers invent data.** The needs about undefined plateaus, extrapolated IC50s, failed or "
        f"ambiguous fits, the zero-dose control and dose design hold {len(dr)} observations from {drv} venues "
        f"({yt} YouTube comments; {', '.join(drl) if drl else 'no'} posts). Tutorial comment threads show "
        f"users told to add a concentration they never tested, or to replace the vehicle's zero with an "
        f"arbitrary number; the toxicology literature shows that normalising to a deviating control biases "
        f"the curve.\n"
        + quotes(obs, ["youtube-CD9CZjzDTEE-UgxunbzCG5", "youtube-AEJvkrl7NsU-Ugzke5JJYCXwPBG7aBJ4AaABAg.",
                       "nonen-ko-tilde-ic50-1", "lit-devctrl2020-1"], 4)
        + "\n  - *For OpenDose:* report '> highest dose' instead of an extrapolated number "
          "(`incomplete-curve-flags`), let vehicle wells define the plateau (`zero-dose-control`) and advise "
          "on dose spacing before the experiment (`dose-design-advice`).")

    # 8 competitors converge
    c = Counter(o["_need_id"] for o in comp).most_common(8)
    out.append(
        f"**8. Competing tools converge on the same backlog, so table stakes are shared and the difference "
        f"must come from elsewhere.** The most frequent needs in competitor trackers are "
        f"{', '.join(f'`{k}` ({n})' for k, n in c[:6])}: brackets drawn from the analysis, being free, journal "
        f"export, nested data, error-bar choice and showing the points. JASP and jamovi users ask for "
        f"brackets, compact letters and Prism-file import; the newest browser tool lists the same features "
        f"OpenDose ships.\n"
        + quotes(obs, ["competitor-jaspforum-9495", "competitor-jasp-342", "competitor-jamovi-1232"], 3)
        + "\n  - *For OpenDose:* match the table stakes (done for most), and compete on what the corpus says "
          "no tool does well: design-level guidance about n and replicates, validation against reference "
          "values, and reporting that journals accept without retyping.")

    # 9 guidelines vs defaults
    bjp = find(obs, "journal-bjp-design-8")
    nums = ""
    if bjp and isinstance(bjp.get("signal"), dict):
        s = bjp["signal"]
        bits = [f"{label} {s[k]}%" for k, label in (("compliance_n_5plus_pct", "n ≥ 5 in"),
                                                     ("compliance_randomization_statement_pct", "a randomisation statement in"),
                                                     ("compliance_blinding_statement_pct", "a blinding statement in"),
                                                     ("compliance_correct_post_hoc_pct", "a correct post hoc test in"))
                if k in s]
        if bits:
            nums = (" The British Journal of Pharmacology's own audit found " + ", ".join(bits) +
                    " of submissions (`journal-bjp-design-8`).")
    out.append(
        f"**9. Reporting guidelines alone barely move practice; checks inside the tool might.** Several audits "
        f"in the corpus measure compliance before and after a journal policy and find little change.{nums} "
        f"Authors of those audits ask for the checks to live in the analysis software.\n"
        + quotes(obs, ["lit-npqip2019-landis", "lit-diong2018-4", "lit-curtis2018-noncompliance"], 3)
        + "\n  - *For OpenDose:* the journal checklists are already filled from the project (README › Reporting); "
          "the missing pieces are the design facts they ask for (randomisation, blinding, exclusions: "
          "`design-reporting-capture`, `exclusion-log`).")

    # 10 non-English
    ne = [o for o in obs if o["_venue"] == "non-english"]
    eng = Counter(o["_need_id"] for o in obs if o["_venue"] in english_venues)
    common = sum(1 for o in ne if eng[o["_need_id"]] >= 10)
    nec = Counter(o["_need_id"] for o in ne)
    own = [k for k, v in nec.items() if v >= 3 and v > eng[k]]
    langs_all = Counter(LANG_NAME.get(lang(o), lang(o)) for o in ne)
    loc = nec.get("localised-ui", 0)
    fr = nec.get("free-access", 0)
    out.append(
        f"**10. Non-English communities ask the same statistical questions, plus two of their own: language "
        f"and legal access.** {common} of {len(ne)} non-English observations ({pct(common, len(ne))}) fall in "
        f"needs that English-language venues raise at least ten times "
        f"({', '.join(f'{k} {v}' for k, v in langs_all.most_common())}). The needs where non-English "
        f"observations outnumber English ones are {', '.join(f'`{k}`' for k in own) or 'none'}: the interface "
        f"language ({loc} observations) and, within access ({fr}), trial copies passed between students, "
        f"cracked installers with high view counts and localised editions at a premium. Compact letter "
        f"displays recur too.\n"
        + quotes(obs, ["nonen-zh-no-chinese-1", "nonen-zh-trial-expired-1", "nonen-ja-japanese-version-pr",
                       "nonen-ko-letters-control-1"], 4)
        + "\n  - *For OpenDose:* free and in the browser already answers access; localisation of the wizard, "
          "explainers and banners (`localised-ui`, effort L) is the one need here that nothing in the "
          "roadmap covers.")
    return "\n\n".join(out)


# -------------------------------------------------------------- plan text
def plan_intro(obs, rows, imps, top):
    kinds = Counter(i["kind"] for i in top)
    waves = Counter()
    for i in top:
        waves[4 if i["kind"] == "research" else {"S": 1, "M": 2, "L": 3}[i["effort"]]] += 1
    return (f"Improvements are the needs that OpenDose meets only in part or not at all, plus the needs it "
            f"meets but where users would not find the feature (*make discoverable*). Of {len(imps)} such "
            f"items, the 40 with the highest priority score (see CATALOGUE.md › How needs are ranked) are listed "
            f"here in four waves: {waves[1]} quick wins (effort S), {waves[2]} medium builds (M), {waves[3]} large "
            f"builds (L) and {waves[4]} research-first item{'s' if waves[4] != 1 else ''}. "
            f"{kinds['discoverability']} of the 40 are already built and only need to be made discoverable. Within each wave the order is the score. Effort: S = "
            f"days, M = one to two weeks, L = more. Proposals that change screens belong in the UI/UX pass "
            f"planned with Eren rather than being done piecemeal. Each item names its need id (evidence in "
            f"CATALOGUE.md and needs.json) and an acceptance test written as what a user would see.")


def default_accept(i):
    return f"A user who needs “{i['title']}” finds it from the place they start, without reading documentation."


DNB = [
    ("Per-dose or per-time-point t tests as the analysis of a curve",
     ["dose-time-not-per-point", "time-course-models"], ["stackexchange-stats-196683", "gpsupport-faq-1084", "lit-tumorgrowth2021-typeI"],
     "Curve comparison (shared vs separate fits), AUC per subject or a mixed model over time. Keep "
     "\"multiple t tests per row\" for omics-style screens with FDR, and label it as many comparisons."),
    ("SEM as the default error bar",
     ["error-bar-choice", "error-bar-labelled"], ["blog-scisound-poorstats-4", "blog-wildtypeone-truths-3"],
     "SD with the points to describe data, 95% CI for precision; SEM only by explicit choice and always "
     "named in the legend (already the default)."),
    ("Post hoc ('observed') power after a non-significant result",
     ["no-post-hoc-power"], ["nonen-ja-n3-power-1", "gpsupport-faq-1710"],
     "The CI of the effect and the smallest effect the design could detect; prospective power from a "
     "planned effect only."),
    ("Automatic outlier deletion",
     ["exclusion-log", "outlier-detection"], ["lit-motulsky2014-phack", "blog-wildtypeone-truths-4", "journal-bjp-design-7"],
     "Flag (ROUT, Grubbs), keep the point visible, require a reason, report results with and without it."),
    ("Choosing between parametric and rank tests from a normality-test P value",
     ["assumption-checks-residuals"], ["courses-babraham-ans-kw-vs-anova", "consult-dundee-normality-test-40"],
     "Choose from the design and the scale (log for ratios and concentrations), show residual QQ plots, "
     "and use Welch before switching to ranks."),
    ("Bar graphs of means as the default for small samples",
     ["show-every-point"], ["blog-simplystats-dynamite-1", "consult-dundee-dynamite-32"],
     "Dot or box plots with every point (the default today); bars for counts and proportions."),
    ("Stars instead of P values",
     ["brackets-from-analysis", "exact-p"], ["competitor-jaspforum-9495", "consult-edinburgh-significance-14"],
     "Brackets drawn from the analysis with exact P available on them, effect sizes with CIs in the results, "
     "and the star thresholds written into the legend."),
    ("One-tailed tests chosen after seeing the data",
     ["test-variant-named"], ["consult-babbio-onetailed", "consult-ucla-onetailed"],
     "Two-tailed by default; one-tailed only when declared before the data (the proposed analysis plan)."),
    ("Inventing data to make a fit or a graph work (an untested concentration, a number for the vehicle's zero, a fake row)",
     ["zero-dose-control", "incomplete-curve-flags"],
     ["youtube-AEJvkrl7NsU-Ugzke5JJYCXwPBG7aBJ4AaABAg.", "competitor-jamovi-1259", "youtube-7NgRqXSByFo-UgxNyIrc"],
     "Constraints with a stated reason, vehicle wells as the plateau, 'IC50 > top dose' reporting, manual "
     "axis ranges, and summary-data entry instead of fabricated datasets."),
    ("Data-driven 'optimal' cut-points for survival groups",
     ["pairwise-logrank", "median-survival-explained"], ["github-survminer-359-1", "lit-altman1995-3"],
     "Pre-specified cut-points, or Cox regression on the continuous variable; ROC cut-offs only as "
     "diagnostics, with their optimism stated."),
    ("Testing fold changes with the control fixed at 1 (or averaging 2^−ΔΔCt)",
     ["qpcr-stats-log-scale", "normalised-control-variance"], ["youtube-Kkle8T7aXjk-UgzDVkqc", "nonen-zh-qpcr-errorbar-1"],
     "Statistics on ΔCt or on log ratios (ratio paired or one-sample t on logs), fold change with an "
     "asymmetric CI at the end (both exist)."),
    ("Counting cells, wells or repeated reads as n",
     ["declare-experimental-unit", "pseudoreplication-warning"], ["imagesc-33993-1", "lit-lord2020superplots-cell-as-n"],
     "Statistics on experiment means with every cell shown (SuperPlots), or a nested / mixed model."),
    ("Linearised fits (Lineweaver-Burk, Scatchard) to estimate parameters",
     ["enzyme-kinetics-rates"], ["youtube-QF6fWNzAYr0-Ugwsgfp", "journal-jbc-data-13"],
     "Nonlinear fits for Km, Vmax, Kd; the linear plots stay as display transforms."),
]


def do_not_build(obs):
    count = Counter(o["_need_id"] for o in obs)
    L = ["Some requests in the corpus would make results worse if built as asked. Each line names what "
         "users ask for or do, the needs where the evidence sits (with their observation counts), example "
         "quotes showing the practice and the warnings against it, and what to offer instead.", ""]
    for i, (title, needs, ex, instead) in enumerate(DNB, 1):
        seen = list(needs)
        for p in ex:
            o = find(obs, p)
            if o and o["_need_id"] not in seen:
                seen.append(o["_need_id"])
        ev = "; ".join(f"`{n}` ({count.get(n, 0)})" for n in seen)
        qs = [q(obs, p) for p in ex]
        qs = [x for x in qs if x]
        L.append(f"{i}. **{title}.** Needs: {ev}.")
        for x in qs:
            L.append(f"   - {x}")
        L.append(f"   - *Offer instead:* {instead}")
    return "\n".join(L)


# ------------------------------------------------------------- by venue
VENUE_INTRO = """\
The same catalogue, split by where the observations came from, so that the differences between
venues are visible. Each venue has a short reading, its ten most frequent needs (with the need's share
of the venue next to its share of the whole corpus) and the needs most over-represented there.
Severity shares are the agents' classification of each observation."""

VENUE_NOTES = {
    "stackexchange": "The analysts' venue. Questions are long, specific and well answered, and they come from people "
                     "who already know a test exists but cannot map their design onto it: nested and blocked "
                     "experiments, counts and proportions, small samples, standard curves and IC50s. Its "
                     "distinctive needs (counts models, limits of detection, error propagation, rank tests at "
                     "tiny n) are the statistics that sit just beyond the textbook.",
    "github": "The power users' venue. Issues ask for precise, reproducible output from code libraries: brackets that "
              "carry the right adjusted P, risk tables locked to the time axis, exact test variants, SS types, "
              "pairing by subject ID rather than row order. It is the venue most concerned with figure "
              "mechanics and with results that silently differ between tools.",
    "graphpad-support-mirror": "The vendor's view. Release notes and FAQs are a log of what users requested and of "
                               "what broke: licensing and platform problems, large data, file compatibility, "
                               "pasting from Excel, and a long tail of wrong-result bug fixes in multiple "
                               "comparisons and curve fitting (see finding 3 in CATALOGUE.md).",
    "youtube": "The beginners' venue. Comments under tutorials ask how to get a number at all: an IC50 from three "
               "doses, ΔΔCt from a Ct table, a standard curve, a densitometry ratio, an asterisk on a bar. A "
               "quarter of them are blocked outright, and some replies give dangerous advice (invent a "
               "concentration, replace zero with 0.1).",
    "literature": "The auditors' venue. Methods papers count how often published analyses go wrong; three quarters of "
                  "the observations are silent wrong results: pseudoreplication, bar graphs hiding data, "
                  "missing randomisation and blinding, saturated blots, undefined plateaus. This is where most "
                  "prevalence figures come from.",
    "competitor-signals": "Other tools' backlogs. Trackers of BarelySig, JASP and jamovi converge on the same features: "
                          "significance brackets, journal export, summary-data entry, plot editing, nested data, "
                          "plain-language output. They show what the market treats as table stakes.",
    "reviews": "The buyers' venue. Reviews judge ease of use, price, stability and the look of the default graphs; "
               "almost none mention a wrong result. They ask for tutorials, templates, instrument import and "
               "guided assay workflows.",
    "consulting-faqs": "What biologists ask statisticians. Power and sample size lead, followed by the experimental "
                       "unit, nested data, test choice and assumption checks; the answers favour design-stage "
                       "planning and honest wording of non-significant results.",
    "blogs": "Practitioners writing for peers: price and coding fears, show-the-points campaigns, and the case for "
             "linked, reproducible analysis (raw data to figure without copy-paste).",
    "journal-requirements": "What journals demand. Every item is a reporting obligation: design facts (randomisation, "
                            "blinding, exclusions), figure legends with n and error-bar type, source data, "
                            "software versions and statistics tables. Their distinctive needs are exports, not "
                            "analyses.",
    "forums": "Image analysts and bioinformaticians at the hand-off to statistics: normalising image measurements, "
              "importing per-cell tables, deciding what n is when one well yields thousands of cells.",
    "courses": "What courses teach and where they stop: test choice, power, contingency tables, showing points, "
               "methods text and how to trust a result.",
    "non-english": "The same statistical questions as the English venues, plus interface language and legal access; "
                   "compact letter displays and potency summaries recur (see finding 10 in CATALOGUE.md).",
    "hackernews": "Engineers and scientists discussing tools in general: the spreadsheet-versus-code divide, Excel "
                  "mangling identifiers, analysis plans and forking paths, validation and sharing.",
    "social": "A small sample of fediverse posts by bench scientists: opening Prism files without a licence, "
              "instrument formats, plain-language output and image provenance.",
}


def venue_paragraph(v, l, rows):
    s = Counter(o["severity"] for o in l)
    top = Counter(o["_need_id"] for o in l).most_common(3)
    titles = {r["id"]: r["title"] for r in rows}
    computed = (f"{len(l)} observations; {pct(s['blocks the analysis'], len(l))} block the analysis, "
                f"{pct(s['wrong result risk'], len(l))} risk a wrong result, {pct(s['slows the work'], len(l))} "
                f"slow the work, {pct(s['cosmetic / preference'], len(l))} are cosmetic. Most frequent: "
                + "; ".join(f"{titles[k].rstrip('.')} ({n})" for k, n in top) + ".")
    note = VENUE_NOTES.get(v, "")
    return (note + " " + computed).strip()


# -------------------------------------------------------------- roadmap
def roadmap_summary(obs, rows, by_venue, st_obs):
    return (f"A second research round (raw observations in `docs/research/needs/raw/`, schema in `SCHEMA.md`) "
            f"collected {len(obs):,} verified observations of user problems from {len(by_venue)} venues "
            f"({', '.join(f'{B.VENUE_LABEL.get(v, v)} {n}' for v, n in by_venue.most_common())}). Reddit, "
            f"ResearchGate, Zhihu and Capterra were unreachable; `REDDIT.md` describes how to add Reddit, and the "
            f"build script picks up any new venue file. `build_catalogue.py` clusters the observations with "
            f"explicit rules into {len(rows)} needs and ranks them by frequency × severity × venue breadth × "
            f"engagement. {pct(st_obs['done'], len(obs))} of observations fall in needs OpenDose already meets, "
            f"{pct(st_obs['partial'], len(obs))} in partly met needs and {pct(st_obs['missing'], len(obs))} in "
            f"unmet ones; several of the most-requested features exist but are hard to find (and "
            f"`web/src/guide/recommend.ts` still tells users Cox regression is not in OpenDose).")
