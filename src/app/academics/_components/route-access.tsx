import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";
import { AuthorizationError, requireSchoolRole } from "@/lib/auth/authorization";

import { AccessState } from "./access-state";

export async function requirePageAccess(roles?: readonly ("SCHOOL_ADMIN" | "TEACHER")[]) {
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });

  if (!session?.user) {
    return { headers: requestHeaders, blocked: <AccessState title="ورود لازم است" message="برای مشاهده این صفحه ابتدا وارد حساب کاربری شوید." /> };
  }

  try {
    const context = roles
      ? await requireSchoolRole({ headers: requestHeaders, roles })
      : await requireSchoolRole({ headers: requestHeaders, roles: ["SCHOOL_ADMIN", "TEACHER"] });
    return { headers: requestHeaders, context, blocked: null };
  } catch (error) {
    const message = error instanceof AuthorizationError && error.code === "FORBIDDEN"
      ? "این صفحه فقط برای مدیر مدرسه در دسترس است."
      : "این حساب عضویت فعال مدرسه ندارد.";
    return { headers: requestHeaders, blocked: <AccessState title="دسترسی محدود است" message={message} /> };
  }
}
