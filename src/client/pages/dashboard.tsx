import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Bot as BotIcon, FileText, Clock, Zap } from 'lucide-react';
import { useBots, useCreateBot } from '../hooks/use-bots.js';
import { BotCard } from '../components/bot-card.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { Stepper } from '../components/ui/stepper.js';
import { apiFetch } from '../lib/api.js';

export function DashboardPage() {
  const navigate = useNavigate();
  const { data: bots, isLoading } = useBots();
  const { data: stats } = useQuery({ queryKey: ['stats'], queryFn: () => apiFetch('/stats/overview') });
  const { data: providers } = useQuery({ queryKey: ['ai-providers'], queryFn: () => apiFetch('/ai-providers') });
  const createBot = useCreateBot();
  const [showAddBot, setShowAddBot] = useState(false);
  const [token, setToken] = useState('');
  const [botSearch, setBotSearch] = useState('');

  const handleAddBot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createBot.mutateAsync(token);
      setToken('');
      setShowAddBot(false);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const hasBots = (bots?.length ?? 0) > 0;
  const hasActiveBots = bots?.some((b: any) => b.status === 'active') ?? false;
  const hasProviders = (providers?.length ?? 0) > 0;

  const onboardingSteps = [
    {
      label: 'Добавить Telegram-бота',
      description: 'Откройте @BotFather в Telegram, создайте бота командой /newbot и вставьте полученный токен.',
      done: hasBots,
      action: { label: 'Добавить бота', onClick: () => setShowAddBot(true) },
    },
    {
      label: 'Запустить бота',
      description: 'Нажмите «Запустить» на карточке бота — он подключится к Telegram и начнёт работать.',
      done: hasActiveBots,
    },
    {
      label: 'Подключить AI-модель',
      description: 'Добавьте API-ключ OpenAI, Anthropic, Gemini или OpenRouter — бот будет генерировать посты с помощью AI.',
      done: hasProviders,
      action: { label: 'Перейти к интеграциям', onClick: () => navigate('/integrations') },
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
          <InfoTip text="Центр управления ботами. Здесь вы видите всех ботов, их статус и статистику. Следуйте шагам настройки, чтобы запустить первого бота." position="bottom" />
        </div>
        <button
          onClick={() => setShowAddBot(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
          style={{ background: 'var(--primary)' }}
        >
          <Plus size={16} /> Добавить бота
        </button>
      </div>

      {/* Onboarding */}
      <Stepper title="Начало работы — выполните эти шаги для запуска первого бота" steps={onboardingSteps} />

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 md:gap-4 mb-8">
          {[
            { label: 'Боты', value: stats.totalBots, icon: BotIcon, color: 'text-blue-400', tip: 'Сколько Telegram-ботов вы сейчас управляете' },
            { label: 'Постов сегодня', value: stats.postsToday, icon: FileText, color: 'text-green-400', tip: 'Количество постов, опубликованных в каналы за сегодня' },
            { label: 'В очереди', value: stats.queuedPosts, icon: Clock, color: 'text-yellow-400', tip: 'Посты, одобренные и ожидающие публикации. Публикатор проверяет очередь каждую минуту.' },
            { label: 'Черновики', value: stats.draftPosts, icon: Zap, color: 'text-purple-400', tip: 'Посты, сгенерированные AI и ожидающие вашей проверки. Перейдите в «Посты», чтобы проверить и одобрить.' },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <div className="text-xs flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                      {stat.label}
                      <InfoTip text={stat.tip} position="bottom" />
                    </div>
                  </div>
                  <Icon size={24} className={stat.color} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Bots */}
      {isLoading ? (
        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>Загрузка ботов...</div>
      ) : bots?.length === 0 ? (
        <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <BotIcon size={40} className="mx-auto mb-3 text-zinc-600" />
          <h2 className="text-lg font-semibold mb-2">Пока нет ботов</h2>
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
            Добавьте первого Telegram-бота, чтобы начать.
          </p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Откройте <b>@BotFather</b> в Telegram → отправьте <code>/newbot</code> → скопируйте токен → вставьте сюда.
          </p>
          <button onClick={() => setShowAddBot(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
            <Plus size={16} className="inline mr-1" /> Добавить бота
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <h2 className="text-lg font-semibold">Ваши боты</h2>
            <InfoTip text="Каждая карточка — Telegram-бот. Нажмите на имя или «Настроить». Кнопки Запустить/Остановить управляют подключением к Telegram." position="bottom" />
            {bots.length > 3 && (
              <input
                type="text"
                value={botSearch}
                onChange={(e) => setBotSearch(e.target.value)}
                placeholder="Поиск по ботам..."
                className="ml-auto px-3 py-1.5 rounded-lg border text-xs outline-none w-48"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
              />
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(botSearch
              ? bots.filter((bot: any) => bot.name.toLowerCase().includes(botSearch.toLowerCase()) || bot.username?.toLowerCase().includes(botSearch.toLowerCase()))
              : bots
            ).map((bot: any) => <BotCard key={bot.id} bot={bot} />)}
          </div>
        </div>
      )}

      {/* Add Bot Modal */}
      {showAddBot && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAddBot(false)}>
          <div className="w-full max-w-md mx-4 p-6 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Добавить Telegram-бота</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Откройте <b>@BotFather</b> в Telegram → отправьте <code>/newbot</code> → следуйте инструкциям → скопируйте токен API и вставьте ниже.
            </p>
            <form onSubmit={handleAddBot}>
              <label className="block text-sm font-medium mb-1.5 flex items-center gap-1.5">
                Токен бота
                <InfoTip text="Выглядит как: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz — вы получаете его от @BotFather после создания бота." position="right" />
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:ABCdefGHI..."
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-blue-500 mb-4 font-mono"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
                required
              />
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAddBot(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>
                  Отмена
                </button>
                <button type="submit" disabled={createBot.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
                  {createBot.isPending ? 'Проверяю токен...' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
