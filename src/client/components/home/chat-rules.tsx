import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Shield, X, ChevronDown } from 'lucide-react';
import { apiFetch } from '../../lib/api.js';
import { cn } from '../../lib/utils.js';
import { useToast } from '../ui/toast.js';
import { Switch } from './switch.js';
import type { ChatUser, HomeChat } from './types.js';

export interface RulesChannel {
  id: number;
  title: string;
  type: string;
  chatId: string;
  botId: number;
  botName: string;
}

interface Rule {
  key: string;
  label: string;
  hint: string;
  isOn: (config: any) => boolean;
  patch: (config: any, on: boolean) => Record<string, unknown>;
}

// Voice and video notes used to share one switch (blockVoice); keep both explicit once either is touched
const notesOn = (c: any) => c.blockVideoNotes ?? c.blockVoice ?? false;

const RULES: Rule[] = [
  { key: 'videoNotes', label: 'Кружки', hint: 'Удалять видео-кружки',
    isOn: notesOn, patch: (c, on) => ({ blockVideoNotes: on, blockVoice: c.blockVoice ?? false }) },
  { key: 'voice', label: 'Голосовые', hint: 'Удалять голосовые сообщения',
    isOn: (c) => c.blockVoice ?? false, patch: (c, on) => ({ blockVoice: on, blockVideoNotes: notesOn(c) }) },
  { key: 'stickers', label: 'Стикеры и GIF', hint: 'Удалять стикеры и гифки',
    isOn: (c) => c.blockStickers ?? false, patch: (_c, on) => ({ blockStickers: on }) },
  { key: 'links', label: 'Ссылки', hint: 'Удалять сообщения со ссылками',
    isOn: (c) => c.blockLinks ?? false, patch: (_c, on) => ({ blockLinks: on }) },
  { key: 'forwards', label: 'Пересылки', hint: 'Удалять пересланные сообщения',
    isOn: (c) => c.blockForwards ?? false, patch: (_c, on) => ({ blockForwards: on }) },
  { key: 'flood', label: 'Антифлуд', hint: 'Удалять, если человек пишет слишком часто',
    isOn: (c) => !!c.antiFlood && !!c.maxMessagesPerMinute,
    patch: (c, on) => ({ antiFlood: on, maxMessagesPerMinute: c.maxMessagesPerMinute || 10 }) },
];

// Each kind of violation has its own warning settings; the home screen switches them together
const WARN_KEYS = ['bannedWordsWarn', 'linksWarn', 'floodWarn', 'forwardsWarn', 'stickersWarn', 'voiceWarn', 'videoNotesWarn', 'shortMsgWarn'];
const warningsOn = (c: any) => WARN_KEYS.some((k) => c[k]?.enabled !== false);
const warningsPatch = (c: any, on: boolean) =>
  Object.fromEntries(WARN_KEYS.map((k) => [k, { enabled: on, texts: c[k]?.texts ?? [] }]));

function Chip({ children, onRemove, disabled }: { children: React.ReactNode; onRemove: () => void; disabled?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-lg text-xs bg-white/5">
      {children}
      <button type="button" disabled={disabled} onClick={onRemove} aria-label="Убрать" className="p-0.5 rounded text-zinc-500 hover:text-red-400 disabled:opacity-40"><X size={12} /></button>
    </span>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="w-full flex items-center justify-between py-2 text-sm hover:text-zinc-200">
        <span>{title}{count ? <span className="ml-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>{count}</span> : null}</span>
        <ChevronDown size={14} className={cn('text-zinc-500 transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="pb-3">{children}</div>}
    </div>
  );
}

const inputCls = 'rounded-lg border px-2 py-1.5 text-xs bg-transparent outline-none focus:border-blue-500';

export function ChatRules({ channels, chat, users }: { channels: RulesChannel[]; chat?: HomeChat; users: ChatUser[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const channelIds = channels.map((ch) => ch.id);
  const queryKey = ['home-moderation', channelIds];

  const { data: modTasks, isLoading } = useQuery({
    queryKey,
    enabled: channelIds.length > 0,
    queryFn: async () => {
      const perChannel = await Promise.all(channelIds.map((id) => apiFetch(`/channels/${id}/tasks`)));
      return perChannel.flat().filter((t: any) => t.type === 'moderation');
    },
  });

  const [taskId, setTaskId] = useState<number | null>(null);
  // Prefer the rules of the bot that runs the selected chat
  const botOf = (t: any) => channels.find((ch) => ch.id === t.channelId)?.botId;
  const task = modTasks?.find((t: any) => t.id === taskId)
    ?? modTasks?.find((t: any) => chat && botOf(t) === chat.botId)
    ?? modTasks?.[0];
  const taskChannel = task ? channels.find((ch) => ch.id === task.channelId) : undefined;

  const groups = channels.filter((ch) => ch.type === 'group' || ch.type === 'supergroup');
  // Topics of one group are separate channel rows; the rules attach to the group once
  const uniqueGroups = groups.filter((ch, i) => groups.findIndex((g) => g.chatId === ch.chatId && g.botId === ch.botId) === i);
  const [newChannelId, setNewChannelId] = useState<number | null>(null);
  const newChannel = uniqueGroups.find((ch) => ch.id === newChannelId)
    ?? uniqueGroups.find((ch) => chat && ch.chatId === chat.chatId && ch.botId === chat.botId)
    ?? uniqueGroups[0];

  const onDone = () => qc.invalidateQueries({ queryKey: ['home-moderation'] });
  const onError = (err: unknown) => toast.error((err as Error).message);

  const saveMut = useMutation({
    mutationFn: (body: { config?: Record<string, unknown>; enabled?: boolean }) =>
      apiFetch(`/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: (updated) => {
      qc.setQueryData(queryKey, (old: any[] | undefined) => old?.map((t) => (t.id === updated.id ? updated : t)));
      toast.success('Правила обновлены');
    },
    onError,
    onSettled: onDone,
  });

  const createMut = useMutation({
    mutationFn: () => apiFetch(`/channels/${newChannel!.id}/tasks`, {
      method: 'POST',
      body: JSON.stringify({ type: 'moderation', config: { bannedWords: [], chatIds: [newChannel!.chatId] } }),
    }),
    onSuccess: () => toast.success('Модерация включена — выберите, что запретить'),
    onError,
    onSettled: onDone,
  });

  const config = (task?.config ?? {}) as any;
  const pending = saveMut.isPending;
  const save = (patch: Record<string, unknown>) => saveMut.mutate({ config: { ...config, ...patch } });

  const [word, setWord] = useState('');
  const bannedWords: string[] = config.bannedWords ?? [];
  const addWord = () => {
    const w = word.trim().toLowerCase();
    if (!w) return;
    if (!bannedWords.includes(w)) save({ bannedWords: [...bannedWords, w] });
    setWord('');
  };

  const trusted: Array<{ id: number; name: string }> = config.trustedUsers
    ?? (config.trustedUserIds ?? []).map((id: number) => ({ id, name: String(id) }));
  const setTrusted = (list: Array<{ id: number; name: string }>) =>
    save({ trustedUsers: list, trustedUserIds: list.map((u) => u.id) });
  const candidates = users.filter((u) => !trusted.some((t) => t.id === u.userId));

  const botGroups = uniqueGroups.filter((ch) => ch.botId === taskChannel?.botId);
  const scopeChatId: string = config.chatIds?.[0] ?? '';

  return (
    <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Shield size={14} className="text-blue-400" /> Правила чата</h3>
        {task && (
          <div className="flex items-center gap-2">
            <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{task.enabled ? 'Включены' : 'Выключены'}</span>
            <Switch on={task.enabled} disabled={pending} label="Модерация включена" onChange={(on) => saveMut.mutate({ enabled: on })} />
          </div>
        )}
      </div>

      {isLoading && <p className="text-xs py-6 text-center" style={{ color: 'var(--text-muted)' }}>Загрузка…</p>}

      {!isLoading && !task && (
        uniqueGroups.length === 0 ? (
          <p className="text-xs py-6 text-center" style={{ color: 'var(--text-muted)' }}>
            Бот пока не добавлен ни в одну группу. Добавьте группу на странице бота — и здесь появятся правила.
          </p>
        ) : (
          <div className="py-3 space-y-3">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Модерация ещё не включена. Бот должен быть админом группы с правом удалять сообщения.</p>
            {uniqueGroups.length > 1 && (
              <select value={newChannel?.id} onChange={(e) => setNewChannelId(Number(e.target.value))} className={cn(inputCls, 'w-full')} style={{ borderColor: 'var(--border)' }}>
                {uniqueGroups.map((ch) => <option key={ch.id} value={ch.id}>{ch.title} · {ch.botName}</option>)}
              </select>
            )}
            <button type="button" disabled={createMut.isPending} onClick={() => createMut.mutate()}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40">
              Включить модерацию{uniqueGroups.length === 1 ? ` в «${newChannel?.title}»` : ''}
            </button>
          </div>
        )
      )}

      {task && (
        <>
          {modTasks!.length > 1 && (
            <select value={task.id} onChange={(e) => setTaskId(Number(e.target.value))} className={cn(inputCls, 'w-full mb-3')} style={{ borderColor: 'var(--border)' }}>
              {modTasks!.map((t: any) => {
                const ch = channels.find((c) => c.id === t.channelId);
                return <option key={t.id} value={t.id}>{ch?.title ?? `Канал ${t.channelId}`} · {ch?.botName}</option>;
              })}
            </select>
          )}

          <div className={cn(!task.enabled && 'opacity-50')}>
            {RULES.map((rule) => (
              <div key={rule.key} className="flex items-center justify-between gap-3 py-2 border-t first:border-t-0" style={{ borderColor: 'var(--border)' }}>
                <div className="min-w-0">
                  <div className="text-sm">{rule.label}</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{rule.hint}</div>
                </div>
                <Switch on={rule.isOn(config)} disabled={pending || !task.enabled} label={rule.label} onChange={(on) => save(rule.patch(config, on))} />
              </div>
            ))}

            <Section title="Запрещённые слова" count={bannedWords.length}>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {bannedWords.map((w) => (
                  <Chip key={w} disabled={pending} onRemove={() => save({ bannedWords: bannedWords.filter((x) => x !== w) })}>{w}</Chip>
                ))}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); addWord(); }} className="flex gap-2">
                <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="Слово или фраза" className={cn(inputCls, 'flex-1 min-w-0')} style={{ borderColor: 'var(--border)' }} />
                <button type="submit" disabled={pending || !word.trim()} className="px-3 py-1.5 rounded-lg text-xs border hover:border-zinc-600 disabled:opacity-40" style={{ borderColor: 'var(--border)' }}>Добавить</button>
              </form>
            </Section>

            <Section title="На кого не действуют" count={trusted.length}>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="text-sm">Не трогать админов</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Выключите, чтобы правила действовали и на админов</div>
                </div>
                <Switch on={config.exemptAdmins !== false} disabled={pending} label="Не трогать админов" onChange={(on) => save({ exemptAdmins: on })} />
              </div>
              <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Доверенные участники:</div>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {trusted.length === 0 && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>никого</span>}
                {trusted.map((u) => (
                  <Chip key={u.id} disabled={pending} onRemove={() => setTrusted(trusted.filter((x) => x.id !== u.id))}>{u.name}</Chip>
                ))}
              </div>
              {candidates.length > 0 && (
                <select value="" disabled={pending} className={cn(inputCls, 'w-full')} style={{ borderColor: 'var(--border)' }}
                  onChange={(e) => {
                    const u = candidates.find((c) => c.userId === Number(e.target.value));
                    if (u) setTrusted([...trusted, { id: u.userId, name: u.userName + (u.username ? ` @${u.username}` : '') }]);
                  }}>
                  <option value="">Добавить из активных участников…</option>
                  {candidates.map((u) => <option key={u.userId} value={u.userId}>{u.userName}{u.username ? ` @${u.username}` : ''}</option>)}
                </select>
              )}
            </Section>

            <Section title="Предупреждения и область действия">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="text-sm">Писать предупреждение</div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Бот отвечает нарушителю в чате; тексты — во «Всех настройках»</div>
                </div>
                <Switch on={warningsOn(config)} disabled={pending} label="Писать предупреждение" onChange={(on) => save(warningsPatch(config, on))} />
              </div>
              <label className="flex items-center justify-between gap-3 mb-3 text-sm">
                Убирать предупреждение через
                <select value={config.warnDeleteSeconds ?? 10} disabled={pending} onChange={(e) => save({ warnDeleteSeconds: Number(e.target.value) })} className={inputCls} style={{ borderColor: 'var(--border)' }}>
                  <option value={0}>не убирать</option>
                  <option value={10}>10 секунд</option>
                  <option value={30}>30 секунд</option>
                  <option value={60}>минуту</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                Где действуют
                <select value={scopeChatId} disabled={pending} onChange={(e) => save({ chatIds: e.target.value ? [e.target.value] : [] })} className={cn(inputCls, 'max-w-[60%]')} style={{ borderColor: 'var(--border)' }}>
                  <option value="">Все группы бота</option>
                  {botGroups.map((ch) => <option key={ch.chatId} value={ch.chatId}>Только «{ch.title}»</option>)}
                </select>
              </label>
            </Section>
          </div>

          {taskChannel && (
            <div className="flex justify-end pt-2 border-t text-[11px]" style={{ borderColor: 'var(--border)' }}>
              <Link to={`/bots/${taskChannel.botId}`} className="text-zinc-400 hover:text-zinc-200">Все настройки →</Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
