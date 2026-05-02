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
        surface: {
          page:    "#f9fafb", // app page background  (gray-50)
          card:    "#ffffff", // elevated card
          muted:   "#f3f4f6", // subtle input / stat bg (gray-100)
          overlay: "#e5e7eb", // divider / border      (gray-200)
        },
        // ── Text hierarchy ────────────────────────────────────────────
        ink: {
          title:  "#111827", // heavy headings        (gray-900)
          body:   "#374151", // body copy             (gray-700)
          muted:  "#6b7280", // secondary text        (gray-500)
          hint:   "#9ca3af", // placeholder / caption (gray-400)
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
