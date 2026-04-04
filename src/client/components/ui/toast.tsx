import { useState, useCallback, createContext, useContext, type ReactNode } from 'react';

interface Toast {
  id: number;
  message: string;
  variant: 'error' | 'success' | 'info';
}

interface ToastContextValue {
  toast: {
    error: (message: string) => void;
    success: (message: string) => void;
    info: (message: string) => void;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, variant: Toast['variant']) => {
    const id = nextId++;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const toast = {
    error: (message: string) => addToast(message, 'error'),
    success: (message: string) => addToast(message, 'success'),
    info: (message: string) => addToast(message, 'info'),
  };

  const variantStyles: Record<Toast['variant'], string> = {
    error: 'border-red-500/30 bg-red-500/10 text-red-400',
    success: 'border-green-500/30 bg-green-500/10 text-green-400',
    info: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`px-4 py-3 rounded-lg border text-sm shadow-lg animate-in slide-in-from-right ${variantStyles[t.variant]}`}
              style={{ backdropFilter: 'blur(8px)' }}
            >
              {t.message}
              <button
                onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                className="ml-3 opacity-60 hover:opacity-100"
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx.toast;
}
