// Logo — renders the business logo when present, else a monogram fallback so we
// never ship a broken image (DESIGN.md §5). Server-safe (no hooks).
//
// `src` should be a resolvable URL. Storage logo paths are private object paths,
// not URLs, so callers pass a signed/public URL or nothing; until logo upload
// lands, this renders the "SBH" monogram.

import Image from "next/image";

const SIZES = {
  sm: { box: "size-9", text: "text-base", px: 36 },
  md: { box: "size-14", text: "text-2xl", px: 56 },
  lg: { box: "size-20", text: "text-3xl", px: 80 },
} as const;

export function Logo({
  src,
  name = "SBH",
  size = "md",
  className = "",
}: {
  src?: string | null;
  /** Business name — used to derive the monogram and for alt text. */
  name?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  const monogram = initials(name);

  if (src) {
    return (
      <Image
        src={src}
        alt={name}
        width={s.px}
        height={s.px}
        className={`${s.box} rounded-[var(--radius)] object-cover ${className}`}
        priority
      />
    );
  }

  return (
    <div
      aria-label={name}
      role="img"
      className={`bg-brand text-brand-white font-display flex ${s.box} items-center justify-center rounded-[var(--radius)] font-bold ${s.text} ${className}`}
    >
      {monogram}
    </div>
  );
}

/** "Samanthas Bake House" → "SBH"; single word → first two letters. Multi-word
 *  takes the leading letter of each word (capped at 3) so a rename tracks. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "SBH";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}
