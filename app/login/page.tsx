"use client";

import React, { useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, LockKeyhole, ShieldCheck, Zap } from "lucide-react";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/");
    }
  }, [status, router]);

  const handleLogin = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await signIn("google", { callbackUrl: "/" });
    } catch (error) {
      console.error("Login error:", error);
      setIsLoading(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[color:var(--background-main)]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[color:var(--background-main)] px-5 py-10 text-[color:var(--foreground-main)]" dir="rtl">
      <div className="absolute end-5 top-5 z-10 flex items-center gap-2">
        <LocaleSwitcher compact />
      </div>
      <button
        type="button"
        onClick={() => router.push("/")}
        className="absolute start-5 top-5 flex items-center gap-3 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-sm font-black shadow-sm transition hover:bg-[color:var(--surface-soft)]"
        aria-label="חזרה לדף הבית"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-indigo-600 text-white">
          <Zap size={16} aria-hidden />
        </div>
        BSD-YBM OS
      </button>

      <section className="grid w-full max-w-5xl overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-lg md:grid-cols-[0.95fr_1.05fr]">
        <div className="border-b border-[color:var(--border-main)] bg-slate-950 p-8 text-white md:border-b-0 md:border-l">
          <div className="mb-10 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-slate-200">
            <ShieldCheck size={14} aria-hidden />
            גישה מאובטחת למורשים בלבד
          </div>

          <h1 className="text-4xl font-black tracking-normal">כניסה למערכת העבודה</h1>
          <p className="mt-4 text-base font-medium leading-8 text-slate-300">
            התחברות עם Google מאפשרת גישה לסביבת העבודה, למסמכים, ללקוחות, לפרויקטים ולעוזר ה-AI הארגוני.
          </p>

          <ul className="mt-10 space-y-4 text-sm font-semibold text-slate-300">
            {["ניהול הרשאות לפי משתמש", "גישה למידע ארגוני במקום אחד", "סביבת עבודה מותאמת לעברית ו-RTL"].map((item) => (
              <li key={item} className="flex items-center gap-3">
                <CheckCircle2 size={17} className="text-emerald-400" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col justify-center p-8 md:p-10">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-200">
            <LockKeyhole size={26} aria-hidden />
          </div>

          <h2 className="text-2xl font-black tracking-normal">הזדהות</h2>
          <p className="mt-2 text-sm font-medium leading-6 text-[color:var(--foreground-muted)]">
            השתמש בחשבון Google שאושר לארגון. לאחר ההתחברות תועבר ישירות לסביבת העבודה.
          </p>

          <button
            type="button"
            onClick={handleLogin}
            disabled={isLoading}
            className="mt-8 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-5 text-base font-black shadow-sm transition hover:bg-[color:var(--surface-soft)] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            )}
            התחבר עם Google
          </button>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-5 inline-flex items-center justify-center gap-2 text-sm font-bold text-[color:var(--foreground-muted)] transition hover:text-[color:var(--foreground-main)]"
          >
            חזרה לדף הבית
            <ArrowLeft size={16} aria-hidden />
          </button>
        </div>
      </section>
    </main>
  );
}
