"""Build the main interface's typeface from the same Noto Sans SC variable font as the intro.

The intro font (build-intro-font.py) only holds the ~200 characters the animation draws. The
interface shows arbitrary names, course titles and agent answers, so it gets a much wider subset:
all of GB2312 (6763 hanzi + symbols), printable ASCII, Latin-1 punctuation, CJK punctuation, and
every non-ASCII character found in the demo seed data, the Python fact templates, the backend
messages and the interface source. The weight axis (100-900) is kept.

Usage (from frontend/):  python scripts/build-ui-font.py
Writes src/components/xueji/assets/xueji-ui.woff2. Needs fontTools + brotli; the source font is
shared with build-intro-font.py (scripts/.cache/NotoSansSC-VF.ttf, downloaded on first run).
"""

from __future__ import annotations

import pathlib
import urllib.request

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = ROOT.parent
CACHE = ROOT / "scripts" / ".cache"
SRC_URL = "https://github.com/google/fonts/raw/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf"
SRC_FONT = CACHE / "NotoSansSC-VF.ttf"
OUT_FONT = ROOT / "src" / "components" / "xueji" / "assets" / "xueji-ui.woff2"

SCAN = [
    (REPO / "db", {".sql", ".py"}),
    (REPO / "ai", {".py"}),
    (REPO / "backend" / "src", {".ts"}),
    (ROOT / "src", {".ts", ".tsx", ".css"}),
]


def ensure_source() -> None:
    if SRC_FONT.exists():
        return
    CACHE.mkdir(parents=True, exist_ok=True)
    print(f"downloading {SRC_URL}")
    with urllib.request.urlopen(SRC_URL) as r:
        SRC_FONT.write_bytes(r.read())


def gb2312() -> set[str]:
    out: set[str] = set()
    for hi in range(0xA1, 0xF8):
        for lo in range(0xA1, 0xFF):
            try:
                out.add(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                pass
    return out


def collect_text() -> str:
    chars = {chr(c) for c in range(0x20, 0x7F)}
    chars |= {chr(c) for c in range(0xA0, 0x100)}  # Latin-1 (·, ×, ±, °)
    chars |= {chr(c) for c in range(0x2010, 0x2070)}  # general punctuation (— ‘ ’ “ ” … ‹ ›)
    chars |= {chr(c) for c in range(0x2190, 0x21A0)}  # arrows
    chars |= {chr(c) for c in range(0x3000, 0x3040)}  # CJK punctuation
    chars |= {chr(c) for c in range(0xFF01, 0xFF5F)}  # full-width forms
    chars |= gb2312()
    for folder, suffixes in SCAN:
        if not folder.exists():
            continue
        for path in folder.rglob("*"):
            if path.suffix in suffixes and "node_modules" not in path.parts:
                try:
                    chars.update(ch for ch in path.read_text(encoding="utf-8") if ord(ch) > 0x7E)
                except UnicodeDecodeError:
                    continue
    return "".join(sorted(ch for ch in chars if ch.isprintable() or ch == " "))


def subset_font(text: str) -> None:
    font = TTFont(SRC_FONT)
    opts = Options(flavor="woff2", layout_features=["*"], name_IDs=["*"], notdef_outline=True)
    sub = Subsetter(options=opts)
    sub.populate(text=text)
    sub.subset(font)
    OUT_FONT.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(OUT_FONT)
    print(f"wrote {OUT_FONT.relative_to(ROOT)}  ({OUT_FONT.stat().st_size / 1024:.0f} KB, {len(text)} chars)")


if __name__ == "__main__":
    ensure_source()
    subset_font(collect_text())
