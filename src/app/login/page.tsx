"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Sparkles } from "lucide-react";
import { Button, Card } from "@/components/ui";

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
      <Card className="w-full max-w-sm text-center">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">Helpit</h1>
        <p className="mt-1 text-sm text-muted">Sign in to continue to your dashboard.</p>

        {error && (
          <p className="mt-4 text-sm text-warning">
            {ERROR_MESSAGES[error] ?? "Something went wrong. Please try again."}
          </p>
        )}

        <a href="/api/auth/google/login" className="mt-6 block">
          <Button size="md">Sign in with Google</Button>
        </a>
      </Card>
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
