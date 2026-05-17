import { useI18n } from "@/components/os/system/I18nProvider";
import WidgetState from "@/components/os/WidgetState";
import React, { useState, useEffect } from 'react';
import { Search, UserPlus, SlidersHorizontal } from 'lucide-react';

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
      console.error(err);
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
    <div className="w-full h-full p-6 flex flex-col gap-6 text-right bg-transparent text-[color:var(--foreground-main)]" dir={dir}>
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

      <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-1">
        {loading ? (
          <WidgetState variant="loading" message={t("workspaceWidgets.crmMini.loading")} />
        ) : clients.length > 0 ? (
          clients.map(client => (
            <div key={client.id} className="w-full p-4 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-2xl hover:bg-[color:var(--foreground-muted)]/10 transition-all flex justify-between items-center group cursor-pointer shadow-sm dark:shadow-none">
              <div className="text-left flex items-center gap-2">
                 <button className="p-2 bg-[color:var(--foreground-muted)]/10 hover:bg-[color:var(--foreground-muted)]/20 rounded-lg text-[color:var(--foreground-muted)] transition-colors opacity-0 group-hover:opacity-100">
                    <SlidersHorizontal size={14} />
                 </button>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-[color:var(--foreground-muted)]/10 flex items-center justify-center font-bold text-[color:var(--foreground-muted)] text-xs border border-[color:var(--border-main)]">
                   {client.name?.charAt(0) || 'U'}
                </div>
                <div className="flex flex-col">
                  <div className="font-bold text-[color:var(--foreground-main)] group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{client.name}</div>
                  <div className="text-[11px] text-[color:var(--foreground-muted)] font-medium uppercase tracking-wider">{client.phone || 'ללא טלפון'}</div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed border-[color:var(--border-main)]/30 rounded-3xl">
             <p className="text-[color:var(--foreground-muted)] text-sm">{t("workspaceWidgets.crmMini.empty")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
