import { useEffect, useRef, type ReactNode } from 'react';

const maxWidths = {
  xs: 'sm:max-w-xs',
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-xl',
};

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  maxWidth?: keyof typeof maxWidths;
  children: ReactNode;
}

export function Modal({ open, onClose, title, subtitle, maxWidth = 'md', children }: ModalProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const mouseDownTarget = useRef<EventTarget | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-4"
      onMouseDown={(e) => { mouseDownTarget.current = e.target; }}
      onClick={(e) => {
        if (e.target === backdropRef.current && mouseDownTarget.current === backdropRef.current) {
          onClose();
        }
      }}
    >
      <div
        className={`w-full ${maxWidths[maxWidth]} max-h-[90vh] overflow-y-auto p-5 sm:p-6 rounded-2xl border`}
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        {title && <h2 className="text-lg font-bold mb-0.5">{title}</h2>}
        {subtitle && <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
        {!title && !subtitle ? children : <div>{children}</div>}
      </div>
    </div>
  );
}
