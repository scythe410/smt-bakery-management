// Font registration for @react-pdf/renderer. Module-level side-effect: call
// once per process; react-pdf deduplicates subsequent calls with the same family.
// TTF files live in public/fonts/ (bundled with the serverless function via Next's
// public/ copy). Paths use process.cwd() so they resolve correctly on Vercel.
//
// Only the weights actually used in the PDF are registered:
//   Archivo 700  — headings, hero figures, monogram
//   Inter 400    — body text, table cells
//   Inter 600    — column headers, totals, bold labels

import path from "path";
import { Font } from "@react-pdf/renderer";

const pub = (file: string) => path.join(process.cwd(), "public", "fonts", file);

let registered = false;

export function registerFonts() {
  if (registered) return;
  registered = true;

  Font.register({
    family: "Archivo",
    fonts: [{ src: pub("archivo-bold.ttf"), fontWeight: 700 }],
  });

  Font.register({
    family: "Inter",
    fonts: [
      { src: pub("inter-regular.ttf"), fontWeight: 400 },
      { src: pub("inter-semibold.ttf"), fontWeight: 600 },
    ],
  });

  Font.registerHyphenationCallback((word) => [word]);
}
