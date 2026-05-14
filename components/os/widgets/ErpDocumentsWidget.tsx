"use client";

import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Search, 
  Trash2, 
  Edit3, 
  Save, 
  TrendingUp, 
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Package,
  Calendar,
  Layers,
  Loader2,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { toast } from 'sonner';

interface DocumentLineItem {
  id: string;
  description: string;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number | null;
  priceAlertPending: boolean;
  normalizedKey: string;
}

interface Document {
  id: string;
  fileName: string;
  type: string;
  status: string;
  createdAt: string;
  lineItems?: DocumentLineItem[];
}

interface PriceChartRow {
  date: string;
  price: number;
}

interface PriceComparison {
  productName: string;
  data: PriceChartRow[];
}

export default function ErpDocumentsWidget() {
  const { theme } = useTheme();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<DocumentLineItem>>({});
  const [priceComparison, setPriceComparison] = useState<PriceComparison | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    fetchDocuments();
    fetchPriceComparison();
  }, []);

  const fetchDocuments = async (query = '') => {
    try {
      setLoading(true);
      const res = await fetch(`/api/erp/documents${query ? `?q=${encodeURIComponent(query)}` : ''}`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
      toast.error('שגיאה בטעינת מסמכים');
    } finally {
      setLoading(false);
    }
  };

  const fetchDocDetails = async (id: string) => {
    try {
      const res = await fetch(`/api/erp/documents/${id}`);
      const data = await res.json();
      setSelectedDoc(data.document);
    } catch (error) {
      console.error('Failed to fetch document details:', error);
      toast.error('שגיאה בטעינת פרטי מסמך');
    }
  };

  const fetchPriceComparison = async () => {
    try {
      const res = await fetch('/api/erp/price-comparison');
      const data = await res.json();
      setPriceComparison(data.comparison);
    } catch (error) {
      console.error('Failed to fetch price comparison:', error);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchDocuments(searchQuery);
  };

  const startEditing = (line: DocumentLineItem) => {
    setEditingLineId(line.id);
    setEditValues({
      unitPrice: line.unitPrice || 0,
      quantity: line.quantity || 0,
      description: line.description
    });
  };

  const saveLineItem = async (id: string) => {
    setIsUpdating(true);
    try {
      const lineTotal = (editValues.unitPrice || 0) * (editValues.quantity || 0);
      const res = await fetch(`/api/erp/line-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editValues,
          lineTotal,
          priceAlertPending: false
        })
      });

      if (res.ok) {
        toast.success('השורה עודכנה בהצלחה');
        setEditingLineId(null);
        if (selectedDoc) fetchDocDetails(selectedDoc.id);
        fetchPriceComparison();
      } else {
        toast.error('שגיאה בעדכון השורה');
      }
    } catch (error) {
      toast.error('שגיאה בחיבור לשרת');
    } finally {
      setIsUpdating(false);
    }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm('האם אתה בטוח שברצונך למחוק את המסמך?')) return;
    
    try {
      const res = await fetch(`/api/erp/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('המסמך נמחק');
        setDocuments(docs => docs.filter(d => d.id !== id));
        if (selectedDoc?.id === id) setSelectedDoc(null);
      }
    } catch (error) {
      toast.error('שגיאה במחיקת המסמך');
    }
  };

  return (
    <div className="flex flex-col md:flex-row h-full bg-transparent text-[color:var(--foreground-main)] overflow-hidden" dir="rtl">
      {/* Sidebar - List of Documents */}
      <div className={`w-full md:w-80 border-b md:border-b-0 md:border-l border-[color:var(--border-main)] flex-col bg-[color:var(--background-main)]/50 ${selectedDoc ? 'hidden md:flex' : 'flex flex-1'}`}>
        <div className="p-4 border-b border-[color:var(--border-main)]">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute right-3 top-2.5 w-4 h-4 text-[color:var(--foreground-muted)]" />
            <input
              type="text"
              placeholder="חיפוש מסמכים..."
              className="w-full bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-lg py-2 pr-10 pl-3 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500/50 text-[color:var(--foreground-main)] shadow-sm dark:shadow-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </form>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600 dark:text-emerald-500" />
            </div>
          ) : documents.length === 0 ? (
            <div className="p-8 text-center text-[color:var(--foreground-muted)] text-sm">לא נמצאו מסמכים</div>
          ) : (
            documents.map((doc) => (
              <button
                key={doc.id}
                onClick={() => fetchDocDetails(doc.id)}
                className={`w-full text-right p-4 border-b border-[color:var(--border-main)]/30 hover:bg-[color:var(--foreground-muted)]/5 transition-colors group ${selectedDoc?.id === doc.id ? 'bg-emerald-500/5 dark:bg-emerald-500/10 border-r-2 border-r-emerald-600 dark:border-r-emerald-500' : ''}`}
              >
                <div className="flex items-center gap-3 mb-1">
                  <FileText className={`w-4 h-4 ${selectedDoc?.id === doc.id ? 'text-emerald-600 dark:text-emerald-400' : 'text-[color:var(--foreground-muted)]'}`} />
                  <span className="text-sm font-medium truncate flex-1 text-[color:var(--foreground-main)]">{doc.fileName}</span>
                  <button 
                    onClick={(e) => { e.stopPropagation(); deleteDocument(doc.id); }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-600 dark:text-rose-400 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex justify-between text-[10px] text-[color:var(--foreground-muted)]">
                  <span>{new Date(doc.createdAt).toLocaleDateString('he-IL')}</span>
                  <span className="uppercase">{doc.type}</span>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className={`flex-1 flex-col overflow-hidden ${!selectedDoc ? 'hidden md:flex' : 'flex'}`}>
        {selectedDoc ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header Details */}
            <div className="p-4 md:p-6 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/50">
              <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4 md:gap-0">
                <div>
                  <button 
                    onClick={() => setSelectedDoc(null)}
                    className="md:hidden mb-4 flex items-center gap-2 text-sm text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
                  >
                    <ChevronRight className="w-4 h-4" /> חזרה לרשימה
                  </button>
                  <h2 className="text-xl font-bold text-[color:var(--foreground-main)] mb-1">{selectedDoc.fileName}</h2>
                  <div className="flex items-center gap-4 text-sm text-[color:var(--foreground-muted)]">
                    <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" /> {new Date(selectedDoc.createdAt).toLocaleDateString('he-IL')}</span>
                    <span className="flex items-center gap-1.5"><Layers className="w-4 h-4" /> {selectedDoc.type}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${selectedDoc.status === 'PROCESSED' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'}`}>
                      {selectedDoc.status}
                    </span>
                  </div>
                </div>
                <div className="bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 flex flex-col items-end shadow-sm dark:shadow-none">
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider mb-1">סה&quot;כ מסמך</span>
                  <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                    ₪{(selectedDoc.lineItems?.reduce((sum, item) => sum + (item.lineTotal || 0), 0) || 0).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Price Comparison Snippet */}
              {priceComparison && (
                <div className="bg-[color:var(--surface-card)]/50 border border-[color:var(--border-main)] rounded-xl p-4 shadow-sm dark:shadow-none">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-sm font-bold text-[color:var(--foreground-main)]">היסטוריית מחירים: {priceComparison.productName}</span>
                    </div>
                  </div>
                  <div className="h-32 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={priceComparison.data}>
                        <defs>
                          <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? "#ffffff05" : "#00000005"} vertical={false} />
                        <XAxis dataKey="date" hide />
                        <YAxis hide domain={['auto', 'auto']} />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff', 
                            border: theme === 'dark' ? '1px solid #ffffff10' : '1px solid #e2e8f0', 
                            borderRadius: '8px', 
                            fontSize: '12px' 
                          }}
                          itemStyle={{ color: '#10b981' }}
                        />
                        <Area type="monotone" dataKey="price" stroke="#10b981" fillOpacity={1} fill="url(#colorPrice)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Line Items Table */}
            <div className="flex-1 overflow-auto custom-scrollbar p-6">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[600px]">
                <thead>
                  <tr className="text-right text-xs font-bold text-[color:var(--foreground-muted)] uppercase tracking-widest border-b border-[color:var(--border-main)]/30">
                    <th className="pb-3 pr-2 w-10">#</th>
                    <th className="pb-3 pr-4 text-right">תיאור פריט</th>
                    <th className="pb-3 px-4 text-center w-24">כמות</th>
                    <th className="pb-3 px-4 text-center w-32">מחיר יחידה</th>
                    <th className="pb-3 pl-4 text-left w-32">סה&quot;כ</th>
                    <th className="pb-3 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border-main)]/30">
                  {selectedDoc.lineItems?.map((item, index) => (
                    <tr key={item.id} className={`group hover:bg-[color:var(--foreground-muted)]/5 transition-colors ${item.priceAlertPending ? 'bg-amber-500/5' : ''}`}>
                      <td className="py-4 pr-2 text-xs text-[color:var(--foreground-muted)]">{index + 1}</td>
                      <td className="py-4 pr-4">
                        {editingLineId === item.id ? (
                          <input
                            className="w-full bg-[color:var(--surface-card)]/50 border border-emerald-500/50 rounded px-2 py-1 text-sm focus:outline-none text-[color:var(--foreground-main)] shadow-sm dark:shadow-none"
                            value={editValues.description}
                            onChange={(e) => setEditValues({ ...editValues, description: e.target.value })}
                          />
                        ) : (
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-[color:var(--foreground-main)]">{item.description}</span>
                            {item.priceAlertPending && (
                              <span className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                                <AlertCircle className="w-3 h-3" /> נדרש עדכון מחיר
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {editingLineId === item.id ? (
                          <input
                            type="number"
                            className="w-16 bg-[color:var(--surface-card)]/50 border border-emerald-500/50 rounded px-2 py-1 text-sm text-center focus:outline-none text-[color:var(--foreground-main)] shadow-sm dark:shadow-none"
                            value={editValues.quantity ?? ''}
                            onChange={(e) => setEditValues({ ...editValues, quantity: parseFloat(e.target.value) || 0 })}
                          />
                        ) : (
                          <span className="text-sm text-[color:var(--foreground-muted)]">{item.quantity}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center font-mono">
                        {editingLineId === item.id ? (
                          <input
                            type="number"
                            className="w-24 bg-[color:var(--surface-card)]/50 border border-emerald-500/50 rounded px-2 py-1 text-sm text-center focus:outline-none text-[color:var(--foreground-main)] shadow-sm dark:shadow-none"
                            value={editValues.unitPrice ?? ''}
                            onChange={(e) => setEditValues({ ...editValues, unitPrice: parseFloat(e.target.value) || 0 })}
                          />
                        ) : (
                          <span className="text-sm text-[color:var(--foreground-muted)]">₪{(item.unitPrice || 0).toLocaleString()}</span>
                        )}
                      </td>
                      <td className="py-4 pl-4 text-left font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                        ₪{(((editingLineId === item.id ? (editValues.unitPrice || 0) * (editValues.quantity || 0) : item.lineTotal) || 0)).toLocaleString()}
                      </td>
                      <td className="py-4 text-center">
                        <div className="flex justify-center gap-2">
                          {editingLineId === item.id ? (
                            <button
                              onClick={() => saveLineItem(item.id)}
                              disabled={isUpdating}
                              className="p-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors"
                            >
                              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 text-white" />}
                            </button>
                          ) : (
                            <button
                              onClick={() => startEditing(item)}
                              className="p-1.5 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg text-[color:var(--foreground-muted)] hover:text-emerald-600 dark:hover:text-emerald-400 transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[color:var(--foreground-muted)] bg-transparent">
            <div className="w-16 h-16 bg-[color:var(--background-main)]/50 rounded-full flex items-center justify-center mb-4 border border-[color:var(--border-main)]">
              <Package className="w-8 h-8 opacity-50" />
            </div>
            <p>בחר מסמך מהרשימה כדי לצפות בפרטים ולערוך שורות</p>
          </div>
        )}
      </div>
    </div>
  );
}
