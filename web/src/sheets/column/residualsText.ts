// Wording of the engine's residual warnings for the Residuals section.
/** The engine counts rows from 0 ("row 2, counting from 0"); the grid
 *  numbers them from 1 ("row 3"). */
export function rowsFromOne(w: string): string {
  return w.replace(/\b(rows?) ([\d, ]+), counting from 0/g, (_, word: string, list: string) =>
    `${word} ${list.split(",").map((x) => Number(x.trim()) + 1).join(", ")}`);
}
