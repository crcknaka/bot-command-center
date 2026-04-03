import { useQuery } from '@tanstack/react-query';
import { Activity, User, Bot, FileText, Zap, LogIn, UserPlus } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { timeAgo } from '../lib/utils.js';

const actionMeta: Record<string, { icon: any; label: string; color: string }> = {
  'user.login': { icon: LogIn, label: 'Вход в систему', color: 'text-blue-400' },
  'user.registered': { icon: UserPlus, label: 'Регистрация', color: 'text-green-400' },
  'bot.created': { icon: Bot, label: 'Бот создан', color: 'text-purple-400' },
  'bot.started': { icon: Zap, label: 'Бот запущен', color: 'text-green-400' },
  'bot.stopped': { icon: Zap, label: 'Бот остановлен', color: 'text-zinc-400' },
  'bot.deleted': { icon: Bot, label: 'Бот удалён', color: 'text-red-400' },
  'post.published': { icon: FileText, label: 'Пост опубликован', color: 'text-green-400' },
  'post.failed': { icon: FileText, label: 'Ошибка публикации', color: 'text-red-400' },
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
                  {log.details && (
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {Object.entries(log.details as Record<string, unknown>).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                    </div>
                  )}
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
