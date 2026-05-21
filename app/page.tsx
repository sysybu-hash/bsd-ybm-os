"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import LandingPage from "@/components/landing/LandingPage";
import OmniCanvasWorkspace from "@/components/os/OmniCanvasWorkspace";
import { useI18n } from "@/components/os/system/I18nProvider";

export default function OmniCanvas() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const { t, dir } = useI18n();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || sessionStatus === "loading") {
    return (
      <div
        className="fixed inset-0 z-[2000] flex flex-col items-center justify-center bg-[color:var(--background-main)] text-[color:var(--foreground-muted)]"
        dir={dir}
      >
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" aria-hidden />
        <p className="mt-4 text-sm font-semibold">{t("workspaceWidgets.page.loading")}</p>
      </div>
    );
  }

  if (sessionStatus === "unauthenticated" || !session) {
    return (
      <LandingPage
        onLogin={() => router.push("/login")}
        onRegister={() => router.push("/login?mode=register")}
      />
    );
  }

  return <OmniCanvasWorkspace />;
}
