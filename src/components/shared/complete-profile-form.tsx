"use client";

import { useActionState } from "react";

import { completeCustomerProfileAction } from "@/actions/auth";
import {
  Field,
  FormError,
  SubmitButton,
} from "@/components/shared/auth-form-fields";
import { emptyAuthState } from "@/lib/auth-form-state";

export function CompleteProfileForm({
  next,
  defaultName,
}: {
  next: string;
  defaultName: string;
}) {
  const [state, formAction] = useActionState(
    completeCustomerProfileAction,
    emptyAuthState,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError message={state.formError} />

      <Field
        label="Full name"
        name="fullName"
        type="text"
        autoComplete="name"
        defaultValue={defaultName}
        placeholder="Juan dela Cruz"
        error={state.fieldErrors.fullName}
      />

      <Field
        label="Mobile number"
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="09171234567"
        hint="So Tiffany can reach you about your booking."
        error={state.fieldErrors.phone}
      />

      <SubmitButton>Finish account setup</SubmitButton>
    </form>
  );
}
