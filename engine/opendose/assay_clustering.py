"""Clustering for heat maps: hierarchical (agglomerative) clustering with
dendrograms, and k-means with the usual criteria for choosing k.

References:
- Lance & Williams (1967), Computer Journal 9:373: every linkage below is
  one recurrence d(k, i+j) = a_i d(k,i) + a_j d(k,j) + b d(i,j) +
  c |d(k,i) - d(k,j)| applied to the merged pair. Single (nearest
  neighbour), complete (furthest neighbour), average (UPGMA), weighted
  (WPGMA), centroid (UPGMC) and median (WPGMC) take the coefficients of
  Lance & Williams; Ward (1963, J Am Stat Assoc 58:236) uses the
  Lance-Williams form of the increase in within-cluster sum of squares
  on Euclidean distances (Wishart 1969). The distances are not squared:
  the update is applied as in Muellner (2011, arXiv:1109.2378), the
  convention of scipy.cluster.hierarchy, so a Ward height is
  sqrt(2 * increase in SS).
- Linkage output follows the scipy / MATLAB matrix convention: one row
  per merge [cluster a, cluster b, height, size], merges sorted by
  height, clusters 0..n-1 the observations and n+i the cluster formed
  by row i, smaller label first. Leaf order is the left-to-right order
  of that tree (scipy's leaves_list); the dendrogram coordinates place
  leaf i of the order at x = i and every merge at the mean x of its two
  children (the U-shaped segments of a drawn dendrogram).
- Distances: Euclidean, Manhattan (city block) and Pearson correlation
  distance 1 - r. Optional standardisation per row or per column before
  clustering: centring (subtract the mean) or z-score (subtract the
  mean, divide by the SD with n - 1), as heat-map tools offer ("row
  z-score"). Prism 10.3 added hierarchical clustering with linkage,
  distance and standardisation choices (statistics guide, hierarchical
  clustering pages); this module follows the published algorithms and
  does not claim to reproduce Prism's numbers.
- k-means: Lloyd's algorithm from k-means++ seeds (Arthur & Vassilvitskii
  2007), seeded and restarted n_init times, keeping the smallest total
  within-cluster sum of squares. Choosing k: the elbow of the within-SS
  curve (Thorndike 1953), the mean silhouette width (Rousseeuw 1987,
  J Comput Appl Math 20:53; s(i) = (b - a)/max(a, b), 0 for a singleton
  cluster) and the gap statistic (Tibshirani, Walther & Hastie 2001,
  JRSS B 63:411: reference data uniform over the bounding box of the
  data, Gap(k) = mean log W*_k - log W_k, s_k = sd * sqrt(1 + 1/B), the
  chosen k is the smallest with Gap(k) >= Gap(k+1) - s_(k+1)).
"""

from __future__ import annotations

import math

import numpy as np

LINKAGES = ("single", "complete", "average", "weighted", "centroid",
            "median", "ward")
DISTANCES = ("euclidean", "manhattan", "correlation")
SCALINGS = ("none", "center", "zscore")


# ------------------------------------------------------------ preparation

def _matrix(values) -> np.ndarray:
    M = np.array([[math.nan if v is None else float(v) for v in row]
                  for row in values], dtype=float)
    if M.ndim != 2 or M.size == 0:
        raise ValueError("clustering needs a non-empty rows x columns table")
    if not np.all(np.isfinite(M)):
        raise ValueError("clustering needs a complete table (no missing "
                         "values)")
    return M


def scale_rows(M: np.ndarray, how: str) -> np.ndarray:
    """Centre or z-score each row (n - 1 SD). A constant row z-scores to
    zeros."""
    if how not in SCALINGS:
        raise ValueError(f"unknown scaling: {how}")
    if how == "none":
        return M.copy()
    out = M - M.mean(axis=1, keepdims=True)
    if how == "zscore":
        sd = M.std(axis=1, ddof=1, keepdims=True) if M.shape[1] > 1 else \
            np.zeros((M.shape[0], 1))
        sd = np.where(sd > 0, sd, 1.0)
        out = out / sd
    return out


def distance_matrix(M: np.ndarray, metric: str = "euclidean") -> np.ndarray:
    """Square distance matrix between the rows of M."""
    if metric not in DISTANCES:
        raise ValueError(f"unknown distance: {metric}")
    n = M.shape[0]
    if metric in ("euclidean", "manhattan"):
        D = np.zeros((n, n))
        for i in range(n):   # one row at a time keeps memory at O(n^2)
            diff = M - M[i]
            D[i] = (np.sqrt(np.sum(diff * diff, axis=1))
                    if metric == "euclidean" else
                    np.sum(np.abs(diff), axis=1))
    else:
        C = M - M.mean(axis=1, keepdims=True)
        norms = np.sqrt(np.sum(C * C, axis=1))
        if np.any(norms == 0):
            raise ValueError("correlation distance is undefined for a "
                             "constant row")
        U = C / norms[:, None]
        D = 1.0 - U @ U.T
        D = np.clip(D, 0.0, 2.0)
    np.fill_diagonal(D, 0.0)
    return (D + D.T) / 2.0


# ------------------------------------------------------- hierarchical

def _lance_williams(method, d_ki, d_kj, d_ij, n_i, n_j, n_k):
    """Distance from every cluster k to the union of i and j."""
    if method == "single":
        return np.minimum(d_ki, d_kj)
    if method == "complete":
        return np.maximum(d_ki, d_kj)
    if method == "average":
        return (n_i * d_ki + n_j * d_kj) / (n_i + n_j)
    if method == "weighted":
        return 0.5 * (d_ki + d_kj)
    if method == "centroid":
        n = n_i + n_j
        v = ((n_i * d_ki * d_ki + n_j * d_kj * d_kj) / n
             - n_i * n_j * d_ij * d_ij / (n * n))
        return np.sqrt(np.clip(v, 0.0, None))
    if method == "median":
        v = 0.5 * (d_ki * d_ki + d_kj * d_kj) - 0.25 * d_ij * d_ij
        return np.sqrt(np.clip(v, 0.0, None))
    # ward
    t = 1.0 / (n_i + n_j + n_k)
    v = ((n_k + n_i) * t * d_ki * d_ki + (n_k + n_j) * t * d_kj * d_kj
         - n_k * t * d_ij * d_ij)
    return np.sqrt(np.clip(v, 0.0, None))


def linkage(D: np.ndarray, method: str = "average") -> np.ndarray:
    """Agglomerative clustering of a square distance matrix by repeated
    merging of the closest pair with the Lance-Williams update (nearest-
    neighbour list, O(n^2) typical). Returns the (n-1) x 4 linkage
    matrix [a, b, height, size] in the scipy convention."""
    if method not in LINKAGES:
        raise ValueError(f"unknown linkage: {method}")
    D = np.array(D, dtype=float)
    n = D.shape[0]
    if n < 2:
        return np.zeros((0, 4))
    W = D.copy()
    np.fill_diagonal(W, np.inf)
    size = np.ones(n)
    active = np.ones(n, dtype=bool)
    rep = np.arange(n)                # an observation inside each slot
    nn = np.argmin(W, axis=1)
    nnd = W[np.arange(n), nn]
    merges = []
    for _ in range(n - 1):
        i = int(np.argmin(np.where(active, nnd, np.inf)))
        j = int(nn[i])
        h = float(W[i, j])
        merges.append((rep[i], rep[j], h, size[i] + size[j]))
        others = active.copy()
        others[[i, j]] = False
        new = _lance_williams(method, W[:, i], W[:, j], h, size[i], size[j],
                              size)
        new = np.where(others, new, np.inf)
        W[i, :] = new
        W[:, i] = new
        W[i, i] = np.inf
        W[j, :] = np.inf
        W[:, j] = np.inf
        active[j] = False
        size[i] += size[j]
        nnd[j] = np.inf
        # slot i holds the union; refresh the neighbour lists it affects
        idx = np.flatnonzero(active)
        for k in idx:
            if k == i:
                continue
            if nn[k] in (i, j):
                row = W[k]
                nn[k] = int(np.argmin(row))
                nnd[k] = row[nn[k]]
            elif W[k, i] < nnd[k]:
                nn[k], nnd[k] = i, W[k, i]
        if idx.size > 1:
            nn[i] = int(np.argmin(W[i]))
            nnd[i] = W[i, nn[i]]
        else:
            nnd[i] = np.inf
    # scipy convention: sort by height (stable), then label the clusters
    # with a union-find in that order, smaller label first. Centroid and
    # median linkage are not monotone (a merge can be lower than an
    # earlier one), so their rows stay in merge order.
    order = (list(range(len(merges))) if method in ("centroid", "median")
             else sorted(range(len(merges)), key=lambda m: merges[m][2]))
    parent = list(range(2 * n - 1))

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    Z = np.zeros((n - 1, 4))
    for row, m in enumerate(order):
        a, b, h, s = merges[m]
        ra, rb = find(int(a)), find(int(b))
        Z[row] = [min(ra, rb), max(ra, rb), h, s]
        parent[ra] = parent[rb] = n + row
    return Z


def leaf_order(Z: np.ndarray) -> list[int]:
    """Left-to-right leaves of the tree (scipy's leaves_list)."""
    n = Z.shape[0] + 1
    if n == 1:
        return [0]
    out, stack = [], [2 * n - 2]
    while stack:
        c = stack.pop()
        if c < n:
            out.append(int(c))
        else:
            a, b = int(Z[c - n, 0]), int(Z[c - n, 1])
            stack.extend([b, a])
    return out


def dendrogram(Z: np.ndarray) -> dict:
    """U-shaped segments of the dendrogram: for merge r, x =
    [x_a, x_a, x_b, x_b] and y = [h_a, h, h, h_b] with leaves at their
    position in the leaf order and height 0."""
    n = Z.shape[0] + 1
    order = leaf_order(Z)
    pos = {leaf: float(i) for i, leaf in enumerate(order)}
    height = {leaf: 0.0 for leaf in range(n)}
    xs, ys = [], []
    for r in range(n - 1):
        a, b, h = int(Z[r, 0]), int(Z[r, 1]), float(Z[r, 2])
        xa, xb = pos[a], pos[b]
        xs.append([xa, xa, xb, xb])
        ys.append([height[a], h, h, height[b]])
        pos[n + r] = (xa + xb) / 2.0
        height[n + r] = h
    return {"x": xs, "y": ys, "leaf_order": order}


def cut_tree(Z: np.ndarray, k: int) -> list[int]:
    """Cluster labels (0-based, numbered by first appearance in the leaf
    order) when the tree is cut into k clusters."""
    n = Z.shape[0] + 1
    if not 1 <= k <= n:
        raise ValueError("k must be between 1 and the number of items")
    members = {i: [i] for i in range(n)}
    for r in range(n - k):
        a, b = int(Z[r, 0]), int(Z[r, 1])
        members[n + r] = members.pop(a) + members.pop(b)
    labels = [0] * n
    cluster_of = {}
    for leaf in leaf_order(Z):
        for key, mem in members.items():
            if leaf in mem:
                if key not in cluster_of:
                    cluster_of[key] = len(cluster_of)
                labels[leaf] = cluster_of[key]
                break
    return labels


def hierarchical(M: np.ndarray, *, method: str = "average",
                 metric: str = "euclidean") -> dict:
    D = distance_matrix(M, metric)
    Z = linkage(D, method)
    dg = dendrogram(Z)
    return {"linkage": Z.tolist(), "leaf_order": dg["leaf_order"],
            "dendrogram": {"x": dg["x"], "y": dg["y"]},
            "method": method, "metric": metric}


def cluster_heatmap(values, *, row_names=None, column_names=None,
                    method: str = "average", metric: str = "euclidean",
                    scale: str = "none", scale_axis: str = "rows",
                    cluster_rows: bool = True, cluster_columns: bool = True,
                    k_rows: int | None = None,
                    k_columns: int | None = None,
                    kmeans_options: dict | None = None,
                    choose_k_options: dict | None = None) -> dict:
    """Clustered heat map: standardise, cluster rows and/or columns, and
    return the reordered matrix with both dendrograms. kmeans_options
    {k, axis: "rows" | "columns", seed, n_init} adds a k-means partition
    (with silhouette widths) of the standardised rows or columns;
    choose_k_options {k_max, axis, seed, n_init, n_reference} adds the
    elbow / silhouette / gap table."""
    M = _matrix(values)
    nr, nc = M.shape
    row_names = list(row_names or [f"Row {i + 1}" for i in range(nr)])
    column_names = list(column_names or [f"Column {j + 1}" for j in range(nc)])
    if scale_axis not in ("rows", "columns"):
        raise ValueError("scale_axis must be 'rows' or 'columns'")
    S = (scale_rows(M, scale) if scale_axis == "rows"
         else scale_rows(M.T, scale).T)
    warnings = []
    if method in ("ward", "centroid", "median") and metric != "euclidean":
        warnings.append(f"{method} linkage is defined for Euclidean "
                        f"distances; with {metric} distances the heights "
                        "are not sums of squares")
    out = {"analysis": "cluster_heatmap", "method": method,
           "metric": metric, "scale": scale, "scale_axis": scale_axis,
           "scaled_values": S.tolist(), "warnings": warnings}
    row_order, col_order = list(range(nr)), list(range(nc))
    if cluster_rows and nr >= 2:
        out["rows"] = hierarchical(S, method=method, metric=metric)
        row_order = out["rows"]["leaf_order"]
        if k_rows:
            out["rows"]["clusters"] = cut_tree(np.array(
                out["rows"]["linkage"]), int(k_rows))
    if cluster_columns and nc >= 2:
        out["columns"] = hierarchical(S.T, method=method, metric=metric)
        col_order = out["columns"]["leaf_order"]
        if k_columns:
            out["columns"]["clusters"] = cut_tree(np.array(
                out["columns"]["linkage"]), int(k_columns))
    out["row_order"] = row_order
    out["column_order"] = col_order
    out["row_names"] = [row_names[i] for i in row_order]
    out["column_names"] = [column_names[j] for j in col_order]
    out["matrix"] = S[np.ix_(row_order, col_order)].tolist()
    if kmeans_options:
        km = kmeans_options
        X = S.T if km.get("axis") == "columns" else S
        out["kmeans"] = kmeans(X, int(km["k"]), seed=int(km.get("seed", 0)),
                               n_init=int(km.get("n_init", 10)))
        out["kmeans"]["axis"] = km.get("axis", "rows")
        out["kmeans"]["silhouette"] = silhouette(X, out["kmeans"]["labels"])
    if choose_k_options:
        ck = choose_k_options
        X = S.T if ck.get("axis") == "columns" else S
        out["choose_k"] = choose_k(X, int(ck.get("k_max", 8)),
                                   seed=int(ck.get("seed", 0)),
                                   n_init=int(ck.get("n_init", 10)),
                                   n_reference=int(ck.get("n_reference", 20)))
        out["choose_k"]["axis"] = ck.get("axis", "rows")
    return out


# ---------------------------------------------------------------- k-means

def _sq_dists(X, C):
    out = np.empty((X.shape[0], C.shape[0]))
    for c in range(C.shape[0]):
        diff = X - C[c]
        out[:, c] = np.sum(diff * diff, axis=1)
    return out


def _kmeanspp(X, k, rng):
    n = X.shape[0]
    centers = [X[int(rng.integers(n))]]
    for _ in range(1, k):
        d2 = np.min(_sq_dists(X, np.array(centers)), axis=1)
        total = d2.sum()
        if total <= 0:
            centers.append(X[int(rng.integers(n))])
            continue
        centers.append(X[int(rng.choice(n, p=d2 / total))])
    return np.array(centers)


def _lloyd(X, C, max_iter=300, tol=1e-10):
    for _ in range(max_iter):
        labels = np.argmin(_sq_dists(X, C), axis=1)
        newC = C.copy()
        for c in range(C.shape[0]):
            pts = X[labels == c]
            if pts.size:
                newC[c] = pts.mean(axis=0)
        shift = float(np.sum((newC - C) ** 2))
        C = newC
        if shift <= tol:
            break
    labels = np.argmin(_sq_dists(X, C), axis=1)
    wss = float(np.sum((X - C[labels]) ** 2))
    return labels, C, wss


def kmeans(X, k: int, *, seed: int = 0, n_init: int = 10,
           max_iter: int = 300) -> dict:
    """k-means (Lloyd) from k-means++ seeds; best of n_init restarts.
    Clusters are renumbered by first appearance in the data."""
    X = np.asarray(X, dtype=float)
    n = X.shape[0]
    if not 1 <= k <= n:
        raise ValueError("k must be between 1 and the number of items")
    rng = np.random.default_rng(seed)
    best = None
    for _ in range(max(int(n_init), 1)):
        C0 = _kmeanspp(X, k, rng)
        labels, C, wss = _lloyd(X, C0, max_iter=max_iter)
        if best is None or wss < best[2] - 1e-12:
            best = (labels, C, wss)
    labels, C, wss = best
    remap, new_labels = {}, []
    for lab in labels:
        remap.setdefault(int(lab), len(remap))
        new_labels.append(remap[int(lab)])
    order = sorted(remap, key=remap.get)
    centers = C[order]
    sizes = [int(np.sum(np.array(new_labels) == c)) for c in range(len(order))]
    within = [float(np.sum((X[np.array(new_labels) == c] - centers[c]) ** 2))
              for c in range(len(order))]
    total_ss = float(np.sum((X - X.mean(axis=0)) ** 2))
    return {"k": int(k), "labels": new_labels, "centers": centers.tolist(),
            "sizes": sizes, "within_ss": within, "total_within_ss": wss,
            "total_ss": total_ss, "between_ss": total_ss - wss,
            "seed": seed, "n_init": int(n_init)}


def silhouette(X, labels) -> dict:
    """Silhouette widths (Rousseeuw 1987) with Euclidean distances."""
    X = np.asarray(X, dtype=float)
    labels = np.asarray(labels)
    D = distance_matrix(X, "euclidean")
    clusters = np.unique(labels)
    s = np.zeros(X.shape[0])
    if clusters.size < 2:
        return {"widths": s.tolist(), "mean": None}
    for i in range(X.shape[0]):
        own = labels == labels[i]
        n_own = int(own.sum())
        if n_own == 1:
            s[i] = 0.0
            continue
        a = D[i, own].sum() / (n_own - 1)
        b = min(D[i, labels == c].mean() for c in clusters
                if c != labels[i])
        s[i] = (b - a) / max(a, b) if max(a, b) > 0 else 0.0
    return {"widths": s.tolist(), "mean": float(s.mean())}


def choose_k(X, k_max: int = 8, *, seed: int = 0, n_init: int = 10,
             n_reference: int = 20) -> dict:
    """Elbow (within SS), mean silhouette and gap statistic for k = 1..
    k_max. Suggested k: silhouette maximum (k >= 2) and the Tibshirani
    gap rule; the elbow is the k of largest second difference of the
    within-SS curve (reported as a hint; the curve is the evidence)."""
    X = np.asarray(X, dtype=float)
    n = X.shape[0]
    k_max = int(min(k_max, n))
    rng = np.random.default_rng(seed)
    lo, hi = X.min(axis=0), X.max(axis=0)
    rows = []
    for k in range(1, k_max + 1):
        fit = kmeans(X, k, seed=seed, n_init=n_init)
        wk = fit["total_within_ss"]
        sil = silhouette(X, fit["labels"])["mean"] if 2 <= k < n else None
        ref_logs = []
        for _ in range(int(n_reference)):
            R = lo + (hi - lo) * rng.random(X.shape)
            wr = kmeans(R, k, seed=int(rng.integers(2 ** 31)),
                        n_init=max(1, n_init // 2))["total_within_ss"]
            ref_logs.append(math.log(wr) if wr > 0 else -math.inf)
        ref_logs = np.array(ref_logs)
        finite = np.isfinite(ref_logs)
        gap = sk = None
        if wk > 0 and finite.all():
            gap = float(ref_logs.mean() - math.log(wk))
            sk = float(ref_logs.std(ddof=0) * math.sqrt(1 + 1 / n_reference))
        rows.append({"k": k, "within_ss": wk, "silhouette": sil,
                     "gap": gap, "gap_se": sk})
    gap_k = None
    for a, b in zip(rows, rows[1:]):
        if a["gap"] is not None and b["gap"] is not None and \
                a["gap"] >= b["gap"] - b["gap_se"]:
            gap_k = a["k"]
            break
    sils = [(r["silhouette"], r["k"]) for r in rows
            if r["silhouette"] is not None]
    sil_k = max(sils)[1] if sils else None
    elbow_k = None
    w = [r["within_ss"] for r in rows]
    if len(w) >= 3:
        second = [w[i - 1] - 2 * w[i] + w[i + 1] for i in range(1, len(w) - 1)]
        elbow_k = rows[1 + int(np.argmax(second))]["k"]
    return {"rows": rows, "suggested": {"silhouette": sil_k, "gap": gap_k,
                                        "elbow": elbow_k},
            "n_reference": int(n_reference), "seed": seed}
