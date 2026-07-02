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
