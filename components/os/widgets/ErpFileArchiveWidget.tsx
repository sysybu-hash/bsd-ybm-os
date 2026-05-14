"use client";

import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Search, 
  Folder, 
  FileText, 
  MoreVertical, 
  Grid, 
  List, 
  ArrowUpRight,
  Download,
  Trash2,
  ChevronRight,
  Filter,
  Clock,
  HardDrive
} from 'lucide-react';
import { toast } from 'sonner';

interface FileItem {
  id: string;
  name: string;
  type: 'invoice' | 'quote' | 'contract' | 'other' | 'SIGNED_QUOTE';
  size: string;
  updatedAt: string;
  project: string;
}

const initialFiles: FileItem[] = [
  { id: '1', name: 'חשבונית_חומרי_בניין_מאי.pdf', type: 'invoice', size: '1.2 MB', updatedAt: '2026-05-12', project: 'וילה הרצליה' },
  { id: '2', name: 'הצעת_מחיר_מערכות_מיזוג.pdf', type: 'quote', size: '850 KB', updatedAt: '2026-05-10', project: 'פרויקט רמת גן' },
  { id: '3', name: 'חוזה_קבלן_משנה_אינסטלציה.pdf', type: 'contract', size: '2.4 MB', updatedAt: '2026-05-08', project: 'מגדלי תל אביב' },
  { id: '4', name: 'קבלה_ביטוח_עבודות.pdf', type: 'invoice', size: '420 KB', updatedAt: '2026-05-05', project: 'וילה הרצליה' },
  { id: '5', name: 'תעודת_משלוח_בטון.pdf', type: 'other', size: '310 KB', updatedAt: '2026-05-01', project: 'פרויקט רמת גן' },
];

export default function ErpFileArchiveWidget() {
  const [files, setFiles] = useState<FileItem[]>(initialFiles);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'invoice' | 'quote' | 'contract' | 'SIGNED_QUOTE'>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/erp/documents');
      const data = await res.json();
      if (data.documents) {
        const dbFiles = data.documents.map((doc: any) => ({
          id: doc.id,
          name: doc.fileName,
          type: doc.type === 'SIGNED_QUOTE' ? 'SIGNED_QUOTE' : (doc.type.toLowerCase() || 'other'),
          size: 'N/A',
          updatedAt: doc.createdAt,
          project: doc.aiData?.projectName || 'כללי'
        }));
        setFiles([...initialFiles, ...dbFiles]);
      }
    } catch (err) {
      console.error("Failed to fetch ERP files:", err);
      toast.error("שגיאה בטעינת קבצי הארכיון");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredFiles = files.filter(f => {
    const matchesSearch = f.name.includes(searchQuery) || f.project.includes(searchQuery);
    const matchesType = selectedType === 'all' || f.type === selectedType;
    return matchesSearch && matchesType;
  });

  return (
    <div className="flex flex-col md:flex-row h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir="rtl">
      {/* Side Navigation */}
      <div className="hidden md:flex w-64 border-l border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex-col">
        <div className="p-6">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-8">
            <HardDrive size={20} />
            <span className="font-black text-sm uppercase tracking-widest">ERP Storage</span>
          </div>

          <nav className="space-y-1">
            <button 
              onClick={() => setSelectedType('all')}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl transition-all ${selectedType === 'all' ? 'bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-main)] font-bold shadow-sm border border-[color:var(--border-main)]' : 'text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/5'}`}
            >
              <Folder size={16} className="text-amber-600 dark:text-amber-400" /> הכל
            </button>
            <button 
              onClick={() => setSelectedType('SIGNED_QUOTE')}
              className={`w-full flex items-center gap-3 px-4 py-2 rounded-xl transition-all ${selectedType === 'SIGNED_QUOTE' ? 'bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-main)] font-bold shadow-sm border border-[color:var(--border-main)]' : 'text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/5'}`}
            >
              <FileText size={16} className="text-emerald-500" /> מסמכים חתומים
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-[color:var(--foreground-muted)]/5 text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] text-sm font-medium transition-all">
              <Clock size={16} /> אחרונים
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-[color:var(--foreground-muted)]/5 text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] text-sm font-medium transition-all">
              <ArrowUpRight size={16} /> שותפו איתי
            </button>
            <button className="w-full flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-[color:var(--foreground-muted)]/5 text-[color:var(--foreground-muted)] hover:text-rose-600 dark:hover:text-rose-400 transition-all">
              <Trash2 size={16} /> פח אשפה
            </button>
          </nav>

          <div className="mt-12">
            <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest px-4 block mb-4">פרויקטים</span>
            <div className="space-y-1">
              {['וילה הרצליה', 'פרויקט רמת גן', 'מגדלי תל אביב'].map(p => (
                <button key={p} className="w-full flex items-center gap-3 px-4 py-2 rounded-xl hover:bg-[color:var(--foreground-muted)]/5 text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] text-xs font-bold transition-all truncate">
                  <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--foreground-muted)] opacity-50" /> {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-auto p-6 border-t border-[color:var(--border-main)]">
          <div className="flex justify-between items-center mb-2">
            <span className="text-[10px] font-bold text-[color:var(--foreground-muted)]">נפח אחסון</span>
            <span className="text-[10px] font-bold text-[color:var(--foreground-main)] opacity-80">75%</span>
          </div>
          <div className="w-full h-1.5 bg-[color:var(--foreground-muted)]/20 rounded-full overflow-hidden">
            <div className="w-[75%] h-full bg-amber-500" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 md:p-6 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 md:gap-0">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 flex-1 w-full">
            <div className="relative w-full md:flex-1 md:max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]" size={16} />
              <input 
                type="text"
                placeholder="חיפוש מסמך, פרויקט או תוכן..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500/50 text-[color:var(--foreground-main)] shadow-sm dark:shadow-none"
              />
            </div>
            
            <div className="flex flex-wrap items-center gap-2 bg-[color:var(--background-main)]/50 p-1 rounded-xl border border-[color:var(--border-main)] w-full md:w-auto">
              {(['all', 'invoice', 'quote', 'contract', 'SIGNED_QUOTE'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedType(t)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                    selectedType === t ? 'bg-[color:var(--surface-card)]/80 text-[color:var(--foreground-main)] shadow-sm dark:shadow-lg' : 'text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]'
                  }`}
                >
                  {t === 'all' ? 'הכל' : t === 'invoice' ? 'חשבוניות' : t === 'quote' ? 'הצעות' : t === 'contract' ? 'חוזים' : 'חתומים'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 ml-4">
            <button 
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-[color:var(--foreground-muted)]/20 text-[color:var(--foreground-main)]' : 'text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]'}`}
            >
              <Grid size={18} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-[color:var(--foreground-muted)]/20 text-[color:var(--foreground-main)]' : 'text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]'}`}
            >
              <List size={18} />
            </button>
          </div>
        </div>

        {/* Files Area */}
        <div className="flex-1 overflow-auto custom-scrollbar p-6">
          {viewMode === 'list' ? (
            <div className="space-y-2 min-w-[600px]">
              <div className="grid grid-cols-12 px-4 py-2 text-[10px] font-black text-[color:var(--foreground-muted)] uppercase tracking-widest border-b border-[color:var(--border-main)]/30 mb-2">
                <div className="col-span-6">שם הקובץ</div>
                <div className="col-span-2 text-center">פרויקט</div>
                <div className="col-span-2 text-center">תאריך</div>
                <div className="col-span-1 text-center">גודל</div>
                <div className="col-span-1"></div>
              </div>
              {filteredFiles.map(file => (
                <div key={file.id} className="grid grid-cols-12 items-center px-4 py-3 bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80 border border-[color:var(--border-main)] rounded-xl transition-all group cursor-pointer shadow-sm dark:shadow-none">
                  <div className="col-span-6 flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${
                      file.type === 'invoice' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                      file.type === 'quote' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                      file.type === 'contract' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' :
                      file.type === 'SIGNED_QUOTE' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300' :
                      'bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-muted)]'
                    }`}>
                      <FileText size={16} />
                    </div>
                    <span className="text-sm font-bold text-[color:var(--foreground-main)] truncate group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">{file.name}</span>
                  </div>
                  <div className="col-span-2 text-center text-[11px] text-[color:var(--foreground-muted)] font-bold">{file.project}</div>
                  <div className="col-span-2 text-center text-[11px] text-[color:var(--foreground-muted)]">{new Date(file.updatedAt).toLocaleDateString('he-IL')}</div>
                  <div className="col-span-1 text-center text-[11px] text-[color:var(--foreground-muted)] opacity-70">{file.size}</div>
                  <div className="col-span-1 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-1.5 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] transition-all">
                      <Download size={14} />
                    </button>
                    <button className="p-1.5 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] transition-all">
                      <MoreVertical size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredFiles.map(file => (
                <div key={file.id} className="p-4 bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80 border border-[color:var(--border-main)] rounded-2xl transition-all group cursor-pointer flex flex-col items-center text-center shadow-sm dark:shadow-none">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
                    file.type === 'invoice' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                    file.type === 'quote' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                    file.type === 'contract' ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' :
                    file.type === 'SIGNED_QUOTE' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300' :
                    'bg-[color:var(--foreground-muted)]/10 text-[color:var(--foreground-muted)]'
                  }`}>
                    <FileText size={32} />
                  </div>
                  <div className="text-sm font-bold text-[color:var(--foreground-main)] truncate w-full mb-1 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">{file.name}</div>
                  <div className="text-[10px] text-[color:var(--foreground-muted)] font-bold uppercase tracking-wider">{file.project}</div>
                  <div className="mt-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button className="p-2 bg-[color:var(--foreground-muted)]/10 hover:bg-[color:var(--foreground-muted)]/20 rounded-xl text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] transition-all">
                      <Download size={14} />
                    </button>
                    <button className="p-2 bg-[color:var(--foreground-muted)]/10 hover:bg-[color:var(--foreground-muted)]/20 rounded-xl text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] transition-all">
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredFiles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 opacity-30">
              <Package size={48} className="text-[color:var(--foreground-muted)]" />
              <p className="mt-4 text-sm font-bold uppercase tracking-widest text-[color:var(--foreground-muted)]">הארכיון ריק</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
