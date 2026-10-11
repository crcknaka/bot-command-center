import React, { type ReactNode } from 'react';

/** Ctrl+Enter submits the closest form or clicks the nearest primary button */
export const ctrlEnter = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const form = (e.target as HTMLElement).closest('form');
    if (form) { form.requestSubmit(); return; }
    // Fallback: find the save/submit button in the modal
    const modal = (e.target as HTMLElement).closest('[class*="rounded-2xl"]');
    const btn = modal?.querySelector('button[class*="text-white"]') as HTMLButtonElement | null;
    if (btn && !btn.disabled) btn.click();
  }
};

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md p-6 rounded-2xl border max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}

export function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return <div className="text-xs font-semibold flex items-center gap-1.5 pt-3 pb-1 border-t mt-3" style={{ borderColor: 'var(--border)' }}>{icon} {title}</div>;
}

export function cronToHuman(cron: string | null): string {
  if (!cron) return 'Только вручную';
  const presets: Record<string, string> = {
    '0 9 * * *': 'Каждый день в 9:00',
    '0 9,18 * * *': 'Два раза в день (9:00, 18:00)',
    '0 */6 * * *': 'Каждые 6 часов',
    '0 * * * *': 'Каждый час',
    '*/30 * * * *': 'Каждые 30 минут',
    '0 */4 * * *': 'Каждые 4 часа',
    '0 */12 * * *': 'Каждые 12 часов',
  };
  return presets[cron] ?? cron;
}
