import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Play, Square, Hash, Settings2, Trash2, Zap, RefreshCw } from 'lucide-react';
import { InfoTip } from '../components/ui/tooltip.js';
import { Stepper } from '../components/ui/stepper.js';
import { useBotAction } from '../hooks/use-bots.js';
import { apiFetch } from '../lib/api.js';
import { cn } from '../lib/utils.js';

export function BotDetailPage() {
  const { id } = useParams();
  const botId = Number(id);
  const qc = useQueryClient();
  const { data: bot, isLoading } = useQuery({ queryKey: ['bot', botId], queryFn: () => apiFetch(`/bots/${botId}`) });
  const botAction = useBotAction();

  // Add channel state
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [isTestChannel, setIsTestChannel] = useState(false);

  // Add task state
  const [showAddTask, setShowAddTask] = useState<{ channelId: number; channelType: string } | null>(null);
  const [taskType, setTaskType] = useState('news_feed');
  const [taskSchedule, setTaskSchedule] = useState('0 9 * * *');

  // Add source state
  const [showAddSource, setShowAddSource] = useState<number | null>(null); // taskId
  const [sourceForm, setSourceForm] = useState({ name: '', type: 'rss', url: '' });
  const [taskRunResult, setTaskRunResult] = useState<Record<number, any>>({});

  const addChannelMut = useMutation({
    mutationFn: (data: { chatId: string; isTest: boolean }) =>
      apiFetch(`/bots/${botId}/channels`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); setShowAddChannel(false); setChannelInput(''); },
  });

  const deleteChannelMut = useMutation({
    mutationFn: (channelId: number) => apiFetch(`/channels/${channelId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot', botId] }),
  });

  const addTaskMut = useMutation({
    mutationFn: ({ channelId, ...data }: { channelId: number; type: string; schedule: string }) =>
      apiFetch(`/channels/${channelId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); setShowAddTask(null); setTaskType('news_feed'); setTaskSchedule('0 9 * * *'); },
  });

  const runTaskMut = useMutation({
    mutationFn: (taskId: number) => apiFetch(`/tasks/${taskId}/run`, { method: 'POST' }),
    onSuccess: (data, taskId) => {
      setTaskRunResult((prev) => ({ ...prev, [taskId]: data }));
      qc.invalidateQueries({ queryKey: ['posts'] });
    },
    onError: (err, taskId) => {
      setTaskRunResult((prev) => ({ ...prev, [taskId]: { ok: false, steps: [{ action: 'Запуск', status: 'error', detail: (err as Error).message }] } }));
    },
  });

  const deleteTaskMut = useMutation({
    mutationFn: (taskId: number) => apiFetch(`/tasks/${taskId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot', botId] }),
  });

  const addSourceMut = useMutation({
    mutationFn: ({ taskId, ...data }: { taskId: number; name: string; type: string; url: string }) =>
      apiFetch(`/tasks/${taskId}/sources`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); setShowAddSource(null); setSourceForm({ name: '', type: 'rss', url: '' }); },
  });

  const [fetchResult, setFetchResult] = useState<Record<number, { ok: boolean; msg: string }>>({});

  const fetchSourceMut = useMutation({
    mutationFn: (sourceId: number) => apiFetch(`/sources/${sourceId}/fetch`, { method: 'POST' }),
    onSuccess: (data, sourceId) => {
      setFetchResult((prev) => ({ ...prev, [sourceId]: { ok: true, msg: `Загружено новых статей: ${data.newArticles}` } }));
      qc.invalidateQueries({ queryKey: ['sources'] });
      setTimeout(() => setFetchResult((prev) => { const n = { ...prev }; delete n[sourceId]; return n; }), 5000);
    },
    onError: (err, sourceId) => {
      setFetchResult((prev) => ({ ...prev, [sourceId]: { ok: false, msg: (err as Error).message } }));
    },
  });

  const deleteSourceMut = useMutation({
    mutationFn: (sourceId: number) => apiFetch(`/sources/${sourceId}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); qc.invalidateQueries({ queryKey: ['sources'] }); },
  });

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>;
  if (!bot) return <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Бот не найден</div>;

  const hasChannels = bot.channels?.length > 0;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="p-2 rounded-lg hover:bg-white/5"><ArrowLeft size={18} /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{bot.name}</h1>
            {bot.username && <span className="text-sm" style={{ color: 'var(--text-muted)' }}>@{bot.username}</span>}
            <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium capitalize',
              bot.status === 'active' ? 'bg-green-500/15 text-green-400' :
              bot.status === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-zinc-500/15 text-zinc-400'
            )}>
              {{ active: 'Работает', stopped: 'Остановлен', error: 'Ошибка' }[bot.status as string] ?? bot.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {bot.status !== 'active' ? (
            <button onClick={() => botAction.mutate({ id: botId, action: 'start' })} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25">
              <Play size={16} /> Запустить
            </button>
          ) : (
            <button onClick={() => botAction.mutate({ id: botId, action: 'stop' })} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-zinc-500/15 text-zinc-400 hover:bg-zinc-500/25">
              <Square size={16} /> Остановить
            </button>
          )}
        </div>
      </div>

      {/* Next steps — show until all done */}
      {(() => {
        const hasCh = hasChannels;
        const hasTasks = bot.channels?.some((ch: any) => ch._taskCount > 0) ?? false;
        // We don't have task count in channel response, so check via separate indicator
        const allDone = hasCh; // simplified: hide after channels added (tasks shown inline)
        if (allDone) return null;
        return (
          <Stepper title="Следующие шаги для этого бота" steps={[
            { label: 'Добавить канал', description: 'Привяжите Telegram-канал или группу. Бот должен быть администратором канала.', done: hasCh, action: !hasCh ? { label: 'Добавить канал', onClick: () => setShowAddChannel(true) } : undefined },
            { label: 'Создать задачу', description: 'Задача определяет, что бот делает — например, «Новостная лента» генерирует посты по расписанию.', done: false },
            { label: 'Добавить источники', description: 'RSS-фиды, Reddit, Twitter/X, YouTube — откуда бот берёт контент.', done: false },
          ]} />
        );
      })()}

      {/* API Keys */}
      <BotApiKeys bot={bot} botId={botId} />

      {/* Channels */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Каналы</h2>
            <InfoTip text="Каналы — это Telegram-каналы или группы, куда бот публикует контент. Сначала добавьте бота как администратора в канал, затем привяжите его здесь через @имя_канала или числовой ID." position="right" />
          </div>
          <button onClick={() => setShowAddChannel(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25">
            <Plus size={14} /> Добавить канал
          </button>
        </div>

        {!hasChannels ? (
          <div className="rounded-xl p-8 border text-center" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <Hash size={32} className="mx-auto mb-3 text-zinc-600" />
            <p className="text-sm font-medium mb-1">Нет привязанных каналов</p>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Сначала добавьте этого бота как администратора в ваш Telegram-канал.<br />
              Затем нажмите «Добавить канал» и введите <code>@имя_канала</code> или числовой ID.
            </p>
            <button onClick={() => setShowAddChannel(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-400">Добавить канал</button>
          </div>
        ) : (
          <div className="space-y-4">
            {bot.channels.map((channel: any) => (
              <ChannelCard
                key={channel.id}
                channel={channel}
                botId={botId}
                onAddTask={(type?: string) => setShowAddTask({ channelId: channel.id, channelType: type || channel.type })}
                onDeleteChannel={() => { if (confirm(`Удалить канал "${channel.title}"?`)) deleteChannelMut.mutate(channel.id); }}
                onRunTask={(taskId: number) => { setTaskRunResult((prev) => { const next = { ...prev }; delete next[taskId]; return next; }); runTaskMut.mutate(taskId); }}
                onDeleteTask={(taskId: number) => { if (confirm('Удалить эту задачу?')) deleteTaskMut.mutate(taskId); }}
                onAddSource={(taskId: number) => setShowAddSource(taskId)}
                onFetchSource={(sourceId: number) => fetchSourceMut.mutate(sourceId)}
                onDeleteSource={(sourceId: number) => { if (confirm('Удалить этот источник?')) deleteSourceMut.mutate(sourceId); }}
                runningTaskId={runTaskMut.isPending ? (runTaskMut.variables as number) : null}
                fetchingSourceId={fetchSourceMut.isPending ? (fetchSourceMut.variables as number) : null}
                fetchResults={fetchResult}
                taskRunResults={taskRunResult}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Channel Modal */}
      {showAddChannel && (
        <Modal title="Добавить канал" onClose={() => setShowAddChannel(false)}>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Введите юзернейм канала (например, <code>@euc_official</code>) или числовой ID.<br />
            <b>Важно:</b> бот должен быть администратором этого канала, чтобы публиковать пост��.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); addChannelMut.mutate({ chatId: channelInput, isTest: isTestChannel }); }}>
            <label className="block text-sm font-medium mb-1 flex items-center gap-1.5">
              ID канала
              <InfoTip text="Для публичных каналов: @имя_канала. Для приватных: числовой ID (можно узнать, переслав сообщение боту @userinfobot)." position="right" />
            </label>
            <input value={channelInput} onChange={(e) => setChannelInput(e.target.value)} placeholder="@euc_official" className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono mb-3" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />
            <label className="flex items-center gap-2 text-sm mb-4">
              <input type="checkbox" checked={isTestChannel} onChange={(e) => setIsTestChannel(e.target.checked)} />
              Тестовый канал
              <InfoTip text="В тестовый канал отправляются посты во время отладки. Потом можно переключить на боевой режим." position="right" />
            </label>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowAddChannel(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
              <button type="submit" disabled={addChannelMut.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
                {addChannelMut.isPending ? 'Добавляю...' : 'Добавить'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Add Task Modal */}
      {showAddTask !== null && (() => {
        const isChannel = showAddTask.channelType === 'channel';
        const isGroup = showAddTask.channelType === 'group' || showAddTask.channelType === 'supergroup';
        const allTaskTypes = [
          { value: 'news_feed', icon: '📰', title: 'Новостная лента', desc: 'Собирает новости из RSS, Reddit, Twitter, YouTube. Генерирует посты через AI и публикует по расписанию.', needsSchedule: true, forChannel: true, forGroup: true },
          { value: 'auto_reply', icon: '🤖', title: 'Авто-ответы', desc: 'Автоматически отвечает на сообщения по ключевым словам или regex-паттернам.', needsSchedule: false, forChannel: false, forGroup: true },
          { value: 'welcome', icon: '👋', title: 'Приветствие', desc: 'Отправляет приветственное сообщение новым участникам группы.', needsSchedule: false, forChannel: false, forGroup: true },
          { value: 'moderation', icon: '🛡️', title: 'Модерация', desc: 'Удаляет сообщения с запрещёнными словами, ограничивает ссылки, предупреждает нарушителей.', needsSchedule: false, forChannel: false, forGroup: true },
        ];
        const availableTypes = allTaskTypes.filter((t) => isGroup ? t.forGroup : t.forChannel);
        const unavailableTypes = allTaskTypes.filter((t) => isGroup ? !t.forGroup : !t.forChannel);

        return (
        <Modal title="Создать задачу" onClose={() => setShowAddTask(null)}>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            Задача — автоматическое действие бота для этого {isChannel ? 'канала' : 'группы'}.
          </p>
          <div className="text-[11px] px-2.5 py-1.5 rounded-lg mb-4 flex items-center gap-1.5" style={{ background: isChannel ? 'rgba(59,130,246,0.08)' : 'rgba(168,85,247,0.08)' }}>
            {isChannel ? '📢' : '👥'}
            <span style={{ color: 'var(--text-muted)' }}>
              {isChannel
                ? 'Это канал — доступна только публикация постов. Авто-ответы, приветствия и модерация работают только в группах.'
                : 'Это группа — доступны все типы задач: публикация, авто-ответы, приветствия, модерация.'}
            </span>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); addTaskMut.mutate({ channelId: showAddTask.channelId, type: taskType, schedule: taskSchedule }); }}>
            <label className="block text-sm font-medium mb-2">Что должен делать бот?</label>
            <div className="space-y-2 mb-5">
              {availableTypes.map((t) => (
                <label key={t.value} className={cn(
                  'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                  taskType === t.value ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600'
                )} style={{ borderColor: taskType === t.value ? undefined : 'var(--border)' }}>
                  <input type="radio" name="taskType" value={t.value} checked={taskType === t.value} onChange={() => { setTaskType(t.value); if (!t.needsSchedule) setTaskSchedule(''); }} className="mt-1" />
                  <div>
                    <div className="text-sm font-medium">{t.icon} {t.title}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.desc}</div>
                  </div>
                </label>
              ))}
              {unavailableTypes.length > 0 && (
                <div className="p-3 rounded-xl border opacity-40" style={{ borderColor: 'var(--border)' }}>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {unavailableTypes.map((t) => `${t.icon} ${t.title}`).join(' · ')} — только для {isChannel ? 'групп' : 'каналов'}
                  </div>
                </div>
              )}
            </div>

            {/* Schedule - visual presets (only for news_feed) */}
            {taskType === 'news_feed' && <>
            <label className="block text-sm font-medium mb-2">Как часто запускать?</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { label: 'Каждый день в 9:00', value: '0 9 * * *', desc: 'Один раз утром' },
                { label: 'Два раза в день', value: '0 9,18 * * *', desc: '9:00 и 18:00' },
                { label: 'Каждые 6 часов', value: '0 */6 * * *', desc: '4 раза в сутки' },
                { label: 'Каждый час', value: '0 * * * *', desc: 'Для активных каналов' },
              ].map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setTaskSchedule(preset.value)}
                  className={cn(
                    'p-2.5 rounded-xl border text-left transition-colors',
                    taskSchedule === preset.value ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600'
                  )}
                  style={{ borderColor: taskSchedule === preset.value ? undefined : 'var(--border)' }}
                >
                  <div className="text-xs font-medium">{preset.label}</div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{preset.desc}</div>
                </button>
              ))}
            </div>

            {/* Custom cron - collapsible */}
            <details className="mb-5">
              <summary className="text-[11px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                Или введите своё расписание (cron)
              </summary>
              <div className="mt-2">
                <input
                  value={taskSchedule}
                  onChange={(e) => setTaskSchedule(e.target.value)}
                  placeholder="0 9 * * *"
                  className="w-full px-3 py-2 rounded-lg border text-sm font-mono"
                  style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
                />
                <div className="text-[10px] mt-1.5 space-y-0.5" style={{ color: 'var(--text-muted)' }}>
                  <div>Формат: <code>минута час день месяц день_недели</code></div>
                  <div><code>0 9 * * *</code> — каждый день в 9:00</div>
                  <div><code>*/30 * * * *</code> — каждые 30 минут</div>
                  <div><code>0 9 * * 1-5</code> — по будням в 9:00</div>
                </div>
              </div>
            </details>
            </>}

            {/* Hint per task type */}
            <div className="rounded-lg p-3 mb-4 text-xs" style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--text-muted)' }}>
              {taskType === 'news_feed' && <>💡 <b>Что будет дальше:</b> добавьте источники (RSS, Reddit, Twitter), затем нажмите «Запустить сейчас». Бот соберёт новости, сгенерирует пост через AI и добавит в очередь.</>}
              {taskType === 'auto_reply' && <>💡 <b>Как работает:</b> бот будет отвечать на сообщения в реальном времени. После создания задачи настройте правила (ключевые слова → ответы) в конфиге задачи.</>}
              {taskType === 'welcome' && <>💡 <b>Как работает:</b> бот отправит приветствие при входе нового участника. Перезапустите бота после создания задачи.</>}
              {taskType === 'moderation' && <>💡 <b>Как работает:</b> бот удалит сообщения с запрещёнными словами. Настройте список слов в конфиге задачи. Перезапустите бота.</>}
            </div>

            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowAddTask(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
              <button type="submit" disabled={addTaskMut.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
                {addTaskMut.isPending ? 'Создаю...' : 'Создать задачу'}
              </button>
            </div>
          </form>
        </Modal>
        );
      })()}

      {/* Add Source Modal */}
      {showAddSource !== null && (
        <Modal title="Добавить источник" onClose={() => setShowAddSource(null)}>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Источник — это откуда бот берёт контент. Добавьте RSS-фиды, Reddit-сообщества или YouTube-каналы.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); addSourceMut.mutate({ taskId: showAddSource, ...sourceForm }); }}>
            <label className="block text-sm font-medium mb-1">Название</label>
            <input value={sourceForm.name} onChange={(e) => setSourceForm({ ...sourceForm, name: e.target.value })} placeholder="Например: Electrek EUC" className="w-full px-3 py-2 rounded-lg border text-sm mb-3" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />

            <label className="block text-sm font-medium mb-1 flex items-center gap-1.5">
              Тип
              <InfoTip text="RSS — стандартная лента новостей. Reddit — посты из сабреддита. Twitter/X — твиты аккаунта. YouTube — видео с канала." position="right" />
            </label>
            <select value={sourceForm.type} onChange={(e) => setSourceForm({ ...sourceForm, type: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm mb-3" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
              <option value="rss">RSS-лента</option>
              <option value="reddit">Reddit (сабреддит)</option>
              <option value="twitter">Twitter / X (аккаунт)</option>
              <option value="telegram">Telegram-канал</option>
              <option value="youtube">YouTube-канал</option>
              <option value="web">Веб-страница</option>
            </select>

            <label className="block text-sm font-medium mb-1 flex items-center gap-1.5">
              URL / адрес
              <InfoTip text="RSS: ссылка на фид. Reddit: имя сабреддита. Twitter/X: @username. Telegram: @channel_name. YouTube: RSS по channel_id." position="right" />
            </label>
            <input value={sourceForm.url} onChange={(e) => setSourceForm({ ...sourceForm, url: e.target.value })} placeholder="https://example.com/feed" className="w-full px-3 py-2 rounded-lg border text-sm font-mono mb-4" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />

            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowAddSource(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
              <button type="submit" disabled={addSourceMut.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
                {addSourceMut.isPending ? 'Добавляю...' : 'Добавить'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Bot API Keys ─────────────────────────────────────────────────────────────

function BotApiKeys({ bot, botId }: { bot: any; botId: number }) {
  const qc = useQueryClient();
  const { data: aiProviders } = useQuery({ queryKey: ['ai-providers'], queryFn: () => apiFetch('/ai-providers') });
  const { data: searchProviders } = useQuery({ queryKey: ['search-providers'], queryFn: () => apiFetch('/search-providers') });
  const [editing, setEditing] = useState(false);
  const [aiPid, setAiPid] = useState<string>(bot.aiProviderId?.toString() ?? '');
  const [searchPid, setSearchPid] = useState<string>(bot.searchProviderId?.toString() ?? '');
  const [sysPrompt, setSysPrompt] = useState(bot.systemPrompt ?? '');
  const [saved, setSaved] = useState(false);

  const saveMut = useMutation({
    mutationFn: (data: any) =>
      apiFetch(`/bots/${botId}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bot', botId] });
      setSaved(true);
      setTimeout(() => { setSaved(false); setEditing(false); }, 1500);
    },
  });

  const currentAiProvider = aiProviders?.find((p: any) => p.id === bot.aiProviderId);
  const currentSearchProvider = searchProviders?.find((p: any) => p.id === bot.searchProviderId);

  return (
    <div className="mb-6 rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Настройки бота</h2>
          <InfoTip text="Каждый бот может использовать свои ключи и промпт. Если не заданы — берутся из глобальных настроек (Интеграции / Настройки)." position="right" />
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
            Изменить
          </button>
        )}
      </div>

      {!editing ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div>
            <div style={{ color: 'var(--text-muted)' }}>AI-модель</div>
            <div className="mt-0.5 font-medium">
              {currentAiProvider ? currentAiProvider.name : <span style={{ color: 'var(--text-muted)' }}>Глобальный</span>}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Поиск</div>
            <div className="mt-0.5 font-medium">
              {currentSearchProvider ? currentSearchProvider.name : <span style={{ color: 'var(--text-muted)' }}>Глобальный</span>}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Промпт</div>
            <div className="mt-0.5 font-medium">
              {bot.systemPrompt ? <span className="truncate block max-w-40">{bot.systemPrompt.slice(0, 40)}...</span> : <span style={{ color: 'var(--text-muted)' }}>Глобальный</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">AI-провайдер</label>
            <select value={aiPid} onChange={(e) => setAiPid(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
              <option value="">Глобальный (из Настроек)</option>
              {aiProviders?.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Поисковый провайдер</label>
            <select value={searchPid} onChange={(e) => setSearchPid(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
              <option value="">Глобальный (из Настроек)</option>
              {searchProviders?.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name} ({p.type})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 flex items-center gap-1.5">
              Системный промпт
              <InfoTip text="Инструкция для AI именно этого бота. Опишите стиль, тон, язык. Если пусто — используется глобальный промпт из настроек." position="right" />
            </label>
            <textarea
              value={sysPrompt}
              onChange={(e) => setSysPrompt(e.target.value)}
              rows={3}
              placeholder="Пусто = глобальный промпт"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-muted)' }}>Отмена</button>
            <button
              onClick={() => saveMut.mutate({
                aiProviderId: aiPid ? Number(aiPid) : null,
                searchProviderId: searchPid ? Number(searchPid) : null,
                systemPrompt: sysPrompt || null,
              })}
              disabled={saveMut.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
              style={{ background: saved ? 'var(--success)' : 'var(--primary)' }}
            >
              {saved ? '✓ Сохранено' : saveMut.isPending ? 'Сохраняю...' : 'Сохранить'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Channel Card (inline sub-component) ─────────────────────────────────────

function ChannelCard({ channel, botId, onAddTask, onDeleteChannel, onRunTask, onDeleteTask, onAddSource, onFetchSource, onDeleteSource, runningTaskId, fetchingSourceId, taskRunResults, fetchResults }: any) {
  const qc = useQueryClient();
  const { data: tasks } = useQuery({
    queryKey: ['tasks', channel.id],
    queryFn: () => apiFetch(`/channels/${channel.id}/tasks`),
  });

  const toggleTestMut = useMutation({
    mutationFn: () => apiFetch(`/channels/${channel.id}`, { method: 'PATCH', body: JSON.stringify({ isTest: !channel.isTest }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bot', botId] }),
  });

  return (
    <div className="rounded-xl border overflow-hidden" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      {/* Channel header */}
      <div className="px-4 py-3 flex items-center justify-between border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          {channel.type === 'channel'
            ? <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">📢 Канал</span>
            : <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">👥 Группа</span>
          }
          <span className="font-medium text-sm truncate max-w-32 sm:max-w-none">{channel.title}</span>
          <span className="text-[11px] font-mono hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{channel.chatId}</span>
          <button
            onClick={() => toggleTestMut.mutate()}
            className={cn('text-[10px] px-1.5 py-0.5 rounded cursor-pointer transition-colors', channel.isTest ? 'bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25' : 'bg-green-500/15 text-green-400 hover:bg-green-500/25')}
            title={channel.isTest ? 'Нажмите чтобы перевести в боевой режим' : 'Нажмите чтобы перевести в тестовый режим'}
          >
            {channel.isTest ? '🧪 Тестовый' : '🟢 Боевой'}
          </button>
          {channel.isLinked ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50" style={{ color: 'var(--text-muted)' }}>Подключён</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Не подключён</span>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => onAddTask(channel.type)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
            <Plus size={12} /> Задача
          </button>
          <button onClick={onDeleteChannel} className="p-1.5 rounded-lg hover:bg-white/5" title="Удалить канал">
            <Trash2 size={14} className="text-red-400/60 hover:text-red-400" />
          </button>
        </div>
      </div>

      {/* Tasks */}
      <div className="px-4 py-3">
        {!tasks || tasks.length === 0 ? (
          <div className="text-center py-6">
            <Settings2 size={28} className="mx-auto mb-2 text-zinc-600" />
            <p className="text-sm font-medium mb-1">Нет задач</p>
            <p className="text-xs mb-4 max-w-xs mx-auto" style={{ color: 'var(--text-muted)' }}>
              Задача определяет, что бот делает с этим каналом — например, ищет новости и публикует посты.
            </p>
            <button onClick={() => onAddTask(channel.type)} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors">
              <Plus size={14} className="inline mr-1.5" /> Создать задачу
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task: any) => (
              <TaskCard
                key={task.id}
                task={task}
                onRun={() => onRunTask(task.id)}
                onDelete={() => onDeleteTask(task.id)}
                onAddSource={() => onAddSource(task.id)}
                onFetchSource={onFetchSource}
                onDeleteSource={onDeleteSource}
                fetchResults={fetchResults}
                isRunning={runningTaskId === task.id}
                fetchingSourceId={fetchingSourceId}
                runResult={taskRunResults?.[task.id]}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Task Card ────────────────────────────────────────────────────────────────

function cronToHuman(cron: string | null): string {
  if (!cron) return 'Только вручную';
  const presets: Record<string, string> = {
    '0 9 * * *': 'Каждый день в 9:00',
    '0 9,18 * * *': 'Два раза в день (9:00, 18:00)',
    '0 */6 * * *': 'Каждые 6 часов',
    '0 * * * *': 'Каждый час',
    '*/30 * * * *': 'Каждые 30 минут',
    '0 */4 * * *': 'Каждые 4 часа',
    '0 */12 * * *': 'Каждые 12 часов',
  };
  return presets[cron] ?? cron;
}

function TaskCard({ task, onRun, onDelete, onAddSource, onFetchSource, onDeleteSource, fetchResults, isRunning, fetchingSourceId, runResult }: any) {
  const { data: sources } = useQuery({
    queryKey: ['sources', task.id],
    queryFn: () => apiFetch(`/tasks/${task.id}/sources`),
  });

  return (
    <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Settings2 size={14} className="text-purple-400" />
          <span className="text-sm font-medium">
            {{ news_feed: '📰 Новостная лента', auto_reply: '🤖 Авто-ответы', welcome: '👋 Приветствие', moderation: '🛡️ Модерация' }[task.type as string] ?? task.type}
          </span>
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-700/50 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            🕐 {cronToHuman(task.schedule)}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button onClick={onRun} disabled={isRunning} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 flex items-center gap-1 transition-colors" title="Запустить один раз для теста — найдёт новости, сгенерирует пост и добавит в очередь">
            <Zap size={12} /> {isRunning ? 'Работаю...' : 'Запустить сейчас'}
          </button>
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-white/5" title="Удалить задачу">
            <Trash2 size={12} className="text-red-400/60 hover:text-red-400" />
          </button>
        </div>
      </div>

      {/* Run Result */}
      {runResult && (
        <div className="mt-3 rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.2)' }}>
          <div className="text-[11px] font-medium mb-2 flex items-center gap-1.5">
            {runResult.ok !== false ? '✅' : '❌'} Результат запуска
          </div>
          <div className="space-y-1.5">
            {runResult.steps?.map((step: any, i: number) => (
              <div key={i} className="flex items-start gap-2 text-[11px]">
                <span className="shrink-0 mt-0.5">
                  {step.status === 'ok' ? '����' : step.status === 'error' ? '🔴' : '⚪'}
                </span>
                <div>
                  <span className="font-medium">{step.action}</span>
                  <span className="mx-1.5" style={{ color: 'var(--text-muted)' }}>—</span>
                  <span style={{ color: step.status === 'error' ? '#f87171' : 'var(--text-muted)' }}>
                    {step.detail}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {runResult.error && !runResult.steps?.length && (
            <div className="text-[11px] text-red-400">{runResult.error}</div>
          )}
          {runResult.ok !== false && runResult.steps?.some((s: any) => s.status === 'ok' && s.action.startsWith('Генерация')) && (
            <Link to="/posts?status=draft" className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors">
              Перейти к постам →
            </Link>
          )}
        </div>
      )}

      {/* Sources */}
      <div className="ml-5 mt-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>Источники контента</span>
          <button onClick={onAddSource} className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">+ Добавить</button>
        </div>
        {!sources || sources.length === 0 ? (
          <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(234,179,8,0.06)', borderColor: 'var(--border)' }}>
            <span className="text-yellow-400">⚠️ Нет источников.</span>{' '}
            <span style={{ color: 'var(--text-muted)' }}>
              Добавьте хотя бы один RSS-фид, чтобы бот мог находить новости. Например:
              <code className="ml-1 text-[10px]">https://electrek.co/feed/</code>
            </span>
          </div>
        ) : (
          <div className="space-y-1">
            {sources.map((source: any) => {
              const fr = fetchResults?.[source.id];
              return (
                <div key={source.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded bg-zinc-700/50 font-mono uppercase text-[10px] shrink-0">{source.type}</span>
                      <span className="shrink-0">{source.name}</span>
                      <span className="font-mono truncate max-w-48" style={{ color: 'var(--text-muted)' }}>{source.url}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => onFetchSource(source.id)} disabled={fetchingSourceId === source.id} className="px-2 py-0.5 rounded text-blue-400 hover:bg-blue-500/15 flex items-center gap-1">
                        <RefreshCw size={10} className={fetchingSourceId === source.id ? 'animate-spin' : ''} />
                        {fetchingSourceId === source.id ? 'Загружаю...' : 'Загрузить'}
                      </button>
                      <button onClick={() => onDeleteSource(source.id)} className="p-0.5 rounded text-red-400/40 hover:text-red-400 hover:bg-red-500/10" title="Удалить источник">
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                  {fr && (
                    <div className={`text-[10px] px-2 py-1 rounded ${fr.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                      {fr.ok ? `✅ ${fr.msg}` : `❌ ${fr.msg}`}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="w-full max-w-md p-6 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}
