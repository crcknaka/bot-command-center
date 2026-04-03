import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Play, Square, Hash, Settings2, Trash2, Zap, RefreshCw, Pencil } from 'lucide-react';
import { InfoTip } from '../components/ui/tooltip.js';
import { safeHtml } from '../lib/sanitize.js';
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
  const [threadId, setThreadId] = useState('');

  // Add task state
  const [showAddTask, setShowAddTask] = useState<{ channelId: number; channelType: string } | null>(null);
  const [taskType, setTaskType] = useState('news_feed');
  const [taskName, setTaskName] = useState('');
  const [taskSchedule, setTaskSchedule] = useState('0 9 * * *');
  const [taskConfig, setTaskConfig] = useState<Record<string, any>>({
    useAi: true,
    rawTemplate: '<b>{title}</b>\n\n{summary}\n\n<a href="{url}">Читать далее</a>',
    rules: [{ pattern: '', response: '', isRegex: false }],
    welcomeText: '👋 Привет, {name}! Добро пожаловать!',
    deleteAfterSeconds: 0,
    bannedWords: [],
    maxLinksPerMessage: 3,
    warnText: '⚠️ {user}, ваше сообщение удалено за нарушение правил.',
  });

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
    mutationFn: ({ channelId, ...data }: { channelId: number; name?: string; type: string; schedule: string; config?: any }) =>
      apiFetch(`/channels/${channelId}/tasks`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); qc.invalidateQueries({ queryKey: ['tasks'] }); setShowAddTask(null); setTaskType('news_feed'); setTaskSchedule('0 9 * * *'); setTaskName(''); },
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });

  const [editingTask, setEditingTask] = useState<any>(null);
  const editTaskMut = useMutation({
    mutationFn: ({ id, ...data }: { id: number; config?: any; schedule?: string; enabled?: boolean }) =>
      apiFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['bot', botId] }); setEditingTask(null); },
  });

  const addSourceMut = useMutation({
    mutationFn: ({ taskId, ...data }: { taskId: number; name: string; type: string; url: string }) =>
      apiFetch(`/tasks/${taskId}/sources`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['sources'] }); setShowAddSource(null); setSourceForm({ name: '', type: 'rss', url: '' }); },
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
                onEditTask={(task: any) => setEditingTask(task)}
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
          <form onSubmit={(e) => { e.preventDefault(); addChannelMut.mutate({ chatId: channelInput, isTest: isTestChannel, threadId: threadId ? Number(threadId) : undefined }); }}>
            <label className="block text-sm font-medium mb-1 flex items-center gap-1.5">
              ID канала
              <InfoTip text="Для публичных каналов: @имя_канала. Для приватных: числовой ID (можно узнать, переслав сообщение боту @userinfobot)." position="right" />
            </label>
            <input value={channelInput} onChange={(e) => setChannelInput(e.target.value)} placeholder="@euc_official" className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono mb-3" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />
            <div className="mb-3">
              <label className="block text-sm font-medium mb-1 flex items-center gap-1.5">
                Топик (thread_id)
                <InfoTip text="Для групп с включёнными топиками (Forum). Если хотите чтобы бот писал в конкретный топик — введите его ID. Оставьте пустым для General." position="right" />
              </label>
              <input value={threadId} onChange={(e) => setThreadId(e.target.value)} placeholder="Пусто = General (основной)" className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                Как узнать ID топика: откройте топик → URL будет вида t.me/group/123 — число 123 и есть thread_id.
              </p>
            </div>
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

          <form onSubmit={(e) => {
            e.preventDefault();
            let config: any = {};
            if (taskType === 'news_feed') config = { useAi: taskConfig.useAi, rawTemplate: taskConfig.useAi ? undefined : taskConfig.rawTemplate };
            if (taskType === 'auto_reply') config = { rules: taskConfig.rules.filter((r: any) => r.pattern) };
            if (taskType === 'welcome') config = { welcomeText: taskConfig.welcomeText, deleteAfterSeconds: taskConfig.deleteAfterSeconds || 0 };
            if (taskType === 'moderation') config = { bannedWords: taskConfig.bannedWords, maxLinksPerMessage: taskConfig.maxLinksPerMessage, warnText: taskConfig.warnText };
            addTaskMut.mutate({ channelId: showAddTask.channelId, name: taskName || undefined, type: taskType, schedule: taskSchedule, config });
          }}>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Название задачи</label>
              <input value={taskName} onChange={(e) => setTaskName(e.target.value)} placeholder="Например: Новости EUC, Крипто-дайджест..." className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Необязательно. Помогает отличать задачи если их несколько.</p>
            </div>

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

            {/* AI mode toggle (only for news_feed) */}
            {taskType === 'news_feed' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Как обрабатывать контент?</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setTaskConfig({ ...taskConfig, useAi: true })}
                    className={cn('p-3 rounded-xl border text-left text-xs transition-colors', taskConfig.useAi ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
                    style={{ borderColor: taskConfig.useAi ? undefined : 'var(--border)' }}>
                    <div className="font-medium mb-1">🤖 С AI</div>
                    <div style={{ color: 'var(--text-muted)' }}>AI перепишет статью в уникальный пост.</div>
                  </button>
                  <button type="button" onClick={() => setTaskConfig({ ...taskConfig, useAi: false })}
                    className={cn('p-3 rounded-xl border text-left text-xs transition-colors', !taskConfig.useAi ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
                    style={{ borderColor: !taskConfig.useAi ? undefined : 'var(--border)' }}>
                    <div className="font-medium mb-1">📋 Без AI</div>
                    <div style={{ color: 'var(--text-muted)' }}>Заголовок + описание + ссылка.</div>
                  </button>
                </div>
                {!taskConfig.useAi && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium mb-1">Шаблон поста</label>
                    <textarea value={taskConfig.rawTemplate} onChange={(e) => setTaskConfig({ ...taskConfig, rawTemplate: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border text-xs outline-none resize-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{'{title}'}, {'{summary}'}, {'{url}'}, {'{author}'}</p>
                  </div>
                )}
              </div>
            )}

            {/* Auto-reply config */}
            {taskType === 'auto_reply' && (
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Правила авто-ответов</label>
                <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>Когда сообщение содержит ключевое слово — бот отвечает заданным текстом.</p>
                {taskConfig.rules.map((rule: any, i: number) => (
                  <div key={i} className="flex gap-2 mb-2 items-start">
                    <div className="flex-1">
                      <input value={rule.pattern} onChange={(e) => { const r = [...taskConfig.rules]; r[i] = { ...r[i], pattern: e.target.value }; setTaskConfig({ ...taskConfig, rules: r }); }}
                        placeholder="Ключевое слово (например: цена)" className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                    </div>
                    <span className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>→</span>
                    <div className="flex-1">
                      <input value={rule.response} onChange={(e) => { const r = [...taskConfig.rules]; r[i] = { ...r[i], response: e.target.value }; setTaskConfig({ ...taskConfig, rules: r }); }}
                        placeholder="Ответ бота" className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                    </div>
                    <button type="button" onClick={() => { const r = taskConfig.rules.filter((_: any, j: number) => j !== i); setTaskConfig({ ...taskConfig, rules: r.length ? r : [{ pattern: '', response: '' }] }); }}
                      className="p-1 text-red-400/50 hover:text-red-400"><Trash2 size={12} /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setTaskConfig({ ...taskConfig, rules: [...taskConfig.rules, { pattern: '', response: '', isRegex: false }] })}
                  className="text-[11px] text-blue-400 hover:text-blue-300">+ Добавить правило</button>
              </div>
            )}

            {/* Welcome config */}
            {taskType === 'welcome' && (
              <div className="mb-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Текст приветствия</label>
                  <textarea value={taskConfig.welcomeText} onChange={(e) => setTaskConfig({ ...taskConfig, welcomeText: e.target.value })} rows={3} className="w-full px-3 py-2 rounded-lg border text-xs outline-none resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{'{name}'} — имя участника, {'{username}'} — @username</p>
                  <div className="mt-2 rounded-lg p-2 text-xs" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Превью: </span>
                    {taskConfig.welcomeText?.replace(/\{name\}/g, 'Иван').replace(/\{username\}/g, '@ivan')}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Удалить приветствие через (секунд)</label>
                  <input type="number" min={0} value={taskConfig.deleteAfterSeconds} onChange={(e) => setTaskConfig({ ...taskConfig, deleteAfterSeconds: Number(e.target.value) })}
                    className="w-24 px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>0 = не удалять</span>
                </div>
              </div>
            )}

            {/* Moderation config */}
            {taskType === 'moderation' && (
              <div className="mb-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Запрещённые слова</label>
                  <textarea value={(taskConfig.bannedWords ?? []).join(', ')} onChange={(e) => setTaskConfig({ ...taskConfig, bannedWords: e.target.value.split(',').map((w: string) => w.trim()).filter(Boolean) })}
                    rows={2} placeholder="спам, реклама, казино (через запятую)" className="w-full px-3 py-2 rounded-lg border text-xs outline-none resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Сообщение с этими словами будет удалено. Через запятую.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Макс. ссылок в сообщении</label>
                  <input type="number" min={0} max={20} value={taskConfig.maxLinksPerMessage} onChange={(e) => setTaskConfig({ ...taskConfig, maxLinksPerMessage: Number(e.target.value) })}
                    className="w-24 px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>0 = без ограничений</span>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Текст предупреждения</label>
                  <input value={taskConfig.warnText} onChange={(e) => setTaskConfig({ ...taskConfig, warnText: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{'{user}'} — имя нарушителя. Предупреждение удалится через 10 секунд.</p>
                </div>
              </div>
            )}

            {/* Hint per task type */}
            <div className="rounded-lg p-3 mb-4 text-xs" style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--text-muted)' }}>
              {taskType === 'news_feed' && taskConfig.useAi && <>💡 Добавьте источники → «Запустить сейчас». AI переработает новости в уникальные посты.</>}
              {taskType === 'news_feed' && !taskConfig.useAi && <>💡 Добавьте источники. Бот подставит данные в шаблон — без AI, бесплатно.</>}
              {taskType === 'auto_reply' && <>💡 Настройте правила ниже. Бот будет отвечать в реальном времени. <b>Перезапустите бота</b> после создания.</>}
              {taskType === 'welcome' && <>💡 Задайте текст приветствия ниже. <b>Перезапустите бота</b> после создания.</>}
              {taskType === 'moderation' && <>💡 Задайте запрещённые слова ниже. <b>Перезапустите бота</b> после создания.</>}
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

      {/* Edit Task Modal */}
      {editingTask && (
        <EditTaskModal
          task={editingTask}
          onSave={(data) => editTaskMut.mutate({ id: editingTask.id, ...data })}
          onClose={() => setEditingTask(null)}
          isPending={editTaskMut.isPending}
        />
      )}

      {/* Add Source Modal */}
      {showAddSource !== null && (
        <AddSourceModal
          taskId={showAddSource}
          form={sourceForm}
          setForm={setSourceForm}
          onSubmit={() => addSourceMut.mutate({ taskId: showAddSource, ...sourceForm })}
          onClose={() => { setShowAddSource(null); setSourceForm({ name: '', type: 'rss', url: '' }); }}
          isPending={addSourceMut.isPending}
        />
      )}
    </div>
  );
}

// ─── Edit Task Modal ─────────────────────────────────────────────────────────

const schedulePresets = [
  { label: 'Каждый день в 9:00', value: '0 9 * * *' },
  { label: 'Два раза в день', value: '0 9,18 * * *' },
  { label: 'Каждые 6 часов', value: '0 */6 * * *' },
  { label: 'Каждый час', value: '0 * * * *' },
];

function EditTaskModal({ task, onSave, onClose, isPending }: {
  task: any; onSave: (data: any) => void; onClose: () => void; isPending: boolean;
}) {
  const config = task.config ?? {};
  const [name, setName] = useState(task.name ?? '');
  const [schedule, setSchedule] = useState(task.schedule ?? '');
  const [enabled, setEnabled] = useState(task.enabled ?? true);
  const [useAi, setUseAi] = useState(config.useAi !== false);
  const [rawTemplate, setRawTemplate] = useState(config.rawTemplate ?? '<b>{title}</b>\n\n{summary}\n\n<a href="{url}">Читать далее</a>');
  const [autoApprove, setAutoApprove] = useState(config.autoApprove ?? false);
  // Auto-reply
  const [rules, setRules] = useState<Array<{ pattern: string; response: string }>>(config.rules ?? [{ pattern: '', response: '' }]);
  // Welcome
  const [welcomeText, setWelcomeText] = useState(config.welcomeText ?? '👋 Привет, {name}!');
  const [deleteAfterSec, setDeleteAfterSec] = useState(config.deleteAfterSeconds ?? 0);
  // Moderation
  const [bannedWords, setBannedWords] = useState<string[]>(config.bannedWords ?? []);
  const [maxLinks, setMaxLinks] = useState(config.maxLinksPerMessage ?? 3);
  const [warnText, setWarnText] = useState(config.warnText ?? '⚠️ {user}, ваше сообщение удалено.');

  return (
    <Modal title="Редактировать задачу" onClose={onClose}>
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-sm font-medium mb-1">Название</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Необязательно" className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
        </div>

        {/* Enabled */}
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Задача активна
        </label>

        {/* Schedule */}
        {task.type === 'news_feed' && (
          <div>
            <label className="block text-sm font-medium mb-2">Расписание</label>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {schedulePresets.map((p) => (
                <button key={p.value} type="button" onClick={() => setSchedule(p.value)}
                  className={cn('p-2 rounded-lg border text-[11px] text-left transition-colors', schedule === p.value ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
                  style={{ borderColor: schedule === p.value ? undefined : 'var(--border)' }}>
                  {p.label}
                </button>
              ))}
            </div>
            <details>
              <summary className="text-[11px] cursor-pointer" style={{ color: 'var(--text-muted)' }}>Cron-выражение</summary>
              <input value={schedule} onChange={(e) => setSchedule(e.target.value)} className="w-full px-3 py-1.5 rounded-lg border text-xs font-mono mt-1" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            </details>
          </div>
        )}

        {/* AI mode */}
        {task.type === 'news_feed' && (
          <div>
            <label className="block text-sm font-medium mb-2">Режим контента</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setUseAi(true)}
                className={cn('p-2.5 rounded-xl border text-xs text-left transition-colors', useAi ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
                style={{ borderColor: useAi ? undefined : 'var(--border)' }}>
                <div className="font-medium">🤖 С AI</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>AI переписывает статьи</div>
              </button>
              <button type="button" onClick={() => setUseAi(false)}
                className={cn('p-2.5 rounded-xl border text-xs text-left transition-colors', !useAi ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
                style={{ borderColor: !useAi ? undefined : 'var(--border)' }}>
                <div className="font-medium">📋 Без AI</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Шаблон: заголовок + ссылка</div>
              </button>
            </div>
            {!useAi && (
              <div className="mt-2">
                <label className="block text-xs font-medium mb-1">Шаблон</label>
                <textarea value={rawTemplate} onChange={(e) => setRawTemplate(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border text-xs outline-none resize-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{'{title}'}, {'{summary}'}, {'{url}'}, {'{author}'}</p>
              </div>
            )}
          </div>
        )}

        {/* Auto-reply rules */}
        {task.type === 'auto_reply' && (
          <div>
            <label className="block text-sm font-medium mb-2">Правила авто-ответов</label>
            {rules.map((rule, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input value={rule.pattern} onChange={(e) => { const r = [...rules]; r[i] = { ...r[i], pattern: e.target.value }; setRules(r); }}
                  placeholder="Ключевое слово" className="flex-1 px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                <span className="text-xs self-center" style={{ color: 'var(--text-muted)' }}>→</span>
                <input value={rule.response} onChange={(e) => { const r = [...rules]; r[i] = { ...r[i], response: e.target.value }; setRules(r); }}
                  placeholder="Ответ бота" className="flex-1 px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                <button type="button" onClick={() => setRules(rules.filter((_, j) => j !== i))} className="text-red-400/50 hover:text-red-400"><Trash2 size={12} /></button>
              </div>
            ))}
            <button type="button" onClick={() => setRules([...rules, { pattern: '', response: '' }])} className="text-[11px] text-blue-400">+ Добавить</button>
          </div>
        )}

        {/* Welcome config */}
        {task.type === 'welcome' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Текст приветствия</label>
              <textarea value={welcomeText} onChange={(e) => setWelcomeText(e.target.value)} rows={3} className="w-full px-3 py-2 rounded-lg border text-xs resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{'{name}'} — имя, {'{username}'} — @username</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Удалить через (сек)</label>
              <input type="number" min={0} value={deleteAfterSec} onChange={(e) => setDeleteAfterSec(Number(e.target.value))} className="w-24 px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>0 = не удалять</span>
            </div>
          </div>
        )}

        {/* Moderation config */}
        {task.type === 'moderation' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Запрещённые слова</label>
              <textarea value={bannedWords.join(', ')} onChange={(e) => setBannedWords(e.target.value.split(',').map(w => w.trim()).filter(Boolean))}
                rows={2} placeholder="спам, реклама, казино" className="w-full px-3 py-2 rounded-lg border text-xs resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Макс. ссылок</label>
              <input type="number" min={0} value={maxLinks} onChange={(e) => setMaxLinks(Number(e.target.value))} className="w-24 px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Текст предупреждения</label>
              <input value={warnText} onChange={(e) => setWarnText(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            </div>
          </div>
        )}

        {/* Auto-approve */}
        {task.type === 'news_feed' && (
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} />
            Авто-одобрение (сразу в очередь, без ручной проверки)
          </label>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
          <button
            onClick={() => {
              let cfg: any = config;
              if (task.type === 'news_feed') cfg = { ...config, useAi, rawTemplate: useAi ? undefined : rawTemplate, autoApprove };
              if (task.type === 'auto_reply') cfg = { rules: rules.filter(r => r.pattern) };
              if (task.type === 'welcome') cfg = { welcomeText, deleteAfterSeconds: deleteAfterSec };
              if (task.type === 'moderation') cfg = { bannedWords, maxLinksPerMessage: maxLinks, warnText };
              onSave({ name: name || null, schedule: schedule || null, enabled, config: cfg });
            }}
            disabled={isPending}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}
          >
            {isPending ? 'Сохраняю...' : 'Сохранить'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Add Source Modal ────────────────────────────────────────────────────────

const sourceTypeInfo: Record<string, { icon: string; label: string; desc: string; placeholder: string; hint: string }> = {
  rss: { icon: '📡', label: 'RSS-лента', desc: 'Стандартная новостная лента. Есть у большинства сайтов и блогов.', placeholder: 'https://example.com/feed/', hint: 'Обычно URL сайта + /feed/ или /rss/. Для Google News: news.google.com/rss/search?q=тема' },
  reddit: { icon: '🔴', label: 'Reddit', desc: 'Горячие посты из сабреддита. Обновляется в реальном времени.', placeholder: 'ElectricUnicycle', hint: 'Имя сабреддита без r/. Например: ElectricUnicycle, ebikes, technology' },
  twitter: { icon: '𝕏', label: 'Twitter / X', desc: 'Твиты аккаунта через RSS-мосты. Может не работать если мосты лежат.', placeholder: '@username', hint: 'Имя аккаунта с @ или без. Например: @OpenAI, @TechCrunch' },
  telegram: { icon: '📺', label: 'Telegram-канал', desc: 'Посты из другого TG-канала в реальном времени. Бот должен быть участником.', placeholder: '@channel_name', hint: 'Юзернейм канала. Бот должен быть добавлен в канал-источник.' },
  youtube: { icon: '▶️', label: 'YouTube', desc: 'Новые видео с канала через RSS. Нужен channel_id из URL канала.', placeholder: 'https://www.youtube.com/feeds/videos.xml?channel_id=...', hint: 'Откройте канал → исходный код → найдите channel_id → вставьте в URL выше' },
  web: { icon: '🌐', label: 'Веб-страница', desc: 'Парсинг HTML-страницы. Для продвинутых — требует настройки селекторов.', placeholder: 'https://example.com/news', hint: 'URL страницы для парсинга. Результаты зависят от структуры сайта.' },
};

const rssPresets = [
  { cat: '⚡ Электротранспорт / EV', items: [
    { name: 'Electrek', url: 'https://electrek.co/feed/', type: 'rss', desc: 'Главный сайт про EV, e-bikes, электроскутеры. Ежедневные новости индустрии' },
    { name: 'InsideEVs', url: 'https://insideevs.com/feed/', type: 'rss', desc: 'Обзоры, тесты и новости электромобилей и электротранспорта' },
    { name: 'Electric Bike Report', url: 'https://electricbikereport.com/feed', type: 'rss', desc: 'Обзоры электровелосипедов, сравнения, гайды для покупателей' },
    { name: 'CleanTechnica', url: 'https://cleantechnica.com/feed/', type: 'rss', desc: 'Чистая энергия, EV, солнечные панели, экологичные технологии' },
    { name: 'r/ElectricUnicycle', url: 'ElectricUnicycle', type: 'reddit', desc: 'Сообщество моноколёсщиков: обзоры, вопросы, видео поездок' },
    { name: 'r/ebikes', url: 'ebikes', type: 'reddit', desc: 'Электровелосипеды: обсуждения, фото, советы по выбору' },
    { name: 'r/ElectricScooters', url: 'ElectricScooters', type: 'reddit', desc: 'Электросамокаты: обзоры, сравнения, ремонт' },
    { name: 'r/electricvehicles', url: 'electricvehicles', type: 'reddit', desc: 'Электромобили: Tesla, BYD, новинки, зарядные станции' },
    { name: 'r/onewheel', url: 'onewheel', type: 'reddit', desc: 'Onewheel: трюки, маршруты, модификации' },
  ]},
  { cat: '🤖 AI / Машинное обучение', items: [
    { name: 'OpenAI Blog', url: 'https://openai.com/news/rss.xml', type: 'rss', desc: 'Официальные новости от создателей ChatGPT и GPT-4' },
    { name: 'Google AI Blog', url: 'https://ai.googleblog.com/feeds/posts/default', type: 'rss', desc: 'Исследования Google: Gemini, DeepMind, новые модели' },
    { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', type: 'rss', desc: 'Глубокая аналитика MIT по AI, биотеху, климату' },
    { name: 'Hacker News', url: 'https://hnrss.org/frontpage', type: 'rss', desc: 'Лучшие посты с HN — стартапы, код, AI, наука. Голосование сообщества' },
    { name: 'Towards Data Science', url: 'https://towardsdatascience.com/feed', type: 'rss', desc: 'Статьи про ML, data science, Python, нейросети на Medium' },
    { name: 'r/MachineLearning', url: 'MachineLearning', type: 'reddit', desc: 'Научные статьи, новые модели, обсуждения исследований' },
    { name: 'r/ChatGPT', url: 'ChatGPT', type: 'reddit', desc: 'Промпты, лайфхаки, новости ChatGPT и других LLM' },
    { name: 'r/artificial', url: 'artificial', type: 'reddit', desc: 'Общие новости AI: регуляция, продукты, мнения' },
    { name: 'r/LocalLLaMA', url: 'LocalLLaMA', type: 'reddit', desc: 'Локальные модели: Ollama, llama.cpp, fine-tuning, GGUF' },
    { name: '@OpenAI', url: '@OpenAI', type: 'twitter', desc: 'Официальный Twitter OpenAI: анонсы, релизы' },
  ]},
  { cat: '💻 Технологии', items: [
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', type: 'rss', desc: 'Стартапы, венчурные инвестиции, раунды финансирования' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', type: 'rss', desc: 'Технологии на пересечении с культурой и дизайном' },
    { name: 'Wired', url: 'https://feeds.wired.com/wired/index', type: 'rss', desc: 'Глубокая журналистика: наука, безопасность, культура, бизнес' },
    { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', type: 'rss', desc: 'Детальные разборы: железо, ПО, наука, политика технологий' },
    { name: 'Engadget', url: 'https://www.engadget.com/rss.xml', type: 'rss', desc: 'Гаджеты, смартфоны, игры, бытовая электроника' },
    { name: 'Product Hunt', url: 'https://www.producthunt.com/feed', type: 'rss', desc: 'Новые продукты и стартапы каждый день. Голосование сообщества' },
    { name: 'The Next Web', url: 'https://thenextweb.com/feed', type: 'rss', desc: 'Европейское техно-медиа: стартапы, AI, финтех' },
    { name: 'r/technology', url: 'technology', type: 'reddit', desc: 'Главный технологический сабреддит: новости, обсуждения' },
    { name: 'r/programming', url: 'programming', type: 'reddit', desc: 'Программирование: языки, фреймворки, инструменты, карьера' },
    { name: 'r/gadgets', url: 'gadgets', type: 'reddit', desc: 'Новые гаджеты, обзоры, странные изобретения' },
    { name: 'r/apple', url: 'apple', type: 'reddit', desc: 'Apple: iPhone, Mac, iOS, слухи о новых продуктах' },
    { name: 'r/Android', url: 'Android', type: 'reddit', desc: 'Android: новые версии, приложения, кастомные прошивки' },
  ]},
  { cat: '💰 Финансы / Крипто', items: [
    { name: 'CoinDesk', url: 'https://www.coindesk.com/feed', type: 'rss', desc: 'Bitcoin, Ethereum, крипто-аналитика, цены, регуляция' },
    { name: 'Cointelegraph', url: 'https://cointelegraph.com/feed', type: 'rss', desc: 'Блокчейн, DeFi, NFT, крипто-новости на нескольких языках' },
    { name: 'The Block', url: 'https://www.theblock.co/rss.xml', type: 'rss', desc: 'Крипто-расследования, данные рынка, институциональные инвесторы' },
    { name: 'Decrypt', url: 'https://decrypt.co/feed', type: 'rss', desc: 'Web3, крипто для начинающих, гайды и объяснения' },
    { name: 'r/CryptoCurrency', url: 'CryptoCurrency', type: 'reddit', desc: '9.5M+ подписчиков. Главный крипто-хаб: новости, мемы, анализ' },
    { name: 'r/Bitcoin', url: 'Bitcoin', type: 'reddit', desc: '7M+ подписчиков. Только Bitcoin: новости, холд, Lightning Network' },
    { name: 'r/ethereum', url: 'ethereum', type: 'reddit', desc: 'Ethereum: обновления сети, L2, стейкинг, смарт-контракты' },
    { name: 'r/defi', url: 'defi', type: 'reddit', desc: 'Децентрализованные финансы: протоколы, yield farming, ликвидность' },
    { name: 'r/investing', url: 'investing', type: 'reddit', desc: 'Инвестиции: акции, ETF, дивиденды, портфели, стратегии' },
    { name: 'r/wallstreetbets', url: 'wallstreetbets', type: 'reddit', desc: 'Мемные инвестиции, YOLO-трейды, опционы. 15M+ подписчиков' },
  ]},
  { cat: '🎮 Игры', items: [
    { name: 'IGN', url: 'https://feeds.feedburner.com/ign/all', type: 'rss', desc: 'Крупнейший игровой портал: обзоры, трейлеры, гайды' },
    { name: 'Kotaku', url: 'https://kotaku.com/rss', type: 'rss', desc: 'Игровая журналистика с мнением: обзоры, культура, индустрия' },
    { name: 'PC Gamer', url: 'https://www.pcgamer.com/rss/', type: 'rss', desc: 'PC-игры: обзоры, железо, моды, киберспорт' },
    { name: 'r/gaming', url: 'gaming', type: 'reddit', desc: 'Общий игровой сабреддит: мемы, новости, ностальгия' },
    { name: 'r/pcgaming', url: 'pcgaming', type: 'reddit', desc: 'PC-гейминг: новости, обсуждения, производительность' },
    { name: 'r/PS5', url: 'PS5', type: 'reddit', desc: 'PlayStation 5: эксклюзивы, обновления, предложения' },
  ]},
  { cat: '🔬 Наука', items: [
    { name: 'Nature News', url: 'https://www.nature.com/nature.rss', type: 'rss', desc: 'Ведущий научный журнал мира. Прорывы, открытия, рецензии' },
    { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', type: 'rss', desc: 'Новости науки простым языком: физика, биология, медицина, космос' },
    { name: 'New Scientist', url: 'https://www.newscientist.com/feed/home/', type: 'rss', desc: 'Наука для широкой аудитории: открытия, технологии, климат' },
    { name: 'r/science', url: 'science', type: 'reddit', desc: 'Научные статьи с модерацией. Только peer-reviewed исследования' },
    { name: 'r/space', url: 'space', type: 'reddit', desc: 'Космос: SpaceX, NASA, телескопы, планеты, астрономия' },
    { name: 'r/Futurology', url: 'Futurology', type: 'reddit', desc: 'Будущее технологий: прогнозы, трансгуманизм, сингулярность' },
  ]},
  { cat: '📰 Новости (общие)', items: [
    { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', type: 'rss', desc: 'Британская вещательная корпорация. Мировые новости, объективно' },
    { name: 'Reuters', url: 'https://www.reutersagency.com/feed/', type: 'rss', desc: 'Крупнейшее информагентство. Быстрые, проверенные новости' },
    { name: 'CNN', url: 'http://rss.cnn.com/rss/edition.rss', type: 'rss', desc: 'Американское новостное медиа. Политика, бизнес, развлечения' },
    { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', type: 'rss', desc: 'Международные новости с ближневосточной перспективой' },
    { name: 'r/worldnews', url: 'worldnews', type: 'reddit', desc: 'Мировые новости (без США). Модерируемый, качественный контент' },
    { name: 'r/news', url: 'news', type: 'reddit', desc: 'Новости США и мира. Быстрые обсуждения, разные мнения' },
  ]},
  { cat: '💼 Бизнес / Стартапы', items: [
    { name: 'TechCrunch Startups', url: 'https://techcrunch.com/category/startups/feed/', type: 'rss', desc: 'Стартапы: раунды инвестиций, запуски продуктов, интервью основателей' },
    { name: 'Entrepreneur', url: 'https://www.entrepreneur.com/latest.rss', type: 'rss', desc: 'Предпринимательство: советы, истории успеха, маркетинг, финансы' },
    { name: 'Harvard Business Review', url: 'https://hbr.org/feed', type: 'rss', desc: 'Академический бизнес-журнал: лидерство, стратегия, инновации' },
    { name: 'r/startups', url: 'startups', type: 'reddit', desc: 'Сообщество основателей: советы, питчи, ошибки, метрики' },
    { name: 'r/Entrepreneur', url: 'Entrepreneur', type: 'reddit', desc: 'Малый бизнес, фриланс, онлайн-проекты, пассивный доход' },
    { name: 'r/SaaS', url: 'SaaS', type: 'reddit', desc: 'SaaS-бизнес: MRR, churn, pricing, маркетинг, growth' },
  ]},
  { cat: '🎨 Дизайн / UX', items: [
    { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', type: 'rss', desc: 'Веб-дизайн, CSS, доступность, UX-паттерны. Глубокие статьи' },
    { name: 'A List Apart', url: 'https://alistapart.com/main/feed/', type: 'rss', desc: 'Веб-стандарты, контент-стратегия, дизайн. Классика индустрии' },
    { name: 'r/web_design', url: 'web_design', type: 'reddit', desc: 'Веб-дизайн: вдохновение, критика, инструменты, тренды' },
    { name: 'r/UI_Design', url: 'UI_Design', type: 'reddit', desc: 'UI-дизайн: интерфейсы, Figma, компоненты, системы дизайна' },
  ]},
  { cat: '🔍 Google News (свои запросы)', desc: 'Замените слова в URL на свою тему. Параметр hl= задаёт язык (en, ru, uk, de и т.д.)', items: [
    { name: 'GN: Electric Unicycle', url: 'https://news.google.com/rss/search?q=electric+unicycle&hl=en', type: 'rss', desc: 'Новости про моноколёса на английском' },
    { name: 'GN: AI новости', url: 'https://news.google.com/rss/search?q=artificial+intelligence&hl=en', type: 'rss', desc: 'Искусственный интеллект — все источники Google' },
    { name: 'GN: Крипто', url: 'https://news.google.com/rss/search?q=cryptocurrency&hl=en', type: 'rss', desc: 'Криптовалюты — агрегатор всех новостных сайтов' },
    { name: 'GN: Технологии (RU)', url: 'https://news.google.com/rss/search?q=технологии&hl=ru', type: 'rss', desc: 'Технологические новости на русском языке' },
    { name: 'GN: Стартапы (RU)', url: 'https://news.google.com/rss/search?q=стартапы&hl=ru', type: 'rss', desc: 'Стартапы и предпринимательство на русском' },
    { name: 'GN: Нейросети (RU)', url: 'https://news.google.com/rss/search?q=нейросети&hl=ru', type: 'rss', desc: 'Нейросети и AI новости на русском' },
  ]},
];

function AddSourceModal({ taskId, form, setForm, onSubmit, onClose, isPending }: {
  taskId: number; form: any; setForm: (f: any) => void; onSubmit: () => void; onClose: () => void; isPending: boolean;
}) {
  const [showPresets, setShowPresets] = useState(false);
  const [presetSearch, setPresetSearch] = useState('');
  const info = sourceTypeInfo[form.type] ?? sourceTypeInfo.rss;

  const applyPreset = (preset: { name: string; url: string; type: string }) => {
    setForm({ name: preset.name, type: preset.type, url: preset.url });
    setShowPresets(false);
    setPresetSearch('');
  };

  // Filter presets by search
  const filteredPresets = presetSearch.trim()
    ? rssPresets.map((cat: any) => ({
        ...cat,
        items: cat.items.filter((item: any) =>
          item.name.toLowerCase().includes(presetSearch.toLowerCase()) ||
          (item.desc ?? '').toLowerCase().includes(presetSearch.toLowerCase())
        ),
      })).filter((cat: any) => cat.items.length > 0)
    : rssPresets;

  const totalResults = filteredPresets.reduce((sum: number, cat: any) => sum + cat.items.length, 0);

  return (
    <Modal title="Добавить источник" onClose={onClose}>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setShowPresets(false)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', !showPresets ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500')}>
          Свой источник
        </button>
        <button onClick={() => setShowPresets(true)} className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', showPresets ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500')}>
          Готовые RSS-фиды
        </button>
      </div>

      {showPresets ? (
        <div>
          {/* Search */}
          <div className="relative mb-3">
            <input
              value={presetSearch}
              onChange={(e) => setPresetSearch(e.target.value)}
              placeholder="Поиск по фидам..."
              className="w-full px-3 py-2 rounded-lg border text-xs outline-none focus:border-blue-500"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
              autoFocus
            />
            {presetSearch && (
              <span className="absolute right-3 top-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                {totalResults} найдено
              </span>
            )}
          </div>

          <div className="max-h-72 overflow-y-auto space-y-4">
          {filteredPresets.map((cat: any) => (
            <div key={cat.cat}>
              <div className="text-xs font-semibold mb-1">{cat.cat}</div>
              {cat.desc && <div className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{cat.desc}</div>}
              <div className="space-y-1">
                {cat.items.map((item: any) => (
                  <button key={item.url} onClick={() => applyPreset(item)} className="w-full px-3 py-2 rounded-lg text-left hover:bg-white/5 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium">{item.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 shrink-0" style={{ color: 'var(--text-muted)' }}>{item.type}</span>
                    </div>
                    {item.desc && <div className="text-[10px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{item.desc}</div>}
                  </button>
                ))}
              </div>
            </div>
          ))}
          </div>
          <div className="rounded-lg p-2 mt-3 text-[11px]" style={{ background: 'rgba(59,130,246,0.06)', color: 'var(--text-muted)' }}>
            💡 Нажмите на фид чтобы заполнить форму, затем нажмите «Добавить».
          </div>
        </div>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
          <label className="block text-sm font-medium mb-1">Название</label>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: Electrek" className="w-full px-3 py-2 rounded-lg border text-sm mb-3" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />

          <label className="block text-sm font-medium mb-2">Тип источника</label>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {Object.entries(sourceTypeInfo).map(([key, val]) => (
              <button key={key} type="button" onClick={() => setForm({ ...form, type: key })}
                className={cn('p-2 rounded-lg border text-center text-[11px] transition-colors', form.type === key ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
                style={{ borderColor: form.type === key ? undefined : 'var(--border)' }}>
                <div>{val.icon}</div>
                <div className="font-medium mt-0.5">{val.label}</div>
              </button>
            ))}
          </div>

          {/* Type description */}
          <div className="rounded-lg p-2.5 mb-3 text-[11px]" style={{ background: 'rgba(59,130,246,0.06)', color: 'var(--text-muted)' }}>
            {info.icon} <b>{info.label}</b> — {info.desc}
          </div>

          <label className="block text-sm font-medium mb-1">URL / адрес</label>
          <input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder={info.placeholder} className="w-full px-3 py-2 rounded-lg border text-sm font-mono mb-1" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />
          <p className="text-[10px] mb-4" style={{ color: 'var(--text-muted)' }}>{info.hint}</p>

          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
            <button type="submit" disabled={isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
              {isPending ? 'Добавляю...' : 'Добавить'}
            </button>
          </div>
        </form>
      )}
    </Modal>
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
  const [postLang, setPostLang] = useState(bot.postLanguage ?? 'Russian');
  const [maxPerDay, setMaxPerDay] = useState(bot.maxPostsPerDay ?? 5);
  const [minInterval, setMinInterval] = useState(bot.minPostIntervalMinutes ?? 60);
  const [maxLength, setMaxLength] = useState(bot.maxPostLength ?? 2000);
  const [signature, setSignature] = useState(bot.postSignature ?? '');
  const [autoPin, setAutoPin] = useState(bot.autoPin ?? false);
  const [autoDeleteHours, setAutoDeleteHours] = useState(bot.autoDeleteHours ?? 0);
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <div style={{ color: 'var(--text-muted)' }}>AI-модель</div>
            <div className="mt-0.5 font-medium">{currentAiProvider ? currentAiProvider.name : <span style={{ color: 'var(--text-muted)' }}>Глобальный</span>}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Поиск</div>
            <div className="mt-0.5 font-medium">{currentSearchProvider ? currentSearchProvider.name : <span style={{ color: 'var(--text-muted)' }}>Глобальный</span>}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Язык</div>
            <div className="mt-0.5 font-medium">{bot.postLanguage ?? 'Russian'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Лимиты</div>
            <div className="mt-0.5 font-medium">{bot.maxPostsPerDay ?? 5}/день, {bot.minPostIntervalMinutes ?? 60}мин</div>
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
          {/* Content settings */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <div>
              <label className="block text-xs font-medium mb-1">Язык постов</label>
              <select value={postLang} onChange={(e) => setPostLang(e.target.value)} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                <option value="Russian">Русский</option>
                <option value="English">English</option>
                <option value="Ukrainian">Українська</option>
                <option value="German">Deutsch</option>
                <option value="Spanish">Español</option>
                <option value="French">Français</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                Макс. в день
                <InfoTip text="Максимум постов, которые бот может создать за сутки. Защита от спама." position="top" />
              </label>
              <input type="number" min={1} max={50} value={maxPerDay} onChange={(e) => setMaxPerDay(Number(e.target.value))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                Интервал (мин)
                <InfoTip text="Минимальные минуты между публикациями. Чтобы посты не шли подряд." position="top" />
              </label>
              <input type="number" min={1} max={1440} value={minInterval} onChange={(e) => setMinInterval(Number(e.target.value))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                Макс. символов
                <InfoTip text="Максимальная длина поста. Telegram лимит: 4096. Рекомендуется 500-2000." position="top" />
              </label>
              <input type="number" min={100} max={4096} value={maxLength} onChange={(e) => setMaxLength(Number(e.target.value))} className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            </div>
          </div>

          {/* Publishing settings */}
          <div className="space-y-3 pt-2 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <div>
              <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                Подпись к постам
                <InfoTip text="Автоматически добавляется в конец каждого поста. Например: ссылка на канал, хэштеги, watermark." position="right" />
              </label>
              <input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Например: 📢 @euc_official" className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            </div>
            <div className="flex gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={autoPin} onChange={(e) => setAutoPin(e.target.checked)} />
                Закреплять посты
                <InfoTip text="Автоматически закреплять каждый опубликованный пост в канале/группе." position="top" />
              </label>
              <div className="flex items-center gap-2 text-xs">
                Удалять через
                <input type="number" min={0} max={720} value={autoDeleteHours} onChange={(e) => setAutoDeleteHours(Number(e.target.value))} className="w-14 px-2 py-1 rounded-lg border text-xs text-center" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                часов
                <InfoTip text="Автоматически удалить пост через N часов после публикации. 0 = не удалять." position="top" />
              </div>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-muted)' }}>Отмена</button>
            <button
              onClick={() => saveMut.mutate({
                aiProviderId: aiPid ? Number(aiPid) : null,
                searchProviderId: searchPid ? Number(searchPid) : null,
                systemPrompt: sysPrompt || null,
                postLanguage: postLang,
                maxPostsPerDay: maxPerDay,
                minPostIntervalMinutes: minInterval,
                maxPostLength: maxLength,
                postSignature: signature || null,
                autoPin,
                autoDeleteHours: autoDeleteHours || null,
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

function ChannelCard({ channel, botId, onAddTask, onDeleteChannel, onEditTask, onRunTask, onDeleteTask, onAddSource, onFetchSource, onDeleteSource, runningTaskId, fetchingSourceId, taskRunResults, fetchResults }: any) {
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
                onEdit={() => onEditTask(task)}
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

function TaskCard({ task, onEdit, onRun, onDelete, onAddSource, onFetchSource, onDeleteSource, fetchResults, isRunning, fetchingSourceId, runResult }: any) {
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
            {task.name || { news_feed: '📰 Новостная лента', auto_reply: '🤖 Авто-ответы', welcome: '👋 Приветствие', moderation: '🛡️ Модерация' }[task.type as string] || task.type}
          </span>
          {task.type === 'news_feed' && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded', (task.config as any)?.useAi === false ? 'bg-zinc-700/50 text-zinc-400' : 'bg-purple-500/10 text-purple-400')}>
              {(task.config as any)?.useAi === false ? '📋 Без AI' : '🤖 AI'}
            </span>
          )}
          <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-700/50 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            🕐 {cronToHuman(task.schedule)}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button onClick={onEdit} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 flex items-center gap-1 transition-colors" title="Редактировать настройки задачи">
            <Pencil size={12} />
          </button>
          <button onClick={onRun} disabled={isRunning} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 flex items-center gap-1 transition-colors" title="Запустить один раз для теста">
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
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="w-full max-w-md p-6 rounded-2xl border max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}
