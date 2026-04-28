"use client";

/**
 * ImageGestureViewer
 *
 * Full-screen image viewer with:
 *   • Pinch-to-zoom (2-finger, clamped 1×–4×)
 *   • Double-tap to toggle 2.5× zoom
 *   • Pan while zoomed
 *   • Swipe-down to close (when not zoomed, >120 px drag)
 *   • Dynamic overlay opacity that fades as you drag down
 *   • Escape key to close
 *
 * Pass an optional `footer` slot for metadata shown as a bottom overlay
 * (e.g. uploader name, date, tags). It auto-hides while zoomed in.
 */

import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";

interface ImageGestureViewerProps {
  src: string;
  alt: string;
  onClose: () => void;
  /** Optional bottom-overlay content — hidden while zoomed */
  footer?: React.ReactNode;
}

export default function ImageGestureViewer({
  src,
  alt,
  onClose,
  footer,
}: ImageGestureViewerProps) {
  const [mounted, setMounted] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);

  // Refs mirror state so touch handlers read current values synchronously
  const scaleRef = useRef(1);
  const offsetRef = useRef({ x: 0, y: 0 });
  const pinchRef = useRef<{ startDistance: number; startScale: number } | null>(null);
  const panRef = useRef<{
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const lastTapRef = useRef(0);
  const skipTouchEndResetRef = useRef(false);

  // Mount portal + lock body scroll + Escape key
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeViewer();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep refs in sync with state
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { offsetRef.current = offset; }, [offset]);

  const closeViewer = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    onClose();
  };

  const resetTransform = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    scaleRef.current = 1;
    offsetRef.current = { x: 0, y: 0 };
  };

  const toggleZoom = () => {
    if (scaleRef.current > 1) {
      resetTransform();
    } else {
      setScale(2.5);
      setOffset({ x: 0, y: 0 });
      scaleRef.current = 2.5;
      offsetRef.current = { x: 0, y: 0 };
    }
  };

  const getTouchDistance = (
    touches: ArrayLike<{ clientX: number; clientY: number }>
  ) => {
    const [a, b] = [touches[0], touches[1]];
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    // Two-finger pinch
    if (event.touches.length === 2) {
      pinchRef.current = {
        startDistance: getTouchDistance(event.touches),
        startScale: scaleRef.current,
      };
      panRef.current = null;
      setDragging(true);
      return;
    }

    if (event.touches.length !== 1) return;

    // Double-tap detection
    const now = Date.now();
    if (now - lastTapRef.current < 260) {
      event.preventDefault();
      skipTouchEndResetRef.current = true;
      toggleZoom();
      lastTapRef.current = 0;
      panRef.current = null;
      return;
    }
    lastTapRef.current = now;

    const touch = event.touches[0];
    panRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      originX: offsetRef.current.x,
      originY: offsetRef.current.y,
      moved: false,
    };
    setDragging(true);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    // Pinch zoom
    if (event.touches.length === 2 && pinchRef.current) {
      event.preventDefault();
      const nextScale = Math.min(
        4,
        Math.max(
          1,
          pinchRef.current.startScale *
            (getTouchDistance(event.touches) / pinchRef.current.startDistance)
        )
      );
      setScale(nextScale);
      if (nextScale <= 1.05) setOffset({ x: 0, y: 0 });
      return;
    }

    if (event.touches.length !== 1 || !panRef.current) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - panRef.current.startX;
    const deltaY = touch.clientY - panRef.current.startY;

    if (Math.abs(deltaX) > 4 || Math.abs(deltaY) > 4) {
      panRef.current.moved = true;
    }

    // Pan while zoomed
    if (scaleRef.current > 1) {
      event.preventDefault();
      setOffset({
        x: panRef.current.originX + deltaX,
        y: panRef.current.originY + deltaY,
      });
      return;
    }

    // Swipe-down drag at normal scale
    if (deltaY > 0) {
      event.preventDefault();
      setOffset({ x: 0, y: deltaY });
    }
  };

  const handleTouchEnd = () => {
    if (skipTouchEndResetRef.current) {
      skipTouchEndResetRef.current = false;
      pinchRef.current = null;
      panRef.current = null;
      setDragging(false);
      return;
    }

    const currentY = offsetRef.current.y;
    pinchRef.current = null;
    panRef.current = null;
    setDragging(false);

    if (scaleRef.current <= 1.05) {
      if (currentY > 120) {
        closeViewer();
        return;
      }
      resetTransform();
    }
  };

  // Overlay fades as the user drags down
  const overlayOpacity =
    scale > 1 ? 0.96 : Math.max(0.4, 0.96 - Math.abs(offset.y) / 300);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{ backgroundColor: `rgba(0,0,0,${overlayOpacity})` }}
      onClick={closeViewer}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={closeViewer}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white backdrop-blur"
      >
        Close
      </button>

      {/* Gesture surface */}
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden"
        style={{ touchAction: "none" }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={toggleZoom}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="max-h-full max-w-full select-none object-contain"
          style={{
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0) scale(${scale})`,
            transition: dragging ? "none" : "transform 180ms ease",
            transformOrigin: "center center",
            // Add bottom padding so image clears the footer when not zoomed
            paddingBottom: footer && scale <= 1 ? "100px" : "0",
          }}
        />
      </div>

      {/* Hint */}
      {scale <= 1 && (
        <p className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white backdrop-blur">
          Pinch or double-tap to zoom · Swipe down to close
        </p>
      )}

      {/* Footer metadata — hidden while zoomed */}
      {footer && scale <= 1.05 && (
        <div
          className="absolute bottom-0 left-0 right-0 bg-black/60 px-4 py-4 backdrop-blur-sm"
          onClick={(e) => e.stopPropagation()}
        >
          {footer}
        </div>
      )}
    </div>,
    document.body
  );
}
