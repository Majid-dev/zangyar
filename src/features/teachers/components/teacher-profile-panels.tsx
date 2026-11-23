"use client";

import { useState, useTransition } from "react";

import { ActionFeedback, ActionForm, ConfirmSubmitButton, SubmitButton } from "@/components/ui/action-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { formatPersianDateShort } from "@/lib/date";
import type { ActionState } from "@/lib/actions/result";

import {
  resendTeacherInvitationAction,
  revokeTeacherInvitationAction,
  setTeacherMembershipStatusAction,
  updateTeacherAction,
} from "../actions";
import type { TeacherInvitationRow } from "../queries";
import { INVITATION_STATUS_LABELS, TEACHER_ACCOUNT_STATUS_LABELS, type TeacherAccountStatus } from "../status";
import { ActivationLink } from "./teacher-create-form";

type TeacherPanelData = {
  teacherId: string;
  firstName: string;
  lastName: string;
  personnelCode: string | null;
  membershipStatus: "ACTIVE" | "SUSPENDED" | "REVOKED";
  accountStatus: TeacherAccountStatus;
  invitationStatus: string;
};

const STATUS_TONES: Record<TeacherAccountStatus, "success" | "warning" | "danger" | "neutral" | "info"> = {
  ACTIVE: "success",
  PENDING_ACTIVATION: "info",
  EXPIRED: "warning",
  DEACTIVATED: "neutral",
  REVOKED: "danger",
};

/** Basic teacher information, with an inline edit that keeps the account name in step. */
export function TeacherProfileCard({ teacher }: { teacher: TeacherPanelData }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted">نام و نام خانوادگی</p>
            <p className="mt-1 text-sm font-bold text-primary">{teacher.firstName} {teacher.lastName}</p>
          </div>
          <div>
            <p className="text-xs text-muted">کد پرسنلی</p>
            <p className="mt-1 text-sm font-bold text-primary" dir="ltr">{teacher.personnelCode ?? "ثبت نشده"}</p>
          </div>
          <div>
            <p className="text-xs text-muted">وضعیت حساب</p>
            <p className="mt-1"><Badge tone={STATUS_TONES[teacher.accountStatus]}>{TEACHER_ACCOUNT_STATUS_LABELS[teacher.accountStatus]}</Badge></p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(true)}>ویرایش اطلاعات دبیر</Button>
        </div>

        {/* Access management is a standing control, not a side effect of editing:
            deactivating a teacher must not require entering the edit form first. */}
        <TeacherStatusActions teacherId={teacher.teacherId} membershipStatus={teacher.membershipStatus} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ActionForm action={updateTeacherAction} onSuccess={() => setEditing(false)} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="teacherId" value={teacher.teacherId} />
        <Field label="نام" name="firstName"><Input name="firstName" defaultValue={teacher.firstName} required /></Field>
        <Field label="نام خانوادگی" name="lastName"><Input name="lastName" defaultValue={teacher.lastName} required /></Field>
        <Field label="کد پرسنلی" name="personnelCode" hint="اختیاری"><Input name="personnelCode" defaultValue={teacher.personnelCode ?? ""} dir="ltr" className="text-start" /></Field>
        <div className="flex items-center gap-2 self-end">
          <SubmitButton pendingLabel="در حال ذخیره…">ذخیره تغییرات</SubmitButton>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>بستن</Button>
        </div>
        <p className="text-xs leading-6 text-muted sm:col-span-2">
          تغییر نام، نام حساب کاربری دبیر را هم به‌روزرسانی می‌کند تا فهرست و ورود او با هم یکسان بمانند.
        </p>
      </ActionForm>
    </div>
  );
}

/**
 * Deactivation and reactivation.
 *
 * Deactivation suspends the membership rather than deleting anything: existing
 * authorization checks read an active membership, so access ends immediately while
 * the school keeps its teacher record and history.
 */
function TeacherStatusActions({ teacherId, membershipStatus }: { teacherId: string; membershipStatus: "ACTIVE" | "SUSPENDED" | "REVOKED" }) {
  const [state, setState] = useState<ActionState<unknown>>(null);
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isActive = membershipStatus === "ACTIVE";

  function run(status: "ACTIVE" | "SUSPENDED") {
    const data = new FormData();
    data.set("teacherId", teacherId);
    data.set("status", status);
    startTransition(async () => {
      setState(await setTeacherMembershipStatusAction(null, data));
      setConfirming(false);
    });
  }

  return (
    <div className="border-t border-border pt-4">
      <p className="text-xs font-bold text-muted">دسترسی دبیر</p>

      {isActive ? (
        confirming ? (
          <div className="mt-2 rounded-xl border border-warning/35 bg-warning/8 p-3" role="alertdialog" aria-modal="true" aria-label="غیرفعال‌سازی دبیر">
            <p className="text-sm font-bold leading-6 text-primary">این دبیر غیرفعال شود؟</p>
            <ul className="mt-2 list-disc space-y-1 pe-4 text-xs leading-6 text-muted">
              <li>دسترسی او به مدرسه بی‌درنگ قطع می‌شود.</li>
              <li>پرونده و سوابق او حفظ می‌شود و حذف نمی‌گردد.</li>
              <li>دعوت در انتظار او باطل می‌شود.</li>
            </ul>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" variant="danger" disabled={isPending} onClick={() => run("SUSPENDED")}>{isPending ? "…" : "غیرفعال کن"}</Button>
              <button type="button" onClick={() => setConfirming(false)} className="text-xs font-bold text-muted hover:text-primary">انصراف</button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setConfirming(true)}>غیرفعال‌سازی دبیر</Button>
          </div>
        )
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={isPending} onClick={() => run("ACTIVE")}>{isPending ? "…" : "فعال‌سازی دبیر"}</Button>
          <span className="text-xs text-muted">
            {membershipStatus === "SUSPENDED" ? "این دبیر غیرفعال است." : "عضویت این دبیر لغو شده است."}
          </span>
        </div>
      )}

      <ActionFeedback state={state} />
    </div>
  );
}

/**
 * Invitation lifecycle controls.
 *
 * Resending mints a fresh one-time link and invalidates every previous one, so
 * the admin always sees exactly one usable link. Revoking withdraws the current
 * link without touching the teacher's account.
 */
export function InvitationPanel({
  teacherId,
  invitation,
  history,
  canInvite,
}: {
  teacherId: string;
  invitation: { id: string; status: string; expiresAt: Date | string } | null;
  history: TeacherInvitationRow[];
  canInvite: boolean;
}) {
  const [issued, setIssued] = useState<{ url: string; expiresAt: string } | null>(null);
  const [state, setState] = useState<ActionState<unknown>>(null);
  const [isPending, startTransition] = useTransition();

  function resend() {
    const data = new FormData();
    data.set("teacherId", teacherId);
    startTransition(async () => {
      const result = await resendTeacherInvitationAction(null, data);
      setState(result);
      if (result.ok) {
        const data = result.data as { url: string; expiresAt: string };
        setIssued({ url: data.url, expiresAt: data.expiresAt });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted">وضعیت دعوت فعلی:</span>
        <Badge tone={invitation?.status === "PENDING" ? "info" : "neutral"}>
          {INVITATION_STATUS_LABELS[(invitation?.status ?? "NONE") as keyof typeof INVITATION_STATUS_LABELS]}
        </Badge>
        {invitation?.expiresAt ? (
          <span className="text-xs text-muted">تا {formatPersianDateShort(toIsoDate(invitation.expiresAt))}</span>
        ) : null}
      </div>

      {/* A freshly issued link is shown once and cannot be read back later. */}
      {issued ? <ActivationLink url={issued.url} expiresAt={issued.expiresAt} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        {canInvite ? (
          <Button type="button" size="sm" variant="secondary" disabled={isPending} onClick={resend}>
            {isPending ? "در حال صدور…" : invitation?.status === "PENDING" ? "ارسال دوباره‌ی دعوت" : "صدور دعوت تازه"}
          </Button>
        ) : (
          <span className="text-xs text-muted">این دبیر حساب خود را فعال کرده است و دعوت تازه‌ای لازم نیست.</span>
        )}

        {invitation?.status === "PENDING" ? (
          <ActionForm action={revokeTeacherInvitationAction} className="flex items-center">
            <input type="hidden" name="teacherId" value={teacherId} />
            <ConfirmSubmitButton question="دعوت فعلی لغو شود؟ پیوند ارسال‌شده دیگر کار نمی‌کند.">لغو دعوت</ConfirmSubmitButton>
          </ActionForm>
        ) : null}
      </div>

      <ActionFeedback state={state} />

      {history.length > 0 ? (
        <div className="border-t border-border pt-4">
          <p className="text-xs font-bold text-muted">تاریخچه‌ی دعوت‌ها</p>
          <ul className="mt-2 divide-y divide-border">
            {history.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <span className="text-muted">صدور {formatPersianDateShort(toIsoDate(row.createdAt))}</span>
                <span className="text-muted">
                  {INVITATION_STATUS_LABELS[row.status]}
                  {row.status === "PENDING" ? ` · تا ${formatPersianDateShort(toIsoDate(row.expiresAt))}` : ""}
                  {row.consumedAt ? ` · فعال‌سازی ${formatPersianDateShort(toIsoDate(row.consumedAt))}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function toIsoDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}
