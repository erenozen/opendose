// The current colour theme as React state, following changes.
import { useEffect, useState } from "react";
import { isDarkMode, onThemeChange } from "../lib/palette";

export function useDarkMode(): boolean {
  const [dark, setDark] = useState(isDarkMode());
  useEffect(() => onThemeChange(() => setDark(isDarkMode())), []);
  return dark;
}
