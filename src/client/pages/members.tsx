import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Shield, Ban, Unlock, MessageSquare, Search, Image, Link2 } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { useBots } from '../hooks/use-bots.js';
import { useToast } from '../components/ui/toast.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { cn, timeAgo } from '../lib/utils.js';

const statusLabels: Record<string, { label: string; color: string }> = {
  member: { label: 'Участник', color: 'text-green-400' },
  administrator: { label: 'Админ', color: 'text-blue-400' },
  creator: { label: 'Создатель', color: 'text-purple-400' },
  restricted: { label: 'Ограничен', color: 'text-orange-400' },
  kicked: { label: 'Забанен', color: 'text-red-400' },
  left: { label: 'Вышел', color: 'text-zinc-500' },
  unknown: { label: '—', color: 'text-zinc-500' },
};

const durations = [
  { label: '5 мин', value: 5 },
  { label: '1 час', value: 60 },
  { label: '1 день', value: 1440 },
  { label: '1 неделя', value: 10080 },
  { label: 'Навсегда', value: 0 },
];

export function MembersPage() {
  const { data: bots } = useBots();
  const [selectedBot, setSelectedBot] = useState<number | null>(null);
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actionUser, setActionUser] = useState<any>(null);
  const toast = useToast();
  const qc = useQueryClient();

  const bot = bots?.find((b: any) => b.id === selectedBot);
  const groups = bot?.channels?.filter((ch: any) => ch.type === 'supergroup' || ch.type === 'group') ?? [];

  const { data: members, isLoading } = useQuery({
    queryKey: ['members', selectedBot, selectedChat],
    queryFn: () => apiFetch(`/bots/${selectedBot}/members?chatId=${selectedChat}`),
    enabled: !!selectedBot && !!selectedChat,
  });

  const moderateMut = useMutation({
    mutationFn: (data: { chatId: string; userId: number; action: string; duration?: number }) =>
      apiFetch(`/bots/${selectedBot}/moderate`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => {
      toast.success(`${vars.action === 'ban' ? 'Забанен' : vars.action === 'unban' ? 'Разбанен' : vars.action === 'mute' ? 'Замучен' : vars.action === 'unmute' ? 'Размучен' : 'Ограничен'}!`);
      qc.invalidateQueries({ queryKey: ['members'] });
      setActionUser(null);
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const filtered = members?.filter((u: any) =>
    !search || u.userName?.toLowerCase().includes(search.toLowerCase()) || u.username?.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Участники</h1>
          <InfoTip text="Управление участниками групп — бан, мут, ограничения. Бот должен быть админом группы." position="bottom" />
        </div>
      </div>

      {/* Bot + Group selector */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <select value={selectedBot ?? ''} onChange={(e) => { setSelectedBot(Number(e.target.value) || null); setSelectedChat(null); }}
          className="px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
          <option value="">Выберите бота</option>
          {bots?.map((b: any) => <option key={b.id} value={b.id}>{b.name} {b.username ? `@${b.username}` : ''}</option>)}
        </select>
        {selectedBot && groups.length > 0 && (
          <select value={selectedChat ?? ''} onChange={(e) => setSelectedChat(e.target.value || null)}
            className="px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
            <option value="">Выберите группу</option>
            {groups.map((ch: any) => <option key={ch.id} value={ch.chatId}>👥 {ch.title}</option>)}
          </select>
        )}
      </div>

      {selectedBot && selectedChat && (
        <>
          {/* Search */}
          <div className="relative mb-4">
            <Search size={14} className="absolute left-3 top-2.5" style={{ color: 'var(--text-muted)' }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по имени или @username..."
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          </div>

          {isLoading ? (
            <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>Загрузка участников...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <Users size={40} className="mx-auto mb-3 text-zinc-600" />
              <p className="font-medium mb-1">Нет данных</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Участники появятся когда начнут писать в группе.</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              {/* Header */}
              <div className="flex text-[10px] font-medium px-4 py-2 border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                <span className="flex-1">Участник</span>
                <span className="w-20 text-right hidden sm:block">Сообщений</span>
                <span className="w-24 text-right hidden sm:block">Последнее</span>
                <span className="w-20 text-center">Статус</span>
                <span className="w-28 text-right">Действия</span>
              </div>

              {/* Users */}
              <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
                {filtered.map((u: any) => {
                  const st = statusLabels[u.status] ?? statusLabels.unknown;
                  return (
                    <div key={u.userId} className="flex items-center px-4 py-2.5 hover:bg-white/[0.02]">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium">{u.userName}</span>
                        {u.username && <span className="text-[11px] ml-1.5" style={{ color: 'var(--text-muted)' }}>@{u.username}</span>}
                      </div>
                      <span className="w-20 text-right text-xs font-mono hidden sm:block">{u.messageCount}</span>
                      <span className="w-24 text-right text-[10px] hidden sm:block" style={{ color: 'var(--text-muted)' }}>{timeAgo(u.lastSeen)}</span>
                      <span className={cn('w-20 text-center text-[10px] font-medium', st.color)}>{st.label}</span>
                      <div className="w-28 flex gap-1 justify-end">
                        {u.status !== 'kicked' ? (
                          <>
                            <button onClick={() => setActionUser(u)} className="px-2 py-1 rounded text-[10px] bg-orange-500/10 text-orange-400 hover:bg-orange-500/20" title="Мут">
                              <Shield size={11} />
                            </button>
                            <button onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: u.userId, action: 'ban', duration: 0 })}
                              disabled={moderateMut.isPending}
                              className="px-2 py-1 rounded text-[10px] bg-red-500/10 text-red-400 hover:bg-red-500/20" title="Забанить навсегда">
                              <Ban size={11} />
                            </button>
                          </>
                        ) : (
                          <button onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: u.userId, action: 'unban' })}
                            disabled={moderateMut.isPending}
                            className="px-2 py-1 rounded text-[10px] bg-green-500/10 text-green-400 hover:bg-green-500/20" title="Разбанить">
                            <Unlock size={11} />
                          </button>
                        )}
                        {u.status === 'restricted' && (
                          <button onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: u.userId, action: 'unmute' })}
                            disabled={moderateMut.isPending}
                            className="px-2 py-1 rounded text-[10px] bg-green-500/10 text-green-400 hover:bg-green-500/20" title="Снять ограничения">
                            <Unlock size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Action modal */}
          {actionUser && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setActionUser(null)}>
              <div className="w-full max-w-sm p-5 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
                <h3 className="text-sm font-bold mb-1">Действие: {actionUser.userName}</h3>
                <p className="text-[11px] mb-4" style={{ color: 'var(--text-muted)' }}>
                  {actionUser.username ? `@${actionUser.username} · ` : ''}{actionUser.messageCount} сообщений
                </p>

                <div className="space-y-2">
                  <div className="text-xs font-medium mb-1">Мут (запрет писать)</div>
                  <div className="flex flex-wrap gap-1.5">
                    {durations.map((d) => (
                      <button key={d.value} onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: actionUser.userId, action: 'mute', duration: d.value })}
                        disabled={moderateMut.isPending}
                        className="px-3 py-1.5 rounded-lg text-xs bg-orange-500/10 text-orange-400 hover:bg-orange-500/20">
                        {d.label}
                      </button>
                    ))}
                  </div>

                  <div className="text-xs font-medium mt-3 mb-1">Ограничения</div>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: actionUser.userId, action: 'restrict_media', duration: 0 })}
                      disabled={moderateMut.isPending}
                      className="px-3 py-1.5 rounded-lg text-xs bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 flex items-center gap-1">
                      <Image size={12} /> Запретить медиа
                    </button>
                    <button onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: actionUser.userId, action: 'restrict_links', duration: 0 })}
                      disabled={moderateMut.isPending}
                      className="px-3 py-1.5 rounded-lg text-xs bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 flex items-center gap-1">
                      <Link2 size={12} /> Запретить ссылки
                    </button>
                  </div>

                  <div className="text-xs font-medium mt-3 mb-1">Бан</div>
                  <div className="flex flex-wrap gap-1.5">
                    {durations.map((d) => (
                      <button key={d.value} onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: actionUser.userId, action: 'ban', duration: d.value })}
                        disabled={moderateMut.isPending}
                        className="px-3 py-1.5 rounded-lg text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20">
                        {d.label}
                      </button>
                    ))}
                  </div>

                  {(actionUser.status === 'restricted' || actionUser.status === 'kicked') && (
                    <>
                      <div className="text-xs font-medium mt-3 mb-1">Снять</div>
                      <div className="flex gap-1.5">
                        <button onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: actionUser.userId, action: 'unmute' })}
                          className="px-3 py-1.5 rounded-lg text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20">Снять мут</button>
                        <button onClick={() => moderateMut.mutate({ chatId: selectedChat!, userId: actionUser.userId, action: 'unban' })}
                          className="px-3 py-1.5 rounded-lg text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20">Разбанить</button>
                      </div>
                    </>
                  )}
                </div>

                <button onClick={() => setActionUser(null)} className="w-full mt-4 py-2 rounded-lg text-xs" style={{ color: 'var(--text-muted)' }}>Отмена</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
