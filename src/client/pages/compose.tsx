import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Stepper } from '../components/ui/stepper.js';
import { Spinner } from '../components/ui/spinner.js';
import { Composer } from '../components/home/composer.js';
import { Upcoming } from '../components/home/upcoming.js';
import { PostCounters } from '../components/home/post-counters.js';
import { useWorkspace } from '../components/home/use-workspace.js';
import { apiFetch } from '../lib/api.js';

/** Start screen: write a post, see what goes out next */
export function ComposePage() {
  const navigate = useNavigate();
  const { bots, channels, isLoading } = useWorkspace();
  const { data: providers } = useQuery({ queryKey: ['ai-providers'], queryFn: () => apiFetch('/ai-providers') });

  const hasBots = bots.length > 0;
  const hasActiveBots = bots.some((b) => b.status === 'active');
  const hasChannels = channels.length > 0;
  const hasProviders = (providers?.length ?? 0) > 0;

  const onboardingSteps = [
    { label: 'Добавить Telegram-бота', description: 'Откройте @BotFather, создайте бота /newbot, вставьте токен.', done: hasBots, action: { label: 'Перейти к ботам', onClick: () => navigate('/bots') } },
    { label: 'Запустить бота', description: 'Нажмите «Запустить» на карточке бота.', done: hasActiveBots, action: hasBots ? { label: 'Перейти к ботам', onClick: () => navigate('/bots') } : undefined },
    { label: 'Добавить канал или группу', description: 'Откройте бота → добавьте канал. Бот должен быть в нём админом.', done: hasChannels, action: hasBots ? { label: 'Настроить', onClick: () => navigate(`/bots/${bots[0]?.id}`) } : undefined },
    { label: 'Подключить AI-модель (по желанию)', description: 'Нужна только для автоматической генерации постов.', done: hasProviders, action: { label: 'Настройки', onClick: () => navigate('/settings') } },
  ];
  // The setup guide is for an empty panel only; a bot that stopped later is reported by the alerts bar
  const ready = hasBots && hasChannels;

  const channelTitle = (id: number) => channels.find((ch) => ch.id === id)?.title ?? '';

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Новый пост</h1>

      {isLoading ? <Spinner /> : (
        <>
          {!ready && <Stepper title="Начало работы" steps={onboardingSteps} />}

          {/* The editor gets the full width; what goes out next sits under it */}
          <div className="space-y-4">
            <Composer channels={channels} />
            <div className="grid grid-cols-1 lg:grid-cols-[22rem_minmax(0,1fr)] gap-4 items-start">
              <PostCounters />
              <Upcoming channelTitle={channelTitle} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
