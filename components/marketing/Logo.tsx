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
