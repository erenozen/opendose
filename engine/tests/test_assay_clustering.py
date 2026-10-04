"""Clustering for heat maps (assay_clustering).

Hierarchical clustering is checked against scipy.cluster.hierarchy
(identical linkage matrices, leaf orders, dendrogram segments and flat
clusters for every linkage and distance); the silhouette against a hand
computation; k-means and the k-selection criteria on separated groups.
"""

import math

import numpy as np
import pytest
from scipy.cluster import hierarchy as sch
from scipy.spatial.distance import pdist

from opendose import api, assay_clustering as ac

SCIPY_METRIC = {"euclidean": "euclidean", "manhattan": "cityblock",
                "correlation": "correlation"}


@pytest.mark.parametrize("n", [2, 3, 9, 41])
@pytest.mark.parametrize("metric", list(SCIPY_METRIC))
@pytest.mark.parametrize("method", list(ac.LINKAGES))
def test_linkage_identical_to_scipy(n, metric, method):
    rng = np.random.default_rng(n * 7 + len(method) + len(metric))
    X = rng.normal(size=(n, 5))
    D = ac.distance_matrix(X, metric)
    Z = ac.linkage(D, method)
    Zs = sch.linkage(pdist(X, SCIPY_METRIC[metric]), method)
    np.testing.assert_allclose(Z, Zs, rtol=1e-12, atol=1e-12)
    assert ac.leaf_order(Z) == list(sch.leaves_list(Zs))


@pytest.mark.parametrize("metric", list(SCIPY_METRIC))
def test_distance_matrix_matches_pdist(metric):
    X = np.random.default_rng(1).normal(size=(15, 4))
    D = ac.distance_matrix(X, metric)
    iu = np.triu_indices(15, 1)
    np.testing.assert_allclose(D[iu], pdist(X, SCIPY_METRIC[metric]),
                               rtol=1e-12, atol=1e-14)


def test_dendrogram_segments_match_scipy():
    X = np.random.default_rng(5).normal(size=(12, 3))
    Z = ac.linkage(ac.distance_matrix(X), "average")
    dg = ac.dendrogram(Z)
    ref = sch.dendrogram(sch.linkage(pdist(X), "average"), no_plot=True)
    mine = sorted(tuple(np.round([5 + 10 * v for v in xs] + ys, 9))
                  for xs, ys in zip(dg["x"], dg["y"]))
    theirs = sorted(tuple(np.round(list(xs) + list(ys), 9))
                    for xs, ys in zip(ref["icoord"], ref["dcoord"]))
    assert mine == theirs
    assert dg["leaf_order"] == ref["leaves"]


def test_cut_tree_partition_matches_fcluster():
    X = np.random.default_rng(9).normal(size=(20, 2))
    Z = ac.linkage(ac.distance_matrix(X), "ward")
    for k in (2, 3, 5):
        mine = ac.cut_tree(Z, k)
        ref = sch.fcluster(sch.linkage(pdist(X), "ward"), k, "maxclust")
        # same partition up to label names
        pairs = {(a, b) for a, b in zip(mine, ref)}
        assert len(pairs) == k == len(set(mine))


def test_row_zscore_and_centering():
    M = np.array([[1.0, 2.0, 3.0], [10.0, 10.0, 16.0], [4.0, 4.0, 4.0]])
    Z = ac.scale_rows(M, "zscore")
    np.testing.assert_allclose(Z[:2].mean(axis=1), 0, atol=1e-15)
    np.testing.assert_allclose(Z[:2].std(axis=1, ddof=1), 1)
    np.testing.assert_allclose(Z[2], 0)            # constant row -> zeros
    np.testing.assert_allclose(ac.scale_rows(M, "center")[0], [-1, 0, 1])


def test_silhouette_hand_computed():
    X = np.array([[0.0], [1.0], [10.0], [12.0]])
    s = ac.silhouette(X, [0, 0, 1, 1])
    expected = [10 / 11, 9 / 10, 7.5 / 9.5, 9.5 / 11.5]
    np.testing.assert_allclose(s["widths"], expected, rtol=1e-12)
    assert s["mean"] == pytest.approx(np.mean(expected), rel=1e-12)
    # singleton cluster: width 0 (Rousseeuw's convention)
    s2 = ac.silhouette(np.array([[0.0], [1.0], [10.0]]), [0, 0, 1])
    assert s2["widths"][2] == 0.0


def _blobs(seed=0):
    rng = np.random.default_rng(seed)
    centres = np.array([[0, 0], [8, 0], [0, 8]])
    return np.vstack([c + rng.normal(0, 0.5, size=(15, 2)) for c in centres])


def test_kmeans_recovers_groups_and_is_seeded():
    X = _blobs()
    a = ac.kmeans(X, 3, seed=4)
    b = ac.kmeans(X, 3, seed=4)
    assert a == b
    labels = np.array(a["labels"])
    for g in range(3):
        assert len(set(labels[g * 15:(g + 1) * 15])) == 1
    # within SS equals the hand sum of squared distances to the centres
    C = np.array(a["centers"])
    wss = sum(float(np.sum((X[labels == c] - C[c]) ** 2)) for c in range(3))
    assert a["total_within_ss"] == pytest.approx(wss, rel=1e-12)
    assert a["between_ss"] + a["total_within_ss"] == pytest.approx(
        a["total_ss"], rel=1e-12)


def test_choose_k_finds_three_groups():
    res = ac.choose_k(_blobs(1), k_max=6, seed=2, n_reference=10)
    assert res["suggested"]["silhouette"] == 3
    assert res["suggested"]["gap"] == 3
    w = [r["within_ss"] for r in res["rows"]]
    assert all(a >= b - 1e-9 for a, b in zip(w, w[1:]))


def test_api_cluster_heatmap_reorders_matrix():
    rng = np.random.default_rng(3)
    vals = rng.normal(size=(6, 4))
    res = api.analyze({"analysis": "cluster_heatmap",
                       "data": {"values": vals.tolist(),
                                "row_names": list("abcdef")},
                       "options": {"method": "complete", "scale": "none",
                                   "kmeans": {"k": 2, "seed": 1},
                                   "choose_k": {"k_max": 3,
                                                "n_reference": 3}}})
    assert "error" not in res, res.get("error")
    Zs = sch.linkage(pdist(vals), "complete")
    assert res["row_order"] == list(sch.leaves_list(Zs))
    np.testing.assert_allclose(res["rows"]["linkage"], Zs)
    np.testing.assert_allclose(
        res["matrix"], vals[np.ix_(res["row_order"], res["column_order"])])
    assert res["row_names"] == [list("abcdef")[i] for i in res["row_order"]]
    assert len(res["kmeans"]["labels"]) == 6
    assert math.isfinite(res["kmeans"]["silhouette"]["mean"])
    assert [r["k"] for r in res["choose_k"]["rows"]] == [1, 2, 3]
