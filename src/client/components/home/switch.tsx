import { cn } from '../../lib/utils.js';

export function Switch({ on, disabled, onChange, label }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className={cn('relative w-10 h-6 rounded-full shrink-0 transition-colors disabled:opacity-50', on ? 'bg-blue-600' : 'bg-zinc-700')}>
      <span className={cn('absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform', on && 'translate-x-4')} />
    </button>
  );
}
