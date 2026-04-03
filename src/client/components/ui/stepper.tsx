import { Check } from 'lucide-react';
import { cn } from '../../lib/utils.js';
import type { ReactNode } from 'react';

interface Step {
  label: string;
  description: string;
  done: boolean;
  action?: { label: string; onClick: () => void };
  icon?: ReactNode;
}

export function Stepper({ steps, title }: { steps: Step[]; title: string }) {
  const allDone = steps.every((s) => s.done);
  if (allDone) return null;

  return (
    <div className="rounded-xl p-5 border mb-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">?</span>
        {title}
      </h3>
      <div className="space-y-3">
        {steps.map((step, i) => (
          <div key={i} className="flex items-start gap-3">
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5',
              step.done ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700/50 text-zinc-400'
            )}>
              {step.done ? <Check size={14} /> : i + 1}
            </div>
            <div className="flex-1">
              <div className={cn('text-sm font-medium', step.done && 'line-through text-zinc-500')}>
                {step.label}
              </div>
              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {step.description}
              </div>
              {!step.done && step.action && (
                <button
                  onClick={step.action.onClick}
                  className="mt-2 px-3 py-1 rounded-md text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"
                >
                  {step.action.label}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
