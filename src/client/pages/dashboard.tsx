import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { Bot as BotIcon, FileText, Clock, AlertTriangle, Calendar, Send, MessagesSquare } from 'lucide-react';
import { useBots } from '../hooks/use-bots.js';
import { Stepper } from '../components/ui/stepper.js';
import { useToast } from '../components/ui/toast.js';
import { Composer } from '../components/home/composer.js';
import { ChatRules } from '../components/home/chat-rules.js';
import { Violators } from '../components/home/violators.js';
import { Topics } from '../components/home/topics.js';
import { Admins } from '../components/home/admins.js';
import type { ChatUser, HomeChat } from '../components/home/types.js';
import { apiFetch } from '../lib/api.js';

export function DashboardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: bots } = useBots();
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: () => apiFetch('/stats/overview') });
  const { data: providers } = useQuery({ queryKey: ['ai-providers'], queryFn: () => apiFetch('/ai-providers') });
  const { data: queued } = useQuery({ queryKey: ['posts', { status: 'queued' }], queryFn: () => apiFetch('/posts?status=queued') });
  const { data: failed } = useQuery({ queryKey: ['posts', { status: 'failed' }], queryFn: () => apiFetch('/posts?status=failed') });
  const { data: chats } = useQuery({ queryKey: ['stats-chats'], queryFn: () => apiFetch('/stats/chats'), refetchInterval: 60000 });

  const hasBots = (bots?.length ?? 0) > 0;
  const hasActiveBots = bots?.some((b: any) => b.status === 'active') ?? false;
  const hasProviders = (providers?.length ?? 0) > 0;
  const hasChannels = bots?.some((b: any) => b.channels?.length > 0) ?? false;

  const onboardingSteps = [
    { label: 'Добавить Telegram-бота', description: 'Откройте @BotFather, создайте бота /newbot, вставьте токен.', done: hasBots, action: { label: 'Перейти к ботам', onClick: () => navigate('/bots') } },
    { label: 'Запустить бота', description: 'Нажмите «Запустить» на карточке бота.', done: hasActiveBots, action: hasBots ? { label: 'Перейти к ботам', onClick: () => navigate('/bots') } : undefined },
    { label: 'Подключить AI-модель', description: 'Добавьте API-ключ OpenAI, Anthropic, Gemini или OpenRouter.', done: hasProviders, action: { label: 'Настройки', onClick: () => navigate('/settings') } },
    { label: 'Настроить канал и задачу', description: 'Откройте бота → добавьте канал → создайте задачу.', done: hasChannels, action: hasBots ? { label: 'Настроить', onClick: () => navigate(`/bots/${bots?.[0]?.id}`) } : undefined },
  ];
  const allDone = onboardingSteps.every(s => s.done);

  // Every channel and topic of every bot — the places a post or a rule can go
  const channels = (bots ?? []).flatMap((bot: any) =>
    (bot.channels ?? []).map((ch: any) => ({
      id: ch.id,
      title: ch.title + (ch.threadId ? ` # ${ch.threadTitle || ch.threadId}` : ''),
      type: ch.type,
      chatId: ch.chatId,
      threadId: ch.threadId as number | null,
      threadTitle: ch.threadTitle as string | null,
      botId: bot.id,
      botName: bot.name,
      botRunning: !!bot.isRunning,
    }))
  );
  // Groups the bot sits in; topics of one group are separate channel rows, so they collapse here
  const groups: HomeChat[] = [];
  for (const bot of bots ?? []) {
    for (const ch of bot.channels ?? []) {
      if (ch.type !== 'group' && ch.type !== 'supergroup') continue;
      if (groups.some((g) => g.chatId === ch.chatId && g.botId === bot.id)) continue;
      groups.push({ chatId: ch.chatId, title: ch.title, botId: bot.id, botName: bot.name, botRunning: !!bot.isRunning });
    }
  }
  const [chatKey, setChatKey] = useState<string | null>(() => { try { return localStorage.getItem('home:chat'); } catch { return null; } });
  const keyOf = (g: HomeChat) => `${g.botId}:${g.chatId}`;
  const chat = groups.find((g) => keyOf(g) === chatKey) ?? groups[0];
  const selectChat = (key: string) => { setChatKey(key); try { localStorage.setItem('home:chat', key); } catch {} };

  // People seen writing in the selected chat this month — who can be trusted or appointed
  const { data: topUsers } = useQuery({
    queryKey: ['stats-top-users', chat?.chatId],
    queryFn: () => apiFetch(`/stats/chat/${chat!.chatId}/top-users?period=month`),
    enabled: !!chat,
  });
  const chatUsers: ChatUser[] = topUsers?.users ?? [];
  const chatWeek = chats?.find((c: any) => c.chatId === chat?.chatId);
  const knownTopics = channels
    .filter((ch: any) => chat && ch.chatId === chat.chatId && ch.botId === chat.botId && ch.threadId)
    .map((ch: any) => ({ threadId: ch.threadId as number, title: ch.threadTitle || `Топик #${ch.threadId}` }));

  const channelTitle = (id: number) => channels.find((ch: any) => ch.id === id)?.title ?? '';

  // Alerts
  const failedPosts = failed ?? [];
  const stoppedBots = bots?.filter((b: any) => b.status === 'stopped' || b.status === 'error') ?? [];
  const hasAlerts = failedPosts.length > 0 || stoppedBots.length > 0;

  // Upcoming posts (queued, sorted by scheduledFor)
  const upcoming = (queued ?? [])
    .slice()
    .sort((a: any, b: any) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))
    .slice(0, 6);

  const unqueueMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/posts/${id}`, { method: 'PATCH', body: JSON.stringify({ status: 'draft' }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posts'] }); qc.invalidateQueries({ queryKey: ['stats'] }); toast.success('Публикация отменена, пост в черновиках'); },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Главная</h1>
      </div>

      {/* Onboarding */}
      {!allDone && <Stepper title="Начало работы" steps={onboardingSteps} />}

      {/* Alerts */}
      {hasAlerts && (
        <div className="rounded-xl border p-4 mb-6 space-y-2" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
          <h3 className="text-sm font-semibold flex items-center gap-2 text-red-400"><AlertTriangle size={16} /> Требует внимания</h3>
          {failedPosts.length > 0 && (
            <Link to="/posts?status=failed" className="flex items-center gap-2 text-xs text-red-400/80 hover:text-red-400">
              <FileText size={12} /> {failedPosts.length} {failedPosts.length === 1 ? 'пост с ошибкой' : 'постов с ошибкой'}
            </Link>
          )}
          {stoppedBots.map((b: any) => (
            <Link key={b.id} to={`/bots/${b.id}`} className="flex items-center gap-2 text-xs text-orange-400/80 hover:text-orange-400">
              <BotIcon size={12} /> Бот «{b.name}» {b.status === 'error' ? 'ошибка' : 'остановлен'}
            </Link>
          ))}
        </div>
      )}

      <Composer channels={channels} />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Сегодня', value: stats.postsToday, icon: Send, color: 'text-green-400', to: '/posts' },
            { label: 'В очереди', value: stats.queuedPosts, icon: Clock, color: 'text-yellow-400', to: '/schedule' },
            { label: 'Черновики', value: stats.draftPosts, icon: FileText, color: 'text-purple-400', to: '/posts?status=draft' },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.label} to={s.to} className="rounded-xl p-4 border hover:border-zinc-600 transition-colors" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold">{s.value}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                  </div>
                  <Icon size={22} className={s.color} />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Chat management */}
      {hasChannels && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold">Управление чатом</h2>
            {groups.length > 1 && (
              <select value={chat ? keyOf(chat) : ''} onChange={(e) => selectChat(e.target.value)}
                className="text-xs rounded-lg border px-2 py-1.5 bg-transparent max-w-full" style={{ borderColor: 'var(--border)' }}>
                {groups.map((g) => <option key={keyOf(g)} value={keyOf(g)}>{g.title} · {g.botName}</option>)}
              </select>
            )}
            {groups.length === 1 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{chat?.title}</span>}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 items-start">
            <ChatRules channels={channels} chat={chat} users={chatUsers} />
            <div className="space-y-4">
              <Violators />
              {chat && <Topics chat={chat} knownTopics={knownTopics} />}
              {chat && <Admins chat={chat} users={chatUsers} />}
            </div>
          </div>
        </>
      )}

      {/* Two columns: Upcoming + Chat week */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Upcoming publications */}
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Calendar size={14} className="text-yellow-400" /> Ближайшие публикации</h3>
            <Link to="/schedule" className="text-[10px] text-zinc-500 hover:text-zinc-300">Расписание →</Link>
          </div>
          {upcoming.length === 0 ? (
            <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>Нет запланированных постов</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map((p: any) => (
                <div key={p.id} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-[10px] text-yellow-400 w-24 shrink-0 whitespace-nowrap">
                    {p.scheduledFor
                      ? new Date(p.scheduledFor).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                      : 'скоро'}
                  </span>
                  <span className="truncate flex-1" title={channelTitle(p.channelId)} style={{ color: 'var(--text-muted)' }}>
                    {p.content?.replace(/<[^>]+>/g, '').slice(0, 80)}
                  </span>
                  <button type="button" disabled={unqueueMut.isPending} onClick={() => unqueueMut.mutate(p.id)}
                    className="shrink-0 text-[10px] text-zinc-500 hover:text-red-400 disabled:opacity-40" title="Убрать из очереди в черновики">
                    Отменить
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chat activity */}
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><MessagesSquare size={14} className="text-blue-400" /> Чат за неделю</h3>
            <Link to="/analytics" className="text-[10px] text-zinc-500 hover:text-zinc-300">Аналитика →</Link>
          </div>
          {!chats?.length ? (
            <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>Пока нет сообщений</p>
          ) : (
            <>
              <div className="space-y-2 mb-3">
                {chats.slice(0, 3).map((c: any) => (
                  <div key={c.chatId} className="flex items-center gap-2 text-xs">
                    <span className="truncate flex-1">{c.title}</span>
                    <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{c.weekMessages} сообщ. · {c.weekUsers} чел.</span>
                  </div>
                ))}
              </div>
              {chat && chatUsers.length > 0 && (
                <div>
                  <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Самые активные в «{chatWeek?.title ?? chat.title}» за месяц:</div>
                  <div className="space-y-1">
                    {chatUsers.slice(0, 5).map((u: any) => (
                      <div key={u.userId} className="flex items-center justify-between text-[11px]">
                        <span className="truncate">{u.userName}{u.username ? ` @${u.username}` : ''}</span>
                        <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{u.count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
