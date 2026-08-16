import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
} from "react";
import "./App.css";
import DataTable from "./components/DataTable";
import ControlsPanel from "./components/ControlsPanel";
import PlateImportPanel from "./components/PlateImportPanel";
import ResultsPanel from "./components/ResultsPanel";
import PlotPanel from "./components/PlotPanel";
import ColumnControls from "./components/ColumnControls";
import ColumnPlot from "./components/ColumnPlot";
import ContingencyPanel from "./components/ContingencyPanel";
import HSplitter from "./components/HSplitter";
import ExportPanel from "./components/ExportPanel";
import GraphSettings from "./components/GraphSettings";
import type { AxisTitles } from "./components/GraphSettings";
import MethodsText from "./components/MethodsText";
import StatsResults from "./components/StatsResults";
import SurvivalView from "./components/SurvivalView";
import { getEngine } from "./lib/engine";
import {
  DEFAULT_SCHEME, isSchemeId, type SchemeId,
} from "./lib/palette";
import type {
  AnalysisResult, ColumnOptionsState, DatasetState, OptionsState, TableMode,
} from "./types";
import { MODELS_META, parseCell } from "./types";

// Reference dataset, identical to engine/tests/test_api.py REF_Y, so the
// app boots showing the dataset used for Prism cross-validation.
const REF_X = ["1e-9", "3.162e-9", "1e-8", "3.162e-8", "1e-7",
  "3.162e-7", "1e-6", "3.162e-6", "1e-5"];
const REF_ROWS = [
  ["98.2", "101.5", "99.1"],
  ["97.0", "95.8", "99.9"],
  ["93.4", "90.1", "92.7"],
  ["78.9", "82.3", "80.0"],
  ["51.2", "48.7", "50.9"],
  ["22.1", "25.6", "24.0"],
  ["8.9", "10.2", "7.5"],
  ["3.1", "4.4", "2.2"],
  ["1.0", "0.5", "2.1"],
];

const DEFAULT_COLUMN_OPTIONS: ColumnOptionsState = {
  analysis: "column_statistics",
  hypothetical: "",
  ttestKind: "unpaired",
  datasetA: 0,
  datasetB: 1,
  anovaKind: "parametric",
  comparisons: "tukey",
  controlIndex: 0,
  grubbsAlpha: "0.05",
  corrMethod: "pearson",
  rmKind: "parametric",
  outlierMethod: "grubbs",
  routQ: "1",
  twoWayComparisons: "none",
  twoWayDirection: "columns_within_rows",
  rmTwoDesign: "mixed",
  graphType: "scatter",
};

const DEFAULT_OPTIONS: OptionsState = {
  model: "log_inhibitor_vs_response_4pl",
  xIsLog: false,
  errorBars: "sd",
  top: { enabled: false, value: "100" },
  bottom: { enabled: false, value: "0" },
  hillSlope: { enabled: false, value: "-1" },
  normalize: {
    enabled: false,
    zeroMode: "smallest", zeroValue: "0",
    hundredMode: "largest", hundredValue: "100",
    asPercent: true,
    subcolumns: "mean",
  },
  weighting: "none",
  ciMethod: "asymptotic",
  routEnabled: false,
  routQ: "1",
  bands: "none",
  diagnostics: false,
  interpolateY: "",
  sharedParams: [],
  modelConstants: {},
  antagonist: "",
  schildSlopeUnity: true,
};

const SURVIVAL_EXAMPLE = {
  datasets: [
    {
      name: "Control",
      rows: [["6", "1"], ["13", "1"], ["21", "1"], ["30", "1"], ["31", "0"],
             ["37", "1"], ["38", "1"], ["47", "0"], ["49", "1"], ["50", "1"]],
    },
    {
      name: "Treated",
      rows: [["10", "1"], ["21", "1"], ["33", "1"], ["40", "0"], ["45", "1"],
             ["46", "1"], ["50", "1"], ["52", "0"], ["53", "1"], ["55", "0"]],
    },
  ],
  x: Array(10).fill(""),
};

export default function App() {
  const [x, setX] = useState<string[]>(REF_X);
  const [datasets, setDatasets] = useState<DatasetState[]>([
    { name: "Drug A", rows: REF_ROWS },
  ]);
  const [options, setOptions] = useState<OptionsState>(DEFAULT_OPTIONS);
  const [mode, setMode] = useState<TableMode>("xy");
  const [columnOptions, setColumnOptions] =
    useState<ColumnOptionsState>(DEFAULT_COLUMN_OPTIONS);
  const [xUnit, setXUnit] = useState("M");
  // Chosen once and applied to every graph type, so a project keeps one
  // look across its XY, column and survival views.
  const [scheme, setScheme] = useState<SchemeId>(() => {
    const saved = localStorage.getItem("opendose-scheme");
    return isSchemeId(saved) ? saved : DEFAULT_SCHEME;
  });
  const chooseScheme = (id: SchemeId) => {
    setScheme(id);
    localStorage.setItem("opendose-scheme", id);
  };
  // Axis-title overrides, kept per graph type: an empty string means "use
  // the automatic title", which is what makes clearing a field an undo.
  const [titles, setTitles] = useState<Record<string, AxisTitles>>({});
  const titlesFor = (m: TableMode): AxisTitles =>
    titles[m] ?? { x: "", y: "" };
  const setTitlesFor = (m: TableMode) => (t: AxisTitles) =>
    setTitles((prev) => ({ ...prev, [m]: t }));
  const pick = (override: string, auto: string) => override.trim() || auto;
  const [status, setStatus] = useState("Starting Python runtime…");
  const [engineReady, setEngineReady] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [statsResult, setStatsResult] =
    useState<Record<string, unknown> | null>(null);
  const runToken = useRef(0);

  // Theme override: "auto" follows the OS; light/dark force it. The
  // data-theme attribute drives the CSS tokens, and the event tells the
  // Plotly components to re-read their chrome colors.
  const [theme, setTheme] = useState<"auto" | "light" | "dark">(() =>
    (localStorage.getItem("opendose-theme") as
      "auto" | "light" | "dark" | null) ?? "auto");
  useEffect(() => {
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    localStorage.setItem("opendose-theme", theme);
    window.dispatchEvent(new Event("opendose-theme"));
  }, [theme]);
  const cycleTheme = () => setTheme((t) =>
    t === "auto" ? "light" : t === "light" ? "dark" : "auto");

  // Info popover (privacy + non-affiliation note): hover on pointer
  // devices, click/focus everywhere; Escape and outside-click dismiss.
  const hoverCapable = () =>
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const [infoOpen, setInfoOpen] = useState(false);
  const infoRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!infoOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!infoRef.current?.contains(e.target as Node)) setInfoOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setInfoOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [infoOpen]);

  const [engineError, setEngineError] = useState<string | null>(null);
  const bootEngine = useCallback(() => {
    setEngineError(null);
    setStatus("Starting Python runtime…");
    getEngine(setStatus)
      .then(() => {
        setEngineReady(true);
        setStatus("");
      })
      .catch((err) => {
        // getEngine resets its cached promise on failure, so Retry can
        // simply call this again.
        setEngineError(err instanceof Error ? err.message : String(err));
        setStatus("");
      });
  }, []);
  useEffect(() => { bootEngine(); }, [bootEngine]);

  const numericData = useMemo(() => ({
    x: x.map(parseCell),
    datasets: datasets.map((d) => ({
      name: d.name,
      ys: d.rows.map((row) => row.map(parseCell)),
    })),
  }), [x, datasets]);

  const runAnalysis = useCallback(async () => {
    const engine = await getEngine();
    const token = ++runToken.current;

    let data = numericData;
    if (options.normalize.enabled) {
      const n = options.normalize;
      const normalized = engine.analyze({
        analysis: "normalize",
        data,
        options: {
          zero_mode: n.zeroMode,
          zero_value: parseCell(n.zeroValue) ?? 0,
          hundred_mode: n.hundredMode,
          hundred_value: parseCell(n.hundredValue) ?? 100,
          as_percent: n.asPercent,
          subcolumns: n.subcolumns,
        },
      }) as { error?: string; datasets: { name: string; ys: (number | null)[][] }[] };
      if (normalized.error) {
        if (token === runToken.current) {
          setResult({ analysis: "dose_response", datasets: [], error: normalized.error });
        }
        return;
      }
      data = { x: data.x, datasets: normalized.datasets };
    }

    const meta = MODELS_META[options.model];
    const constraints: Record<string, number> = {};
    if (options.top.enabled && meta.constrainable.includes("Top")) {
      constraints.Top = parseCell(options.top.value) ?? 0;
    }
    if (options.bottom.enabled && meta.constrainable.includes("Bottom")) {
      constraints.Bottom = parseCell(options.bottom.value) ?? 0;
    }
    if (options.hillSlope.enabled && meta.constrainable.includes("HillSlope")) {
      constraints.HillSlope = parseCell(options.hillSlope.value) ?? -1;
    }
    for (const c of meta.constants ?? []) {
      const v = parseCell(options.modelConstants[c] ?? "");
      if (v !== null) constraints[c] = v;
    }

    const interpY = options.interpolateY
      .split(/[\n,;\s]+/).map(parseCell)
      .filter((v): v is number => v !== null);

    if (options.model === "ec50_shift") {
      if (options.schildSlopeUnity) constraints.SchildSlope = 1.0;
      const antagonist = options.antagonist
        .split(/[\n,;\s]+/).map(parseCell)
        .filter((v): v is number => v !== null);
      const g = engine.analyze({
        analysis: "ec50_shift",
        data,
        options: {
          x_is_log: options.xIsLog,
          error_bars: options.errorBars,
          constraints,
          antagonist,
        },
      }) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (token !== runToken.current) return;
      if (g.error) {
        setResult({ analysis: "dose_response", datasets: [], error: g.error });
        return;
      }
      setResult({
        analysis: "dose_response",
        datasets: g.datasets.map((ds: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
          name: ds.name,
          points: ds.points,
          fit: {
            model: g.model,
            label: `${g.label}, [antagonist] = ${ds.antagonist}`,
            equation: g.equation,
            status: "converged",
            dependency: {},
            params: {
              ...g.params,
              "EC50 (this curve)": {
                value: ds.ec50_observed, se: null, ci95: null,
                constrained: false, derived: true,
              },
              "Dose ratio": {
                value: ds.dose_ratio, se: null, ci95: null,
                constrained: false, derived: true,
              },
            },
            param_order: [...g.param_order, "EC50 (this curve)", "Dose ratio"],
            goodness: {
              df: g.goodness.df,
              n_points: ds.n_points,
              r_squared: ds.r_squared,
              ss_res: ds.ss_res,
              sy_x: g.goodness.sy_x,
            },
            curve: ds.curve,
          },
        })),
      });
      return;
    }

    if (options.sharedParams.length > 0) {
      const g = engine.analyze({
        analysis: "global_fit",
        data,
        options: {
          model: options.model,
          x_is_log: options.xIsLog,
          error_bars: options.errorBars,
          constraints,
          shared: options.sharedParams,
          weighting: options.weighting,
        },
      }) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      if (token !== runToken.current) return;
      if (g.error) {
        setResult({ analysis: "dose_response", datasets: [], error: g.error });
        return;
      }
      setResult({
        analysis: "dose_response",
        datasets: g.datasets.map((ds: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
          name: ds.name,
          points: ds.points,
          fit: {
            model: g.model,
            label: `${g.label}, global fit (shared: ${g.shared.join(", ")})`,
            equation: g.equation,
            status: "converged",
            dependency: {},
            params: ds.params,
            param_order: Object.keys(ds.params),
            goodness: {
              df: g.goodness.df,
              n_points: ds.n_points,
              r_squared: ds.r_squared,
              ss_res: ds.ss_res,
              sy_x: g.goodness.sy_x,
            },
            curve: ds.curve,
          },
        })),
      });
      return;
    }

    const res = engine.analyze({
      analysis: "dose_response",
      data,
      options: {
        model: options.model,
        x_is_log: options.xIsLog,
        error_bars: options.errorBars,
        constraints,
        weighting: options.weighting,
        ci_method: options.ciMethod,
        rout_q: options.routEnabled
          ? (parseCell(options.routQ) ?? 1) / 100 : null,
        bands: options.bands === "none" ? null : options.bands,
        diagnostics: options.diagnostics,
        interpolate_y: interpY.length ? interpY : null,
      },
    }) as AnalysisResult;
    if (token === runToken.current) setResult(res);
  }, [numericData, options]);

  const runColumnAnalysis = useCallback(async () => {
    const engine = await getEngine();
    const token = ++runToken.current;
    const o = columnOptions;
    const base = { data: numericData };
    let payload: Record<string, unknown>;
    if (o.analysis === "column_statistics") {
      payload = { analysis: "column_statistics", ...base,
        options: { hypothetical: parseCell(o.hypothetical) } };
    } else if (o.analysis === "ttest") {
      payload = { analysis: "ttest", ...base,
        options: {
          kind: o.ttestKind === "welch" ? "unpaired" : o.ttestKind,
          welch: o.ttestKind === "welch",
          dataset_a: o.datasetA, dataset_b: o.datasetB,
        } };
    } else if (o.analysis === "anova") {
      payload = { analysis: "anova", ...base,
        options: {
          kind: o.anovaKind,
          comparisons: o.comparisons === "none" ? null : o.comparisons,
          control_index: o.controlIndex,
        } };
    } else if (o.analysis === "correlation") {
      payload = { analysis: "correlation", ...base,
        options: { method: o.corrMethod,
                   dataset_a: o.datasetA, dataset_b: o.datasetB } };
    } else if (o.analysis === "two_way_anova") {
      payload = { analysis: "two_way_anova", ...base,
        options: {
          row_factor: "Rows", col_factor: "Datasets",
          comparisons: o.twoWayComparisons === "none"
            ? null : o.twoWayComparisons,
          direction: o.twoWayDirection,
        } };
    } else if (o.analysis === "rm_two_way") {
      payload = { analysis: "rm_two_way", ...base,
        options: { design: o.rmTwoDesign } };
    } else if (o.analysis === "rm_anova") {
      payload = { analysis: "rm_anova", ...base,
        options: { kind: o.rmKind } };
    } else if (o.analysis === "roc") {
      payload = { analysis: "roc", ...base,
        options: { patients: o.datasetA, controls: o.datasetB } };
    } else if (o.analysis === "bland_altman") {
      payload = { analysis: "bland_altman", ...base,
        options: { dataset_a: o.datasetA, dataset_b: o.datasetB } };
    } else if (o.outlierMethod === "rout") {
      payload = { analysis: "rout_column", ...base,
        options: { q: (parseCell(o.routQ) ?? 1) / 100 } };
    } else {
      payload = { analysis: "outliers", ...base,
        options: { alpha: parseCell(o.grubbsAlpha) ?? 0.05 } };
    }
    const res = engine.analyze(payload) as Record<string, unknown>;
    if (token === runToken.current) setStatsResult(res);
  }, [numericData, columnOptions]);

  const runSurvival = useCallback(async () => {
    const engine = await getEngine();
    const token = ++runToken.current;
    const res = engine.analyze({
      analysis: "survival",
      data: numericData,
      options: {},
    }) as Record<string, unknown>;
    if (token === runToken.current) setStatsResult(res);
  }, [numericData]);

  useEffect(() => {
    if (!engineReady || mode === "contingency") return;
    const run = mode === "xy" ? runAnalysis
      : mode === "survival" ? runSurvival : runColumnAnalysis;
    const t = setTimeout(run, 400);
    return () => clearTimeout(t);
  }, [engineReady, mode, runAnalysis, runColumnAnalysis, runSurvival]);

  // The engine-ready reveal animates exactly once: panes mounted at the
  // moment the engine comes up get the entrance; later remounts (mode
  // switches) do not.
  const modeSwitched = useRef(false);
  const reveal = engineReady && !modeSwitched.current;

  // Survival needs a different table shape (time + event code), so it keeps
  // its own copy of the grid; XY and Column analyze the same data and share
  // one. Switching between the two groups stashes the outgoing grid and
  // restores the incoming one, so no mode switch ever loses entered data.
  const tableStash = useRef<Partial<Record<"shared" | "survival",
    { x: string[]; datasets: DatasetState[] }>>>({});
  const tableGroup = (m: TableMode) =>
    m === "survival" ? "survival" as const : "shared" as const;

  const switchMode = (next: TableMode) => {
    modeSwitched.current = true;
    const from = tableGroup(mode);
    const to = tableGroup(next);
    if (from !== to) {
      tableStash.current[from] = { x, datasets };
      const restored = tableStash.current[to];
      if (restored) {
        setX(restored.x);
        setDatasets(restored.datasets);
      } else if (to === "survival") {
        setX(SURVIVAL_EXAMPLE.x);
        setDatasets(SURVIVAL_EXAMPLE.datasets);
      }
    }
    setMode(next);
  };

  const saveProject = () => {
    const blob = new Blob([JSON.stringify({
      opendose_project: 1,
      mode, x, datasets, options, columnOptions, xUnit, scheme, titles,
    }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "opendose-project.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  interface PzfxTable {
    title: string;
    table_type: string;
    x: (number | null)[] | null;
    x_title: string;
    n_rows: number;
    datasets: { name: string; ys: (number | null)[][] }[];
  }
  const [pzfxTables, setPzfxTables] = useState<PzfxTable[] | null>(null);

  const loadPzfxTable = (t: PzfxTable) => {
    const toCell = (v: number | null | undefined) =>
      v == null ? "" : String(v);
    // Mirrors switchMode: loading a table that lives in the other grid
    // group stashes the current grid first.
    const stashFor = (target: TableMode) => {
      if (tableGroup(mode) !== tableGroup(target)) {
        tableStash.current[tableGroup(mode)] = { x, datasets };
      }
    };
    if (t.table_type === "Survival" && t.x) {
      stashFor("survival");
      // Prism survival table: X = time; each Y column = one group with
      // an event code (1 = event, 0 = censored) on that subject's row.
      setDatasets(t.datasets.map((ds) => ({
        name: ds.name || "Group",
        rows: ds.ys
          .map((row, r) => [toCell(t.x![r]), toCell(row[0])])
          .filter((rw) => rw[0] !== "" && rw[1] !== ""),
      })));
      setX(Array(t.n_rows).fill(""));
      setMode("survival");
    } else if (t.table_type === "XY" && t.x) {
      stashFor("xy");
      setX(t.x.map(toCell));
      setDatasets(t.datasets.map((ds) => ({
        name: ds.name || "Dataset",
        rows: ds.ys.map((row) => row.map(toCell)),
      })));
      // A negative X cannot be a concentration, so the column is already
      // log10. A zero is not evidence either way and must not count: a
      // vehicle-control row at dose 0 is ordinary in a raw dose table.
      setOptions((o) => ({
        ...o,
        xIsLog: t.x!.some((v) => v != null && v < 0),
      }));
      setMode("xy");
    } else {
      stashFor("column");
      setX(Array(t.n_rows).fill(""));
      setDatasets(t.datasets.map((ds) => ({
        name: ds.name || "Group",
        rows: ds.ys.map((row) => row.map(toCell)),
      })));
      setMode("column");
    }
    setPzfxTables(null);
  };

  const loadPrismFile = async (file: File) => {
    const engine = await getEngine();
    // Sent as bytes for both formats: a .prism file is a zip archive, and
    // reading one as text would corrupt it. The engine tells them apart.
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const res = engine.analyze({
      analysis: "pzfx_import",
      data: { pzfx_b64: btoa(binary) },
      options: {},
    }) as { error?: string; tables?: PzfxTable[] };
    if (res.error || !res.tables) {
      throw new Error(res.error ?? "no tables found");
    }
    if (res.tables.length === 1) loadPzfxTable(res.tables[0]);
    else setPzfxTables(res.tables);
  };

  const loadProject = async (file: File) => {
    try {
      if (/\.(pzfx|prism|prism\.zip|zip)$/i.test(file.name)) {
        await loadPrismFile(file);
        return;
      }
      const p = JSON.parse(await file.text());
      if (!p.opendose_project) throw new Error("not an OpenDose project file");
      // A loaded project replaces the whole session; stale stashed grids
      // from before the load must not resurface on the next mode switch.
      tableStash.current = {};
      setX(p.x);
      setDatasets(p.datasets);
      setOptions({ ...DEFAULT_OPTIONS, ...p.options });
      setColumnOptions({ ...DEFAULT_COLUMN_OPTIONS, ...p.columnOptions });
      setXUnit(p.xUnit ?? "M");
      if (isSchemeId(p.scheme)) chooseScheme(p.scheme);
      setTitles(p.titles && typeof p.titles === "object" ? p.titles : {});
      setMode(p.mode ?? "xy");
    } catch (e) {
      setStatus(`Could not load file: ${e instanceof Error ? e.message : e}`);
    }
  };

  const [yLabel, setYLabel] = useState<string | null>(null);

  const handlePlateImport = (imported: {
    x: string[];
    datasets: DatasetState[];
    output: "viability" | "inhibition";
  }) => {
    setX(imported.x);
    setDatasets(imported.datasets);
    setXUnit("µM");
    setYLabel(imported.output === "viability"
      ? "Cell viability (%)" : "Inhibition (%)");
    // Percent data normalized to a 0-dose control: Prism's guide
    // recommends constraining both plateaus (user can untick).
    setOptions((o) => ({
      ...o,
      xIsLog: false,
      normalize: { ...o.normalize, enabled: false },
      top: { enabled: true, value: imported.output === "viability" ? "100" : "100" },
      bottom: { enabled: true, value: "0" },
      model: imported.output === "viability"
        ? "log_inhibitor_vs_response_4pl"
        : "log_agonist_vs_response_4pl",
    }));
  };

  const modelMeta = MODELS_META[options.model];
  const xTitle = modelMeta.needsLogX
    ? `${modelMeta.xLabel}, ${xUnit}`
    : modelMeta.xLabel;
  const yTitle = yLabel ?? (options.normalize.enabled
    ? (options.normalize.asPercent ? "Normalized response (%)" : "Normalized response")
    : "Response");

  // `short` is the compact-width text variant, shown on narrow screens so
  // the segmented control fits without clipping.
  const MODES: { id: TableMode; label: string; short: string }[] = [
    { id: "xy", label: "XY · Curves", short: "Curves" },
    { id: "column", label: "Column · Statistics", short: "Stats" },
    { id: "contingency", label: "Contingency", short: "Contingency" },
    { id: "survival", label: "Survival", short: "Survival" },
  ];
  const onTabKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = MODES.findIndex((m) => m.id === mode);
    const next = MODES[(i + (e.key === "ArrowRight" ? 1 : MODES.length - 1))
      % MODES.length];
    switchMode(next.id);
    (e.currentTarget.querySelectorAll("[role=tab]")[
      MODES.indexOf(next)] as HTMLElement)?.focus();
  };

  // Floating chrome: the header hairline/shadow appear only once content
  // actually scrolls underneath it.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Sliding segmented-control thumb: measured from the active tab so the
  // white pill glides between modes instead of jumping.
  const tablistRef = useRef<HTMLElement>(null);
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const active = tablistRef.current
        ?.querySelector<HTMLElement>("button.active");
      if (active) setThumb({ x: active.offsetLeft, w: active.offsetWidth });
    };
    measure();
    // Webfont load reflows the tabs; re-measure once it settles.
    document.fonts?.ready.then(measure);
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [mode]);

  // Draggable divider between the two columns: 1:1 pointer tracking on a
  // CSS variable, clamped, persisted on release. Arrow keys nudge it.
  const mainRef = useRef<HTMLElement>(null);
  const splitDrag = useRef(false);
  useEffect(() => {
    const saved = localStorage.getItem("opendose-split");
    if (saved) mainRef.current?.style.setProperty("--split", saved);
  }, []);
  const setSplit = (pct: number, persist = false) => {
    const v = `${Math.min(65, Math.max(24, pct)).toFixed(2)}%`;
    mainRef.current?.style.setProperty("--split", v);
    if (persist) localStorage.setItem("opendose-split", v);
  };
  const splitPct = (clientX: number) => {
    const r = mainRef.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * 100;
  };
  const splitter = (
    <div className="splitter" role="separator" aria-orientation="vertical"
      aria-label="Resize columns" tabIndex={0}
      onPointerDown={(e) => {
        e.preventDefault();
        splitDrag.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        document.body.style.userSelect = "none";
      }}
      onPointerMove={(e) => {
        if (splitDrag.current) setSplit(splitPct(e.clientX));
      }}
      onPointerUp={(e) => {
        if (!splitDrag.current) return;
        splitDrag.current = false;
        document.body.style.userSelect = "";
        setSplit(splitPct(e.clientX), true);
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        const cur = parseFloat(mainRef.current?.style
          .getPropertyValue("--split") || "41.7");
        setSplit(cur + (e.key === "ArrowRight" ? 2 : -2), true);
      }} />
  );

  return (
    <div className="app">
      <header data-scrolled={scrolled ? "true" : "false"}>
        <div className="brand">
          <Logo />
          <h1>OpenDose</h1>
        </div>
        <nav className="mode-switch" role="tablist" ref={tablistRef}
          aria-label="Data table mode" onKeyDown={onTabKey}>
          <span className="seg-thumb" aria-hidden="true" style={{
            width: thumb ? `${thumb.w}px` : 0,
            transform: thumb ? `translateX(${thumb.x}px)` : undefined,
            opacity: thumb ? 1 : 0,
          }} />
          {MODES.map((m) => (
            <button key={m.id} role="tab"
              aria-selected={mode === m.id}
              tabIndex={mode === m.id ? 0 : -1}
              className={mode === m.id ? "active" : ""}
              onClick={() => switchMode(m.id)}>
              <span className="tab-label tab-label-full"
                data-label={m.label}>{m.label}</span>
              <span className="tab-label tab-label-short"
                data-label={m.short}>{m.short}</span>
            </button>
          ))}
        </nav>
        <span className="project-actions">
          {/* Hover open/close only on hover-capable pointers; touch taps
              synthesize mouseenter/leave pairs that would instantly undo
              the open. Touch relies on the click + outside-tap path. */}
          <span className="info-wrap" ref={infoRef}
            onMouseEnter={() => { if (hoverCapable()) setInfoOpen(true); }}
            onMouseLeave={() => { if (hoverCapable()) setInfoOpen(false); }}>
            <button className="theme-btn info-btn"
              aria-label="About OpenDose: privacy and non-affiliation"
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen(true)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="8" cy="8" r="6.25" />
                <path d="M8 7.4v3.8" strokeLinecap="round" />
                <circle cx="8" cy="4.8" r="0.9" fill="currentColor"
                  stroke="none" />
              </svg>
            </button>
            {infoOpen && (
              <div className="info-pop" role="note">
                <p className="info-privacy">
                  All computation runs locally in your browser; your data
                  never leaves your device.
                </p>
                <p>
                  OpenDose is a free, independent open-source project built
                  on NumPy/SciPy. It is not affiliated with, endorsed by, or
                  sponsored by GraphPad Software; results are cross-validated
                  against independent implementations.
                </p>
              </div>
            )}
          </span>
          <button className="theme-btn" onClick={cycleTheme}
            title={`Theme: ${theme === "auto" ? "match system" : theme}`}
            aria-label={`Color theme: ${theme}. Click to change`}>
            {theme === "light" ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
                stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" aria-hidden="true">
                <circle cx="8" cy="8" r="3.25" />
                <path d="M8 1.2v1.8M8 13v1.8M1.2 8H3M13 8h1.8M3.2 3.2l1.27
                  1.27M11.53 11.53l1.27 1.27M12.8 3.2l-1.27 1.27M4.47
                  11.53L3.2 12.8" />
              </svg>
            ) : theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 16 16"
                fill="currentColor" aria-hidden="true">
                <path d="M13.4 9.9A6 6 0 1 1 6.1 2.6a6.9 6.9 0 1 0 7.3 7.3Z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16"
                aria-hidden="true">
                <circle cx="8" cy="8" r="6.25" fill="none"
                  stroke="currentColor" strokeWidth="1.5" />
                <path d="M8 1.75a6.25 6.25 0 0 1 0 12.5Z"
                  fill="currentColor" />
              </svg>
            )}
          </button>
          <button onClick={saveProject}>Save project</button>
          <label className="load-btn">
            Open
            <input type="file" accept=".json,.pzfx,.prism,.zip" hidden
              aria-label="Open an OpenDose project or a Prism file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadProject(f);
                e.target.value = "";
              }} />
          </label>
          <span className="status" role="status" aria-live="polite">
            {status}
          </span>
        </span>
      </header>
      {pzfxTables && (
        <div className="pzfx-chooser">
          <span>Prism file contains {pzfxTables.length} data tables. Pick
            one to import:</span>
          {pzfxTables.map((t, i) => (
            <button key={i} onClick={() => loadPzfxTable(t)}>
              {t.title || `Table ${i + 1}`} ({t.table_type})
            </button>
          ))}
          <button className="dismiss" onClick={() => setPzfxTables(null)}>
            Cancel
          </button>
        </div>
      )}
      <main ref={mainRef}>
        {mode === "contingency" ? (
          <ContingencyPanel engineReady={engineReady} splitter={splitter} />
        ) : (
          <>
            {/* Until the engine is up, the editor column is inert: typing
                into a table that cannot analyze yet only causes confusion
                (and competes with the runtime for the main thread). */}
            <div className="left" inert={!engineReady}>
              {mode === "xy" && (
                <>
                  <div className="pane pane-import">
                    <PlateImportPanel onImport={handlePlateImport} />
                  </div>
                  <HSplitter />
                </>
              )}
              <div className="pane pane-table">
                <DataTable
                  x={x} datasets={datasets} hideX={mode !== "xy"}
                  onChangeX={setX} onChangeDatasets={setDatasets}
                />
              </div>
              <HSplitter />
              <div className="pane pane-controls">
                {mode === "xy" &&
                  <ControlsPanel options={options} onChange={setOptions} />}
                {mode === "column" &&
                  <ColumnControls options={columnOptions}
                    datasetNames={datasets.map((d) => d.name)}
                    onChange={setColumnOptions} />}
                {mode === "survival" && (
                  <div className="controls">
                    <section>
                      <h3>How to enter data</h3>
                      <p className="hint-block">
                        Each dataset is one group; each row is one subject:
                        Y1 = time, Y2 = event code (1 = event, 0 = censored).
                      </p>
                    </section>
                  </div>
                )}
              </div>
            </div>
            {splitter}
            <div className="right">
              {!engineReady ? (
                <div className="pane pane-plot">
                  <WelcomePanel status={status} error={engineError}
                    onRetry={bootEngine} />
                </div>
              ) : (
                <>
                  {mode === "xy" && (
                    <>
                      <div className={`pane pane-plot${reveal ? " reveal" : ""}`}>
                        <div className="plot-card">
                          <PlotPanel result={result} scheme={scheme}
                            xTitle={pick(titlesFor("xy").x, xTitle)}
                            yTitle={pick(titlesFor("xy").y, yTitle)} />
                          <ExportPanel filename="dose-response" leading={
                            <GraphSettings
                              scheme={scheme} onSchemeChange={chooseScheme}
                              titles={titlesFor("xy")}
                              onTitlesChange={setTitlesFor("xy")}
                              autoX={xTitle} autoY={yTitle} />
                          } />
                        </div>
                      </div>
                      <HSplitter />
                      <div className={`pane pane-results${reveal ? " reveal" : ""}`}>
                        <ResultsPanel result={result} xUnit={xUnit} />
                      </div>
                      <HSplitter />
                      <div className="pane pane-methods">
                        <MethodsText result={result} options={options}
                          xUnit={xUnit} />
                      </div>
                    </>
                  )}
                  {mode === "column" && (
                    <>
                      <div className="pane pane-plot">
                        <div className="plot-card">
                          <ColumnPlot datasets={datasets}
                            graphType={columnOptions.graphType}
                            scheme={scheme}
                            yTitle={pick(titlesFor("column").y, "Value")} />
                          <ExportPanel filename="column-graph" leading={
                            <GraphSettings
                              scheme={scheme} onSchemeChange={chooseScheme}
                              titles={titlesFor("column")}
                              onTitlesChange={setTitlesFor("column")}
                              autoX="" autoY="Value" showX={false} />
                          } />
                        </div>
                      </div>
                      <HSplitter />
                      <div className="pane pane-results">
                        <StatsResults result={statsResult} />
                      </div>
                    </>
                  )}
                  {mode === "survival" && (
                    <div className="pane pane-plot">
                      <SurvivalView result={statsResult} scheme={scheme}
                        xTitle={pick(titlesFor("survival").x, "Time")}
                        yTitle={pick(titlesFor("survival").y, "Percent survival")}
                        exportSlot={
                          <ExportPanel filename="survival" leading={
                            <GraphSettings
                              scheme={scheme} onSchemeChange={chooseScheme}
                              titles={titlesFor("survival")}
                              onTitlesChange={setTitlesFor("survival")}
                              autoX="Time" autoY="Percent survival" />
                          } />
                        } />
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Logo() {
  // Dose-response sigmoid in a rounded tile: the OpenDose mark.
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="7"
        fill="var(--accent-fill)" />
      <path d="M5 8.5 C 12 8.5 10.5 19.5 17.5 19.5 L 23 19.5"
        fill="none" stroke="var(--accent-ink)" strokeWidth="2.2"
        strokeLinecap="round" transform="rotate(180 14 14)" />
      <circle cx="14" cy="14" r="1.9" fill="var(--accent-ink)" />
    </svg>
  );
}

function WelcomePanel({ status, error, onRetry }: {
  status: string;
  error?: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="welcome">
      <div className="welcome-head">
        <Logo />
        <h2>Curve fitting &amp; biostatistics, in your browser</h2>
      </div>
      <p className="welcome-tagline">
        Fit dose-response curves, run the standard statistics toolbox, and
        analyze survival data, powered by real SciPy running entirely on
        your device. Nothing is uploaded, ever.
      </p>
      <ul>
        <li>Paste data straight from Excel; tab-separated blocks expand
          automatically.</li>
        <li>Open a Prism file (.prism or .pzfx) or an OpenDose project with
          the Open button above.</li>
        <li>Import an SRB/MTT plate reading to go from raw absorbance to
          IC50 in one step.</li>
      </ul>
      {error ? (
        <div className="welcome-error" role="alert">
          <p>Could not load the analysis engine: {error}</p>
          <button className="retry-btn" onClick={onRetry}>Try again</button>
        </div>
      ) : (
        <div className="welcome-loading">
          <span className="spinner" aria-hidden="true" />
          <div>
            {status || "Starting Python runtime…"}
            <div className="welcome-loading-note">
              First visit downloads the scientific runtime (~30 MB); it is
              cached for instant starts after that. The editor unlocks when
              everything is ready.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
