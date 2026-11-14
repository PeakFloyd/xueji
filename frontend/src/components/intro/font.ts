import localFont from "next/font/local";

/**
 * The intro's single typeface: Noto Sans SC (Google Fonts, OFL), variable weight 100-900,
 * subset to the exact characters the intro uses. Rebuild with `python scripts/build-intro-font.py`.
 */
export const introSans = localFont({
  src: "./assets/intro-sans.woff2",
  weight: "100 900",
  display: "block",
  variable: "--font-intro",
  fallback: ["system-ui", "sans-serif"],
});
