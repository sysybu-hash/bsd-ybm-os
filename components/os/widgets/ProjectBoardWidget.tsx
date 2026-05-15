"use client";

import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Plus, 
  MoreHorizontal, 
  Clock, 
  AlertCircle, 
  CheckCircle2,
  Filter,
  Search,
  User,
  X,
  Save,
  Building2,
  DollarSign
} from 'lucide-react';
import { toast } from 'sonner';

interface Contact {
  id: string;
  name: string;
}

interface Task {
  id: string;
  title: string;
  project: string;
  clientName: string;
  budget: number;
  status: 'todo' | 'in-progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate: string;
}

const initialTasks: Task[] = [];

const columns = [
  { id: 'todo', title: 'לביצוע', color: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' },
  { id: 'in-progress', title: 'בתהליך', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' },
  { id: 'review', title: 'בביקורת', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  { id: 'done', title: 'הושלם', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
];

export default function ProjectBoardWidget() {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingProject, setIsAddingProject] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [newProject, setNewProject] = useState({
    title: '',
    projectName: '',
    contactId: '',
    budget: 0,
    dueDate: new Date().toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchContacts();
    fetchTasks();
  }, []);

  const fetchContacts = async () => {
    try {
      const res = await fetch('/api/data?type=clients');
      const data = await res.json();
      setContacts(data.map((c: any) => ({
        id: c.id,
        name: c.name
      })));
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    }
  };

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/projects/update');
      const data = await res.json();
      if (Array.isArray(data)) {
        setTasks(data);
      }
    } catch (error) {
      console.error('Failed to fetch tasks:', error);
    }
  };

  const handleAddProject = async () => {
    const contact = contacts.find(c => c.id === newProject.contactId);
    if (!newProject.title || !newProject.projectName || !contact) {
      toast.error('אנא מלא את כל שדות החובה');
      return;
    }

    const newTask: Task = {
      id: Date.now().toString(),
      title: newProject.title,
      project: newProject.projectName,
      clientName: contact.name,
      budget: newProject.budget,
      status: 'todo',
      priority: 'medium',
      dueDate: newProject.dueDate
    };

    setTasks([newTask, ...tasks]);
    setIsAddingProject(false);
    setNewProject({ title: '', projectName: '', contactId: '', budget: 0, dueDate: new Date().toISOString().split('T')[0] });
    
    // Sync to DB
    try {
      const res = await fetch('/api/projects/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask)
      });
      const data = await res.json();
      if (data.success && data.task) {
        // Update the local task with the real DB ID
        setTasks(prev => prev.map(t => t.id === newTask.id ? { ...t, id: data.task.id } : t));
        toast.success('פרויקט חדש נוסף וסונכרן ל-DB');
      }
    } catch (err) {
      console.error("Sync failed:", err);
      toast.error('הפרויקט נוסף מקומית אך הסנכרון נכשל');
    }
  };

  const updateTaskStatus = async (taskId: string, newStatus: Task['status']) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t);
    setTasks(updatedTasks);

    try {
      await fetch('/api/projects/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, status: newStatus })
      });
      toast.success('סטטוס המשימה עודכן וסונכרן');
    } catch (err) {
      toast.error('עדכון הסטטוס נכשל בסנכרון');
    }
  };

  const updateTaskBudget = async (taskId: string, newBudget: number) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, budget: newBudget } : t);
    setTasks(updatedTasks);

    try {
      await fetch('/api/projects/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...task, budget: newBudget })
      });
      toast.success('תקציב המשימה עודכן וסונכרן');
    } catch (err) {
      toast.error('עדכון התקציב נכשל בסנכרון');
    }
  };

  const filteredTasks = tasks.filter(t => 
    t.title.includes(searchQuery) || t.project.includes(searchQuery) || t.clientName.includes(searchQuery)
  );

  return (
    <div className="flex flex-col h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="p-4 md:p-6 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <BarChart3 size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold">לוח ניהול פרויקטים</h2>
            <p className="text-xs text-[color:var(--foreground-muted)]">ניהול משימות, תקציבים וסנכרון לקוחות CRM</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 md:gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-auto">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" size={16} />
            <input 
              type="text"
              placeholder="חיפוש משימה, פרויקט או לקוח..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl py-2 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 w-full md:w-64 text-slate-900 dark:text-slate-200"
            />
          </div>
          <button 
            onClick={() => setIsAddingProject(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 w-full md:w-auto justify-center"
          >
            <Plus size={18} /> משימה חדשה
          </button>
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6 flex gap-6 custom-scrollbar relative">
        {isAddingProject && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-6">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-[2.5rem] p-8 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                  <Plus className="text-indigo-600 dark:text-indigo-400" size={24} /> פרויקט / משימה חדשה
                </h3>
                <button onClick={() => setIsAddingProject(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full text-slate-500 transition-all">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4 mb-8">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">תיאור המשימה</label>
                  <input 
                    placeholder="לדוגמה: התקנת תשתיות אינסטלציה"
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-slate-900 dark:text-slate-200"
                    value={newProject.title}
                    onChange={(e) => setNewProject({...newProject, title: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">שם הפרויקט</label>
                  <input 
                    placeholder="לדוגמה: וילה הרצליה פיתוח"
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-slate-900 dark:text-slate-200"
                    value={newProject.projectName}
                    onChange={(e) => setNewProject({...newProject, projectName: e.target.value})}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">בחירת לקוח (מה-CRM)</label>
                  <select 
                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 appearance-none text-slate-900 dark:text-slate-200"
                    value={newProject.contactId}
                    onChange={(e) => setNewProject({...newProject, contactId: e.target.value})}
                  >
                    <option value="">בחר לקוח...</option>
                    {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">תקציב (₪)</label>
                    <input 
                      type="number"
                      inputMode="decimal"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-slate-900 dark:text-slate-200"
                      value={newProject.budget}
                      onChange={(e) => setNewProject({...newProject, budget: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">תאריך יעד</label>
                    <input 
                      type="date"
                      className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-slate-900 dark:text-slate-200"
                      value={newProject.dueDate}
                      onChange={(e) => setNewProject({...newProject, dueDate: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={handleAddProject}
                  className="flex-1 h-12 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-xl transition-all flex items-center justify-center gap-2"
                >
                  <Save size={18} /> שמור משימה
                </button>
              </div>
            </div>
          </div>
        )}

        {columns.map(column => (
          <div key={column.id} className="flex-shrink-0 w-72 flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${column.color}`}>
                  {column.title}
                </span>
                <span className="text-xs text-slate-500 font-bold">
                  {filteredTasks.filter(t => t.status === column.id).length}
                </span>
              </div>
              <button className="text-slate-400 dark:text-slate-600 hover:text-slate-900 dark:hover:text-slate-400 transition-colors">
                <MoreHorizontal size={16} />
              </button>
            </div>

            <div className="flex-1 flex flex-col gap-3">
              {filteredTasks.filter(t => t.status === column.id).map(task => (
                <div 
                  key={task.id}
                  className="bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl p-4 hover:bg-[color:var(--surface-card)]/80 transition-all cursor-pointer group shadow-sm dark:shadow-none"
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                      task.priority === 'high' ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400' :
                      task.priority === 'medium' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' :
                      'bg-[color:var(--foreground-muted)]/20 text-[color:var(--foreground-muted)]'
                    }`}>
                      {task.priority}
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-bold text-[color:var(--foreground-muted)]">₪</span>
                      <input 
                        type="number"
                        inputMode="decimal"
                        defaultValue={task.budget}
                        onBlur={(e) => updateTaskBudget(task.id, parseFloat(e.target.value))}
                        className="w-16 bg-transparent border-none text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold focus:ring-0 p-0 text-left"
                      />
                    </div>
                  </div>
                  
                  <h4 className="text-sm font-bold text-[color:var(--foreground-main)] mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{task.title}</h4>
                  
                  <div className="flex items-center gap-2 mb-3">
                    <select 
                      value={task.status}
                      onChange={(e) => updateTaskStatus(task.id, e.target.value as any)}
                      className="bg-[color:var(--surface-card)] border border-[color:var(--border-main)] rounded-lg px-2 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)] outline-none focus:ring-1 focus:ring-indigo-500/50"
                    >
                      {columns.map(col => (
                        <option key={col.id} value={col.id}>{col.title}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-0.5 mb-4">
                    <p className="text-[11px] text-[color:var(--foreground-muted)] font-bold">{task.project}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-[color:var(--foreground-muted)] opacity-80">
                      <User size={10} /> {task.clientName}
                    </div>
                  </div>

                  <div className="flex justify-between items-center border-t border-[color:var(--border-main)]/30 pt-3">
                    <div className="flex items-center gap-1.5 text-[color:var(--foreground-muted)]">
                      <Clock size={12} />
                      <span className="text-[10px] font-medium">{new Date(task.dueDate).toLocaleDateString('he-IL')}</span>
                    </div>
                    <div className="flex -space-x-2 rtl:space-x-reverse">
                      <div className="w-6 h-6 rounded-full bg-indigo-600 border border-white dark:border-slate-900 flex items-center justify-center text-[10px] font-bold text-white">YB</div>
                    </div>
                  </div>
                </div>
              ))}
              
              <button 
                onClick={() => setIsAddingProject(true)}
                className="w-full py-3 border-2 border-dashed border-[color:var(--border-main)] rounded-2xl text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] hover:border-[color:var(--foreground-muted)] transition-all text-xs font-bold flex items-center justify-center gap-2"
              >
                <Plus size={14} /> הוסף כרטיס
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
