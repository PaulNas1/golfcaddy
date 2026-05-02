/**
 * Avatar
 *
 * Renders a user avatar as a proper <img> element (for accessibility and
 * Next.js image pipeline compatibility) with an initials fallback when no
 * photo is available.
 *
 * Why <img> instead of next/image?
 *   Firebase Storage URLs are dynamic and not in the configured Next.js image
 *   domain list. Using a plain <img> is intentional here — we suppress the
 *   eslint rule at the component boundary so callers don't need to.
 */

type Size = "xs" | "sm" | "md" | "lg";

const SIZE_CLASSES: Record<Size, string> = {
  xs: "h-7 w-7 text-[11px]",
  sm: "h-9 w-9 text-sm",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-2xl",
};

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: Size;
  className?: string;
}

export default function Avatar({ src, name, size = "md", className = "" }: AvatarProps) {
  const sizeClasses = SIZE_CLASSES[size];
  const initial = name.charAt(0).toUpperCase() || "?";

  const base = `${sizeClasses} rounded-full shrink-0 ${className}`;

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className={`${base} object-cover`}
      />
    );
  }

  return (
    <div
      className={`${base} flex items-center justify-center bg-brand-100 font-bold text-brand-700`}
    >
      {initial}
    </div>
  );
}
