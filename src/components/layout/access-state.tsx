import Link from "next/link";

export type AccessState = "UNAUTHENTICATED" | "NO_SCHOOL" | "AMBIGUOUS_SCHOOL" | "FORBIDDEN";

const MESSAGES: Record<AccessState, { title: string; message: string }> = {
  UNAUTHENTICATED: {
    title: "ورود لازم است",
    message: "برای مشاهده این صفحه ابتدا وارد حساب کاربری شوید.",
  },
  NO_SCHOOL: {
    title: "دسترسی مدرسه یافت نشد",
    message: "این حساب هنوز عضویت فعال مدرسه ندارد. برای دسترسی، از مدیر مدرسه بخواهید شما را به مدرسه اضافه کند.",
  },
  AMBIGUOUS_SCHOOL: {
    title: "انتخاب مدرسه نامشخص است",
    message: "این حساب در بیش از یک مدرسه عضویت فعال دارد و انتخاب مدرسه در این نسخه پشتیبانی نمی‌شود.",
  },
  FORBIDDEN: {
    title: "دسترسی محدود است",
    message: "این صفحه فقط برای مدیر مدرسه در دسترس است.",
  },
};

export function accessStateFor(state: AccessState) {
  return <AccessState state={state} />;
}

export function AccessState({ state }: { state: AccessState }) {
  const { title, message } = MESSAGES[state];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-6">
      <section className="w-full rounded-3xl border border-border bg-surface p-8 text-center shadow-[0_14px_40px_rgba(23,59,87,0.06)]">
        <p className="text-sm font-bold text-secondary">زنگ‌یار</p>
        <h1 className="mt-3 text-3xl font-black text-primary">{title}</h1>
        <p className="mt-4 leading-8 text-muted">{message}</p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 text-sm font-bold text-white transition-colors hover:bg-primary/90"
        >
          بازگشت به صفحه اصلی
        </Link>
      </section>
    </main>
  );
}
