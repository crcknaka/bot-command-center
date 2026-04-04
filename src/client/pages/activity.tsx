import { useQuery } from '@tanstack/react-query';
import { Activity, User, Bot, FileText, Zap, LogIn, UserPlus, Shield, Send, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { timeAgo } from '../lib/utils.js';

const reasonLabels: Record<string, string> = {
  banned_word: 'запрещённое слово', flood: 'флуд', links: 'ссылки', forward: 'пересылка',
  sticker: 'стикер', animation: 'GIF', voice: 'голосовое', video_note: 'видео-кружок',
  short_message: 'короткое сообщение', warning_sent: 'предупреждение',
};

function formatDetails(action: string, details: any): string | null {
  if (!details) return null;
  if (action === 'post.failed' && details.error) return `Ошибка: ${details.error}`;
  if (action === 'bot.message_sent') return `Сообщение отправлено (ID: ${details.messageId})`;
  if (action.startsWith('mod.')) {
    const parts: string[] = [];
    if (details.userName) parts.push(details.userName);
    if (details.reason) {
      const r = details.reason.startsWith('banned_word:') ? `слово «${details.reason.split(':')[1]}»` : (reasonLabels[details.reason] ?? details.reason);
      parts.push(r);
    }
    return parts.join(' — ');
  }
  if (details.name) return details.name;
  if (details.username) return `@${details.username}`;
  return null;
}

const actionMeta: Record<string, { icon: any; label: string; color: string }> = {
  'user.login': { icon: LogIn, label: 'Вход в систему', color: 'text-blue-400' },
  'user.registered': { icon: UserPlus, label: 'Регистрация', color: 'text-green-400' },
  'bot.created': { icon: Bot, label: 'Бот создан', color: 'text-purple-400' },
  'bot.started': { icon: Zap, label: 'Бот запущен', color: 'text-green-400' },
  'bot.stopped': { icon: Zap, label: 'Бот остановлен', color: 'text-zinc-400' },
  'bot.deleted': { icon: Bot, label: 'Бот удалён', color: 'text-red-400' },
  'bot.message_sent': { icon: Send, label: 'Сообщение отправлено', color: 'text-green-400' },
  'post.published': { icon: FileText, label: 'Пост опубликован', color: 'text-green-400' },
  'post.failed': { icon: FileText, label: 'Ошибка публикации', color: 'text-red-400' },
  'mod.deleted': { icon: Trash2, label: 'Сообщение удалено', color: 'text-red-400' },
  'mod.muted': { icon: Shield, label: 'Мут', color: 'text-orange-400' },
  'mod.warned': { icon: Shield, label: 'Предупреждение', color: 'text-yellow-400' },
};

export function ActivityPage() {
  const { data: logs, isLoading } = useQuery({
    queryKey: ['activity'],
    queryFn: () => apiFetch('/activity'),
    refetchInterval: 30000,
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Журнал действий</h1>
        <InfoTip text="Все действия в системе: входы, запуски ботов, публикации постов. Обновляется автоматически каждые 30 секунд." position="bottom" />
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>
      ) : !logs?.length ? (
        <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Activity size={40} className="mx-auto mb-3 text-zinc-600" />
          <p className="font-medium mb-1">Журнал пока пуст</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Действия будут записываться автоматически.</p>
        </div>
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
