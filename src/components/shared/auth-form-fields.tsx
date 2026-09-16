"use client";

import { useFormStatus } from "react-dom";

type FieldProps = {
  label: string;
  name: string;
  type: string;
  error?: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "tel" | "numeric";
  placeholder?: string;
  hint?: string;
  defaultValue?: string;
};

export function Field({
  label,
  name,
  type,
  error,
  autoComplete,
  inputMode,
  placeholder,
  hint,
  defaultValue,
}: FieldProps) {
  const describedBy = [
    error ? `${name}-error` : null,
    hint ? `${name}-hint` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <label
        htmlFor={name}
        className="block text-sm font-semibold text-ink-900"
      >
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        placeholder={placeholder}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy || undefined}
        className={`mt-1.5 block min-h-11 w-full rounded-xl border bg-white px-3 text-ink-900 outline-none transition placeholder:text-ink-500/50 focus:ring-2 focus:ring-court-700/30 ${
          error
            ? "border-red-500 focus:border-red-500"
            : "border-court-800/20 focus:border-court-700"
        }`}
      />
      {hint ? (
        <p id={`${name}-hint`} className="mt-1 text-xs text-ink-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${name}-error`} className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-court-800 px-5 font-bold text-white transition hover:bg-court-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <p
      role="alert"
      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700"
    >
      {message}
    </p>
  );
}

export function FormNotice({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <p
      role="status"
      className="rounded-xl border border-court-700/25 bg-court-700/10 px-3 py-2.5 text-sm font-medium text-court-800"
    >
      {message}
    </p>
  );
}
