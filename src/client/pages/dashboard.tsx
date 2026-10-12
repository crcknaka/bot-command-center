import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Bot as BotIcon, FileText, Clock, Zap, Shield, AlertTriangle, Activity, Send, LogIn, Trash2, UserPlus, MessagesSquare, CheckCircle, VolumeX, Pencil } from 'lucide-react';
import { useAuth } from '../lib/auth.js';
import { useAlerts } from '../components/home/use-workspace.js';
import { apiFetch } from '../lib/api.js';
import { cn, timeAgo } from '../lib/utils.js';

const card = { background: 'var(--bg-card)', borderColor: 'var(--border)' };
const muted = { color: 'var(--text-muted)' };

// Activity log meta
const actMeta: Record<string, { icon: any; label: string; color: string }> = {
  'user.login': { icon: LogIn, label: 'Вход', color: 'text-blue-400' },
  'user.registered': { icon: UserPlus, label: 'Регистрация', color: 'text-green-400' },
  'bot.started': { icon: Zap, label: 'Бот запущен', color: 'text-green-400' },
  'bot.stopped': { icon: Zap, label: 'Бот остановлен', color: 'text-zinc-400' },
  'bot.created': { icon: BotIcon, label: 'Бот создан', color: 'text-purple-400' },
  'bot.deleted': { icon: BotIcon, label: 'Бот удалён', color: 'text-red-400' },
  'bot.message_sent': { icon: Send, label: 'Сообщение', color: 'text-green-400' },
  'bot.poll_sent': { icon: FileText, label: 'Опрос отправлен', color: 'text-cyan-400' },
  'post.published': { icon: Send, label: 'Опубликован', color: 'text-green-400' },
  'post.failed': { icon: FileText, label: 'Ошибка публикации', color: 'text-red-400' },
  'post.edited': { icon: Pencil, label: 'Пост изменён в канале', color: 'text-blue-400' },
  'post.unpublished': { icon: Trash2, label: 'Пост удалён из канала', color: 'text-red-400' },
  'mod.deleted': { icon: Trash2, label: 'Удалено ботом', color: 'text-red-400' },
  'mod.muted': { icon: Shield, label: 'Мут', color: 'text-orange-400' },
  'mod.warned': { icon: Shield, label: 'Предупреждение', color: 'text-yellow-400' },
  'mod.topic_closed': { icon: VolumeX, label: 'Топик закрыт', color: 'text-orange-400' },
  'mod.topic_reopened': { icon: VolumeX, label: 'Топик открыт', color: 'text-green-400' },
};

/** The state of things at a glance: what needs attention, the numbers, what happened lately */
export function DashboardPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'superadmin';
  const { failedPosts, stoppedBots, count: alertCount } = useAlerts();
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: () => apiFetch('/stats/overview') });
  const { data: weekly } = useQuery({ queryKey: ['stats-weekly'], queryFn: () => apiFetch('/stats/weekly') });
  const { data: modStats } = useQuery({ queryKey: ['stats-mod'], queryFn: () => apiFetch('/stats/moderation') });
  const { data: chats } = useQuery({ queryKey: ['stats-chats'], queryFn: () => apiFetch('/stats/chats'), refetchInterval: 60000 });
  // The activity log is open to superadmins only
  const { data: activity } = useQuery({ queryKey: ['activity', 'all', 'all'], queryFn: () => apiFetch('/activity?limit=8'), refetchInterval: 30000, enabled: isAdmin });

  const tiles = [
    { label: 'Боты', value: stats?.totalBots, icon: BotIcon, color: 'text-blue-400', to: '/bots' },
    { label: 'Сегодня', value: stats?.postsToday, icon: Send, color: 'text-green-400', to: '/posts?status=published' },
    { label: 'В очереди', value: stats?.queuedPosts, icon: Clock, color: 'text-yellow-400', to: '/schedule' },
    { label: 'Черновики', value: stats?.draftPosts, icon: FileText, color: 'text-purple-400', to: '/posts?status=draft' },
  ];
  const weekMax = Math.max(...(weekly ?? []).map((d: any) => d.published + d.failed + d.drafts), 1);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Обзор</h1>

      {/* Alerts */}
      {alertCount > 0 ? (
        <div className="rounded-xl border p-4 mb-4 space-y-2" style={{ background: 'rgba(239,68,68,0.05)', borderColor: 'rgba(239,68,68,0.2)' }}>
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
      ) : (
        <div className="rounded-xl border px-4 py-3 mb-4 text-sm flex items-center gap-2 text-green-400" style={{ background: 'rgba(34,197,94,0.05)', borderColor: 'rgba(34,197,94,0.2)' }}>
          <CheckCircle size={16} /> Всё работает: боты запущены, постов с ошибками нет
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {tiles.map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.label} to={s.to} className="rounded-xl p-4 border hover:border-zinc-600 transition-colors" style={card}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold">{s.value ?? '–'}</div>
                  <div className="text-xs" style={muted}>{s.label}</div>
                </div>
                <Icon size={22} className={s.color} />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
        {/* Posts per day */}
        <div className="rounded-xl p-4 border" style={card}>
          <h3 className="text-sm font-semibold mb-3">Посты за неделю</h3>
          <div className="flex items-end gap-1 h-20">
            {(weekly ?? []).map((day: any) => {
              const total = day.published + day.failed + day.drafts;
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1" title={`${day.date}: опубликовано ${day.published}, ошибок ${day.failed}, черновиков ${day.drafts}`}>
                  <div className="w-full flex flex-col justify-end" style={{ height: '64px' }}>
                    {day.published > 0 && <div className="bg-green-500/60 rounded-t" style={{ height: `${(day.published / weekMax) * 64}px` }} />}
                    {day.failed > 0 && <div className="bg-red-500/60" style={{ height: `${(day.failed / weekMax) * 64}px` }} />}
                    {day.drafts > 0 && <div className="bg-zinc-500/40 rounded-b" style={{ height: `${(day.drafts / weekMax) * 64}px` }} />}
                    {total === 0 && <div className="bg-zinc-800 rounded" style={{ height: '2px' }} />}
                  </div>
                  <span className="text-[9px]" style={muted}>{day.date.slice(8)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px]" style={muted}>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500/60" /> опубликовано</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/60" /> ошибки</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-zinc-500/40" /> черновики</span>
          </div>
        </div>

        {/* Chats */}
        <div className="rounded-xl p-4 border" style={card}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><MessagesSquare size={14} className="text-blue-400" /> Чаты за неделю</h3>
            <Link to="/analytics" className="text-[10px] text-zinc-500 hover:text-zinc-300">Аналитика →</Link>
          </div>
          {!chats?.length ? (
            <p className="text-xs text-center py-6" style={muted}>Пока нет сообщений</p>
          ) : (
            <div className="space-y-2">
              {chats.slice(0, 6).map((c: any) => (
                <div key={c.chatId} className="flex items-center gap-2 text-xs">
                  <span className="truncate flex-1">{c.title}</span>
                  <span className="shrink-0" style={muted}>{c.weekMessages} сообщ. · {c.weekUsers} чел.</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Moderation */}
        <div className="rounded-xl p-4 border" style={card}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Shield size={14} className="text-blue-400" /> Модерация за неделю</h3>
            <Link to="/chat" className="text-[10px] text-zinc-500 hover:text-zinc-300">Чат →</Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className="text-xl font-bold text-red-400">{modStats?.deleted ?? 0}</div>
              <div className="text-[10px]" style={muted}>удалено</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-orange-400">{modStats?.muted ?? 0}</div>
              <div className="text-[10px]" style={muted}>мутов</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-yellow-400">{modStats?.warned ?? 0}</div>
              <div className="text-[10px]" style={muted}>предупр.</div>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        {isAdmin && (
          <div className="rounded-xl p-4 border" style={card}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Activity size={14} className="text-blue-400" /> Последние действия</h3>
              <Link to="/activity" className="text-[10px] text-zinc-500 hover:text-zinc-300">Журнал →</Link>
            </div>
            {!activity?.length ? (
              <p className="text-xs text-center py-6" style={muted}>Нет действий</p>
            ) : (
              <div className="space-y-2">
                {activity.map((log: any) => {
                  const meta = actMeta[log.action] ?? { icon: Activity, label: log.action, color: 'text-zinc-400' };
                  const Icon = meta.icon;
                  const who = log.action.startsWith('mod.') ? log.details?.userName : (log.botName ?? log.userName);
                  return (
                    <div key={log.id} className="flex items-center gap-2 text-xs">
                      <Icon size={12} className={cn('shrink-0', meta.color)} />
                      <span className={cn('shrink-0', meta.color)}>{meta.label}</span>
                      {who && <span className="truncate" style={muted}>{who}</span>}
                      <span className="text-[9px] shrink-0 ml-auto" style={muted}>{timeAgo(log.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
