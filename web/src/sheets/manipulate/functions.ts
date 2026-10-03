// Short descriptions for the formula function reference. The list of
// names comes from the engine (formula_transform, mode "functions"); a
// name the engine knows but this table does not still shows, with its
// name only, so the reference never goes stale.

export interface FunctionDoc {
  sig: string;
  desc: string;
  group: string;
}

const G = {
  arith: "Arithmetic and rounding",
  exp: "Exponents and logarithms",
  trig: "Trigonometry (radians)",
  dist: "Probability distributions",
  rand: "Random numbers",
  agg: "Whole-column statistics",
  special: "Special functions",
  logic: "Logic and conditions",
  text: "Text and units",
};

export const FUNCTION_GROUPS = Object.values(G);

export const FUNCTION_DOCS: Record<string, FunctionDoc> = {
  ABS: { sig: "ABS(k)", desc: "Absolute value.", group: G.arith },
  CEIL: { sig: "CEIL(k)", desc: "Smallest integer not less than k.", group: G.arith },
  FLOOR: { sig: "FLOOR(k)", desc: "Largest integer not greater than k.", group: G.arith },
  INT: { sig: "INT(k)", desc: "Integer part (drops the fraction toward zero).", group: G.arith },
  FRAC: { sig: "FRAC(k)", desc: "Fractional part: k − INT(k).", group: G.arith },
  ROUND: { sig: "ROUND(k, d)", desc: "Round to d decimal places (halves away from zero); d defaults to 0.", group: G.arith },
  SGN: { sig: "SGN(k)", desc: "Sign: −1, 0 or 1.", group: G.arith },
  SQR: { sig: "SQR(k)", desc: "Square, k × k.", group: G.arith },
  SQRT: { sig: "SQRT(k)", desc: "Square root; blank for negative k.", group: G.arith },
  MAX: { sig: "MAX(a, b, …)", desc: "Largest argument; with one argument, the largest value of that column.", group: G.arith },
  MIN: { sig: "MIN(a, b, …)", desc: "Smallest argument; with one argument, the smallest value of that column.", group: G.arith },
  SUM: { sig: "SUM(a, b, …)", desc: "Sum of the arguments; with one argument, the column total.", group: G.arith },
  FACT: { sig: "FACT(n)", desc: "Factorial n!.", group: G.arith },
  PERC: { sig: "PERC(k)", desc: "k as a fraction: k / 100.", group: G.text },

  EXP: { sig: "EXP(k)", desc: "e raised to the power k.", group: G.exp },
  LN: { sig: "LN(k)", desc: "Natural logarithm; blank for k ≤ 0.", group: G.exp },
  LOG: { sig: "LOG(k)", desc: "Base-10 logarithm; blank for k ≤ 0.", group: G.exp },
  LOG10: { sig: "LOG10(k)", desc: "Base-10 logarithm (same as LOG).", group: G.exp },
  LOG2: { sig: "LOG2(k)", desc: "Base-2 logarithm.", group: G.exp },
  LOGIT: { sig: "LOGIT(p)", desc: "ln(p / (1 − p)) for 0 < p < 1.", group: G.exp },

  SIN: { sig: "SIN(k)", desc: "Sine.", group: G.trig },
  COS: { sig: "COS(k)", desc: "Cosine.", group: G.trig },
  TAN: { sig: "TAN(k)", desc: "Tangent.", group: G.trig },
  ARCSIN: { sig: "ARCSIN(k)", desc: "Inverse sine, −1 ≤ k ≤ 1.", group: G.trig },
  ARCCOS: { sig: "ARCCOS(k)", desc: "Inverse cosine, −1 ≤ k ≤ 1.", group: G.trig },
  ARCTAN: { sig: "ARCTAN(k)", desc: "Inverse tangent.", group: G.trig },
  ARCTAN2: { sig: "ARCTAN2(y, x)", desc: "Angle of the point (x, y), in the right quadrant.", group: G.trig },
  SINH: { sig: "SINH(k)", desc: "Hyperbolic sine.", group: G.trig },
  COSH: { sig: "COSH(k)", desc: "Hyperbolic cosine.", group: G.trig },
  TANH: { sig: "TANH(k)", desc: "Hyperbolic tangent.", group: G.trig },
  ARCSINH: { sig: "ARCSINH(k)", desc: "Inverse hyperbolic sine.", group: G.trig },
  ARCCOSH: { sig: "ARCCOSH(k)", desc: "Inverse hyperbolic cosine, k ≥ 1.", group: G.trig },
  ARCTANH: { sig: "ARCTANH(k)", desc: "Inverse hyperbolic tangent, |k| < 1.", group: G.trig },
  RAD: { sig: "RAD(deg)", desc: "Degrees to radians.", group: G.trig },
  DEG: { sig: "DEG(rad)", desc: "Radians to degrees.", group: G.trig },

  NORMDIST: { sig: "NORMDIST(x, mean, sd, tail)", desc: "Normal distribution probability; tail is \"left\" (default), \"right\", \"one\" or \"two\".", group: G.dist },
  NORMINV: { sig: "NORMINV(p, mean, sd, tail)", desc: "Value with that tail probability under a normal distribution.", group: G.dist },
  NORMPDF: { sig: "NORMPDF(x, mean, sd)", desc: "Normal probability density.", group: G.dist },
  ZDIST: { sig: "ZDIST(z, tail)", desc: "Standard normal probability of z (tail as for NORMDIST).", group: G.dist },
  ZINV: { sig: "ZINV(p, tail)", desc: "z with that tail probability.", group: G.dist },
  ZPDF: { sig: "ZPDF(z)", desc: "Standard normal density.", group: G.dist },
  TDIST: { sig: "TDIST(t, df)", desc: "Right-tail (one-tailed) P value of t with df degrees of freedom; double it for two tails.", group: G.dist },
  TINV: { sig: "TINV(p, df)", desc: "t whose two-tailed P value is p.", group: G.dist },
  TPDF: { sig: "TPDF(t, df)", desc: "t distribution density.", group: G.dist },
  CHIDIST: { sig: "CHIDIST(chi2, df)", desc: "Right-tail P value of a chi-square value.", group: G.dist },
  CHIINV: { sig: "CHIINV(p, df)", desc: "Chi-square value with right-tail probability p.", group: G.dist },
  CHISQC: { sig: "CHISQC(chi2, df)", desc: "Left-tail (cumulative) chi-square probability.", group: G.dist },
  FDIST: { sig: "FDIST(F, dfn, dfd)", desc: "Right-tail P value of an F ratio.", group: G.dist },
  FINV: { sig: "FINV(p, dfn, dfd)", desc: "F ratio with right-tail probability p.", group: G.dist },
  FPDF: { sig: "FPDF(F, dfn, dfd)", desc: "F distribution density.", group: G.dist },
  BINOMIAL: { sig: "BINOMIAL(k, n, p)", desc: "Probability of k or more successes in n trials with success probability p.", group: G.dist },
  ERF: { sig: "ERF(k)", desc: "Error function.", group: G.dist },
  ERFC: { sig: "ERFC(k)", desc: "Complementary error function, 1 − ERF(k).", group: G.dist },
  PROBIT: { sig: "PROBIT(p)", desc: "Classical probit: 5 plus the z score whose left-tail probability is p.", group: G.dist },

  GAUSS: { sig: "GAUSS(mean, sd)", desc: "A random number from a normal distribution (a new draw for every value).", group: G.rand },
  RND: { sig: "RND(low, high)", desc: "A uniformly distributed random number between low and high.", group: G.rand },

  MEAN: { sig: "MEAN(col)", desc: "Mean of a whole column, the same on every row.", group: G.agg },
  STDEV: { sig: "STDEV(col)", desc: "Standard deviation of a whole column.", group: G.agg },
  STDERR: { sig: "STDERR(col)", desc: "Standard error of the mean of a whole column.", group: G.agg },
  COUNT: { sig: "COUNT(col)", desc: "Number of values (non-blank) in a column.", group: G.agg },
  CENTER: { sig: "CENTER(col)", desc: "Each value minus the column mean.", group: G.agg },
  STANDARDIZE: { sig: "STANDARDIZE(col)", desc: "z score of each value: (value − mean) / SD.", group: G.agg },

  GAMMA: { sig: "GAMMA(k)", desc: "Gamma function.", group: G.special },
  GAMMALN: { sig: "GAMMALN(k)", desc: "Natural log of the gamma function.", group: G.special },
  IGAMMA: { sig: "IGAMMA(a, x)", desc: "Regularized lower incomplete gamma function.", group: G.special },
  IGAMMAC: { sig: "IGAMMAC(a, x)", desc: "Regularized upper incomplete gamma function.", group: G.special },
  PSI: { sig: "PSI(k)", desc: "Digamma function.", group: G.special },
  BETA: { sig: "BETA(a, b)", desc: "Beta function.", group: G.special },
  IBETA: { sig: "IBETA(a, b, x)", desc: "Regularized incomplete beta function, 0 ≤ x ≤ 1.", group: G.special },
  BESSELJ: { sig: "BESSELJ(n, x)", desc: "Bessel function of the first kind.", group: G.special },
  BESSELY: { sig: "BESSELY(n, x)", desc: "Bessel function of the second kind (x > 0).", group: G.special },
  BESSELI: { sig: "BESSELI(n, x)", desc: "Modified Bessel function of the first kind.", group: G.special },
  BESSELK: { sig: "BESSELK(n, x)", desc: "Modified Bessel function of the second kind (x > 0).", group: G.special },
  HYPGEOMETRICM: { sig: "HYPGEOMETRICM(a, b, x)", desc: "Confluent hypergeometric function M (1F1).", group: G.special },
  HYPGEOMETRICU: { sig: "HYPGEOMETRICU(a, b, x)", desc: "Confluent hypergeometric function U.", group: G.special },
  HYPGEOMETRICF: { sig: "HYPGEOMETRICF(a, b, c, x)", desc: "Gauss hypergeometric function 2F1, |x| < 1.", group: G.special },

  IF: { sig: "IF(condition, then, else)", desc: "then where the condition holds, else otherwise. Y/0 makes a blank.", group: G.logic },
  AND: { sig: "AND(a, b, …)", desc: "True when every condition holds (also infix: a AND b).", group: G.logic },
  OR: { sig: "OR(a, b, …)", desc: "True when any condition holds (also infix: a OR b).", group: G.logic },
  NOT: { sig: "NOT(a)", desc: "True when the condition does not hold.", group: G.logic },
  IS_DEFINED: { sig: "IS_DEFINED(k)", desc: "1 when k has a value, 0 when it is blank.", group: G.logic },

  CONCATENATE: { sig: "CONCATENATE(a, b, …)", desc: "Joins values as text; the result counts as a number where it reads as one.", group: G.text },
};

/** Variables and operators shown above the function list. */
export const FORMULA_BASICS: { sig: string; desc: string }[] = [
  { sig: "X, Y", desc: "The X value and each Y value of the row." },
  { sig: "A, B, C…", desc: "Another data set on the same row (the mean of its replicates)." },
  { sig: "K (or any name)", desc: "A constant you define below the formulas." },
  { sig: "PI, E", desc: "π and e." },
  { sig: "+ − * / ^", desc: "Arithmetic; ^ is a power. a MOD b is the remainder." },
  { sig: "= <> < > <= >=", desc: "Comparisons, for IF and the logic functions." },
  { sig: "<B> Y = …", desc: "A line that applies only to data set B; <~A> means every data set except A." },
];

export const FORMULA_EXAMPLES: { label: string; x?: string; y?: string }[] = [
  { label: "Double every Y", y: "Y = Y*2" },
  { label: "log of X (concentrations)", x: "X = log(X)" },
  { label: "Percent of a constant", y: "Y = 100*Y/K" },
  { label: "Blank negative values", y: "Y = IF(Y<0, Y/0, Y)" },
  { label: "Subtract data set A from the others", y: "<~A> Y = Y - A" },
  { label: "Add Gaussian noise (SD 5)", y: "Y = Y + GAUSS(0, 5)" },
];
