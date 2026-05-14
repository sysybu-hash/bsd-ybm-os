import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { OSNotification } from '@/components/os/NotificationCenter';

interface DocumentAnalysis {
  amount: number | null;
  vendor: string;
  projectSuggestion: string;
  confidence: number;
  summary: string;
}

interface FileDropzoneProps {
  onProcessed: (notification: OSNotification) => void;
  onLatency?: (latency: number) => void;
}

const readFileAsDataUrl = (file: File) => {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

const hasFiles = (event: DragEvent) => {
  return Array.from(event.dataTransfer?.types || []).includes('Files');
};

const formatAmount = (amount: number | null) => {
  if (typeof amount !== 'number') return 'סכום לא זוהה';
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(amount);
};

export default function FileDropzone({ onProcessed, onLatency }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const dragDepthRef = useRef(0);

  const processFile = useCallback(async (file: File) => {
    onProcessed({
      id: `ai-analysis-started-${Date.now()}`,
      title: 'AI Analysis Started',
      message: `${file.name} נשלח למנוע הניתוח של BSD-YBM.`,
      severity: 'info',
      createdAt: new Date().toISOString(),
    });

    setIsProcessing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const startedAt = performance.now();
      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      onLatency?.(performance.now() - startedAt);

      if (!response.ok) {
        throw new Error('Analysis failed');
      }

      const data = await response.json() as {
        success?: boolean;
        analysis?: DocumentAnalysis;
        notification?: OSNotification;
      };

      if (data.notification) {
        onProcessed(data.notification);
      } else {
        const analysis = data.analysis || {
          amount: null,
          vendor: 'Unknown vendor',
          projectSuggestion: 'פרויקט וילה הרצליה',
          confidence: 0,
          summary: 'No analysis returned.',
        };

        onProcessed({
          id: `smart-expense-${Date.now()}`,
          title: 'Smart Expense Detected',
          message: `${analysis.vendor} | ${formatAmount(analysis.amount)} | שיוך מוצע: ${analysis.projectSuggestion}. ${analysis.summary}`,
          severity: analysis.confidence >= 0.7 ? 'success' : 'warning',
          createdAt: new Date().toISOString(),
          actions: [
            {
              label: 'Confirm Expense',
              action: 'confirmExpense',
              payload: {
                vendor: analysis.vendor,
                amount: String(analysis.amount ?? ''),
                projectSuggestion: analysis.projectSuggestion,
                fileName: file.name,
              },
            },
            {
              label: 'View Project',
              action: 'viewProject',
              payload: { query: analysis.projectSuggestion || 'project Herzliya' },
            },
          ],
        });
      }
    } catch {
      onProcessed({
        id: `document-error-${Date.now()}`,
        title: 'Document Analysis Failed',
        message: `${file.name} לא נותח בהצלחה. נסה שוב או בדוק את הגדרת GOOGLE_API_KEY.`,
        severity: 'critical',
        createdAt: new Date().toISOString(),
      });
    } finally {
      setIsProcessing(false);
    }
  }, [onLatency, onProcessed]);

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!hasFiles(event)) return;
      dragDepthRef.current += 1;
      setIsDragging(true);
    };

    const handleDragOver = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      if (hasFiles(event)) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDragging(false);
      }
    };

    const handleDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragging(false);

      const file = event.dataTransfer?.files?.[0];
      if (file) {
        void processFile(file);
      }
    };

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [processFile]);

  const isActive = isDragging || isProcessing;

  return (
    <div
      className={`fixed inset-0 z-[9999] transition-opacity duration-150 ${
        isActive ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!isActive}
    >
      <div className="absolute inset-0 bg-blue-950/55 backdrop-blur-md" />
      <div className="absolute inset-6 flex items-center justify-center rounded-[2rem] border-4 border-dashed border-blue-300/80 bg-blue-500/20 text-center shadow-[0_0_90px_rgba(59,130,246,0.35)]">
        <div className="rounded-3xl border border-blue-200/30 bg-slate-950/80 px-10 py-8 text-white shadow-2xl backdrop-blur-2xl">
          <p className="text-sm uppercase tracking-[0.28em] text-blue-100/80">
            {isProcessing ? 'Analyzing Document...' : 'Drop File Anywhere'}
          </p>
          <h2 className="mt-3 text-3xl font-semibold">
            {isProcessing ? 'AI Analysis Started' : 'שחרר כאן לניתוח AI'}
          </h2>
          <p className="mt-3 max-w-md text-sm text-blue-50/80">
            BSD-YBM יקרא את הקובץ, ישלח אותו למנוע הניתוח, וייצור התראה חכמה במרכז הפיקוד.
          </p>
        </div>
      </div>
    </div>
  );
}
