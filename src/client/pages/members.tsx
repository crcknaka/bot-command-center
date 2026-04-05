import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Shield, Ban, Unlock, Search, Image, Link2, MessageSquare, Eye } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { useToast } from '../components/ui/toast.js';
import { Spinner } from '../components/ui/spinner.js';
import { EmptyState } from '../components/ui/empty-state.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { cn, timeAgo } from '../lib/utils.js';
import { UserProfileModal } from '../components/user-profile.js';
import { memberStatusConfig } from '../lib/constants.js';

const durations = [
  { label: '5 мин', value: 5 },
  { label: '1 час', value: 60 },
  { label: '1 день', value: 1440 },
  { label: '1 неделя', value: 10080 },
  { label: 'Навсегда', value: 0 },
];

export function MembersPage() {
  const { data: chats } = useQuery({ queryKey: ['stats-chats'], queryFn: () => apiFetch('/stats/chats') });
  const { data: bots } = useQuery({ queryKey: ['bots'], queryFn: () => apiFetch('/bots') });
  const [selectedChat, setSelectedChat] = useState<string | null>(() => localStorage.getItem('members:chat'));
  const [selectedBotId, setSelectedBotId] = useState<number | null>(() => { const v = localStorage.getItem('members:botId'); return v ? Number(v) : null; });
  const selectChat = (chatId: string, botId: number) => { setSelectedChat(chatId); setSelectedBotId(botId); localStorage.setItem('members:chat', chatId); localStorage.setItem('members:botId', String(botId)); };
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionUser, setActionUser] = useState<any>(null);
  const [profileUserId, setProfileUserId] = useState<number | null>(null);
  const toast = useToast();
  const qc = useQueryClient();

  // Find bot for selected chat
  const findBot = (chatId: string) => {
    for (const bot of (bots ?? [])) {
      if (bot.channels?.some((ch: any) => ch.chatId === chatId)) return bot;
    }
    return bots?.[0]; // fallback to first bot
  };

  const handleSelectChat = (chatId: string) => {
    const bot = findBot(chatId);
    selectChat(chatId, bot?.id ?? 0);
  };

  const { data: members, isLoading } = useQuery({
    queryKey: ['members', selectedBotId, selectedChat],
    queryFn: () => apiFetch(`/bots/${selectedBotId}/members?chatId=${selectedChat}`),
    enabled: !!selectedBotId && !!selectedChat,
  });

  const moderateMut = useMutation({
    mutationFn: (data: { chatId: string; userId: number; action: string; duration?: number }) =>
      apiFetch(`/bots/${selectedBotId}/moderate`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (data, vars) => {
      const labels: Record<string, string> = { ban: 'Забанен', unban: 'Разбанен', mute: 'Замучен', unmute: 'Размучен', restrict_media: 'Медиа запрещено', restrict_links: 'Ссылки запрещены' };
      toast.success(labels[vars.action] ?? 'Готово');
      // Update status in cache immediately (Telegram API may lag)
      qc.setQueryData(['members', selectedBotId, selectedChat], (old: any) => {
        if (!old) return old;
        return old.map((u: any) => u.userId === vars.userId ? { ...u, status: data.newStatus ?? u.status } : u);
      });
      setActionUser(null);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  // Deduplicate groups by chatId for display
  const groups = chats?.filter((c: any) => c.type === 'group' || c.type === 'supergroup') ?? [];

  const filtered = (members ?? []).filter((u: any) => {
    if (search && !u.userName?.toLowerCase().includes(search.toLowerCase()) && !u.username?.toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    return true;
  });

  // Stats
  const totalMembers = members?.length ?? 0;
  const statusCounts: Record<string, number> = {};
  for (const u of (members ?? [])) statusCounts[u.status] = (statusCounts[u.status] ?? 0) + 1;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Участники</h1>
          <InfoTip text="Управление участниками групп. Бан, мут, ограничения. Бот должен быть администратором группы с правом управления участниками." position="bottom" />
        </div>
      </div>

      {/* Group selector — like analytics */}
      <div className="flex gap-3 mb-6 flex-wrap">
        {groups.length === 0 && (
          <div className="w-full">
            <EmptyState icon={Users} title="Нет данных" description="Участники появятся когда пользователи начнут писать в группах с активным ботом." />
          </div>
        )}
        {groups.map((chat: any) => (
          <button key={chat.chatId} onClick={() => handleSelectChat(chat.chatId)}
            className={cn('px-4 py-3 rounded-xl border text-left transition-colors', selectedChat === chat.chatId ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
            style={{ borderColor: selectedChat === chat.chatId ? undefined : 'var(--border)', background: selectedChat === chat.chatId ? undefined : 'var(--bg-card)' }}>
            <div className="text-sm font-medium">👥 {chat.title}</div>
            <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {chat.weekMessages} сообщ. · {chat.weekUsers} юзеров за неделю
            </div>
          </button>
        ))}
      </div>

      {selectedChat && selectedBotId && (
        <>
          {/* Summary + Search + Filter */}
          {members && members.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <div className="rounded-xl p-3 border cursor-pointer hover:border-zinc-600" style={{ background: 'var(--bg-card)', borderColor: statusFilter === 'all' ? 'var(--primary)' : 'var(--border)' }}
                onClick={() => setStatusFilter('all')}>
                <div className="text-xl font-bold">{totalMembers}</div>
                <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                  Всего участников
                </div>
              </div>
              {(['member', 'restricted', 'kicked'] as const).map(s => (
                <div key={s} className="rounded-xl p-3 border cursor-pointer hover:border-zinc-600" style={{ background: 'var(--bg-card)', borderColor: statusFilter === s ? 'var(--primary)' : 'var(--border)' }}
                  onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}>
                  <div className={cn('text-xl font-bold', memberStatusConfig[s].color)}>{statusCounts[s] ?? 0}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{memberStatusConfig[s].label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-2.5" style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени или @username..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          </div>

          {isLoading ? (
            <Spinner text="Загрузка участников..." />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={search || statusFilter !== 'all' ? 'Ничего не найдено' : 'Нет данных'}
              description={search || statusFilter !== 'all' ? 'Попробуйте изменить фильтры.' : 'Участники появятся когда начнут писать в группе.'}
            />
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex text-[10px] font-medium px-3 sm:px-4 py-2 border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <span className="w-6 sm:w-8">#</span>
                <span className="flex-1">Участник</span>
                <span className="w-20 text-right hidden sm:block">Сообщений</span>
                <span className="w-24 text-right hidden sm:block">Последнее</span>
                <span className="w-16 sm:w-24 text-center">Статус</span>
                <span className="w-16 sm:w-28 text-right">Действия</span>
              </div>

              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {filtered.map((u: any, i: number) => {
                  const st = memberStatusConfig[u.status] ?? memberStatusConfig.unknown;
                  return (
                    <div key={u.userId} className="flex items-center px-3 sm:px-4 py-2.5 hover:bg-white/[0.02] cursor-pointer" onClick={() => setProfileUserId(u.userId)}>
                      <span className="w-6 sm:w-8 text-[10px] font-mono shrink-0" style={{ color: 'var(--text-muted)' }}>{i + 1}</span>
                      <div className="w-7 h-7 rounded-full mr-2 sm:mr-2.5 shrink-0 flex items-center justify-center text-[10px] font-bold text-white" style={{ background: `hsl(${u.userId % 360}, 50%, 40%)` }}>
                        {(u.userName ?? '?')[0]?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate">{u.userName}</span>
                        {u.username && <span className="text-[11px] ml-1.5 hidden sm:inline" style={{ color: 'var(--text-muted)' }}>@{u.username}</span>}
                      </div>
                      <span className="w-20 text-right text-xs font-mono hidden sm:block">{u.messageCount}</span>
                      <span className="w-24 text-right text-[10px] hidden sm:block" style={{ color: 'var(--text-muted)' }}>{timeAgo(u.lastSeen)}</span>
                      <span className="w-16 sm:w-24 text-center shrink-0">
                        <span className={cn('text-[10px] font-medium px-1.5 sm:px-2 py-0.5 rounded-full', st.color, st.bg)}>{st.label}</span>
                      </span>
                      <div className="w-16 sm:w-28 flex gap-1 justify-end shrink-0" onClick={(e) => e.stopPropagation()}>
                        {u.username && (
                          <a href={`https://t.me/${u.username}`} className="px-1.5 sm:px-2 py-1 rounded text-[10px] bg-zinc-700/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200" title={`Написать @${u.username}`} target="_blank" rel="noopener">
                            <MessageSquare size={11} />
                          </a>
                        )}
                        <button onClick={() => setActionUser(u)} className="px-1.5 sm:px-2 py-1 rounded text-[10px] bg-zinc-700/50 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200" title="Модерация">
                          <Shield size={11} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-4 py-2 text-[10px] border-t" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                Показано {filtered.length} из {totalMembers} · {statusFilter !== 'all' ? `Фильтр: ${memberStatusConfig[statusFilter]?.label}` : 'Все статусы'}
              </div>
            </div>
          )}

          {/* Action modal */}
          {actionUser && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) (() => setActionUser(null))(); }}>
              <div className="w-full max-w-sm p-5 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-zinc-700 flex items-center justify-center text-lg font-bold">
                    {actionUser.userName?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold">{actionUser.userName}</h3>
                    <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {actionUser.username ? `@${actionUser.username} · ` : ''}{actionUser.messageCount} сообщений · {(() => { const st = memberStatusConfig[actionUser.status]; return st ? <span className={st.color}>{st.label}</span> : null; })()}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Mute */}
                  <div>
                    <div className="text-xs font-medium mb-1.5">🔇 Мут <span className="font-normal" style={{ color: 'var(--text-muted)' }}>— запретить писать</span></div>
                    <div className="flex flex-wrap gap-1.5">
                      {durations.map((d) => (
                        <button key={`mute-${d.value}`} onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: actionUser.userId, action: 'mute', duration: d.value })}
                          disabled={moderateMut.isPending}
                          className="px-3 py-1.5 rounded-lg text-xs bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors">
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Restrictions */}
                  <div>
                    <div className="text-xs font-medium mb-1.5">⛔ Ограничения <span className="font-normal" style={{ color: 'var(--text-muted)' }}>— может писать текст, но не медиа/ссылки</span></div>
                    <div className="flex flex-wrap gap-1.5">
                      {durations.map((d) => (
                        <button key={`media-${d.value}`} onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: actionUser.userId, action: 'restrict_media', duration: d.value })}
                          disabled={moderateMut.isPending}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors flex items-center gap-1">
                          <Image size={11} /> Без медиа {d.value > 0 ? d.label : '∞'}
                        </button>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {durations.map((d) => (
                        <button key={`links-${d.value}`} onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: actionUser.userId, action: 'restrict_links', duration: d.value })}
                          disabled={moderateMut.isPending}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors flex items-center gap-1">
                          <Link2 size={11} /> Без ссылок {d.value > 0 ? d.label : '∞'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Ban */}
                  <div>
                    <div className="text-xs font-medium mb-1.5">🚫 Бан <span className="font-normal" style={{ color: 'var(--text-muted)' }}>— удалить из группы, нельзя вернуться</span></div>
                    <div className="flex flex-wrap gap-1.5">
                      {durations.map((d) => (
                        <button key={`ban-${d.value}`} onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: actionUser.userId, action: 'ban', duration: d.value })}
                          disabled={moderateMut.isPending}
                          className="px-3 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Restore */}
                  {(actionUser.status === 'restricted' || actionUser.status === 'kicked') && (
                    <div>
                      <div className="text-xs font-medium mb-1.5">✅ Снять ограничения</div>
                      <div className="flex gap-1.5">
                        <button onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: actionUser.userId, action: 'unmute' })}
                          disabled={moderateMut.isPending}
                          className="px-3 py-1.5 rounded-lg text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">
                          {actionUser.status === 'kicked' ? 'Разбанить' : 'Снять все ограничения'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <button onClick={() => setActionUser(null)} className="w-full mt-4 py-2 rounded-lg text-xs hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>Закрыть</button>
              </div>
            </div>
          )}
          {/* User profile modal */}
          {profileUserId && selectedChat && (
            <UserProfileModal chatId={selectedChat} userId={profileUserId} onClose={() => setProfileUserId(null)} />
          )}
        </>
      )}
    </div>
  );
}
