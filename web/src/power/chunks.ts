// Chunked engine runs for the planning simulations (nested-design power,
// dose-series fits): many small engine requests, the page yields between
// them, progress after each, Stop checked between chunks, and every
// chunk seeded from one base seed (seed + chunk index) so a seed
// reproduces the whole run. Pure (no React), unit-tested in
// __tests__/chunks.test.ts.

export interface ChunkOutcome<T> {
  chunks: T[];
  done: number;
  cancelled: boolean;
}

/** Runs `total` repeats in chunks of at most `size`: call(n, seed) does
 *  one engine request for n repeats. */
export async function runChunks<T>(total: number, size: number, seed: number,
  call: (n: number, seed: number) => Promise<T>,
  onProgress: (done: number) => void, shouldStop: () => boolean): Promise<ChunkOutcome<T>> {
  const chunks: T[] = [];
  let done = 0;
  let cancelled = false;
  for (let i = 0; done < total; i++) {
    if (shouldStop()) { cancelled = true; break; }
    const n = Math.min(size, total - done);
    chunks.push(await call(n, seed + i));
    done += n;
    onProgress(done);
    await new Promise((res) => setTimeout(res, 0));
  }
  return { chunks, done, cancelled };
}

/** A new random seed (shown, so the run can be repeated). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

/** The typed seed, or null for "draw a new one"; a problem otherwise. */
export function parseSeed(text: string): { seed: number | null } | { error: string } {
  const t = text.trim();
  if (!t) return { seed: null };
  if (!/^\d+$/.test(t) || Number(t) > 2 ** 31) return { error: "Enter a whole number, or leave it blank for a new seed" };
  return { seed: Number(t) };
}
