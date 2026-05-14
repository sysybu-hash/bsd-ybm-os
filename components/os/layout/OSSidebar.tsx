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
          className="md:hidden fixed inset-0 bg-black/50 z-[990] backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}
      
      <motion.aside 
        initial={{ x: 100, opacity: 0 }}
        animate={{ 
          x: 0, 
          opacity: 1,
        }}
        className={`fixed right-0 md:right-6 top-16 md:top-24 bottom-0 md:bottom-32 w-20 md:w-16 flex flex-col items-center py-6 bg-[color:var(--glass-bg)] border-l md:border border-[color:var(--border-main)] md:rounded-2xl backdrop-blur-xl z-[1000] shadow-2xl transition-transform duration-300 ${isOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}`}
      >
        <div className="flex-1 flex flex-col gap-4 overflow-y-auto no-scrollbar w-full items-center">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => openWidget(item.type)}
              className="group relative w-12 h-12 md:w-10 md:h-10 flex items-center justify-center rounded-xl hover:bg-[color:var(--foreground-muted)]/10 transition-all"
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

        <div className="flex flex-col gap-4 border-t border-[color:var(--border-main)]/30 pt-6 mt-4 w-full items-center">
          <button 
            onClick={() => openWidget('settings')}
            className="group relative w-12 h-12 md:w-10 md:h-10 flex items-center justify-center rounded-xl hover:bg-[color:var(--foreground-muted)]/10 transition-all text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
          >
            <Settings size={20} />
            <div className="hidden md:block absolute right-14 px-2 py-1 bg-[color:var(--background-main)] border border-[color:var(--border-main)] rounded text-[10px] font-bold text-[color:var(--foreground-main)] opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
              הגדרות
            </div>
          </button>
          <button 
            onClick={() => openWidget('aiChatFull')}
            className="group relative w-12 h-12 md:w-10 md:h-10 flex items-center justify-center rounded-xl hover:bg-[color:var(--foreground-muted)]/10 transition-all text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
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
