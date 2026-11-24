import { AppPage } from "@/components/layout/app-shell";
import { BackLink, PageHeader } from "@/components/layout/page-header";
import { Avatar } from "@/features/account/components/avatar";
import { AccountPasswordForm, AccountProfileForm } from "@/features/account/components/account-forms";
import { joinDisplayName, roleLabel } from "@/features/account/profile";
import { getAccountProfileForContext } from "@/features/account/queries";
import { requirePageAccess } from "@/features/shell/route-access";

/**
 * Account settings.
 *
 * One page, one column, two sections. A signed-in person has two things they can
 * change about their own account, so the page is laid out as a document rather
 * than as a grid of cards: the identity band answers "whose account is this, and
 * at which school", and each section below owns one change. The sections are
 * separated by space and a rule instead of nested surfaces, which keeps the
 * hierarchy legible without stacking containers.
 */
export default async function SettingsPage() {
  const access = await requirePageAccess();
  if (access.blocked) return access.blocked;

  const profile = await getAccountProfileForContext(access.context);
  const name = joinDisplayName(profile.firstName, profile.lastName);

  return (
    <AppPage>
      <PageHeader
        breadcrumbs={[{ label: "داشبورد", href: "/dashboard" }, { label: "تنظیمات حساب" }]}
        title="تنظیمات حساب"
        description="اطلاعات شخصی و گذرواژه‌ی خود را مدیریت کنید. نقش و عضویت مدرسه از این صفحه تغییر نمی‌کند."
        action={<BackLink href="/dashboard">بازگشت به داشبورد</BackLink>}
      />

      {/* Identity band. Asymmetric on purpose: the mark and the name carry the
          reading order, and the facts sit in a quiet column beside them. */}
      <section className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border pb-6">
        <div className="flex items-center gap-4">
          <Avatar name={name} size="lg" decorative={false} />
          <div>
            <h2 className="text-lg font-black text-primary">{name}</h2>
            <p className="mt-0.5 text-sm text-muted">{roleLabel(profile.role)}</p>
          </div>
        </div>
        <dl className="flex flex-wrap items-center gap-x-8 gap-y-2 text-xs">
          <div>
            <dt className="text-muted">مدرسه‌ی فعال</dt>
            <dd className="mt-0.5 font-bold text-primary">{profile.activeSchool.name}</dd>
          </div>
          <div>
            <dt className="text-muted">شماره همراه</dt>
            <dd dir="ltr" className="mt-0.5 text-start font-bold tracking-[0.04em] text-primary">{profile.mobile ?? "—"}</dd>
          </div>
          {profile.schools.length > 1 ? (
            <div>
              <dt className="text-muted">عضویت در</dt>
              <dd className="mt-0.5 font-bold text-primary">{profile.schools.length} مدرسه</dd>
            </div>
          ) : null}
        </dl>
      </section>

      <div className="mt-8 grid gap-x-10 gap-y-10 lg:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="space-y-10">
          <section aria-labelledby="settings-basic">
            <div className="border-b border-border pb-3">
              <h2 id="settings-basic" className="text-base font-black text-primary">اطلاعات پایه</h2>
              <p className="mt-1 text-sm leading-6 text-muted">نام شما در فهرست دبیران، پیام‌ها و سرصفحه‌ی سامانه همین مقدار است.</p>
            </div>
            <div className="mt-5">
              <AccountProfileForm
                firstName={profile.firstName}
                lastName={profile.lastName}
                mobile={profile.mobile}
                mobileVerified={profile.mobileVerified}
              />
            </div>
          </section>

          <section aria-labelledby="settings-password">
            <div className="border-b border-border pb-3">
              <h2 id="settings-password" className="text-base font-black text-primary">تغییر گذرواژه</h2>
              <p className="mt-1 text-sm leading-6 text-muted">برای تعیین گذرواژه‌ی تازه، گذرواژه‌ی فعلی خود را وارد کنید.</p>
            </div>
            <div className="mt-5 max-w-xl">
              <AccountPasswordForm />
            </div>
          </section>
        </div>

        {/* A margin note rather than a second content column: it explains what this
            page deliberately does not do, which is otherwise the first question a
            reader asks about a settings screen. */}
        <aside className="text-xs leading-6 text-muted lg:border-s lg:border-border lg:ps-6">
          <p className="font-bold text-primary">چه چیزی از این‌جا تغییر نمی‌کند؟</p>
          <ul className="mt-3 space-y-2.5">
            <li>شماره همراه، نام کاربری ورود شماست؛ تغییر آن نیازمند مجوز مدیر مدرسه است.</li>
            <li>نقش و وضعیت دسترسی توسط مدرسه تعیین می‌شود، نه از سوی خود کاربر.</li>
            <li>برای عوض کردن مدرسه‌ی فعال، از منوی حساب کاربری در نوار کناری استفاده کنید.</li>
          </ul>
        </aside>
      </div>
    </AppPage>
  );
}
