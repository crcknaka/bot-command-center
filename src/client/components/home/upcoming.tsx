import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Calendar } from 'lucide-react';
import { apiFetch } from '../../lib/api.js';
import { useToast } from '../ui/toast.js';

/** Posts waiting in the queue, soonest first, with a way to pull one back into drafts */
export function Upcoming({ channelTitle, limit = 8 }: { channelTitle: (channelId: number) => string; limit?: number }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: queued } = useQuery({ queryKey: ['posts', { status: 'queued' }], queryFn: () => apiFetch('/posts?status=queued') });

  const upcoming = (queued ?? [])
    .slice()
    .sort((a: any, b: any) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))
    .slice(0, limit);

  const unqueueMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'draft' }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posts'] }); qc.invalidateQueries({ queryKey: ['stats'] }); toast.success('Публикация отменена, пост в черновиках'); },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Calendar size={14} className="text-yellow-400" /> Ближайшие публикации</h3>
        <Link to="/schedule" className="text-[10px] text-zinc-500 hover:text-zinc-300">Расписание →</Link>
      </div>
      {upcoming.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>Нет запланированных постов</p>
      ) : (
        <div className="space-y-3">
          {upcoming.map((p: any) => (
            <div key={p.id} className="text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] text-yellow-400 whitespace-nowrap">
                  {p.scheduledFor
                    ? new Date(p.scheduledFor).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                    : 'скоро'}
                </span>
                <span className="truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>{channelTitle(p.channelId)}</span>
                <button type="button" disabled={unqueueMut.isPending} onClick={() => unqueueMut.mutate(p.id)}
                  className="shrink-0 ml-auto text-[10px] text-zinc-500 hover:text-red-400 disabled:opacity-40" title="Убрать из очереди в черновики">
                  Отменить
                </button>
              </div>
              <div className="truncate mt-0.5">{p.content?.replace(/<[^>]+>/g, '').slice(0, 100)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
