"use client";

import React, { useEffect, useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Zap, ShieldCheck, ArrowLeft } from 'lucide-react';

export default function LoginPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') {
      router.push('/');
    }
  }, [status, router]);

  const handleLogin = async () => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      await signIn('google', { callbackUrl: '/' });
    } catch (error) {
      console.error("Login error:", error);
      setIsLoading(false);
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-[#020617]">
        <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[#020617] relative overflow-hidden font-heebo" dir="rtl">
      {/* Living Background - Pulsing Gradients */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <motion.div 
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.15, 0.25, 0.15],
          }}
          transition={{
            duration: 10,
            repeat: Infinity,
            ease: "easeInOut"
          }}
          className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-emerald-600/20 blur-[120px] rounded-full"
        />
        <motion.div 
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.1, 0.2, 0.1],
          }}
          transition={{
            duration: 15,
            repeat: Infinity,
            ease: "easeInOut",
            delay: 2
          }}
          className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-600/20 blur-[120px] rounded-full"
        />
      </div>

      <div className="absolute top-8 right-8 z-50">
        <div className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-600/30">
            <Zap size={20} className="text-white fill-white" />
          </div>
          <span className="text-xl font-black tracking-tighter text-white">
            BSD-YBM <span className="text-indigo-400">OS</span>
          </span>
        </div>
      </div>

      {/* חלון ההתחברות (Glassmorphism) */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md p-10 bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] shadow-2xl flex flex-col items-center text-center mx-4"
      >
        
        {/* לוגו / סמל המערכת */}
        <div className="w-20 h-20 bg-indigo-500/10 border border-indigo-500/20 rounded-3xl flex items-center justify-center mb-8 shadow-inner relative overflow-hidden group">
          <div className="absolute inset-0 bg-indigo-500/20 animate-pulse" />
          <ShieldCheck size={40} className="text-indigo-400 relative z-10" />
        </div>

        <h1 className="text-4xl font-black text-white mb-3 tracking-tight">
          ברוך הבא
        </h1>
        <p className="text-slate-400 text-base mb-10 font-medium leading-relaxed">
          הזדהות נדרשת לגישה למערכת BSD-YBM OS. <br />
          גישה מורשית למנהלי מערכת בלבד.
        </p>

        <button
          onClick={handleLogin}
          disabled={isLoading}
          className="w-full relative group overflow-hidden rounded-2xl p-[1px] transition-all transform active:scale-95"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-emerald-500 to-blue-500 rounded-2xl opacity-80 group-hover:opacity-100 transition-opacity duration-300" />
          <div className="relative bg-slate-950 px-6 py-4 rounded-2xl flex items-center justify-center gap-4 transition-all duration-300 group-hover:bg-slate-950/80">
            {isLoading ? (
              <div className="w-6 h-6 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="white" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="text-white font-black text-lg tracking-tight">
                  התחבר עם Google
                </span>
              </>
            )}
          </div>
        </button>

        {/* חיווי אבטחה */}
        <div className="mt-10 flex items-center justify-center gap-3 text-xs text-slate-500 font-bold uppercase tracking-widest">
          <span className="w-2 h-2 rounded-full bg-emerald-500/50 animate-pulse" />
          חיבור מאובטח מוצפן קצה לקצה
        </div>
      </motion.div>

      <button 
        onClick={() => router.push('/')}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 text-slate-500 hover:text-white transition-colors font-bold text-sm group"
      >
        <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        חזרה לדף הבית
      </button>
    </div>
  );
}
