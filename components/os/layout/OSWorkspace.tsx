"use client";

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, BarChart3, Users, ScanLine, Sparkles, Package, FilePlus, FileText } from 'lucide-react';
import { useSession } from 'next-auth/react';
import AdaptiveWidgetShell from '@/components/os/AdaptiveWidgetShell';
import ProjectWidget from '@/components/os/ProjectWidget';
import CashflowWidget from '@/components/os/widgets/CashflowWidget';
import AiChatWidget from '@/components/os/AiChatWidget';
import CrmWidget from '@/components/os/CrmWidget';
import DashboardWidget from '@/components/os/DashboardWidget';
import ErpDocumentsWidget from '@/components/os/widgets/ErpDocumentsWidget';

// New Advanced Widgets
import ProjectBoardWidget from '@/components/os/widgets/ProjectBoardWidget';
import CrmTableWidget from '@/components/os/widgets/CrmTableWidget';
import ErpFileArchiveWidget from '@/components/os/widgets/ErpFileArchiveWidget';
import DocumentCreatorWidget from '@/components/os/widgets/DocumentCreatorWidget';
import AiScannerWidget from '@/components/os/widgets/AiScannerWidget';
import AiChatFullWidget from '@/components/os/widgets/AiChatFullWidget';
import SettingsWidget from '@/components/os/widgets/SettingsWidget';
import MeckanoReportsWidget from '@/components/os/widgets/MeckanoReportsWidget';

import { ActiveWidget, WidgetType } from '@/hooks/use-window-manager';

interface OSWorkspaceProps {
  widgets: ActiveWidget[];
  hasHydrated: boolean;
  openWidget: (type: WidgetType) => void;
  closeWidget: (id: string) => void;
  focusWidget: (id: string) => void;
  updateWidgetPosition: (id: string, pos: { x: number; y: number }) => void;
  updateWidgetSize: (id: string, size: { width: number; height: number }) => void;
  toggleMaximize: (id: string) => void;
  updateZoom: (id: string, delta: number) => void;
}

const widgetTitles: Record<WidgetType, string> = {
  project: 'ישות מאוחדת: פרויקט',
  cashflow: 'תזרים מזומנים',
  aiChat: 'עוזר AI חכם',
  crm: 'ניהול לקוחות CRM',
  dashboard: 'דאשבורד פיננסי',
  erp: 'ארכיון ERP וניהול פריטים',
  docCreator: 'יוצר מסמכים חכם',
  aiScanner: 'סורק חשבוניות AI',
  projectBoard: 'לוח ניהול פרויקטים',
  crmTable: 'טבלת לקוחות מתקדמת',
  erpArchive: 'ארכיון קבצים ERP',
  aiChatFull: 'צ&apos;אט AI מלא',
  settings: 'הגדרות מערכת',
  meckanoReports: 'מחולל דוחות Meckano',
  quoteGen: 'מחולל הצעות מחיר',
};

export default function OSWorkspace({
  widgets,
  hasHydrated,
  openWidget,
  closeWidget,
  focusWidget,
  updateWidgetPosition,
  updateWidgetSize,
  toggleMaximize,
  updateZoom
}: OSWorkspaceProps) {
  const { data: session } = useSession();
  const [greeting, setGreeting] = React.useState('שלום');

  const userName = session?.user?.name?.split(' ')[0] || 'יוחנן';

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && widgets.length > 0) {
        // Find the widget with the highest zIndex (the focused one)
        const topWidget = [...widgets].sort((a, b) => {
          // Maximized widgets always come first
          if (a.isMaximized && !b.isMaximized) return -1;
          if (!a.isMaximized && b.isMaximized) return 1;
          return b.zIndex - a.zIndex;
        })[0];
        
        if (topWidget) {
          closeWidget(topWidget.id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [widgets, closeWidget]);

  React.useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 5) setGreeting('לילה טוב');
    else if (hour < 12) setGreeting('בוקר טוב');
    else if (hour < 18) setGreeting('צהריים טובים');
    else setGreeting('ערב טוב');
  }, []);

  return (
    <div className="flex-1 relative overflow-hidden">
      {/* Empty State */}
      <AnimatePresence mode="wait">
        {hasHydrated && widgets.length === 0 && (
          <motion.section 
            key="empty-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-0 flex flex-col items-center justify-center p-8 pointer-events-none"
          >
            <div className="mb-8 relative">
               <div className="w-20 h-20 rounded-full border border-slate-200 dark:border-white/[0.05] flex items-center justify-center relative bg-white dark:bg-white/[0.02]">
                  <div className="absolute inset-0 rounded-full border border-emerald-500/10 animate-pulse" />
                  <div className="w-16 h-16 rounded-full border border-slate-200 dark:border-white/[0.05] flex items-center justify-center bg-white dark:bg-slate-900 shadow-2xl">
                     <Bot size={28} className="text-emerald-500/50" />
                  </div>
               </div>
            </div>

            <h1 className="text-4xl md:text-7xl font-black text-[color:var(--foreground-main)] mb-4 tracking-tighter flex items-center gap-4 drop-shadow-sm px-4 text-center">
              {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 via-emerald-700 to-teal-700 dark:from-indigo-400 dark:via-emerald-400 dark:to-teal-500">{userName}</span>
            </h1>
            
            <p className="text-[color:var(--foreground-muted)] text-base md:text-lg max-w-xl mx-auto mb-12 text-center leading-relaxed font-semibold px-4">
              מערכת BSD-YBM-OS מוכנה לעבודה. בחר פעולה מהירה או השתמש בעוזר הקולי ב-Omnibar.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 w-full max-w-3xl pointer-events-auto px-4 md:px-0">
              <button onClick={() => openWidget('projectBoard')} className="flex items-center gap-4 p-4 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl hover:bg-[color:var(--surface-card)]/80 transition-all text-right group shadow-sm dark:shadow-none">
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                  <BarChart3 size={24} />
                </div>
                <div>
                  <div className="font-bold text-[color:var(--foreground-main)] text-sm">לוח פרויקטים</div>
                  <div className="text-[10px] text-[color:var(--foreground-muted)]">ניהול משימות וסטטוס</div>
                </div>
              </button>

              <button onClick={() => openWidget('crmTable')} className="flex items-center gap-4 p-4 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl hover:bg-[color:var(--surface-card)]/80 transition-all text-right group shadow-sm dark:shadow-none">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                  <Users size={24} />
                </div>
                <div>
                  <div className="font-bold text-[color:var(--foreground-main)] text-sm">ניהול לקוחות</div>
                  <div className="text-[10px] text-[color:var(--foreground-muted)]">מאגר CRM מתקדם</div>
                </div>
              </button>

              <button onClick={() => openWidget('erpArchive')} className="flex items-center gap-4 p-4 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl hover:bg-[color:var(--surface-card)]/80 transition-all text-right group shadow-sm dark:shadow-none">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
                  <Package size={24} />
                </div>
                <div>
                  <div className="font-bold text-[color:var(--foreground-main)] text-sm">ארכיון ERP</div>
                  <div className="text-[10px] text-[color:var(--foreground-muted)]">ניהול קבצים ומסמכים</div>
                </div>
              </button>

              <button onClick={() => openWidget('docCreator')} className="flex items-center gap-4 p-4 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl hover:bg-[color:var(--surface-card)]/80 transition-all text-right group shadow-sm dark:shadow-none">
                <div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
                  <FilePlus size={24} />
                </div>
                <div>
                  <div className="font-bold text-[color:var(--foreground-main)] text-sm">הפקת מסמכים</div>
                  <div className="text-[10px] text-[color:var(--foreground-muted)]">הצעות וחשבוניות</div>
                </div>
              </button>

              <button onClick={() => openWidget('aiScanner')} className="flex items-center gap-4 p-4 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl hover:bg-[color:var(--surface-card)]/80 transition-all text-right group shadow-sm dark:shadow-none">
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform">
                  <ScanLine size={24} />
                </div>
                <div>
                  <div className="font-bold text-[color:var(--foreground-main)] text-sm">סריקת AI</div>
                  <div className="text-[10px] text-[color:var(--foreground-muted)]">פענוח מסמכים חכם</div>
                </div>
              </button>

              <button onClick={() => openWidget('aiChatFull')} className="flex items-center gap-4 p-4 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl hover:bg-[color:var(--surface-card)]/80 transition-all text-right group shadow-sm dark:shadow-none">
                <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
                  <Sparkles size={24} />
                </div>
                <div>
                  <div className="font-bold text-[color:var(--foreground-main)] text-sm">צ&apos;אט AI מלא</div>
                  <div className="text-[10px] text-[color:var(--foreground-muted)]">עוזר אישי לניהול</div>
                </div>
              </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      {/* Widgets Layer */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        {widgets.map(widget => (
          <AdaptiveWidgetShell
            key={widget.id}
            id={widget.id} 
            title={widgetTitles[widget.type]}
            onClose={() => closeWidget(widget.id)}
            initialOffset={widget.position} 
            size={widget.size} 
            zIndex={widget.zIndex}
            isMaximized={widget.isMaximized}
            zoom={widget.zoom}
            onFocus={() => focusWidget(widget.id)}
            onPositionChange={(pos) => updateWidgetPosition(widget.id, pos)}
            onResize={(s) => updateWidgetSize(widget.id, s)}
            onMaximize={() => toggleMaximize(widget.id)}
            onZoomChange={(delta) => updateZoom(widget.id, delta)}
          >
            {widget.type === 'project' && <ProjectWidget projectName={widget.liveData?.name || 'Search'} />}
            {widget.type === 'crm' && <CrmWidget />}
            {widget.type === 'dashboard' && <DashboardWidget />}
            {widget.type === 'aiChat' && <AiChatWidget {...widget.liveData} />}
            {widget.type === 'cashflow' && <CashflowWidget data={widget.liveData} />}
            {widget.type === 'erp' && <ErpDocumentsWidget />}
            
            {/* New Advanced Widgets */}
            {widget.type === 'projectBoard' && <ProjectBoardWidget />}
            {widget.type === 'crmTable' && <CrmTableWidget />}
            {widget.type === 'erpArchive' && <ErpFileArchiveWidget />}
            {widget.type === 'docCreator' && <DocumentCreatorWidget />}
            {widget.type === 'aiScanner' && <AiScannerWidget />}
            {widget.type === 'aiChatFull' && <AiChatFullWidget />}
            {widget.type === 'settings' && <SettingsWidget />}
            {widget.type === 'meckanoReports' && <MeckanoReportsWidget />}
          </AdaptiveWidgetShell>
        ))}
      </div>
    </div>
  );
}
