"use client";

import { useFormStatus } from "react-dom";

import { signInWithOAuthAction } from "@/actions/auth";
import { FormError } from "@/components/shared/auth-form-fields";

type SocialProvider = "google" | "facebook";

const providerDetails: Record<
  SocialProvider,
  { label: string }
> = {
  google: {
    label: "Continue with Google",
  },
  facebook: {
    label: "Continue with Facebook",
  },
};

function GoogleLogo() {
  return (
    <svg
      aria-hidden="true"
      className="size-5 shrink-0"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M17.64 9.205c0-.638-.057-1.252-.164-1.841H9v3.482h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.909c1.702-1.567 2.683-3.874 2.683-6.615Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.468-.806 5.957-2.18l-2.91-2.258c-.805.54-1.835.86-3.047.86-2.344 0-4.328-1.585-5.037-3.714H.956v2.332A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.963 10.708A5.41 5.41 0 0 1 3.68 9c0-.593.102-1.168.283-1.708V4.96H.956A9 9 0 0 0 0 9c0 1.452.347 2.827.956 4.04l3.007-2.332Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.322 0 2.508.454 3.442 1.346l2.581-2.582C13.464.892 11.426 0 9 0A9 9 0 0 0 .956 4.96l3.007 2.332C4.672 5.163 6.656 3.58 9 3.58Z"
      />
    </svg>
  );
}

function FacebookLogo() {
  return (
    <svg
      aria-hidden="true"
      className="size-6 shrink-0"
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle cx="16" cy="16" r="16" fill="#1877F2" />
      <path
        fill="#FFFFFF"
        d="M22.23 20.63 22.94 16h-4.45v-3c0-1.27.62-2.5 2.61-2.5h2.02V6.56s-1.84-.31-3.59-.31c-3.66 0-6.06 2.22-6.06 6.24V16H9.4v4.63h4.07V31.8a16.2 16.2 0 0 0 5.02 0V20.63h3.74Z"
      />
    </svg>
  );
}

function ProviderLogo({ provider }: { provider: SocialProvider }) {
  return provider === "google" ? <GoogleLogo /> : <FacebookLogo />;
}

function SocialSubmitButton({ provider }: { provider: SocialProvider }) {
  const { pending } = useFormStatus();
  const details = providerDetails[provider];

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-court-800/15 bg-white px-4 font-bold text-ink-900 transition hover:border-court-700/35 hover:bg-court-800/5 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <ProviderLogo provider={provider} />
      {pending ? "Connecting..." : details.label}
    </button>
  );
}

export function SocialAuthButtons({
  next,
  authPage,
  error,
  emailLabel,
}: {
  next: string;
  authPage: "sign-in" | "sign-up";
  error: string | null;
  emailLabel: string;
}) {
  return (
    <div>
      <FormError message={error} />
      <div className={`grid gap-3 ${error ? "mt-4" : ""}`}>
        {(["google", "facebook"] as const).map((provider) => (
          <form action={signInWithOAuthAction} key={provider}>
            <input type="hidden" name="provider" value={provider} />
            <input type="hidden" name="next" value={next} />
            <input type="hidden" name="authPage" value={authPage} />
            <SocialSubmitButton provider={provider} />
          </form>
        ))}
      </div>

      <div className="my-6 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-court-800/15" />
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-500">
          {emailLabel}
        </span>
        <span className="h-px flex-1 bg-court-800/15" />
      </div>
    </div>
  );
}
