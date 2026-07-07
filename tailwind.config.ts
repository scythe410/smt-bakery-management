import type { Config } from "tailwindcss";

/**
 * Semantic tokens map to the CSS variables defined in app/globals.css (:root),
 * which are derived from DESIGN.md §2. Re-theming touches only DESIGN.md/globals.css.
 * Referenced from globals.css via `@config` (Tailwind v4 uses CSS-first config).
 */
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          2: "var(--surface-2)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        ink: "var(--text)",
        muted: "var(--text-muted)",
        faint: "var(--text-faint)",
        brand: {
          DEFAULT: "var(--brand-red)",
          ember: "var(--brand-ember)",
          black: "var(--brand-black)",
          white: "var(--brand-white)",
        },
        success: {
          DEFAULT: "var(--success)",
          bg: "var(--success-bg)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          bg: "var(--warning-bg)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          bg: "var(--danger-bg)",
        },
        info: {
          DEFAULT: "var(--info)",
          bg: "var(--info-bg)",
        },
        "red-tint": "var(--red-tint)",
      },
      fontFamily: {
        display: ["var(--font-archivo)", "ui-sans-serif", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        sinhala: ["var(--font-noto-sinhala)", "var(--font-inter)", "sans-serif"],
      },
      fontSize: {
        // DESIGN.md §3 mobile scale (size, line-height, weight)
        "display-xl": ["34px", { lineHeight: "38px", fontWeight: "700" }],
        "display-lg": ["26px", { lineHeight: "30px", fontWeight: "700" }],
        h1: ["20px", { lineHeight: "28px", fontWeight: "700" }],
        h2: ["16px", { lineHeight: "22px", fontWeight: "600" }],
        body: ["14px", { lineHeight: "20px", fontWeight: "400" }],
        label: ["13px", { lineHeight: "18px", fontWeight: "500" }],
        caption: ["11px", { lineHeight: "16px", fontWeight: "500" }],
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
};

export default config;
