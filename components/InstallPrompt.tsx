"use client";

import { useEffect, useState } from "react";

type InstallState =
  | "hidden"        // not applicable / already dismissed
  | "android"       // beforeinstallprompt fired — show native install banner
  | "ios";          // iOS Safari — show manual install instructions

const DISMISSED_KEY = "pwa-install-dismissed";

export default function InstallPrompt() {
  const [state, setState] = useState<InstallState>("hidden");
  const [deferredPrompt, setDeferredPrompt] = useState<Event & { prompt: () => Promise<void> } | null>(null);

  useEffect(() => {
    // Never show if already dismissed in this browser
    if (localStorage.getItem(DISMISSED_KEY)) return;

    // Already installed as standalone
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as Event & { prompt: () => Promise<void> });
      setState("android");
    };

    window.addEventListener("beforeinstallprompt", handler);

    // iOS detection: Safari on iOS, not already in standalone mode
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isIOSSafari = isIOS && !("chrome" in window) && /safari/i.test(navigator.userAgent);
    if (isIOSSafari) setState("ios");

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setState("hidden");
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    dismiss();
  };

  if (state === "hidden") return null;

  return (
    <div className="mx-4 mb-4 rounded-2xl border border-brand-200 bg-brand-50 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-2xl shrink-0">📲</span>
          <div>
            <p className="font-semibold text-brand-900 text-sm">Add to Home Screen</p>
            {state === "android" ? (
              <p className="text-xs text-brand-700 mt-0.5">
                Install GolfCaddy for faster access and offline support.
              </p>
            ) : (
              <p className="text-xs text-brand-700 mt-0.5">
                Tap the <strong>Share</strong> button then <strong>&ldquo;Add to Home Screen&rdquo;</strong> for the best experience.
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 text-brand-400 hover:text-brand-600 transition-colors"
          aria-label="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {state === "android" && (
        <button
          type="button"
          onClick={handleInstall}
          className="mt-3 w-full rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white"
        >
          Install app
        </button>
      )}
    </div>
  );
}
