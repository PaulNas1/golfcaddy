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
