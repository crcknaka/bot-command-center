import { Loader2 } from 'lucide-react';

export function Spinner({ text }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--primary)' }} />
      {text && <span className="text-sm" style={{ color: 'var(--text-muted)' }}>{text}</span>}
    </div>
  );
}
