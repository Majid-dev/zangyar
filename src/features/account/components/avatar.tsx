import { nameInitials } from "../profile";

type AvatarSize = "sm" | "md" | "lg";

const sizeClasses: Record<AvatarSize, string> = {
  sm: "size-9 text-[13px]",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
};

/**
 * Identity mark for the account, sized by usage.
 *
 * There is no uploaded image in the user model yet, so the initials are the only
 * rendering — and they are a real fallback rather than a placeholder: a
 * single-letter name still produces a legible mark, and an empty name falls back
 * to the ZangYar glyph so a row never renders as an empty circle.
 *
 * Decorative by default: the name sits beside it in every current placement, so
 * announcing it again would only repeat what the reader already has. The settings
 * page passes `decorative={false}`, because there the mark stands in for the
 * account being described and has no heading of its own to lean on.
 */
export function Avatar({
  name,
  size = "md",
  className = "",
  decorative = true,
}: {
  name: string;
  size?: AvatarSize;
  className?: string;
  decorative?: boolean;
}) {
  const initials = nameInitials(name);

  return (
    <span
      aria-hidden={decorative || undefined}
      className={`flex shrink-0 items-center justify-center rounded-full bg-primary font-black text-white ring-2 ring-surface ${sizeClasses[size]} ${className}`}
    >
      {initials || "ز"}
    </span>
  );
}
