"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";

const FEATURES = [
  {
    icon: "📅",
    title: "Rounds & Tee Times",
    desc: "Schedule rounds, manage RSVPs, and auto-assign tee time groups — no group chat needed.",
  },
  {
    icon: "🏌️",
    title: "Live Scoring",
    desc: "Hole-by-hole scoring on every phone. Stableford or stroke play. Results published instantly.",
  },
  {
    icon: "🏆",
    title: "Season Ladder",
    desc: "Handicaps and ladder points calculated automatically after every round. Always up to date.",
  },
  {
    icon: "🎯",
    title: "Side Prizes",
    desc: "Nearest the pin, longest drive, T2, T3 — all tracked in-app. No more arguing after the 19th.",
  },
  {
    icon: "📱",
    title: "No App Store Required",
    desc: "Works in any browser. Members install it from the browser like a native app — one tap, done.",
  },
  {
    icon: "💬",
    title: "Group Social Feed",
    desc: "Photos, updates, and banter — all in one place and tied to actual rounds.",
  },
];

const PLANS = [
  { name: "Starter", price: 29, members: 20 },
  { name: "Club",    price: 49, members: 40, popular: true },
  { name: "Society", price: 79, members: 80 },
];

const PAIN_POINTS = [
  { icon: "💬", label: "WhatsApp threads", desc: "1,200 unread messages to find next Saturday's tee time" },
  { icon: "📊", label: "Spreadsheets",     desc: "One person maintains it, everyone else breaks it" },
  { icon: "📄", label: "Paper scorecards", desc: "Illegible, lost, and in the bin by Monday" },
  { icon: "🤯", label: "Manual handicaps", desc: "Someone calculates it wrong every single time" },
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
      <div className="min-h-screen bg-brand-700 flex flex-col items-center justify-center">
        <div className="text-6xl mb-4">⛳</div>
        <h1 className="text-3xl font-bold text-white">GolfCaddy</h1>
        <p className="text-brand-200 mt-2 text-sm">Social golf groups</p>
        <div className="mt-8 flex gap-1.5">
          <span className="w-2 h-2 rounded-full bg-brand-300 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-2 h-2 rounded-full bg-brand-300 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-2 h-2 rounded-full bg-brand-300 animate-bounce" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-700 text-white">

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-2">
          <span className="text-2xl">⛳</span>
          <span className="font-bold text-lg tracking-tight">GolfCaddy</span>
        </div>
        <Link
          href="/signin"
          className="text-sm font-medium text-brand-200 hover:text-white transition-colors"
        >
          Sign in
        </Link>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className="px-6 pt-10 pb-16 text-center max-w-xl mx-auto">
        <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
          Stop running your golf group on WhatsApp and a spreadsheet.
        </h1>
        <p className="mt-4 text-brand-200 text-base leading-relaxed">
          GolfCaddy handles rounds, scoring, handicaps, tee times, and side prizes — so your group can focus on golf.
        </p>
        <div className="mt-8 flex flex-col gap-3 max-w-xs mx-auto">
          <Link
            href="/create-group"
            className="block w-full bg-white text-brand-700 font-bold text-base py-4 rounded-2xl text-center shadow-lg active:scale-[0.98] transition-transform"
          >
            Start free — 30 days, no card required
          </Link>
          <Link
            href="/signin"
            className="block w-full border border-white/30 text-white/80 font-medium text-sm py-3 rounded-2xl text-center hover:border-white/60 transition-colors"
          >
            Sign in to your group
          </Link>
        </div>
        <p className="mt-4 text-brand-300 text-xs">
          Try free with up to 20 members. No credit card needed.
        </p>
      </section>

      {/* ── Pain points ─────────────────────────────────────────────────── */}
      <section className="bg-black/20 px-6 py-12">
        <div className="max-w-xl mx-auto">
          <p className="text-center text-brand-300 text-xs font-semibold uppercase tracking-widest mb-6">
            Sound familiar?
          </p>
          <div className="grid grid-cols-2 gap-3">
            {PAIN_POINTS.map(({ icon, label, desc }) => (
              <div key={label} className="bg-white/5 rounded-2xl p-4">
                <div className="text-2xl mb-2">{icon}</div>
                <p className="font-semibold text-sm text-white mb-1">{label}</p>
                <p className="text-xs text-brand-300 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <p className="text-center mt-6 text-brand-200 text-sm font-medium">
            GolfCaddy replaces all of it. One app, one login, everything in sync.
          </p>
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section className="px-6 py-14 max-w-xl mx-auto">
        <p className="text-center text-brand-300 text-xs font-semibold uppercase tracking-widest mb-2">
          How it works
        </p>
        <h2 className="text-center text-2xl font-bold mb-10">Up and running in minutes</h2>
        <div className="space-y-8">
          {[
            {
              step: "1",
              title: "Create your group",
              desc: "Set up your group in 2 minutes. Add your group name, logo, and invite your first members via link.",
            },
            {
              step: "2",
              title: "Members join — no app store needed",
              desc: "Members tap your invite link and install GolfCaddy straight from their browser. Works on any phone.",
            },
            {
              step: "3",
              title: "Schedule your first round",
              desc: "Set the course, open RSVPs, assign tee times, and let your members score hole-by-hole on the day.",
            },
          ].map(({ step, title, desc }) => (
            <div key={step} className="flex gap-5 items-start">
              <div className="shrink-0 w-9 h-9 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-sm font-bold text-white">
                {step}
              </div>
              <div className="pt-1">
                <p className="font-semibold text-white text-sm">{title}</p>
                <p className="text-brand-300 text-sm leading-relaxed mt-1">{desc}</p>
              </div>
            </div>
          ))}
        </div>
        <Link
          href="/create-group"
          className="mt-10 block w-full bg-white text-brand-700 font-bold text-base py-4 rounded-2xl text-center shadow-lg active:scale-[0.98] transition-transform"
        >
          Start free — no card required
        </Link>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section className="px-6 py-14 max-w-xl mx-auto">
        <p className="text-center text-brand-300 text-xs font-semibold uppercase tracking-widest mb-8">
          Everything you need
        </p>
        <div className="grid grid-cols-1 gap-4">
          {FEATURES.map(({ icon, title, desc }) => (
            <div key={title} className="flex gap-4 items-start">
              <div className="text-2xl shrink-0 mt-0.5">{icon}</div>
              <div>
                <p className="font-semibold text-white text-sm">{title}</p>
                <p className="text-brand-300 text-sm leading-relaxed mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section className="bg-black/20 px-6 py-14">
        <div className="max-w-xl mx-auto">
          <p className="text-center text-brand-300 text-xs font-semibold uppercase tracking-widest mb-2">
            Pricing
          </p>
          <h2 className="text-center text-2xl font-bold mb-2">
            All features. Pick your group size.
          </h2>
          <p className="text-center text-brand-300 text-sm mb-8">
            Every plan includes everything. Just choose what fits your group.
          </p>

          <div className="space-y-3">
            {PLANS.map(({ name, price, members, popular }) => (
              <div
                key={name}
                className={`rounded-2xl p-5 flex items-center justify-between ${
                  popular
                    ? "bg-white text-brand-800 ring-2 ring-white"
                    : "bg-white/10 text-white"
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-base">{name}</p>
                    {popular && (
                      <span className="text-xs font-semibold bg-brand-600 text-white px-2 py-0.5 rounded-full">
                        Most popular
                      </span>
                    )}
                  </div>
                  <p className={`text-sm mt-0.5 ${popular ? "text-brand-600" : "text-brand-300"}`}>
                    Up to {members} members
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-extrabold text-xl">A${price}</p>
                  <p className={`text-xs ${popular ? "text-brand-600" : "text-brand-300"}`}>/month</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 bg-brand-600/40 rounded-2xl p-4 text-center">
            <p className="text-white font-semibold text-sm">30 days free, no credit card required</p>
            <p className="text-brand-200 text-xs mt-1">Cancel any time. No lock-in.</p>
          </div>

          <Link
            href="/create-group"
            className="mt-6 block w-full bg-white text-brand-700 font-bold text-base py-4 rounded-2xl text-center shadow-lg active:scale-[0.98] transition-transform"
          >
            Start your free trial
          </Link>
        </div>
      </section>

      {/* ── Member hook ─────────────────────────────────────────────────── */}
      <section className="px-6 py-14 max-w-xl mx-auto text-center">
        <p className="text-2xl mb-3">👋</p>
        <h2 className="text-xl font-bold mb-2">Not the group organiser?</h2>
        <p className="text-brand-200 text-sm leading-relaxed mb-6">
          If someone else runs your golf group, send them this page. One conversation could save your whole group from WhatsApp chaos.
        </p>
        <button
          type="button"
          onClick={handleCopyLink}
          className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-sm px-6 py-3 rounded-2xl transition-colors"
        >
          {copied ? "✓ Link copied!" : "Copy link to share"}
        </button>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 px-6 py-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <span className="text-xl">⛳</span>
          <span className="font-bold">GolfCaddy</span>
        </div>
        <div className="flex justify-center gap-4 text-xs text-brand-400">
          <Link href="/terms"   className="hover:text-brand-200 transition-colors">Terms of Use</Link>
          <Link href="/privacy" className="hover:text-brand-200 transition-colors">Privacy Policy</Link>
        </div>
      </footer>

    </div>
  );
}
