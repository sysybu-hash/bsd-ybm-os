import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Maximize2, Minimize2, ZoomIn, ZoomOut, X } from 'lucide-react';

interface ShellProps {
  id: string;
  title: string;
  onClose: () => void;
  initialOffset?: { x: number; y: number };
  size?: { width: number; height: number };
  zIndex?: number;
  isMaximized?: boolean;
  zoom?: number;
  onFocus?: () => void;
  onPositionChange?: (position: { x: number; y: number }) => void;
  onResize?: (size: { width: number; height: number }) => void;
  onMaximize?: () => void;
  onZoomChange?: (delta: number) => void;
  children: React.ReactNode;
}

export default function AdaptiveWidgetShell({
  id, title, onClose, initialOffset, size = { width: 600, height: 450 },
  zIndex = 10, isMaximized = false, zoom = 1, onFocus, onPositionChange, onResize, onMaximize, onZoomChange, children,
}: ShellProps) {
  const getCenter = () => {
    if (typeof window === 'undefined') return { x: 100, y: 100 };
    const w = Math.min(size.width, window.innerWidth - 32);
    const h = Math.min(size.height, window.innerHeight - 150);
    return {
      x: Math.max(16, window.innerWidth / 2 - w / 2),
      y: Math.max(80, window.innerHeight / 2 - h / 2)
    };
  };

  const [position, setPosition] = useState(initialOffset || getCenter());
  const [currentSize, setCurrentSize] = useState({
    width: typeof window !== 'undefined' ? Math.min(size.width, window.innerWidth - 32) : size.width,
    height: typeof window !== 'undefined' ? Math.min(size.height, window.innerHeight - 150) : size.height
  });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const positionRef = useRef(position);
  const sizeRef = useRef(currentSize);

  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  useEffect(() => {
    sizeRef.current = currentSize;
  }, [currentSize]);
  
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, x: 0, y: 0 });
  const resizeStartRef = useRef({ mouseX: 0, mouseY: 0, width: size.width, height: size.height });

  const moveWindow = useCallback((clientX: number, clientY: number) => {
    const { mouseX, mouseY, x, y } = dragStartRef.current;
    setPosition({ x: x + clientX - mouseX, y: y + clientY - mouseY });
  }, []);

  const resizeWindow = useCallback((clientX: number, clientY: number) => {
    const { mouseX, mouseY, width, height } = resizeStartRef.current;
    setCurrentSize({ 
      width: Math.max(400, width + clientX - mouseX), 
      height: Math.max(300, height + clientY - mouseY) 
    });
  }, []);

  useEffect(() => {
    if (!isDragging && !isResizing) return;
    const handleMove = (e: MouseEvent) => {
      if (isDragging) moveWindow(e.clientX, e.clientY);
      else if (isResizing) resizeWindow(e.clientX, e.clientY);
    };
    const handleUp = () => {
      if (isDragging) { 
        setIsDragging(false); 
        onPositionChange?.(positionRef.current); 
      }
      if (isResizing) { 
        setIsResizing(false); 
        onResize?.(sizeRef.current); 
      }
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => { 
      window.removeEventListener('mousemove', handleMove); 
      window.removeEventListener('mouseup', handleUp); 
    };
  }, [isDragging, isResizing, moveWindow, resizeWindow, onPositionChange, onResize]);

  return (
    <div
      onMouseDown={onFocus}
      className={`absolute widget-content-area border border-[color:var(--border-main)] shadow-2xl rounded-2xl overflow-hidden flex flex-col pointer-events-auto transition-all duration-300 bg-[color:var(--glass-bg)] backdrop-blur-2xl ${isMaximized ? 'inset-0 !w-full !h-full !left-0 !top-0 z-[2000] rounded-none' : ''}`}
      style={{
        width: isMaximized ? '100%' : `${currentSize.width}px`, 
        height: isMaximized ? '100%' : `${currentSize.height}px`,
        maxWidth: isMaximized ? '100%' : 'calc(100vw - 32px)',
        maxHeight: isMaximized ? '100%' : 'calc(100dvh - 150px)',
        left: isMaximized ? '0' : `${Math.max(16, Math.min(position.x, typeof window !== 'undefined' ? window.innerWidth - currentSize.width - 16 : position.x))}px`, 
        top: isMaximized ? '0' : `${Math.max(80, Math.min(position.y, typeof window !== 'undefined' ? window.innerHeight - currentSize.height - 16 : position.y))}px`, 
        zIndex: isMaximized ? 2000 : zIndex,
      }}
      dir="rtl"
    >
      <div
        onMouseDown={(e) => { 
          if (isMaximized) return;
          e.preventDefault(); 
          dragStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, x: position.x, y: position.y }; 
          setIsDragging(true); 
        }}
        className={`flex justify-between items-center px-4 py-3 bg-[color:var(--background-main)]/50 border-b border-[color:var(--border-main)]/30 select-none ${isMaximized ? 'cursor-default' : 'cursor-move'}`}
      >
        <div className="flex gap-1.5 items-center">
            <div className="w-3 h-3 rounded-full bg-red-500/50" />
            <div className="w-3 h-3 rounded-full bg-amber-500/50" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/50" />
            
            <div className="w-px h-4 bg-[color:var(--border-main)] mx-2" />
            
            <div className="flex items-center gap-1">
              <button 
                onClick={() => onZoomChange?.(-0.1)}
                className="p-1 hover:bg-white/10 rounded text-[color:var(--foreground-muted)] transition-colors"
                title="Zoom Out"
              >
                <ZoomOut size={12} />
              </button>
              <span className="text-[9px] font-bold text-[color:var(--foreground-muted)] w-8 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button 
                onClick={() => onZoomChange?.(0.1)}
                className="p-1 hover:bg-white/10 rounded text-[color:var(--foreground-muted)] transition-colors"
                title="Zoom In"
              >
                <ZoomIn size={12} />
              </button>
            </div>
        </div>

        <span className="text-[color:var(--foreground-main)] text-xs font-bold uppercase tracking-widest opacity-80">{title}</span>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={onMaximize}
            className="p-1.5 hover:bg-white/10 rounded-lg text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)] transition-colors"
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-rose-500/10 rounded-lg text-[color:var(--foreground-muted)] hover:text-rose-500 transition-colors">
            <X size={14} />
          </button>
        </div>
      </div>
      
      {/* הוספנו w-full ו-h-full כדי שהתוכן יתפרס */}
      <div 
        className="flex-1 overflow-auto w-full h-full custom-scrollbar bg-transparent text-[color:var(--foreground-main)]"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top right' }}
      >
        {children}
      </div>

      {!isMaximized && (
        <div
          onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); resizeStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, width: currentSize.width, height: currentSize.height }; setIsResizing(true); }}
          className="absolute right-0 bottom-0 w-8 h-8 cursor-nwse-resize flex items-end justify-end p-1 group"
        >
          <div className="w-3 h-3 border-r-2 border-b-2 border-slate-600 group-hover:border-emerald-500 transition-colors" />
        </div>
      )}
    </div>
  );
}