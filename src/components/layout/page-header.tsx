import Link from "next/link";

export function PageHeader({ eyebrow, title, description, action }: { eyebrow?: string; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div>
        {eyebrow ? <p className="text-xs font-extrabold tracking-[0.08em] text-secondary">{eyebrow}</p> : null}
        <h1 className="mt-2 text-2xl font-black tracking-tight text-primary sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function BackLink({ href = "/dashboard", children = "بازگشت به داشبورد" }: { href?: string; children?: React.ReactNode }) {
  return <Link href={href} className="text-sm font-bold text-secondary hover:text-primary">{children}</Link>;
}
