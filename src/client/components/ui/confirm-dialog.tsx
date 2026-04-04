import { useState, useCallback, type ReactNode } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState>({ open: false, title: '', message: '', onConfirm: () => {} });

  const confirm = useCallback((opts: ConfirmOptions) => {
    setState({ ...opts, open: true });
  }, []);

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }));
  }, []);

  const handleConfirm = useCallback(() => {
    state.onConfirm();
    close();
  }, [state, close]);

  const dialog = state.open ? (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="w-full max-w-sm p-5 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${state.variant === 'warning' ? 'bg-yellow-500/15' : 'bg-red-500/15'}`}>
            {state.variant === 'warning'
              ? <AlertTriangle size={20} className="text-yellow-400" />
              : <Trash2 size={20} className="text-red-400" />
            }
          </div>
          <div>
            <h3 className="text-sm font-semibold">{state.title}</h3>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{state.message}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={close} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>
            {state.cancelLabel ?? 'Отмена'}
          </button>
          <button onClick={handleConfirm} className={`px-4 py-2 rounded-lg text-sm font-medium text-white ${state.variant === 'warning' ? 'bg-yellow-600 hover:bg-yellow-700' : 'bg-red-600 hover:bg-red-700'}`}>
            {state.confirmLabel ?? 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, dialog };
}
