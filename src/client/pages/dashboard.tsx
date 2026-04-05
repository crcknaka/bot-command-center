import { useQuery } from '@tanstack/react-query';
import { useNavigate, Link } from 'react-router-dom';
import { Bot as BotIcon, FileText, Clock, Zap, Shield, AlertTriangle, Calendar, Activity, Send, LogIn, Trash2, UserPlus } from 'lucide-react';
import { useBots } from '../hooks/use-bots.js';
import { Stepper } from '../components/ui/stepper.js';
import { apiFetch } from '../lib/api.js';
import { cn, timeAgo } from '../lib/utils.js';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: bots } = useBots();
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: () => apiFetch('/stats/overview') });
  const { data: weekly } = useQuery({ queryKey: ['stats-weekly'], queryFn: () => apiFetch('/stats/weekly') });
  const { data: modStats } = useQuery({ queryKey: ['stats-mod'], queryFn: () => apiFetch('/stats/moderation') });
  const { data: providers } = useQuery({ queryKey: ['ai-providers'], queryFn: () => apiFetch('/ai-providers') });
  const { data: posts } = useQuery({ queryKey: ['posts'], queryFn: () => apiFetch('/posts?limit=20') });
  const { data: activity } = useQuery({ queryKey: ['activity', 'all', 'all'], queryFn: () => apiFetch('/activity?limit=7'), refetchInterval: 30000 });

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

  // Alerts
  const failedPosts = posts?.filter((p: any) => p.status === 'failed') ?? [];
  const stoppedBots = bots?.filter((b: any) => b.status === 'stopped' || b.status === 'error') ?? [];
  const hasAlerts = failedPosts.length > 0 || stoppedBots.length > 0;

  // Upcoming posts (queued, sorted by scheduledFor)
  const upcoming = (posts ?? [])
    .filter((p: any) => p.status === 'queued' && p.scheduledFor)
    .sort((a: any, b: any) => (a.scheduledFor ?? '').localeCompare(b.scheduledFor ?? ''))
    .slice(0, 5);

  // Activity log meta
  const actMeta: Record<string, { icon: any; label: string; color: string }> = {
    'user.login': { icon: LogIn, label: 'Вход', color: 'text-blue-400' },
    'user.registered': { icon: UserPlus, label: 'Регистрация', color: 'text-green-400' },
    'bot.started': { icon: Zap, label: 'Бот запущен', color: 'text-green-400' },
    'bot.stopped': { icon: Zap, label: 'Бот остановлен', color: 'text-zinc-400' },
    'bot.created': { icon: BotIcon, label: 'Бот создан', color: 'text-purple-400' },
    'bot.deleted': { icon: BotIcon, label: 'Бот удалён', color: 'text-red-400' },
    'bot.message_sent': { icon: Send, label: 'Сообщение', color: 'text-green-400' },
    'post.published': { icon: Send, label: 'Опубликован', color: 'text-green-400' },
    'post.failed': { icon: FileText, label: 'Ошибка публикации', color: 'text-red-400' },
    'mod.deleted': { icon: Trash2, label: 'Удалено ботом', color: 'text-red-400' },
    'mod.muted': { icon: Shield, label: 'Мут', color: 'text-orange-400' },
    'mod.warned': { icon: Shield, label: 'Предупреждение', color: 'text-yellow-400' },
  };

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

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Боты', value: stats.totalBots, icon: BotIcon, color: 'text-blue-400', to: '/bots' },
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

      {/* Two columns: Upcoming + Activity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
                  <span className="font-mono text-[10px] text-yellow-400 w-12 shrink-0">
                    {new Date(p.scheduledFor).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <span className="truncate flex-1" style={{ color: 'var(--text-muted)' }}>
                    {p.content?.replace(/<[^>]+>/g, '').slice(0, 60)}...
                  </span>
                  <span className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {new Date(p.scheduledFor).toLocaleDateString('ru', { day: 'numeric', month: 'short' })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><Activity size={14} className="text-blue-400" /> Последние действия</h3>
            <Link to="/activity" className="text-[10px] text-zinc-500 hover:text-zinc-300">Журнал →</Link>
          </div>
          {!activity?.length ? (
            <p className="text-xs text-center py-6" style={{ color: 'var(--text-muted)' }}>Нет действий</p>
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
                    {who && <span className="truncate" style={{ color: 'var(--text-muted)' }}>{who}</span>}
                    <span className="text-[9px] shrink-0 ml-auto" style={{ color: 'var(--text-muted)' }}>{timeAgo(log.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Weekly chart + Moderation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {weekly?.length > 0 && (
          <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <h3 className="text-sm font-semibold mb-3">Посты за неделю</h3>
            <div className="flex items-end gap-1 h-20">
              {weekly.map((day: any) => {
                const total = day.published + day.failed + day.drafts;
                const maxVal = Math.max(...weekly.map((d: any) => d.published + d.failed + d.drafts), 1);
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full flex flex-col justify-end" style={{ height: '64px' }}>
                      {day.published > 0 && <div className="bg-green-500/60 rounded-t" style={{ height: `${(day.published / maxVal) * 64}px` }} />}
                      {day.failed > 0 && <div className="bg-red-500/60" style={{ height: `${(day.failed / maxVal) * 64}px` }} />}
                      {day.drafts > 0 && <div className="bg-zinc-500/40 rounded-b" style={{ height: `${(day.drafts / maxVal) * 64}px` }} />}
                      {total === 0 && <div className="bg-zinc-800 rounded" style={{ height: '2px' }} />}
                    </div>
                    <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>{day.date.slice(8)}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-3 mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500/60" /> опубликовано</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-red-500/60" /> ошибки</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-zinc-500/40" /> черновики</span>
            </div>
          </div>
        )}

        {modStats?.total > 0 && (
          <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2"><Shield size={14} className="text-blue-400" /> Модерация за 7 дней</h3>
              <Link to="/activity?type=mod" className="text-[10px] text-zinc-500 hover:text-zinc-300">Подробнее →</Link>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-3">
              <div className="text-center">
                <div className="text-xl font-bold text-red-400">{modStats.deleted}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>удалено</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-orange-400">{modStats.muted}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>мутов</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold text-yellow-400">{modStats.warned}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>предупр.</div>
              </div>
            </div>
            {modStats.topViolators?.length > 0 && (
              <div>
                <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>Топ нарушителей:</div>
                <div className="space-y-1">
                  {modStats.topViolators.map((v: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-[11px]">
                      <span>{v.name}</span>
                      <span className="text-red-400/70">{v.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
