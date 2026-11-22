// Above a survival table: the covariate columns Cox regression can use.
// Each covariate is one more subcolumn in every group, after Time and
// Event; its title is its name.
import "../common/clinical.css";
import { Button, IconButton } from "../../components/ui";
import { CloseIcon } from "../../components/ui/feedbackIcons";
import { PlusIcon } from "../common/gridIcons";
import type { AsideProps } from "../types";
import {
  addSurvivalCovariate, removeSurvivalCovariate, renameSurvivalCovariate,
  survivalCovariateNames,
} from "./covariates";

export default function CovariateAside({ table, readOnly, onChange }: AsideProps) {
  const names = survivalCovariateNames(table);
  const add = () => onChange((t) => addSurvivalCovariate(t, `Covariate ${survivalCovariateNames(t).length + 1}`));
  return (
    <div className="cov-aside" role="group" aria-label="Covariates for Cox regression">
      <span className="cov-label">Covariates for Cox regression</span>
      {names.length === 0 && <span className="cov-none">none</span>}
      {names.map((n, k) => (
        <span className="cov-chip" key={k}>
          <input value={table.datasets[0]?.subTitles?.[2 + k] ?? n} disabled={readOnly}
            aria-label={`Name of covariate ${k + 1}`}
            onChange={(e) => onChange((t) => renameSurvivalCovariate(t, k, e.target.value), `cov:${k}`)} />
          <IconButton size="sm" disabled={readOnly} aria-label={`Remove covariate ${n}`}
            title={`Remove ${n} from every group`}
            onClick={() => onChange((t) => removeSurvivalCovariate(t, k))}><CloseIcon /></IconButton>
        </span>
      ))}
      <Button variant="ghost" size="sm" className="cov-add" disabled={readOnly} onClick={add}
        title="One more column per subject (age, sex, dose…) in every group. Kaplan-Meier and the log-rank test ignore covariates.">
        <PlusIcon />Add covariate
      </Button>
    </div>
  );
}
