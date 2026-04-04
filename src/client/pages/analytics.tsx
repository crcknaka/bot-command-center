import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Users, MessageSquare, Clock, TrendingUp } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { cn } from '../lib/utils.js';

const typeLabels: Record<string, string> = {
  text: 'Текст', photo: 'Фото', video: 'Видео', sticker: 'Стикер',
  voice: 'Голосовое', video_note: 'Кружок', animation: 'GIF',
  forward: 'Пересылка', document: 'Файл', audio: 'Аудио', other: 'Другое',
};

const typeColors: Record<string, string> = {
  text: 'bg-blue-500', photo: 'bg-green-500', video: 'bg-purple-500', sticker: 'bg-yellow-500',
  voice: 'bg-orange-500', video_note: 'bg-pink-500', animation: 'bg-cyan-500',
  forward: 'bg-zinc-500', document: 'bg-indigo-500', audio: 'bg-red-500', other: 'bg-zinc-600',
};

export function AnalyticsPage() {
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [period, setPeriod] = useState<'week' | 'month' | 'all'>('week');

  const { data: chats } = useQuery({ queryKey: ['stats-chats'], queryFn: () => apiFetch('/stats/chats') });
  const { data: summary } = useQuery({
    queryKey: ['stats-summary', selectedChat],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/summary`),
    enabled: !!selectedChat,
  });
  const { data: topUsers } = useQuery({
    queryKey: ['stats-top', selectedChat, period],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/top-users?period=${period}`),
    enabled: !!selectedChat,
  });
  const { data: activity } = useQuery({
    queryKey: ['stats-activity', selectedChat, period],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/activity?period=${period}`),
    enabled: !!selectedChat,
  });
  const { data: types } = useQuery({
    queryKey: ['stats-types', selectedChat, period],
    queryFn: () => apiFetch(`/stats/chat/${selectedChat}/types?period=${period}`),
    enabled: !!selectedChat,
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Аналитика</h1>
          <InfoTip text="Статистика сообщений в группах. Данные собираются автоматически пока бот работает." position="bottom" />
        </div>
      </div>

      {/* Chat selector */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {chats?.length === 0 && (
          <div className="text-center py-12 w-full rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <BarChart3 size={40} className="mx-auto mb-3 text-zinc-600" />
            <p className="font-medium mb-1">Нет данных</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Статистика появится когда пользователи начнут писать в группах с активным ботом.</p>
          </div>
        )}
        {chats?.map((chat: any) => (
          <button key={chat.chatId} onClick={() => setSelectedChat(chat.chatId)}
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
          {/* Period selector */}
          <div className="flex gap-2 mb-4">
            {([['week', 'Неделя'], ['month', 'Месяц'], ['all', 'Всё время']] as const).map(([v, l]) => (
              <button key={v} onClick={() => setPeriod(v)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium', period === v ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300')}>
                {l}
              </button>
            ))}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Сообщений', value: period === 'month' ? summary.month.messages : summary.week.messages, icon: MessageSquare, color: 'text-blue-400' },
              { label: 'Активных юзеров', value: period === 'month' ? summary.month.users : summary.week.users, icon: Users, color: 'text-green-400' },
              { label: 'Среднее в день', value: period === 'month' ? summary.month.avgPerDay : summary.week.avgPerDay, icon: TrendingUp, color: 'text-yellow-400' },
              { label: 'Пиковый час', value: summary.peakHour ? `${String(summary.peakHour.hour).padStart(2, '0')}:00` : '—', icon: Clock, color: 'text-purple-400' },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold">{s.value}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                    </div>
                    <Icon size={20} className={s.color} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Activity chart */}
            {activity?.length > 0 && (
              <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-3">Активность по дням</h3>
                <div className="flex items-end gap-1 h-28">
                  {activity.map((day: any) => {
                    const maxVal = Math.max(...activity.map((d: any) => d.count), 1);
                    return (
                      <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex flex-col justify-end" style={{ height: '100px' }}>
                          <div className="bg-blue-500/60 rounded-t" style={{ height: `${Math.max((day.count / maxVal) * 100, day.count > 0 ? 4 : 1)}px` }} />
                        </div>
                        <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>{day.date.slice(8)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Types distribution */}
            {types && Object.keys(types).length > 0 && (
              <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <h3 className="text-sm font-semibold mb-3">Типы контента</h3>
                <div className="space-y-2">
                  {Object.entries(types as Record<string, number>)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, cnt]) => {
                      const total = Object.values(types as Record<string, number>).reduce((s, v) => s + v, 0);
                      const pct = Math.round((cnt / total) * 100);
                      return (
                        <div key={type} className="flex items-center gap-2 text-xs">
                          <span className="w-20 truncate" style={{ color: 'var(--text-muted)' }}>{typeLabels[type] ?? type}</span>
                          <div className="flex-1 h-3 rounded-full bg-zinc-800 overflow-hidden">
                            <div className={cn('h-full rounded-full', typeColors[type] ?? 'bg-zinc-500')} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="w-12 text-right text-[10px]" style={{ color: 'var(--text-muted)' }}>{cnt} ({pct}%)</span>
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
              <h3 className="text-sm font-semibold mb-3">Топ участников</h3>
              <div className="space-y-2">
                <div className="flex text-[10px] font-medium pb-1 border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  <span className="w-8">#</span>
                  <span className="flex-1">Участник</span>
                  <span className="w-20 text-right">Сообщений</span>
                  <span className="w-12 text-right">%</span>
                  <span className="w-32 text-right hidden sm:block">Основной тип</span>
                </div>
                {topUsers.users.map((u: any, i: number) => {
                  const pct = topUsers.total > 0 ? Math.round((u.count / topUsers.total) * 100) : 0;
                  const mainType = Object.entries(u.types as Record<string, number>).sort((a, b) => b[1] - a[1])[0];
                  return (
                    <div key={u.userId} className="flex items-center text-xs">
                      <span className="w-8 font-bold" style={{ color: i < 3 ? ['text-yellow-400', 'text-zinc-400', 'text-orange-400'][i] : 'var(--text-muted)' }}>
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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
