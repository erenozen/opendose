import { createContext } from "react";

/**
 * Inside an analysis's settings, a number box may hold a reference to a
 * value kept elsewhere (an Info-sheet constant, "@Dilution_factor",
 * project/infoRefs.ts). The provider resolves a reference to the text it
 * stands for, or null when it names nothing; the field then checks the
 * resolved value. Outside a provider a reference is not a number.
 */
export const NumberRefs = createContext<((raw: string) => string | null) | null>(null);
