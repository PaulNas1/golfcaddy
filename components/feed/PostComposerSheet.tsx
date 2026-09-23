"use client";

/**
 * PostComposerSheet
 *
 * Bottom-sheet composer: a text box and three chips.
 *   📷 Photo     — up to 3 images
 *   ⛳ Round     — link the post to a round (defaults to the latest one)
 *   📣 Announce  — admins only; pins the post to the top of the feed
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import { createFeedPost } from "@/lib/firestore";
import { deleteStoredImage, uploadFeedPostImages, validateImageFile } from "@/lib/storageUploads";
import type { AppUser, Round } from "@/types";

const MAX_POST_IMAGES = 3;

interface PostComposerSheetProps {
  appUser: AppUser;
  isAdmin: boolean;
  rounds: Round[];
  /** Pre-link this round (e.g. deep link from a round page). */
  initialRoundId?: string;
  onClose: () => void;
}

export default function PostComposerSheet({
  appUser,
  isAdmin,
  rounds,
  initialRoundId = "",
  onClose,
}: PostComposerSheetProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const [draft, setDraft] = useState("");
  const [announce, setAnnounce] = useState(false);
  const [images, setImages] = useState<File[]>([]);
  const [linkedRoundId, setLinkedRoundId] = useState(initialRoundId);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");

  // Newest round that has already started — the one people post about.
  const sortedRounds = useMemo(
    () => [...rounds].sort((a, b) => b.date.getTime() - a.date.getTime()),
    [rounds]
  );
  const defaultRound = useMemo(() => {
    const now = Date.now();
    return sortedRounds.find((r) => r.date.getTime() <= now) ?? sortedRounds[0] ?? null;
  }, [sortedRounds]);
  const linkedRound = sortedRounds.find((r) => r.id === linkedRoundId) ?? null;

  const previews = useMemo(() => images.map((f) => URL.createObjectURL(f)), [images]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  // Lock page scroll + focus the text box while open; Esc closes.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => textRef.current?.focus(), 220);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const addImages = (files: FileList | null) => {
    const next = [...images, ...Array.from(files ?? [])];
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (next.length > MAX_POST_IMAGES) { setError(`Up to ${MAX_POST_IMAGES} photos per post.`); return; }
    for (const f of next) {
      const err = validateImageFile(f);
      if (err) { setError(err); return; }
    }
    setError("");
    setImages(next);
  };

  const canPost = !posting && (draft.trim().length > 0 || images.length > 0);
  const isAnnouncement = isAdmin && announce;

  const submit = async () => {
    if (!canPost || !appUser.groupId) return;
    setPosting(true);
    setError("");
    let uploadedPaths: string[] = [];
    try {
      const uploads = images.length > 0
        ? await uploadFeedPostImages(appUser.groupId, appUser.uid, images)
        : [];
      uploadedPaths = uploads.map((u) => u.path);
      await createFeedPost({
        groupId: appUser.groupId,
        author: appUser,
        content: draft,
        type: isAnnouncement ? "announcement" : linkedRoundId ? "round_linked" : "general",
        roundId: linkedRoundId || null,
        photoUrls: uploads.map((u) => u.url),
        photoPaths: uploadedPaths,
      });
      onClose();
    } catch (err) {
      await Promise.all(uploadedPaths.map((p) => deleteStoredImage(p)));
      setError(err instanceof Error && err.message ? err.message : "Failed to publish post.");
      setPosting(false);
    }
  };

  const chip = (on: boolean, tone: "brand" | "amber" = "brand") =>
    `rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
      on
        ? tone === "amber"
          ? "border-announce-border bg-announce-bg text-announce-label"
          : "border-brand-500 bg-brand-500/15 text-brand-600"
        : "border-surface-overlay bg-surface-muted text-ink-body"
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="New post">
      <button type="button" aria-label="Close" onClick={onClose} className="gc-fade-in absolute inset-0 bg-black/55" />

      <div className="gc-sheet-up relative w-full max-w-lg rounded-t-3xl bg-surface-card px-4 pt-2.5 shadow-2xl pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-surface-overlay" />

        <div className="flex items-center gap-2.5">
          <Avatar src={appUser.avatarUrl} name={appUser.displayName} size="sm" />
          <p className="flex-1 text-[15px] font-semibold text-ink-title">{appUser.displayName}</p>
        </div>

        <textarea
          ref={textRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          placeholder={
            isAnnouncement ? "Something members shouldn't miss…"
            : linkedRound ? `How did Round ${linkedRound.roundNumber} go?`
            : "What's happening in the group?"
          }
          className="mt-2 w-full resize-none bg-transparent text-[17px] leading-relaxed text-ink-title placeholder:text-ink-hint focus:outline-none"
        />

        {previews.length > 0 && (
          <div className="mb-3 flex gap-2">
            {previews.map((url, i) => (
              <div key={url} className="relative h-20 w-20 overflow-hidden rounded-xl bg-surface-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages(images.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-xs text-white"
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── Chips ───────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addImages(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={images.length >= MAX_POST_IMAGES}
            className={`${chip(images.length > 0)} disabled:opacity-40`}
          >
            📷 Photo{images.length > 0 ? ` ${images.length}/${MAX_POST_IMAGES}` : ""}
          </button>

          {defaultRound && (
            <button
              type="button"
              onClick={() => setLinkedRoundId(linkedRoundId ? "" : defaultRound.id)}
              className={chip(!!linkedRoundId)}
            >
              ⛳ {linkedRound ? `Round ${linkedRound.roundNumber}` : "Link round"}
            </button>
          )}

          {isAdmin && (
            <button type="button" onClick={() => setAnnounce((v) => !v)} className={chip(announce, "amber")}>
              📣 Announce
            </button>
          )}
        </div>

        {/* Change which round, only once one is linked */}
        {linkedRound && (
          <select
            value={linkedRoundId}
            onChange={(e) => setLinkedRoundId(e.target.value)}
            aria-label="Linked round"
            className="mt-2 w-full rounded-xl border border-surface-overlay bg-surface-muted px-3 py-2 text-sm text-ink-body focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {sortedRounds.map((r) => (
              <option key={r.id} value={r.id}>{`Round ${r.roundNumber} · ${r.courseName}`}</option>
            ))}
          </select>
        )}

        {error && <p className="mt-2 text-xs font-medium text-red-500">{error}</p>}

        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={onClose} className="px-1 text-[15px] text-ink-muted">
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canPost}
            className="rounded-xl bg-brand-600 px-6 py-2.5 text-[15px] font-bold text-white disabled:opacity-40"
          >
            {posting ? "Posting…" : isAnnouncement ? "Announce" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
