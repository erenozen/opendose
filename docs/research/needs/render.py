"""Writers for the user-needs catalogue (called by build_catalogue.py).

Everything numeric here is computed from the observations; the prose that
interprets it lives in narrative.py.
"""
import json
import os
import re
from collections import Counter, defaultdict

import build_catalogue as B
import narrative as NR
from needs_rules import NEEDS, W, MERGE_SMALL, MIN_OBS

DATE = "2026-10-09"
HERE = B.HERE
ROADMAP = os.path.join(B.ROOT, "docs", "ROADMAP.md")
SEV_SHORT = {"blocks the analysis": "blocks", "wrong result risk": "wrong result",
             "slows the work": "slows", "cosmetic / preference": "cosmetic"}
STATUS_WORD = {"done": "done", "partial": "partial", "missing": "missing"}


# ------------------------------------------------------------------ helpers
def one_line(text):
    return re.sub(r"\s+", " ", text or "").strip()


def cell(text):
    return one_line(text).replace("|", "\\|")


def vlabel(v):
    return B.VENUE_LABEL.get(v, v)


def venue_mix(row, k=None):
    items = list(row["venues"].items())
    if k:
        items = items[:k]
    return ", ".join(f"{vlabel(v)} {n}" for v, n in items)


def sev_mix(row):
    return ", ".join(f"{SEV_SHORT[k]} {v}" for k, v in row["severity_mix"].items() if v)


def signal_text(row):
    s = row["signal"]
    parts = []
    if s["views"]:
        parts.append(f"{s['views']:,} page views")
    if s["votes"]:
        parts.append(f"{s['votes']:,} votes/likes")
    if s["video_views_distinct_videos"]:
        parts.append(f"{s['video_views_distinct_videos']:,} views of the videos commented on")
    if s["hn_thread_points_distinct"]:
        parts.append(f"{s['hn_thread_points_distinct']:,} HN thread points")
    return "; ".join(parts) if parts else "no engagement counts on these pages"


def quote_block(ev, obs_by_id):
    o = obs_by_id[ev["id"]]
    q = one_line(ev["quote"])
    who = f", {o['role']}" if o.get("role") else ""
    when = f", {o['date']}" if o.get("date") else ""
    gloss = ""
    if o["_venue"] == "non-english":
        gloss = f" *({one_line(o.get('problem'))})*"
    return f"> {q}\n>\n> — [{ev['venue']}{when}{who}]({ev['url']}) `{ev['id']}`{gloss}"


def improvement_kind(row):
    if row["opendose_status"] == "done":
        return "discoverability" if row["hidden"] else None
    return "research" if row["research"] else "build"


def improvements(rows):
    out = []
    for r in rows:
        k = improvement_kind(r)
        if k:
            out.append(dict(r, kind=k))
    return out


def wave_of(item):
    if item["kind"] == "research":
        return 4
    return {"S": 1, "M": 2, "L": 3}[item["effort"]]


# ------------------------------------------------------------------ needs.json
def write_json(obs, rows, members):
    obs_by_venue = Counter(o["_venue"] for o in obs)
    out = dict(
        generated=DATE,
        description=("User needs for OpenDose, clustered from the raw observations in raw/*.json by "
                     "build_catalogue.py with the rules in needs_rules.py."),
        counts=dict(observations=len(obs), needs=len(rows), venues=dict(sorted(obs_by_venue.items())),
                    assigned_by_keyword=sum(1 for o in obs if o["_rule"] == "keyword"),
                    assigned_by_tag_fallback=sum(1 for o in obs if o["_rule"] == "fallback"),
                    folded_small_needs=sum(1 for o in obs if o["_rule"] == "merged-small"),
                    observations_by_status=dict(Counter(r["opendose_status"] for r in rows for _ in r["_members"]))),
        priority_formula=NR.FORMULA_TEXT,
        severity_weights=B.SEVERITY_W,
        needs=[],
    )
    for r in rows:
        out["needs"].append(dict(
            rank=r["rank"], id=r["id"], title=r["title"], workflow=r["workflow"], tags=r["tags"],
            n_observations=r["n_observations"], venues=r["venues"], n_venues=r["n_venues"],
            severity_mix=r["severity_mix"], signal=r["signal"], evidence=r["evidence"],
            prevalence=r["prevalence"], opendose_status=r["opendose_status"],
            status_justification=r["status_justification"], gap=r["gap"], proposal=r["proposal"],
            effort=r["effort"], hidden_but_done=bool(r["hidden"] and r["opendose_status"] == "done"),
            research_only=r["research"], acceptance_test=r["acceptance_test"],
            priority_score=r["priority_score"],
            score_components=dict(log_n=round(__import__("math").log(1 + r["n_observations"]), 3),
                                  severity_mean=r["severity_mean"], sqrt_venues=round(r["n_venues"] ** 0.5, 3),
                                  signal_factor=r["signal_factor"]),
            observation_ids=r["_members"],
        ))
    with open(os.path.join(HERE, "needs.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)
        fh.write("\n")


# ------------------------------------------------------------- CATALOGUE.md
def write_catalogue(obs, rows, members):
    obs_by_id = {o["id"]: o for o in obs}
    by_venue = Counter(o["_venue"] for o in obs)
    st_obs = Counter()
    for r in rows:
        st_obs[r["opendose_status"]] += r["n_observations"]
    L = []
    L.append(f"# User-needs catalogue ({DATE})")
    L.append("")
    L.append(NR.intro(obs, rows, st_obs))
    L.append("")
    L.append("Files: [`needs.json`](needs.json) (the machine-readable catalogue), "
             "[`IMPROVEMENT-PLAN.md`](IMPROVEMENT-PLAN.md), [`by-venue.md`](by-venue.md), "
             "[`build_catalogue.py`](build_catalogue.py) + [`needs_rules.py`](needs_rules.py) "
             "(re-run: `python3 docs/research/needs/build_catalogue.py`).")
    L.append("")
    L.append("## Contents")
    L.append("")
    L.append("1. [Method](#method)")
    L.append("2. [How needs are ranked](#how-needs-are-ranked)")
    L.append("3. [The needs, by workflow](#the-needs-by-workflow)")
    L.append("4. [What the whole corpus says](#what-the-whole-corpus-says)")
    L.append("5. [Index of all needs](#index-of-all-needs)")
    L.append("")
    # ---- method
    L.append("## Method")
    L.append("")
    L.append("### Sources")
    L.append("")
    L.append("| Venue file | Observations | What it is |")
    L.append("|---|---:|---|")
    for v, n in sorted(by_venue.items(), key=lambda kv: -kv[1]):
        L.append(f"| `raw/{v}.json` | {n} | {cell(NR.VENUE_WHAT.get(v, vlabel(v)))} |")
    L.append(f"| **total** | **{len(obs):,}** | |")
    L.append("")
    L.append(NR.METHOD_TEXT)
    L.append("")
    L.append(NR.clustering_text(obs, rows))
    L.append("")
    # ---- ranking
    L.append("## How needs are ranked")
    L.append("")
    L.append(NR.FORMULA_TEXT)
    L.append("")
    # ---- needs by workflow
    L.append("## The needs, by workflow")
    L.append("")
    L.append("Workflows are ordered by the score of their highest-ranked need; needs within a workflow by "
             "score. Each need shows its counts, any prevalence figure from the literature, three quotes "
             "(verbatim, with links), OpenDose's status with the artefact that shows it, the gap and the proposal.")
    L.append("")
    wf_rows = defaultdict(list)
    for r in rows:
        wf_rows[r["workflow"]].append(r)
    wf_order = sorted(wf_rows, key=lambda w: -max(r["priority_score"] for r in wf_rows[w]))
    for wf in wf_order:
        rs = sorted(wf_rows[wf], key=lambda r: -r["priority_score"])
        tot = sum(r["n_observations"] for r in rs)
        L.append(f"### {wf}")
        L.append("")
        L.append(f"{len(rs)} needs, {tot} observations.")
        L.append("")
        for r in rs:
            L.append(f"#### {r['rank']}. {r['title']}")
            L.append("")
            L.append(f"`{r['id']}` · score **{r['priority_score']}** · {r['n_observations']} observations from "
                     f"{r['n_venues']} venues ({venue_mix(r, 6)}) · severity: {sev_mix(r)} · signal: {signal_text(r)}")
            L.append("")
            for p in r["prevalence"][:2]:
                L.append(f"- **Prevalence** ([{p['venue']}]({p['url']}), `{p['id']}`): “{one_line(p['statement'])}”")
            if r["prevalence"]:
                L.append("")
            for ev in r["evidence"][:3]:
                L.append(quote_block(ev, obs_by_id))
                L.append("")
            hidden = " (met, but hard to find)" if r["hidden"] and r["opendose_status"] == "done" else ""
            L.append(f"- **Status: {r['opendose_status']}**{hidden}. {r['status_justification']}")
            if r["gap"]:
                L.append(f"- **Gap:** {r['gap']}")
            if r["proposal"]:
                L.append(f"- **Proposal ({r['effort']}):** {r['proposal']}")
            L.append("")
    # ---- findings
    L.append("## What the whole corpus says")
    L.append("")
    L.append(NR.findings(obs, rows, members))
    L.append("")
    # ---- index
    L.append("## Index of all needs")
    L.append("")
    L.append("| Rank | Need | Workflow | Score | Obs | Venues | Status | Effort |")
    L.append("|---:|---|---|---:|---:|---:|---|---|")
    for r in rows:
        L.append(f"| {r['rank']} | {cell(r['title'])} `{r['id']}` | {cell(r['workflow'])} | {r['priority_score']} | "
                 f"{r['n_observations']} | {r['n_venues']} | {r['opendose_status']} | {r['effort']} |")
    L.append("")
    with open(os.path.join(HERE, "CATALOGUE.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L))


# -------------------------------------------------------- IMPROVEMENT-PLAN
def write_plan(obs, rows, members):
    imps = improvements(rows)
    top = imps[:40]
    L = []
    L.append(f"# Improvement plan from the user-needs catalogue ({DATE})")
    L.append("")
    L.append(NR.plan_intro(obs, rows, imps, top))
    L.append("")
    names = {1: "Wave 1: quick wins (effort S)", 2: "Wave 2: medium builds (effort M)",
             3: "Wave 3: large builds (effort L)", 4: "Wave 4: research first, then decide"}
    for w in (1, 2, 3, 4):
        items = [i for i in top if wave_of(i) == w]
        L.append(f"## {names[w]}")
        L.append("")
        if not items:
            L.append("Nothing in the top 40 falls here.")
            L.append("")
            continue
        for i in items:
            pos = top.index(i) + 1
            tag = {"discoverability": "**Already done: make it discoverable.** ",
                   "research": "**Research only.** ", "build": ""}[i["kind"]]
            L.append(f"### {pos}. {i['title']}")
            L.append("")
            L.append(f"`{i['id']}` · score {i['priority_score']} (need rank {i['rank']} of {len(rows)}) · "
                     f"{i['n_observations']} observations, {i['n_venues']} venues · status: "
                     f"{i['opendose_status']} · effort {i['effort']}")
            L.append("")
            L.append(f"- {tag}{i['proposal']}")
            if i["gap"] and i["kind"] != "discoverability":
                L.append(f"- Gap today: {i['gap']}")
            if i["kind"] == "discoverability":
                L.append(f"- Already there: {i['status_justification']}")
            L.append(f"- Acceptance test: {i['acceptance_test'] or NR.default_accept(i)}")
            L.append("")
    # summary table of the 40
    L.append("## The 40 at a glance")
    L.append("")
    L.append("| # | Wave | Need | Score | Obs | Kind | Effort |")
    L.append("|---:|---:|---|---:|---:|---|---|")
    for i in sorted(top, key=lambda i: (wave_of(i), -i["priority_score"])):
        L.append(f"| {top.index(i) + 1} | {wave_of(i)} | {cell(i['title'])} `{i['id']}` | {i['priority_score']} | "
                 f"{i['n_observations']} | {i['kind']} | {i['effort']} |")
    L.append("")
    rest = imps[40:]
    if rest:
        L.append("## Below the line")
        L.append("")
        L.append("Further improvements, in score order (see CATALOGUE.md for their evidence): " +
                 ", ".join(f"`{i['id']}` ({i['priority_score']})" for i in rest) + ".")
        L.append("")
    L.append("## Do not build (offer this instead)")
    L.append("")
    L.append(NR.do_not_build(obs))
    L.append("")
    with open(os.path.join(HERE, "IMPROVEMENT-PLAN.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L))


# -------------------------------------------------------------- by-venue
def write_by_venue(obs, rows, members):
    row_by_id = {r["id"]: r for r in rows}
    total = len(obs)
    overall = Counter(o["_need_id"] for o in obs)
    by_v = defaultdict(list)
    for o in obs:
        by_v[o["_venue"]].append(o)
    L = []
    L.append(f"# Needs by venue ({DATE})")
    L.append("")
    L.append(NR.VENUE_INTRO)
    L.append("")
    L.append("| Venue | Obs | Blocks | Wrong result | Slows | Cosmetic | Top need |")
    L.append("|---|---:|---:|---:|---:|---:|---|")
    for v in sorted(by_v, key=lambda v: -len(by_v[v])):
        l = by_v[v]
        s = Counter(o["severity"] for o in l)
        top = Counter(o["_need_id"] for o in l).most_common(1)[0][0]
        pct = lambda k: f"{round(100 * s[k] / len(l))}%"
        L.append(f"| {vlabel(v)} | {len(l)} | {pct('blocks the analysis')} | {pct('wrong result risk')} | "
                 f"{pct('slows the work')} | {pct('cosmetic / preference')} | `{top}` |")
    L.append("")
    for v in sorted(by_v, key=lambda v: -len(by_v[v])):
        l = by_v[v]
        c = Counter(o["_need_id"] for o in l)
        L.append(f"## {vlabel(v)} (`raw/{v}.json`, {len(l)} observations)")
        L.append("")
        L.append(NR.venue_paragraph(v, l, rows))
        L.append("")
        L.append("| # | Need | In this venue | Share of venue | Corpus share | Status |")
        L.append("|---:|---|---:|---:|---:|---|")
        for i, (nid, n) in enumerate(c.most_common(10), 1):
            r = row_by_id[nid]
            L.append(f"| {i} | {cell(r['title'])} `{nid}` | {n} | {100 * n / len(l):.1f}% | "
                     f"{100 * overall[nid] / total:.1f}% | {r['opendose_status']} |")
        L.append("")
        lifts = []
        for nid, n in c.items():
            if n >= 3:
                lift = (n / len(l)) / (overall[nid] / total)
                lifts.append((lift, nid, n))
        lifts.sort(reverse=True)
        sig = [f"`{nid}` ({n}, ×{lift:.1f})" for lift, nid, n in lifts[:5] if lift > 1.5]
        if sig:
            L.append("Most distinctive (needs with at least 3 observations here, by over-representation "
                     "against the whole corpus): " + ", ".join(sig) + ".")
            L.append("")
    with open(os.path.join(HERE, "by-venue.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L))


# -------------------------------------------------------------- ROADMAP
SECTION = "## User-needs catalogue (2026-10-09)"


def roadmap_section(obs, rows):
    import textwrap
    imps = improvements(rows)
    by_venue = Counter(o["_venue"] for o in obs)
    st_obs = Counter()
    for r in rows:
        st_obs[r["opendose_status"]] += r["n_observations"]
    wrap = lambda t: textwrap.fill(t, 72, break_on_hyphens=False, break_long_words=False)
    L = [SECTION, ""]
    L.append(wrap(NR.roadmap_summary(obs, rows, by_venue, st_obs)))
    L.append("")
    L.append(wrap("Files: [`CATALOGUE.md`](research/needs/CATALOGUE.md), "
                  "[`IMPROVEMENT-PLAN.md`](research/needs/IMPROVEMENT-PLAN.md), "
                  "[`by-venue.md`](research/needs/by-venue.md), [`needs.json`](research/needs/needs.json) "
                  "(built by `docs/research/needs/build_catalogue.py`)."))
    L.append("")
    L.append(wrap("Top 15 proposals by priority score (need id, score and observation count in "
                  "brackets; \"discoverable\" = already built, make it findable):"))
    for i in imps[:15]:
        kind = " (discoverable)" if i["kind"] == "discoverability" else (" (research)" if i["kind"] == "research" else "")
        item = f"- [ ] {i['proposal']} [`{i['id']}`, {i['priority_score']}, {i['n_observations']} obs]{kind}"
        L.append(textwrap.fill(item, 72, subsequent_indent="      ", break_on_hyphens=False,
                               break_long_words=False))
    L.append("")
    return "\n".join(L)


def update_roadmap(obs, rows):
    with open(ROADMAP, encoding="utf-8") as fh:
        text = fh.read()
    section = roadmap_section(obs, rows)
    if SECTION in text:
        start = text.index(SECTION)
        nxt = text.find("\n## ", start + len(SECTION))
        end = nxt + 1 if nxt != -1 else len(text)
        text = text[:start] + section + "\n" + text[end:]
    else:
        anchor = "\n## Next up"
        idx = text.index(anchor)
        text = text[:idx] + "\n" + section + text[idx:]
    with open(ROADMAP, "w", encoding="utf-8") as fh:
        fh.write(text)


def write_all(obs, rows, members):
    write_json(obs, rows, members)
    write_catalogue(obs, rows, members)
    write_plan(obs, rows, members)
    write_by_venue(obs, rows, members)
    update_roadmap(obs, rows)
    print(f"wrote needs.json, CATALOGUE.md, IMPROVEMENT-PLAN.md, by-venue.md and the ROADMAP section "
          f"({len(obs)} observations, {len(rows)} needs)")
