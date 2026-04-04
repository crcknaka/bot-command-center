import { Play, Square, RotateCw, Trash2, Settings2 } from 'lucide-react';
import { useBotAction, useDeleteBot } from '../hooks/use-bots.js';
import { useConfirm } from './ui/confirm-dialog.js';
import { cn } from '../lib/utils.js';
import { Link } from 'react-router-dom';

interface BotCardProps {
  bot: any;
}

export function BotCard({ bot }: BotCardProps) {
  const action = useBotAction();
  const deleteMut = useDeleteBot();
  const { confirm, dialog } = useConfirm();

  const statusInfo = {
    active: { color: 'bg-green-500', label: 'Работает', badge: 'bg-green-500/15 text-green-400' },
    stopped: { color: 'bg-zinc-500', label: 'Остановлен', badge: 'bg-zinc-500/15 text-zinc-400' },
    error: { color: 'bg-red-500', label: 'Ошибка', badge: 'bg-red-500/15 text-red-400' },
  }[bot.status as string] ?? { color: 'bg-zinc-500', label: bot.status, badge: 'bg-zinc-500/15 text-zinc-400' };

  return (<>
    {dialog}
    <div className="rounded-xl p-4 border transition-colors hover:border-zinc-600"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <Link to={`/bots/${bot.id}`} className="text-base font-semibold hover:text-blue-400 transition-colors">
            {bot.name}
          </Link>
          {bot.username && (
            <div className="text-sm" style={{ color: 'var(--text-muted)' }}>@{bot.username}</div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('w-2.5 h-2.5 rounded-full', statusInfo.color)} />
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{statusInfo.label}</span>
        </div>
      </div>

      {bot.status === 'stopped' && (
        <p className="text-[11px] mt-1 mb-2" style={{ color: 'var(--text-muted)' }}>
          Нажмите «Запустить», затем настройте каналы и задачи.
        </p>
      )}

      {bot.errorMessage && (
        <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2 mb-3">
          {bot.errorMessage}
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <Link to={`/bots/${bot.id}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors">
          <Settings2 size={14} /> Настроить
        </Link>
        {bot.status !== 'active' && (
          <button
            onClick={() => action.mutate({ id: bot.id, action: 'start' })}
            disabled={action.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors"
          >
            <Play size={14} /> {action.isPending ? 'Запуск...' : 'Запустить'}
          </button>
        )}
        {bot.status === 'active' && (
          <>
            <button
              onClick={() => confirm({ title: 'Остановить бота?', message: 'Все задачи перестанут работать до следующего запуска.', confirmLabel: 'Остановить', variant: 'warning', onConfirm: () => action.mutate({ id: bot.id, action: 'stop' }) })}
              disabled={action.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors"
            >
              <Square size={14} /> {action.isPending ? '...' : 'Остановить'}
            </button>
            <button
              onClick={() => action.mutate({ id: bot.id, action: 'restart' })}
              disabled={action.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors"
            >
              <RotateCw size={14} /> Перезапуск
            </button>
          </>
        )}
        <button
          onClick={() => confirm({ title: 'Удалить бота?', message: 'Все каналы, задачи и посты этого бота будут удалены безвозвратно.', onConfirm: () => deleteMut.mutate(bot.id) })}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-400/60 hover:text-red-400 hover:bg-red-500/15 transition-colors ml-auto"
        >
          <Trash2 size={14} /> Удалить
        </button>
      </div>
    </div>
  </>);
}
