import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MessagesSquare } from 'lucide-react';
import { Spinner } from '../components/ui/spinner.js';
import { EmptyState } from '../components/ui/empty-state.js';
import { ChatRules } from '../components/home/chat-rules.js';
import { Violators } from '../components/home/violators.js';
import { Topics } from '../components/home/topics.js';
import { Admins } from '../components/home/admins.js';
import { useWorkspace } from '../components/home/use-workspace.js';
import type { ChatUser, HomeChat } from '../components/home/types.js';
import { apiFetch } from '../lib/api.js';

const CHAT_KEY = 'home:chat';
const keyOf = (g: HomeChat) => `${g.botId}:${g.chatId}`;

/** Everything about running a group: rules, silence, admins, who misbehaves */
export function ChatPage() {
  const { channels, groups, isLoading } = useWorkspace();
  const [chatKey, setChatKey] = useState<string | null>(() => { try { return localStorage.getItem(CHAT_KEY); } catch { return null; } });
  const chat = groups.find((g) => keyOf(g) === chatKey) ?? groups[0];
  const selectChat = (key: string) => { setChatKey(key); try { localStorage.setItem(CHAT_KEY, key); } catch {} };

  // People seen writing in the selected chat this month — who can be trusted or appointed
  const { data: topUsers } = useQuery({
    queryKey: ['stats-top-users', chat?.chatId],
    queryFn: () => apiFetch(`/stats/chat/${chat!.chatId}/top-users?period=month`),
    enabled: !!chat,
  });
  const chatUsers: ChatUser[] = topUsers?.users ?? [];

  const { data: chats } = useQuery({ queryKey: ['stats-chats'], queryFn: () => apiFetch('/stats/chats'), refetchInterval: 60000 });
  const week = chats?.find((c: any) => c.chatId === chat?.chatId);

  const knownTopics = channels
    .filter((ch) => chat && ch.chatId === chat.chatId && ch.botId === chat.botId && ch.threadId)
    .map((ch) => ({ threadId: ch.threadId as number, title: ch.threadTitle || `Топик #${ch.threadId}` }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Чат</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {groups.length > 1 ? (
            <select value={chat ? keyOf(chat) : ''} onChange={(e) => selectChat(e.target.value)}
              className="rounded-lg border px-2 py-1.5 bg-transparent max-w-full" style={{ borderColor: 'var(--border)' }}>
              {groups.map((g) => <option key={keyOf(g)} value={keyOf(g)}>{g.title} · {g.botName}</option>)}
            </select>
          ) : chat ? <span style={{ color: 'var(--text-muted)' }}>{chat.title}</span> : null}
          <Link to="/members" className="text-zinc-400 hover:text-zinc-200">Участники →</Link>
          <Link to="/analytics" className="text-zinc-400 hover:text-zinc-200">Аналитика →</Link>
        </div>
      </div>

      {isLoading ? <Spinner /> : !chat ? (
        <EmptyState icon={MessagesSquare} title="Бот пока не добавлен ни в одну группу"
          description="Добавьте бота в группу админом и напишите там любое сообщение — группа появится здесь." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          <ChatRules channels={channels} chat={chat} users={chatUsers} />

          <div className="space-y-4">
            <Topics chat={chat} knownTopics={knownTopics} />
            <Admins chat={chat} users={chatUsers} />
          </div>

          <div className="space-y-4 lg:col-span-2 xl:col-span-1">
            <Violators />
            <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-3"><MessagesSquare size={14} className="text-blue-400" /> Активность</h3>
              <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
                За неделю: {week?.weekMessages ?? 0} сообщ. · {week?.weekUsers ?? 0} чел.
              </div>
              {chatUsers.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>Пока нет сообщений</p>
              ) : (
                <>
                  <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Самые активные за месяц:</div>
                  <div className="space-y-1">
                    {(topUsers.users as any[]).slice(0, 6).map((u) => (
                      <div key={u.userId} className="flex items-center justify-between text-[11px]">
                        <span className="truncate">{u.userName}{u.username ? ` @${u.username}` : ''}</span>
                        <span className="shrink-0" style={{ color: 'var(--text-muted)' }}>{u.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
