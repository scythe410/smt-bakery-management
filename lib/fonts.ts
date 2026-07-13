import { Archivo, Inter, Noto_Sans_Sinhala } from "next/font/google";

// Display face — headings, big money figures, nav-brand (DESIGN.md §3).
export const archivo = Archivo({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-archivo",
  display: "swap",
});

// Body / UI — labels, tables, buttons, inputs.
export const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

// Sinhala — applied only when lang="si" (via the `font-sinhala` body class).
// `preload: false` so the ~English majority never pays for it: next/font emits
// no <link rel="preload"> for it, and the browser only fetches the font files
// when the `font-sinhala` class actually renders Sinhala glyphs. Sinhala users
// take a one-time swap (FOUT) on first paint instead of a preload — an
// acceptable trade for cutting the preload off every English page load. (A
// per-request conditional preload isn't expressible in a single next/font
// declaration.) Verify glyph coverage and line-height on target devices.
export const notoSansSinhala = Noto_Sans_Sinhala({
  subsets: ["sinhala"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sinhala",
  display: "swap",
  preload: false,
});
