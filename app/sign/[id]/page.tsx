"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import SignatureCanvas from 'react-signature-canvas';
import { 
  CheckCircle2, 
  FileText, 
  PenTool, 
  RotateCcw, 
  ShieldCheck,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { motion } from 'framer-motion';
import { toast, Toaster } from 'sonner';

export default function SigningPage() {
  const params = useParams();
  const id = params.id as string;
  const [doc, setDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSigned, setIsSigned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const sigCanvas = useRef<any>(null);

  useEffect(() => {
    const fetchDoc = async () => {
      try {
        const res = await fetch(`/api/sign/${id}`);
        if (!res.ok) throw new Error('המסמך לא נמצא או שתוקפו פג');
        const data = await res.json();
        setDoc(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchDoc();
  }, [id]);

  const clearSignature = () => {
    sigCanvas.current?.clear();
  };

  const handleSubmit = async () => {
    if (sigCanvas.current?.isEmpty()) {
      toast.error('אנא חתום בשטח המיועד לפני האישור');
      return;
    }

    setIsSubmitting(true);
    const signatureBase64 = sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png');

    try {
      const res = await fetch(`/api/sign/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signatureBase64 })
      });

      if (!res.ok) throw new Error('הסנכרון נכשל');
      setIsSigned(true);
      toast.success('המסמך נחתם וסונכרן בהצלחה');
    } catch (err) {
      toast.error('שגיאה בשליחת החתימה, אנא נסה שוב');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="text-indigo-500 animate-spin" size={48} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <div className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-8 backdrop-blur-xl">
          <AlertCircle className="text-rose-500 mx-auto mb-4" size={48} />
          <h1 className="text-2xl font-bold text-white mb-2">שגיאה</h1>
          <p className="text-slate-400 mb-6">{error}</p>
          <button onClick={() => window.location.reload()} className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl transition-all">
            נסה שוב
          </button>
        </div>
      </div>
    );
  }

  if (isSigned) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white/5 border border-white/10 rounded-3xl p-12 backdrop-blur-xl shadow-2xl"
        >
          <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="text-emerald-500" size={40} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">נחתם בהצלחה!</h1>
          <p className="text-slate-400 mb-8 leading-relaxed">
            תודה לך, {doc.clientName}.<br />
            המסמך נחתם דיגיטלית וסונכרן למערכת BSD-YBM OS.
          </p>
          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl flex items-center gap-3 text-emerald-400 text-sm">
            <ShieldCheck size={20} />
            <span>חתימה מאובטחת ומאומתת</span>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30 overflow-x-hidden" dir="rtl">
      {/* Background Decor */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-emerald-600/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-12">
        <Toaster position="top-center" />
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center text-indigo-400">
              <FileText size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">חתימה על מסמך</h1>
              <p className="text-xs text-slate-500">BSD-YBM OS | מערכת חתימה מאובטחת</p>
            </div>
          </div>
          <div className="text-left">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">תאריך הנפקה</div>
            <div className="text-sm font-bold">{new Date(doc.createdAt).toLocaleDateString('he-IL')}</div>
          </div>
        </div>

        {/* Document Card */}
        <div className="bg-white/5 border border-white/10 rounded-[2.5rem] p-8 backdrop-blur-xl shadow-2xl mb-8">
          <div className="flex justify-between items-start mb-8">
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">עבור לקוח</label>
              <h2 className="text-2xl font-bold text-white">{doc.clientName}</h2>
            </div>
            <div className="text-left">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">סכום כולל</label>
              <div className="text-3xl font-black text-emerald-400">₪{doc.amount.toLocaleString()}</div>
            </div>
          </div>

          <div className="space-y-4 mb-8">
            <div className="p-4 bg-white/5 border border-white/5 rounded-2xl">
              <p className="text-sm text-slate-300 leading-relaxed">
                אני מאשר בזאת את תנאי הצעת המחיר ומזמין את העבודה כפי שפורטה. חתימתי מטה מהווה הסכמה מלאה לכל תנאי ההתקשרות.
              </p>
            </div>
          </div>

          {/* Signature Area */}
          <div className="space-y-3">
            <div className="flex items-center justify-between px-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <PenTool size={12} /> חתום כאן (עם האצבע או העכבר)
              </label>
              <button 
                onClick={clearSignature}
                className="text-[10px] font-bold text-rose-500 hover:text-rose-400 flex items-center gap-1 transition-colors"
              >
                <RotateCcw size={12} /> נקה חתימה
              </button>
            </div>
            
            <div className="bg-white rounded-2xl overflow-hidden h-48 border-2 border-white/10 shadow-inner">
              <SignatureCanvas 
                ref={sigCanvas}
                penColor="#0f172a"
                canvasProps={{
                  className: 'w-full h-full cursor-crosshair'
                }}
              />
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button 
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full h-16 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-bold rounded-2xl shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-3 text-lg"
        >
          {isSubmitting ? (
            <Loader2 className="animate-spin" size={24} />
          ) : (
            <>
              <CheckCircle2 size={24} />
              אשר וחתום על המסמך
            </>
          )}
        </button>

        <p className="mt-8 text-center text-[10px] text-slate-600 uppercase tracking-widest">
          BSD-YBM OS • Secure Digital Signature • 2026
        </p>
      </div>
    </div>
  );
}
