"""Kenward-Roger and Satterthwaite df in the nested t test, nested
one-way ANOVA and the nested mixed model (opendose.ddfm, checked against
R in test_ddfm.py; here: the options reach the analyses and give sensible
df)."""

import numpy as np
import pytest

from opendose import ddfm, mixed_nested, nested


def test_nested_t_and_anova():
    groups = [[[3.1, 2.9, 3.4], [4.2, 4.0], [3.6, 3.3, 3.9, 3.5]],
              [[5.1, 4.9, 5.3], [6.0, 5.8], [4.4, 4.6, 4.8, 4.2], [5.5, 5.6]]]
    base = nested.nested_t_test(groups)
    for ddf in ("kenward_roger", "satterthwaite"):
        res = nested.nested_t_test(groups, ddf=ddf)
        assert res["difference"] == pytest.approx(base["difference"], rel=1e-8)
        assert 4.5 < res["df"] < 5.5 and res["df"] != base["df"]
        assert res["df_method"] == ddfm.LABELS[ddf]
    three = groups + [[[7.0, 7.2], [6.5, 6.9, 6.7]]]
    res = nested.nested_one_way_anova(three, comparisons="tukey",
                                      ddf="kenward_roger")
    assert res["df_den"] > 0 and res["multiple_comparisons"]["df"] is None


def test_nested_mixed_model():
    rng = np.random.default_rng(7)
    y, a, b, u = [], [], [], []
    unit = 0
    for i in range(2):
        for j in range(2):
            for _ in range(3):
                eff = rng.normal(0, 1)
                for _ in range(int(rng.integers(2, 5))):
                    y.append(10 + i + 2 * j + eff + rng.normal())
                    a.append(i); b.append(j); u.append(unit)
                unit += 1
    facs = [("A", np.array(a), ["a0", "a1"]), ("B", np.array(b), ["b0", "b1"])]
    base = mixed_nested.fit_unit_model(np.array(y), facs, np.array(u),
                                       comparisons="sidak")
    kr = mixed_nested.fit_unit_model(np.array(y), facs, np.array(u),
                                     comparisons="sidak", ddf="kenward_roger")
    assert kr["df_method"] == "Kenward-Roger"
    for x, z in zip(base["anova"], kr["anova"]):
        assert x["term"] == z["term"] and z["dfd"] > 0
    assert all(c["df"] > 0 for c in kr["comparisons"]["comparisons"])
