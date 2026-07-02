# Marketing Landing + Legal Pages Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the public marketing landing page (`app/page.tsx`) and the `/terms` + `/privacy` legal pages into a fixed-dark visual identity matching the GolfCaddy app (Geist typography, new flag-mark logo), including an illustrative (non-live, client-only) animated "Live Standings" preview that reuses the app's real `lib/scoring.ts` and `lib/results.ts` so it can never diverge from actual scoring behavior.

**Architecture:** A small set of fixed (non-theme-switching) CSS custom properties + matching Tailwind color tokens (`mkt-*`) scope the new dark palette to the marketing surface only — the authenticated app's `ink-*`/`surface-*` system-preference theming is untouched. A shared `LegalPageLayout` component drives both legal routes from data. The illustrative standings widget is split into a pure simulation module (seeded RNG + real scoring/ranking calls, unit-tested) and a client-only animated presentation component with no network calls.

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind (new fixed-value `mkt-*` tokens alongside existing `ink-*`/`surface-*`/`brand-*`), Geist/Geist Mono (already loaded), `node --test` for unit tests.

## Global Constraints

- This is a self-contained frontend/marketing task — **no new backend, no new data sources, no auth, no network calls** from the marketing/legal pages. The illustrative live-standings widget runs entirely client-side from seeded demo data.
- Do **not** build the previously-descoped public `/live/[shareId]` spectator route. It does not exist in this codebase and this plan does not reintroduce it.
- The marketing and legal pages are **fixed dark** — do not wire them to the app's `data-theme`/system-preference system (`ink-*`/`surface-*` tokens). That theming stays exclusively inside the authenticated app.
- Reuse the app's real `lib/scoring.ts` (`calculateStrokesReceived`, `calculateStablefordPoints`) and `lib/results.ts` (`buildPlayerRankings`) for the illustrative standings' math and ranking — do not reimplement stableford scoring or countback tie-break logic.
- Fonts: Geist (sans) and Geist Mono — already loaded app-wide via `next/font/local` in `app/layout.tsx` and wired into Tailwind's `font-sans`/`font-mono`. Do not add Plus Jakarta Sans, Space Mono, or any Google Fonts import. Numerals (points, prices, stats) use `font-mono`.
- `/terms` and `/privacy` **already exist** as routes (`app/terms/page.tsx`, `app/privacy/page.tsx`) — this plan redesigns them in place. Do not create new/duplicate route files.
- Copy is owner-approved and must be used **verbatim** where the plan quotes it (hero headline/subhead, pricing, testimonial, legal section text, "Replaces" strip, footer links). Do not paraphrase.
- Confirmed links: primary CTA / nav "Open app" / "Sign in" → `/signin`. Pricing "Start free trial" → `/create-group`. "See live scoring" → in-page anchor `#live`. Footer: Terms → `/terms`, Privacy → `/privacy`, Contact → `mailto:hello@golfcaddy.club`.
- Do not use the ⛳ emoji anywhere in the marketing/legal surfaces being touched by this plan (landing page, legal pages). Do not touch ⛳ usage elsewhere in the app (e.g. `app/(app)/layout.tsx` loading states, `/signin`) — out of scope.
- PWA manifest icons (`public/icons/icon-192x192.png`, `icon-512x512.png`) and the `apple-touch-icon` `<link>` are **left untouched** in this plan (owner decision — no SVG-to-PNG rasterization tool is available; regenerating those PNGs from the new mark is separate follow-up work, not part of this plan).
- Responsive: one single responsive `app/page.tsx` (not two components/pages for desktop vs. mobile). Hit targets ≥44px. Desktop container max-width ~1200px; legal reading width ~680px.

---

### Task 1: Marketing design tokens, Logo component, and favicon

**Files:**
- Modify: `tailwind.config.ts`
- Modify: `app/globals.css`
- Create: `components/marketing/Logo.tsx`
- Modify: `public/icons/icon.svg`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: Tailwind color tokens `mkt-page`, `mkt-body`, `mkt-card`, `mkt-card2`, `mkt-border`, `mkt-text`, `mkt-muted`, `mkt-faint`, `mkt-header`, `mkt-primary`, `mkt-accent`, `mkt-chip`, `mkt-chipText`, `mkt-gold`, `mkt-live`, `mkt-down`, `mkt-strike` — fixed hex values, never overridden by dark-mode media queries or `data-theme`. Produces `LogoMark` and `LogoLockup` components from `components/marketing/Logo.tsx`, consumed by Tasks 2 and 5.

- [ ] **Step 1: Add the fixed marketing CSS custom properties**

In `app/globals.css`, add this block at the end of the file (these are intentionally **not** inside any `@media (prefers-color-scheme: dark)` or `[data-theme]` block — they never change):

```css

/* ── Marketing / legal fixed-dark tokens ─────────────────────────────────
 * Used only by the public marketing landing page and legal pages.
 * Deliberately fixed (not theme-reactive) — see app/page.tsx header comment.
 */
:root {
  --mkt-page: #0A1322;
  --mkt-body: #060D18;
  --mkt-card: #15233C;
  --mkt-card2: #101B2E;
  --mkt-border: #263449;
  --mkt-text: #FFFFFF;
  --mkt-muted: #8A98A8;
  --mkt-faint: #5C6A7C;
  --mkt-header: #1E8A3E;
  --mkt-primary: #22A44A;
  --mkt-accent: #35C15E;
  --mkt-chip: #1B2A42;
  --mkt-chipText: #A9B7C7;
  --mkt-gold: #E7B84B;
  --mkt-live: #FF5A47;
  --mkt-down: #E4685A;
  --mkt-strike: #F2C14E;
}
```

- [ ] **Step 2: Wire the tokens into Tailwind**

In `tailwind.config.ts`, inside `theme.extend.colors`, add a new `mkt` key alongside the existing `brand`/`surface`/`ink` keys:

```ts
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
```

- [ ] **Step 3: Create the Logo component**

The new mark is a filled flag silhouette (drawn from the app's existing `FlagIcon`), rendered via `currentColor` so it can sit on the green tile (white) or standalone (green). Create `components/marketing/Logo.tsx`:

```tsx
type LogoMarkProps = {
  className?: string;
  tileClassName?: string;
};

export function LogoMark({ className, tileClassName }: LogoMarkProps) {
  return (
    <div
      className={
        tileClassName ??
        "flex h-8 w-8 items-center justify-center rounded-[9px] bg-mkt-header"
      }
    >
      <svg viewBox="0 0 24 24" fill="none" className={className ?? "h-[62%] w-[62%] text-white"}>
        <path d="M6 3v18" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" />
        <path d="M7 3.4h11l-3 3.9 3 3.9H7z" fill="currentColor" />
      </svg>
    </div>
  );
}

type LogoLockupProps = {
  wordmarkClassName?: string;
};

export function LogoLockup({ wordmarkClassName }: LogoLockupProps) {
  return (
    <div className="flex items-center gap-[10px]">
      <LogoMark />
      <span
        className={
          wordmarkClassName ??
          "text-[19px] font-extrabold tracking-[-0.02em] text-mkt-text"
        }
      >
        GolfCaddy
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Replace the unreferenced old icon SVG with the new mark**

`public/icons/icon.svg` currently exists but is not referenced by any `<link>` tag or `manifest.json` entry — replace its content with the new mark on the green tile (matching `assets/favicon.svg` from the handoff bundle):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-label="GolfCaddy">
  <rect width="24" height="24" rx="6" fill="#1E8A3E"/>
  <path d="M8.4 4v16" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
  <path d="M9.1 4.3h8.2l-2.2 2.9 2.2 2.9H9.1z" fill="#fff"/>
</svg>
```

- [ ] **Step 5: Add an explicit favicon `<link>` referencing it**

In `app/layout.tsx`, right after the existing `apple-touch-icon` line (do not remove that line — it's out of scope, PNG regeneration is separate follow-up work):

```tsx
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add tailwind.config.ts app/globals.css components/marketing/Logo.tsx public/icons/icon.svg app/layout.tsx
git commit -m "feat: add fixed marketing design tokens, logo component, and new favicon"
```

---

### Task 2: Legal page shared layout + new copy for /terms and /privacy

**Files:**
- Create: `components/marketing/LegalPageLayout.tsx`
- Modify: `app/terms/page.tsx`
- Modify: `app/privacy/page.tsx`

**Interfaces:**
- Consumes: `LogoLockup` from `components/marketing/Logo.tsx` (Task 1); `mkt-*` Tailwind tokens (Task 1).
- Produces: `LegalPageLayout` component, taking a `LegalPageContent` shape, reused by both `app/terms/page.tsx` and `app/privacy/page.tsx`.

- [ ] **Step 1: Create the shared legal layout component**

```tsx
"use client";

import Link from "next/link";
import { LogoLockup } from "@/components/marketing/Logo";

export type LegalSection = {
  num: string;
  heading: string;
  paras: string[];
  bullets?: string[];
};

export type LegalPageContent = {
  activeTab: "terms" | "privacy";
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  contactHeading: string;
  contactBody: string;
};

export default function LegalPageLayout({
  title,
  updated,
  intro,
  sections,
  contactHeading,
  contactBody,
  activeTab,
}: LegalPageContent) {
  return (
    <div className="min-h-screen bg-mkt-body font-sans text-mkt-text">
      <div className="mx-auto min-h-screen max-w-[680px] bg-mkt-page">
        {/* Nav */}
        <div className="flex items-center justify-between border-b border-mkt-border px-6 py-5 sm:px-10">
          <Link href="/">
            <LogoLockup />
          </Link>
          <Link href="/" className="text-sm font-semibold text-mkt-muted hover:text-mkt-text">
            &larr; Back to site
          </Link>
        </div>

        {/* Hero */}
        <div className="border-b border-mkt-border px-6 py-10 sm:px-10 sm:py-12">
          <p className="mb-3 text-[13px] font-bold tracking-[0.1em] text-mkt-accent">LEGAL</p>
          <h1 className="mb-3 text-[32px] font-extrabold leading-tight tracking-[-0.03em] sm:text-[40px]">
            {title}
          </h1>
          <p className="text-sm text-mkt-muted">
            Last updated {updated} &middot; Governed by the laws of Victoria, Australia
          </p>
          <div className="mt-6 inline-flex gap-1 rounded-xl border border-mkt-border bg-mkt-card2 p-1">
            <Link
              href="/terms"
              className={`rounded-[9px] px-4 py-2 text-sm font-bold no-underline ${
                activeTab === "terms" ? "bg-mkt-primary text-white" : "text-mkt-muted"
              }`}
            >
              Terms of Use
            </Link>
            <Link
              href="/privacy"
              className={`rounded-[9px] px-4 py-2 text-sm font-bold no-underline ${
                activeTab === "privacy" ? "bg-mkt-primary text-white" : "text-mkt-muted"
              }`}
            >
              Privacy Policy
            </Link>
          </div>
        </div>

        {/* Intro */}
        <div className="px-6 pb-2 pt-8 sm:px-10">
          <p className="text-[16.5px] leading-relaxed text-mkt-muted">{intro}</p>
        </div>

        {/* Sections */}
        <div className="px-6 pb-6 pt-5 sm:px-10">
          {sections.map((section) => (
            <div key={section.num} className="border-t border-mkt-border py-5">
              <div className="mb-3 flex items-baseline gap-3">
                <span className="min-w-[26px] text-[13px] font-extrabold tabular-nums text-mkt-accent">
                  {section.num}
                </span>
                <h2 className="text-xl font-bold tracking-[-0.02em]">{section.heading}</h2>
              </div>
              <div className="pl-[38px]">
                {section.paras.map((para, i) => (
                  <p key={i} className="mb-3 text-[15.5px] leading-relaxed text-mkt-muted">
                    {para}
                  </p>
                ))}
                {section.bullets && (
                  <ul className="list-disc space-y-[7px] pl-5">
                    {section.bullets.map((bullet, i) => (
                      <li key={i} className="text-[15.5px] leading-relaxed text-mkt-muted">
                        {bullet}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Contact card */}
        <div className="px-6 pb-11 pt-2 sm:px-10">
          <div className="rounded-2xl border border-mkt-border bg-mkt-card p-7">
            <p className="mb-1.5 text-[17px] font-bold tracking-[-0.01em]">{contactHeading}</p>
            <p className="mb-3.5 text-[15px] leading-relaxed text-mkt-muted">{contactBody}</p>
            <a href="mailto:hello@golfcaddy.club" className="text-[15px] font-semibold text-mkt-accent hover:underline">
              hello@golfcaddy.club
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-mkt-border px-6 py-7 sm:px-10">
          <LogoLockup wordmarkClassName="text-[15px] font-extrabold text-mkt-text" />
          <div className="flex items-center gap-5 text-sm font-medium text-mkt-muted">
            <Link href="/terms" className="hover:text-mkt-text">Terms</Link>
            <Link href="/privacy" className="hover:text-mkt-text">Privacy</Link>
            <span className="text-mkt-faint">golfcaddy.club</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `app/terms/page.tsx` with the approved copy**

```tsx
import LegalPageLayout from "@/components/marketing/LegalPageLayout";

export const metadata = {
  title: "Terms of Use – GolfCaddy",
};

export default function TermsPage() {
  return (
    <LegalPageLayout
      activeTab="terms"
      title="Terms of Use"
      updated="1 July 2026"
      intro={
        'These Terms of Use govern your access to and use of the GolfCaddy application and website at golfcaddy.club (the "Service"), operated by GolfCaddy. By creating an account, joining a group, or otherwise using the Service, you agree to be bound by these Terms. If you are setting up a group on behalf of a golf society or club, you accept these Terms on its behalf.'
      }
      contactHeading="Questions about these Terms?"
      contactBody="If anything here is unclear, or you need to reach us about your account or a group you manage, get in touch and we'll help."
      sections={[
        {
          num: "1",
          heading: "Your account",
          paras: [
            "To use most features you must create an account and keep your login details secure. You are responsible for activity that happens under your account.",
            "You must be at least 16 years old to create an account. Group administrators are responsible for ensuring their members meet this requirement.",
          ],
        },
        {
          num: "2",
          heading: "Groups, rounds and member data",
          paras: [
            "GolfCaddy is built for running social golf groups — organising rounds and tee times, recording scores, calculating handicaps and maintaining a season ladder.",
            "Group administrators can invite members, schedule rounds and manage settings. If you are an administrator, you agree to only add members who have consented to join, and to handle their information responsibly.",
          ],
        },
        {
          num: "3",
          heading: "Acceptable use",
          paras: ["You agree to use the Service lawfully and respectfully. In particular, you must not:"],
          bullets: [
            "Upload content that is unlawful, abusive, harassing or infringes someone else's rights.",
            "Attempt to access accounts, groups or data that are not yours.",
            "Interfere with, disrupt, or reverse-engineer the Service or its security.",
            "Use the Service to send spam or unsolicited messages to members.",
          ],
        },
        {
          num: "4",
          heading: "Scores, handicaps and results",
          paras: [
            "Handicaps, Stableford points, countback tie-breaks and ladder standings are calculated automatically from the scores entered by members. While we work to keep these calculations accurate, GolfCaddy is a tool for social play and is not an official handicapping authority. Groups are responsible for the scores they record and for resolving any disputes about results.",
          ],
        },
        {
          num: "5",
          heading: "Subscriptions and billing",
          paras: [
            "Paid plans are billed per group based on the plan you select. Every plan includes a 30-day free trial with no card required to start.",
            "After the trial, subscriptions renew automatically for the billing period until cancelled. You can cancel at any time from your group settings; cancellation takes effect at the end of the current billing period, and fees already paid are non-refundable except where required by law.",
          ],
        },
        {
          num: "6",
          heading: "Your content",
          paras: [
            "You retain ownership of the content you and your members add — scores, photos, comments and group details. You grant GolfCaddy the limited licence needed to host, display and process that content so the Service can function for your group.",
          ],
        },
        {
          num: "7",
          heading: "Availability and changes",
          paras: [
            "We aim to keep the Service running reliably but do not guarantee it will be uninterrupted or error-free. We may update, add or remove features over time, and we may update these Terms; where changes are material, we'll give reasonable notice.",
          ],
        },
        {
          num: "8",
          heading: "Liability",
          paras: [
            'To the extent permitted by law, GolfCaddy is provided "as is" and we exclude implied warranties. Nothing in these Terms limits rights you have under the Australian Consumer Law that cannot lawfully be excluded. Our liability for any claim connected to the Service is limited to the amount you paid us in the 12 months before the claim.',
          ],
        },
        {
          num: "9",
          heading: "Termination",
          paras: [
            "You may stop using the Service and delete your account at any time. We may suspend or terminate access if these Terms are breached. On termination, the rights granted to you end, though provisions that by their nature should survive will continue to apply.",
          ],
        },
        {
          num: "10",
          heading: "Governing law",
          paras: [
            "These Terms are governed by the laws of Victoria, Australia, and you submit to the non-exclusive jurisdiction of the courts of that State.",
          ],
        },
      ]}
    />
  );
}
```

- [ ] **Step 3: Rewrite `app/privacy/page.tsx` with the approved copy**

```tsx
import LegalPageLayout from "@/components/marketing/LegalPageLayout";

export const metadata = {
  title: "Privacy Policy – GolfCaddy",
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout
      activeTab="privacy"
      title="Privacy Policy"
      updated="1 July 2026"
      intro="This Privacy Policy explains how GolfCaddy collects, uses and protects personal information when you use the app and website at golfcaddy.club. We handle personal information in accordance with the Australian Privacy Principles under the Privacy Act 1988 (Cth). By using the Service you agree to the practices described here."
      contactHeading="Privacy questions or requests"
      contactBody="To access or correct your information, make a privacy complaint, or ask how your data is handled, contact us and we'll respond promptly."
      sections={[
        {
          num: "1",
          heading: "Information we collect",
          paras: ["We collect information you provide and information generated as you use the Service, including:"],
          bullets: [
            "Account details — your name, email address and, optionally, a profile photo.",
            "Golf data — your rounds, scores, handicap, side-prize results and ladder standings.",
            "Group data — the groups you belong to and your role within them.",
            "Technical data — device, browser and usage information collected to keep the Service secure and reliable.",
          ],
        },
        {
          num: "2",
          heading: "How we use your information",
          paras: ["We use personal information to:"],
          bullets: [
            "Provide the Service — run rounds, calculate scores and handicaps, and maintain ladders.",
            "Manage your account, group membership and subscription.",
            "Communicate with you about rounds, updates and support.",
            "Keep the Service secure and improve how it works.",
          ],
        },
        {
          num: "3",
          heading: "Visibility within your group",
          paras: [
            "GolfCaddy is a group product. Information such as your name, scores, handicap and ladder position is visible to other members of the groups you join. Group administrators can see and manage member details needed to run the group. Your golf activity is not published publicly outside your group.",
          ],
        },
        {
          num: "4",
          heading: "Sharing with third parties",
          paras: [
            "We do not sell your personal information. We share it only with service providers who help us operate the Service — such as cloud hosting and payment processing — and only as needed for them to perform those services. We may disclose information where required by law.",
          ],
        },
        {
          num: "5",
          heading: "Data storage and security",
          paras: [
            "Your data is stored using reputable cloud infrastructure and protected with access controls and encryption in transit. Some providers may store data outside Australia; where that happens, we take reasonable steps to ensure it is handled consistently with the Australian Privacy Principles. No system is perfectly secure, but we work to protect your information from misuse, loss and unauthorised access.",
          ],
        },
        {
          num: "6",
          heading: "Your rights and choices",
          paras: ["You can:"],
          bullets: [
            "Access and update your account information at any time.",
            "Request a copy of the personal information we hold about you.",
            "Ask us to correct or delete your information, subject to legal and group-record requirements.",
            "Leave a group, which removes you from its future rounds and standings.",
          ],
        },
        {
          num: "7",
          heading: "Data retention",
          paras: [
            "We keep personal information for as long as your account is active and as needed to provide the Service. When you delete your account we remove or de-identify your personal information within a reasonable period, except where we must retain it to meet legal obligations or resolve disputes.",
          ],
        },
        {
          num: "8",
          heading: "Cookies and local storage",
          paras: [
            "The app uses cookies and local storage to keep you signed in, remember preferences, and understand how the Service is used. You can control cookies through your browser, though some features may not work without them.",
          ],
        },
        {
          num: "9",
          heading: "Children",
          paras: [
            "The Service is not intended for children under 16. We do not knowingly collect personal information from children under that age.",
          ],
        },
        {
          num: "10",
          heading: "Changes to this policy",
          paras: [
            'We may update this Privacy Policy from time to time. Where changes are material, we\'ll notify you through the app or by email. The "last updated" date above reflects the current version.',
          ],
        },
      ]}
    />
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add components/marketing/LegalPageLayout.tsx app/terms/page.tsx app/privacy/page.tsx
git commit -m "feat: redesign legal pages with fixed-dark layout and approved copy"
```

---

### Task 3: Illustrative round simulation (pure, reuses real scoring/ranking libs)

**Files:**
- Create: `lib/illustrativeRound.ts`
- Test: `tests/illustrativeRound.test.ts`

**Interfaces:**
- Consumes: `calculateStrokesReceived`, `calculateStablefordPoints` from `@/lib/scoring`; `buildPlayerRankings` from `@/lib/results`; `AppUser`, `Scorecard`, `HoleScore`, `Round`, `PlayerRanking`, `CourseHole` types from `@/types`.
- Produces: `getIllustrativeRoster(): { id: string; name: string; handicap: number }[]`, `buildIllustrativeRound(): IllustrativeRound`, `computeIllustrativeStandings(round: IllustrativeRound, playedHoles: number): { rankings: PlayerRanking[]; lastHoleByPlayerId: Record<string, { stablefordPoints: number } | undefined> }` — consumed by Task 4's animated component.

- [ ] **Step 1: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  getIllustrativeRoster,
  buildIllustrativeRound,
  computeIllustrativeStandings,
} from "../lib/illustrativeRound.ts";

test("getIllustrativeRoster returns 5 fictional players with names and handicaps", () => {
  const roster = getIllustrativeRoster();
  assert.equal(roster.length, 5);
  roster.forEach((player) => {
    assert.equal(typeof player.id, "string");
    assert.equal(typeof player.name, "string");
    assert.equal(typeof player.handicap, "number");
  });
});

test("buildIllustrativeRound produces 18 holes per player, deterministically", () => {
  const roundA = buildIllustrativeRound();
  const roundB = buildIllustrativeRound();
  const roster = getIllustrativeRoster();
  roster.forEach((player) => {
    assert.equal(roundA.playerHoles[player.id].length, 18);
    assert.deepEqual(roundA.playerHoles[player.id], roundB.playerHoles[player.id]);
  });
});

test("computeIllustrativeStandings ranks players by total stableford points through N holes", () => {
  const round = buildIllustrativeRound();
  const { rankings } = computeIllustrativeStandings(round, 9);
  assert.equal(rankings.length, 5);
  for (let i = 1; i < rankings.length; i++) {
    assert.ok(rankings[i - 1].stablefordTotal >= rankings[i].stablefordTotal);
  }
  const roster = getIllustrativeRoster();
  const rankedIds = rankings.map((r) => r.playerId).sort();
  assert.deepEqual(rankedIds, roster.map((p) => p.id).sort());
});

test("computeIllustrativeStandings returns 0 points at 0 played holes", () => {
  const round = buildIllustrativeRound();
  const { rankings } = computeIllustrativeStandings(round, 0);
  rankings.forEach((r) => assert.equal(r.stablefordTotal, 0));
});

test("computeIllustrativeStandings reports the last played hole's points per player", () => {
  const round = buildIllustrativeRound();
  const { rankings, lastHoleByPlayerId } = computeIllustrativeStandings(round, 5);
  rankings.forEach((r) => {
    const last = lastHoleByPlayerId[r.playerId];
    assert.ok(last);
    assert.equal(typeof last.stablefordPoints, "number");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/illustrativeRound.ts'`

- [ ] **Step 3: Implement `lib/illustrativeRound.ts`**

```ts
import type { AppUser, CourseHole, HoleScore, PlayerRanking, Round, Scorecard } from "@/types";
import { calculateStablefordPoints, calculateStrokesReceived } from "@/lib/scoring";
import { buildPlayerRankings } from "@/lib/results";

const COURSE_PARS = [4, 5, 3, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];

type IllustrativePlayer = {
  id: string;
  name: string;
  handicap: number;
  skill: number;
};

const ROSTER: IllustrativePlayer[] = [
  { id: "p1", name: "Sarah K.", handicap: 20, skill: 0.34 },
  { id: "p2", name: "Dave M.", handicap: 14, skill: 0.16 },
  { id: "p3", name: "Priya N.", handicap: 24, skill: 0.22 },
  { id: "p4", name: "Brad G.", handicap: 18, skill: 0.1 },
  { id: "p5", name: "Tom R.", handicap: 9, skill: -0.08 },
];

function mulberry32(seed: number) {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type IllustrativeCourseHole = { holeNumber: number; par: number; strokeIndex: number };

function buildIllustrativeCourse(): IllustrativeCourseHole[] {
  return COURSE_PARS.map((par, i) => ({
    holeNumber: i + 1,
    par,
    strokeIndex: ((i * 7) % 18) + 1,
  }));
}

type IllustrativeHoleResult = {
  holeNumber: number;
  strokeIndex: number;
  grossScore: number;
  strokesReceived: number;
  stablefordPoints: number;
};

function simulatePlayerRound(
  player: IllustrativePlayer,
  course: IllustrativeCourseHole[],
  seed: number
): IllustrativeHoleResult[] {
  const random = mulberry32(seed);
  return course.map((hole) => {
    const strokesReceived = calculateStrokesReceived(player.handicap, hole.strokeIndex);
    const roll = random() + player.skill;
    const delta = roll > 0.9 ? -2 : roll > 0.7 ? -1 : roll > 0.36 ? 0 : roll > 0.16 ? 1 : 2;
    const grossScore = Math.max(hole.par + strokesReceived + delta, Math.max(1, hole.par - 2));
    const stablefordPoints = calculateStablefordPoints(hole.par, grossScore, strokesReceived);
    return {
      holeNumber: hole.holeNumber,
      strokeIndex: hole.strokeIndex,
      grossScore,
      strokesReceived,
      stablefordPoints,
    };
  });
}

export type IllustrativeRound = {
  course: IllustrativeCourseHole[];
  playerHoles: Record<string, IllustrativeHoleResult[]>;
};

export function getIllustrativeRoster(): { id: string; name: string; handicap: number }[] {
  return ROSTER.map(({ id, name, handicap }) => ({ id, name, handicap }));
}

export function buildIllustrativeRound(): IllustrativeRound {
  const course = buildIllustrativeCourse();
  const playerHoles: Record<string, IllustrativeHoleResult[]> = {};
  ROSTER.forEach((player, index) => {
    playerHoles[player.id] = simulatePlayerRound(player, course, 4211 + index * 911);
  });
  return { course, playerHoles };
}

const ILLUSTRATIVE_DATE = new Date(2026, 0, 1);

function buildFakeAppUser(player: IllustrativePlayer): AppUser {
  return {
    uid: player.id,
    email: `${player.id}@example.com`,
    displayName: player.name,
    role: "member",
    status: "active",
    groupId: "illustrative-group",
    avatarUrl: null,
    fcmToken: null,
    createdAt: ILLUSTRATIVE_DATE,
    updatedAt: ILLUSTRATIVE_DATE,
  };
}

function holeType(par: number): CourseHole["type"] {
  if (par === 3) return "par3";
  if (par === 5) return "par5";
  return "par4";
}

export function computeIllustrativeStandings(
  round: IllustrativeRound,
  playedHoles: number
): {
  rankings: PlayerRanking[];
  lastHoleByPlayerId: Record<string, IllustrativeHoleResult | undefined>;
} {
  const members: AppUser[] = ROSTER.map(buildFakeAppUser);
  const courseHoles: CourseHole[] = round.course.map((h) => ({
    number: h.holeNumber,
    par: h.par,
    strokeIndex: h.strokeIndex,
    type: holeType(h.par),
  }));
  const coursePar = round.course.reduce((sum, h) => sum + h.par, 0);

  const scorecards: Scorecard[] = ROSTER.map((player) => {
    const holes = round.playerHoles[player.id].slice(0, playedHoles);
    const totalStableford = holes.reduce((sum, h) => sum + h.stablefordPoints, 0);
    return {
      id: player.id,
      roundId: "illustrative-round",
      groupId: "illustrative-group",
      playerId: player.id,
      markerId: "illustrative-marker",
      handicapAtTime: player.handicap,
      teeSetId: null,
      teeSetName: null,
      coursePar,
      courseRating: null,
      slopeRating: null,
      courseHoles,
      status: "in_progress",
      submittedAt: null,
      signedOff: false,
      totalGross: null,
      totalStableford,
      adminEdited: false,
      adminEditedBy: null,
      adminEditedAt: null,
      createdAt: ILLUSTRATIVE_DATE,
      updatedAt: ILLUSTRATIVE_DATE,
    };
  });

  const holeScoresByCardId: Record<string, HoleScore[]> = {};
  ROSTER.forEach((player) => {
    const holes = round.playerHoles[player.id].slice(0, playedHoles);
    holeScoresByCardId[player.id] = holes.map((h) => ({
      holeNumber: h.holeNumber,
      par: round.course[h.holeNumber - 1].par,
      strokeIndex: h.strokeIndex,
      strokesReceived: h.strokesReceived,
      grossScore: h.grossScore,
      netScore: h.grossScore - h.strokesReceived,
      stablefordPoints: h.stablefordPoints,
      isNTP: false,
      isLD: false,
      isT2: false,
      isT3: false,
      savedAt: null,
    }));
  });

  const rankings = buildPlayerRankings({
    round: { format: "stableford" } as Round,
    scorecards,
    holeScoresByCardId,
    members,
  });

  const lastHoleByPlayerId: Record<string, IllustrativeHoleResult | undefined> = {};
  ROSTER.forEach((player) => {
    const holes = round.playerHoles[player.id].slice(0, playedHoles);
    lastHoleByPlayerId[player.id] = holes[holes.length - 1];
  });

  return { rankings, lastHoleByPlayerId };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS — all 5 new `illustrativeRound` tests green, existing suites unaffected.

- [ ] **Step 5: Commit**

```bash
git add lib/illustrativeRound.ts tests/illustrativeRound.test.ts
git commit -m "feat: add illustrative-round simulation reusing real scoring and ranking libs"
```

---

### Task 4: Animated illustrative Live Standings preview component

**Files:**
- Create: `components/marketing/LiveStandingsPreview.tsx`

**Interfaces:**
- Consumes: `getIllustrativeRoster`, `buildIllustrativeRound`, `computeIllustrativeStandings` from `lib/illustrativeRound.ts` (Task 3); `buildRankById`, `computeRankMovement` from `lib/liveStandings.ts` (already on `main` from the live-standings-upgrade branch); `LogoMark` not needed here.
- Produces: `LiveStandingsPreview` component, no props, consumed by Task 5's landing page.

- [ ] **Step 1: Create the component**

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildIllustrativeRound,
  computeIllustrativeStandings,
} from "@/lib/illustrativeRound";
import { buildRankById, computeRankMovement } from "@/lib/liveStandings";

const HOLE_ADVANCE_MS = 3000;
const MEDALS = ["🥇", "🥈", "🥉"] as const;

export default function LiveStandingsPreview() {
  const round = useMemo(() => buildIllustrativeRound(), []);
  const [playedHoles, setPlayedHoles] = useState(6);
  const prevRankByIdRef = useRef<Record<string, number>>({});
  const lastProgressKeyRef = useRef<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setPlayedHoles((current) => (current >= 18 ? 1 : current + 1));
    }, HOLE_ADVANCE_MS);
    return () => clearInterval(interval);
  }, []);

  const { rankings, lastHoleByPlayerId } = useMemo(
    () => computeIllustrativeStandings(round, playedHoles),
    [round, playedHoles]
  );

  const currentRankById = useMemo(() => buildRankById(rankings), [rankings]);

  // Snapshot the previous-hole rank map only when the hole count advances,
  // so movement arrows reflect "since the last hole." This must run in the
  // effect body itself (not a cleanup function) — a cleanup-based snapshot
  // fires one render cycle too late and ends up comparing hole N-2 to N
  // instead of N-1 to N. This mirrors the proven pattern already reviewed
  // and shipped in app/(app)/rounds/[roundId]/page.tsx.
  useEffect(() => {
    if (lastProgressKeyRef.current !== playedHoles) {
      lastProgressKeyRef.current = playedHoles;
      prevRankByIdRef.current = currentRankById;
    }
  }, [playedHoles, currentRankById]);

  return (
    <div className="overflow-hidden rounded-[20px] border border-mkt-border bg-mkt-card shadow-[0_30px_60px_-25px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between px-4 pb-3.5 pt-4">
        <div>
          <p className="text-base font-extrabold text-mkt-text">Live Standings</p>
          <p className="mt-0.5 text-[11.5px] text-mkt-faint">Ivanhoe &middot; Round 7 &middot; Stableford</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-mkt-chip px-2.5 py-1">
          <span className="h-1.5 w-1.5 animate-gc-pulse rounded-full bg-mkt-live" />
          <span className="text-[11px] font-extrabold tracking-[0.06em] text-mkt-chipText">LIVE</span>
        </span>
      </div>

      <div className="px-3 pb-2">
        {rankings.map((ranking) => {
          const medal = MEDALS[ranking.rank - 1];
          const movement = computeRankMovement(ranking.playerId, ranking.rank, prevRankByIdRef.current);
          const lastHole = lastHoleByPlayerId[ranking.playerId];
          const isLeader = ranking.rank === 1;

          return (
            <div
              key={ranking.playerId}
              className={`mb-2 flex items-center gap-3 rounded-[14px] border p-2.5 ${
                isLeader ? "border-mkt-gold bg-[rgba(231,184,75,0.06)]" : "border-mkt-border"
              }`}
            >
              <div className="flex w-8 shrink-0 flex-col items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-mkt-card2 text-sm font-extrabold text-mkt-muted">
                  {medal ?? `#${ranking.rank}`}
                </div>
                {movement.direction === "up" && (
                  <span className="mt-0.5 text-[10px] font-extrabold leading-none text-mkt-accent">
                    &#9650;{movement.amount}
                  </span>
                )}
                {movement.direction === "down" && (
                  <span className="mt-0.5 text-[10px] font-extrabold leading-none text-mkt-down">
                    &#9660;{movement.amount}
                  </span>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-bold tracking-[-0.01em] text-mkt-text">
                  {ranking.playerName}
                </p>
                <p className="mt-px text-xs text-mkt-faint">
                  Thru {playedHoles} &middot; HCP {ranking.handicap}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="font-mono text-lg font-bold leading-none text-mkt-accent">
                  {ranking.stablefordTotal}
                </p>
                {lastHole != null && (
                  <p
                    className={`mt-0.5 text-[10px] font-bold ${
                      lastHole.stablefordPoints >= 3 ? "text-mkt-accent" : "text-mkt-faint"
                    }`}
                  >
                    +{lastHole.stablefordPoints}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="pb-3.5 pt-1 text-center text-[11px] text-mkt-faint">
        Illustrative example &middot; live for members during every round
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/marketing/LiveStandingsPreview.tsx
git commit -m "feat: add animated illustrative Live Standings preview for the landing page"
```

---

### Task 5: Rebuild the landing page (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `LogoLockup`, `LogoMark` from `components/marketing/Logo.tsx` (Task 1); `LiveStandingsPreview` from `components/marketing/LiveStandingsPreview.tsx` (Task 4); `mkt-*` Tailwind tokens (Task 1).

This task keeps the existing redirect-when-signed-in `useEffect`/`useAuth()` logic at the top of the file (unrelated to the visual redesign) and replaces everything below it.

- [ ] **Step 1: Replace the file**

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { LogoLockup, LogoMark } from "@/components/marketing/Logo";
import LiveStandingsPreview from "@/components/marketing/LiveStandingsPreview";

// This page is deliberately fixed dark (mkt-* tokens) — it does not follow
// the app's system-preference theme. See docs/superpowers/plans/
// 2026-07-01-marketing-landing-redesign.md Global Constraints.

const REPLACES = ["WhatsApp threads", "Spreadsheets", "Paper scorecards", "Manual handicaps"];

const FEATURES = [
  { icon: "📅", title: "Rounds & tee times", desc: "Schedule rounds, collect RSVPs, auto-assign tee groups. No group chat required." },
  { icon: "🏌️", title: "Live scoring", desc: "Hole-by-hole on every phone. Stableford or stroke play, published as cards are signed." },
  { icon: "🏆", title: "Season ladder", desc: "Handicaps and ladder points recalculated automatically after every single round." },
  { icon: "🎯", title: "Side prizes", desc: "Nearest the pin, longest drive, twos — all tracked in-app. No arguing after the 19th." },
  { icon: "📱", title: "No app store", desc: "Installs from your invite link in one tap and runs like a native app in any browser." },
  { icon: "💬", title: "Group social feed", desc: "Photos, results and banter in one place — tied to the actual rounds they came from." },
];

const CHECKS = [
  "Handicaps applied automatically per player",
  "Countback tie-breaks resolved the way your app does",
  "Season ladder updates the moment cards are signed",
];

const PROOF = [
  { num: "60s", label: "to record a full hole-by-hole card" },
  { num: "0", label: "spreadsheets to maintain" },
  { num: "1 tap", label: "for members to install" },
  { num: "Auto", label: "handicaps & ladder, every round" },
];

const PLANS = [
  { name: "Starter", price: 29, members: 20, popular: false },
  { name: "Club", price: 49, members: 40, popular: true },
  { name: "Society", price: 79, members: 80, popular: false },
];

export default function RootPage() {
  const { firebaseUser, appUser, loading } = useAuth();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!firebaseUser) return;
    if (appUser?.status === "pending") router.replace("/pending");
    else if (appUser?.status === "active") router.replace("/home");
  }, [loading, firebaseUser, appUser, router]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading || firebaseUser) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-mkt-page">
        <LogoMark className="h-10 w-10 text-white" tileClassName="flex h-16 w-16 items-center justify-center rounded-2xl bg-mkt-header" />
        <h1 className="mt-4 text-3xl font-bold text-mkt-text">GolfCaddy</h1>
        <p className="mt-2 text-sm text-mkt-muted">Social golf groups</p>
      </div>
    );
  }

  return (
    <div className="bg-mkt-body font-sans text-mkt-text">
      {/* Nav */}
      <div className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5 sm:px-14">
        <LogoLockup />
        <div className="hidden items-center gap-7 md:flex">
          <a href="#features" className="text-[15px] font-semibold text-mkt-muted hover:text-mkt-text">Features</a>
          <a href="#live" className="text-[15px] font-semibold text-mkt-muted hover:text-mkt-text">Live scoring</a>
          <a href="#pricing" className="text-[15px] font-semibold text-mkt-muted hover:text-mkt-text">Pricing</a>
          <Link href="/signin" className="text-[15px] font-semibold text-mkt-text">Sign in</Link>
          <Link href="/signin" className="rounded-[11px] bg-mkt-primary px-5 py-2.5 text-[15px] font-bold text-white">Open app</Link>
        </div>
        <Link href="/signin" className="rounded-[11px] bg-mkt-primary px-4 py-2 text-sm font-bold text-white md:hidden">Open app</Link>
      </div>

      {/* Hero */}
      <div className="relative">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(60% 60% at 70% 30%, rgba(30,138,62,0.32), transparent 70%)" }}
        />
        <div className="relative mx-auto grid max-w-[1200px] gap-10 px-6 pb-16 pt-6 sm:px-14 lg:grid-cols-[1fr_400px] lg:items-center lg:gap-12">
          <div>
            <div className="mb-6 inline-flex items-center gap-2.5 rounded-full border border-mkt-border bg-mkt-card px-3.5 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-mkt-accent" />
              <span className="text-[13px] font-semibold text-mkt-muted">Social golf groups &middot; societies, clubs &amp; weekend groups</span>
            </div>
            <h1 className="mb-5 text-[42px] font-extrabold leading-[1.05] tracking-[-0.035em] sm:text-[52px] lg:text-[60px] lg:leading-[1.0]">
              Run your golf group like it&rsquo;s actually 2026.
            </h1>
            <p className="mb-8 max-w-[500px] text-lg leading-relaxed text-mkt-muted">
              Rounds, tee times, live scoring, handicaps, the season ladder and the group chat — one app, everyone in sync. No more WhatsApp and a spreadsheet.
            </p>
            <div className="mb-5 flex flex-col gap-3.5 sm:flex-row sm:items-center">
              <Link
                href="/signin"
                className="rounded-[13px] bg-mkt-primary px-6 py-4 text-center text-base font-bold text-white shadow-[0_12px_28px_-12px_#22A44A]"
              >
                Find your group
              </Link>
              <a
                href="#live"
                className="rounded-[13px] border border-mkt-border bg-mkt-card px-6 py-4 text-center text-base font-semibold text-mkt-text"
              >
                See live scoring
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-mkt-muted">
              <span>30 days free</span>
              <span className="h-1 w-1 rounded-full bg-mkt-faint" />
              <span>No credit card</span>
              <span className="h-1 w-1 rounded-full bg-mkt-faint" />
              <span>No app store</span>
            </div>
          </div>

          <div className="hidden justify-self-end lg:block">
            <div className="w-[300px] rounded-[46px] border border-[#22354C] bg-[#0B1524] p-2.5 shadow-[0_50px_90px_-35px_rgba(0,0,0,0.5)]">
              <div className="flex h-[620px] flex-col overflow-hidden rounded-[36px] bg-mkt-page">
                <div className="flex items-center justify-between bg-mkt-header px-4 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#C0392B] text-[11px]">&#9971;</div>
                    <span className="text-sm font-extrabold text-white">FourPlay</span>
                  </div>
                  <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold text-white">Admin</span>
                </div>
                <div className="p-4">
                  <p className="text-lg font-extrabold tracking-[-0.02em] text-mkt-text">Hey Paul 👋</p>
                  <p className="mb-3.5 text-xs text-mkt-muted">FourPlay</p>
                  <div className="rounded-2xl border border-mkt-border bg-mkt-card">
                    <div className="rounded-t-2xl bg-mkt-primary px-3.5 py-1.5 text-xs font-bold text-white">Next Round</div>
                    <div className="p-3.5">
                      <p className="text-sm font-extrabold text-mkt-text">Ivanhoe Public Golf Course</p>
                      <p className="my-1 text-xs text-mkt-muted">Sunday 19 July 2026 &middot; First tee 8:15 AM</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Replaces strip */}
      <div className="bg-mkt-header px-6 py-7 sm:px-14">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-center gap-5">
          <span className="text-sm font-semibold text-white/70">Replaces</span>
          {REPLACES.map((item) => (
            <span
              key={item}
              className="text-[15px] font-semibold text-white/90 line-through decoration-mkt-strike decoration-2"
            >
              {item}
            </span>
          ))}
          <span className="text-xl text-white/60">&rarr;</span>
          <span className="text-base font-extrabold text-white">one app, everyone in sync</span>
        </div>
      </div>

      {/* Features */}
      <div id="features" className="mx-auto max-w-[1200px] px-6 py-16 sm:px-14 sm:py-20">
        <p className="mb-3.5 text-[13px] font-bold tracking-[0.1em] text-mkt-accent">EVERYTHING YOUR GROUP NEEDS</p>
        <h2 className="mb-10 max-w-[640px] text-[32px] font-extrabold leading-[1.08] tracking-[-0.03em] sm:text-[42px]">
          From the tee sheet to the 19th hole, handled.
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title} className="rounded-2xl border border-mkt-border bg-mkt-card p-6">
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-mkt-chip text-xl">{icon}</div>
              <p className="mb-1.5 text-lg font-bold tracking-[-0.01em]">{title}</p>
              <p className="text-[15px] leading-relaxed text-mkt-muted">{desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Live standings band */}
      <div id="live" className="mx-auto max-w-[1200px] px-6 sm:px-14">
        <div
          className="grid gap-8 rounded-[28px] p-6 sm:p-10 lg:grid-cols-[1fr_460px] lg:items-center lg:gap-14"
          style={{ background: "linear-gradient(160deg, #15401F, #0E2C18)" }}
        >
          <div>
            <p className="mb-4 text-[13px] font-bold tracking-[0.1em] text-[#86C99A]">LIVE SCORING</p>
            <h2 className="mb-5 text-[28px] font-extrabold leading-[1.1] tracking-[-0.03em] text-white sm:text-[36px] lg:text-[40px]">
              Watch the standings move, hole by hole.
            </h2>
            <p className="mb-7 text-[17px] leading-relaxed text-[#B9CDBF]">
              Every card signed on the course updates the board instantly — points, positions and countback, live for the whole group. Handicaps applied automatically; the season ladder recalculates the moment the last card is signed.
            </p>
            <div className="flex flex-col gap-3.5">
              {CHECKS.map((check) => (
                <div key={check} className="flex items-center gap-3">
                  <div className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#2E7D46] text-xs font-extrabold text-white">
                    &#10003;
                  </div>
                  <span className="text-[15.5px] font-medium text-[#E3EEE5]">{check}</span>
                </div>
              ))}
            </div>
          </div>
          <LiveStandingsPreview />
        </div>
      </div>

      {/* Proof */}
      <div className="mx-auto max-w-[1200px] px-6 py-16 sm:px-14 sm:py-20">
        <div className="grid gap-10 lg:grid-cols-[1.3fr_1fr] lg:items-center lg:gap-14">
          <div>
            <p className="text-2xl font-bold leading-[1.3] tracking-[-0.025em] sm:text-[30px]">
              &ldquo;Thanks Paul — app working <span className="text-mkt-accent">beautifully</span>. We ran 22 blokes across a whole season and the WhatsApp group went completely quiet.&rdquo;
            </p>
            <div className="mt-6 flex items-center gap-3">
              <div className="flex h-[42px] w-[42px] items-center justify-center rounded-full bg-mkt-primary font-bold text-white">AG</div>
              <div>
                <p className="text-[15px] font-bold">Ash G.</p>
                <p className="text-[13px] text-mkt-muted">Member &middot; FourPlay Society</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            {PROOF.map(({ num, label }) => (
              <div key={label} className="rounded-2xl border border-mkt-border bg-mkt-card p-5">
                <p className="text-[32px] font-extrabold tracking-[-0.03em] text-mkt-accent">{num}</p>
                <p className="mt-1 text-[13.5px] font-medium text-mkt-muted">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div id="pricing" className="border-y border-mkt-border bg-mkt-card2 px-6 py-16 sm:px-14 sm:py-20">
        <div className="mx-auto max-w-[1200px]">
          <div className="mb-10 text-center">
            <p className="mb-3.5 text-[13px] font-bold tracking-[0.1em] text-mkt-accent">PRICING</p>
            <h2 className="mb-3 text-[32px] font-extrabold tracking-[-0.03em] sm:text-[40px]">Every feature. Pick your group size.</h2>
            <p className="text-base text-mkt-muted">No tiers of features to compare. One price per size. Cancel anytime.</p>
          </div>
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-3">
            {PLANS.map(({ name, price, members, popular }) => (
              <div
                key={name}
                className={`relative flex flex-col rounded-[22px] bg-mkt-card p-7 ${
                  popular ? "border-2 border-mkt-primary" : "border border-mkt-border"
                }`}
              >
                {popular && (
                  <span className="absolute -top-3 left-7 rounded-full bg-mkt-primary px-3 py-1 text-xs font-bold text-white">
                    Most popular
                  </span>
                )}
                <p className="text-lg font-bold">{name}</p>
                <p className="my-1 text-sm text-mkt-muted">Up to {members} members</p>
                <div className="my-6 flex items-baseline gap-1">
                  <span className="font-mono text-[40px] font-extrabold tracking-[-0.03em]">A${price}</span>
                  <span className="text-sm font-medium text-mkt-muted">/month</span>
                </div>
                <Link
                  href="/create-group"
                  className={`mt-auto rounded-xl py-3.5 text-center text-[15px] font-bold ${
                    popular ? "bg-mkt-primary text-white" : "bg-white/10 text-mkt-text"
                  }`}
                >
                  Start free trial
                </Link>
              </div>
            ))}
          </div>
          <p className="mt-7 text-center text-sm text-mkt-muted">30 days free on every plan &middot; no credit card required</p>
        </div>
      </div>

      {/* Final CTA */}
      <div className="relative mx-auto max-w-[1200px] px-6 py-20 text-center sm:px-14 sm:py-24">
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(60% 60% at 70% 30%, rgba(30,138,62,0.32), transparent 70%)" }}
        />
        <div className="relative">
          <h2 className="mx-auto mb-5 max-w-[720px] text-[32px] font-extrabold leading-[1.1] tracking-[-0.035em] sm:text-[46px]">
            Get your group set up before the next round.
          </h2>
          <p className="mx-auto mb-8 max-w-[520px] text-lg text-mkt-muted">
            Two minutes to create your group and send the invite link. No app store, no spreadsheet, no card.
          </p>
          <Link
            href="/signin"
            className="inline-block rounded-2xl bg-mkt-primary px-8 py-4 text-[17px] font-bold text-white shadow-[0_12px_28px_-12px_#22A44A]"
          >
            Find your group
          </Link>
        </div>
      </div>

      {/* Member hook (copy-link, kept from the previous page) */}
      <div className="mx-auto max-w-[1200px] px-6 py-14 text-center sm:px-14">
        <p className="mb-3 text-2xl">👋</p>
        <h2 className="mb-2 text-xl font-bold">Not the group organiser?</h2>
        <p className="mx-auto mb-6 max-w-md text-sm leading-relaxed text-mkt-muted">
          If someone else runs your golf group, send them this page. One conversation could save your whole group from WhatsApp chaos.
        </p>
        <button
          type="button"
          onClick={handleCopyLink}
          className="inline-flex items-center gap-2 rounded-2xl border border-mkt-border bg-mkt-card px-6 py-3 text-sm font-semibold text-mkt-text"
        >
          {copied ? "✓ Link copied!" : "Copy link to share"}
        </button>
      </div>

      {/* Footer */}
      <div className="border-t border-mkt-border px-6 py-8 sm:px-14">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <LogoLockup wordmarkClassName="text-base font-extrabold text-mkt-text" />
          <div className="flex gap-6 text-sm font-medium text-mkt-muted">
            <Link href="/terms" className="hover:text-mkt-text">Terms</Link>
            <Link href="/privacy" className="hover:text-mkt-text">Privacy</Link>
            <a href="mailto:hello@golfcaddy.club" className="hover:text-mkt-text">Contact</a>
            <span className="text-mkt-faint">golfcaddy.club</span>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in `app/page.tsx` or the new `components/marketing/*` files. (Watch for `react/no-unescaped-entities` on the apostrophes/quotes in the hero/testimonial copy — the code above already uses `&rsquo;`/`&ldquo;`/`&rdquo;` HTML entities for the ones inside JSX text nodes to avoid this.)

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx
git commit -m "feat: rebuild marketing landing page with fixed-dark redesign and illustrative live standings"
```

---

### Task 6: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit test suite**

Run: `npm test`
Expected: all tests pass, including the new `illustrativeRound` suite (the pre-existing unrelated `historicalImport` failure is expected and out of scope).

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual browser pass with the dev server**

Run: `npm run dev`, then in a browser:
1. Load `/` — confirm the fixed-dark redesign renders, nav links scroll to `#features`/`#live`/`#pricing`, "Sign in"/"Open app"/"Find your group" all go to `/signin`, pricing "Start free trial" goes to `/create-group`.
2. Resize from 360px to 1440px — confirm the hero collapses to single-column with the phone mock hidden below `lg:`, features go 1 → 2 → 3 columns, the live-standings band stacks copy above the card on narrow widths, and pricing cards stack to one column on mobile.
3. Watch the Live Standings card for at least one full 3-second tick — confirm the hole count advances, points update, and a row's rank changes with a ▲/▼ arrow at least once across a few ticks. Confirm the "Illustrative example" caption is visible.
4. Visit `/terms` and `/privacy` — confirm both render with the fixed-dark layout, the tab pills correctly cross-link between the two routes, the copy matches Task 2's approved text, and the contact card's `mailto:hello@golfcaddy.club` link is present.
5. Confirm the browser tab shows the new flag-mark favicon (may require a hard refresh to bypass any cached favicon).
6. Confirm no ⛳ emoji appears anywhere on `/`, `/terms`, or `/privacy`.

- [ ] **Step 4: Commit note**

No further commit needed — this task is verification only. If Step 3 surfaces a bug, fix it, re-run Steps 1–2, and commit the fix as a new commit (not an amend).
