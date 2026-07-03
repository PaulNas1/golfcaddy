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
 *   sub-*          Subscription status badges
 *   provisional-*  Provisional-handicap indicator (purple)
 *   medal-*        Season ladder top-3 rank colors
 *   youRow-*       Season ladder "you" row highlight
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
        // 500 is identical in both modes (static). 600/700 are the
        // "primary action" / "header" shades and now differ between
        // light and dark, so they're CSS-variable-backed — see globals.css.
        brand: {
          50:  "#f0fdf4",
          100: "#dcfce7",
          200: "#bbf7d0",
          300: "#86efac",
          400: "#4ade80",
          500: "#22A44A",
          600: "var(--brand-600)", // primary action colour
          700: "var(--brand-700)", // header / top bar
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
          bg:   "var(--live-bg)",
          text: "var(--live-text)",
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
        // ── Provisional handicap indicator (purple) ───────────────────
        provisional: {
          bg:   "var(--provisional-bg)",
          text: "var(--provisional-text)",
        },
        // ── Season ladder medal ranks ──────────────────────────────────
        medal: {
          goldBorder:   "var(--medal-gold)",
          goldBg:       "var(--medal-gold-bg)",
          goldText:     "var(--medal-gold)",
          silverBorder: "var(--medal-silver)",
          silverBg:     "var(--medal-silver-bg)",
          silverText:   "var(--medal-silver)",
          bronzeBorder: "var(--medal-bronze)",
          bronzeBg:     "var(--medal-bronze-bg)",
          bronzeText:   "var(--medal-bronze)",
        },
        // ── Season ladder "you" row highlight ─────────────────────────
        youRow: {
          bg:     "var(--you-row-bg)",
          border: "var(--you-row-border)",
        },
        // ── Marketing / legal (fixed dark, not theme-reactive) ────────
        mkt: {
          page:     "var(--mkt-page)",
          body:     "var(--mkt-body)",
          card:     "var(--mkt-card)",
          card2:    "var(--mkt-card2)",
          border:   "var(--mkt-border)",
          text:     "var(--mkt-text)",
          muted:    "var(--mkt-muted)",
          faint:    "var(--mkt-faint)",
          header:   "var(--mkt-header)",
          primary:  "var(--mkt-primary)",
          accent:   "var(--mkt-accent)",
          chip:     "var(--mkt-chip)",
          chipText: "var(--mkt-chipText)",
          gold:     "var(--mkt-gold)",
          live:     "var(--mkt-live)",
          down:     "var(--mkt-down)",
          strike:   "var(--mkt-strike)",
        },
      },
    },
  },
  plugins: [],
};
export default config;
