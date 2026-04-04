import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Clock } from 'lucide-react';
import { DndContext, DragOverlay, useDraggable, useDroppable, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { apiFetch } from '../lib/api.js';
import { Spinner } from '../components/ui/spinner.js';
import { safeHtml } from '../lib/sanitize.js';
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

export function SchedulePage() {
  const [weekOffset, setWeekOffset] = useState(0);
  const { data: posts, isLoading: postsLoading } = useQuery({ queryKey: ['posts'], queryFn: () => apiFetch('/posts') });
  const { data: bots } = useQuery({ queryKey: ['bots'], queryFn: () => apiFetch('/bots') });
  const updateMut = useUpdatePost();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [scheduleModal, setScheduleModal] = useState<{ postId: number; date: string } | null>(null);

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
  startOfWeek.setDate(today.getDate() - today.getDay() + 1 + weekOffset * 7);
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
      if (!post.scheduledFor) return;
      const dayKey = post.scheduledFor.slice(0, 10);
      if (!map[dayKey]) map[dayKey] = [];
      map[dayKey].push(post);
    });
    Object.values(map).forEach((arr) => arr.sort((a: any, b: any) => (a.scheduledFor ?? a.createdAt).localeCompare(b.scheduledFor ?? b.createdAt)));
    return map;
  }, [posts]);

  // Unscheduled posts
  const unscheduled = (posts ?? []).filter((p: any) => !p.scheduledFor && (p.status === 'draft' || p.status === 'approved' || p.status === 'queued'));

  const activePost = activeId ? (posts ?? []).find((p: any) => p.id === activeId) : null;

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(Number(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    if (!event.over) return;

    const postId = Number(event.active.id);
    const target = String(event.over.id);

    if (target === 'unscheduled') {
      // Move back to unscheduled
      updateMut.mutate({ id: postId, scheduledFor: null as any, status: 'approved' }, {
        onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
      });
      return;
    }

    // Show time picker modal
    setScheduleModal({ postId, date: target });
  };

  const schedulePost = (postId: number, date: string, hour: number) => {
    const scheduled = new Date(date + 'T00:00:00');
    scheduled.setHours(hour, 0, 0, 0);
    updateMut.mutate({ id: postId, scheduledFor: scheduled.toISOString(), status: 'queued' }, {
      onSuccess: () => qc.invalidateQueries({ queryKey: ['posts'] }),
    });
    setScheduleModal(null);
  };

  if (postsLoading) {
    return <Spinner text="Загрузка расписания..." />;
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Расписание</h1>
            <InfoTip text="Перетащите пост из левой панели на день в календаре. Посты автоматически публикуются в назначенное время." position="bottom" />
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
          {/* Unscheduled sidebar (droppable) */}
          <DroppableUnscheduled isActive={activeId !== null}>
            <h3 className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>
              Незапланированные ({unscheduled.length})
            </h3>
            <div className="space-y-2 max-h-[70vh] overflow-y-auto pr-1">
              {unscheduled.length === 0 ? (
                <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{activeId ? '📥 Бросьте сюда чтобы снять с расписания' : 'Нет черновиков'}</p>
              ) : (
                unscheduled.map((post: any) => (
                  <DraggablePost key={post.id} post={post} channelMap={channelMap} />
                ))
              )}
            </div>
          </DroppableUnscheduled>

          {/* Week grid */}
          <div className="flex-1 overflow-x-auto">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
              {weekDays.map((day, i) => {
                const dayKey = day.toISOString().slice(0, 10);
                const dayPosts = postsByDay[dayKey] ?? [];
                const isToday = dayKey === today.toISOString().slice(0, 10);

                return (
                  <DroppableDay key={dayKey} dayKey={dayKey} isActive={activeId !== null}>
                    <div className={cn('text-center py-2 rounded-t-lg text-xs font-medium', isToday ? 'bg-blue-500/15 text-blue-400' : '')} style={{ color: isToday ? undefined : 'var(--text-muted)' }}>
                      <div>{dayNames[i]}</div>
                      <div className="text-lg font-bold" style={{ color: isToday ? undefined : 'var(--text)' }}>{day.getDate()}</div>
                      <div className="text-[10px]">{monthNames[day.getMonth()]}</div>
                    </div>

                    <div className="space-y-1.5 mt-2">
                      {dayPosts.map((post: any) => {
                        const time = post.scheduledFor ? new Date(post.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        const ctx = channelMap[post.channelId];
                        return (
                          <DraggablePost key={post.id} post={post} channelMap={channelMap} compact />
                        );
                      })}

                      {dayPosts.length === 0 && (
                        <div className="text-center py-4 text-[10px] rounded-lg border border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                          {activeId ? '📥 Бросьте сюда' : 'Нет постов'}
                        </div>
                      )}
                    </div>
                  </DroppableDay>
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

        {/* Drag overlay */}
        <DragOverlay>
          {activePost && (
            <div className="rounded-lg p-2.5 border text-[11px] shadow-xl opacity-90 w-52" style={{ background: 'var(--bg-card)', borderColor: 'var(--primary)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={cn('w-1.5 h-1.5 rounded-full', statusColors[activePost.status])} />
                <span className="font-medium truncate">{channelMap[activePost.channelId]?.botName ?? '?'}</span>
              </div>
              <div className="line-clamp-2" style={{ color: 'var(--text-muted)' }} dangerouslySetInnerHTML={safeHtml(activePost.content)} />
            </div>
          )}
        </DragOverlay>

        {/* Time picker modal */}
        {scheduleModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setScheduleModal(null)}>
            <div className="w-full max-w-xs p-5 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2"><Clock size={16} /> Выберите время</h3>
              <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>
                Дата: {new Date(scheduleModal.date + 'T00:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'short' })}
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {Array.from({ length: 24 }, (_, h) => (
                  <button key={h} onClick={() => schedulePost(scheduleModal.postId, scheduleModal.date, h)}
                    className="px-2 py-2 rounded-lg text-xs font-mono hover:bg-blue-500/15 hover:text-blue-400 transition-colors"
                    style={{ color: 'var(--text-muted)' }}>
                    {String(h).padStart(2, '0')}:00
                  </button>
                ))}
              </div>
              <button onClick={() => setScheduleModal(null)} className="w-full mt-3 py-2 rounded-lg text-xs" style={{ color: 'var(--text-muted)' }}>Отмена</button>
            </div>
          </div>
        )}
      </div>
    </DndContext>
  );
}

// ─── Draggable Post ──────────────────────────────────────────────────────────

function DraggablePost({ post, channelMap, compact }: { post: any; channelMap: Record<number, any>; compact?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: post.id });
  const ctx = channelMap[post.channelId];
  const time = post.scheduledFor ? new Date(post.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  if (compact) {
    return (
      <div ref={setNodeRef} {...listeners} {...attributes}
        className={cn('rounded-lg p-2 border text-[10px] cursor-grab active:cursor-grabbing transition-opacity', isDragging && 'opacity-30')}
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1 mb-0.5">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', statusColors[post.status])} />
          {time && <span className="font-mono">{time}</span>}
          <span className="truncate" style={{ color: 'var(--text-muted)' }}>{ctx?.title ?? ''}</span>
        </div>
        <div className="line-clamp-2" style={{ color: 'var(--text-muted)' }} dangerouslySetInnerHTML={safeHtml(post.content)} />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      className={cn('rounded-lg p-2.5 border text-[11px] cursor-grab active:cursor-grabbing transition-opacity', isDragging && 'opacity-30')}
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn('w-1.5 h-1.5 rounded-full', statusColors[post.status])} />
        <span className="font-medium truncate">{ctx?.botName ?? '?'}</span>
      </div>
      <div className="line-clamp-2" style={{ color: 'var(--text-muted)' }} dangerouslySetInnerHTML={safeHtml(post.content)} />
    </div>
  );
}

// ─── Droppable Day ───────────────────────────────────────────────────────────

function DroppableUnscheduled({ isActive, children }: { isActive: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled' });
  return (
    <div ref={setNodeRef}
      className={cn('hidden md:block w-56 shrink-0 rounded-lg p-2 -m-2 transition-colors', isOver && 'bg-yellow-500/10 ring-1 ring-yellow-500/30', isActive && !isOver && 'bg-white/[0.02]')}
    >
      {children}
    </div>
  );
}

function DroppableDay({ dayKey, isActive, children }: { dayKey: string; isActive: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey });

  return (
    <div ref={setNodeRef}
      className={cn('min-h-[200px] rounded-lg transition-colors', isOver && 'bg-blue-500/10 ring-1 ring-blue-500/30', isActive && !isOver && 'bg-white/[0.02]')}
    >
      {children}
    </div>
  );
}
