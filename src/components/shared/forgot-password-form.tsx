"use client";

import { useActionState } from "react";

import { requestPasswordResetAction } from "@/actions/auth";
import {
  Field,
  FormError,
  FormNotice,
  SubmitButton,
} from "@/components/shared/auth-form-fields";
import { emptyAuthState } from "@/lib/auth-form-state";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(
    requestPasswordResetAction,
    emptyAuthState,
  );

  if (state.notice) {
    return <FormNotice message={state.notice} />;
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.formError} />

      <Field
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={state.fieldErrors.email}
      />

      <SubmitButton>Send reset link</SubmitButton>
    </form>
  );
}
