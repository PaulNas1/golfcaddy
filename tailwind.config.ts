import type { Config } from "tailwindcss";

/**
 * Design tokens for GolfCaddy.
 *
 * Use these semantic names everywhere instead of raw Tailwind colours.
 * Changing the brand palette only ever requires touching this file.
 *
 * Brand tokens
 *   brand-*        Core green palette — headers, buttons, active states
 *   surface-*      Card & background tones
 *   text-*         Semantic text hierarchy (title / body / muted / hint)
 *   status-*       Live / upcoming / completed round states
 *   announce-*     Pinned announcement amber palette
 */
const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // ── Brand greens ──────────────────────────────────────────────
        brand: {
          50:  "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22c55e",
          600: "#16a34a", // primary action colour
          700: "#15803d", // header / top bar
          800: "#166534",
          900: "#14532d",
        },
        // ── Surface / card backgrounds ────────────────────────────────
        // Values driven by CSS custom properties — dark mode flips them
        // in globals.css under @media (prefers-color-scheme: dark).
        surface: {
          page:           "var(--surface-page)",
          card:           "var(--surface-card)",
          muted:          "var(--surface-muted)",
          overlay:        "var(--surface-overlay)",
          selected:       "var(--surface-selected)",
          selectedBorder: "var(--surface-selected-border)",
        },
        // ── Text hierarchy ────────────────────────────────────────────
        ink: {
          title:  "var(--ink-title)",
          body:   "var(--ink-body)",
          muted:  "var(--ink-muted)",
          hint:   "var(--ink-hint)",
          action: "var(--ink-action)",
        },
        // ── Status badges ─────────────────────────────────────────────
        // CSS-variable-driven so dark mode flips them — see globals.css
        live: {
          bg:   "#ef4444", // red-500 — solid, fine in both modes
          text: "#ffffff",
          ring: "var(--live-ring)",
        },
        upcoming: {
          bg:   "var(--upcoming-bg)",
          text: "var(--upcoming-text)",
        },
        completed: {
          bg:   "var(--completed-bg)",
          text: "var(--completed-text)",
        },
        // ── Announcement amber ────────────────────────────────────────
        // CSS-variable-driven so dark mode can flip them — see globals.css
        announce: {
          bg:     "var(--announce-bg)",
          border: "var(--announce-border)",
          text:   "var(--announce-text)",
          label:  "var(--announce-label)",
          muted:  "var(--announce-muted)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
