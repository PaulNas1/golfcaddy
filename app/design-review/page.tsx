"use client";
import { useState } from "react";

// ─── Standalone design review page — no auth required ───────────────────────
// Shows annotated before/after mockups for each UI/UX recommendation.
// Delete this file when review is complete.

type Mode = "light" | "dark";

function Toggle({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm font-medium">
      <button
        onClick={() => setMode("light")}
        className={`px-3 py-1.5 rounded-lg transition-colors ${
          mode === "light"
            ? "bg-brand-600 text-white"
            : "bg-surface-muted text-ink-muted"
        }`}
      >
        Light
      </button>
      <button
        onClick={() => setMode("dark")}
        className={`px-3 py-1.5 rounded-lg transition-colors ${
          mode === "dark"
            ? "bg-brand-600 text-white"
            : "bg-surface-muted text-ink-muted"
        }`}
      >
        Dark
      </button>
    </div>
  );
}

function Label({ text, type }: { text: string; type: "before" | "after" | "note" }) {
  const colours =
    type === "before"
      ? "bg-red-100 text-red-700"
      : type === "after"
      ? "bg-brand-100 text-brand-700"
      : "bg-amber-100 text-amber-700";
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${colours}`}>
      {text}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-ink-title border-b border-surface-overlay pb-2">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ─── 1. Landing page — button hierarchy ──────────────────────────────────────
function LandingBefore() {
  return (
    <div className="rounded-2xl bg-brand-700 p-8 space-y-3 text-center">
      <div className="text-4xl mb-2">⛳️</div>
      <p className="text-2xl font-bold text-white">GolfCaddy</p>
      <p className="text-sm text-green-200 mb-4">Social golf, simplified.</p>
      <button className="block w-full bg-white text-brand-700 font-semibold text-base py-3.5 rounded-2xl">
        Sign in to your group
      </button>
      <button className="block w-full bg-brand-600 border border-brand-400 text-white font-semibold text-base py-3.5 rounded-2xl">
        Create Social Group Account
      </button>
      <p className="text-xs text-green-300 pt-2">
        Running your own social golf group?{" "}
        <span className="font-semibold text-white">Ask your organiser to set up GolfCaddy.</span>
      </p>
    </div>
  );
}

function LandingAfter() {
  return (
    <div className="rounded-2xl bg-brand-700 p-8 space-y-3 text-center">
      <div className="text-4xl mb-2">⛳️</div>
      <p className="text-2xl font-bold text-white">GolfCaddy</p>
      <p className="text-sm text-green-200 mb-4">Social golf, simplified.</p>
      {/* Primary CTA — solid white, bold, largest */}
      <button className="block w-full bg-white text-brand-700 font-bold text-base py-4 rounded-2xl shadow-lg">
        Sign in to your group
      </button>
      {/* Secondary CTA — ghost/outline, clearly subordinate */}
      <button className="block w-full border border-green-400/60 text-green-100 font-medium text-sm py-3 rounded-2xl">
        Create a group account
      </button>
      <p className="text-xs text-green-400 pt-2">
        Ask your organiser to set up GolfCaddy.
      </p>
    </div>
  );
}

// ─── 2. Action hierarchy — admin tee times header ────────────────────────────
function ActionsBefore() {
  return (
    <div className="rounded-2xl bg-surface-card border border-surface-overlay p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink-title">Tee Times</h2>
        <div className="flex items-center gap-3">
          {/* Both actions look identical — same colour, same weight */}
          <button className="text-ink-action text-sm font-medium">Randomise groups</button>
          <button className="text-ink-action text-sm font-medium">+ Add tee time</button>
        </div>
      </div>
      <p className="text-xs text-ink-hint">Showing accepted players only: 4</p>
      {/* Tee slot */}
      <div className="rounded-xl border border-surface-selectedBorder bg-surface-selected p-3 space-y-2">
        <div className="flex gap-2">
          <div className="w-28 rounded-xl border border-surface-overlay bg-surface-card px-3 py-2.5 text-sm text-ink-muted">08:00</div>
          <div className="flex-1 rounded-xl border border-surface-selectedBorder bg-surface-card px-3 py-2.5 text-sm text-ink-hint">
            Tap this tee time, then choose players below
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <span className="rounded-full bg-surface-card px-3 py-1 text-xs font-medium text-ink-muted">0 players</span>
          {/* Add guest & Remove look identical weight to primary actions */}
          <button className="text-ink-action text-xs font-medium">Add guest</button>
          <button className="text-red-500 text-xs">Remove</button>
        </div>
      </div>
    </div>
  );
}

function ActionsAfter() {
  return (
    <div className="rounded-2xl bg-surface-card border border-surface-overlay p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink-title">Tee Times</h2>
        <div className="flex items-center gap-2">
          {/* Randomise — secondary, pill button with subtle border */}
          <button className="flex items-center gap-1.5 rounded-lg border border-surface-overlay px-2.5 py-1.5 text-xs font-medium text-ink-muted">
            <span>⇄</span> Randomise
          </button>
          {/* Add tee time — primary action, filled green */}
          <button className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white">
            + Add tee time
          </button>
        </div>
      </div>
      <p className="text-xs text-ink-hint">Showing accepted players only: 4</p>
      {/* Tee slot */}
      <div className="rounded-xl border border-surface-selectedBorder bg-surface-selected p-3 space-y-2">
        <div className="flex gap-2">
          <div className="w-28 rounded-xl border border-surface-overlay bg-surface-card px-3 py-2.5 text-sm text-ink-muted">08:00</div>
          <div className="flex-1 rounded-xl border border-surface-selectedBorder bg-surface-card px-3 py-2.5 text-sm text-ink-hint">
            Tap this tee time, then choose players below
          </div>
        </div>
        <div className="flex justify-end gap-3 items-center">
          <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-ink-muted">0 players</span>
          {/* Add guest — clearly tertiary, muted */}
          <button className="text-ink-muted text-xs hover:text-ink-action">Add guest</button>
          {/* Remove — only appears on hover in real implementation, kept subtle */}
          <button className="text-red-400 text-xs opacity-60">Remove</button>
        </div>
      </div>
    </div>
  );
}

// ─── 3. Info box overuse ─────────────────────────────────────────────────────
function InfoBoxesBefore() {
  return (
    <div className="space-y-2">
      {/* Used for: success message */}
      <div className="rounded-xl bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700">
        ✓ Profile saved successfully
      </div>
      {/* Used for: informational note */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
        Players can only belong to one tee time. Reassigning moves them automatically.
      </div>
      {/* Used for: feature callout */}
      <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-700">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Season 2025</p>
        <p className="text-lg font-bold text-brand-700">142 pts</p>
      </div>
      {/* Used for: active selection */}
      <div className="rounded-xl border border-surface-selectedBorder bg-surface-selected px-3 py-2 text-sm text-ink-title">
        ← Active selection — same colour as everything else
      </div>
      <p className="text-xs text-ink-hint text-center">All four states look identical — nothing stands out</p>
    </div>
  );
}

function InfoBoxesAfter() {
  return (
    <div className="space-y-2">
      {/* Success — use green tint sparingly, with icon */}
      <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-700">
        <span className="text-base">✓</span> Profile saved successfully
      </div>
      {/* Informational — surface-muted, no border, quieter */}
      <div className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-ink-muted">
        Players can only belong to one tee time. Reassigning moves them automatically.
      </div>
      {/* Data callout — use ink-title hierarchy, not brand colour */}
      <div className="rounded-xl bg-surface-muted px-4 py-3">
        <p className="text-xs font-medium text-ink-muted uppercase tracking-wide">Season 2025</p>
        <p className="text-2xl font-bold text-ink-title">142 <span className="text-sm font-medium text-ink-muted">pts</span></p>
      </div>
      {/* Active selection — visually distinct with brand border */}
      <div className="rounded-xl border-2 border-surface-selectedBorder bg-surface-selected px-3 py-2 text-sm text-ink-title font-medium">
        ← Active selection — clearly different
      </div>
      <p className="text-xs text-ink-hint text-center">Each state now has a distinct visual voice</p>
    </div>
  );
}

// ─── 4. Typography hierarchy ─────────────────────────────────────────────────
function TypographyBefore() {
  return (
    <div className="rounded-2xl bg-surface-card border border-surface-overlay p-4 space-y-3">
      {/* Heading using same weight as body */}
      <p className="text-sm font-semibold text-ink-title">Upcoming Round</p>
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Royal Melbourne — West</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Saturday 17 May · 08:30am</p>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-hint">Stableford · 12 players</p>
      </div>
      {/* Actions compete with heading */}
      <div className="flex gap-2">
        <button className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white">Going</button>
        <button className="flex-1 rounded-xl border border-surface-overlay py-2.5 text-sm font-medium text-ink-muted">Can't make it</button>
      </div>
      <p className="text-xs text-ink-hint text-center">Uppercase labels everywhere → visual noise, no clear hierarchy</p>
    </div>
  );
}

function TypographyAfter() {
  return (
    <div className="rounded-2xl bg-surface-card border border-surface-overlay p-4 space-y-3">
      {/* Strong heading — size + weight does the heavy lifting */}
      <p className="text-base font-bold text-ink-title">Upcoming Round</p>
      <div className="space-y-0.5">
        {/* Course — prominent, but body weight */}
        <p className="text-sm font-semibold text-ink-title">Royal Melbourne — West</p>
        {/* Date/time — clearly secondary */}
        <p className="text-sm text-ink-body">Saturday 17 May · 08:30am</p>
        {/* Format — tertiary, muted */}
        <p className="text-xs text-ink-muted">Stableford · 12 players</p>
      </div>
      <div className="flex gap-2">
        <button className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white">Going</button>
        <button className="flex-1 rounded-xl border border-surface-overlay py-2.5 text-sm font-medium text-ink-muted">Can't make it</button>
      </div>
      <p className="text-xs text-ink-hint text-center">Size + weight creates hierarchy — no uppercase labels needed</p>
    </div>
  );
}

// ─── 5. Bottom nav active state ───────────────────────────────────────────────
function NavBefore() {
  const items = [
    { icon: "🏠", label: "Home", active: true },
    { icon: "⛳", label: "Rounds", active: false },
    { icon: "📊", label: "Feed", active: false },
    { icon: "🏆", label: "Ladder", active: false },
    { icon: "👤", label: "Profile", active: false },
  ];
  return (
    <div className="rounded-2xl bg-surface-card border border-surface-overlay overflow-hidden">
      <div className="flex border-t border-surface-overlay">
        {items.map((item) => (
          <button
            key={item.label}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium ${
              item.active ? "text-brand-600" : "text-ink-hint"
            }`}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-hint text-center py-2 border-t border-surface-overlay">
        Active tab: colour only — no other signal
      </p>
    </div>
  );
}

function NavAfter() {
  const items = [
    { icon: "🏠", label: "Home", active: true },
    { icon: "⛳", label: "Rounds", active: false },
    { icon: "📊", label: "Feed", active: false },
    { icon: "🏆", label: "Ladder", active: false },
    { icon: "👤", label: "Profile", active: false },
  ];
  return (
    <div className="rounded-2xl bg-surface-card border border-surface-overlay overflow-hidden">
      <div className="flex border-t border-surface-overlay">
        {items.map((item) => (
          <button
            key={item.label}
            className={`flex-1 flex flex-col items-center gap-1 py-3 text-[10px] font-medium relative ${
              item.active ? "text-brand-600" : "text-ink-hint"
            }`}
          >
            {/* Active indicator dot above icon */}
            {item.active && (
              <span className="absolute top-1.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand-500" />
            )}
            <span className={`text-lg ${item.active ? "" : "opacity-50"}`}>{item.icon}</span>
            <span className={item.active ? "font-semibold" : ""}>{item.label}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-ink-hint text-center py-2 border-t border-surface-overlay">
        Active tab: colour + weight + indicator dot — 3 signals
      </p>
    </div>
  );
}

// ─── 6. Round card — home screen ─────────────────────────────────────────────
function RoundCardBefore() {
  return (
    <div className="rounded-2xl bg-surface-card border border-surface-overlay p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-upcoming-bg px-2 py-0.5 text-xs font-semibold text-upcoming-text">Upcoming</span>
          </div>
          <p className="text-sm font-semibold text-ink-title truncate">Royal Melbourne — West Course</p>
          <p className="text-xs text-ink-muted">Saturday 17 May · 08:30am</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white">Going</button>
        <button className="flex-1 rounded-xl border border-surface-overlay py-2.5 text-sm font-medium text-ink-muted">Can't go</button>
        <button className="flex-1 rounded-xl border border-surface-overlay py-2.5 text-sm font-medium text-ink-muted">Maybe</button>
      </div>
      <p className="text-xs text-ink-hint text-center">3 equal-weight RSVP buttons — "Going" doesn't feel primary</p>
    </div>
  );
}

function RoundCardAfter() {
  return (
    <div className="rounded-2xl bg-surface-card border border-surface-overlay p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-upcoming-bg px-2 py-0.5 text-xs font-semibold text-upcoming-text">Upcoming</span>
            <span className="text-xs text-ink-muted">Stableford</span>
          </div>
          <p className="text-base font-bold text-ink-title truncate">Royal Melbourne</p>
          <p className="text-xs text-ink-muted">West Course · Sat 17 May · 08:30am</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-ink-hint">Players</p>
          <p className="text-lg font-bold text-ink-title">12</p>
        </div>
      </div>
      {/* Primary CTA dominant, secondary actions smaller */}
      <button className="w-full rounded-xl bg-brand-600 py-3 text-sm font-bold text-white">
        I'm Going ✓
      </button>
      <div className="flex gap-2">
        <button className="flex-1 rounded-lg border border-surface-overlay py-2 text-xs font-medium text-ink-muted">Can't go</button>
        <button className="flex-1 rounded-lg border border-surface-overlay py-2 text-xs font-medium text-ink-muted">Maybe</button>
      </div>
      <p className="text-xs text-ink-hint text-center">"Going" is clearly the primary action — secondary options recede</p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function DesignReview() {
  const [mode, setMode] = useState<Mode>("light");

  return (
    <div data-theme={mode} className="min-h-screen bg-surface-page">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-12">

        {/* Header */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-ink-title">UI/UX Design Review</h1>
            <Toggle mode={mode} setMode={setMode} />
          </div>
          <p className="text-sm text-ink-muted">
            Six areas for improvement — each shown before and after. Toggle light/dark to see both modes.
          </p>
        </div>

        {/* 1 */}
        <Section title="1 · Landing Page — Button Hierarchy">
          <p className="text-sm text-ink-muted">
            Both CTAs use the same size, weight, and visual prominence. "Create account" shouldn't
            compete with "Sign in" — most returning users just need to sign in.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label text="Now" type="before" />
              <LandingBefore />
            </div>
            <div className="space-y-2">
              <Label text="Proposed" type="after" />
              <LandingAfter />
            </div>
          </div>
          <div className="rounded-xl bg-surface-muted px-4 py-3 text-xs text-ink-muted space-y-1">
            <p><strong className="text-ink-body">Change:</strong> "Sign in" stays bold white (primary). "Create account" becomes a ghost button — same text size but border-only, clearly subordinate.</p>
            <p><strong className="text-ink-body">Effect:</strong> Returning users scan to their action instantly. New users still see the option without it competing.</p>
          </div>
        </Section>

        {/* 2 */}
        <Section title="2 · Action Hierarchy — Tee Times">
          <p className="text-sm text-ink-muted">
            "Randomise groups" and "+ Add tee time" look identical today. One is a destructive-ish
            shuffle; the other creates new data. They need different visual weights. Secondary actions
            inside each slot also need to recede.
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label text="Now" type="before" />
              <ActionsBefore />
            </div>
            <div className="space-y-2">
              <Label text="Proposed" type="after" />
              <ActionsAfter />
            </div>
          </div>
          <div className="rounded-xl bg-surface-muted px-4 py-3 text-xs text-ink-muted space-y-1">
            <p><strong className="text-ink-body">Change:</strong> "+ Add tee time" becomes a small filled green pill (primary). "Randomise" becomes a bordered ghost (secondary — it's destructive-ish). "Add guest" and "Remove" inside slots become muted text only.</p>
          </div>
        </Section>

        {/* 3 */}
        <Section title="3 · Info Box Overuse">
          <p className="text-sm text-ink-muted">
            The brand-50 green box is currently used for success messages, informational notes,
            data callouts, and active selections — all at the same visual weight. When everything
            is highlighted, nothing is.
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label text="Now — all four states look the same" type="before" />
              <InfoBoxesBefore />
            </div>
            <div className="space-y-2">
              <Label text="Proposed — distinct visual voice per state" type="after" />
              <InfoBoxesAfter />
            </div>
          </div>
          <div className="rounded-xl bg-surface-muted px-4 py-3 text-xs text-ink-muted space-y-1">
            <p><strong className="text-ink-body">Rule:</strong> Green tint = success/confirmation only. Data callouts use ink-title hierarchy on surface-muted. Informational notes use surface-muted with no border. Selected state uses the border as its signal, not fill.</p>
          </div>
        </Section>

        {/* 4 */}
        <Section title="4 · Typography — Remove Uppercase Labels">
          <p className="text-sm text-ink-muted">
            <code className="bg-surface-muted px-1 rounded text-xs">text-xs font-semibold uppercase tracking-wide</code> is
            used throughout as a section label style. Repeated too often it creates noise rather than
            structure. Size and weight alone can carry the hierarchy.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label text="Now" type="before" />
              <TypographyBefore />
            </div>
            <div className="space-y-2">
              <Label text="Proposed" type="after" />
              <TypographyAfter />
            </div>
          </div>
          <div className="rounded-xl bg-surface-muted px-4 py-3 text-xs text-ink-muted space-y-1">
            <p><strong className="text-ink-body">Rule:</strong> Reserve uppercase labels for 1–2 genuinely structural moments (section headers only). Use size + weight for everything else. Heading → Subheading → Body → Caption is enough.</p>
          </div>
        </Section>

        {/* 5 */}
        <Section title="5 · Bottom Nav — Active State Signals">
          <p className="text-sm text-ink-muted">
            The active tab is currently communicated by colour alone. In dark mode especially,
            the brand-600 green on a dark surface can be ambiguous. Adding a second and third
            signal makes it unambiguous.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label text="Now — colour only" type="before" />
              <NavBefore />
            </div>
            <div className="space-y-2">
              <Label text="Proposed — 3 signals" type="after" />
              <NavAfter />
            </div>
          </div>
          <div className="rounded-xl bg-surface-muted px-4 py-3 text-xs text-ink-muted space-y-1">
            <p><strong className="text-ink-body">Change:</strong> Active tab gets: (1) brand colour, (2) semibold label weight, (3) small indicator dot above the icon. Inactive tabs drop to 50% icon opacity so the contrast is stronger.</p>
          </div>
        </Section>

        {/* 6 */}
        <Section title="6 · Round Card — RSVP True-State Toggle">
          <p className="text-sm text-ink-muted">
            <strong className="text-ink-body">Superseded — shipped a different fix.</strong> The
            earlier idea (make "Going" a dominant primary button) was dropped: a permanently bold
            green "Going" makes it impossible to tell whether green means "tap here" or "you already
            said yes" — which was the actual bug. The home card now uses an equal-weight two-option
            toggle where the coloured button reflects your real answer: neutral when unanswered,
            green ✓ Going, red ✗ Can't make it.
          </p>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label text="Now" type="before" />
              <RoundCardBefore />
            </div>
            <div className="space-y-2">
              <Label text="Proposed" type="after" />
              <RoundCardAfter />
            </div>
          </div>
          <div className="rounded-xl bg-surface-muted px-4 py-3 text-xs text-ink-muted space-y-1">
            <p><strong className="text-ink-body">Shipped:</strong> Equal-weight Going / Can't make it toggle — selected option is colour-filled (green/red), unselected stays neutral, both keep an icon + label so colour is never the only signal. Below it, a collapsible "X going · Y out" roster lets members see who's in. Home card = this quick toggle; the round-detail card keeps its confirmed-state + "Change" flow.</p>
          </div>
        </Section>

        {/* Summary */}
        <div className="rounded-2xl bg-surface-selected border border-surface-selectedBorder p-5 space-y-3">
          <h3 className="font-bold text-ink-title">Implementation Priority</h3>
          <div className="space-y-2 text-sm">
            {[
              ["1st", "RSVP button hierarchy", "Round card — high frequency, immediate impact"],
              ["2nd", "Action hierarchy in tee times", "Admin's most-used screen"],
              ["3rd", "Info box consolidation", "Systemic — affects every screen"],
              ["4th", "Typography — remove excess uppercase", "Visual polish, medium effort"],
              ["5th", "Nav active state", "Small change, cumulative quality"],
              ["6th", "Landing CTA hierarchy", "Low-traffic screen, quick win"],
            ].map(([rank, title, note]) => (
              <div key={rank} className="flex gap-3">
                <span className="shrink-0 w-8 h-8 rounded-full bg-surface-card border border-surface-overlay flex items-center justify-center text-xs font-bold text-ink-muted">
                  {rank}
                </span>
                <div>
                  <p className="font-semibold text-ink-title text-sm">{title}</p>
                  <p className="text-xs text-ink-muted">{note}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
