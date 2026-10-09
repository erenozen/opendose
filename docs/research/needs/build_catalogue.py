#!/usr/bin/env python3
"""Build the user-needs catalogue from the raw observations.

Reads every docs/research/needs/raw/*.json (any new venue file, e.g. a
future reddit.json, is picked up automatically), assigns each observation
to one need with the explicit rules in needs_rules.py, and writes:

  needs.json, CATALOGUE.md, IMPROVEMENT-PLAN.md, by-venue.md   (this folder)
  the "User-needs catalogue (2026-10-09)" section of docs/ROADMAP.md

Run from anywhere:  python3 docs/research/needs/build_catalogue.py
Options: --check  (print the assignment diagnostics and write nothing)

Nothing here is hand-counted: every count, venue mix, signal and quote in
the outputs comes from the raw files. The prose that interprets the counts
(the cross-venue findings, venue notes and do-not-build list) is in
narrative.py and refers to computed numbers through placeholders.
"""
import glob
import json
import math
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from needs_rules import NEEDS, FALLBACK, MERGE_SMALL, MIN_OBS  # noqa: E402

RAW = os.path.join(HERE, "raw")

# Observations left out on purpose, with the reason. None at present: the
# pt/es Stack Overflow observations were read through the official Stack
# Exchange API, the same documented path used for every Stack Exchange
# site in this catalogue, and are kept.
EXCLUDE_RULES = []
EXCLUDED = []
ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))

SEVERITY_W = {"blocks the analysis": 3.0, "wrong result risk": 2.5,
              "slows the work": 1.5, "cosmetic / preference": 0.5}
# Engagement on the observation itself.
VOTE_KEYS = ("votes", "likes", "reactions", "upvotes", "favourites", "boosts")
VIEW_KEYS = ("views", "views_displayed", "reads")
# Popularity of the page the observation sits on (a video, an HN thread):
# counted once per distinct page in a need, not once per comment.
CONTEXT_KEYS = ("video_views", "thread_points")
FIRST_PERSON = {"stackexchange", "github", "youtube", "forums", "hackernews", "social",
                "reviews", "non-english", "blogs", "reddit"}
VENUE_LABEL = {
    "stackexchange": "Stack Exchange", "github": "GitHub issues", "graphpad-support-mirror": "GraphPad support pages",
    "youtube": "YouTube comments", "literature": "Methods literature", "competitor-signals": "Competitor trackers",
    "reviews": "Software reviews", "consulting-faqs": "Statistics-consulting FAQs", "blogs": "Lab blogs",
    "journal-requirements": "Journal requirements", "forums": "Forums (image.sc, Bioconductor, Galaxy)",
    "courses": "Courses and workshops", "non-english": "Non-English communities", "hackernews": "Hacker News",
    "social": "Mastodon / fediverse", "reddit": "Reddit",
}


# --------------------------------------------------------------------- load
def load():
    del EXCLUDED[:]
    obs = []
    for path in sorted(glob.glob(os.path.join(RAW, "*.json"))):
        venue = os.path.basename(path)[:-5]
        with open(path, encoding="utf-8") as fh:
            for o in json.load(fh):
                o = dict(o)
                o["_venue"] = venue
                o["_tags"] = list(o.get("tags") or [])
                o["_need"] = (o.get("need") or "").lower()
                o["_problem"] = (o.get("problem") or "").lower()
                o["_other"] = ((o.get("quote") or "") + " " + (o.get("workflow") or "")).lower()
                reason = next((r for r, f in EXCLUDE_RULES if f(o)), None)
                if reason:
                    EXCLUDED.append((o["id"], reason))
                    continue
                obs.append(o)
    return obs


# ------------------------------------------------------------------- assign
COMPILED = []
for n in NEEDS:
    COMPILED.append(dict(
        need=n,
        kw=[re.compile(p, re.I) for p in n["kw"]],
        req=re.compile(n["req"], re.I) if n["req"] else None,
        excl=re.compile(n["excl"], re.I) if n["excl"] else None,
        tags=set(n["tags"]),
    ))
BY_ID = {n["id"]: n for n in NEEDS}
assert len(BY_ID) == len(NEEDS), "duplicate need id"
for t, nid in FALLBACK.items():
    assert nid in BY_ID, (t, nid)


def score(c, o):
    kn = sum(1 for p in c["kw"] if p.search(o["_need"]))
    kp = sum(1 for p in c["kw"] if p.search(o["_problem"]))
    tag_hits = sum(1 for t in o["_tags"] if t in c["tags"])
    if kn == 0 and (kp == 0 or tag_hits == 0):
        return None
    if c["excl"] is not None and c["excl"].search(o["_need"]):
        return None
    if c["req"] is not None:
        hay = " ".join([o["_need"], o["_problem"], (o.get("workflow") or "").lower(), " ".join(o["_tags"])])
        if not c["req"].search(hay):
            return None
    ko = sum(1 for p in c["kw"] if p.search(o["_other"]))
    s = 3.0 * kn + 1.5 * kp + 0.5 * ko
    if o["_tags"]:
        if o["_tags"][0] in c["tags"]:
            s += 2.5
        s += 1.0 * sum(1 for t in o["_tags"][1:] if t in c["tags"])
    if c["need"]["generic"]:
        s -= 3.0
    return s


def assign(obs):
    for o in obs:
        best, best_s = None, None
        for c in COMPILED:
            s = score(c, o)
            if s is not None and (best_s is None or s > best_s):
                best, best_s = c["need"]["id"], s
        rule = "keyword"
        if best is None:
            rule = "fallback"
            for t in o["_tags"]:
                if t in FALLBACK:
                    best = FALLBACK[t]
                    break
            if best is None:
                best = "no-code-approachable"
        o["_need_id"], o["_score"], o["_rule"] = best, best_s, rule
    counts = Counter(o["_need_id"] for o in obs)
    for o in obs:
        nid = o["_need_id"]
        if nid in MERGE_SMALL and counts[nid] < MIN_OBS:
            o["_need_id"], o["_rule"] = MERGE_SMALL[nid], "merged-small"
    return obs


# ------------------------------------------------------------------ metrics
def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else 0


def obs_signal(o):
    s = o.get("signal") if isinstance(o.get("signal"), dict) else {}
    votes = sum(num(s.get(k)) for k in VOTE_KEYS)
    views = sum(num(s.get(k)) for k in VIEW_KEYS)
    ctx = {k: num(s.get(k)) for k in CONTEXT_KEYS if num(s.get(k))}
    return votes, views, ctx


def page_key(o):
    url = o.get("url") or ""
    m = re.search(r"[?&]v=([\w-]+)", url)
    return m.group(1) if m else url.split("#")[0]


def obs_rank(o):
    votes, views, ctx = obs_signal(o)
    r = SEVERITY_W.get(o.get("severity"), 1.0)
    r += math.log10(1 + votes + views / 100.0)
    # the popularity of the video or thread a comment sits on says little about the comment
    r += 0.5 * math.log10(1 + sum(ctx.values()) / 10000.0)
    if o["_venue"] in FIRST_PERSON:
        r += 1.0
    if o.get("role"):
        r += 0.5
    # prefer the person with the problem speaking: first person or a question, not an answer
    if re.search(r"\b(I|I'm|I've|my|we|our)\b|\?", o.get("quote") or ""):
        r += 0.75
    if re.search(r"-a\d", o["id"]):
        r -= 0.5
    return r


PCT = re.compile(r"\d+(?:\.\d+)?\s?%|\d+ of (?:the )?\d+|\bone in \w+|\d+(?:\.\d+)?-fold")


def prevalence(members):
    out = []
    for o in sorted(members, key=lambda o: (o["_venue"] != "literature", o["id"])):
        if o["_venue"] not in ("literature", "journal-requirements", "courses", "consulting-faqs", "blogs"):
            continue
        q = o.get("quote") or ""
        s = o.get("signal") if isinstance(o.get("signal"), dict) else {}
        nums = {k: v for k, v in s.items() if isinstance(v, (int, float)) and not isinstance(v, bool)
                and re.search(r"pct|share|papers|studies|articles|compliance|rate|n_|median|false|incorrect|correct", k)}
        if PCT.search(q) or nums:
            out.append(dict(id=o["id"], venue=o["venue"], statement=q, numbers=nums, url=o["url"]))
    return out[:5]


def evidence(members, k_min=10, k_max=25):
    ranked = sorted(members, key=lambda o: -obs_rank(o))
    # round-robin across venues so one venue cannot fill the list
    by_v = defaultdict(list)
    for o in ranked:
        by_v[o["_venue"]].append(o)
    order = sorted(by_v, key=lambda v: -obs_rank(by_v[v][0]))
    picked = []
    target = min(len(members), max(k_min, min(k_max, 12 + len(members) // 10)))
    i = 0
    while len(picked) < target:
        progressed = False
        for v in order:
            if i < len(by_v[v]):
                picked.append(by_v[v][i])
                progressed = True
                if len(picked) >= target:
                    break
        if not progressed:
            break
        i += 1
    # keep the round-robin order: the first entries come from different venues
    return [dict(id=o["id"], venue=o["venue"], venue_file=o["_venue"], date=o.get("date"),
                 role=o.get("role"), severity=o.get("severity"), quote=o.get("quote"), url=o.get("url"))
            for o in picked]


def build(obs):
    members = defaultdict(list)
    for o in obs:
        members[o["_need_id"]].append(o)
    rows = []
    for n in NEEDS:
        m = members.get(n["id"], [])
        if not m and n["id"] in MERGE_SMALL:
            continue
        venues = Counter(o["_venue"] for o in m)
        sev = Counter(o.get("severity") for o in m)
        tags = Counter(t for o in m for t in o["_tags"])
        votes = views = 0
        ctx_pages = {}
        for o in m:
            v1, v2, ctx = obs_signal(o)
            votes += v1
            views += v2
            for k, val in ctx.items():
                key = (k, page_key(o))
                ctx_pages[key] = max(ctx_pages.get(key, 0), val)
        ctx_tot = Counter()
        for (k, _), val in ctx_pages.items():
            ctx_tot[k] += val
        sev_mean = (sum(SEVERITY_W.get(o.get("severity"), 1.0) for o in m) / len(m)) if m else 0.0
        sig_score = math.log10(1 + votes + views / 100.0 + ctx_tot["video_views"] / 1000.0 + ctx_tot["thread_points"])
        rows.append(dict(
            id=n["id"], title=n["title"], workflow=n["workflow"],
            tags=[t for t, _ in tags.most_common(6)],
            n_observations=len(m),
            venues=dict(venues.most_common()),
            n_venues=len(venues),
            severity_mix={k: sev.get(k, 0) for k in SEVERITY_W},
            signal=dict(votes=votes, views=views, video_views_distinct_videos=ctx_tot["video_views"],
                        hn_thread_points_distinct=ctx_tot["thread_points"]),
            _sev_mean=sev_mean, _sig=sig_score,
            evidence=evidence(m) if m else [],
            prevalence=prevalence(m),
            opendose_status=n["status"], status_justification=n["why"],
            gap=n["gap"], proposal=n["proposal"], effort=n["effort"],
            hidden=n["hidden"], research=n["research"], acceptance_test=n["accept"],
            _members=[o["id"] for o in m],
        ))
    max_sig = max(r["_sig"] for r in rows) or 1.0
    for r in rows:
        f = math.log(1 + r["n_observations"])
        g = 1.0 + r["_sig"] / max_sig
        r["_raw"] = f * r["_sev_mean"] * math.sqrt(r["n_venues"]) * g
    max_raw = max(r["_raw"] for r in rows) or 1.0
    for r in rows:
        r["priority_score"] = round(100.0 * r["_raw"] / max_raw, 1)
        r["severity_mean"] = round(r["_sev_mean"], 2)
        r["signal_factor"] = round(1.0 + r["_sig"] / max_sig, 3)
    rows.sort(key=lambda r: (-r["priority_score"], r["id"]))
    for i, r in enumerate(rows, 1):
        r["rank"] = i
    return rows, members


# ---------------------------------------------------------------- diagnose
def diagnose(obs, rows, members, show=None):
    print(f"{len(obs)} observations, {len(rows)} needs")
    print("fallback-assigned:", sum(1 for o in obs if o["_rule"] == "fallback"))
    empty = [r["id"] for r in rows if r["n_observations"] == 0]
    print("empty needs:", empty)
    small = [(r["id"], r["n_observations"]) for r in rows if 0 < r["n_observations"] < 3]
    print("needs with <3 obs:", small)
    for r in rows:
        print(f'{r["rank"]:>3} {r["priority_score"]:>5} {r["n_observations"]:>4} v{r["n_venues"]:>2} '
              f'{r["opendose_status"][:4]} {r["id"]}')
    if show:
        for nid in show:
            print(f"\n=== {nid}")
            for o in members.get(nid, []):
                print(f'  [{o["_rule"][0]} {o["_score"]}] {o["id"][:30]} | {",".join(o["_tags"][:3])} | {o.get("need","")[:110]}')


if __name__ == "__main__":
    args = sys.argv[1:]
    obs = assign(load())
    rows, members = build(obs)
    if "--check" in args:
        show = [a for a in args if not a.startswith("--")]
        diagnose(obs, rows, members, show=show)
        sys.exit(0)
    from render import write_all  # noqa: E402
    write_all(obs, rows, members)
