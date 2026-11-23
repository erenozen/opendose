"""Make the fonts that PDF and image exports embed (src/export/fonts/).

  python scripts/make-export-fonts.py <Inter-Regular.ttf> <Inter-Bold.ttf> \
      <LiberationSans-Regular.ttf> <LiberationSans-Bold.ttf>

Sources: Inter 4.1, extras/ttf/ in
https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip (the
release the app's @fontsource-variable/inter ships as its web font), and
Liberation Sans 2.1.5 (metric-compatible with Arial and Helvetica, the
classic graph theme's font). Both are under the SIL Open Font License 1.1
(LICENSE-Inter.txt, LICENSE-LiberationSans.txt next to the fonts).

Each font is cut to the characters graphs use (Latin, Greek, punctuation,
super- and subscripts, letterlike symbols, arrows, mathematical operators,
geometric shapes) without hinting or layout tables. Liberation's licence
reserves the names "Liberation", "Arimo", "Tinos" and "Cousine" for the
unmodified fonts, so the cut copy is renamed "OpenDose Sans Classic" (OFL
section 3). Needs fontTools (pip install fonttools).
"""
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

UNICODES = ("U+0020-007E,U+00A0-017F,U+0192,U+02C6-02C7,U+02D8-02DD,U+0370-03FF,"
            "U+2000-206F,U+2070-209F,U+20AC,U+2100-214F,U+2190-21FF,U+2200-22FF,"
            "U+25A0-25FF,U+FFFD")
OUT = Path(__file__).resolve().parent.parent / "src" / "export" / "fonts"


def cut(src: str, dest: Path, rename: str | None, style: str) -> None:
    opts = subset.Options()
    opts.layout_features = []
    opts.hinting = False
    opts.name_IDs = ["*"]
    opts.notdef_outline = True
    font = TTFont(src)
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    if rename:
        ps = rename.replace(" ", "") + "-" + style
        full = rename + ("" if style == "Regular" else f" {style}")
        for rec in font["name"].names:
            if rec.nameID in (1, 16):
                rec.string = rename
            elif rec.nameID == 3:
                rec.string = f"OpenDose subset of Liberation Sans {style}: {ps}"
            elif rec.nameID == 4:
                rec.string = full
            elif rec.nameID == 6:
                rec.string = ps
            elif rec.nameID in (17,):
                rec.string = style
    font.save(dest)
    print(f"{dest.name}: {dest.stat().st_size} bytes, {len(font.getGlyphOrder())} glyphs")


def ranges(path: Path) -> str:
    """The characters a font has, as "20-7e,a0-17f,...": export/pdfFonts.ts
    reads it to send a label to a font that can show every character."""
    cps = sorted(TTFont(path).getBestCmap())
    out, start, prev = [], cps[0], cps[0]
    for c in cps[1:] + [None]:
        if c is not None and c == prev + 1:
            prev = c
            continue
        out.append(f"{start:x}" if start == prev else f"{start:x}-{prev:x}")
        if c is not None:
            start = prev = c
    return ",".join(out)


if __name__ == "__main__":
    inter_r, inter_b, lib_r, lib_b = sys.argv[1:5]
    OUT.mkdir(parents=True, exist_ok=True)
    cut(inter_r, OUT / "Inter-Regular.ttf", None, "Regular")
    cut(inter_b, OUT / "Inter-Bold.ttf", None, "Bold")
    cut(lib_r, OUT / "OpenDoseSansClassic-Regular.ttf", "OpenDose Sans Classic", "Regular")
    cut(lib_b, OUT / "OpenDoseSansClassic-Bold.ttf", "OpenDose Sans Classic", "Bold")
    # bold and regular cover the same characters in both families
    both = lambda a, b: ranges(a) if ranges(a) == ranges(b) else sys.exit(f"{a} and {b} differ")  # noqa: E731
    cover = {
        "inter": both(OUT / "Inter-Regular.ttf", OUT / "Inter-Bold.ttf"),
        "classic": both(OUT / "OpenDoseSansClassic-Regular.ttf", OUT / "OpenDoseSansClassic-Bold.ttf"),
    }
    (OUT / "coverage.json").write_text(json.dumps(cover, indent=1) + "\n")
