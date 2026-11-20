import type { HTMLAttributes } from "react";

export function Panel({ className = "", ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={`rounded-2xl border border-border bg-surface p-5 shadow-[0_8px_24px_rgba(23,59,87,0.04)] ${className}`} {...props} />;
}

export function SectionHeading({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? <p className="text-xs font-extrabold tracking-[0.08em] text-secondary">{eyebrow}</p> : null}
        <h2 className="mt-1 text-lg font-black text-primary">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
