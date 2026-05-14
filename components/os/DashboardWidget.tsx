"use client";

import React, { useState, useEffect } from 'react';
import { useTheme } from 'next-themes';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid,
  BarChart,
  Bar
} from 'recharts';
import { Sparkles, TrendingUp, AlertTriangle, ArrowUpRight, ArrowDownRight, Activity } from 'lucide-react';
import { motion } from 'framer-motion';

interface CashflowPoint {
  name: string;
  actual?: number;
  forecast?: number;
  type: 'past' | 'future';
}

export default function DashboardWidget() {
  const { theme } = useTheme();
  const [stats, setStats] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    activeProjects: 0,
    totalClients: 0,
    pendingInvoices: 0,
    aiInsight: '',
    cashflow: [] as CashflowPoint[],
    analytics: {
      monthlyExpenses: [] as { name: string, value: number }[],
      quoteStatus: [] as { name: string, value: number, color: string }[]
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardStats = async () => {
      try {
        const res = await fetch('/api/data?type=dashboard');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchDashboardStats();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-transparent p-8">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-[color:var(--foreground-muted)] text-sm animate-pulse">מסנכרן נתונים פיננסיים...</p>
      </div>
    );
  }

  const netProfit = stats.totalRevenue - stats.totalExpenses;
  const formatCurrency = (num: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(num);

  return (
    <div className="flex flex-col h-full bg-transparent text-[color:var(--foreground-main)] p-6 overflow-y-auto custom-scrollbar gap-8" dir="rtl">
      {/* Top Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] p-5 rounded-2xl flex flex-col gap-2 relative overflow-hidden group shadow-sm dark:shadow-none">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full -mr-12 -mt-12 blur-2xl group-hover:bg-emerald-500/10 transition-colors" />
          <span className="text-[color:var(--foreground-muted)] text-[10px] font-bold uppercase tracking-widest">סה&quot;כ הכנסות</span>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-black text-[color:var(--foreground-main)]">{formatCurrency(stats.totalRevenue)}</span>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center mb-1"><ArrowUpRight size={12} /> 12%</span>
          </div>
        </div>

        <div className="bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] p-5 rounded-2xl flex flex-col gap-2 relative overflow-hidden group shadow-sm dark:shadow-none">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full -mr-12 -mt-12 blur-2xl group-hover:bg-rose-500/10 transition-colors" />
          <span className="text-[color:var(--foreground-muted)] text-[10px] font-bold uppercase tracking-widest">הוצאות מצטברות</span>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-black text-[color:var(--foreground-main)]">{formatCurrency(stats.totalExpenses)}</span>
            <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold flex items-center mb-1"><ArrowDownRight size={12} /> 5%</span>
          </div>
        </div>

        <div className="bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] p-5 rounded-2xl flex flex-col gap-2 relative overflow-hidden group shadow-sm dark:shadow-none">
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full -mr-12 -mt-12 blur-2xl group-hover:bg-blue-500/10 transition-colors" />
          <span className="text-[color:var(--foreground-muted)] text-[10px] font-bold uppercase tracking-widest">רווח תפעולי</span>
          <div className="text-2xl font-black text-[color:var(--foreground-main)]">{formatCurrency(netProfit)}</div>
        </div>

        <div className="bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] p-5 rounded-2xl flex flex-col gap-2 relative overflow-hidden group shadow-sm dark:shadow-none">
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full -mr-12 -mt-12 blur-2xl group-hover:bg-indigo-500/10 transition-colors" />
          <span className="text-[color:var(--foreground-muted)] text-[10px] font-bold uppercase tracking-widest">פרויקטים פעילים</span>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-black text-[color:var(--foreground-main)]">{stats.activeProjects}</span>
            <span className="text-[10px] text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-lg border border-indigo-500/20">{stats.pendingInvoices} בטיפול</span>
          </div>
        </div>
      </div>

      {/* AI Insight Section */}
      {stats.aiInsight && (
        <div className="bg-emerald-500/[0.03] border border-emerald-500/20 p-5 rounded-[2rem] flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 shadow-lg shadow-emerald-500/5">
            <Sparkles size={22} />
          </div>
          <div className="flex flex-col gap-1">
             <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-[0.2em] mb-1">AI Financial Intelligence</span>
             <p className="text-sm text-[color:var(--foreground-main)] opacity-90 leading-relaxed font-medium">{stats.aiInsight}</p>
          </div>
        </div>
      )}

      {/* Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expense Summary Chart */}
        <div className="bg-[color:var(--background-main)]/30 border border-[color:var(--border-main)] rounded-[2rem] p-6 shadow-sm dark:shadow-none">
          <h3 className="text-sm font-bold text-[color:var(--foreground-muted)] mb-6 flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-500 dark:text-emerald-400" /> סיכום הוצאות חודשי
          </h3>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.analytics.monthlyExpenses}>
                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? "#ffffff05" : "#00000005"} vertical={false} />
                <XAxis dataKey="name" stroke="var(--foreground-muted)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--foreground-muted)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `₪${v/1000}k`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', border: '1px solid var(--border-main)', borderRadius: '12px', fontSize: '12px' }}
                  itemStyle={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }}
                  formatter={(v: number) => formatCurrency(v)}
                />
                <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Document Status Breakdown */}
        <div className="bg-[color:var(--background-main)]/30 border border-[color:var(--border-main)] rounded-[2rem] p-6 shadow-sm dark:shadow-none">
          <h3 className="text-sm font-bold text-[color:var(--foreground-muted)] mb-6 flex items-center gap-2">
            <Activity size={16} className="text-indigo-500 dark:text-indigo-400" /> סטטוס הצעות מחיר
          </h3>
          <div className="flex flex-col gap-4">
            {stats.analytics.quoteStatus.map((status, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                  <span className="text-[color:var(--foreground-muted)]">{status.name}</span>
                  <span className="text-[color:var(--foreground-main)]">{status.value} מסמכים</span>
                </div>
                <div className="h-2 w-full bg-[color:var(--foreground-muted)]/10 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${(status.value / (stats.analytics.quoteStatus.reduce((a, b) => a + b.value, 0) || 1)) * 100}%` }}
                    className="h-full"
                    style={{ backgroundColor: status.color }}
                  />
                </div>
              </div>
            ))}
            <div className="mt-4 p-4 bg-[color:var(--surface-card)]/50 rounded-xl border border-[color:var(--border-main)]">
              <p className="text-[10px] text-[color:var(--foreground-muted)] leading-relaxed text-center">
                המערכת מזהה {stats.analytics.quoteStatus.find(s => s.name === 'ממתין')?.value || 0} הצעות מחיר שטרם נחתמו. מומלץ לשלוח תזכורת אוטומטית.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cashflow Forecasting Chart */}
      <div className="bg-[color:var(--background-main)]/30 border border-[color:var(--border-main)] rounded-[2rem] p-8 flex flex-col shadow-sm dark:shadow-none">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h3 className="text-lg font-bold text-[color:var(--foreground-main)] flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-500 dark:text-indigo-400" /> תחזית תזרים מזומנים חכמה
            </h3>
            <p className="text-xs text-[color:var(--foreground-muted)] mt-1 uppercase tracking-wider">ניתוח היסטורי + תחזית רבעונית קדימה</p>
          </div>
          <div className="flex gap-4">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-500" />
              <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase">ביצוע בפועל</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-indigo-500/30 border border-dashed border-indigo-600 dark:border-indigo-400" />
              <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase">תחזית AI</span>
            </div>
          </div>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.cashflow} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? "#ffffff05" : "#00000005"} vertical={false} />
              <XAxis 
                dataKey="name" 
                stroke="var(--foreground-muted)" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                dy={10}
              />
              <YAxis 
                stroke="var(--foreground-muted)" 
                fontSize={10} 
                tickLine={false} 
                axisLine={false} 
                tickFormatter={(value) => `₪${value/1000}k`}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', border: '1px solid var(--border-main)', borderRadius: '12px', fontSize: '12px' }}
                itemStyle={{ color: theme === 'dark' ? '#e2e8f0' : '#0f172a' }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Area 
                type="monotone" 
                dataKey="actual" 
                stroke="#6366f1" 
                strokeWidth={4} 
                fillOpacity={1} 
                fill="url(#colorActual)" 
                strokeLinecap="round"
                connectNulls
              />
              <Area 
                type="monotone" 
                dataKey="forecast" 
                stroke="#6366f1" 
                strokeWidth={2} 
                strokeDasharray="5 5"
                fillOpacity={1} 
                fill="url(#colorForecast)" 
                connectNulls
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 border-t border-[color:var(--border-main)]/30">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-600 dark:text-indigo-400">
              <TrendingUp size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">מגמת צמיחה</div>
              <div className="text-lg font-black text-[color:var(--foreground-main)]">+18.4%</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-amber-500/10 rounded-2xl text-amber-600 dark:text-amber-400">
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">חריגת תקציב פוטנציאלית</div>
              <div className="text-lg font-black text-[color:var(--foreground-main)]">יוני 2026</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/10 rounded-2xl text-blue-600 dark:text-blue-400">
              <Activity size={20} />
            </div>
            <div>
              <div className="text-xs font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">דירוג אשראי פנימי</div>
              <div className="text-lg font-black text-[color:var(--foreground-main)]">AA+</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
