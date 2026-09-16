"use client";

import { useActionState } from "react";

import { updatePasswordAction } from "@/actions/auth";
import {
  Field,
  FormError,
  SubmitButton,
} from "@/components/shared/auth-form-fields";
import { emptyAuthState } from "@/lib/auth-form-state";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation";

export function UpdatePasswordForm() {
  const [state, formAction] = useActionState(
    updatePasswordAction,
    emptyAuthState,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormError message={state.formError} />

      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        error={state.fieldErrors.password}
      />

      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors.confirmPassword}
      />

      <SubmitButton>Save new password</SubmitButton>
    </form>
  );
}
