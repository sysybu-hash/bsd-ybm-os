"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import React, { useState, useEffect, useRef } from 'react';
import { 
  BarChart3, 
  Receipt, 
  Users, 
  BookOpen, 
  Send, 
  Paperclip, 
  Loader2,
  Bot,
  User,
  Calendar,
  AlertCircle,
  ChevronLeft,
  X,
  FileText,
  Save
} from 'lucide-react';
import { toast } from 'sonner';

interface Expense {
  id: string;
  amount: number;
  vendor: string | null;
  date: string | null;
  createdAt: string;
}

interface AttendanceLog {
  id: number;
  employeeName: string;
  date: string;
  hours: number;
  status: string;
}

interface ProjectData {
  id: string;
  name: string;
  client: string;
  budget: number;
  expenses: number;
  health: number;
  expensesList?: Expense[];
  attendanceLogs?: AttendanceLog[];
}

interface Message {
  role: 'user' | 'model';
  content: string;
}

export default function ProjectWidget({ projectName }: { projectName: string }) {
  const { dir, t } = useI18n();
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'expenses' | 'attendance' | 'notebook'>('dashboard');
  
  // Notebook State
  const [messages, setMessages] = useState<Message[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/projects/detail?query=${encodeURIComponent(projectName)}`, {
          credentials: "include",
        });
        const projectData = await res.json();
        setData(projectData);

        const notesRes = projectData.id
          ? await fetch(`/api/projects/${projectData.id}/notes`, { credentials: "include" })
          : null;
        if (notesRes?.ok) {
          const notesData = await notesRes.json();
          setNotes(notesData);
        }
      } catch (err) {
        console.error('Failed to fetch project', err);
        toast.error(t("workspaceWidgets.project.loadFailed"));
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [projectName]);

  const handleSaveNote = async (content: string) => {
    if (!data?.id) return;
    try {
      const res = await fetch(`/api/projects/${data.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
        credentials: 'include',
      });
      if (res.ok) {
        const newNote = await res.json();
        setNotes(prev => [newNote, ...prev]);
        toast.success(t("workspaceWidgets.project.noteSaved"));
      }
    } catch (err) {
      toast.error(t("workspaceWidgets.project.noteSaveFailed"));
    }
  };

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isChatting) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsChatting(true);

    try {
      const res = await fetch('/api/erp/notebook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          billOfQuantitiesContext: JSON.stringify(data?.expensesList?.slice(0, 5) || []) // Example context
        })
      });

      const result = await res.json();
      if (res.ok) {
        setMessages(prev => [...prev, { role: 'model', content: result.text }]);
      } else {
        toast.error('שגיאה בתקשורת עם ה-AI');
      }
    } catch (error) {
      toast.error('שגיאת חיבור');
    } finally {
      setIsChatting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600 dark:text-emerald-500 mb-4" />
        <p className="text-slate-500 dark:text-slate-400 text-sm">מעבד נתוני פרויקט {projectName}...</p>
      </div>
    );
  }

  if (!data || 'error' in data) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-white dark:bg-slate-950 p-8 text-center">
        <AlertCircle className="w-12 h-12 text-rose-500 mb-4 opacity-50" />
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">פרויקט לא נמצא</h2>
        <p className="text-slate-500 text-sm">לא הצלחנו למצוא פרויקט בשם &quot;{projectName}&quot; במסד הנתונים.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-200 overflow-hidden" dir={dir}>
      {/* OS Header Style Area */}
      <div className="px-6 pt-6 pb-4 bg-slate-50 dark:bg-slate-900/40 border-b border-slate-200 dark:border-white/10">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">{data.name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">לקוח: {data.client}</span>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">בריאות פרויקט</span>
            <div className="flex items-center gap-3">
              <div className="w-32 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${data.health > 80 ? 'bg-emerald-500' : data.health > 50 ? 'bg-amber-500' : 'bg-rose-500'}`} 
                  style={{ width: `${data.health}%` }} 
                />
              </div>
              <span className={`text-sm font-black ${data.health > 80 ? 'text-emerald-600 dark:text-emerald-400' : data.health > 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {data.health}%
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex gap-1 bg-slate-100 dark:bg-black/20 p-1 rounded-xl border border-slate-200 dark:border-white/5 self-start">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'dashboard' ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm dark:shadow-lg' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            <BarChart3 size={14} /> דאשבורד
          </button>
          <button 
            onClick={() => setActiveTab('expenses')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'expenses' ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm dark:shadow-lg' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            <Receipt size={14} /> הוצאות
          </button>
          <button 
            onClick={() => setActiveTab('attendance')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'attendance' ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm dark:shadow-lg' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            <Users size={14} /> נוכחות
          </button>
          <button 
            onClick={() => setActiveTab('notebook')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'notebook' ? 'bg-white dark:bg-white/10 text-slate-900 dark:text-white shadow-sm dark:shadow-lg' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
          >
            <BookOpen size={14} /> מחברת פרויקט
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden relative">
        {activeTab === 'dashboard' && (
          <div className="p-6 space-y-6 overflow-y-auto h-full custom-scrollbar">
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">תקציב פרויקט</span>
                <div className="text-2xl font-black text-slate-900 dark:text-white">₪{(data.budget || 0).toLocaleString()}</div>
              </div>
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-none">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-2">הוצאות מצטברות</span>
                <div className="text-2xl font-black text-rose-600 dark:text-rose-400">₪{(data.expenses || 0).toLocaleString()}</div>
              </div>
            </div>
            
            <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-5">
              <h4 className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mb-3 flex items-center gap-2">
                <Bot size={16} /> תובנת AI לפרויקט
              </h4>
              <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed italic">
                &quot;על בסיס ניתוח ההוצאות האחרונות, הפרויקט מתקדם בתוך מסגרת התקציב. שימו לב לעלייה במחירי הבטון שנצפתה בחשבונית האחרונה מספק &apos;אבן וסיד&apos;.&quot;
              </p>
            </div>
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">יומן הוצאות מאושרות</h3>
              <span className="text-[10px] bg-slate-100 dark:bg-white/5 px-2 py-1 rounded text-slate-500 dark:text-slate-400 uppercase border border-slate-200 dark:border-transparent">{data.expensesList?.length || 0} רשומות</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
              {data.expensesList?.map((exp) => (
                <div key={exp.id} className="group flex justify-between items-center bg-slate-50 dark:bg-white/[0.02] hover:bg-slate-100 dark:hover:bg-white/[0.05] p-4 rounded-xl text-sm border border-slate-200 dark:border-white/5 transition-all shadow-sm dark:shadow-none">
                  <div className="flex flex-col">
                    <span className="text-slate-900 dark:text-slate-200 font-bold">{exp.vendor || 'ספק לא ידוע'}</span>
                    <span className="text-slate-400 dark:text-slate-500 text-[10px] mt-0.5">{exp.date ? new Date(exp.date).toLocaleDateString('he-IL') : 'תאריך לא ידוע'}</span>
                  </div>
                  <div className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">₪{(exp.amount || 0).toLocaleString()}</div>
                </div>
              ))}
              {(!data.expensesList || data.expensesList.length === 0) && (
                <div className="flex flex-col items-center justify-center h-40 opacity-30">
                  <Receipt size={32} className="text-slate-400 dark:text-slate-600" />
                  <p className="text-xs mt-2 text-slate-500 dark:text-slate-400">אין הוצאות רשומות</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'attendance' && (
          <div className="p-6 h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-widest">נוכחות בשטח (Meckano)</h3>
              <span className="text-[10px] bg-amber-500/10 dark:bg-amber-500/20 px-2 py-1 rounded text-amber-600 dark:text-amber-400 uppercase border border-amber-500/20">Live Sync</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
              {data.attendanceLogs?.map((log) => (
                <div key={log.id} className="flex justify-between items-center bg-amber-500/[0.02] p-4 rounded-xl text-sm border border-amber-500/10 shadow-sm dark:shadow-none">
                  <div className="flex flex-col">
                    <span className="text-slate-900 dark:text-slate-200 font-bold">{log.employeeName}</span>
                    <span className="text-amber-600 dark:text-amber-500/60 text-[10px] mt-0.5">{log.status}</span>
                  </div>
                  <div className="text-amber-600 dark:text-amber-400 font-mono font-bold">{log.hours} ש׳</div>
                </div>
              ))}
              {(!data.attendanceLogs || data.attendanceLogs.length === 0) && (
                <div className="flex flex-col items-center justify-center h-40 opacity-30">
                  <Users size={32} className="text-slate-400 dark:text-slate-600" />
                  <p className="text-xs mt-2 text-slate-500 dark:text-slate-400">אין נתוני נוכחות מסונכרנים</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'notebook' && (
          <div className="absolute inset-0 flex flex-col bg-slate-50/50 dark:bg-slate-900/20">
            <div className="flex-1 flex flex-col min-h-0">
              {/* Saved Notes Section */}
              {notes.length > 0 && (
                <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 bg-white/50 dark:bg-black/10">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">הערות שמורות</h4>
                  <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
                    {notes.map((note) => (
                      <div key={note.id} className="flex-shrink-0 w-64 p-3 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl shadow-sm">
                        <div className="text-[10px] text-slate-400 mb-1">{new Date(note.createdAt).toLocaleDateString('he-IL')}</div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2">{note.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Chat Area */}
              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 p-6 pr-2">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full opacity-40 text-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                      <BookOpen size={32} className="text-emerald-600 dark:text-emerald-500" />
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 max-w-[200px]">שאל את ה-AI על תוכניות העבודה, כתבי כמויות או דרישות הנדסיות.</p>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed relative group ${m.role === 'user' ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-200 border border-slate-200 dark:border-white/5 rounded-br-none shadow-sm dark:shadow-none' : 'bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/10 dark:border-emerald-500/20 text-emerald-900 dark:text-emerald-100 rounded-bl-none shadow-sm dark:shadow-none'}`}>
                      <div className="flex items-center justify-between mb-1.5 opacity-50">
                        <div className="flex items-center gap-2">
                          {m.role === 'user' ? <User size={12} /> : <Bot size={12} />}
                          <span className="text-[10px] font-bold uppercase tracking-wider">{m.role === 'user' ? 'אני' : 'BSD-AI Assistant'}</span>
                        </div>
                        {m.role === 'model' && (
                          <button 
                            onClick={() => handleSaveNote(m.content)}
                            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-emerald-500/20 rounded transition-all"
                            title="שמור כהערה"
                          >
                            <Save size={12} />
                          </button>
                        )}
                      </div>
                      {m.content}
                    </div>
                  </div>
                ))}
                {isChatting && (
                  <div className="flex justify-end">
                    <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/10 dark:border-emerald-500/20 p-4 rounded-2xl rounded-bl-none">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400" />
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>
            </div>

            <form onSubmit={handleSendMessage} className="p-6 pt-0 relative flex gap-2">
              <button type="button" className="p-3 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded-xl text-slate-400 dark:text-slate-500 transition-colors shadow-sm dark:shadow-none">
                <Paperclip size={18} />
              </button>
              <div className="relative flex-1">
                <input
                  placeholder="כתוב הודעה או בקש יומן עבודה..."
                  className="w-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-3 pr-4 pl-12 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-slate-900 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-600 shadow-sm dark:shadow-none"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                />
                <button 
                  disabled={isChatting || !input.trim()}
                  className="absolute left-2 top-2 p-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-600 rounded-lg text-white dark:text-slate-950 transition-all shadow-lg"
                >
                  <Send size={16} />
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
