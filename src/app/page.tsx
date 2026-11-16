const foundationItems = [
  "معماری چندمستاجری امن",
  "مدیریت مدرسه و کلاس",
  "حضور و غیاب روزانه",
  "اطلاع‌رسانی پیامکی به خانواده‌ها",
];

export default function Home() {
  return (
    <main className="min-h-screen px-5 py-6 sm:px-8 lg:px-12">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col rounded-3xl bg-surface shadow-sm ring-1 ring-border/70">
        <header className="flex items-center justify-between border-b border-border px-6 py-5 sm:px-10">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary text-xl font-black text-white">
              ز
            </div>
            <div>
              <p className="text-lg font-black tracking-tight text-primary">زنگ‌یار</p>
              <p className="text-xs text-muted">مدرسه در جریان، خانواده در کنار</p>
            </div>
          </div>
          <span className="rounded-full bg-secondary/10 px-3 py-1.5 text-xs font-semibold text-secondary">
            نسخه پایه
          </span>
        </header>

        <section className="grid flex-1 items-center gap-12 px-6 py-14 sm:px-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-20">
          <div>
            <p className="mb-4 inline-flex rounded-full bg-accent/15 px-3 py-1.5 text-sm font-semibold text-[#9a5d0b]">
              زیرساخت آماده توسعه است
            </p>
            <h1 className="max-w-2xl text-4xl font-black leading-[1.35] tracking-tight text-primary sm:text-5xl">
              مدرسه‌ای منظم‌تر، ارتباطی نزدیک‌تر
            </h1>
            <p className="mt-6 max-w-xl text-base leading-8 text-muted sm:text-lg">
              زنگ‌یار بستری ساده و امن برای مدیریت مدرسه، ثبت حضور و غیاب و در جریان نگه‌داشتن خانواده‌هاست.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <span className="rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white">به‌زودی همراه شما</span>
              <span className="rounded-xl border border-border px-5 py-3 text-sm font-bold text-primary">ساخته‌شده برای مدارس ایران</span>
            </div>
          </div>

          <div className="rounded-3xl bg-primary p-6 text-white sm:p-8">
            <div className="mb-7 flex items-center justify-between">
              <div>
                <p className="text-sm text-white/65">نمای کلی سامانه</p>
                <h2 className="mt-1 text-2xl font-black">پایه محصول</h2>
              </div>
              <div className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-xl font-black">✓</div>
            </div>
            <ul className="space-y-4">
              {foundationItems.map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-white/90">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-secondary">✓</span>
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/70">
              این صفحه نمایشی است و هنوز به داده‌های مدرسه یا حساب کاربری متصل نیست.
            </div>
          </div>
        </section>

        <footer className="border-t border-border px-6 py-5 text-center text-xs text-muted sm:px-10">
          زنگ‌یار — زیرساخت مدیریت مدرسه و ارتباط با خانواده
        </footer>
      </div>
    </main>
  );
}
