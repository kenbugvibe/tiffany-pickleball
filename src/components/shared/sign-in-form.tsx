"use client";

import { useActionState } from "react";

import { signInAction } from "@/actions/auth";
import { emptyAuthState } from "@/lib/auth-form-state";
import {
  Field,
  FormError,
  FormNotice,
  SubmitButton,
} from "@/components/shared/auth-form-fields";

export function SignInForm({
  next,
  notice,
}: {
  next: string;
  notice: string | null;
}) {
  const [state, formAction] = useActionState(signInAction, emptyAuthState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <FormNotice message={notice} />
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

      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors.password}
      />

      <SubmitButton>Sign in</SubmitButton>
    </form>
  );
}
