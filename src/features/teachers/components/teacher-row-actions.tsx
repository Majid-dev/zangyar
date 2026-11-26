"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { buttonClasses } from "@/components/ui/button";
import type { ActionResult, ActionState } from "@/lib/actions/result";

import { deleteRegistrationAction, setTeacherStatusAction } from "../actions";
import type { TeacherStatusAction } from "../status";
import { TeacherApprovalDialog } from "./teacher-approval-dialog";

/**
 * A one-line outcome that clears itself, so a row is not left shouting at the admin.
 *
 * Keyed by the caller on each new result, which remounts it and resets the timer —
 * so a second failure is announced again rather than inheriting the first one's
 * expiry.
 */
function RowFeedback({ state }: { state: ActionState<unknown> }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!state) return;
    const timer = window.setTimeout(() => setVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, [state]);

  if (!state || !visible) return null;

  if (state.ok) {
    return (
      <span role="status" className="flex items-center gap-1 text-[11px] font-bold text-success">
        <span aria-hidden="true">✓</span>
        <span>{state.message ?? "انجام شد."}</span>
      </span>
    );
  }

  return (
    <span role="alert" className="text-[11px] font-bold leading-5 text-danger">{state.message}</span>
  );
}

/**
 * The controls for one teacher row.
 *
 * Which status move is offered — and whether it asks for confirmation — comes
 * from the server as part of the row, so the table, the detail page, and the
 * service all read the same transition matrix. The browser only presses the
 * button; it never decides whether the move is legal, which is what stops a
 * hand-made request from approving a teacher who was already rejected.
 *
 * An action whose `requiresWeeklyHours` is set does not submit from here: it opens
 * the approval dialog, which collects the obligation that approval also records.
 * The decision to open a dialog is therefore also derived from the server's answer,
 * so the table and the detail page cannot disagree about which button needs one.
 *
 * While the number is unclaimed there is no access to grant, so the row offers
 * correction and deletion instead. Once claimed, the number is the teacher's
 * login identity and those controls give way to the access decision.
 */
export function TeacherRowActions({
  registrationId,
  teacherName,
  statusAction,
  rejectionAction,
  canEditMobile,
  canDeleteRegistration,
  hasActiveAcademicYear,
  activeAcademicYearName,
  compact = false,
}: {
  registrationId: string;
  teacherName: string;
  statusAction: TeacherStatusAction | null;
  rejectionAction: TeacherStatusAction | null;
  canEditMobile: boolean;
  canDeleteRegistration: boolean;
  hasActiveAcademicYear: boolean;
  activeAcademicYearName: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<ActionState<unknown>>(null);
  // Bumped per submission so the feedback line remounts and its dismissal timer
  // restarts, even when a retry produces the same message as the attempt before it.
  const [attempt, setAttempt] = useState(0);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [isPending, startTransition] = useTransition();

  const actions = [statusAction, rejectionAction].filter((action): action is TeacherStatusAction => action !== null);

  function runStatus(action: TeacherStatusAction) {
    const data = new FormData();
    data.set("registrationId", registrationId);
    data.set("status", action.status);
    startTransition(async () => {
      const result: ActionResult<unknown> = await setTeacherStatusAction(null, data);
      setState(result);
      setAttempt((value) => value + 1);
      setConfirming(null);
      // Re-read the row so the badge shows the stored state rather than the state
      // the button was hoping for.
      if (result.ok) router.refresh();
    });
  }

  function runDelete() {
    const data = new FormData();
    data.set("registrationId", registrationId);
    startTransition(async () => {
      const result: ActionResult<unknown> = await deleteRegistrationAction(null, data);
      setDeleting(false);
      setState(result);
      setAttempt((value) => value + 1);
      // The row is gone, so there is nowhere to show a message on it; a failure is
      // the only outcome worth reporting here.
      if (result.ok) router.refresh();
    });
  }

  const confirmingAction = actions.find((action) => action.status === confirming);

  return (
    <div className={compact ? "flex flex-col items-end gap-1.5" : "flex flex-wrap items-center gap-2"}>
      <div className={compact ? "flex flex-wrap items-center justify-end gap-1.5" : "flex flex-wrap items-center gap-2"}>
        {deleting ? (
          <span className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-danger/30 bg-danger/8 px-2.5 py-1.5">
            <span className="text-[11px] leading-5 text-muted">این شماره برای همیشه حذف شود؟</span>
            <button type="button" disabled={isPending} onClick={runDelete} className={buttonClasses({ variant: "danger", size: "sm" })}>
              {isPending ? "…" : "حذف کن"}
            </button>
            <button type="button" disabled={isPending} onClick={() => setDeleting(false)} className="text-xs font-bold text-muted hover:text-primary">انصراف</button>
          </span>
        ) : confirmingAction ? (
          <span className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-warning/35 bg-warning/8 px-2.5 py-1.5">
            <span className="text-[11px] leading-5 text-muted">{confirmingAction.confirmation}</span>
            <button type="button" disabled={isPending} onClick={() => runStatus(confirmingAction)} className={buttonClasses({ variant: "danger", size: "sm" })}>
              {isPending ? "…" : "تأیید"}
            </button>
            <button type="button" disabled={isPending} onClick={() => setConfirming(null)} className="text-xs font-bold text-muted hover:text-primary">انصراف</button>
          </span>
        ) : (
          <>
            {actions.map((action) => (
              action.requiresWeeklyHours ? (
                <TeacherApprovalDialog
                  key={action.status}
                  registrationId={registrationId}
                  teacherName={teacherName}
                  action={action}
                  hasActiveAcademicYear={hasActiveAcademicYear}
                  activeAcademicYearName={activeAcademicYearName}
                />
              ) : (
                <button
                  key={action.status}
                  type="button"
                  disabled={isPending}
                  onClick={() => {
                    // An action that ends someone's access asks first; one that only
                    // restores it does not.
                    if (action.confirmation) setConfirming(action.status);
                    else runStatus(action);
                  }}
                  className={buttonClasses({ variant: action.tone, size: "sm" })}
                >
                  {action.label}
                </button>
              )
            ))}

            {canEditMobile ? (
              <Link href={`/teachers/${registrationId}`} className={buttonClasses({ variant: "ghost", size: "sm" })}>ویرایش شماره</Link>
            ) : null}

            {canDeleteRegistration ? (
              <button type="button" disabled={isPending} onClick={() => setDeleting(true)} className={buttonClasses({ variant: "ghost", size: "sm", className: "text-danger hover:bg-danger/10 hover:text-danger" })}>
                حذف
              </button>
            ) : null}
          </>
        )}
      </div>
      {/* Remounted per submission, so each new outcome gets its own display window. */}
      <RowFeedback key={attempt} state={state} />
    </div>
  );
}
