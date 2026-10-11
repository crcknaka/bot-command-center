import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { VolumeX } from 'lucide-react';
import { apiFetch } from '../../lib/api.js';
import { useToast } from '../ui/toast.js';
import { useConfirm } from '../ui/confirm-dialog.js';
import type { HomeChat } from './types.js';

const DURATIONS = [
  { minutes: 15, label: '15 минут' },
  { minutes: 60, label: '1 час' },
  { minutes: 180, label: '3 часа' },
  { minutes: 720, label: '12 часов' },
  { minutes: 1440, label: 'сутки' },
  { minutes: 0, label: 'пока не открою' },
];

interface Row {
  threadId: number | null;
  title: string;
}

/** Silence a forum topic (or a whole chat without topics) for a while */
export function Topics({ chat, knownTopics }: { chat: HomeChat; knownTopics: Array<{ threadId: number; title: string }> }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [minutes, setMinutes] = useState(60);
  const [includeAdmins, setIncludeAdmins] = useState(false);

  const { data: threads } = useQuery({
    queryKey: ['stats-threads', chat.chatId],
    queryFn: () => apiFetch(`/stats/chat/${chat.chatId}/threads`),
  });
  const closedKey = ['topics-closed', chat.botId, chat.chatId];
  const { data: closed } = useQuery({
    queryKey: closedKey,
    queryFn: () => apiFetch(`/bots/${chat.botId}/topics/closed?chatId=${encodeURIComponent(chat.chatId)}`),
    refetchInterval: 60000,
  });

  // Topics the panel has seen: from message statistics and from the channels added on the bot page
  const topics = new Map<number, string>();
  for (const t of threads ?? []) if (t.threadId !== 'general') topics.set(Number(t.threadId), t.title);
  for (const t of knownTopics) if (!topics.has(t.threadId) || topics.get(t.threadId)!.startsWith('Топик #')) topics.set(t.threadId, t.title);
  const isForum = topics.size > 0;
  const rows: Row[] = [
    { threadId: null, title: isForum ? 'Общий' : 'Весь чат' },
    ...[...topics].map(([threadId, title]) => ({ threadId, title })),
  ];

  const closedOf = (threadId: number | null) => (closed ?? []).find((c: any) => c.threadId === threadId);
  const onSettled = () => qc.invalidateQueries({ queryKey: closedKey });
  const onError = (err: unknown) => toast.error((err as Error).message);

  const closeMut = useMutation({
    mutationFn: (row: Row) => apiFetch(`/bots/${chat.botId}/topics/close`, {
      method: 'POST',
      body: JSON.stringify({ chatId: chat.chatId, threadId: row.threadId, minutes, includeAdmins }),
    }),
    onSuccess: (_d, row) => toast.success(`«${row.title}» закрыт${includeAdmins ? ' для всех' : ''}`),
    onError,
    onSettled,
  });
  const reopenMut = useMutation({
    mutationFn: (row: Row) => apiFetch(`/bots/${chat.botId}/topics/reopen`, {
      method: 'POST',
      body: JSON.stringify({ chatId: chat.chatId, threadId: row.threadId }),
    }),
    onSuccess: (_d, row) => toast.success(`«${row.title}» открыт`),
    onError,
    onSettled,
  });
  const busy = closeMut.isPending || reopenMut.isPending;

  const close = (row: Row) => {
    const duration = DURATIONS.find((d) => d.minutes === minutes)!.label;
    confirm({
      title: `Закрыть «${row.title}»?`,
      message: includeAdmins
        ? `Писать не сможет никто, включая админов: бот будет удалять все сообщения. Срок: ${duration}.`
        : `Писать смогут только админы. Срок: ${duration}.`,
      confirmLabel: 'Закрыть',
      variant: 'warning',
      onConfirm: () => closeMut.mutate(row),
    });
  };

  const selectCls = 'rounded-lg border px-2 py-1.5 text-xs bg-transparent';

  return (
    <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      {dialog}
      <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><VolumeX size={14} className="text-orange-400" /> Тишина в топике</h3>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-3 text-xs">
        <label className="flex items-center gap-2">
          На
          <select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={selectCls} style={{ borderColor: 'var(--border)' }}>
            {DURATIONS.map((d) => <option key={d.minutes} value={d.minutes}>{d.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={includeAdmins} onChange={(e) => setIncludeAdmins(e.target.checked)} />
          Включая админов
        </label>
      </div>

      {!chat.botRunning && <p className="text-xs text-orange-400 mb-2">Бот «{chat.botName}» остановлен — закрыть или открыть топик сейчас нельзя.</p>}

      <div>
        {rows.map((row) => {
          const state = closedOf(row.threadId);
          return (
            <div key={row.threadId ?? 'general'} className="flex items-center justify-between gap-3 py-2 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                <div className="text-sm truncate">{row.title}</div>
                {state && (
                  <div className="text-[11px] text-orange-400">
                    Закрыт{state.includeAdmins ? ' для всех' : ''}
                    {state.until ? ` до ${new Date(state.until).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ' — пока не откроете'}
                  </div>
                )}
              </div>
              {state ? (
                <button type="button" disabled={busy || !chat.botRunning} onClick={() => reopenMut.mutate(row)}
                  className="shrink-0 px-3 py-1 rounded-lg text-[11px] border text-green-400 hover:border-green-500/50 disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>
                  Открыть
                </button>
              ) : (
                <button type="button" disabled={busy || !chat.botRunning} onClick={() => close(row)}
                  className="shrink-0 px-3 py-1 rounded-lg text-[11px] border text-orange-400 hover:border-orange-500/50 disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>
                  Закрыть
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
        Боту нужны права «Управление темами» и «Удаление сообщений». Топик откроется сам, когда выйдет срок.
      </p>
    </div>
  );
}
