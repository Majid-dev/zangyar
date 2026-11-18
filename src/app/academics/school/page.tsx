import { getSchoolConfiguration } from "@/features/academics/queries";
import { updateSchoolConfigurationAction } from "@/features/academics/actions";

import { requirePageAccess } from "../_components/route-access";

export default async function SchoolSettingsPage() {
  const access = await requirePageAccess(["SCHOOL_ADMIN"]);
  if (access.blocked) return access.blocked;
  const data = await getSchoolConfiguration({ headers: access.headers });
  return <main className="mx-auto max-w-3xl p-6"><h1 className="text-3xl font-black text-primary">تنظیمات مدرسه</h1><form action={updateSchoolConfigurationAction} className="mt-8 space-y-5 rounded-3xl bg-surface p-6 shadow-sm ring-1 ring-border"><label className="field">نام مدرسه<input name="name" defaultValue={data.school.name} required /></label><label className="field">منطقه زمانی<input name="timezone" defaultValue={data.school.timezone} required /></label><label className="field">تلفن<input name="phone" defaultValue={data.school.phone ?? ""} /></label><label className="field">نشانی<textarea name="address" defaultValue={data.school.address ?? ""} /></label><button className="button-primary" type="submit">ذخیره تنظیمات</button></form></main>;
}
