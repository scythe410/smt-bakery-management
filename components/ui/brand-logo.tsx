// BrandLogo — the fixed Samantha's Bakery brand mark (public/logo.webp), for the
// login screen, the app header (top-left), and printed bills/reports. Distinct
// from <Logo> (components/ui/logo.tsx), which renders a tenant's UPLOADED square
// logo with a monogram fallback. This one is the app's own landscape wordmark, so
// it is height-driven with width auto to preserve its aspect ratio (never cropped).
//
// Server-safe (no hooks). The source is a pre-sized, compressed WebP (~480px wide,
// ~22 KB) rather than the original 1.3 MB PNG — next/image then serves an even
// smaller AVIF/WebP variant sized to `sizes`. Pass `priority` ONLY on the real LCP
// element (the login logo); elsewhere (small header mark, print) leave it lazy.

import Image from "next/image";

// Intrinsic pixel dimensions of public/logo.webp (480×347) — these set the aspect
// ratio; the rendered size is controlled by the height utility in className.
const INTRINSIC = { width: 480, height: 347 } as const;

export function BrandLogo({
  className = "",
  alt = "Samantha's Bakery",
  priority = false,
  // Actual rendered width hint, so next/image fetches a right-sized variant.
  // Default suits the login mark (h-20 ≈ 110px wide); the header passes a smaller
  // value for its tiny h-7 mark.
  sizes = "120px",
}: {
  /** Height utility drives the size, e.g. "h-7" / "h-16"; width follows via w-auto. */
  className?: string;
  alt?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <Image
      src="/logo.webp"
      alt={alt}
      width={INTRINSIC.width}
      height={INTRINSIC.height}
      priority={priority}
      sizes={sizes}
      className={`w-auto object-contain ${className}`}
    />
  );
}
