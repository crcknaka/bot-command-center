import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Send, Clock, FileText } from 'lucide-react';
import { apiFetch } from '../../lib/api.js';

/** Today / queued / drafts, each linking to the list behind the number */
export function PostCounters() {
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: () => apiFetch('/stats/overview') });
  const items = [
    { label: 'Сегодня', value: stats?.postsToday, icon: Send, color: 'text-green-400', to: '/posts?status=published' },
    { label: 'В очереди', value: stats?.queuedPosts, icon: Clock, color: 'text-yellow-400', to: '/schedule' },
    { label: 'Черновики', value: stats?.draftPosts, icon: FileText, color: 'text-purple-400', to: '/posts?status=draft' },
  ];
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((s) => {
        const Icon = s.icon;
        return (
          <Link key={s.label} to={s.to} className="rounded-xl p-3 border hover:border-zinc-600 transition-colors" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between">
              <div className="text-xl font-bold">{s.value ?? '–'}</div>
              <Icon size={16} className={s.color} />
            </div>
            <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </Link>
        );
      })}
    </div>
  );
}
