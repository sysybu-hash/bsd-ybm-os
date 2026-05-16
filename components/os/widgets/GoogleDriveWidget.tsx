"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useState, useEffect } from 'react';
import { 
  HardDrive, 
  Folder, 
  File, 
  Search, 
  Upload, 
  RefreshCw, 
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  MoreVertical,
  Download,
  Trash2,
  FileText,
  Image as ImageIcon,
  FileCode,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface GoogleFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink: string;
}

export default function GoogleDriveWidget() {
  const { dir } = useI18n();
  const [files, setFiles] = useState<GoogleFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [folderPath, setFolderPath] = useState<{id: string, name: string}[]>([{id: 'root', name: 'My Drive'}]);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [reauthUrl, setReauthUrl] = useState<string | null>(null);

  const fetchFiles = async (folderId: string = 'root') => {
    setLoading(true);
    setDriveError(null);
    setReauthUrl(null);
    try {
      const res = await fetch(`/api/os/google-drive/files?folderId=${folderId}`);
      const data = await res.json();
      if (res.ok) {
        setFiles(data.files ?? []);
      } else {
        const msg = typeof data.error === 'string' ? data.error : 'שגיאה בטעינת קבצים';
        setDriveError(msg);
        if (typeof data.reauthUrl === 'string') {
          setReauthUrl(data.reauthUrl);
        }
        throw new Error(msg);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'שגיאה בטעינת קבצים';
      if (!driveError) setDriveError(message);
      toast.error('שגיאה בטעינת קבצים: ' + message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles(currentFolderId);
  }, [currentFolderId]);

  const handleFolderClick = (folder: GoogleFile) => {
    if (folder.mimeType === 'application/vnd.google-apps.folder') {
      setCurrentFolderId(folder.id);
      setFolderPath(prev => [...prev, {id: folder.id, name: folder.name}]);
    }
  };

  const navigateToFolder = (index: number) => {
    const newPath = folderPath.slice(0, index + 1);
    setFolderPath(newPath);
    setCurrentFolderId(newPath[newPath.length - 1].id);
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType === 'application/vnd.google-apps.folder') return <Folder className="text-amber-500" size={20} />;
    if (mimeType.includes('pdf')) return <FileText className="text-rose-500" size={20} />;
    if (mimeType.includes('image')) return <ImageIcon className="text-emerald-500" size={20} />;
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileText className="text-green-600" size={20} />;
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return <FileText className="text-orange-500" size={20} />;
    if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html')) return <FileCode className="text-blue-500" size={20} />;
    return <File className="text-slate-400" size={20} />;
  };

  const filteredFiles = files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-[color:var(--background-main)] text-[color:var(--foreground-main)]" dir={dir}>
      {/* Header */}
      <div className="p-4 border-b border-[color:var(--border-main)] flex items-center justify-between bg-[color:var(--background-main)]/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
            <HardDrive size={24} />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-widest">Google Drive</h3>
            <div className="flex items-center gap-1 text-[10px] text-[color:var(--foreground-muted)] font-bold">
              {folderPath.map((folder, i) => (
                <React.Fragment key={folder.id}>
                  <button 
                    onClick={() => navigateToFolder(i)}
                    className="hover:text-[color:var(--foreground-main)] transition-colors"
                  >
                    {folder.name}
                  </button>
                  {i < folderPath.length - 1 && <ChevronLeft size={10} />}
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => fetchFiles(currentFolderId)}
            className="p-2 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg text-[color:var(--foreground-muted)] transition-all"
            title="רענן"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-900/20 transition-all">
            <Upload size={14} /> העלה קובץ
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="p-4 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/30">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]" size={16} />
          <input 
            type="text"
            placeholder="חפש בדרייב..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-2.5 pr-10 pl-4 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)]"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {driveError && !loading ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-4">
            <p className="text-sm font-bold text-rose-500 max-w-md leading-relaxed">{driveError}</p>
            {reauthUrl ? (
              <a
                href={reauthUrl}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black shadow-lg transition-all"
              >
                התחברות מחדש עם Google
              </a>
            ) : null}
          </div>
        ) : loading ? (
          <div className="h-full flex flex-col items-center justify-center opacity-40">
            <Loader2 size={40} className="text-blue-600 animate-spin mb-4" />
            <p className="text-sm font-bold uppercase tracking-widest">טוען קבצים...</p>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center opacity-40 p-8">
            <div className="w-20 h-20 rounded-full bg-slate-500/10 flex items-center justify-center mb-6">
              <Folder size={40} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-bold mb-2">לא נמצאו קבצים</h3>
            <p className="text-xs text-[color:var(--foreground-muted)] max-w-xs leading-relaxed font-medium">התיקייה ריקה או שלא נמצאו קבצים התואמים לחיפוש שלך.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 divide-y divide-[color:var(--border-main)]">
            {filteredFiles.map((file) => (
              <div 
                key={file.id} 
                className="group flex items-center justify-between p-4 hover:bg-[color:var(--foreground-muted)]/5 transition-all cursor-pointer"
                onClick={() => file.mimeType === 'application/vnd.google-apps.folder' ? handleFolderClick(file) : window.open(file.webViewLink, '_blank')}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-10 h-10 rounded-lg bg-[color:var(--surface-card)] border border-[color:var(--border-main)] flex items-center justify-center shadow-sm">
                    {getFileIcon(file.mimeType)}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold truncate group-hover:text-blue-500 transition-colors">{file.name}</h4>
                    <p className="text-[10px] text-[color:var(--foreground-muted)] font-mono uppercase tracking-tighter">
                      {file.mimeType === 'application/vnd.google-apps.folder' ? 'תיקייה' : file.mimeType.split('/').pop()?.toUpperCase()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => { e.stopPropagation(); window.open(file.webViewLink, '_blank'); }}
                    className="p-2 hover:bg-blue-500/10 rounded-lg text-blue-600 transition-all"
                    title="פתח ב-Google Drive"
                  >
                    <ExternalLink size={16} />
                  </button>
                  <button className="p-2 hover:bg-slate-500/10 rounded-lg text-slate-400 transition-all">
                    <MoreVertical size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/30 flex items-center justify-between text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest">
        <div className="flex gap-4">
          <span>{filteredFiles.length} פריטים</span>
          <span>•</span>
          <span>עודכן לאחרונה: {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
        <div className={`flex items-center gap-1 ${driveError ? "text-rose-500" : "text-emerald-500"}`}>
          <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${driveError ? "bg-rose-500" : "bg-emerald-500"}`} />
          {driveError ? "נדרש חיבור Google" : "מחובר ל-Google"}
        </div>
      </div>
    </div>
  );
}
