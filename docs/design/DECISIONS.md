# Design decisions

Every direction decision of the 2026-11 UI/UX overhaul, with what was
rejected and why. Agents read this before changing a surface; nobody
reopens a decision here without new evidence (emil-prep-for-prod hard
rule 11). Rulings that settle conflicts between skills live in
`UI-UX-PLAN.md` section 2 and are not repeated here.

## 0. Product verdict

Written by the lead from `docs/research/needs/` (3,666 observations, 178
needs) following emil-product-thinking's verdict format, because no
interview was run before the session.

1. **The one good idea.** Paste the numbers a bench experiment produced and
   get the right fit or test, with its caveats stated plainly, in a browser
   tab, free, with nothing to install or license (needs `ic50-no-code-fit`
   rank 6, `no-code-approachable` 9, `design-first-test-chooser` 1,
   `free-access` 5, `runs-anywhere` 18).
2. **The chain of must-be-trues.**
   1. **(under test now)** A scientist with data on the clipboard sees a
      fitted curve or a test result within one screen and a few actions of
      landing, before deciding to leave.
   2. They trust it: the number agrees with what they know, and the caveats
      (small n, ambiguous fit, extrapolation) are visible next to it.
   3. The figure and the methods sentence are good enough to drop into a lab
      meeting or a paper without redoing them elsewhere.
   4. They come back, and they send it to a colleague (project file, share
      link, `.pzfx` round trip).
3. **Biggest unanswered risk.** The 30 MB runtime download sits between
   paste and result on a first visit, and the result then lands below the
   fold (audit RS-01: first results card at y = 944 in a 900 px window).
   Cheapest test: stage a cold start on a throttled connection, count the
   actions and seconds from landing to a visible fitted curve, and compare
   with the redesigned path.
4. **This month.** Executed at 100%: the path from landing to the first
   result (start screen, paste, engine boot, the results sheet's top
   screen) and the feedback that tells a user what just happened. Half
   built on purpose: rare dialogs, layout sheets, assay wizard internals and
   the navigator's long tail get tokens, primitives and accessibility fixes
   but no new design.
5. **Principles the product currently violates.**
   - 6 (count the steps): the start screen offers five entry routes and eight
     table cards before the first result; the result itself is below the
     fold.
   - 9 (do less, remove the switch): seven banner styles, three menu
     implementations and 23 button classes are seven ways of saying one
     thing.
   - 12 (design the system, not the mockup): no screen was reviewed with
     80-character names, 40 columns or a failed fit before this pass.
   - 18 (quality from irrational investments): the first thing a phone user
     meets is an input that zooms the page and a header that jumps.
6. **What this did not resolve.** No named user was interviewed, so the
   person in link 1 is a composite. Whether phones are used to analyse or
   only to read shared results is unknown; this pass treats the phone as a
   reading and light-editing device and keeps desktop the place for
   analysis.

**Step count, landing to first fitted curve (baseline, measured in the
code at 177053f):** paste route = focus the paste box, paste, press
"Create XY table" (3 actions), wait for the engine, scroll to the results
card (1 more action at 1400 x 900). Four actions plus the cold-start wait.
