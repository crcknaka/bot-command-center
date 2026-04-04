import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Users, MessageSquare, Clock, TrendingUp, Pencil, Search } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { EmptyState } from '../components/ui/empty-state.js';
import { cn } from '../lib/utils.js';
import { UserProfileModal } from '../components/user-profile.js';

const typeLabels: Record<string, string> = {
  text: 'Текст', photo: 'Фото', video: 'Видео', sticker: 'Стикер',
  voice: 'Голосовое', video_note: 'Кружок', animation: 'GIF',
  forward: 'Пересылка', document: 'Файл', audio: 'Аудио', reaction: 'Реакция', other: 'Другое',
};

const typeColors: Record<string, string> = {
  text: 'bg-blue-500', photo: 'bg-green-500', video: 'bg-purple-500', sticker: 'bg-yellow-500',
  voice: 'bg-orange-500', video_note: 'bg-pink-500', animation: 'bg-cyan-500',
  forward: 'bg-zinc-500', document: 'bg-indigo-500', audio: 'bg-red-500', reaction: 'bg-rose-500', other: 'bg-zinc-600',
};

export function AnalyticsPage() {
  const qc = useQueryClient();
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>('week');
  const [selectedThread, setSelectedThread] = useState<string>('all');
  const [editThread, setEditThread] = useState<{ id: string; title: string } | null>(null);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const [msgSearch, setMsgSearch] = useState('');

  const { data: searchResults } = useQuery({
    queryKey: ['stats-search', selectedChat, msgSearch],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/search?q=${encodeURIComponent(msgSearch)}`),
    enabled: !!selectedChat && msgSearch.length >= 2,
  });

  const threadParam = selectedThread !== 'all' ? `&threadId=${selectedThread}` : '';
  const tz = new Date().getTimezoneOffset(); // minutes offset from UTC

  const { data: chats } = useQuery({ queryKey: ['stats-chats'], queryFn: () => apiFetch('/stats/chats') });
  const { data: threads } = useQuery({
    queryKey: ['stats-threads', selectedChat],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/threads`),
    enabled: !!selectedChat,
  });
  const { data: summary } = useQuery({
    queryKey: ['stats-summary', selectedChat, selectedThread],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/summary?tz=${tz}${threadParam}`),
    enabled: !!selectedChat,
  });
  const { data: topUsers } = useQuery({
    queryKey: ['stats-top', selectedChat, period, selectedThread],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/top-users?period=${period}${threadParam}`),
    enabled: !!selectedChat,
  });
  const { data: activity } = useQuery({
    queryKey: ['stats-activity', selectedChat, period, selectedThread],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/activity?period=${period}${threadParam}`),
    enabled: !!selectedChat,
  });
  const { data: types } = useQuery({
    queryKey: ['stats-types', selectedChat, period, selectedThread],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/types?period=${period}${threadParam}`),
    enabled: !!selectedChat,
  });
  const { data: hourly } = useQuery({
    queryKey: ['stats-hourly', selectedChat, period, selectedThread],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/hourly?period=${period}&tz=${tz}${threadParam}`),
    enabled: !!selectedChat,
  });
  const { data: weekdays } = useQuery({
    queryKey: ['stats-weekdays', selectedChat, period, selectedThread],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/weekdays?period=${period}${threadParam}`),
    enabled: !!selectedChat,
  });
  const { data: engagement } = useQuery({
    queryKey: ['stats-engagement', selectedChat, period, selectedThread],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/engagement?period=${period}${threadParam}`),
    enabled: !!selectedChat,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Аналитика</h1>
          <InfoTip text="Статистика сообщений в группах. Данные собираются автоматически пока бот запущен и работает в группе." position="bottom" />
        </div>
      </div>

      {/* Chat selector */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {chats?.length === 0 && (
          <div className="w-full">
            <EmptyState icon={BarChart3} title="Нет данных" description="Статистика появится когда пользователи начнут писать в группах с активным ботом." />
          </div>
        )}
        {chats?.map((chat: any) => (
          <button key={chat.chatId} onClick={() => { setSelectedChat(chat.chatId); setSelectedThread('all'); }}
            className={cn('px-4 py-3 rounded-xl border text-left transition-colors', selectedChat === chat.chatId ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
            style={{ borderColor: selectedChat === chat.chatId ? undefined : 'var(--border)', background: selectedChat === chat.chatId ? undefined : 'var(--bg-card)' }}>
            <div className="text-sm font-medium">{chat.type === 'channel' ? '📢' : '👥'} {chat.title}</div>
            <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {chat.weekMessages} сообщ. · {chat.weekUsers} юзеров за неделю
            </div>
          </button>
        ))}
      </div>

      {selectedChat && summary && (
        <div>
          {/* Period + Thread selector */}
          <div className="flex gap-2 mb-4 flex-wrap items-center">
            {[['week', '7 дней'], ['2weeks', '14 дней'], ['month', '30 дней'], ['3months', '90 дней'], ['all', 'Всё время']].map(([v, l]) => (
              <button key={v} onClick={() => setPeriod(v)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', period === v ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300')}>
                {l}
              </button>
            ))}
            {threads && threads.length > 0 && (
              <div className="flex items-center gap-1 ml-2">
                <select value={selectedThread} onChange={(e) => setSelectedThread(e.target.value)}
                  className="px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                  <option value="all">Все топики</option>
                  {threads.map((t: any) => (
                    <option key={t.threadId} value={t.threadId}>{t.title} ({t.messageCount})</option>
                  ))}
                </select>
                {selectedThread !== 'all' && (
                  <button onClick={() => {
                    const current = threads.find((t: any) => t.threadId === selectedThread);
                    setEditThread({ id: selectedThread, title: current?.title ?? '' });
                  }} className="p-1 rounded hover:bg-white/5" title="Переименовать топик">
                    <Pencil size={11} className="text-zinc-500" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Сообщений', value: (summary[period] ?? summary.week)?.messages ?? 0, icon: MessageSquare, color: 'text-blue-400', tip: 'Общее количество сообщений за выбранный период.' },
              { label: 'Активных юзеров', value: (summary[period] ?? summary.week)?.users ?? 0, icon: Users, color: 'text-green-400', tip: 'Уникальные пользователи, написавшие хотя бы одно сообщение.' },
              { label: 'Среднее в день', value: (summary[period] ?? summary.week)?.avgPerDay ?? 0, icon: TrendingUp, color: 'text-yellow-400', tip: 'Среднее количество сообщений в день за период.' },
              { label: 'Пиковый час', value: summary.peakHour ? `${String(summary.peakHour.hour).padStart(2, '0')}:00` : '—', icon: Clock, color: 'text-purple-400', tip: 'Час дня когда чат наиболее активен (по всем данным).' },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">{s.value}</div>
                      <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                        {s.label}
                        <InfoTip text={s.tip} position="top" />
                      </div>
                    </div>
                    <Icon size={20} className={s.color} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Trend + Engagement */}
          {engagement && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {/* Trend */}
              <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  Тренд
                  <InfoTip text="Сравнение текущего периода с предыдущим таким же (например эта неделя vs прошлая)." position="top" />
                </h3>
                <div className="text-center">
                  <div className={cn('text-3xl font-bold', engagement.trend.change > 0 ? 'text-green-400' : engagement.trend.change < 0 ? 'text-red-400' : 'text-zinc-400')}>
                    {engagement.trend.change > 0 ? '+' : ''}{engagement.trend.change}%
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                    {engagement.trend.currentMessages} vs {engagement.trend.prevMessages} сообщ.
                  </div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {engagement.trend.currentUsers} vs {engagement.trend.prevUsers} юзеров
                  </div>
                </div>
              </div>

              {/* Engagement tiers */}
              <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  Вовлечённость
                  <InfoTip text="Power = 10+ сообщ/день. Активные = 1-10/день. Редкие = менее 1/день." position="top" />
                </h3>
                <div className="space-y-2">
                  {[
                    { label: '🔥 Power users', count: engagement.tiers.power, color: 'bg-red-500' },
                    { label: '💬 Активные', count: engagement.tiers.active, color: 'bg-blue-500' },
                    { label: '👀 Редкие', count: engagement.tiers.casual, color: 'bg-zinc-500' },
                  ].map((t) => {
                    const pct = engagement.tiers.total > 0 ? Math.round((t.count / engagement.tiers.total) * 100) : 0;
                    return (
                      <div key={t.label} className="flex items-center gap-2 text-xs">
                        <span className="w-28">{t.label}</span>
                        <div className="flex-1 h-2 rounded-full bg-zinc-800 overflow-hidden">
                          <div className={cn('h-full rounded-full', t.color)} style={{ width: `${pct}%`, opacity: 0.7 }} />
                        </div>
                        <span className="w-14 text-right text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.count} ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* New vs Returning + Gone */}
              <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                  Аудитория
                  <InfoTip text="Новые — писали впервые в этом периоде. Вернувшиеся — писали и раньше. Ушли — писали раньше, но молчат." position="top" />
                </h3>
                <div className="grid grid-cols-3 gap-2 text-center mb-3">
                  <div>
                    <div className="text-xl font-bold text-green-400">{engagement.newUsers}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Новые</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-blue-400">{engagement.returning}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Вернулись</div>
                  </div>
                  <div>
                    <div className="text-xl font-bold text-red-400">{engagement.goneUsers}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Ушли</div>
                  </div>
                </div>
                {engagement.avgMessageLength > 0 && (
                  <div className="text-[10px] pt-2 border-t flex items-center justify-between" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                    <span>Средняя длина сообщения</span>
                    <span className="font-mono">{engagement.avgMessageLength} симв.</span>
                  </div>
                )}
                {engagement.goneUsersList?.length > 0 && (
                  <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                    <div className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Кто замолчал:</div>
                    <div className="flex flex-wrap gap-1">
                      {engagement.goneUsersList.map((u: any) => (
                        <span key={u.userId} className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                          {u.userName}{u.username ? ` @${u.username}` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Row 1: Activity + Hourly heatmap */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Activity chart */}
            {activity?.length > 0 && (
              <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                  Активность по дням
                  <InfoTip text="Количество сообщений за каждый день выбранного периода." position="top" />
                </h3>
                <div className="flex items-end gap-[2px] h-28 mt-2">
                  {activity.map((day: any) => {
                    const maxVal = Math.max(...activity.map((d: any) => d.count), 1);
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1" title={`${day.date}: ${day.count} сообщ.`}>
                        <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                          <div className="bg-blue-500/60 rounded-sm min-h-[1px]" style={{ height: `${Math.max((day.count / maxVal) * 100, day.count > 0 ? 3 : 1)}px` }} />
                        </div>
                        {activity.length <= 14 && <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{day.date.slice(8)}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Hourly heatmap */}
            {hourly?.length > 0 && (
              <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                  Активность по часам
                  <InfoTip text="В какие часы дня чат наиболее активен. Чем ярче — тем больше сообщений." position="top" />
                </h3>
                <div className="grid grid-cols-12 gap-1 mt-2">
                  {hourly.map((h: any) => {
                    const maxVal = Math.max(...hourly.map((x: any) => x.count), 1);
                    const intensity = h.count / maxVal;
                    return (
                      <div key={h.hour} className="text-center" title={`${String(h.hour).padStart(2, '0')}:00 — ${h.count} сообщ.`}>
                        <div className="rounded-sm h-8 mb-0.5" style={{ background: h.count > 0 ? `rgba(59, 130, 246, ${0.15 + intensity * 0.7})` : 'rgba(255,255,255,0.03)' }} />
                        <span className="text-[7px]" style={{ color: 'var(--text-muted)' }}>{h.hour}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Row 2: Weekdays + Types */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {/* Weekdays */}
            {weekdays?.length > 0 && (
              <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                  По дням недели
                  <InfoTip text="Суммарная активность по дням недели. Показывает когда чат живее всего." position="top" />
                </h3>
                <div className="flex items-end gap-2 h-24 mt-2">
                  {weekdays.map((d: any) => {
                    const maxVal = Math.max(...weekdays.map((x: any) => x.count), 1);
                    return (
                      <div key={d.day} className="flex-1 flex flex-col items-center gap-1" title={`${d.name}: ${d.count} сообщ.`}>
                        <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                          <div className="bg-green-500/60 rounded-sm" style={{ height: `${Math.max((d.count / maxVal) * 80, d.count > 0 ? 3 : 1)}px` }} />
                        </div>
                        <span className="text-[9px] font-medium" style={{ color: 'var(--text-muted)' }}>{d.name}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Types distribution */}
            {types && Object.keys(types).length > 0 && (
              <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                  Типы контента
                  <InfoTip text="Какой контент отправляют участники: текст, фото, видео, стикеры и т.д." position="top" />
                </h3>
                <div className="space-y-1.5 mt-2">
                  {Object.entries(types as Record<string, number>)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, cnt]) => {
                      const total = Object.values(types as Record<string, number>).reduce((s, v) => s + v, 0);
                      const pct = Math.round((cnt / total) * 100);
                      return (
                        <div key={type} className="flex items-center gap-2 text-xs">
                          <span className="w-16 truncate text-[10px]" style={{ color: 'var(--text-muted)' }}>{typeLabels[type] ?? type}</span>
                          <div className="flex-1 h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                            <div className={cn('h-full rounded-full', typeColors[type] ?? 'bg-zinc-500')} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-14 text-right text-[10px]" style={{ color: 'var(--text-muted)' }}>{cnt} ({pct}%)</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>

          {/* Top users */}
          {topUsers?.users?.length > 0 && (
            <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-semibold mb-1 flex items-center gap-1.5">
                Топ участников
                <InfoTip text="Самые активные участники за выбранный период. Показывает количество сообщений, долю от общего числа, и основной тип контента." position="top" />
              </h3>
              <div className="space-y-1.5 mt-2">
                <div className="flex text-[10px] font-medium pb-1 border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <span className="w-8">#</span>
                  <span className="flex-1">Участник</span>
                  <span className="w-20 text-right">Сообщений</span>
                  <span className="w-12 text-right">%</span>
                  <span className="w-32 text-right hidden sm:block">Тип</span>
                </div>
                {topUsers.users.map((u: any, i: number) => {
                  const pct = topUsers.total > 0 ? Math.round((u.count / topUsers.total) * 100) : 0;
                  const mainType = Object.entries(u.types as Record<string, number>).sort((a, b) => b[1] - a[1])[0];
                  return (
                    <div key={u.userId} className="flex items-center text-xs py-0.5 cursor-pointer hover:bg-white/[0.03] rounded px-1 -mx-1" onClick={() => setProfileUserId(u.userId)}>
                      <span className="w-8 font-bold" style={{ color: i < 3 ? undefined : 'var(--text-muted)' }}>
                        {i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{u.userName}</span>
                        {u.username && <span className="ml-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>@{u.username}</span>}
                      </div>
                      <span className="w-20 text-right font-mono">{u.count}</span>
                      <span className="w-12 text-right" style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                      <span className="w-32 text-right hidden sm:block text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        {mainType ? `${typeLabels[mainType[0]] ?? mainType[0]} ${Math.round((mainType[1] / u.count) * 100)}%` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="text-[10px] mt-3 pt-2 border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                Всего сообщений за период: {topUsers.total} · Показано топ-{Math.min(topUsers.users.length, 20)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Message search */}
      {selectedChat && (
        <div className="mt-6">
          <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <Search size={14} /> Поиск по сообщениям
              <InfoTip text="Ищет по тексту сообщений. Минимум 2 символа." position="top" />
            </h3>
            <input value={msgSearch} onChange={(e) => setMsgSearch(e.target.value)}
              placeholder="Введите текст для поиска..."
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none mb-2" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            {searchResults?.results?.length > 0 && (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {searchResults.results.map((m: any, i: number) => (
                  <div key={i} className="flex gap-2 px-2 py-1.5 rounded text-[11px] hover:bg-white/[0.03] cursor-pointer" onClick={() => setProfileUserId(m.userId)}>
                    <span className="font-medium shrink-0 text-blue-400">{m.userName}</span>
                    <span className="flex-1 min-w-0 truncate">{m.text}</span>
                    <span className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)' }}>{new Date(m.createdAt + 'Z').toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })}</span>
                  </div>
                ))}
              </div>
            )}
            {msgSearch.length >= 2 && searchResults?.results?.length === 0 && (
              <p className="text-xs text-center py-3" style={{ color: 'var(--text-muted)' }}>Ничего не найдено</p>
            )}
          </div>
        </div>
      )}

      {/* User profile modal */}
      {profileUserId && selectedChat && (
        <UserProfileModal chatId={selectedChat} userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}

      {/* Edit thread name modal */}
      {editThread && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditThread(null)}>
          <div className="w-full max-w-sm p-5 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold mb-3">Переименовать топик</h3>
            <input value={editThread.title} onChange={(e) => setEditThread({ ...editThread, title: e.target.value })} autoFocus
              placeholder="Название топика"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && selectedChat) {
                  apiFetch(`/stats/chat/${selectedChat}/threads/${editThread.id}`, { method: 'PATCH', body: JSON.stringify({ title: editThread.title }) })
                    .then(() => { qc.invalidateQueries({ queryKey: ['stats-threads'] }); setEditThread(null); });
                }
              }}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none mb-4" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditThread(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
              <button onClick={() => {
                if (selectedChat) {
                  apiFetch(`/stats/chat/${selectedChat}/threads/${editThread.id}`, { method: 'PATCH', body: JSON.stringify({ title: editThread.title }) })
                    .then(() => { qc.invalidateQueries({ queryKey: ['stats-threads'] }); setEditThread(null); });
                }
              }} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
