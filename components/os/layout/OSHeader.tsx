"use client";

import React, { useEffect, useState } from 'react';
import { LogOut, Zap, Sun, Moon, Settings, Bell, Menu } from 'lucide-react';
import { signOut, useSession } from 'next-auth/react';
import { useTheme } from 'next-themes';
import Image from 'next/image';

interface OSHeaderProps {
  openWidget?: (type: any) => void;
  notificationsCount: number;
  isNotificationsOpen: boolean;
  toggleNotifications: () => void;
  toggleSidebar?: () => void;
}

export default function OSHeader({ 
  openWidget, 
  notificationsCount, 
  isNotificationsOpen, 
  toggleNotifications,
  toggleSidebar
}: OSHeaderProps) {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const userName = session?.user?.name || 'יוחנן בוקשפן';
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'YB';

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <header className="absolute top-0 left-0 right-0 h-16 flex items-center justify-between px-8 z-[1000] border-b border-[color:var(--border-main)] bg-[color:var(--glass-bg)] backdrop-blur-md pointer-events-auto transition-colors duration-500">
      <div className="flex items-center gap-4">
        {toggleSidebar && (
          <button 
            onClick={toggleSidebar}
            className="md:hidden p-2 rounded-lg bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/10 hover:text-[color:var(--foreground-main)] transition-all"
          >
            <Menu size={18} />
          </button>
        )}
        <nav className="flex items-center gap-6 text-[11px] font-black text-[color:var(--foreground-main)] uppercase tracking-[0.3em]">
          <div className="flex items-center gap-2 group cursor-default">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-xl shadow-indigo-600/30 group-hover:scale-110 transition-transform">
              <Zap size={18} className="text-white fill-white" />
            </div>
            <span className="font-black hidden sm:inline">BSD-YBM <span className="text-indigo-600 dark:text-indigo-400">OS</span></span>
          </div>
        </nav>
      </div>

      <div className="flex items-center gap-4">
         {mounted && (
           <div className="flex items-center gap-2">
             <button
               onClick={toggleNotifications}
               className={`p-2 rounded-lg border transition-all relative ${
                 isNotificationsOpen 
                   ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-500' 
                   : 'bg-[color:var(--surface-card)]/50 border-[color:var(--border-main)] text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/10 hover:text-[color:var(--foreground-main)]'
               }`}
               title="התראות"
             >
               <Bell size={14} />
               {notificationsCount > 0 && (
                 <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full flex items-center justify-center text-[8px] font-bold text-white border border-white dark:border-slate-900">
                   {notificationsCount}
                 </span>
               )}
             </button>

             <button
               onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
               className="p-2 rounded-lg bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] text-[color:var(--foreground-muted)] hover:bg-[color:var(--foreground-muted)]/10 hover:text-[color:var(--foreground-main)] transition-all"
               title="שינוי ערכת נושא"
             >
               {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
             </button>
           </div>
         )}

         {/* Integrated User Profile & Logout */}
         <div className="flex items-center gap-2 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] p-1 rounded-xl transition-all">
            <div 
              onClick={() => openWidget?.('settings')}
              className="flex items-center gap-3 pr-3 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg transition-all cursor-pointer group py-1"
            >
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[11px] font-bold text-[color:var(--foreground-main)] leading-tight">{userName}</span>
                <div className="flex items-center gap-1 mt-0.5">
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-[7px] font-medium text-[color:var(--foreground-muted)] uppercase tracking-wider">Online</span>
                </div>
              </div>
              <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-slate-800 to-slate-700 flex items-center justify-center text-[10px] font-bold text-white border border-white/10 relative overflow-hidden shadow-sm">
                {session?.user?.image ? (
                  <Image 
                    src={session.user.image} 
                    alt={userName} 
                    fill 
                    className="object-cover"
                  />
                ) : (
                  userInitials
                )}
                <div className="absolute inset-0 bg-indigo-600/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <Settings size={12} />
                </div>
              </div>
            </div>

            <div className="w-px h-6 bg-[color:var(--border-main)] mx-1" />

            <button 
              onClick={() => signOut({ callbackUrl: '/login' })} 
              className="p-2 hover:bg-rose-500/10 rounded-lg text-[color:var(--foreground-muted)] hover:text-rose-500 transition-all group"
              title="Logout"
            >
              <LogOut size={14} className="group-hover:scale-110 transition-transform" />
            </button>
         </div>
      </div>
    </header>
  );
}
