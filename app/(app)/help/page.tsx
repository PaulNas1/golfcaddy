"use client";

import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronRightIcon } from "@/components/ui/icons";
import { LogoMark } from "@/components/marketing/Logo";

type GuideItem = {
  icon: string;
  title: string;
  steps: string[];
};

const ADMIN_GUIDES: GuideItem[] = [
  {
    icon: "🏌️",
    title: "Setting up your group",
    steps: [
      "Go to Admin → Settings to add your group name and logo.",
      "Copy your invite link from Admin → Members and share it with your players.",
      "Members tap the link, enter their name and email, and you approve them from the Members list.",
    ],
  },
  {
    icon: "📅",
    title: "Creating a round",
    steps: [
      "Go to Admin → Rounds → New Round.",
      "Search for your course by name — GolfCaddy pulls in course data automatically.",
      "Set the date, format (Stableford or Stroke Play), and open RSVPs so members can respond.",
      "Add tee times once you know who's coming, and use Randomise to auto-assign groups.",
    ],
  },
  {
    icon: "flag",
    title: "Running a round (scoring day)",
    steps: [
      "Set the round to Live from Admin → Rounds on the morning of the round.",
      "Members open the app and tap Enter Scores to score hole-by-hole.",
      "Live standings update in real time — no manual tallying.",
      "When the round is over, review scores and tap Publish Results.",
    ],
  },
  {
    icon: "🎯",
    title: "Side prizes (NTP, Longest Drive)",
    steps: [
      "Set up special holes when creating or editing the round in Admin.",
      "On scoring day, members with admin access can record the winner in the Special Holes section on the round detail page.",
      "Winners appear in the published results automatically.",
    ],
  },
  {
    icon: "👥",
    title: "Managing members",
    steps: [
      "Pending members show up in Admin → Members — approve or decline each request.",
      "You can deactivate a member at any time, which removes their access without deleting their history.",
      "Handicaps are calculated automatically from scores — no manual entry needed.",
    ],
  },
  {
    icon: "💳",
    title: "Billing & subscription",
    steps: [
      "Go to Admin → Settings → Billing to view your current plan and member count.",
      "Your 30-day free trial supports up to 20 members.",
      "Starter (A$29/mo) covers up to 20 members, Club (A$49/mo) up to 40, Society (A$79/mo) up to 80.",
      "Cancel any time — no lock-in.",
    ],
  },
];

const MEMBER_GUIDES: GuideItem[] = [
  {
    icon: "📲",
    title: "Joining your group",
    steps: [
      "Ask your group admin for the invite link.",
      "Tap the link on your phone and fill in your name and email.",
      "The admin will approve your request — you'll get access once confirmed.",
      "Tap 'Add to Home Screen' in your browser to install GolfCaddy like a native app.",
    ],
  },
  {
    icon: "✅",
    title: "RSVPing to a round",
    steps: [
      "Open the app and tap the upcoming round on the Home tab.",
      "Tap 'I'm in' to confirm attendance, or 'Can't make it' to decline.",
      "You can change your response any time before the round.",
      "Your admin will assign tee times once RSVPs are in.",
    ],
  },
  {
    icon: "🏌️",
    title: "Entering scores on the day",
    steps: [
      "When the round goes live, you'll see an 'Enter Scores' button on the round page.",
      "Score each hole as you go — enter your gross strokes and GolfCaddy calculates your Stableford points.",
      "You can go back and edit any hole before the round closes.",
      "Results are published by your admin after the round.",
    ],
  },
  {
    icon: "🏆",
    title: "Reading the ladder & handicap",
    steps: [
      "Tap the Ladder tab to see the season standings.",
      "Your handicap updates automatically after each round you play.",
      "Ladder points are awarded based on your finish position in each round.",
    ],
  },
  {
    icon: "💬",
    title: "Social feed",
    steps: [
      "The Social tab shows posts and photos from your group.",
      "You can post updates and photos linked to any round.",
      "Tap a post to read comments and reply.",
    ],
  },
];

function GuideAccordion({ guides }: { guides: GuideItem[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="space-y-2">
      {guides.map((guide, idx) => (
        <div key={guide.title} className="bg-surface-card rounded-2xl border border-surface-overlay overflow-hidden">
          <button
            type="button"
            onClick={() => setExpanded(expanded === idx ? null : idx)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
          >
            <div className="flex items-center gap-3">
              {guide.icon === "flag" ? (
                <LogoMark
                  tileClassName="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-700"
                  className="h-5 w-5 text-white"
                />
              ) : (
                <span className="text-xl">{guide.icon}</span>
              )}
              <p className="text-sm font-semibold text-ink-title">{guide.title}</p>
            </div>
            <ChevronRightIcon
              className={`w-4 h-4 text-ink-hint shrink-0 transition-transform ${
                expanded === idx ? "rotate-90" : ""
              }`}
            />
          </button>
          {expanded === idx && (
            <div className="px-4 pb-4 space-y-2">
              {guide.steps.map((step, stepIdx) => (
                <div key={stepIdx} className="flex gap-3 items-start">
                  <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-brand-600 text-white text-xs font-bold flex items-center justify-center">
                    {stepIdx + 1}
                  </span>
                  <p className="text-sm text-ink-body leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function HelpPage() {
  const { appUser } = useAuth();
  const isAdmin = appUser?.role === "admin";
  const [activeTab, setActiveTab] = useState<"admin" | "member">(
    isAdmin ? "admin" : "member"
  );

  return (
    <div className="px-4 py-6 pb-8 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-ink-title">Help &amp; Getting Started</h1>
        <p className="text-sm text-ink-muted mt-1">
          Step-by-step guides for using GolfCaddy.
        </p>
      </div>

      {/* Tab switcher — always shown so admins can see the member view too */}
      <div className="flex rounded-xl border border-surface-overlay bg-surface-muted p-1 gap-1">
        <button
          type="button"
          onClick={() => setActiveTab("admin")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            activeTab === "admin"
              ? "bg-brand-600 text-white shadow-sm"
              : "text-ink-muted"
          }`}
        >
          For admins
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("member")}
          className={`flex-1 rounded-lg py-2 text-xs font-semibold transition-colors ${
            activeTab === "member"
              ? "bg-brand-600 text-white shadow-sm"
              : "text-ink-muted"
          }`}
        >
          For members
        </button>
      </div>

      {activeTab === "admin" ? (
        <GuideAccordion guides={ADMIN_GUIDES} />
      ) : (
        <GuideAccordion guides={MEMBER_GUIDES} />
      )}

      {/* Contact / feedback nudge */}
      <div className="rounded-2xl border border-surface-overlay bg-surface-muted p-4 text-center">
        <p className="text-sm font-semibold text-ink-title mb-1">Something not covered here?</p>
        <p className="text-xs text-ink-muted">
          Reach out at{" "}
          <a
            href="mailto:hello@golfcaddy.club"
            className="text-brand-600 hover:underline"
          >
            hello@golfcaddy.club
          </a>
        </p>
      </div>
    </div>
  );
}
