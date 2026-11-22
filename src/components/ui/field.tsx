import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

import { FieldErrors } from "./action-form";

const controlClasses = "min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted/70 focus:border-secondary focus:ring-4 focus:ring-secondary/10";

type LabelProps = { label: string; hint?: string; name?: string; children: React.ReactNode };

export function Field({ label, hint, name, children }: LabelProps) {
  return (
    <label className="grid gap-2 text-sm font-bold text-primary">
      <span className="flex items-center justify-between gap-3">
        <span>{label}</span>
        {name ? <FieldErrors name={name} /> : null}
        {hint ? <span className="text-xs font-normal text-muted">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${controlClasses} ${props.className ?? ""}`} aria-invalid={props["aria-invalid"] ?? undefined} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${controlClasses} ${props.className ?? ""}`} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${controlClasses} min-h-28 py-3 ${props.className ?? ""}`} {...props} />;
}
