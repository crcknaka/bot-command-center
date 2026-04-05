import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, User, Bot, FileText, Zap, LogIn, UserPlus, Shield, Send, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { timeAgo, cn } from '../lib/utils.js';
import { Spinner } from '../components/ui/spinner.js';
import { EmptyState } from '../components/ui/empty-state.js';

const reasonLabels: Record<string, string> = {
  banned_word: 'запрещённое слово', flood: 'флуд', links: 'ссылки', forward: 'пересылка',
  sticker: 'стикер', animation: 'GIF', voice: 'голосовое', video_note: 'видео-кружок',
  short_message: 'короткое сообщение', warning_sent: 'предупреждение',
};

function formatDetails(action: string, details: any): string | null {
  if (!details) return null;
  if (action === 'post.published' && details.channelTitle) return `→ ${details.channelTitle}`;
  if (action === 'post.failed') {
    const parts: string[] = [];
    if (details.channelTitle) parts.push(`→ ${details.channelTitle}`);
    if (details.error) parts.push(`Ошибка: ${details.error}`);
    return parts.join(' — ') || null;
  }
  if (action === 'bot.message_sent') return details.channelTitle ? `→ ${details.channelTitle}` : null;
  if (action.startsWith('mod.')) {
    const parts: string[] = [];
    if (details.chatTitle) parts.push(`[${details.chatTitle}]`);
    if (details.userName) parts.push(details.userName);
    if (details.reason) {
      const r = details.reason.startsWith('banned_word:') ? `слово «${details.reason.split(':')[1]}»` : (reasonLabels[details.reason] ?? details.reason);
      parts.push(r);
    }
    if (details.messageText) parts.push(`«${details.messageText.slice(0, 100)}${details.messageText.length > 100 ? '…' : ''}»`);
    return parts.join(' — ');
  }
  if (action === 'bot.imported' && details.channels != null) return `${details.channels} каналов, ${details.tasks} задач`;
  if (details.name) return details.name;
  if (details.username) return `@${details.username}`;
  if (details.channelTitle) return `→ ${details.channelTitle}`;
  return null;
}

const actionMeta: Record<string, { icon: any; label: string; color: string }> = {
  'user.login': { icon: LogIn, label: 'Вход в систему', color: 'text-blue-400' },
  'user.registered': { icon: UserPlus, label: 'Регистрация', color: 'text-green-400' },
  'user.password_changed': { icon: Shield, label: 'Смена пароля', color: 'text-yellow-400' },
  'bot.created': { icon: Bot, label: 'Бот создан', color: 'text-purple-400' },
  'bot.imported': { icon: Bot, label: 'Бот импортирован', color: 'text-purple-400' },
  'bot.started': { icon: Zap, label: 'Бот запущен', color: 'text-green-400' },
  'bot.stopped': { icon: Zap, label: 'Бот остановлен', color: 'text-zinc-400' },
  'bot.deleted': { icon: Bot, label: 'Бот удалён', color: 'text-red-400' },
  'bot.message_sent': { icon: Send, label: 'Сообщение отправлено', color: 'text-green-400' },
  'post.published': { icon: FileText, label: 'Пост опубликован', color: 'text-green-400' },
  'post.failed': { icon: FileText, label: 'Ошибка публикации', color: 'text-red-400' },
  'mod.deleted': { icon: Trash2, label: 'Удалено ботом', color: 'text-red-400' },
  'mod.muted': { icon: Shield, label: 'Мут за нарушение', color: 'text-orange-400' },
  'mod.warned': { icon: Shield, label: 'Предупреждение', color: 'text-yellow-400' },
};

const typeFilters = [
  { id: 'all', label: 'Все' },
  { id: 'auth', label: 'Авторизация' },
  { id: 'bot', label: 'Боты' },
  { id: 'post', label: 'Посты' },
  { id: 'mod', label: 'Модерация' },
] as const;

const modSubFilters = [
  { id: 'mod', label: 'Все' },
  { id: 'mod.deleted', label: '🗑 Удалено ботом' },
  { id: 'mod.warned', label: '⚠️ Предупреждения' },
  { id: 'mod.muted', label: '🔇 Муты' },
] as const;

const periodFilters = [
  { id: 'all', label: 'Все' },
  { id: 'today', label: 'Сегодня' },
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
] as const;

export function ActivityPage() {
  const urlType = new URLSearchParams(window.location.search).get('type');
  const [typeFilter, setTypeFilter] = useState<string>(() => {
    if (urlType?.startsWith('mod')) return 'mod';
    if (urlType === 'auth' || urlType === 'bot' || urlType === 'post') return urlType;
    return 'all';
  });
  const [modSubFilter, setModSubFilter] = useState<string>(() => {
    if (urlType === 'mod.deleted' || urlType === 'mod.warned' || urlType === 'mod.muted') return urlType;
    return 'mod';
  });
  const [periodFilter, setPeriodFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const activeType = typeFilter === 'mod' && modSubFilter !== 'mod' ? modSubFilter : typeFilter;

  const { data: logs, isLoading } = useQuery({
    queryKey: ['activity', activeType, periodFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (activeType !== 'all') params.set('type', activeType);
      if (periodFilter !== 'all') params.set('period', periodFilter);
      if (search.trim()) params.set('search', search.trim());
      const qs = params.toString();
      return apiFetch(`/activity${qs ? `?${qs}` : ''}`);
    },
    refetchInterval: 30000,
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Журнал действий</h1>
        <InfoTip text="Все действия в системе: входы, запуски ботов, публикации постов. Обновляется автоматически каждые 30 секунд." position="bottom" />
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--bg-card)' }}>
          {typeFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setTypeFilter(f.id)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                typeFilter === f.id
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={periodFilter}
          onChange={(e) => setPeriodFilter(e.target.value)}
          className="text-xs rounded-lg px-3 py-1.5 border"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          {periodFilters.map((f) => (
            <option key={f.id} value={f.id}>{f.label}</option>
          ))}
        </select>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по имени, тексту..."
          className="flex-1 min-w-[150px] px-3 py-1.5 rounded-lg border text-xs outline-none"
          style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
        />
      </div>

      {/* Moderation sub-filters */}
      {typeFilter === 'mod' && (
        <div className="flex gap-1 mb-4">
          {modSubFilters.map((f) => (
            <button key={f.id} onClick={() => setModSubFilter(f.id)}
              className={cn('px-2.5 py-1 text-[11px] rounded-md transition-colors',
                modSubFilter === f.id ? 'bg-red-500/15 text-red-400' : 'text-zinc-500 hover:text-zinc-300'
              )}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <Spinner text="Загрузка..." />
      ) : !logs?.length ? (
        <EmptyState icon={Activity} title="Журнал пока пуст" description="Действия будут записываться автоматически." />
      ) : (
        <div className="space-y-2">
          {logs.map((log: any) => {
            const meta = actionMeta[log.action] ?? { icon: Activity, label: log.action, color: 'text-zinc-400' };
            const Icon = meta.icon;
            return (
              <div key={log.id} className="rounded-xl p-3 border flex items-center gap-3" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <Icon size={16} className={meta.color} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-medium">{meta.label}</span>
                    {log.userName && <span style={{ color: 'var(--text-muted)' }}> — {log.userName}</span>}
                    {log.botName && <span className="text-purple-400"> [{log.botName}]</span>}
                  </div>
                  {log.details && (() => {
                    const formatted = formatDetails(log.action, log.details);
                    return formatted ? (
                      <div className={`text-[11px] mt-0.5 ${log.action === 'post.failed' ? 'text-red-400' : ''}`} style={log.action === 'post.failed' ? {} : { color: 'var(--text-muted)' }}>
                        {formatted}
                      </div>
                    ) : null;
                  })()}
                </div>
                <span className="text-[11px] shrink-0" style={{ color: 'var(--text-muted)' }}>{timeAgo(log.createdAt)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
