"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Alert, buttonClasses } from "@/components/ui";
import { cn } from "@/lib/cn";
import { BrandMark, Wordmark } from "@/components/layout/BrandMark";

const ERROR_MESSAGES: Record<string, string> = {
  denied: "Sign-in was cancelled.",
  invalid_state: "That sign-in link expired. Please try again.",
  missing_code: "Sign-in didn't complete. Please try again.",
  not_allowed: "That Google account isn't authorized to view this app.",
  login_failed: "Sign-in failed. Please try again.",
};

function LoginContent() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm animate-scale-in rounded-modal border border-border bg-card p-8 text-center shadow-raised">
        <BrandMark className="mx-auto mb-4 h-14 w-14 text-foreground" />
        <h1 className="text-[34px] leading-[40px] text-foreground">
          <Wordmark />
          <span className="sr-only">Helpit</span>
        </h1>
        <p className="mt-1 text-sm text-muted">Sign in to continue to your dashboard.</p>

        {error && (
          <Alert tone="danger" role="alert" className="mt-5 text-left">
            {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}
          </Alert>
        )}

        <a
          href="/api/auth/google/login"
          className={cn(buttonClasses({ size: "md" }), "mt-6 w-full")}
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginContent />
    </Suspense>
  );
}
