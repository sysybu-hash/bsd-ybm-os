"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import { BrainCircuit, BarChart3, Fingerprint, Layers, ChevronLeft, Mic } from "lucide-react";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import ThemeToggle from "@/components/os/system/ThemeToggle";

export default function LandingPage({ onLogin }: { onLogin: () => void }) {
  const router = useRouter();
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2, delayChildren: 0.1 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: [0, 0, 0.2, 1] as const },
    },
  };

  return (
    <div className="min-h-dvh overflow-x-hidden overflow-y-auto bg-[color:var(--background-main)] font-sans text-[color:var(--foreground-main)] [-webkit-overflow-scrolling:touch]" dir="rtl">
      {/* רקע דינמי - Dynamic Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] right-[-10%] h-[800px] w-[800px] rounded-full bg-blue-500/20 blur-[120px] dark:bg-blue-600/10" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-emerald-500/15 blur-[120px] dark:bg-emerald-500/10" />
        <div className="absolute top-[40%] left-[30%] h-[400px] w-[400px] rounded-full bg-purple-500/15 blur-[100px] dark:bg-purple-500/10" />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-emerald-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-black tracking-tight text-[color:var(--foreground-main)]">
            BSD<span className="text-blue-500">-</span>YBM{" "}
            <span className="text-lg font-medium text-[color:var(--foreground-muted)]">OS</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher compact />
          <ThemeToggle variant="landing" />
          <button
            type="button"
            onClick={onLogin}
            className="rounded-full border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-6 py-2.5 text-sm font-medium text-[color:var(--foreground-main)] shadow-sm backdrop-blur-md transition-all hover:bg-[color:var(--surface-soft)]"
          >
            התחברות למערכת
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-8 pt-20 pb-32">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center text-center max-w-4xl mx-auto"
        >
          <motion.div
            variants={itemVariants}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-600 dark:text-blue-400"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
            </span>
            גרסה 2.0 | זמין כעת עם אינטגרציית Gemini Live
          </motion.div>

          <motion.h1 variants={itemVariants} className="text-6xl md:text-8xl font-black tracking-tighter mb-8 leading-tight">
            מערכת ההפעלה של <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400">העסק שלך.</span>
          </motion.h1>

          <motion.p variants={itemVariants} className="mb-12 max-w-2xl text-xl leading-relaxed text-[color:var(--foreground-muted)] md:text-2xl">
            מרכז בקרה חכם מבוסס בינה מלאכותית. ניהול פרויקטים, כספים ולקוחות באוטומציה מלאה ובעיצוב של שנת 2026.
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4">
            <button
              type="button"
              onClick={onLogin}
              className="px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-bold text-lg hover:shadow-lg hover:shadow-blue-500/25 transition-all flex items-center justify-center gap-2 group"
            >
              התחל לעבוד
              <ChevronLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-8 py-4 text-lg font-bold text-[color:var(--foreground-main)] shadow-sm backdrop-blur-sm transition-all hover:bg-[color:var(--surface-soft)]"
            >
              קבע הדגמה
            </button>
          </motion.div>
        </motion.div>

        {/* Features Bento Grid */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 1 }}
          className="mt-32 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
        >
          <FeatureCard
            icon={<BrainCircuit className="w-6 h-6 text-emerald-400" />}
            title="סורק מסמכים AI"
            description="חילוץ נתונים אוטומטי מחשבוניות באמצעות מנוע Vision מתקדם, ישירות למסד הנתונים."
            delay={0.1}
          />
          <FeatureCard
            icon={<Mic className="w-6 h-6 text-blue-400" />}
            title="Gemini Live"
            description="עוזר קולי חכם המאפשר לך לתת פקודות ולנווט במערכת באמצעות דיבור טבעי."
            delay={0.2}
          />
          <FeatureCard
            icon={<BarChart3 className="w-6 h-6 text-purple-400" />}
            title="ERP & CRM אחיד"
            description="לוח פרויקטים ויזואלי, ניהול תקציבים ושליטה בזרם המזומנים תחת קורת גג אחת."
            delay={0.3}
          />
          <FeatureCard
            icon={<Fingerprint className="w-6 h-6 text-indigo-400" />}
            title="חתימה דיגיטלית"
            description="הפקת הצעות מחיר מעוצבות ושליחתן ללקוח לחתימה מהירה ואבטחה מקסימלית."
            delay={0.4}
          />
        </motion.div>
      </main>

      <footer className="relative z-10 border-t border-[color:var(--border-main)] px-8 py-8 text-center text-xs text-[color:var(--foreground-muted)]">
        <nav className="mb-4 flex flex-wrap items-center justify-center gap-4 font-bold">
          <a href="/about" className="transition-colors hover:text-[color:var(--foreground-main)]">
            אודות
          </a>
          <a href="/privacy" className="transition-colors hover:text-[color:var(--foreground-main)]">
            פרטיות
          </a>
          <a href="/terms" className="transition-colors hover:text-[color:var(--foreground-main)]">
            תנאים
          </a>
          <a href="/legal" className="transition-colors hover:text-[color:var(--foreground-main)]">
            עוגיות
          </a>
        </nav>
        <p>© {new Date().getFullYear()} BSD-YBM-OS. כל הזכויות שמורות.</p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8 + delay, duration: 0.5 }}
      className="rounded-3xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 p-6 backdrop-blur-md transition-colors hover:bg-[color:var(--surface-soft)]"
    >
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--surface-soft)]">{icon}</div>
      <h3 className="mb-3 text-xl font-bold text-[color:var(--foreground-main)]">{title}</h3>
      <p className="text-sm leading-relaxed text-[color:var(--foreground-muted)]">{description}</p>
    </motion.div>
  );
}
