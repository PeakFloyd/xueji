import localFont from "next/font/local";

/**
 * The interface face: the same Noto Sans SC variable font as the intro (identical outlines, so the
 * hand-off from the intro's last frame is seamless), subset to all of GB2312 plus every character in
 * the demo data and sources. Rebuild with `python scripts/build-ui-font.py`.
 * Not preloaded: Experience loads it while the intro plays.
 */
export const uiSans = localFont({
  src: "./assets/xueji-ui.woff2",
  weight: "100 900",
  display: "block",
  variable: "--font-ui",
  preload: false,
  fallback: ["Microsoft YaHei", "PingFang SC", "system-ui", "sans-serif"],
});
