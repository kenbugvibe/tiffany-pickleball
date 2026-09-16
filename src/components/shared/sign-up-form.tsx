"use client";

import { useActionState } from "react";

import { signUpAction } from "@/actions/auth";
import { emptyAuthState } from "@/lib/auth-form-state";
import {
  Field,
  FormError,
  FormNotice,
  SubmitButton,
} from "@/components/shared/auth-form-fields";
import { MIN_PASSWORD_LENGTH } from "@/lib/validation";

export function SignUpForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(signUpAction, emptyAuthState);

  if (state.notice) {
    return <FormNotice message={state.notice} />;
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <FormError message={state.formError} />

      <Field
        label="Full name"
        name="fullName"
        type="text"
        autoComplete="name"
        placeholder="Juan dela Cruz"
        error={state.fieldErrors.fullName}
      />

      <Field
        label="Email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={state.fieldErrors.email}
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

      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
        error={state.fieldErrors.password}
      />

      <SubmitButton>Create account</SubmitButton>
    </form>
  );
}
