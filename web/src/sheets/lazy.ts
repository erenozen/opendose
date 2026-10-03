// Registry components that load on first use (React.lazy), so the panels
// of the larger table types and of the data manipulations stay out of the
// main bundle. The shell renders every panel inside a Suspense boundary
// (components/FamilyWorkspace.tsx, layout/LiveGraph.tsx).
import { lazy, type ComponentType } from "react";

/** `module[key]` as a lazily loaded component of the same type. Pass the
 *  same `load` function for every part of one module. */
export function lazyPart<M, K extends keyof M>(load: () => Promise<M>, key: K): M[K] {
  return lazy(async () => ({
    default: (await load())[key] as unknown as ComponentType<object>,
  })) as unknown as M[K];
}
