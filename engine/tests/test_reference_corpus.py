"""The external reference corpus as a permanent test.

One test per reference quantity of docs/validation/datasets/manifest.json
(plus docs/validation/private/datasets/manifest.json when that local,
licence-flagged folder is present). Each dataset is run once through
opendose.api.analyze by engine/tests/corpus/run_corpus.py (which holds the
payload builders and the quantity -> result-path mapping) and cached for
the session.

* pass: the engine value is within the manifest tolerance of the published
  value.
* skip: the engine has no output for the quantity (the reason says which
  feature is missing).
* xfail(strict=True): a known, classified failure listed in
  engine/tests/corpus/expected_failures.json, with its category ((a)
  mapping, (b) reference precision, (c) engine discrepancy, (d) reference
  problem) and diagnosis. An engine fix that makes one pass turns it into
  a strict XPASS failure: regenerate the list with
  `run_corpus.py --update-expected` and the results with `run_corpus.py`.
"""

import importlib.util
import json
import sys
from pathlib import Path

import pytest

_RUNNER = Path(__file__).resolve().parent / "corpus" / "run_corpus.py"
_spec = importlib.util.spec_from_file_location("opendose_run_corpus",
                                               _RUNNER)
rc = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = rc
_spec.loader.exec_module(rc)

_EXPECTED = {(f["dataset"], f["quantity"]): f for f in json.loads(
    rc.EXPECTED_FAILURES.read_text())["failures"]}


def _cases():
    cases = []
    for entry in rc.manifest_entries(include_private=rc.PRIVATE_DIR.exists()):
        for ref in entry["reference"]:
            key = (entry["id"], ref["quantity"])
            marks = []
            known = _EXPECTED.get(key)
            if known:
                marks.append(pytest.mark.xfail(
                    strict=True,
                    reason=f"({known['category']}) {known['reason']}"))
            cases.append(pytest.param(*key, marks=marks,
                                      id=f"{key[0]}::{key[1]}"))
    return cases


@pytest.mark.parametrize("dataset,quantity", _cases())
def test_reference_quantity(dataset, quantity):
    records, _notes, _secs = rc.evaluate(dataset)
    rec = next(r for r in records if r["quantity"] == quantity)
    if rec["status"] == "unmapped":
        pytest.skip(f"unmapped: {rec['reason']}")
    assert rec["status"] != "error", rec.get("reason")
    assert rec["status"] == "pass", (
        f"{dataset} {quantity}: engine {rec['ours']!r} vs reference "
        f"{rec['reference']!r} (tolerance {rec['tolerance']}, "
        f"path {rec['path']})")
