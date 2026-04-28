"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { format, formatDistanceToNow } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { useGroupData } from "@/contexts/GroupDataContext";
import {
  subscribeGroupPhotos,
  syncGroupPhotoLibrary,
} from "@/lib/firestore";
import type { Photo, Round } from "@/types";

function getCourseFilterKey(photo: Photo, roundsById: Map<string, Round>) {
  const roundCourseId = photo.roundId ? roundsById.get(photo.roundId)?.courseId : null;
  const roundCourseName = photo.roundId
    ? roundsById.get(photo.roundId)?.courseName
    : null;
  const rawKey = photo.courseId || roundCourseId || photo.courseName || roundCourseName || "";
  return rawKey.trim();
}

function getCourseLabel(photo: Photo, roundsById: Map<string, Round>) {
  return (
    photo.courseName ||
    (photo.roundId ? roundsById.get(photo.roundId)?.courseName : null) ||
    ""
  ).trim();
}

function getRoundLabel(photo: Photo, roundsById: Map<string, Round>) {
  const round = photo.roundId ? roundsById.get(photo.roundId) : null;
  if (round) {
    return `Round ${round.roundNumber} - ${round.courseName}`;
  }
  return `Round ${photo.roundNumber ?? "?"}`;
}

const PAGE_SIZE = 50;

export default function PhotosPage() {
  const { appUser } = useAuth();
  const { rounds } = useGroupData();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [limitCount, setLimitCount] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);
  const didAttemptBackfillRef = useRef(false);

  useEffect(() => {
    if (!appUser?.groupId) return;

    const unsubscribePhotos = subscribeGroupPhotos(
      appUser.groupId,
      (nextPhotos, nextHasMore) => {
        setPhotos(nextPhotos);
        setHasMore(nextHasMore);
        setLoading(false);
        if (nextPhotos.length === 0 && !didAttemptBackfillRef.current) {
          didAttemptBackfillRef.current = true;
          syncGroupPhotoLibrary(appUser.groupId).catch((err) => {
            console.warn("Unable to backfill group photo library", err);
          });
        }
      },
      {
        limitCount,
        onError: (err) => {
          console.warn("Unable to subscribe to group photos", err);
          setLoading(false);
        },
      }
    );

    return () => {
      unsubscribePhotos();
    };
  }, [appUser?.groupId, limitCount]);

  const roundsById = useMemo(
    () => new Map(rounds.map((round) => [round.id, round])),
    [rounds]
  );

  const roundOptions = useMemo(() => {
    return Array.from(
      new Map(
        photos
          .filter((photo) => photo.roundId)
          .map(
            (photo): [string, string] => [
              photo.roundId as string,
              getRoundLabel(photo, roundsById),
            ]
          )
      ).entries()
    );
  }, [photos, roundsById]);

  const courseOptions = useMemo(() => {
    return Array.from(
      new Map(
        photos
          .map(
            (photo): [string, string] => [
              getCourseFilterKey(photo, roundsById),
              getCourseLabel(photo, roundsById),
            ]
          )
          .filter(([courseKey, courseLabel]) => courseKey.length > 0 && courseLabel.length > 0)
      ).entries()
    );
  }, [photos, roundsById]);

  const visiblePhotos = useMemo(() => {
    return photos.filter((photo) => {
      if (scope === "mine" && photo.uploaderId !== appUser?.uid) return false;
      if (selectedRoundId && photo.roundId !== selectedRoundId) return false;
      if (selectedCourseId && getCourseFilterKey(photo, roundsById) !== selectedCourseId) {
        return false;
      }
      return true;
    });
  }, [appUser?.uid, photos, roundsById, scope, selectedCourseId, selectedRoundId]);

  return (
    <div className="px-4 py-6 pb-8">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-800">Photo Library</h1>
        <p className="mt-1 text-sm text-gray-500">
          Browse group photos by round, course, or uploader.
        </p>
      </div>

      <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScope("all")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              scope === "all"
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            All photos
          </button>
          <button
            type="button"
            onClick={() => setScope("mine")}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              scope === "mine"
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            My uploads
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Round</span>
            <select
              value={selectedRoundId}
              onChange={(event) => setSelectedRoundId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All rounds</option>
              {roundOptions.map(([roundId, label]) => (
                <option key={roundId} value={roundId}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-gray-700">Course</span>
            <select
              value={selectedCourseId}
              onChange={(event) => setSelectedCourseId(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All courses</option>
              {courseOptions.map(([courseId, courseName]) => (
                <option key={courseId} value={courseId}>
                  {courseName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((item) => (
            <div key={item} className="aspect-square animate-pulse rounded-2xl bg-white" />
          ))}
        </div>
      ) : visiblePhotos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center shadow-sm">
          <div className="text-4xl">📷</div>
          <p className="mt-3 font-semibold text-gray-700">No photos match these filters</p>
          <p className="mt-1 text-sm text-gray-400">
            Upload images in the feed and optionally link them to a round to organise them here.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {visiblePhotos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setSelectedPhoto(photo)}
              className="overflow-hidden rounded-2xl border border-gray-100 bg-white text-left shadow-sm"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.photoUrl}
                alt={photo.courseName ?? "Group photo"}
                className="aspect-square w-full object-cover"
                loading="lazy"
                decoding="async"
              />
              <div className="space-y-2 p-3">
                <div className="flex min-h-[24px] items-center gap-1.5">
                  {photo.roundNumber ? (
                    <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
                      {`Round ${photo.roundNumber}`}
                    </span>
                  ) : null}
                </div>
                <div className="min-h-[18px]">
                  {getCourseLabel(photo, roundsById) ? (
                    <p className="truncate text-sm font-medium text-gray-500">
                      {getCourseLabel(photo, roundsById)}
                    </p>
                  ) : (
                    <p className="text-sm font-medium text-gray-400">
                      Unlinked
                    </p>
                  )}
                </div>
                <div className="min-h-[38px]">
                  <p className="truncate text-sm font-semibold text-gray-800">
                    {photo.uploaderName}
                  </p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {formatDistanceToNow(photo.createdAt, { addSuffix: true })}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Load more — only shown when Firestore has additional photos */}
      {hasMore && !loading && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setLimitCount((n) => n + PAGE_SIZE)}
            className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-gray-600 shadow-sm active:bg-gray-50"
          >
            Load more
          </button>
        </div>
      )}

      {selectedPhoto && (
        <PhotoViewer photo={selectedPhoto} onClose={() => setSelectedPhoto(null)} />
      )}
    </div>
  );
}

function PhotoViewer({
  photo,
  onClose,
}: {
  photo: Photo;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.addEventListener("keydown", handleEscape);
    return () => {
      setMounted(false);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6"
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-gray-800">{photo.uploaderName}</p>
            <p className="text-xs text-gray-400">
              {format(photo.createdAt, "EEEE d MMM yyyy")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600"
          >
            Close
          </button>
        </div>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.photoUrl}
          alt={photo.courseName ?? "Group photo"}
          className="max-h-[60vh] w-full bg-black object-contain"
        />

        <div className="space-y-3 px-4 py-4">
          <div className="flex flex-wrap gap-2">
            {photo.roundNumber ? (
              <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700">
                {`Round ${photo.roundNumber}`}
              </span>
            ) : null}
            {photo.courseName ? (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                {photo.courseName}
              </span>
            ) : (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
                No round linked
              </span>
            )}
          </div>
          <dl className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between gap-3">
              <dt className="font-medium text-gray-500">Uploaded by</dt>
              <dd className="text-right text-gray-800">{photo.uploaderName}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="font-medium text-gray-500">Added</dt>
              <dd className="text-right text-gray-800">
                {format(photo.createdAt, "d MMM yyyy, h:mm a")}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="font-medium text-gray-500">Post link</dt>
              <dd className="text-right text-gray-800">Feed post photo</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>,
    document.body
  );
}
