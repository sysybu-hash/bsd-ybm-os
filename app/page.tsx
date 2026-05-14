"use client";

import React, { useState, useEffect } from 'react';
import { useWindowManager } from '@/hooks/use-window-manager';
import { useTheme } from 'next-themes';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { MECKANO_SUBSCRIBER_EMAIL } from '@/lib/meckano-access';

// OS Layout Components
import OSHeader from '@/components/os/layout/OSHeader';
import OSSidebar from '@/components/os/layout/OSSidebar';
import OSWorkspace from '@/components/os/layout/OSWorkspace';
import OSDock from '@/components/os/layout/OSDock';

// Landing Page
import LandingPage from '@/components/landing/LandingPage';

// OS Global Systems
import NotificationCenter, { OSNotification, OSNotificationAction } from '@/components/os/NotificationCenter';
import FileDropzone from '@/components/os/FileDropzone';

export default function OmniCanvas() {
  const { theme } = useTheme();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  
  const {
    widgets,
    hasHydrated,
    openWidget,
    closeWidget,
    focusWidget,
    updateWidgetPosition,
    updateWidgetSize,
    toggleMaximize,
    updateZoom,
    clearLayout,
    isFirstTime
  } = useWindowManager();

  const [notifications, setNotifications] = useState<OSNotification[]>([]);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [apiLatency, setApiLatency] = useState<number | null>(null);
  const [systemMessage, setSystemMessage] = useState('המערכת מוכנה');
  const [isBusy, setIsBusy] = useState(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [hasOpenedDefaults, setHasOpenedDefaults] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Poll for notifications
  useEffect(() => {
    setMounted(true);
    const fetchNotifications = async () => {
      try {
        const res = await fetch('/api/data?type=notifications');
        if (res.ok) {
          const data = await res.json();
          setNotifications(data);
        }
      } catch (err) {
        console.error("Failed to fetch notifications", err);
      }
    };

    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, []);

  // Default Layout for new sessions
  useEffect(() => {
    if (hasHydrated && session && widgets.length === 0 && isFirstTime && !hasOpenedDefaults) {
      setHasOpenedDefaults(true);
      // Open default widgets after a short delay to ensure everything is ready
      const timer = setTimeout(() => {
        openWidget('dashboard');
        setTimeout(() => openWidget('crmTable'), 300);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [hasHydrated, session, widgets.length, openWidget, hasOpenedDefaults, isFirstTime]);

  const handleSearchPreview = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&preview=true`);
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.results || []);
      }
    } catch (err) {
      console.error("Search preview failed", err);
    }
  };

  const handleSelectResult = (result: any) => {
    setSearchResults([]);
    if (result.type === 'project') {
      openWidget('project', { name: result.name });
      setSystemMessage(`נפתח פרויקט: ${result.name}`);
    } else if (result.type === 'contact') {
      openWidget('crmTable'); // Or a specific client view if we had one
      setSystemMessage(`נפתח לקוח: ${result.name}`);
    }
  };

  const handleCommand = async (command: string) => {
    const cmd = command.trim();
    if (!cmd) return;

    setSearchResults([]); // Clear preview on submit
    setIsBusy(true);
    setSystemMessage('מעבד פקודה...');

    try {
      if (cmd.match(/(דאשבורד|סטטוס|dashboard)/i)) {
        openWidget('dashboard');
        setSystemMessage('דאשבורד פיננסי נפתח');
      } else if (cmd.match(/(נקה|clear|reset|אפס|סידור)/i)) {
        clearLayout();
        setSystemMessage('סידור החלונות אופס');
      } else if (cmd.match(/(crm|לקוחות|ניהול לקוחות|פתח לקוחות)/i)) {
        openWidget('crmTable');
        setSystemMessage('ניהול לקוחות מתקדם נפתח');
      } else if (cmd.match(/(erp|ארכיון|מסמכים|חשבוניות|סייר)/i)) {
        openWidget('erpArchive');
        setSystemMessage('ארכיון ERP נפתח');
      } else if (cmd.match(/(פרויקטים|לוח|board|tasks|משימות|ניהול פרויקטים)/i)) {
        openWidget('projectBoard');
        setSystemMessage('לוח פרויקטים נפתח');
      } else if (cmd.match(/(הפק|צור|חדש|מחולל|הצעה|חשבונית|quote|invoice)/i)) {
        openWidget('docCreator');
        setSystemMessage('מחולל מסמכים נפתח');
      } else if (cmd.match(/(סרוק|סריקה|scan|upload|העלה|פענח)/i)) {
        openWidget('aiScanner');
        setSystemMessage('סורק AI נפתח');
      } else if (cmd.match(/(כניסה|כניסת עובד|clock in|clock-in)/i)) {
        if (session?.user?.email?.toLowerCase() !== MECKANO_SUBSCRIBER_EMAIL.toLowerCase()) {
          toast.error('אין לך הרשאה לדווח נוכחות במערכת זו');
          return;
        }
        setSystemMessage('מדווח כניסה ל-Meckano...');
        try {
          const res = await fetch('/api/meckano/clock-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'in', timestamp: new Date().toISOString() })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'נכשל הדיווח');
          setSystemMessage(data.message || 'כניסה דווחה');
          toast.success('דיווח כניסה בוצע בהצלחה');
        } catch (err: any) {
          setSystemMessage('שגיאה בדיווח ל-Meckano');
          toast.error(err.message || 'נכשל הדיווח למערכת Meckano');
        }
      } else if (cmd.match(/(יציאה|יציאת עובד|clock out|clock-out)/i)) {
        if (session?.user?.email?.toLowerCase() !== MECKANO_SUBSCRIBER_EMAIL.toLowerCase()) {
          toast.error('אין לך הרשאה לדווח נוכחות במערכת זו');
          return;
        }
        setSystemMessage('מדווח יציאה ל-Meckano...');
        try {
          const res = await fetch('/api/meckano/clock-in', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'out', timestamp: new Date().toISOString() })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'נכשל הדיווח');
          setSystemMessage(data.message || 'יציאה דווחה');
          toast.success('דיווח יציאה בוצע בהצלחה');
        } catch (err: any) {
          setSystemMessage('שגיאה בדיווח ל-Meckano');
          toast.error(err.message || 'נכשל הדיווח למערכת Meckano');
        }
      } else if (cmd.match(/(דוחות מקאנו|שעות עובדים|meckano reports|attendance report)/i)) {
        openWidget('meckanoReports');
        setSystemMessage('מחולל דוחות Meckano נפתח');
      } else if (cmd.startsWith('/')) {
        const prompt = cmd.slice(1).trim();
        openWidget('aiChatFull', { provider: 'gemini', prompt });
        setSystemMessage('צ\'אט AI מלא נפתח');
      } else {
        // Semantic Discovery via API
        const res = await fetch(`/api/search?q=${encodeURIComponent(cmd)}`);
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
          const top = data.results[0];
          if (top.type === 'project') {
            openWidget('project', { name: top.name });
            setSystemMessage(`נמצא פרויקט: ${top.name}`);
          } else if (top.type === 'contact') {
            openWidget('crm'); 
            setSystemMessage(`נמצא לקוח: ${top.name}`);
          }
        } else {
          openWidget('project', { name: cmd });
          setSystemMessage(`מחפש מידע על: ${cmd}`);
        }
      }
    } catch (err) {
      console.error("Command Error:", err);
      setSystemMessage('שגיאה בביצוע הפקודה');
    } finally {
      setIsBusy(false);
    }
  };

  const handleNotificationAction = async (action: OSNotificationAction) => {
    if (action.action === 'dismiss') {
      const id = action.payload?.id;
      if (id) {
        // Optimistic UI update
        setNotifications(prev => prev.filter(n => n.id !== id));
        
        // Mark as read in DB
        try {
          await fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'mark-notification-read', id })
          });
        } catch (err) {
          console.error("Failed to mark notification as read", err);
        }
      }
    } else if (action.action === 'viewProject') {
      openWidget('project', { name: action.payload?.query });
    }
  };

  if (!mounted) return null;

  if (!session) {
    return <LandingPage />;
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-[color:var(--background-main)] text-[color:var(--foreground-main)] font-sans selection:bg-indigo-500/30 transition-colors duration-500" dir="rtl">
      {/* Global CSS Force */}
      <style jsx global>{`
        body { background: var(--background-main) !important; color: var(--foreground-main) !important; }
        .app-visual-effects-root { background: transparent !important; }
      `}</style>

      {/* OS Background Decor */}
      <div className="absolute inset-0 bg-[color:var(--background-main)] z-0" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(30,41,59,0.05),transparent_50%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(30,41,59,0.2),transparent_50%)] z-0" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.05),transparent_50%)] dark:bg-[radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.3),transparent_50%)] z-0" />
      
      {/* UI Layers */}
      <OSHeader 
        openWidget={openWidget} 
        notificationsCount={notifications.length}
        isNotificationsOpen={isNotificationsOpen}
        toggleNotifications={() => setIsNotificationsOpen(!isNotificationsOpen)}
        toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
      />
      <OSSidebar 
        openWidget={(type) => {
          openWidget(type);
          setIsSidebarOpen(false); // Close sidebar on mobile after selection
        }} 
        isOpen={isSidebarOpen}
        closeSidebar={() => setIsSidebarOpen(false)}
      />

      <div className="absolute inset-0 z-10 flex flex-col pt-16">
        <OSWorkspace 
          widgets={widgets}
          hasHydrated={hasHydrated}
          openWidget={openWidget}
          closeWidget={closeWidget}
          focusWidget={focusWidget}
          updateWidgetPosition={updateWidgetPosition}
          updateWidgetSize={updateWidgetSize}
          toggleMaximize={toggleMaximize}
          updateZoom={updateZoom}
        />
        
        <OSDock 
          systemMessage={systemMessage}
          onCommand={handleCommand}
          apiLatency={apiLatency}
          isBusy={isBusy}
          onSearchPreview={handleSearchPreview}
          searchResults={searchResults}
          onSelectResult={handleSelectResult}
        />
      </div>

      {/* Background Systems */}
      <NotificationCenter 
        notifications={notifications} 
        onAction={handleNotificationAction} 
        isCollapsed={!isNotificationsOpen}
        setIsCollapsed={(collapsed) => setIsNotificationsOpen(!collapsed)}
        confirmExpense={async (details) => {
          // Additional logic if needed before default API call
          console.log("Confirming expense from OS root", details);
        }} 
      />
      <FileDropzone onProcessed={(n) => setNotifications(prev => [n, ...prev])} onLatency={setApiLatency} />
    </main>
  );
}
