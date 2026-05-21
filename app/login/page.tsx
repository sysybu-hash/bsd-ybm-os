"use client";

import { Suspense } from "react";
import AuthExperience from "@/components/auth/AuthExperience";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" aria-hidden />
        </div>
      }
    >
      <AuthExperience />
    </Suspense>
  );
}
