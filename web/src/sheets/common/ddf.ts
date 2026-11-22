// Denominator degrees of freedom of the mixed-effects models (engine:
// opendose/ddfm.py): Kenward-Roger, Satterthwaite or containment.
//
// Prism 11.2 made Kenward-Roger the default for mixed models and keeps
// the containment method as "Legacy". New sheets start with
// Kenward-Roger; a sheet saved before the setting existed has no value
// and keeps the containment df it was computed with. Pure: unit-tested
// with node --test.

export type DdfMethod = "kenward_roger" | "satterthwaite" | "containment";

export const DDF_METHODS: DdfMethod[] = ["kenward_roger", "satterthwaite", "containment"];

/** The method of new sheets. */
export const DDF_NEW_SHEET: DdfMethod = "kenward_roger";

export const DDF_LABELS: Record<DdfMethod, string> = {
  kenward_roger: "Kenward-Roger (Prism 11.2 default)",
  satterthwaite: "Satterthwaite",
  containment: "Containment (Prism's Legacy; RM ANOVA df)",
};

/** The stored setting; absent or unknown = containment (sheets saved
 *  before the setting existed keep their results). */
export function ddfOf(v: unknown): DdfMethod {
  return v === "kenward_roger" || v === "satterthwaite" ? v : "containment";
}

/** Short name for results lines ("Kenward-Roger"). */
export function ddfName(m: DdfMethod): string {
  return m === "kenward_roger" ? "Kenward-Roger" : m === "satterthwaite" ? "Satterthwaite" : "containment";
}

/** The hint under the setting. */
export const DDF_HINT = "Kenward-Roger and Satterthwaite give each test and comparison its own df "
  + "from the fitted model, which matters when values are missing; with complete data all three "
  + "give the RM ANOVA's df. Kenward-Roger also adjusts the standard errors for small samples. "
  + "The Geisser-Greenhouse correction applies to the containment df only.";

/** The Methods sentence on the df method ("" for containment, which the
 *  existing sentences describe). */
export function ddfMethodsSentence(m: DdfMethod): string {
  if (m === "kenward_roger") {
    return "Denominator degrees of freedom and standard errors were computed by the Kenward-Roger "
      + "method (Kenward & Roger 1997), each test and comparison with its own df.";
  }
  if (m === "satterthwaite") {
    return "Denominator degrees of freedom were computed by Satterthwaite's method (as in "
      + "lmerTest; Kuznetsova et al. 2017), each test and comparison with its own df.";
  }
  return "";
}
