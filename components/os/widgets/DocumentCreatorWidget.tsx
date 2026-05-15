"use client";

import React, { useState, useEffect } from 'react';
import { 
  FilePlus, 
  User, 
  Plus, 
  Trash2, 
  Send, 
  CheckCircle2, 
  Loader2, 
  Copy, 
  ExternalLink, 
  FileText, 
  CreditCard, 
  Calendar,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface Contact {
  id: string;
  name: string;
  email: string | null;
}

interface DocItem {
  id: string;
  description: string;
  quantity: number;
  price: number;
}

export default function DocumentCreatorWidget() {
  const [docType, setDocType] = useState<'quote' | 'invoice'>('quote');
  const [orgSettings, setOrgSettings] = useState<any>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContactId, setSelectedContactId] = useState('');
  const [items, setItems] = useState<DocItem[]>([
    { id: '1', description: '', quantity: 1, price: 0 }
  ]);
  const [loading, setLoading] = useState(false);
  const [fetchingContacts, setFetchingContacts] = useState(true);
  const [generatedDoc, setGeneratedDoc] = useState<{
    token: string;
    documentNumber: number;
    signUrl: string;
    paymentLink?: string;
    clientName: string;
    items: any[];
    amount: number;
  } | null>(null);

  useEffect(() => {
    fetchContacts();
    fetchOrgSettings();
  }, []);

  const fetchOrgSettings = async () => {
    try {
      const res = await fetch('/api/data?type=dashboard');
      const data = await res.json();
      setOrgSettings({
        name: data.orgName || 'BSD-YBM תשתיות',
        taxId: data.taxId || '512345678',
        email: data.adminEmail || 'admin@bsd-ybm.co.il'
      });
    } catch (err) {
      console.error('Failed to fetch org settings:', err);
    }
  };

  const fetchContacts = async () => {
    try {
      const res = await fetch('/api/data?type=clients');
      const data = await res.json();
      setContacts(data.map((c: any) => ({
        id: c.id,
        name: c.name,
        email: c.email
      })));
    } catch (error) {
      console.error('Failed to fetch contacts:', error);
    } finally {
      setFetchingContacts(false);
    }
  };

  const addItem = () => {
    setItems([...items, { id: Math.random().toString(36).substr(2, 9), description: '', quantity: 1, price: 0 }]);
  };

  const removeItem = (id: string) => {
    if (items.length === 1) return;
    setItems(items.filter(item => item.id !== id));
  };

  const updateItem = (id: string, field: keyof DocItem, value: string | number) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const calculateSubtotal = () => {
    return items.reduce((sum, item) => sum + (item.quantity * item.price), 0);
  };

  const generateDocument = async () => {
    const contact = contacts.find(c => c.id === selectedContactId);
    if (!contact) {
      toast.error('אנא בחר לקוח');
      return;
    }

    if (items.some(item => !item.description || item.price <= 0)) {
      toast.error('אנא מלא את כל פרטי הפריטים');
      return;
    }

    setLoading(true);
    try {
      const endpoint = docType === 'quote' ? '/api/erp/quotes' : '/api/erp/issued-documents';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: docType === 'quote' ? 'QUOTE' : 'INVOICE',
          contactId: selectedContactId,
          clientName: contact.name,
          clientEmail: contact.email,
          amount: calculateSubtotal(),
          items: items.map(i => ({ desc: i.description, qty: i.quantity, price: i.price }))
        })
      });

      const data = await res.json();
      if (res.ok) {
        const result = data.document || data;
        setGeneratedDoc({
          ...result,
          clientName: contact.name,
          items: items,
          amount: calculateSubtotal()
        });
        toast.success(`${docType === 'quote' ? 'הצעת המחיר' : 'החשבונית'} הופקה בהצלחה`);
      } else {
        toast.error(data.error || 'שגיאה בהפקת המסמך');
      }
    } catch (error) {
      toast.error('שגיאה בחיבור לשרת');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = () => {
    if (!generatedDoc) return;

    const doc = new jsPDF();
    
    // For Hebrew support in jsPDF without custom fonts, we need to reverse the strings
    // and use a font that might be available, but usually we need to embed a font.
    // Since we can't easily embed a full TTF here, we'll use a helper to reverse Hebrew text.
    const reverseHebrew = (text: string) => {
      if (!text) return '';
      return text.split('').reverse().join('');
    };

    // Basic PDF layout
    doc.setFontSize(20);
    doc.text(reverseHebrew(docType === 'quote' ? 'הצעת מחיר' : 'חשבונית מס'), 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    if (orgSettings) {
      doc.text(reverseHebrew(orgSettings.name), 10, 10);
      doc.text(reverseHebrew(`ח"פ: ${orgSettings.taxId}`), 10, 15);
      doc.text(reverseHebrew(orgSettings.email), 10, 20);
    }

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.text(reverseHebrew(`מספר מסמך: ${generatedDoc.documentNumber || 'חדש'}`), 190, 40, { align: 'right' });
    doc.text(reverseHebrew(`לקוח: ${generatedDoc.clientName}`), 190, 50, { align: 'right' });
    doc.text(reverseHebrew(`תאריך: ${new Date().toLocaleDateString('he-IL')}`), 190, 60, { align: 'right' });

    const tableData = items.map(item => [
      `₪${((item.quantity || 0) * (item.price || 0)).toLocaleString()}`,
      `₪${(item.price || 0).toLocaleString()}`,
      item.quantity.toString(),
      reverseHebrew(item.description),
    ]);

    (doc as any).autoTable({
      startY: 70,
      head: [[reverseHebrew('סה"כ'), reverseHebrew('מחיר יח\''), reverseHebrew('כמות'), reverseHebrew('תיאור')]],
      body: tableData,
      styles: { halign: 'right' },
      headStyles: { halign: 'right' }
    });

    const finalY = (doc as any).lastAutoTable.finalY;
    doc.text(reverseHebrew(`סה"כ לתשלום: ₪${(calculateSubtotal() || 0).toLocaleString()}`), 190, finalY + 20, { align: 'right' });

    doc.save(`${docType}_${generatedDoc.documentNumber || 'draft'}.pdf`);
    toast.success('PDF הורד בהצלחה');
  };

  if (generatedDoc) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 bg-transparent text-[color:var(--foreground-main)]" dir="rtl">
        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mb-6">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h2 className="text-2xl font-bold mb-2 text-[color:var(--foreground-main)]">{docType === 'quote' ? 'הצעת מחיר' : 'חשבונית'} #{generatedDoc.documentNumber} הופקה!</h2>
        <p className="text-[color:var(--foreground-muted)] mb-8 text-center">המסמך נשמר בבסיס הנתונים ומוכן להורדה או לשליחה.</p>

        <div className="w-full max-w-md space-y-4">
          <button 
            onClick={downloadPDF}
            className="w-full py-4 bg-[color:var(--surface-card)]/50 hover:bg-[color:var(--surface-card)]/80 border border-[color:var(--border-main)] rounded-2xl font-bold transition-all flex items-center justify-center gap-3 text-[color:var(--foreground-main)] shadow-sm dark:shadow-none"
          >
            <Download size={20} className="text-blue-600 dark:text-blue-400" /> הורד קובץ PDF
          </button>

          <div className="bg-[color:var(--background-main)]/50 border border-[color:var(--border-main)] rounded-2xl p-4 shadow-sm dark:shadow-none">
            <label className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest block mb-2">קישור לחתימה דיגיטלית</label>
            <div className="flex gap-2">
              <input readOnly value={generatedDoc.signUrl || '#'} className="flex-1 bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg px-3 py-2 text-xs text-[color:var(--foreground-muted)] outline-none" />
              <button onClick={() => { navigator.clipboard.writeText(generatedDoc.signUrl || ''); toast.success('הועתק'); }} className="p-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg transition-colors border border-emerald-500/20">
                <Copy size={16} />
              </button>
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button onClick={() => setGeneratedDoc(null)} className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold transition-all">הפק מסמך חדש</button>
            {generatedDoc.signUrl && (
              <a href={generatedDoc.signUrl} target="_blank" className="p-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl transition-all flex items-center justify-center"><ExternalLink size={20} /></a>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir="rtl">
      {/* Header */}
      <div className="p-6 border-b border-[color:var(--border-main)] flex justify-between items-center bg-[color:var(--background-main)]/50">
        <div className="flex items-center gap-4">
          <div className="flex bg-[color:var(--background-main)]/50 p-1 rounded-xl border border-[color:var(--border-main)]">
            <button onClick={() => setDocType('quote')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${docType === 'quote' ? 'bg-indigo-500 text-white shadow-lg' : 'text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]'}`}>הצעת מחיר</button>
            <button onClick={() => setDocType('invoice')} className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${docType === 'invoice' ? 'bg-emerald-500 text-white shadow-lg' : 'text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]'}`}>חשבונית</button>
          </div>
          <div>
            <h2 className="text-lg font-bold text-[color:var(--foreground-main)]">מחולל מסמכים חכם</h2>
            <p className="text-[10px] text-[color:var(--foreground-muted)] uppercase tracking-widest font-bold">BSD-YBM Financial Engine</p>
          </div>
        </div>
        <div className="text-left">
          <span className="text-[10px] font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest block mb-1">סה&quot;כ לתשלום</span>
          <span className={`text-2xl font-black ${docType === 'quote' ? 'text-indigo-600 dark:text-indigo-400' : 'text-emerald-600 dark:text-emerald-400'}`}>₪{(calculateSubtotal() || 0).toLocaleString()}</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">
        {/* Client Selection */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">1</div>
            <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">בחירת לקוח מה-CRM</h3>
          </div>
          <div className="relative">
            <User className="absolute right-3 top-3 w-4 h-4 text-[color:var(--foreground-muted)]" />
            <select className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-3 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 appearance-none text-[color:var(--foreground-main)]" value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)} disabled={fetchingContacts}>
              <option value="">{fetchingContacts ? 'טוען לקוחות...' : 'בחר לקוח מהרשימה...'}</option>
              {contacts.map(c => <option key={c.id} value={c.id}>{c.name} ({c.email || 'אין אימייל'})</option>)}
            </select>
          </div>
        </section>

        {/* Items */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">2</div>
              <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">פירוט עבודה / פריטים</h3>
            </div>
            <button onClick={addItem} className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-500 dark:hover:text-emerald-300 flex items-center gap-1 transition-colors"><Plus size={14} /> הוסף פריט</button>
          </div>
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="flex gap-3 items-start group">
                <div className="flex-1 bg-[color:var(--background-main)]/30 border border-[color:var(--border-main)] rounded-xl p-3 flex flex-col md:flex-row gap-4 shadow-sm dark:shadow-none">
                  <div className="flex-1"><input placeholder="תיאור הפריט או העבודה..." className="w-full bg-transparent border-none text-sm text-[color:var(--foreground-main)] focus:outline-none placeholder:text-[color:var(--foreground-muted)] opacity-80" value={item.description} onChange={(e) => updateItem(item.id, 'description', e.target.value)} /></div>
                  <div className="w-full md:w-20 border-t md:border-t-0 md:border-r border-[color:var(--border-main)]/30 pt-2 md:pt-0 md:pr-4"><input type="number" inputMode="numeric" placeholder="כמות" className="w-full bg-transparent border-none text-sm text-center text-[color:var(--foreground-muted)] focus:outline-none" value={item.quantity} onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value))} /></div>
                  <div className="w-full md:w-32 border-t md:border-t-0 md:border-r border-[color:var(--border-main)]/30 pt-2 md:pt-0 md:pr-4 flex items-center gap-1"><span className="text-xs text-[color:var(--foreground-muted)]">₪</span><input type="number" inputMode="decimal" placeholder="מחיר" className="w-full bg-transparent border-none text-sm text-left text-emerald-600 dark:text-emerald-400 font-bold focus:outline-none" value={item.price} onChange={(e) => updateItem(item.id, 'price', parseFloat(e.target.value))} /></div>
                </div>
                <button onClick={() => removeItem(item.id)} className="p-3 text-[color:var(--foreground-muted)] hover:text-red-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </section>

        {/* Additional Settings */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">3</div>
              <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">תאריך פירעון</h3>
            </div>
            <div className="relative">
              <Calendar className="absolute right-3 top-3 w-4 h-4 text-[color:var(--foreground-muted)]" />
              <input type="date" className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-3 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-[color:var(--foreground-main)]" defaultValue={new Date().toISOString().split('T')[0]} />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-6 h-6 rounded-full bg-[color:var(--background-main)]/50 flex items-center justify-center text-[10px] font-bold text-[color:var(--foreground-muted)] border border-[color:var(--border-main)]">4</div>
              <h3 className="text-sm font-bold text-[color:var(--foreground-muted)]">אמצעי תשלום</h3>
            </div>
            <div className="relative">
              <CreditCard className="absolute right-3 top-3 w-4 h-4 text-[color:var(--foreground-muted)]" />
              <select className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl py-3 pr-10 pl-4 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/50 appearance-none text-[color:var(--foreground-main)]">
                <option>PayPlus (אשראי)</option>
                <option>העברה בנקאית</option>
                <option>צ&apos;ק / מזומן</option>
              </select>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/50">
        <button onClick={generateDocument} disabled={loading || !selectedContactId} className={`w-full h-14 ${docType === 'quote' ? 'bg-indigo-600 hover:bg-indigo-500' : 'bg-emerald-600 hover:bg-emerald-500'} disabled:bg-slate-200 dark:disabled:bg-slate-800 disabled:text-slate-400 dark:disabled:text-slate-500 text-white font-black text-lg rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3`}>
          {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : <>{docType === 'quote' ? 'הפק הצעת מחיר' : 'הפק חשבונית לתשלום'} <Send className="w-5 h-5" /></>}
        </button>
      </div>
    </div>
  );
}
