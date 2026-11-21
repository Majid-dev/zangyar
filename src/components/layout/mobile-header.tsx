import Link from "next/link";

export function MobileHeader() {
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 lg:hidden">
      <Link href="/dashboard" className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-base font-black text-white">ز</span>
        <span className="text-sm font-black text-primary">زنگ‌یار</span>
      </Link>
      <button type="button" aria-label="باز کردن منو" className="flex size-10 items-center justify-center rounded-xl text-xl text-primary hover:bg-sage">☰</button>
    </header>
  );
}
