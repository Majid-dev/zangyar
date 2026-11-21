"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { buttonClasses, type ButtonSize, type ButtonVariant } from "./button";
import type { ActionFailure, ActionResult, ActionState } from "@/lib/actions/result";

export type FormAction = (previousState: ActionState<unknown>, formData: FormData) => Promise<ActionResult<unknown>>;

const FieldErrorsContext = createContext<ActionFailure["fieldErrors"] | undefined>(undefined);

export function ActionForm({ action, children, className }: { action: FormAction; children: React.ReactNode; className?: string }) {
  const [state, formAction] = useActionState(action, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <FieldErrorsContext.Provider value={fieldErrors}>
      <form action={formAction} className={className} noValidate>
        {children}
        <ActionFeedback state={state} />
      </form>
    </FieldErrorsContext.Provider>
  );
}

export function SubmitButton({ children, pendingLabel = "در حال ذخیره…", variant = "primary", size = "md", className = "", ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string; variant?: ButtonVariant; size?: ButtonSize }) {
  const { pending } = useFormStatus();
  return (
    <button {...props} type={props.type ?? "submit"} disabled={pending || props.disabled} aria-busy={pending || undefined} className={buttonClasses({ variant, size, className: `${pending ? "cursor-wait opacity-70" : ""} ${className}` })}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Confirmation gate for close/archive/status actions inside an ActionForm. */
export function ConfirmSubmitButton({ children, confirmLabel = "تأیید", question = "این تغییر قابل بازگشت نیست. ادامه می‌دهید؟", variant = "danger", size = "sm", pendingLabel = "در حال انجام…" }: { children: React.ReactNode; confirmLabel?: string; question?: string; variant?: ButtonVariant; size?: ButtonSize; pendingLabel?: string }) {
  const [confirming, setConfirming] = useState(false);
  const { pending } = useFormStatus();

  if (!confirming) {
    return <button type="button" disabled={pending} onClick={() => setConfirming(true)} className={buttonClasses({ variant: "ghost", size })}>{children}</button>;
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs text-muted">{question}</span>
      <button type="submit" disabled={pending} aria-busy={pending || undefined} className={buttonClasses({ variant, size })}>{pending ? pendingLabel : confirmLabel}</button>
      <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="text-xs font-bold text-muted hover:text-primary">انصراف</button>
    </span>
  );
}

export function FieldErrors({ name }: { name: string }) {
  const fieldErrors = useContext(FieldErrorsContext);
  const messages = fieldErrors?.[name];
  if (!messages || messages.length === 0) return null;
  return <span className="text-xs font-normal text-danger" role="alert">{messages.map((message) => <span key={message} className="block">{message}</span>)}</span>;
}

function SuccessFeedback({ message }: { message: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 4500);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  return <div className="mt-4 flex items-start gap-2 rounded-xl border border-success/20 bg-success/10 p-3 text-sm leading-6 text-success" role="status"><span aria-hidden="true">✓</span><span>{message}</span></div>;
}

export function ActionFeedback({ state }: { state: ActionState<unknown> }) {
  if (!state) return null;
  if (state.ok) return <SuccessFeedback key={state.message} message={state.message ?? "عملیات با موفقیت انجام شد."} />;
  return (
    <div className="mt-4 rounded-xl border border-danger/20 bg-danger/10 p-3 text-sm leading-6 text-danger" role="alert">
      <div className="flex items-start gap-2"><span aria-hidden="true">!</span><span>{state.message}</span></div>
      {state.fieldErrors?.form?.map((message) => <p key={message} className="mt-1">{message}</p>)}
    </div>
  );
}
