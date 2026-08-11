import type { DatasetState } from "../types";

interface Props {
  x: string[];
  datasets: DatasetState[];
  hideX?: boolean; // column-table mode: X is not part of the data model
  onChangeX: (x: string[]) => void;
  onChangeDatasets: (ds: DatasetState[]) => void;
}

// Flat column model: col 0 = X, then each dataset's replicates in order.
function flatToLocation(datasets: DatasetState[], flat: number):
  | { kind: "x" }
  | { kind: "y"; dataset: number; rep: number }
  | null {
  if (flat === 0) return { kind: "x" };
  let c = 1;
  for (let d = 0; d < datasets.length; d++) {
    const w = datasets[d].rows[0]?.length ?? 0;
    if (flat < c + w) return { kind: "y", dataset: d, rep: flat - c };
    c += w;
  }
  return null;
}

export default function DataTable(
  { x, datasets, hideX = false, onChangeX, onChangeDatasets }: Props,
) {
  const nRows = x.length;
  const repCount = (d: DatasetState) => d.rows[0]?.length ?? 0;

  const setXCell = (r: number, v: string) => {
    const next = [...x];
    next[r] = v;
    onChangeX(next);
  };

  const setYCell = (di: number, r: number, rep: number, v: string) => {
    const next = datasets.map((d) => ({ ...d, rows: d.rows.map((row) => [...row]) }));
    next[di].rows[r][rep] = v;
    onChangeDatasets(next);
  };

  const handlePaste = (
    e: React.ClipboardEvent,
    startRow: number,
    startFlat: number,
  ) => {
    const text = e.clipboardData.getData("text/plain");
    if (!text.includes("\t") && !text.includes("\n")) return; // single value: default behavior
    e.preventDefault();
    const grid = text
      .replace(/\r/g, "")
      .split("\n")
      .filter((line, i, arr) => !(i === arr.length - 1 && line === ""))
      .map((line) => line.split("\t"));

    const neededRows = startRow + grid.length;
    const nextX = [...x];
    const nextDs = datasets.map((d) => ({ ...d, rows: d.rows.map((row) => [...row]) }));
    while (nextX.length < neededRows) {
      nextX.push("");
      nextDs.forEach((d) => d.rows.push(Array(repCount(d)).fill("")));
    }
    grid.forEach((line, dr) => {
      line.forEach((value, dc) => {
        const loc = flatToLocation(nextDs, startFlat + dc);
        if (!loc) return;
        if (loc.kind === "x") nextX[startRow + dr] = value.trim();
        else nextDs[loc.dataset].rows[startRow + dr][loc.rep] = value.trim();
      });
    });
    onChangeX(nextX);
    onChangeDatasets(nextDs);
  };

  const addRow = () => {
    onChangeX([...x, ""]);
    onChangeDatasets(
      datasets.map((d) => ({ ...d, rows: [...d.rows, Array(repCount(d)).fill("")] })),
    );
  };

  const removeRow = (r: number) => {
    onChangeX(x.filter((_, i) => i !== r));
    onChangeDatasets(
      datasets.map((d) => ({ ...d, rows: d.rows.filter((_, i) => i !== r) })),
    );
  };

  const addDataset = () => {
    onChangeDatasets([
      ...datasets,
      {
        name: `Dataset ${String.fromCharCode(65 + datasets.length)}`,
        rows: x.map(() => ["", "", ""]),
      },
    ]);
  };

  const removeDataset = (di: number) =>
    onChangeDatasets(datasets.filter((_, i) => i !== di));

  const setReplicates = (di: number, count: number) => {
    if (count < 1 || count > 12) return;
    onChangeDatasets(
      datasets.map((d, i) => {
        if (i !== di) return d;
        return {
          ...d,
          rows: d.rows.map((row) => {
            const next = row.slice(0, count);
            while (next.length < count) next.push("");
            return next;
          }),
        };
      }),
    );
  };

  const renameDataset = (di: number, name: string) =>
    onChangeDatasets(datasets.map((d, i) => (i === di ? { ...d, name } : d)));

  let flatBase = 1;
  const datasetMeta = datasets.map((d) => {
    const meta = { base: flatBase, width: repCount(d) };
    flatBase += meta.width;
    return meta;
  });

  return (
    <div className="data-table">
      <table>
        <thead>
          <tr>
            <th className="rownum" />
            {!hideX && <th className="xhead">X: [Conc.]</th>}
            {datasets.map((d, di) => (
              <th key={di} colSpan={repCount(d)} className="group-head">
                <input
                  className="ds-name"
                  value={d.name}
                  onChange={(e) => renameDataset(di, e.target.value)}
                />
                <span className="ds-tools">
                  <button title="Remove a replicate subcolumn"
                    onClick={() => setReplicates(di, repCount(d) - 1)}>−</button>
                  <button title="Add a replicate subcolumn"
                    onClick={() => setReplicates(di, repCount(d) + 1)}>+</button>
                  {datasets.length > 1 && (
                    <button title="Delete dataset" onClick={() => removeDataset(di)}>✕</button>
                  )}
                </span>
              </th>
            ))}
            <th className="rowtools" />
          </tr>
          <tr className="subhead">
            <th className="rownum" />
            {!hideX && <th />}
            {datasets.map((d, di) =>
              d.rows[0]?.map((_, rep) => (
                <th key={`${di}-${rep}`}>{`Y${rep + 1}`}</th>
              )),
            )}
            <th className="rowtools" />
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: nRows }, (_, r) => (
            <tr key={r}>
              <td className="rownum">{r + 1}</td>
              {!hideX && (
                <td>
                  <input
                    inputMode="decimal"
                    value={x[r]}
                    onChange={(e) => setXCell(r, e.target.value)}
                    onPaste={(e) => handlePaste(e, r, 0)}
                  />
                </td>
              )}
              {datasets.map((d, di) =>
                d.rows[r]?.map((v, rep) => (
                  <td key={`${di}-${rep}`}>
                    <input
                      inputMode="decimal"
                      value={v}
                      onChange={(e) => setYCell(di, r, rep, e.target.value)}
                      onPaste={(e) => handlePaste(e, r, datasetMeta[di].base + rep)}
                    />
                  </td>
                )),
              )}
              <td className="rowtools">
                <button title="Delete row" onClick={() => removeRow(r)}>✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-actions">
        <button onClick={addRow}>+ Row</button>
        <button onClick={addDataset}>+ Dataset</button>
        <span className="hint">Paste directly from Excel; tab-separated blocks expand automatically.</span>
      </div>
    </div>
  );
}
