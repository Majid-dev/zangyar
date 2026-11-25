import Image from "next/image";
import Link from "next/link";

/**
 * The ZangYar brand mark and lockup.
 *
 * The icon set in `public/logo` ships one variant at every size from 16 to 512, so
 * a caller asks for the size it needs and the matching file is used — no asset is
 * referenced by path anywhere else, and nothing is scaled down twice. Sizes the set
 * does not have exactly resolve upward to the next one, so the browser downsamples
 * rather than blurring an upscaled image.
 *
 * The mark is single-variant: the navy speech bubble is opaque, so it reads on the
 * app's light surfaces (`--background`, `--surface`) as-is. The one dark surface in
 * the product is the login/registration editorial panel, which is `--primary` —
 * there the navy mark would vanish, so `plate` puts it on a `--paper` tile. That
 * tile is a contrast requirement, not decoration, which is why it is opt-in and
 * only the dark surfaces pass it.
 */

/** Every size present in `public/logo`, ascending. */
const ICON_SIZES = [16, 24, 32, 48, 64, 96, 128, 180, 192, 256, 384, 512] as const;

const ICON_DIRECTORY = "/logo";

/** The smallest available asset that is at least `size`, for a crisp render. */
export function brandIconSrc(size: number) {
  const chosen = ICON_SIZES.find((available) => available >= size) ?? ICON_SIZES[ICON_SIZES.length - 1];
  return `${ICON_DIRECTORY}/zangyar-icon-${chosen}x${chosen}.png`;
}

/**
 * The mark alone.
 *
 * `alt` is empty on purpose: every current placement pairs it with the brand name
 * in text, so announcing it again would duplicate what the reader already has.
 */
export function BrandMark({ size = 40, plate = false }: { size?: number; plate?: boolean }) {
  // Inset within the tile so the mark is not flush against its edge.
  const imageSize = plate ? Math.round(size * 0.72) : size;

  return (
    <span
      className={`flex shrink-0 items-center justify-center ${plate ? "rounded-xl bg-paper" : ""}`}
      style={{ width: size, height: size }}
    >
      <Image src={brandIconSrc(imageSize)} alt="" width={imageSize} height={imageSize} />
    </span>
  );
}

type BrandLockupProps = {
  /** Omitted where the lockup is not a navigation target, such as inside a card. */
  href?: string;
  /** Which surface it sits on, so the text and the tile pick the right contrast. */
  tone?: "light" | "dark";
  size?: number;
  showTagline?: boolean;
  tagline?: string;
  className?: string;
};

/**
 * The mark with the brand name, and optionally the tagline.
 *
 * One component for the sidebar, the mobile header, and the public auth pages, so
 * the marks cannot drift apart between them.
 */
export function BrandLockup({
  href,
  tone = "light",
  size = 40,
  showTagline = true,
  tagline = "مدرسه در جریان، خانواده در کنار",
  className = "",
}: BrandLockupProps) {
  const dark = tone === "dark";

  const content = (
    <>
      <BrandMark size={size} plate={dark} />
      <span>
        <span className={`block text-base font-black tracking-tight ${dark ? "text-white" : "text-primary"}`}>زنگ‌یار</span>
        {showTagline ? (
          <span className={`block text-[11px] ${dark ? "text-white/60" : "text-muted"}`}>{tagline}</span>
        ) : null}
      </span>
    </>
  );

  const classes = `flex items-center gap-3 ${className}`;

  return href ? (
    <Link href={href} className={classes}>
      {content}
    </Link>
  ) : (
    <span className={classes}>{content}</span>
  );
}
