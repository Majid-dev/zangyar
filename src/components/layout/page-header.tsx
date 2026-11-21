import Link from "next/link";

type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="مسیر صفحه">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 ? <span aria-hidden="true" className="text-muted/50">/</span> : null}
            {item.href ? (
              <Link href={item.href} className="font-bold hover:text-primary">{item.label}</Link>
            ) : (
              <span aria-current="page" className="font-bold text-primary">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  breadcrumbs,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  breadcrumbs?: readonly Crumb[];
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : eyebrow ? <p className="text-xs font-extrabold tracking-[0.08em] text-secondary">{eyebrow}</p> : null}
        <h1 className="mt-2 text-2xl font-black tracking-tight text-primary sm:text-3xl">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}

/**
 * Deterministic back control. It never guesses at browser history: callers pass
 * the parent route, so a directly opened URL still lands somewhere meaningful and
 * no navigation loop is possible.
 */
export function BackLink({ href = "/dashboard", children = "بازگشت به داشبورد" }: { href?: string; children?: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-primary transition-colors hover:border-secondary/40 hover:text-secondary"
    >
      <span aria-hidden="true">→</span>
      {children}
    </Link>
  );
}
