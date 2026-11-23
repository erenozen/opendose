// "Sizes in: px / pt" of the format dialogs (sizeUnit.ts), kept per browser.
import { useState } from "react";
import { readSizeUnit, writeSizeUnit, type SizeUnit } from "./sizeUnit";

export function useSizeUnit(): [SizeUnit, (u: SizeUnit) => void] {
  const [unit, setUnit] = useState<SizeUnit>(readSizeUnit);
  return [unit, (u) => { setUnit(u); writeSizeUnit(u); }];
}
