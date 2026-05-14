"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Zap, 
  ArrowLeft, 
  Mic, 
  BarChart3, 
  Scan, 
  PenTool, 
  ChevronLeft,
  ShieldCheck,
  Bot,
  LayoutDashboard,
  Cpu,
  Globe,
  Clock,
  Users,
  CheckCircle2,
  HelpCircle,
  CreditCard,
  Rocket
} from 'lucide-react';
import { signIn } from 'next-auth/react';

export default function LandingPage() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.8,
        ease: "circOut"
      }
    }
  } as const;

  return (
    <div className="min-h-screen bg-[#020617] text-slate-200 font-heebo selection:bg-indigo-500/30 overflow-x-hidden relative" dir="rtl">
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
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
      </div>

      {/* Header */}
      <header className="relative z-50 max-w-7xl mx-auto px-6 py-8 flex items-center justify-between">
        <div className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-600/30 group-hover:scale-110 transition-transform">
            <Zap size={20} className="text-white fill-white" />
          </div>
          <span className="text-xl font-black tracking-tighter text-white">
            BSD-YBM <span className="text-indigo-400">OS</span>
          </span>
        </div>

        <button 
          onClick={() => signIn()}
          className="px-6 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-indigo-500/50 text-white font-bold text-sm transition-all backdrop-blur-md shadow-[0_0_20px_rgba(79,70,229,0.1)] hover:shadow-[0_0_25px_rgba(79,70,229,0.2)] flex items-center gap-2 group"
        >
          <span>התחברות</span>
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" />
        </button>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 max-w-7xl mx-auto px-6 pt-20 pb-32">
        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="text-center mb-24"
        >
          <motion.div variants={itemVariants} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold mb-8 backdrop-blur-md">
            <Cpu size={14} />
            <span>הדור הבא של ניהול תשתיות ובנייה</span>
          </motion.div>
          
          <motion.h1 variants={itemVariants} className="text-6xl md:text-8xl font-black text-white mb-8 tracking-tighter leading-[1.1]">
            מערכת ההפעלה <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-l from-indigo-400 via-emerald-400 to-blue-400">של העסק שלך.</span>
          </motion.h1>

          <motion.p variants={itemVariants} className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto mb-12 leading-relaxed font-medium">
            מרכז בקרה חכם מבוסס בינה מלאכותית (AI) שמנהל פרויקטים, כספים ולקוחות באוטומציה מלאה.
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col md:flex-row items-center justify-center gap-6">
            <button 
              onClick={() => signIn()}
              className="w-full md:w-auto px-10 py-5 bg-gradient-to-l from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black rounded-2xl shadow-2xl shadow-indigo-600/20 transition-all transform hover:scale-105 active:scale-95 text-lg flex items-center justify-center gap-2"
            >
              <Rocket size={20} />
              <span>התחל לעבוד עכשיו</span>
            </button>
            <button className="w-full md:w-auto px-10 py-5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black rounded-2xl transition-all text-lg backdrop-blur-md">
              צפה בדמו חי
            </button>
          </motion.div>
        </motion.div>

        {/* Trusted By Section */}
        <motion.div 
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          viewport={{ once: true }}
          className="mb-32"
        >
          <p className="text-center text-slate-500 text-sm font-bold uppercase tracking-[0.2em] mb-12">נבנה עבור חברות התשתית והבנייה המובילות</p>
          <div className="flex flex-wrap justify-center items-center gap-12 md:gap-24 opacity-30 grayscale hover:grayscale-0 transition-all duration-700">
            {['תשתיות ישראל', 'בנייה מתקדמת', 'יזמות נדל"ן', 'קבוצת YBM', 'הנדסה אזרחית'].map((name, i) => (
              <span key={i} className="text-xl md:text-2xl font-black tracking-tighter text-white whitespace-nowrap">{name}</span>
            ))}
          </div>
        </motion.div>

        {/* Abstract OS Mockup */}
        <motion.div 
          initial={{ opacity: 0, y: 100 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: "circOut" }}
          viewport={{ once: true }}
          className="relative max-w-5xl mx-auto"
        >
          <div className="absolute inset-0 bg-indigo-500/20 blur-[120px] rounded-full -z-10" />
          <div className="bg-slate-900/40 border border-white/10 rounded-[2.5rem] p-4 backdrop-blur-3xl shadow-2xl overflow-hidden aspect-[16/10] relative group">
            {/* Mock OS Header */}
            <div className="h-8 flex items-center justify-between px-4 mb-4 opacity-50">
              <div className="flex gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-rose-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500/50" />
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/50" />
              </div>
              <div className="w-32 h-2 bg-white/10 rounded-full" />
            </div>
            
            {/* Floating Elements */}
            <motion.div 
              animate={{ y: [0, -20, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-20 right-12 w-64 p-6 bg-white/5 border border-white/10 rounded-3xl backdrop-blur-xl shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <BarChart3 size={18} />
                </div>
                <div className="h-2 w-24 bg-white/20 rounded-full" />
              </div>
              <div className="space-y-2">
                <div className="h-1.5 w-full bg-white/10 rounded-full" />
                <div className="h-1.5 w-2/3 bg-white/10 rounded-full" />
              </div>
            </motion.div>

            <motion.div 
              animate={{ y: [0, 20, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute bottom-20 left-12 w-72 p-6 bg-indigo-600/10 border border-indigo-500/20 rounded-3xl backdrop-blur-xl shadow-2xl"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Mic size={18} />
                </div>
                <div className="h-2 w-32 bg-white/20 rounded-full" />
              </div>
              <div className="flex gap-1 items-end h-8">
                {[...Array(12)].map((_, i) => (
                  <motion.div 
                    key={i}
                    animate={{ height: [4, Math.random() * 24 + 4, 4] }}
                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                    className="flex-1 bg-indigo-400/50 rounded-full"
                  />
                ))}
              </div>
            </motion.div>

            {/* Main Mockup Content */}
            <div className="grid grid-cols-12 gap-4 h-full pt-12">
              <div className="col-span-3 space-y-4">
                <div className="h-32 bg-white/5 rounded-2xl border border-white/5" />
                <div className="h-48 bg-white/5 rounded-2xl border border-white/5" />
              </div>
              <div className="col-span-6 space-y-4">
                <div className="h-full bg-white/5 rounded-3xl border border-white/5 flex items-center justify-center">
                  <Bot size={64} className="text-indigo-500/20" />
                </div>
              </div>
              <div className="col-span-3 space-y-4">
                <div className="h-48 bg-white/5 rounded-2xl border border-white/5" />
                <div className="h-32 bg-white/5 rounded-2xl border border-white/5" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Bento Grid Features */}
        <section className="mt-48">
          <motion.div 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6 tracking-tight">למה לבחור ב-BSD-YBM?</h2>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto">כל הכלים שאתה צריך כדי להזניק את העסק שלך קדימה, בממשק אחד אינטואיטיבי.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {/* Gemini Live */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="md:col-span-2 p-8 bg-gradient-to-br from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 rounded-[2.5rem] backdrop-blur-xl relative overflow-hidden group"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400 mb-6">
                <Mic size={32} />
              </div>
              <h3 className="text-2xl font-black text-white mb-4">Gemini Live</h3>
              <p className="text-slate-400 leading-relaxed">עוזר קולי חכם לניהול המערכת. פשוט תגיד מה אתה צריך - והמערכת תבצע. פתיחת פרויקטים, הפקת דוחות וניהול יומן בדיבור חופשי.</p>
            </motion.div>

            {/* ERP & CRM */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="md:col-span-2 p-8 bg-white/5 border border-white/10 rounded-[2.5rem] backdrop-blur-xl group"
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center text-blue-400 mb-6">
                <BarChart3 size={32} />
              </div>
              <h3 className="text-2xl font-black text-white mb-4">ERP & CRM</h3>
              <p className="text-slate-400 leading-relaxed">שליטה פיננסית וניהול לקוחות תחת קורת גג אחת. מעקב תקציבים, ניהול לידים וסנכרון מלא מול בסיס הנתונים של הארגון.</p>
            </motion.div>

            {/* AI Scanner */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="md:col-span-2 p-8 bg-white/5 border border-white/10 rounded-[2.5rem] backdrop-blur-xl group"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6">
                <Scan size={32} />
              </div>
              <h3 className="text-2xl font-black text-white mb-4">סורק מסמכים AI</h3>
              <p className="text-slate-400 leading-relaxed">חילוץ נתונים אוטומטי מחשבוניות ומסמכים. הבינה המלאכותית מזהה ספקים, סכומים ופריטים ומזינה אותם ישירות למערכת.</p>
            </motion.div>

            {/* Digital Signature */}
            <motion.div 
              whileHover={{ y: -10 }}
              className="md:col-span-2 p-8 bg-gradient-to-br from-emerald-600/20 to-teal-600/20 border border-emerald-500/20 rounded-[2.5rem] backdrop-blur-xl group"
            >
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-400 mb-6">
                <PenTool size={32} />
              </div>
              <h3 className="text-2xl font-black text-white mb-4">חתימה דיגיטלית</h3>
              <p className="text-slate-400 leading-relaxed">הפקת הצעות מחיר וסגירת עסקאות אונליין. שלח קישור לחתימה ללקוח וקבל עדכון מיידי כשהעסקה נחתמה וסונכרנה לארכיון.</p>
            </motion.div>
          </div>
        </section>

        {/* How It Works */}
        <section className="mt-48">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">איך זה עובד?</h2>
            <p className="text-slate-400 text-lg">3 צעדים פשוטים לאוטומציה מלאה של העסק שלך</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            {[
              { icon: <Globe size={24} />, title: "התחברות מהירה", desc: "מתחברים עם חשבון Google ומגדירים את פרופיל העסק ב-60 שניות." },
              { icon: <Bot size={24} />, title: "הגדרת אוטומציה", desc: "ה-AI לומד את הפרויקטים והלקוחות שלך ומתחיל לנהל את המשימות." },
              { icon: <CheckCircle2 size={24} />, title: "צמיחה עסקית", desc: "קבל תובנות בזמן אמת, חסוך שעות של עבודה ידנית ותתמקד במה שחשוב." }
            ].map((step, i) => (
              <div key={i} className="relative p-8 bg-white/5 border border-white/10 rounded-3xl text-center">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold shadow-xl">
                  {i + 1}
                </div>
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 mx-auto mb-6 mt-4">
                  {step.icon}
                </div>
                <h4 className="text-xl font-bold text-white mb-3">{step.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing Section */}
        <section className="mt-48">
          <div className="text-center mb-20">
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">תוכניות ומחירים</h2>
            <p className="text-slate-400 text-lg">בחר את המסלול המתאים לצמיחה שלך</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {[
              { name: "Starter", price: "₪299", features: ["עד 5 פרויקטים", "ניהול לקוחות בסיסי", "סורק AI מוגבל", "תמיכה במייל"] },
              { name: "Professional", price: "₪599", features: ["פרויקטים ללא הגבלה", "CRM מלא", "סורק AI ללא הגבלה", "חתימה דיגיטלית", "תמיכה טלפונית"], popular: true },
              { name: "Enterprise", price: "מותאם", features: ["התאמה אישית מלאה", "API פתוח", "מנהל חשבון אישי", "אבטחה מוגברת", "SLA מובטח"] }
            ].map((plan, i) => (
              <div key={i} className={`p-10 rounded-[2.5rem] border ${plan.popular ? 'bg-indigo-600/10 border-indigo-500 shadow-2xl shadow-indigo-600/20 relative' : 'bg-white/5 border-white/10'} transition-all hover:scale-105`}>
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 bg-indigo-500 text-white text-xs font-bold rounded-full uppercase tracking-widest">הכי פופולרי</div>
                )}
                <h4 className="text-2xl font-black text-white mb-2">{plan.name}</h4>
                <div className="flex items-baseline gap-1 mb-8">
                  <span className="text-4xl font-black text-white">{plan.price}</span>
                  {plan.price !== "מותאם" && <span className="text-slate-500 font-bold">/חודש</span>}
                </div>
                <ul className="space-y-4 mb-10">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-center gap-3 text-slate-400 text-sm font-medium">
                      <CheckCircle2 size={16} className="text-indigo-400" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button 
                  onClick={() => signIn()}
                  className={`w-full py-4 rounded-xl font-black transition-all ${plan.popular ? 'bg-indigo-600 hover:bg-indigo-500 text-white' : 'bg-white/10 hover:bg-white/20 text-white'}`}
                >
                  בחר תוכנית
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ Section */}
        <section className="mt-48 max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-black text-white mb-6">שאלות נפוצות</h2>
          </div>
          <div className="space-y-6">
            {[
              { q: "האם המערכת תומכת בעברית מלאה?", a: "כן, המערכת תוכננה מהיסוד עבור השוק הישראלי עם תמיכה מלאה ב-RTL ועברית." },
              { q: "האם המידע שלי מאובטח?", a: "בהחלט. אנחנו משתמשים בהצפנה בתקן צבאי ובשרתים המאובטחים ביותר בעולם (Vercel & Google)." },
              { q: "האם אפשר להתנסות במערכת בחינם?", a: "כן, ניתן להירשם ולהתנסות בכל יכולות המערכת למשך 14 יום ללא התחייבות." }
            ].map((item, i) => (
              <div key={i} className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                <h5 className="text-lg font-bold text-white mb-3 flex items-center gap-3">
                  <HelpCircle size={20} className="text-indigo-400" />
                  {item.q}
                </h5>
                <p className="text-slate-400 text-sm leading-relaxed pr-8">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        <section className="mt-48 text-center relative">
          <div className="absolute inset-0 bg-indigo-600/10 blur-[100px] rounded-full -z-10" />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="bg-white/5 border border-white/10 rounded-[3rem] p-16 backdrop-blur-xl"
          >
            <h2 className="text-4xl md:text-6xl font-black text-white mb-8 tracking-tight">מוכן להשתדרג ל-2026?</h2>
            <p className="text-xl text-slate-400 mb-12 max-w-2xl mx-auto">הצטרף למהפכת הניהול הדיגיטלי של BSD-YBM ותתחיל לנהל את העסק שלך בחכמה.</p>
            <button 
              onClick={() => signIn()}
              className="px-12 py-6 bg-white text-slate-950 font-black rounded-2xl hover:bg-slate-200 transition-all transform hover:scale-105 active:scale-95 text-xl shadow-2xl"
            >
              התחל עכשיו בחינם
            </button>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3 opacity-50">
            <Zap size={16} />
            <span className="text-sm font-bold tracking-tighter">BSD-YBM OS</span>
          </div>
          <div className="text-slate-500 text-sm font-medium">
            BSD-YBM OS © 2026 | NextGen Intelligence
          </div>
          <div className="flex gap-8 text-slate-500 text-sm font-medium">
            <a href="#" className="hover:text-white transition-colors">תנאי שימוש</a>
            <a href="#" className="hover:text-white transition-colors">פרטיות</a>
            <a href="#" className="hover:text-white transition-colors">צור קשר</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
