# Needs catalogue: schema

Every research agent writes two files under `docs/research/needs/raw/`:

- `<venue>.json`: an array of **observations**, one per distinct user
  problem or request found, with this shape:

```json
{
  "id": "stackexchange-stats-15982",
  "venue": "stats.stackexchange.com",
  "url": "https://stats.stackexchange.com/questions/15982",
  "date": "2011-09",
  "role": "PhD student, pharmacology (stated)",
  "software_named": ["GraphPad Prism"],
  "workflow": "time-course, two factors, repeated measures",
  "quote": "I have 3 treatment groups and 5 time-points ... Should I use two-way Repeated Measures ANOVA?",
  "problem": "Does not know whether the design is repeated measures and which ANOVA to run",
  "need": "A design-first test chooser that asks whether the same subjects were measured at every time point",
  "severity": "blocks the analysis",
  "signal": {"views": 9100, "votes": 12, "answers": 3},
  "tags": ["which-test", "repeated-measures", "two-way-anova"]
}
```

  `role`, `date` and `signal` may be null when the source does not show
  them. `quote` must be verbatim from the page (1–3 sentences; keep the
  user's spelling). `problem` and `need` are the agent's one-line reading.
  `severity` is one of: "blocks the analysis", "wrong result risk",
  "slows the work", "cosmetic / preference". `tags` use the controlled
  list in `TAGS.md` (add a tag there if none fits).

- `<venue>.md`: a readable digest: coverage (what was searched, how many
  threads read, what was unreachable), the ten most frequent tags with
  counts, the twenty strongest observations with quotes, and anything
  surprising.

Rules: only pages actually read, verbatim quotes only, no invented
sources, no circumvention of blocks (a site that returns 403 to the
tooling is skipped and listed as unreachable). Do not search for or
mention OpenDose.
