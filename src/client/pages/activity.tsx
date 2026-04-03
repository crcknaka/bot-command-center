import { useQuery } from '@tanstack/react-query';
import { Activity, Bot, FileText, User, Settings2, Zap } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { timeAgo } from '../lib/utils.js';

const actionIcons: Record<string, any> = {
  'bot.started': { icon: Zap, color: 'text-green-400' },
  'bot.stopped': { icon: Zap, color: 'text-zinc-400' },
  'post.published': { icon: FileText, color: 'text-blue-400' },
  'post.failed': { icon: FileText, color: 'text-red-400' },
  'task.created': { icon: Settings2, color: 'text-purple-400' },
  'task.run': { icon: Settings2, color: 'text-yellow-400' },
  'user.login': { icon: User, color: 'text-blue-400' },
};

const actionLabels: Record<string, string> = {
  'bot.started': 'Бот запущен',
  'bot.stopped': 'Бот остановлен',
  'post.published': 'Пост опубликован',
  'post.failed': 'Ошибка публикации',
  'task.created': 'Задача создана',
  'task.run': 'Задача запущена',
  'user.login': 'Вход в систему',
};

export function ActivityPage() {
  // For now show a placeholder — activity_log table exists but we haven't wired up logging yet
  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Журнал действий</h1>
        <InfoTip text="Здесь отображаются все действия: запуск/остановка ботов, публикация постов, создание задач, входы пользователей." position="bottom" />
      </div>

      <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <Activity size={40} className="mx-auto mb-3 text-zinc-600" />
        <p className="font-medium mb-1">Журнал пока пуст</p>
        <p className="text-xs max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
          Действия будут записываться сюда автоматически: запуск ботов, публикация постов, изменения настроек и т.д.
        </p>
      </div>
    </div>
  );
}
