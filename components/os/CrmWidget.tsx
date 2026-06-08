import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import React, { useState, useEffect } from 'react';
import { Search, UserPlus, SlidersHorizontal } from 'lucide-react';
import { createLogger } from "@/lib/logger";
import WindowBody from "@/components/os/layout/WindowBody";

const log = createLogger("crm-widget");

export default function CrmWidget() {
  const { dir, t } = useI18n();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);

  const fetchClients = async (query = '') => {
    setLoading(true);
    try {
      if (query) {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setClients(data.results?.filter((r: { type?: string }) => r.type === 'contact') || []);
        return;
      }
      const res = await fetch('/api/crm/contacts', { credentials: 'include' });
      const data = await res.json();
      setClients(Array.isArray(data.contacts) ? data.contacts : []);
    } catch (err) {
      log.error("fetch clients failed", { error: err instanceof Error ? err.message : String(err) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!val) fetchClients();
  };

  const triggerSearch = () => {
    if (searchQuery) fetchClients(searchQuery);
  };

  return (
    <WindowBody
      sticky
      dir={dir}
      className="text-start text-[color:var(--foreground-main)]"
      scrollClassName="space-y-3 px-3 pb-3 sm:px-6 sm:pb-6"
      header={
        <div className="flex flex-col gap-3 px-3 pt-3 sm:gap-6 sm:px-6 sm:pt-6">
      <div className="flex justify-between items-center w-full">
         <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
               <UserPlus size={20} />
            </div>
            <h2 className="text-xl font-black tracking-tight">{t("workspaceWidgets.crmMini.title")}</h2>
         </div>
         <button className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-900/20 active:scale-95">
           + {t("workspaceWidgets.crmMini.newClient")}
         </button>
      </div>

      <div className="relative">
         <input 
           type="text" 
           value={searchQuery}
           onChange={handleSearch}
           onKeyDown={(e) => e.key === 'Enter' && triggerSearch()}
           placeholder={t("workspaceWidgets.crmMini.searchPlaceholder")}
           className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl px-5 py-3 pr-12 text-sm text-[color:var(--foreground-main)] focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition-all placeholder:text-[color:var(--foreground-muted)] font-medium"
         />
         <Search className="absolute right-4 top-1/2 -translate-y-1/2 text-[color:var(--foreground-muted)]" size={18} />
      </div>
        </div>
      }
    >
        {loading ? (
          <WidgetState variant="loading" message={t("workspaceWidgets.crmMini.loading")} />
        ) : clients.length > 0 ? (
          clients.map(client => (
            <div key={client.id} className="w-full p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-xl transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:hover:border-slate-600 flex justify-between items-center group cursor-pointer shadow-sm">
              <div className="text-start flex items-center gap-2">
                <button className="p-2 bg-slate-100 dark:bg-slate-700/50 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg text-slate-400 dark:text-slate-300 transition-colors opacity-0 group-hover:opacity-100">
                  <SlidersHorizontal size={14} />
                </button>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700/50 flex items-center justify-center font-bold text-slate-500 dark:text-slate-400 text-sm border border-slate-200 dark:border-slate-700/60">
                  {client.name?.charAt(0) || 'U'}
                </div>
                <div className="flex flex-col">
                  <div className="font-semibold text-slate-900 dark:text-slate-50 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{client.name}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">{client.phone || 'ללא טלפון'}</div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-slate-200 dark:border-slate-700/60 rounded-xl">
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{t("workspaceWidgets.crmMini.empty")}</p>
          </div>
        )}
    </WindowBody>
  );
}
