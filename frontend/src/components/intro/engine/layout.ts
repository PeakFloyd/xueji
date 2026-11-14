import { CX, CY } from "./constants";
import { layoutWord, type Stage } from "./stage";

/** Noto Sans SC metrics (units of the em). */
export const CAP = 0.745; // Latin cap height at wght 900 (measured from the I glyph)
export const CJK_MID = 0.38; // centre of the ideographic face above the baseline

/** Geometry shared by actors that hand elements to each other. Computed once fonts are ready. */
export function makeLayout(stage: Stage) {
  // "ID" lockup: where the two letters land in segment 2 and where the morph starts.
  const idWord = layoutWord(stage, "ID", 900, 100, -0.01);
  const idK = 400 / CAP / 100; // cap height 400px
  const id = {
    word: idWord,
    k: idK,
    x: CX - (idWord.width * idK) / 2,
    base: CY + 200,
  };

  // The seal: outer frame, knocked-out hairline, inner field, 2x2 characters.
  const seal = {
    cx: CX,
    cy: CY,
    outer: 420,
    frameIn: 384,
    field: 372,
    charSize: 150,
    // Traditional seal order: right column top->bottom, then left column.
    chars: [
      { ch: "档", dx: 93, dy: -93 },
      { ch: "案", dx: 93, dy: 93 },
      { ch: "确", dx: -93, dy: -93 },
      { ch: "认", dx: -93, dy: 93 },
    ],
  };

  // End title.
  const titleSize = 188;
  const titleTrack = 0.06;
  const title = layoutWord(stage, "学籍管理系统", 900, titleSize, titleTrack);
  const tx0 = CX - title.width / 2;
  const tBase = CY + 64;
  const end = {
    size: titleSize,
    word: title,
    x0: tx0,
    x1: tx0 + title.width,
    base: tBase,
    top: tBase - 0.88 * titleSize,
    ruleY: tBase + 44,
    ruleH: 10,
  };

  return { id, seal, end };
}

export type Layout = ReturnType<typeof makeLayout>;
