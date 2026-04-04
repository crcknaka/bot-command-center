import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bot as BotIcon, FileText, Clock, Zap, Shield } from 'lucide-react';
import { useBots } from '../hooks/use-bots.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { Stepper } from '../components/ui/stepper.js';
import { apiFetch } from '../lib/api.js';
import { cn } from '../lib/utils.js';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: bots } = useBots();
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: () => apiFetch('/stats/overview') });
  const { data: weekly } = useQuery({ queryKey: ['stats-weekly'], queryFn: () => apiFetch('/stats/weekly') });
  const { data: modStats } = useQuery({ queryKey: ['stats-mod'], queryFn: () => apiFetch('/stats/moderation') });
  const { data: providers } = useQuery({ queryKey: ['ai-providers'], queryFn: () => apiFetch('/ai-providers') });

  const hasBots = (bots?.length ?? 0) > 0;
  const hasActiveBots = bots?.some((b: any) => b.status === 'active') ?? false;
  const hasProviders = (providers?.length ?? 0) > 0;

  const onboardingSteps = [
    {
      label: 'Добавить Telegram-бота',
      description: 'Откройте @BotFather в Telegram, создайте бота командой /newbot и вставьте полученный токен.',
      done: hasBots,
      action: { label: 'Перейти к ботам', onClick: () => navigate('/bots') },
    },
    {
      label: 'Запустить бота',
      description: 'Нажмите «Запустить» на карточке бота — он подключится к Telegram и начнёт работать.',
      done: hasActiveBots,
      action: hasBots ? { label: 'Перейти к ботам', onClick: () => navigate('/bots') } : undefined,
    },
    {
      label: 'Подключить AI-модель',
      description: 'Добавьте API-ключ OpenAI, Anthropic, Gemini или OpenRouter — бот будет генерировать посты с помощью AI.',
      done: hasProviders,
      action: { label: 'Перейти к интеграциям', onClick: () => navigate('/settings') },
    },
    {
      label: 'Настроить канал и задачу',
      description: 'Откройте бота → добавьте Telegram-канал → создайте задачу «Новостная лента» → добавьте источники.',
      done: false,
      action: hasBots ? { label: 'Открыть настройки бота', onClick: () => navigate(`/bots/${bots?.[0]?.id}`) } : undefined,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Главная</h1>
          <InfoTip text="Обзор системы: статистика, аналитика, шаги настройки." position="bottom" />
        </div>
      </div>

      {/* Onboarding */}
      <Stepper title="Начало работы — выполните эти шаги для запуска первого бота" steps={onboardingSteps} />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-8">
          {[
            { label: 'Боты', value: stats.totalBots, icon: BotIcon, color: 'text-blue-400', tip: 'Сколько Telegram-ботов вы управляете', onClick: () => navigate('/bots') },
            { label: 'Постов сегодня', value: stats.postsToday, icon: FileText, color: 'text-green-400', tip: 'Количество постов, опубликованных за сегодня', onClick: () => navigate('/posts') },
            { label: 'В очереди', value: stats.queuedPosts, icon: Clock, color: 'text-yellow-400', tip: 'Посты, ожидающие публикации', onClick: () => navigate('/posts') },
            { label: 'Черновики', value: stats.draftPosts, icon: Zap, color: 'text-purple-400', tip: 'Посты для проверки', onClick: () => navigate('/posts') },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-xl p-4 border cursor-pointer hover:border-zinc-600 transition-colors" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={stat.onClick}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <div className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                      {stat.label}
                    </div>
                  </div>
                  <Icon size={24} className={stat.color} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Weekly chart + Moderation */}
      {(weekly?.length > 0 || (modStats?.total > 0)) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {weekly?.length > 0 && (
            <div className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-semibold mb-3">Посты за неделю</h3>
              <div className="flex items-end gap-1 h-24">
                {weekly.map((day: any) => {
                  const total = day.published + day.failed + day.drafts;
                  const maxVal = Math.max(...weekly.map((d: any) => d.published + d.failed + d.drafts), 1);
                  return (
                    <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                        {day.published > 0 && <div className="bg-green-500/60 rounded-t" style={{ height: `${(day.published / maxVal) * 80}px` }} />}
                        {day.failed > 0 && <div className="bg-red-500/60" style={{ height: `${(day.failed / maxVal) * 80}px` }} />}
                        {day.drafts > 0 && <div className="bg-zinc-500/40 rounded-b" style={{ height: `${(day.drafts / maxVal) * 80}px` }} />}
                        {total === 0 && <div className="bg-zinc-800 rounded" style={{ height: '3px' }} />}
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
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Shield size={14} className="text-blue-400" /> Модерация за 7 дней</h3>
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
                        <span className="text-red-400/70">{v.count} нарушений</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
