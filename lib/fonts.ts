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

// Sinhala — loaded now, applied later (when lang="si"). Verify glyph coverage
// and line-height on target devices before switching it on.
export const notoSansSinhala = Noto_Sans_Sinhala({
  subsets: ["sinhala"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-noto-sinhala",
  display: "swap",
});
