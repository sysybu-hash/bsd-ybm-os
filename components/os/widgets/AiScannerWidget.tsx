"use client";

import React, { useState, useCallback } from 'react';
import { 
  ScanLine, 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  History,
  ArrowRight,
  Bot,
  Zap,
  Trash2,
  Save,
  X,
  Building2,
  Hash,
  Calendar,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';

interface DocumentAnalysis {
  amount: number;
  vendor: string;
  taxId?: string;
  projectSuggestion: string;
  confidence: number;
  summary: string;
  date?: string;
  documentId?: string;
  rawAiData?: any; // Store original AI data for feedback loop
}

interface ScanHistoryItem {
  id: string;
  fileName: string;
  vendor: string;
  amount: number;
  date: string;
  status: 'success' | 'warning' | 'error';
}

export default function AiScannerWidget() {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<DocumentAnalysis | null>(null);
  const [history, setHistory] = useState<ScanHistoryItem[]>([
    { id: '1', fileName: 'חשבונית_חומרים_101.pdf', vendor: 'ספק חומרים', amount: 4500, date: '2026-05-12', status: 'success' },
    { id: '2', fileName: 'קבלה_ציוד_עבודה.jpg', vendor: 'חנות כלי עבודה', amount: 1250, date: '2026-05-10', status: 'success' },
    { id: '3', fileName: 'הזמנת_עבודה_תשתית.pdf', vendor: 'קבלן משנה', amount: 8900, date: '2026-05-08', status: 'warning' },
  ]);

  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (!file) return;

    await processFile(file);
  }, []);

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setPendingAnalysis(null);
    toast.info(`מתחיל ניתוח AI עבור ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (res.ok) {
        setPendingAnalysis({
          ...data.analysis,
          date: data.analysis.date || new Date().toISOString().split('T')[0],
          documentId: data.notification?.payload?.documentId,
          rawAiData: data.analysis // Save original for corrections
        });
        toast.success('המסמך נותח! אנא אשר את הנתונים.');
      } else {
        throw new Error('Analysis failed');
      }
    } catch (error) {
      toast.error('שגיאה בניתוח המסמך');
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmAnalysis = async () => {
    if (!pendingAnalysis) return;
    
    // Check for corrections
    const isCorrected = 
      pendingAnalysis.vendor !== pendingAnalysis.rawAiData?.vendor ||
      pendingAnalysis.amount !== pendingAnalysis.rawAiData?.amount ||
      pendingAnalysis.taxId !== pendingAnalysis.rawAiData?.taxId ||
      pendingAnalysis.date !== pendingAnalysis.rawAiData?.date;

    if (isCorrected) {
      try {
        await fetch('/api/ai/corrections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            documentId: pendingAnalysis.documentId,
            originalAiData: pendingAnalysis.rawAiData,
            correctedData: {
              vendor: pendingAnalysis.vendor,
              amount: pendingAnalysis.amount,
              taxId: pendingAnalysis.taxId,
              date: pendingAnalysis.date
            },
            correctionSource: 'USER_MANUAL'
          })
        });
      } catch (err) {
        console.error("Failed to save AI correction", err);
      }
    }

    // Save to expenses table
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'confirm-expense',
          amount: pendingAnalysis.amount,
          vendor: pendingAnalysis.vendor,
          taxId: pendingAnalysis.taxId,
          date: pendingAnalysis.date,
          projectName: pendingAnalysis.projectSuggestion
        })
      });
    } catch (err) {
      console.error("Failed to confirm expense", err);
    }

    const newItem: ScanHistoryItem = {
      id: Date.now().toString(),
      fileName: 'סריקה חדשה',
      vendor: pendingAnalysis.vendor,
      amount: pendingAnalysis.amount,
      date: pendingAnalysis.date || new Date().toISOString().split('T')[0],
      status: 'success'
    };
    
    setHistory(prev => [newItem, ...prev]);
    setPendingAnalysis(null);
    toast.success('ההוצאה נשמרה במערכת!');
  };

  return (
    <div className="flex flex-col md:flex-row h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir="rtl">
      {/* History Sidebar */}
      <div className="w-full md:w-72 border-b md:border-b-0 md:border-l border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex flex-col h-1/3 md:h-auto">
        <div className="p-6 border-b border-[color:var(--border-main)]">
          <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400">
            <History size={18} />
            <span className="font-black text-xs uppercase tracking-widest">היסטוריית סריקות</span>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
          {history.map(item => (
            <div key={item.id} className="p-3 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl hover:bg-[color:var(--surface-card)]/80 transition-all cursor-pointer group shadow-sm dark:shadow-none">
              <div className="flex justify-between items-start mb-2">
                <div className={`p-1.5 rounded-lg ${item.status === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                  <FileText size={14} />
                </div>
                <span className="text-[10px] font-mono text-[color:var(--foreground-muted)] opacity-70">{item.date}</span>
              </div>
              <div className="text-xs font-bold text-[color:var(--foreground-main)] truncate mb-1">{item.fileName}</div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-[color:var(--foreground-muted)] font-bold uppercase">{item.vendor}</span>
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-black">₪{(item.amount || 0).toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Main Scanner Area */}
      <div className="flex-1 flex flex-col p-4 md:p-8 overflow-y-auto custom-scrollbar">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-400 shadow-lg shadow-orange-900/10">
            <ScanLine size={28} />
          </div>
          <div>
            <h2 className="text-2xl font-black text-[color:var(--foreground-main)] tracking-tight">סורק חשבוניות AI</h2>
            <p className="text-sm text-[color:var(--foreground-muted)] font-medium">מנוע פענוח מסמכים מבוסס Vision ו-LLM</p>
          </div>
        </div>

        {pendingAnalysis ? (
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="w-full max-w-xl bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] rounded-[2.5rem] p-8 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-[color:var(--foreground-main)] flex items-center gap-3">
                  <CheckCircle2 className="text-emerald-600 dark:text-emerald-400" size={24} /> אישור נתוני סריקה
                </h3>
                <button onClick={() => setPendingAnalysis(null)} className="p-2 hover:bg-[color:var(--foreground-muted)]/10 rounded-full text-[color:var(--foreground-muted)] transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6 mb-10">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest flex items-center gap-2">
                    <Building2 size={12} /> שם ספק
                  </label>
                  <input 
                    value={pendingAnalysis.vendor}
                    onChange={(e) => setPendingAnalysis({...pendingAnalysis, vendor: e.target.value})}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50 text-[color:var(--foreground-main)]"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest flex items-center gap-2">
                    <Hash size={12} /> ח&quot;פ / ע.מ
                  </label>
                  <input 
                    value={pendingAnalysis.taxId || ''}
                    onChange={(e) => setPendingAnalysis({...pendingAnalysis, taxId: e.target.value})}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50 text-[color:var(--foreground-main)]"
                    placeholder="לא זוהה"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest flex items-center gap-2">
                    <DollarSign size={12} /> סכום כולל מע&quot;מ
                  </label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400 font-bold">₪</span>
                    <input 
                      type="number"
                      value={pendingAnalysis.amount}
                      onChange={(e) => setPendingAnalysis({...pendingAnalysis, amount: parseFloat(e.target.value)})}
                      className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl px-4 py-3 pl-10 text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest flex items-center gap-2">
                    <Calendar size={12} /> תאריך מסמך
                  </label>
                  <input 
                    type="date"
                    value={pendingAnalysis.date}
                    onChange={(e) => setPendingAnalysis({...pendingAnalysis, date: e.target.value})}
                    className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500/50 text-[color:var(--foreground-main)]"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={confirmAnalysis}
                  className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-lg rounded-2xl shadow-xl shadow-emerald-900/20 transition-all flex items-center justify-center gap-3"
                >
                  <Save size={20} /> אשר ושמור הוצאה
                </button>
                <button 
                  onClick={() => setPendingAnalysis(null)}
                  className="px-6 h-14 bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80 border border-[color:var(--border-main)] text-[color:var(--foreground-main)] font-bold rounded-2xl transition-all"
                >
                  בטל
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={onDrop}
            className={`flex-1 flex flex-col items-center justify-center border-2 border-dashed rounded-[2.5rem] transition-all duration-300 ${
              isDragging ? 'border-orange-500/50 bg-orange-500/5 scale-[0.99]' : 'border-[color:var(--border-main)] bg-[color:var(--background-main)]/30'
            }`}
          >
            {isProcessing ? (
              <div className="flex flex-col items-center gap-6">
                <div className="relative">
                  <div className="w-24 h-24 rounded-full border-4 border-orange-500/10 border-t-orange-500 animate-spin" />
                  <Bot className="absolute inset-0 m-auto text-orange-600 dark:text-orange-400" size={32} />
                </div>
                <div className="text-center">
                  <h3 className="text-xl font-bold text-[color:var(--foreground-main)] mb-2">מנתח נתונים...</h3>
                  <p className="text-[color:var(--foreground-muted)] text-sm">מחלץ פריטים, ספקים וסכומים מהמסמך</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-8 text-center max-w-sm">
                <div className="w-24 h-24 rounded-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] flex items-center justify-center relative group">
                  <div className="absolute inset-0 rounded-full bg-orange-500/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Upload size={40} className="text-[color:var(--foreground-muted)] group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-[color:var(--foreground-main)] mb-3">גרור חשבונית לכאן</h3>
                  <p className="text-[color:var(--foreground-muted)] text-sm leading-relaxed">תומך ב-PDF, JPG, PNG. המערכת תזהה אוטומטית את הספק ותשייך לפרויקט המתאים.</p>
                </div>
                <button 
                  onClick={() => (document.querySelector('#file-upload') as HTMLInputElement)?.click()}
                  className="px-8 py-3 bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80 border border-[color:var(--border-main)] rounded-2xl text-sm font-bold text-[color:var(--foreground-main)] transition-all flex items-center gap-3 shadow-sm dark:shadow-none"
                >
                  בחר קובץ מהמחשב <ArrowRight size={16} />
                </button>
                <input 
                  id="file-upload" 
                  type="file" 
                  className="hidden" 
                  onChange={(e) => e.target.files?.[0] && processFile(e.target.files[0])}
                />
              </div>
            )}
          </div>
        )}

        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
          <div className="bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] rounded-2xl p-5 flex items-center gap-4 shadow-sm dark:shadow-none">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400"><Zap size={20} /></div>
            <div>
              <div className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">מהירות עיבוד</div>
              <div className="text-lg font-black text-[color:var(--foreground-main)]">~2.4 שניות</div>
            </div>
          </div>
          <div className="bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] rounded-2xl p-5 flex items-center gap-4 shadow-sm dark:shadow-none">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={20} /></div>
            <div>
              <div className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">דיוק זיהוי</div>
              <div className="text-lg font-black text-[color:var(--foreground-main)]">98.2%</div>
            </div>
          </div>
          <div className="bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] rounded-2xl p-5 flex items-center gap-4 shadow-sm dark:shadow-none">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400"><Bot size={20} /></div>
            <div>
              <div className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">מנוע פעיל</div>
              <div className="text-lg font-black text-[color:var(--foreground-main)]">Gemini 1.5 Flash</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
