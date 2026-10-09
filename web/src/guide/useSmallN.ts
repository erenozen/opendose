// The engine numbers behind the small-n guidance (guide/smallN.ts): the
// detectable effect at n = 2–3 (the result's design_sensitivity block, or
// the power handler) and, when P is withheld, the n per group a test would
// need. Background priority, cached per design; never blocks the results.
import { useEffect, useMemo, useState } from "react";
import { useProject } from "../app/context";
import { analyzeAsync } from "../lib/engine";
import { withheldInfo } from "../sheets/common/withheld";
import {
  neededFromPower, neededPayloads, sensitivityDesign, sensitivityFromPower,
  sensitivityOfResult, sensitivityPayload, type NeededN, type Sensitivity,
} from "./smallN";

const cache = new Map<string, unknown>();

async function ask(payload: unknown): Promise<unknown> {
  const key = JSON.stringify(payload);
  if (cache.has(key)) return cache.get(key);
  try {
    const r = await analyzeAsync(payload, { priority: "background" });
    cache.set(key, r);
    return r;
  } catch {
    return null;
  }
}

export function useSmallN(result: unknown): { sensitivity: Sensitivity | null; needed: NeededN[] | null } {
  const { engineReady } = useProject();
  const own = useMemo(() => sensitivityOfResult(result), [result]);
  const design = useMemo(() => (own ? null : sensitivityDesign(result)), [own, result]);
  const withheld = useMemo(() => !!withheldInfo(result), [result]);
  const designKey = design ? JSON.stringify(design) : "";
  const [sens, setSens] = useState<{ key: string; s: Sensitivity | null } | null>(null);
  const [needed, setNeeded] = useState<NeededN[] | null>(null);

  useEffect(() => {
    if (!design || !engineReady) return;
    let live = true;
    void ask(sensitivityPayload(design)).then((r) => {
      if (live) setSens({ key: designKey, s: sensitivityFromPower(r, design) });
    });
    return () => { live = false; };
    // designKey stands for design
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designKey, engineReady]);

  useEffect(() => {
    if (!withheld || !engineReady || needed) return;
    let live = true;
    void Promise.all(neededPayloads().map(ask)).then((rs) => {
      if (live) setNeeded(neededFromPower(rs));
    });
    return () => { live = false; };
  }, [withheld, engineReady, needed]);

  return {
    sensitivity: own ?? (sens && sens.key === designKey ? sens.s : null),
    needed: withheld ? needed : null,
  };
}
