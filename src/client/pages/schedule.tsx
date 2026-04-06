import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, ChevronDown, Clock, X, Send } from 'lucide-react';
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { apiFetch } from '../lib/api.js';
import { Spinner } from '../components/ui/spinner.js';
import { safeHtml } from '../lib/sanitize.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { cn } from '../lib/utils.js';
import { useUpdatePost, usePublishPost } from '../hooks/use-posts.js';
import { TelegramPreview } from '../components/telegram-preview.js';
import { postStatusConfig } from '../lib/constants.js';
import { useConfirm } from '../components/ui/confirm-dialog.js';
import { useToast } from '../components/ui/toast.js';

export function SchedulePage() {
  const [view, setView] = useState<'week' | 'month'>(() => (new URLSearchParams(window.location.search).get('view') as any) ?? 'week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const { data: posts, isLoading: postsLoading } = useQuery({ queryKey: ['posts'], queryFn: () => apiFetch('/posts') });
  const { data: bots } = useQuery({ queryKey: ['bots'], queryFn: () => apiFetch('/bots') });
  const updateMut = useUpdatePost();
  const publishMut = usePublishPost();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const toast = useToast();
  const qc = useQueryClient();
  const [botFilter, setBotFilter] = useState<string>('all');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [scheduleModal, setScheduleModal] = useState<{ postId: number; date: string } | null>(null);
  const [viewPost, setViewPost] = useState<any>(null);
  const [viewContent, setViewContent] = useState('');

  // Channel lookup + bot list for filters
  const channelMap: Record<number, { botName: string; title: string; botId: number }> = {};
  const botList: Array<{ id: number; name: string }> = [];
  bots?.forEach((bot: any) => {
    botList.push({ id: bot.id, name: bot.name });
    bot.channels?.forEach?.((ch: any) => {
      channelMap[ch.id] = { botName: bot.name, title: ch.title, botId: bot.id };
    });
  });

  // Filter posts by selected bot
  const filterPost = (p: any) => {
    if (botFilter === 'all') return true;
    const ch = channelMap[p.channelId];
    return ch?.botId === Number(botFilter);
  };

  // Week days — start from today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i + weekOffset * 7);
    return d;
  });

  const dayNamesAll = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const monthNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  const monthNamesFull = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  // Month calendar data
  const monthDate = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return d;
  }, [monthOffset]);

  const monthDays = useMemo(() => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Monday-based: 0=Mon..6=Sun
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const days: { date: Date; isCurrentMonth: boolean }[] = [];

    // Days from previous month
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, isCurrentMonth: false });
    }

    // Days of current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true });
    }

    // Fill remaining cells to complete the grid (up to 42 = 6 rows)
    while (days.length % 7 !== 0) {
      const next = new Date(year, month + 1, days.length - startDow - lastDay.getDate() + 1);
      days.push({ date: next, isCurrentMonth: false });
    }

    return days;
  }, [monthDate]);

  // Group posts by day
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const toLocalDayKey = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  };

  const postsByDay = useMemo(() => {
    const map: Record<string, any[]> = {};
    (posts ?? []).filter(filterPost).forEach((post: any) => {
      if (!post.scheduledFor) return;
      const dayKey = toLocalDayKey(post.scheduledFor);
      if (!map[dayKey]) map[dayKey] = [];
      map[dayKey].push(post);
    });
    Object.values(map).forEach((arr) => arr.sort((a: any, b: any) => (a.scheduledFor ?? a.createdAt).localeCompare(b.scheduledFor ?? b.createdAt)));
    return map;
  }, [posts, botFilter]);

  // Unscheduled posts
  const unscheduled = (posts ?? []).filter((p: any) => !p.scheduledFor && p.status === 'draft').filter(filterPost);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));
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
      updateMut.mutate({ id: postId, scheduledFor: null as any, status: 'draft' }, {
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

  return (<>
    {confirmDialog}
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div>
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Расписание</h1>
            <InfoTip text="Перетащите черновик на день в календаре, или используйте кнопку «В очередь» на странице Постов для автоматического планирования." position="bottom" />
            <Link to="/posts" className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors hidden sm:inline">Все посты →</Link>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {botList.length > 1 && (
              <select value={botFilter} onChange={(e) => setBotFilter(e.target.value)}
                className="px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <option value="all">Все боты</option>
                {botList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}
            {unscheduled.length > 0 && (
              <span className="md:hidden text-[11px] px-2 py-1 rounded-lg bg-yellow-500/10 text-yellow-400">
                {unscheduled.length} незапланир.
              </span>
            )}
            <button onClick={() => view === 'week' ? setWeekOffset((w) => w - 1) : setMonthOffset((m) => m - 1)} className="p-2 rounded-lg hover:bg-white/5"><ChevronLeft size={18} /></button>
            <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => { setView('week'); setSelectedDay(null); }} className={cn('px-3 py-1.5 text-xs font-medium transition-colors', view === 'week' ? 'bg-blue-500/15 text-blue-400' : 'hover:bg-white/5')} style={{ color: view === 'week' ? undefined : 'var(--text-muted)' }}>Неделя</button>
              <button onClick={() => { setView('month'); setSelectedDay(null); }} className={cn('px-3 py-1.5 text-xs font-medium transition-colors', view === 'month' ? 'bg-blue-500/15 text-blue-400' : 'hover:bg-white/5')} style={{ color: view === 'month' ? undefined : 'var(--text-muted)' }}>Месяц</button>
            </div>
            <button onClick={() => view === 'week' ? setWeekOffset(0) : setMonthOffset(0)} className="px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-white/5" style={{ color: (view === 'week' ? weekOffset : monthOffset) === 0 ? 'var(--primary)' : 'var(--text-muted)' }}>Сегодня</button>
            <button onClick={() => view === 'week' ? setWeekOffset((w) => w + 1) : setMonthOffset((m) => m + 1)} className="p-2 rounded-lg hover:bg-white/5"><ChevronRight size={18} /></button>
          </div>
        </div>

        {/* Mobile: collapsible unscheduled section */}
        {unscheduled.length > 0 && (
          <MobileUnscheduled unscheduled={unscheduled} channelMap={channelMap} activeId={activeId} onPostClick={(p: any) => { setViewPost(p); setViewContent(p.content); }} />
        )}

        {/* Mobile: vertical day list (week view) */}
        {view === 'week' && (
        <div className="md:hidden space-y-3">
          {weekDays.map((day) => {
            const dayKey = `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}`;
            const dayPosts = postsByDay[dayKey] ?? [];
            const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
            const isToday = dayKey === todayKey;

            return (
              <DroppableDay key={dayKey} dayKey={dayKey} isActive={activeId !== null}>
                <div className={cn('flex items-center gap-3 py-2 px-3 rounded-t-lg text-xs font-medium', isToday ? 'bg-blue-500/15 text-blue-400' : '')} style={{ color: isToday ? undefined : 'var(--text-muted)' }}>
                  <div className="text-lg font-bold" style={{ color: isToday ? undefined : 'var(--text)' }}>{day.getDate()}</div>
                  <div>
                    <div>{isToday ? 'Сегодня' : dayNamesAll[day.getDay()]}</div>
                    <div className="text-[10px]">{monthNames[day.getMonth()]}</div>
                  </div>
                </div>

                <div className="space-y-1.5 mt-2 px-1">
                  {dayPosts.map((post: any) => (
                    <DraggablePost key={post.id} post={post} channelMap={channelMap} compact onPostClick={(p) => { setViewPost(p); setViewContent(p.content); }} />
                  ))}

                  {dayPosts.length === 0 && (
                    <div className="text-center py-3 text-[10px] rounded-lg border border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                      {activeId ? '📥 Бросьте сюда' : 'Нет постов'}
                    </div>
                  )}
                </div>
              </DroppableDay>
            );
          })}
        </div>
        )}

        {/* Desktop: sidebar + week grid */}
        {view === 'week' && (
        <div className="hidden md:flex gap-4">
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
                  <DraggablePost key={post.id} post={post} channelMap={channelMap} onPostClick={(p) => { setViewPost(p); setViewContent(p.content); }} />
                ))
              )}
            </div>
          </DroppableUnscheduled>

          {/* Week grid */}
          <div className="flex-1 overflow-x-auto">
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(7, minmax(120px, 1fr))' }}>
              {weekDays.map((day) => {
                const dayKey = `${day.getFullYear()}-${pad2(day.getMonth() + 1)}-${pad2(day.getDate())}`;
                const dayPosts = postsByDay[dayKey] ?? [];
                const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
                const isToday = dayKey === todayKey;

                return (
                  <DroppableDay key={dayKey} dayKey={dayKey} isActive={activeId !== null}>
                    <div className={cn('text-center py-2 rounded-t-lg text-xs font-medium', isToday ? 'bg-blue-500/15 text-blue-400' : '')} style={{ color: isToday ? undefined : 'var(--text-muted)' }}>
                      <div>{isToday ? 'Сегодня' : dayNamesAll[day.getDay()]}</div>
                      <div className="text-lg font-bold" style={{ color: isToday ? undefined : 'var(--text)' }}>{day.getDate()}</div>
                      <div className="text-[10px]">{monthNames[day.getMonth()]}</div>
                    </div>

                    <div className="space-y-1.5 mt-2">
                      {dayPosts.map((post: any) => {
                        const time = post.scheduledFor ? new Date(post.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        const ctx = channelMap[post.channelId];
                        return (
                          <DraggablePost key={post.id} post={post} channelMap={channelMap} compact onPostClick={(p) => { setViewPost(p); setViewContent(p.content); }} />
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
        )}

        {/* Month view */}
        {view === 'month' && (
          <div className="hidden md:flex gap-4">
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
                    <DraggablePost key={post.id} post={post} channelMap={channelMap} onPostClick={(p) => { setViewPost(p); setViewContent(p.content); }} />
                  ))
                )}
              </div>
            </DroppableUnscheduled>

            {/* Month calendar */}
            <div className="flex-1">
              <div className="text-center text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
                {monthNamesFull[monthDate.getMonth()]} {monthDate.getFullYear()}
              </div>

              {/* Day of week headers */}
              <div className="grid grid-cols-7 mb-0.5">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                  <div key={d} className="text-center text-[10px] font-medium py-1" style={{ color: 'var(--text-muted)' }}>{d}</div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7">
                {monthDays.map(({ date, isCurrentMonth }, i) => {
                  const dayKey = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
                  const dayPosts = postsByDay[dayKey] ?? [];
                  const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
                  const isToday = dayKey === todayKey;
                  const isSelected = dayKey === selectedDay;

                  return (
                    <DroppableDay key={`month-${dayKey}-${i}`} dayKey={dayKey} isActive={activeId !== null} compact>
                      <div
                        onClick={() => setSelectedDay(isSelected ? null : dayKey)}
                        className={cn(
                          'min-h-[44px] p-1 rounded-md border cursor-pointer transition-colors text-xs',
                          !isCurrentMonth && 'opacity-30',
                          isToday && 'bg-blue-500/10 border-blue-500/30',
                          isSelected && 'border-blue-500 bg-blue-500/5',
                          !isToday && !isSelected && 'hover:border-zinc-600'
                        )}
                        style={{ borderColor: (isToday || isSelected) ? undefined : 'var(--border)' }}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-[11px]" style={isToday ? { color: 'var(--primary)' } : isCurrentMonth ? {} : { color: 'var(--text-muted)' }}>{date.getDate()}</span>
                          {dayPosts.length > 0 && (
                            <span className="text-[9px] font-medium px-1 rounded bg-blue-500/15 text-blue-400">{dayPosts.length}</span>
                          )}
                        </div>
                        {dayPosts.length > 0 && (
                          <div className="flex gap-0.5 mt-0.5">
                            {dayPosts.slice(0, 3).map((p: any, j: number) => (
                              <span key={j} className={cn('w-1.5 h-1.5 rounded-full', postStatusConfig[p.status]?.dot ?? 'bg-zinc-500')} />
                            ))}
                          </div>
                        )}
                      </div>
                    </DroppableDay>
                  );
                })}
              </div>

              {/* Selected day posts */}
              {selectedDay && (
                <div className="mt-4 rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <h3 className="text-sm font-semibold mb-3">
                    {new Date(selectedDay + 'T00:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'long' })}
                  </h3>
                  <div className="space-y-2">
                    {(postsByDay[selectedDay] ?? []).map((post: any) => (
                      <DraggablePost key={post.id} post={post} channelMap={channelMap} compact onPostClick={(p) => { setViewPost(p); setViewContent(p.content); }} />
                    ))}
                    {!(postsByDay[selectedDay]?.length) && (
                      <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>Нет постов на этот день</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Month view — mobile */}
        {view === 'month' && (
          <div className="md:hidden">
            <div className="text-center text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>
              {monthNamesFull[monthDate.getMonth()]} {monthDate.getFullYear()}
            </div>

            <div className="grid grid-cols-7 mb-0.5">
              {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => (
                <div key={d} className="text-center text-[9px] font-medium py-0.5" style={{ color: 'var(--text-muted)' }}>{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {monthDays.map(({ date, isCurrentMonth }, i) => {
                const dayKey = `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
                const dayPosts = postsByDay[dayKey] ?? [];
                const todayKey = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
                const isToday = dayKey === todayKey;
                const isSelected = dayKey === selectedDay;

                return (
                  <DroppableDay key={`month-m-${dayKey}-${i}`} dayKey={dayKey} isActive={activeId !== null} compact>
                    <div
                      onClick={() => setSelectedDay(isSelected ? null : dayKey)}
                      className={cn(
                        'min-h-[40px] p-1 rounded-md border cursor-pointer transition-colors',
                        !isCurrentMonth && 'opacity-30',
                        isToday && 'bg-blue-500/10 border-blue-500/30',
                        isSelected && 'border-blue-500 bg-blue-500/5',
                        !isToday && !isSelected && 'hover:border-zinc-600'
                      )}
                      style={{ borderColor: (isToday || isSelected) ? undefined : 'var(--border)' }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-medium" style={isToday ? { color: 'var(--primary)' } : isCurrentMonth ? {} : { color: 'var(--text-muted)' }}>{date.getDate()}</span>
                        {dayPosts.length > 0 && <span className="text-[8px] font-medium px-0.5 rounded bg-blue-500/15 text-blue-400">{dayPosts.length}</span>}
                      </div>
                    </div>
                  </DroppableDay>
                );
              })}
            </div>

            {/* Selected day posts */}
            {selectedDay && (
              <div className="mt-4 rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-3">
                  {new Date(selectedDay + 'T00:00:00').toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'long' })}
                </h3>
                <div className="space-y-2">
                  {(postsByDay[selectedDay] ?? []).map((post: any) => (
                    <DraggablePost key={post.id} post={post} channelMap={channelMap} compact onPostClick={(p) => { setViewPost(p); setViewContent(p.content); }} />
                  ))}
                  {!(postsByDay[selectedDay]?.length) && (
                    <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>Нет постов на этот день</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-6 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {Object.entries(postStatusConfig).filter(([k]) => ['draft', 'queued', 'published', 'failed'].includes(k)).map(([key, cfg]) => (
            <span key={key} className="flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', cfg.dot)} />
              {cfg.label}
            </span>
          ))}
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activePost && (
            <div className="rounded-lg p-2.5 border text-[11px] shadow-xl opacity-90 w-52" style={{ background: 'var(--bg-card)', borderColor: 'var(--primary)' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <span className={cn('w-1.5 h-1.5 rounded-full', postStatusConfig[activePost.status]?.dot)} />
                <span className="font-medium truncate">{channelMap[activePost.channelId]?.botName ?? '?'}</span>
              </div>
              <div className="line-clamp-2" style={{ color: 'var(--text-muted)' }} dangerouslySetInnerHTML={safeHtml(activePost.content)} />
            </div>
          )}
        </DragOverlay>

        {/* Time picker modal */}
        {scheduleModal && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) setScheduleModal(null); }}>
            <div className="w-full max-w-xs p-5 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
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

      {/* View/Edit Post Modal */}
      {viewPost && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setViewPost(null); }}>
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto p-5 sm:p-6 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold">{viewPost.status === 'published' ? 'Просмотр поста' : 'Редактирование поста'}</h2>
              <button onClick={() => setViewPost(null)} className="p-1.5 rounded-lg hover:bg-white/5"><X size={16} /></button>
            </div>
            <div className="flex gap-6 flex-col lg:flex-row">
              <div className="lg:w-[340px] shrink-0">
                <div className="text-[11px] mb-2 font-medium" style={{ color: 'var(--text-muted)' }}>Telegram превью:</div>
                <TelegramPreview
                  content={viewPost.status === 'published' ? viewPost.content : viewContent}
                  imageUrl={viewPost.imageUrl}
                  channelTitle={channelMap[viewPost.channelId]?.title}
                />
              </div>
              <div className="flex-1 min-w-0">
                {viewPost.status === 'published' ? (
                  <div>
                    <div className="text-[11px] mb-2 font-medium" style={{ color: 'var(--text-muted)' }}>HTML-код:</div>
                    <pre className="w-full px-3 py-2 rounded-lg border text-xs font-mono whitespace-pre-wrap break-all" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>{viewPost.content}</pre>
                  </div>
                ) : (
                  <>
                    <div className="text-[11px] mb-2 font-medium" style={{ color: 'var(--text-muted)' }}>Редактор (HTML):</div>
                    <textarea value={viewContent} onChange={(e) => setViewContent(e.target.value)} rows={12}
                      className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                    <div className="flex gap-3 justify-end mt-4 flex-wrap">
                      <button onClick={() => setViewPost(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
                      {viewPost.status !== 'published' && (
                        <button
                          onClick={() => {
                            const hasChanges = viewContent !== viewPost.content;
                            const channelName = channelMap[viewPost.channelId]?.title ?? 'канал';
                            confirm({
                              title: 'Опубликовать сейчас?',
                              message: `Пост будет ${hasChanges ? 'сохранён и ' : ''}отправлен в «${channelName}» прямо сейчас.`,
                              confirmLabel: 'Опубликовать',
                              variant: 'warning',
                              onConfirm: () => {
                                if (hasChanges) updateMut.mutate({ id: viewPost.id, content: viewContent });
                                publishMut.mutate(viewPost.id, {
                                  onSuccess: () => { toast.success('Опубликовано!'); setViewPost(null); },
                                  onError: (err) => toast.error(`Ошибка: ${(err as Error).message}`),
                                });
                              },
                            });
                          }}
                          disabled={publishMut.isPending}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 flex items-center gap-1.5"
                        >
                          <Send size={14} /> Опубликовать сейчас
                        </button>
                      )}
                      <button
                        onClick={() => { updateMut.mutate({ id: viewPost.id, content: viewContent }); setViewPost(null); }}
                        disabled={viewContent === viewPost.content}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ background: viewContent === viewPost.content ? 'var(--text-muted)' : 'var(--primary)' }}
                      >Сохранить</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </DndContext>
  </>);
}

// ─── Draggable Post ──────────────────────────────────────────────────────────

function DraggablePost({ post, channelMap, compact, onPostClick }: { post: any; channelMap: Record<number, any>; compact?: boolean; onPostClick?: (post: any) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: post.id });
  const ctx = channelMap[post.channelId];
  const time = post.scheduledFor ? new Date(post.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

  if (compact) {
    return (
      <div ref={setNodeRef} {...listeners} {...attributes}
        onClick={() => onPostClick?.(post)}
        className={cn('rounded-lg p-2 border text-[10px] cursor-pointer hover:border-zinc-600 transition-all', isDragging && 'opacity-30')}
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-1 mb-0.5">
          <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', postStatusConfig[post.status]?.dot)} />
          {time && <span className="font-mono">{time}</span>}
          <span className="truncate" style={{ color: 'var(--text-muted)' }}>{ctx?.title ?? ''}</span>
        </div>
        <div className="line-clamp-2" style={{ color: 'var(--text-muted)' }} dangerouslySetInnerHTML={safeHtml(post.content)} />
      </div>
    );
  }

  return (
    <div ref={setNodeRef} {...listeners} {...attributes}
      onClick={() => onPostClick?.(post)}
      className={cn('rounded-lg p-2.5 border text-[11px] cursor-pointer hover:border-zinc-600 transition-all', isDragging && 'opacity-30')}
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={cn('w-1.5 h-1.5 rounded-full', postStatusConfig[post.status]?.dot)} />
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
      className={cn('w-56 shrink-0 rounded-lg p-2 -m-2 transition-colors', isOver && 'bg-yellow-500/10 ring-1 ring-yellow-500/30', isActive && !isOver && 'bg-white/[0.02]')}
    >
      {children}
    </div>
  );
}

function MobileUnscheduled({ unscheduled, channelMap, activeId, onPostClick }: { unscheduled: any[]; channelMap: Record<number, any>; activeId: number | null; onPostClick: (p: any) => void }) {
  const [open, setOpen] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: 'unscheduled' });

  return (
    <div ref={setNodeRef} className={cn('md:hidden mb-3 rounded-lg border p-2 transition-colors', isOver && 'bg-yellow-500/10 ring-1 ring-yellow-500/30')} style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <button onClick={() => setOpen(!open)} className="flex items-center justify-between w-full text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
        <span>Незапланированные ({unscheduled.length})</span>
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-2 mt-2 max-h-60 overflow-y-auto">
          {unscheduled.map((post: any) => (
            <DraggablePost key={post.id} post={post} channelMap={channelMap} onPostClick={onPostClick} />
          ))}
        </div>
      )}
    </div>
  );
}

function DroppableDay({ dayKey, isActive, compact, children }: { dayKey: string; isActive: boolean; compact?: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: dayKey });

  return (
    <div ref={setNodeRef}
      className={cn('rounded-lg transition-colors', !compact && 'min-h-[200px]', isOver && 'bg-blue-500/10 ring-1 ring-blue-500/30', isActive && !isOver && 'bg-white/[0.02]')}
    >
      {children}
    </div>
  );
}
