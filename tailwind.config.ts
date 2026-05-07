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
          page:    "var(--surface-page)",
          card:    "var(--surface-card)",
          muted:   "var(--surface-muted)",
          overlay: "var(--surface-overlay)",
        },
        // ── Text hierarchy ────────────────────────────────────────────
        ink: {
          title:  "var(--ink-title)",
          body:   "var(--ink-body)",
          muted:  "var(--ink-muted)",
          hint:   "var(--ink-hint)",
        },
        // ── Status badges ─────────────────────────────────────────────
        live: {
          bg:   "#ef4444", // red-500
          text: "#ffffff",
          ring: "#fca5a5", // red-300
        },
        upcoming: {
          bg:   "#dbeafe", // blue-100
          text: "#1d4ed8", // blue-700
        },
        completed: {
          bg:   "#f3f4f6", // gray-100
          text: "#4b5563", // gray-600
        },
        // ── Announcement amber ────────────────────────────────────────
        announce: {
          bg:     "#fffbeb", // amber-50
          border: "#fde68a", // amber-200
          text:   "#78350f", // amber-900
          label:  "#92400e", // amber-800
          muted:  "#b45309", // amber-700
        },
      },
    },
  },
  plugins: [],
};
export default config;
