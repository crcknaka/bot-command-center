import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
// DnD will be added in future iteration
import { apiFetch } from '../lib/api.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { cn } from '../lib/utils.js';
import { useUpdatePost } from '../hooks/use-posts.js';

const statusColors: Record<string, string> = {
  draft: 'bg-zinc-500',
  queued: 'bg-yellow-500',
  published: 'bg-green-500',
  failed: 'bg-red-500',
};

const statusLabels: Record<string, string> = {
  draft: 'Черновик',
  queued: 'В очереди',
  published: 'Опубликован',
  failed: 'Ошибка',
};

const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function SchedulePage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const { data: posts } = useQuery({ queryKey: ['posts'], queryFn: () => apiFetch('/posts') });
  const { data: bots } = useQuery({ queryKey: ['bots'], queryFn: () => apiFetch('/bots') });
  const updateMut = useUpdatePost();
  const qc = useQueryClient();

  // Channel lookup
  const channelMap: Record<number, { botName: string; title: string; botId: number }> = {};
  bots?.forEach((bot: any) => {
    bot.channels?.forEach?.((ch: any) => {
      channelMap[ch.id] = { botName: bot.name, title: ch.title, botId: bot.id };
    });
  });

  // Week days
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7); // Monday
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
  const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  // Group posts by day
  const postsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    (posts ?? []).forEach((post: any) => {
      if (!post.scheduledFor) return; // Only show scheduled posts on calendar
      const dayKey = post.scheduledFor.slice(0, 10); // YYYY-MM-DD
      if (!map[dayKey]) map[dayKey] = [];
      map[dayKey].push(post);
    });
    // Sort each day by scheduledFor or createdAt
    Object.values(map).forEach((arr) => arr.sort((a: any, b: any) => (a.scheduledFor ?? a.createdAt).localeCompare(b.scheduledFor ?? b.createdAt)));
    return map;
  }, [posts]);

  // Schedule a post to a specific date/hour
  const schedulePost = (postId: number, date: Date, hour: number) => {
    const scheduled = new Date(date);
    scheduled.setHours(hour, 0, 0, 0);
    updateMut.mutate({ id: postId, scheduledFor: scheduled.toISOString(), status: 'queued' }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
    });
  };

  // Unscheduled posts (drafts without scheduledFor)
  const unscheduled = (posts ?? []).filter((p: any) => !p.scheduledFor && (p.status === 'draft' || p.status === 'queued'));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Расписание</h1>
          <InfoTip text="Визуальный календарь публикаций. Перетащите черновик на день/час чтобы запланировать. Посты автоматически публикуются в назначенное время." position="bottom" />
        </div>
        <div className="flex items-center gap-2">
          {unscheduled.length > 0 && (
            <span className="md:hidden text-[11px] px-2 py-1 rounded-lg bg-yellow-500/10 text-yellow-400">
              {unscheduled.length} незапланир.
            </span>
          )}
          <button onClick={() => setWeekOffset((w) => w - 1)} className="p-2 rounded-lg hover:bg-white/5"><ChevronLeft size={18} /></button>
          <button onClick={() => setWeekOffset(0)} className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/5" style={{ color: weekOffset === 0 ? 'var(--primary)' : 'var(--text-muted)' }}>Сегодня</button>
          <button onClick={() => setWeekOffset((w) => w + 1)} className="p-2 rounded-lg hover:bg-white/5"><ChevronRight size={18} /></button>
        </div>
      </div>

      <div className="flex gap-4">
        {/* Unscheduled sidebar — hidden on mobile */}
        <div className="hidden md:block w-56 shrink-0">
          <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
            Незапланированные ({unscheduled.length})
          </h3>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
            {unscheduled.length === 0 ? (
              <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Нет черновиков без расписания</p>
            ) : (
              unscheduled.map((post: any) => {
                const ctx = channelMap[post.channelId];
                return (
                  <div key={post.id} className="rounded-lg p-2.5 border text-[11px] cursor-grab" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={cn('w-1.5 h-1.5 rounded-full', statusColors[post.status])} />
                      <span className="font-medium truncate">{ctx?.botName ?? '?'}</span>
                    </div>
                    <div className="line-clamp-2" style={{ color: 'var(--text-muted)' }} dangerouslySetInnerHTML={{ __html: post.content }} />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Week grid */}
        <div className="flex-1 overflow-x-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {weekDays.map((day, i) => {
              const dayKey = day.toISOString().slice(0, 10);
              const dayPosts = postsByDay[dayKey] ?? [];
              const isToday = dayKey === today.toISOString().slice(0, 10);

              return (
                <div key={dayKey} className="min-h-[200px]">
                  {/* Day header */}
                  <div className={cn('text-center py-2 rounded-t-lg text-xs font-medium', isToday ? 'bg-blue-500/15 text-blue-400' : '')} style={{ color: isToday ? undefined : 'var(--text-muted)' }}>
                    <div>{dayNames[i]}</div>
                    <div className="text-lg font-bold" style={{ color: isToday ? undefined : 'var(--text)' }}>{day.getDate()}</div>
                    <div className="text-[10px]">{monthNames[day.getMonth()]}</div>
                  </div>

                  {/* Posts for this day */}
                  <div className="space-y-1.5 mt-2">
                    {dayPosts.map((post: any) => {
                      const time = post.scheduledFor ? new Date(post.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                      const ctx = channelMap[post.channelId];
                      return (
                        <div key={post.id} className="rounded-lg p-2 border text-[10px]" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                          <div className="flex items-center gap-1 mb-0.5">
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusColors[post.status])} />
                            {time && <span className="font-mono">{time}</span>}
                            <span className="truncate" style={{ color: 'var(--text-muted)' }}>{ctx?.title ?? ''}</span>
                          </div>
                          <div className="line-clamp-2" style={{ color: 'var(--text-muted)' }} dangerouslySetInnerHTML={{ __html: post.content }} />
                        </div>
                      );
                    })}

                    {dayPosts.length === 0 && (
                      <div className="text-center py-4 text-[10px] rounded-lg border border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                        Нет постов
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-6 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {Object.entries(statusLabels).map(([key, label]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className={cn('w-2 h-2 rounded-full', statusColors[key])} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
