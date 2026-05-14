"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { 
  LayoutDashboard, 
  BarChart3, 
  Users, 
  Package, 
  FilePlus, 
  ScanLine, 
  Sparkles,
  Settings,
  HelpCircle,
  FileText
} from 'lucide-react';
import { WidgetType } from '@/hooks/use-window-manager';

interface OSSidebarProps {
  openWidget: (type: WidgetType) => void;
  isOpen?: boolean;
  closeSidebar?: () => void;
}

const navItems = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'דאשבורד', type: 'dashboard' as WidgetType, color: 'text-blue-400' },
  { id: 'project', icon: BarChart3, label: 'פרויקטים', type: 'project' as WidgetType, color: 'text-indigo-400' },
  { id: 'crm', icon: Users, label: 'לקוחות', type: 'crm' as WidgetType, color: 'text-emerald-400' },
  { id: 'erp', icon: Package, label: 'ארכיון ERP', type: 'erp' as WidgetType, color: 'text-amber-400' },
  { id: 'docCreator', icon: FilePlus, label: 'מסמכים', type: 'docCreator' as WidgetType, color: 'text-rose-400' },
  { id: 'aiScanner', icon: ScanLine, label: 'סורק AI', type: 'aiScanner' as WidgetType, color: 'text-orange-400' },
  { id: 'aiChat', icon: Sparkles, label: 'צ\'אט AI', type: 'aiChatFull' as WidgetType, color: 'text-purple-400' },
  { id: 'meckanoReports', icon: FileText, label: 'דוחות מקאנו', type: 'meckanoReports' as WidgetType, color: 'text-indigo-400' },
];

export default function OSSidebar({ openWidget, isOpen = false, closeSidebar }: OSSidebarProps) {
  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-[1150] backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}
      
      <motion.aside 
        initial={{ x: 100, opacity: 0 }}
        animate={{ 
          x: 0, 
          opacity: 1,
        }}
        className={`fixed z-[1200] transition-transform duration-300 backdrop-blur-xl shadow-2xl bg-[color:var(--glass-bg)] border-[color:var(--border-main)]
          /* Mobile: Bottom Bar */
          bottom-0 left-0 right-0 w-full h-auto flex flex-row items-center py-3 px-4 border-t
          ${isOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
          
          /* Desktop: Right Sidebar */
          md:translate-y-0 md:right-6 md:top-24 md:bottom-32 md:w-16 md:flex-col md:py-6 md:border md:rounded-2xl md:left-auto md:h-auto
        `}
      >
        <div className="flex-1 flex flex-row md:flex-col gap-4 overflow-x-auto md:overflow-y-auto no-scrollbar w-full items-center justify-around md:justify-start">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => openWidget(item.type)}
              className="group relative flex-shrink-0 w-12 h-12 md:w-10 md:h-10 flex items-center justify-center rounded-xl hover:bg-[color:var(--foreground-muted)]/10 transition-all"
              title={item.label}
            >
              <item.icon size={20} className={`${item.color} group-hover:scale-110 transition-transform`} />
              
              {/* Tooltip */}
              <div className="hidden md:block absolute right-14 px-2 py-1 bg-[color:var(--background-main)] border border-[color:var(--border-main)] rounded text-[10px] font-bold text-[color:var(--foreground-main)] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                {item.label}
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-row md:flex-col gap-4 border-r md:border-r-0 md:border-t border-[color:var(--border-main)]/30 pr-4 md:pr-0 md:pt-6 ml-4 md:ml-0 md:mt-4 items-center">
          <button 
            onClick={() => openWidget('settings')}
            className="group relative flex-shrink-0 w-12 h-12 md:w-10 md:h-10 flex items-center justify-center rounded-xl hover:bg-[color:var(--foreground-muted)]/10 transition-all text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
          >
            <Settings size={20} />
            <div className="hidden md:block absolute right-14 px-2 py-1 bg-[color:var(--background-main)] border border-[color:var(--border-main)] rounded text-[10px] font-bold text-[color:var(--foreground-main)] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
              הגדרות
            </div>
          </button>
          <button 
            onClick={() => openWidget('aiChatFull')}
            className="group relative flex-shrink-0 w-12 h-12 md:w-10 md:h-10 flex items-center justify-center rounded-xl hover:bg-[color:var(--foreground-muted)]/10 transition-all text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
          >
            <HelpCircle size={20} />
            <div className="hidden md:block absolute right-14 px-2 py-1 bg-[color:var(--background-main)] border border-[color:var(--border-main)] rounded text-[10px] font-bold text-[color:var(--foreground-main)] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
              עזרה
            </div>
          </button>
        </div>
      </motion.aside>
    </>
  );
}
