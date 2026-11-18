import Link from "next/link";

export function AccessState({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
      <section className="w-full rounded-3xl bg-surface p-8 text-center shadow-sm ring-1 ring-border">
        <p className="text-sm font-bold text-secondary">زنگ‌یار / مدیریت آموزشی</p>
        <h1 className="mt-3 text-3xl font-black text-primary">{title}</h1>
        <p className="mt-4 text-muted">{message}</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">بازگشت</Link>
      </section>
    </main>
  );
}
