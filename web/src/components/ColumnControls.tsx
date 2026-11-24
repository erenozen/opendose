import type { ColumnOptionsState } from "../types";
import LearnMore from "../guide/LearnMore";
import {
  COLUMN_ANALYSIS_LABELS, COMPARISONS_LABELS, DEFAULT_NORMALITY_TESTS,
  NORMALITY_TEST_LABELS, TTEST_LABELS, TWO_WAY_DIRECTION_LABELS, TWO_WAY_MODEL_LABELS,
  UNEQUAL_COMPARISONS_LABELS,
} from "../types";
import type {
  ColumnAnalysisKind, ComparisonsMethod, TTestKind,
  TwoWayComparisons, TwoWayDirection, TwoWayModel, UnequalComparisons,
} from "../types";
import { TWO_WAY_ADDITIVE_NOTE as ADDITIVE_NOTE } from "../types";
import ComparisonsPicker from "../sheets/column/comparisonsPicker";
import LogScaleOption from "../sheets/column/logScaleControls";
import EquivalenceControls from "../sheets/common/EquivalenceControls";
import { equivalenceApplies, equivalenceScale } from "../sheets/column/run";
import RmPosthocControls from "../sheets/column/rmPosthocControls";
import { OrderedTrendOption } from "../sheets/column/OrderedTrend";
import { SubjectRoleSelect } from "../sheets/column/RmCorr";
import { CompareCorrelations } from "../sheets/column/CompareCorr";
import { CustomContrastsControl } from "../sheets/common/CustomContrasts";
import { isFdrMethod, P_STACK_METHODS, type PStackMethod } from "../sheets/column/pStack";
import "../sheets/column/logScale.css";

interface Props {
  options: ColumnOptionsState;
  datasetNames: string[];
  onChange: (o: ColumnOptionsState) => void;
  /** Data entered as mean / SD / N: planned families are not available. */
  summaryData?: boolean;
  /** Subjects (rows) missing a treatment: RM ANOVA can fit the mixed model. */
  incompleteSubjects?: number;
  /** An XY table: correlation can pair X with each Y data set. */
  xyTable?: boolean;
}

export default function ColumnControls({ options, datasetNames, onChange, summaryData,
  incompleteSubjects = 0, xyTable = false }: Props) {
  const set = (patch: Partial<ColumnOptionsState>) =>
    onChange({ ...options, ...patch });

  const nameOf = (i: number) => datasetNames[i] || `Dataset ${i + 1}`;
  const pickDataset = (
    label: string, value: number, key: "datasetA" | "datasetB" | "controlIndex",
  ) => (
    <label className="check-row">
      <span>{label}</span>
      <select value={value} onChange={(e) => set({ [key]: Number(e.target.value) })}>
        {datasetNames.map((n, i) => (
          <option key={i} value={i}>{n || `Dataset ${i + 1}`}</option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="controls">
      <section>
        <h3>Analysis</h3>
        <select
          className="analysis-select"
          aria-label="Analysis"
          value={options.analysis}
          onChange={(e) => set({ analysis: e.target.value as ColumnAnalysisKind })}
        >
          {(Object.keys(COLUMN_ANALYSIS_LABELS) as ColumnAnalysisKind[])
            // ROC and Bland-Altman have their own analyses now (with graphs);
            // the entries stay for results sheets that already use them.
            .filter((k) => (k !== "roc" && k !== "bland_altman") || options.analysis === k)
            .map((k) => (
              <option key={k} value={k}>{COLUMN_ANALYSIS_LABELS[k]}</option>
            ))}
        </select>
      </section>

      {options.analysis === "column_statistics" && (
        <section>
          <h3>One-sample test (optional)</h3>
          <label className="check-row">
            <span>Hypothetical value</span>
            <input
              className="constraint-value"
              inputMode="decimal"
              placeholder="e.g. 100"
              value={options.hypothetical}
              onChange={(e) => set({ hypothetical: e.target.value })}
            />
          </label>
          {options.hypothetical.trim() !== "" && (
            <>
              <ZeroMethod value={options.zeroMethod ?? "wilcox"}
                onChange={(zeroMethod) => set({ zeroMethod })}
                what="values equal to the hypothetical median" />
              <label className="check-row">
                <input type="checkbox" checked={!!options.ratioT}
                  onChange={(e) => set({ ratioT: e.target.checked })} />
                <span>Also a one-sample ratio t test (lognormal data)</span>
              </label>
              {!summaryData && (
                <EquivalenceControls value={options} scale="difference"
                  estimate="mean − hypothetical value" onChange={set} />
              )}
            </>
          )}
        </section>
      )}

      {options.analysis === "column_statistics" && (
        <section>
          <h3>Normality tests <LearnMore id="normality" /></h3>
          <div className="shared-params">
            {Object.entries(NORMALITY_TEST_LABELS).map(([k, label]) => {
              const tests = options.normalityTests ?? DEFAULT_NORMALITY_TESTS;
              return (
                <label key={k} className="check-row">
                  <input type="checkbox" checked={tests.includes(k)}
                    onChange={(e) => set({ normalityTests: e.target.checked
                      ? [...tests, k] : tests.filter((t) => t !== k) })} />
                  <span>{label}</span>
                </label>
              );
            })}
          </div>
          <label className="check-row">
            <input type="checkbox" checked={!!options.lognormality}
              onChange={(e) => set({ lognormality: e.target.checked })} />
            <span>Also test for lognormality (the same tests on the logarithms) and compare normal
              with lognormal by likelihood</span>
          </label>
        </section>
      )}

      {options.analysis === "column_statistics" && (
        <section>
          <h3>Descriptive statistics</h3>
          <label className="check-row">
            <span>Quartiles and percentiles</span>
            <select value={options.percentileMethod ?? "linear"}
              aria-label="Percentile method"
              onChange={(e) => set({ percentileMethod: e.target.value as "linear" | "prism" })}>
              <option value="linear">Interpolate between ranks (n − 1)p + 1</option>
              <option value="prism">Rank (n + 1)p, the statistics guide&apos;s method</option>
            </select>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={!!options.descriptiveExtras}
              onChange={(e) => set({ descriptiveExtras: e.target.checked })} />
            <span>More: 10th/90th percentiles, CI of the median, geometric SD factor,
              harmonic and quadratic means, mode</span>
          </label>
          {options.descriptiveExtras && (
            <label className="check-row">
              <span>Trimmed and winsorized means, K =</span>
              <input className="constraint-value" inputMode="numeric" placeholder="off"
                aria-label="Values trimmed from each end (K)"
                value={options.trimK ?? ""} onChange={(e) => set({ trimK: e.target.value })} />
            </label>
          )}
        </section>
      )}

      {options.analysis === "ttest" && (
        <section>
          <h3>Test <LearnMore id="equal-sds" label="Welch or not?" /></h3>
          <select
            aria-label="Test"
            value={options.ttestKind}
            onChange={(e) => set({ ttestKind: e.target.value as TTestKind })}
          >
            {(Object.keys(TTEST_LABELS) as TTestKind[]).map((k) => (
              <option key={k} value={k}>{TTEST_LABELS[k]}</option>
            ))}
          </select>
          {pickDataset("Group A", options.datasetA, "datasetA")}
          {pickDataset("Group B", options.datasetB, "datasetB")}
          {options.ttestKind !== "kolmogorov_smirnov" && (
            // A <div>, not a <label>: a label's text would include these
            // options ("…Group B…"), so this select would also answer to
            // the name "Group B".
            <div className="check-row">
              <span aria-hidden="true">P value</span>
              <select value={options.ttestTails ?? "two"} aria-label="P value"
                onChange={(e) => set({ ttestTails: e.target.value as "two" | "greater" | "less" })}>
                <option value="two">Two-tailed</option>
                <option value="greater">Also one-tailed: Group A larger than Group B expected</option>
                <option value="less">Also one-tailed: Group A smaller than Group B expected</option>
              </select>
            </div>
          )}
          {options.ttestKind !== "kolmogorov_smirnov" && (options.ttestTails ?? "two") !== "two" && (
            <p className="hint-block">
              Choose the direction before looking at the data; a one-tailed P is
              half the two-tailed P only when the result goes the expected way.
              Graphs, legends and report sentences keep the two-tailed P.
            </p>
          )}
          <LogScaleOption options={options} onChange={onChange} summaryData={summaryData} />
          {!summaryData && equivalenceApplies(options) && (
            <EquivalenceControls value={options} scale={equivalenceScale(options)}
              estimate={`${nameOf(options.datasetA)}${equivalenceScale(options) === "ratio" ? "/" : " − "}${nameOf(options.datasetB)}`}
              onChange={set} />
          )}
          {options.ttestKind === "wilcoxon" && (
            <ZeroMethod value={options.zeroMethod ?? "wilcox"}
              onChange={(zeroMethod) => set({ zeroMethod })}
              what="pairs with a difference of zero" />
          )}
          {(options.ttestKind === "mann_whitney" || options.ttestKind === "wilcoxon"
            || options.ttestKind === "kolmogorov_smirnov") && (
            <p className="hint-block">
              The P value is exact for small samples (with ties too) and
              approximate for large ones; the results say which.
            </p>
          )}
        </section>
      )}

      {options.analysis === "anova" && (
        <section>
          <h3>Options</h3>
          <label className="check-row">
            <span>Type</span>
            <select
              value={options.anovaKind}
              onChange={(e) =>
                set({ anovaKind: e.target.value as "parametric" | "nonparametric" })}
            >
              <option value="parametric">Ordinary one-way ANOVA</option>
              <option value="nonparametric">Kruskal-Wallis (+ Dunn's)</option>
            </select>
          </label>
          {options.anovaKind === "parametric" && (
            <label className="check-row">
              <span>Standard deviations</span>
              <select value={options.anovaSd ?? "equal"} aria-label="Standard deviations"
                onChange={(e) => set({ anovaSd: e.target.value as "equal" | "unequal" })}>
                <option value="equal">Assume equal SDs (ordinary ANOVA)</option>
                <option value="unequal">Do not assume equal SDs (Welch and Brown-Forsythe ANOVA)</option>
              </select>
            </label>
          )}
          {options.anovaKind === "parametric" && options.anovaSd === "unequal" && (
            <>
              <label className="check-row">
                <span>Multiple comparisons</span>
                <select value={options.unequalComparisons ?? "games_howell"}
                  aria-label="Multiple comparisons"
                  onChange={(e) => set({
                    unequalComparisons: e.target.value as UnequalComparisons })}>
                  {(Object.keys(UNEQUAL_COMPARISONS_LABELS) as UnequalComparisons[]).map((k) => (
                    <option key={k} value={k}>{UNEQUAL_COMPARISONS_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              {options.unequalComparisons !== "none"
                && options.unequalComparisons !== "games_howell" && (
                <label className="check-row">
                  <span>Compare</span>
                  <select value={options.unequalFamily ?? "all"} aria-label="Comparison family"
                    onChange={(e) => set({ unequalFamily: e.target.value as "all" | "control" })}>
                    <option value="all">Every pair of means</option>
                    <option value="control">Each mean with a control</option>
                  </select>
                </label>
              )}
              {options.unequalComparisons !== "none" && options.unequalComparisons !== "games_howell"
                && options.unequalFamily === "control"
                && pickDataset("Control group", options.controlIndex, "controlIndex")}
              <p className="hint-block">
                Welch&apos;s and the Brown-Forsythe ANOVA compare means without
                assuming the groups have the same SD; the comparisons use only
                each pair&apos;s own SDs.
              </p>
            </>
          )}
          {options.anovaKind === "nonparametric" && (
            <label className="check-row">
              <input type="checkbox" checked={!!options.kwExact}
                onChange={(e) => set({ kwExact: e.target.checked })} />
              <span>Exact P value (small samples, ties included; approximate when too large)</span>
            </label>
          )}
          {options.anovaKind === "nonparametric" && (
            <label className="check-row">
              <input type="checkbox" checked={options.dunnCorrected === false}
                onChange={(e) => set({ dunnCorrected: !e.target.checked })} />
              <span>Uncorrected Dunn&apos;s test (no correction for multiple comparisons)</span>
            </label>
          )}
          {options.anovaKind === "nonparametric" && (
            <ComparisonsPicker options={options} datasetNames={datasetNames}
              onChange={onChange} summaryData={summaryData} />
          )}
          {options.anovaKind === "nonparametric" && !summaryData && (
            <OrderedTrendOption options={options} datasetNames={datasetNames}
              onChange={onChange} repeated={false} />
          )}
          {options.anovaKind === "parametric" && options.anovaSd !== "unequal" && (
            <>
              <label className="check-row">
                <span>Multiple comparisons</span>
                <select
                  value={options.comparisons}
                  onChange={(e) =>
                    set({ comparisons: e.target.value as ComparisonsMethod })}
                >
                  {(Object.keys(COMPARISONS_LABELS) as ComparisonsMethod[]).map((k) => (
                    <option key={k} value={k}>{COMPARISONS_LABELS[k]}</option>
                  ))}
                </select>
              </label>
              {options.comparisons === "dunnett" &&
                pickDataset("Control group", options.controlIndex, "controlIndex")}
              <ComparisonsPicker options={options} datasetNames={datasetNames}
                onChange={onChange} summaryData={summaryData} />
              {!summaryData && (
                <CustomContrastsControl names={datasetNames.map((n, i) => n || `Dataset ${i + 1}`)}
                  value={options.customContrasts ?? []}
                  onChange={(v) => set({ customContrasts: v })} />
              )}
              {!summaryData && (
                <label className="check-row">
                  <input type="checkbox" checked={!!options.anovaTrend}
                    onChange={(e) => set({ anovaTrend: e.target.checked })} />
                  <span>Test for linear trend (columns in the order entered)</span>
                </label>
              )}
              <LogScaleOption options={options} onChange={onChange} summaryData={summaryData} />
            </>
          )}
          <p className="guide-control-links">
            <LearnMore id="posthoc" label="Which comparisons test?" />
            <LearnMore id="equal-sds" label="Equal SDs?" />
          </p>
        </section>
      )}

      {options.analysis === "frequency" && (
        <section>
          <h3>Frequency distribution</h3>
          <label className="check-row">
            <span>Bin width (blank = automatic)</span>
            <input inputMode="decimal" value={options.freqBinWidth ?? ""} placeholder="auto"
              onChange={(e) => set({ freqBinWidth: e.target.value })} />
          </label>
          <label className="check-row">
            <span>Center of the first bin (blank = automatic)</span>
            <input inputMode="decimal" value={options.freqFirstCenter ?? ""} placeholder="auto"
              onChange={(e) => set({ freqFirstCenter: e.target.value })} />
          </label>
          <label className="check-row">
            <span>Leave out values above (blank = none)</span>
            <input inputMode="decimal" value={options.freqUpper ?? ""}
              onChange={(e) => set({ freqUpper: e.target.value })} />
          </label>
          <label className="check-row">
            <span>Tabulate</span>
            <select aria-label="Tabulate" value={options.freqTabulate ?? "counts"}
              onChange={(e) => set({ freqTabulate: e.target.value as "counts" | "fraction" | "percent" })}>
              <option value="counts">Number of values</option>
              <option value="fraction">Relative frequency (fraction)</option>
              <option value="percent">Relative frequency (percent)</option>
            </select>
          </label>
          <label className="check-row">
            <span>Cumulative</span>
            <select aria-label="Cumulative" value={options.freqCumulative ?? "none"}
              onChange={(e) => set({ freqCumulative: e.target.value as "none" | "binned" | "exact",
                freqFit: "none" })}>
              <option value="none">No (histogram)</option>
              <option value="binned">Cumulative, binned</option>
              <option value="exact">Cumulative, exact (no bins)</option>
            </select>
          </label>
          <label className="check-row">
            <span>Fit</span>
            <select aria-label="Fit" value={options.freqFit ?? "none"}
              onChange={(e) => set({ freqFit: e.target.value as "none" | "gaussian" | "cumulative_gaussian" })}>
              <option value="none">None</option>
              {(options.freqCumulative ?? "none") === "none" && <option value="gaussian">Gaussian (to the histogram)</option>}
              {options.freqCumulative === "exact" && <option value="cumulative_gaussian">Cumulative Gaussian</option>}
            </select>
          </label>
          <label className="check-row">
            <span>Replicates in a row</span>
            <select aria-label="Replicates in a row" value={options.freqReplicates ?? "each"}
              onChange={(e) => set({ freqReplicates: e.target.value as "each" | "mean" })}>
              <option value="each">Each value in its bin</option>
              <option value="mean">Only the mean of the row</option>
            </select>
          </label>
          <p className="hint-block">
            A value on the border between two bins goes into the higher bin; values below the first bin
            are left out and counted. No bin goes past the upper limit: a value exactly on the limit is
            also left out when the limit is a bin edge (as in Prism). The guide recommends the cumulative fit, which needs no bin width.
          </p>
        </section>
      )}

      {options.analysis === "p_stack" && (
        <section>
          <h3>Stack of P values</h3>
          {pickDataset("P values in", options.datasetA, "datasetA")}
          <label className="check-row">
            <span>Correction</span>
            <select aria-label="Correction" value={options.pStackMethod ?? "bky"}
              onChange={(e) => set({ pStackMethod: e.target.value as PStackMethod })}>
              {P_STACK_METHODS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
          {isFdrMethod(options.pStackMethod ?? "bky") ? (
            <label className="check-row">
              <span>Q (desired false discovery rate, %)</span>
              <input inputMode="decimal" value={options.pStackQ ?? "5"}
                onChange={(e) => set({ pStackQ: e.target.value })} />
            </label>
          ) : (
            <label className="check-row">
              <span>α (family-wise)</span>
              <input inputMode="decimal" value={options.pStackAlpha ?? "0.05"}
                onChange={(e) => set({ pStackAlpha: e.target.value })} />
            </label>
          )}
          <p className="hint-block">
            One P value per row, each from a separate comparison; row titles name them. Blank and
            excluded cells are left out of the family. Controlling the false discovery rate flags
            “discoveries” and reports a q value per comparison; the significance methods control the
            chance of any false positive in the whole family and report multiplicity-adjusted P values.
          </p>
        </section>
      )}

      {options.analysis === "median_test" && (
        <section>
          <h3>About this test</h3>
          <p className="hint-block">
            Counts, in each group, the values above and not above the median
            of all values pooled, and tests the counts with chi-square
            (and Fisher&apos;s exact test when there are two groups).
          </p>
        </section>
      )}

      {options.analysis === "cochran_q" && (
        <section>
          <h3>Layout</h3>
          <p className="hint-block">
            One subject per row and one condition per column (three or more), each cell 1 for
            yes and 0 for no. Rows missing a condition are left out. After Cochran&apos;s Q, every
            pair of conditions is compared with McNemar&apos;s test (exact binomial P), adjusted
            by Holm&apos;s method.
          </p>
        </section>
      )}

      {options.analysis === "correlation" && (
        <section>
          <h3>Options</h3>
          <label className="check-row">
            <span>Method</span>
            <select value={options.corrMethod}
              onChange={(e) =>
                set({ corrMethod: e.target.value as "pearson" | "spearman" | "kendall" })}>
              <option value="pearson">Pearson (parametric)</option>
              <option value="spearman">Spearman (nonparametric)</option>
              <option value="kendall">Kendall&apos;s tau-b (nonparametric)</option>
            </select>
          </label>
          <label className="check-row">
            <span>P value</span>
            <select value={options.corrTails ?? "two"}
              onChange={(e) => set({ corrTails: e.target.value as "two" | "greater" | "less" })}>
              <option value="two">Two-tailed</option>
              <option value="greater">Also one-tailed: positive correlation expected</option>
              <option value="less">Also one-tailed: negative correlation expected</option>
            </select>
          </label>
          {options.corrMethod === "kendall" && (
            <p className="hint-block">
              Kendall&apos;s tau-b counts concordant and discordant pairs. With no
              ties and fewer than 50 pairs the P value is exact; otherwise it uses
              the normal approximation with the tie-corrected variance (as R&apos;s
              cor.test).
            </p>
          )}
          {(options.corrTails ?? "two") !== "two" && (
            <p className="hint-block">
              Choose the direction before looking at the data; a one-tailed P is
              half the two-tailed P only when the result goes the expected way.
            </p>
          )}
          {xyTable && (
            <label className="check-row">
              <input type="checkbox" checked={!!options.corrWithX}
                onChange={(e) => set({ corrWithX: e.target.checked })} />
              <span>X against each Y data set (replicate Y values averaged per row)</span>
            </label>
          )}
          {!(xyTable && options.corrWithX) && pickDataset("Dataset A", options.datasetA, "datasetA")}
          {!(xyTable && options.corrWithX) && pickDataset("Dataset B", options.datasetB, "datasetB")}
          {!(xyTable && options.corrWithX) && (
            <SubjectRoleSelect options={options} datasetNames={datasetNames} onChange={onChange} />
          )}
          {options.corrMethod === "pearson" && !(options.corrSubject && !(xyTable && options.corrWithX)) && (
            <CompareCorrelations options={options} names={datasetNames.map((_, i) => nameOf(i))}
              withX={xyTable && !!options.corrWithX} set={set} />
          )}
        </section>
      )}

      {options.analysis === "two_way_anova" && (
        <section>
          <h3>Design</h3>
          <p className="hint-block">
            Factor A = table rows, Factor B = datasets, replicates in
            subcolumns. Every row × dataset cell needs values.
          </p>
          <label className="check-row">
            <span>Model</span>
            <select value={options.twoWayModel ?? "full"}
              onChange={(e) => set({ twoWayModel: e.target.value as TwoWayModel })}>
              {(Object.keys(TWO_WAY_MODEL_LABELS) as TwoWayModel[]).map((k) => (
                <option key={k} value={k}>{TWO_WAY_MODEL_LABELS[k]}</option>
              ))}
            </select>
          </label>
          {options.twoWayModel === "additive" && (
            <p className="hint-block">{ADDITIVE_NOTE}</p>
          )}
          <label className="check-row">
            <span>Multiple comparisons</span>
            <select value={options.twoWayComparisons}
              onChange={(e) => set({
                twoWayComparisons: e.target.value as TwoWayComparisons })}>
              <option value="none">None</option>
              <option value="tukey">Tukey</option>
              <option value="sidak">Šídák</option>
              <option value="bonferroni">Bonferroni</option>
            </select>
          </label>
          {options.twoWayComparisons !== "none" && (
            <label className="check-row">
              <span>Compare</span>
              <select value={options.twoWayDirection}
                onChange={(e) => set({
                  twoWayDirection: e.target.value as TwoWayDirection })}>
                {(Object.keys(TWO_WAY_DIRECTION_LABELS) as TwoWayDirection[])
                  .filter((k) => k !== "all_cells" || options.twoWayModel !== "additive"
                    || options.twoWayDirection === k)
                  .map((k) => (
                    <option key={k} value={k}>
                      {TWO_WAY_DIRECTION_LABELS[k]}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </section>
      )}

      {options.analysis === "rm_two_way" && (
        <section>
          <h3>Design</h3>
          <label className="check-row">
            <span>Repeated measures</span>
            <select value={options.rmTwoDesign}
              onChange={(e) => set({
                rmTwoDesign: e.target.value as "mixed" | "both" })}>
              <option value="mixed">
                By rows (datasets are independent groups)
              </option>
              <option value="both">
                Both factors (every subject in every cell)
              </option>
            </select>
          </label>
          <p className="hint-block">
            Rows = repeated factor, datasets = second factor, subcolumn
            index = subject. Mixed design: subject s of a dataset is that
            group's s-th subject. Both-repeated: subcolumn s is the same
            subject everywhere.
          </p>
        </section>
      )}

      {options.analysis === "rm_anova" && (
        <section>
          <h3>Options</h3>
          <label className="check-row">
            <span>Type</span>
            <select value={options.rmKind}
              onChange={(e) => set({
                rmKind: e.target.value as "parametric" | "nonparametric" })}>
              <option value="parametric">RM one-way ANOVA (Geisser-Greenhouse)</option>
              <option value="nonparametric">Friedman test (+ Dunn's)</option>
            </select>
          </label>
          {options.rmKind === "nonparametric" && (
            <label className="check-row">
              <input type="checkbox" checked={!!options.rmExact}
                onChange={(e) => set({ rmExact: e.target.checked })} />
              <span>Exact P value (small designs; approximate when too large)</span>
            </label>
          )}
          {options.rmKind === "nonparametric" && (
            <ComparisonsPicker options={options} datasetNames={datasetNames}
              onChange={onChange} summaryData={summaryData} />
          )}
          {options.rmKind === "nonparametric" && !summaryData && (
            <OrderedTrendOption options={options} datasetNames={datasetNames}
              onChange={onChange} repeated />
          )}
          {options.rmKind === "parametric" && !summaryData && (
            <RmPosthocControls options={options} datasetNames={datasetNames}
              onChange={onChange} incomplete={incompleteSubjects} />
          )}
          {options.rmKind === "parametric" && !summaryData && (
            <label className="check-row">
              <input type="checkbox" checked={!!options.anovaTrend}
                onChange={(e) => set({ anovaTrend: e.target.checked })} />
              <span>Test for linear trend (treatments in the order entered)</span>
            </label>
          )}
          <p className="hint-block">
            Rows are matched subjects; each dataset is one treatment.
            First subcolumn of each dataset is used.
          </p>
        </section>
      )}

      {options.analysis === "roc" && (
        <section>
          <h3>Groups</h3>
          {pickDataset("Patients (condition present)", options.datasetA, "datasetA")}
          {pickDataset("Controls (condition absent)", options.datasetB, "datasetB")}
          <p className="hint-block">
            ROC curves now have their own analysis (Analyze → ROC curve) with
            the graph, the optimal cut-off and the comparison of two markers.
          </p>
        </section>
      )}

      {options.analysis === "bland_altman" && (
        <section>
          <h3>Methods to compare</h3>
          {pickDataset("Method A", options.datasetA, "datasetA")}
          {pickDataset("Method B", options.datasetB, "datasetB")}
          <p className="hint-block">
            Bland-Altman now has its own analysis (Analyze → Bland-Altman) with
            the plot, CIs on the limits and proportional bias.
          </p>
        </section>
      )}

      {options.analysis === "outliers" && (
        <section>
          <h3>Method</h3>
          <label className="check-row">
            <select value={options.outlierMethod} aria-label="Outlier method"
              onChange={(e) => set({
                outlierMethod: e.target.value as "grubbs" | "rout" })}>
              <option value="grubbs">Grubbs (iterative ESD)</option>
              <option value="rout">ROUT (FDR-based)</option>
            </select>
          </label>
          {options.outlierMethod === "grubbs" ? (
            <label className="check-row">
              <span>Alpha</span>
              <input
                className="constraint-value"
                inputMode="decimal"
                value={options.grubbsAlpha}
                onChange={(e) => set({ grubbsAlpha: e.target.value })}
              />
            </label>
          ) : (
            <label className="check-row">
              <span>Q (%)</span>
              <input
                className="constraint-value"
                inputMode="decimal"
                value={options.routQ}
                onChange={(e) => set({ routQ: e.target.value })}
              />
            </label>
          )}
        </section>
      )}
    </div>
  );
}

function ZeroMethod({ value, onChange, what }: {
  value: "wilcox" | "pratt";
  onChange: (v: "wilcox" | "pratt") => void;
  what: string;
}) {
  return (
    <label className="check-row">
      <span>Handle {what}</span>
      <select value={value} aria-label="Zero handling"
        onChange={(e) => onChange(e.target.value as "wilcox" | "pratt")}>
        <option value="wilcox">Ignore them (Wilcoxon)</option>
        <option value="pratt">Rank them, then ignore their ranks (Pratt)</option>
      </select>
    </label>
  );
}
