// BrandLogo — the fixed Samantha's Bakery brand mark (public/logo.png), for the
// login screen, the app header (top-left), and printed bills/reports. Distinct
// from <Logo> (components/ui/logo.tsx), which renders a tenant's UPLOADED square
// logo with a monogram fallback. This one is the app's own landscape wordmark, so
// it is height-driven with width auto to preserve its aspect ratio (never cropped).
//
// Server-safe (no hooks). next/image optimises delivery, so the large source PNG
// is served resized/compressed. Set the display height via `className` (e.g. h-7).

import Image from "next/image";

// Intrinsic pixel dimensions of public/logo.png (1474×1067) — required by
// next/image; the rendered size is controlled by the height utility in className.
const INTRINSIC = { width: 1474, height: 1067 } as const;

export function BrandLogo({
  className = "",
  alt = "Samantha's Bakery",
  priority = false,
}: {
  /** Height utility drives the size, e.g. "h-7" / "h-16"; width follows via w-auto. */
  className?: string;
  alt?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/logo.png"
      alt={alt}
      width={INTRINSIC.width}
      height={INTRINSIC.height}
      priority={priority}
      sizes="(max-width: 430px) 50vw, 200px"
      className={`w-auto object-contain ${className}`}
    />
  );
}
