import { useEffect, useState } from "react";
import {
  isDarkMode, onThemeChange, SCHEME_LIST, SCHEMES, seriesStyle,
  type SchemeId,
} from "../lib/palette";

interface Props {
  value: SchemeId;
  onChange: (id: SchemeId) => void;
}

// The swatch draws the marker the series will actually get, not a plain
// chip. Without that the black-and-white scheme previews as four identical
// squares, hiding the very thing that separates its series.
const SHAPES: Record<string, string> = {
  circle: "M8,3.2A4.8,4.8 0 1,1 7.99,3.2Z",
  square: "M3.4,3.4H12.6V12.6H3.4Z",
  diamond: "M8,2.6L13.4,8L8,13.4L2.6,8Z",
  "triangle-up": "M8,2.8L13.6,13.2H2.4Z",
  "triangle-down": "M8,13.2L2.4,2.8H13.6Z",
  star: "M8,2.2L9.6,6.4L14,6.6L10.6,9.4L11.7,13.6L8,11.2L4.3,13.6L5.4,9.4"
    + "L2,6.6L6.4,6.4Z",
  hexagon: "M8,2.4L13,5.2V10.8L8,13.6L3,10.8V5.2Z",
};

export default function SchemePicker({ value, onChange }: Props) {
  const [dark, setDark] = useState(isDarkMode());
  useEffect(() => onThemeChange(() => setDark(isDarkMode())), []);

  const scheme = SCHEMES[value] ?? SCHEME_LIST[0];
  // Preview as many slots as the scheme has distinct colors, but never so
  // few that the symbol variation is invisible.
  const shown = Math.max((dark ? scheme.dark : scheme.light).length, 4);

  return (
    <div className="scheme-picker">
      <label>
        Colors
        <select
          value={value}
          aria-label="Graph color scheme"
          onChange={(e) => onChange(e.target.value as SchemeId)}
        >
          {SCHEME_LIST.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </label>
      <svg
        className="scheme-swatches"
        width={shown * 17} height={16} role="img"
        aria-label={`${scheme.label}: ${shown} series styles`}
      >
        {Array.from({ length: shown }, (_, i) => {
          const { color, symbol } = seriesStyle(i, dark, value);
          return (
            <path
              key={i}
              transform={`translate(${i * 17},0)`}
              d={SHAPES[symbol] ?? SHAPES.circle}
              fill={color}
            />
          );
        })}
      </svg>
      <span className="scheme-note">{scheme.note}</span>
    </div>
  );
}
