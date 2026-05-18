import { Suspense } from "react";
import RegisterWizard from "@/components/auth/RegisterWizard";

export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" aria-hidden />
        </div>
      }
    >
      <RegisterWizard />
    </Suspense>
  );
}
