import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { UserX } from 'lucide-react';
import { apiFetch } from '../../lib/api.js';
import { timeAgo } from '../../lib/utils.js';
import { useToast } from '../ui/toast.js';
import { useConfirm } from '../ui/confirm-dialog.js';

const REASONS: Record<string, string> = {
  links: 'ссылка', flood: 'флуд', forward: 'пересылка', sticker: 'стикер', animation: 'GIF',
  voice: 'голосовое', video_note: 'кружок', short_message: 'короткое сообщение',
};

function reasonLabel(reason?: string): string {
  if (!reason) return '';
  if (reason.startsWith('banned_word')) return 'запрещённое слово';
  return REASONS[reason] ?? reason;
}

interface Violator {
  key: string;
  userId: number;
  userName: string;
  chatId: string;
  chatTitle: string;
  botId: number;
  count: number;
  lastAt: string;
  lastReason: string;
  lastText?: string;
}

/** People whose messages the bot removed this week, with one-click mute and ban */
export function Violators() {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const { data: logs } = useQuery({
    queryKey: ['activity', 'mod.deleted', 'week'],
    queryFn: () => apiFetch('/activity?type=mod.deleted&period=week&limit=200'),
    refetchInterval: 60000,
  });

  // Logs come newest first, so the first entry per person is their latest violation
  const byUser = new Map<string, Violator>();
  for (const log of logs ?? []) {
    const d = log.details ?? {};
    if (!d.userId || !d.chatId || !log.botId) continue;
    const key = `${d.chatId}:${d.userId}`;
    const existing = byUser.get(key);
    if (existing) { existing.count++; continue; }
    byUser.set(key, {
      key, userId: d.userId, userName: d.userName ?? 'Без имени', chatId: String(d.chatId), chatTitle: d.chatTitle ?? '',
      botId: log.botId, count: 1, lastAt: log.createdAt, lastReason: reasonLabel(d.reason), lastText: d.messageText,
    });
  }
  const violators = [...byUser.values()].sort((a, b) => b.count - a.count).slice(0, 6);

  const moderateMut = useMutation({
    mutationFn: ({ v, action, duration }: { v: Violator; action: 'mute' | 'ban'; duration?: number }) =>
      apiFetch(`/bots/${v.botId}/moderate`, {
        method: 'POST',
        body: JSON.stringify({ chatId: v.chatId, userId: v.userId, action, duration }),
      }),
    onSuccess: (_data, { v, action }) => {
      toast.success(action === 'ban' ? `${v.userName} забанен` : `${v.userName} в муте на сутки`);
      qc.invalidateQueries({ queryKey: ['members'] });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const ban = (v: Violator) => confirm({
    title: `Забанить ${v.userName}?`,
    message: `Пользователь будет удалён из «${v.chatTitle || 'чата'}» и не сможет вернуться. Разбанить можно в разделе «Участники».`,
    confirmLabel: 'Забанить',
    onConfirm: () => moderateMut.mutate({ v, action: 'ban' }),
  });

  return (
    <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      {dialog}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><UserX size={14} className="text-red-400" /> Нарушители за неделю</h3>
        <Link to="/members" className="text-[10px] text-zinc-500 hover:text-zinc-300">Все участники →</Link>
      </div>

      {violators.length === 0 ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>За неделю бот ничего не удалял</p>
      ) : (
        <div className="space-y-3">
          {violators.map((v) => (
            <div key={v.key} className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <span className="truncate">{v.userName}</span>
                  <span className="text-[11px] px-1.5 rounded bg-red-500/15 text-red-400 shrink-0">{v.count}</span>
                </div>
                <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                  {v.lastReason}{v.lastText ? ` · «${v.lastText}»` : ''} · {timeAgo(v.lastAt)}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button type="button" disabled={moderateMut.isPending} onClick={() => moderateMut.mutate({ v, action: 'mute', duration: 1440 })}
                  className="px-2 py-1 rounded-lg text-[11px] border text-orange-400 hover:border-orange-500/50 disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>
                  Мут 24ч
                </button>
                <button type="button" disabled={moderateMut.isPending} onClick={() => ban(v)}
                  className="px-2 py-1 rounded-lg text-[11px] border text-red-400 hover:border-red-500/50 disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>
                  Бан
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
