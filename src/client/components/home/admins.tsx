import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Crown } from 'lucide-react';
import { apiFetch } from '../../lib/api.js';
import { useToast } from '../ui/toast.js';
import { useConfirm } from '../ui/confirm-dialog.js';
import type { ChatUser, HomeChat } from './types.js';

/** Chat admins as Telegram reports them, with appoint and dismiss */
export function Admins({ chat, users }: { chat: HomeChat; users: ChatUser[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const queryKey = ['chat-admins', chat.botId, chat.chatId];

  const { data: admins, error } = useQuery({
    queryKey,
    queryFn: () => apiFetch(`/bots/${chat.botId}/admins?chatId=${encodeURIComponent(chat.chatId)}`),
    enabled: chat.botRunning,
    retry: false,
  });

  const moderateMut = useMutation({
    mutationFn: ({ userId, action }: { userId: number; name: string; action: 'promote' | 'demote' }) =>
      apiFetch(`/bots/${chat.botId}/moderate`, { method: 'POST', body: JSON.stringify({ chatId: chat.chatId, userId, action }) }),
    onSuccess: (_d, { name, action }) => toast.success(action === 'promote' ? `${name} теперь админ` : `${name} больше не админ`),
    onError: (err) => toast.error((err as Error).message),
    onSettled: () => { qc.invalidateQueries({ queryKey }); qc.invalidateQueries({ queryKey: ['members'] }); },
  });

  const people = (admins ?? []).filter((a: any) => !a.isBot);
  const candidates = users.filter((u) => !(admins ?? []).some((a: any) => a.userId === u.userId));

  const promote = (u: ChatUser) => confirm({
    title: `Назначить ${u.userName} админом?`,
    message: 'Получит права модератора: удалять сообщения, ограничивать участников, закреплять, приглашать.',
    confirmLabel: 'Назначить',
    variant: 'warning',
    onConfirm: () => moderateMut.mutate({ userId: u.userId, name: u.userName, action: 'promote' }),
  });
  const demote = (a: any) => confirm({
    title: `Снять ${a.userName} с админов?`,
    message: 'Станет обычным участником. Назначить снова можно в любой момент.',
    confirmLabel: 'Снять',
    onConfirm: () => moderateMut.mutate({ userId: a.userId, name: a.userName, action: 'demote' }),
  });

  return (
    <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      {dialog}
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><Crown size={14} className="text-yellow-400" /> Админы</h3>

      {!chat.botRunning ? (
        <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>Бот остановлен — список админов недоступен</p>
      ) : error ? (
        <p className="text-xs text-center py-6 text-red-400">{(error as Error).message}</p>
      ) : (
        <>
          <div>
            {people.map((a: any) => (
              <div key={a.userId} className="flex items-center justify-between gap-3 py-2 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <div className="text-sm truncate">{a.userName}{a.username ? <span style={{ color: 'var(--text-muted)' }}> @{a.username}</span> : null}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{a.status === 'creator' ? 'Владелец' : a.title || 'Админ'}</div>
                </div>
                {a.canBeDemoted && (
                  <button type="button" disabled={moderateMut.isPending} onClick={() => demote(a)}
                    className="shrink-0 px-3 py-1 rounded-lg text-[11px] border text-red-400 hover:border-red-500/50 disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>
                    Снять
                  </button>
                )}
              </div>
            ))}
          </div>

          {candidates.length > 0 && (
            <select value="" disabled={moderateMut.isPending} className="w-full rounded-lg border px-2 py-1.5 text-xs bg-transparent mt-3" style={{ borderColor: 'var(--border)' }}
              onChange={(e) => { const u = candidates.find((c) => c.userId === Number(e.target.value)); if (u) promote(u); }}>
              <option value="">Назначить админом…</option>
              {candidates.map((u) => <option key={u.userId} value={u.userId}>{u.userName}{u.username ? ` @${u.username}` : ''}</option>)}
            </select>
          )}

          <p className="text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
            Боту нужно право «Добавление админов». Снять он может только тех, кого назначил сам — остальных снимает владелец в Telegram.
          </p>
        </>
      )}
    </div>
  );
}
