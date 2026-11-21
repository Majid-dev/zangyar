import type { HTMLAttributes } from "react";

type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-sage text-primary",
  success: "bg-success/12 text-success",
  warning: "bg-warning/15 text-[#8b5a08]",
  danger: "bg-danger/12 text-danger",
  info: "bg-secondary/12 text-secondary",
};

export function Badge({ className = "", tone = "neutral", ...props }: BadgeProps) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${toneClasses[tone]} ${className}`} {...props} />;
}
