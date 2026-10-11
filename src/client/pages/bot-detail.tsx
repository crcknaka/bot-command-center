import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Play, Square, Hash, Trash2 } from 'lucide-react';
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Spinner } from '../components/ui/spinner.js';
import { useConfirm } from '../components/ui/confirm-dialog.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { Stepper } from '../components/ui/stepper.js';
import { useBotAction } from '../hooks/use-bots.js';
import { apiFetch } from '../lib/api.js';
import { cn } from '../lib/utils.js';
import { ctrlEnter, Modal } from './bot-detail/shared.js';
import { AutoReplyConfigUI, WebSearchConfigUI, ModerationConfigUI, SchedulePicker } from './bot-detail/task-config.js';
import { EditTaskModal } from './bot-detail/edit-task-modal.js';
import { AddSourceModal } from './bot-detail/add-source-modal.js';
import { BotApiKeys } from './bot-detail/bot-api-keys.js';
import { ChannelCard } from './bot-detail/channel-card.js';

export function BotDetailPage() {
  const { id } = useParams();
  const botId = Number(id);
  const qc = useQueryClient();
  const { data: bot, isLoading } = useQuery({ queryKey: ['bot', botId], queryFn: () => apiFetch(`/bots/${botId}`) });
  const botAction = useBotAction();
  const { confirm, dialog: confirmDialog } = useConfirm();

  // Add channel state
  const [showAddChannel, setShowAddChannel] = useState(false);
  const [channelInput, setChannelInput] = useState('');
  const [threadId, setThreadId] = useState('');
  const [threadTitle, setThreadTitle] = useState('');

  // Add task state
  const [showAddTask, setShowAddTask] = useState<{ channelId: number; channelType: string } | null>(null);
  const [taskType, setTaskType] = useState('news_feed');
  const [taskName, setTaskName] = useState('');
  const [taskSchedule, setTaskSchedule] = useState('0 9 * * *');
  const initialTaskConfig: Record<string, any> = {
    useAi: true,
    postMode: 'draft',
    rawTemplate: '<b>{title}</b>\n\n{summary}\n\n<a href="{url}">Читать далее</a>',
    rules: [{ pattern: '', response: '', isRegex: false }],
    welcomeText: '👋 Привет, {name}! Добро пожаловать!',
    deleteAfterSeconds: 0,
    bannedWords: [],
    maxLinksPerMessage: 3,
    warnText: '⚠️ {user}, ваше сообщение удалено за нарушение правил.',
  };
  const [taskConfig, setTaskConfig] = useState<Record<string, any>>(initialTaskConfig);

  // Add source state
  const [showAddSource, setShowAddSource] = useState<number | null>(null); // taskId
  const [sourceForm, setSourceForm] = useState({ name: '', type: 'rss', url: '' });
  const [taskRunResult, setTaskRunResult] = useState<Record<number, any>>({});

  const addChannelMut = useMutation({
    mutationFn: (data: { chatId: string; threadId?: number }) =>
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); qc.invalidateQueries({ queryKey: ['tasks'] }); setShowAddTask(null); setTaskType('news_feed'); setTaskSchedule('0 9 * * *'); setTaskName(''); setTaskConfig({ ...initialTaskConfig, rules: [{ pattern: '', response: '', isRegex: false }], bannedWords: [] }); },
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

  const moveTaskToChannelMut = useMutation({
    mutationFn: ({ taskId, channelId }: { taskId: number; channelId: number }) =>
      apiFetch(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ channelId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });

  const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleTaskDragEnd = (event: DragEndEvent) => {
    if (!event.over) return;
    const taskId = Number(String(event.active.id).replace('task-', ''));
    const targetChannelId = Number(String(event.over.id).replace('channel-', ''));
    if (!taskId || !targetChannelId) return;
    // Find task's current channel
    const task = bot?.channels?.flatMap((ch: any) => {
      const chTasks = qc.getQueryData<any[]>(['tasks', ch.id]);
      return (chTasks ?? []).map((t: any) => ({ ...t, _channelId: ch.id }));
    }).find((t: any) => t.id === taskId);
    if (task && task._channelId !== targetChannelId) {
      moveTaskToChannelMut.mutate({ taskId, channelId: targetChannelId });
    }
  };

  const addSourceMut = useMutation({
    mutationFn: ({ taskId, ...data }: { taskId: number; name: string; type: string; url: string }) =>
      apiFetch(`/tasks/${taskId}/sources`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['sources'] }); setShowAddSource(null); setSourceForm({ name: '', type: 'rss', url: '' }); },
  });

  const [fetchResult, setFetchResult] = useState<Record<number, { ok: boolean; msg: string }>>({});

  const fetchSourceMut = useMutation({
    mutationFn: (sourceId: number) => apiFetch(`/sources/${sourceId}/fetch`, { method: 'POST' }),
    onSuccess: (data, sourceId) => {
      let msg = `Источник работает. ${data.totalArticles} свежих статей.`;
      if (data.filterInfo) {
        const fi = data.filterInfo;
        if (fi.skippedOld > 0) msg += ` (${fi.skippedOld} старых пропущено)`;
        if (fi.keywords?.length > 0) {
          msg += fi.matched > 0
            ? ` Фильтр: ${fi.matched} из ${fi.total} подходят (${fi.keywords.join(', ')})`
            : ` Фильтр: 0 из ${fi.total} подходят (${fi.keywords.join(', ')})`;
        }
      }
      setFetchResult((prev) => ({ ...prev, [sourceId]: { ok: true, msg } }));
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

  if (isLoading) return <Spinner text="Загрузка..." />;
  if (!bot) return <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Бот не найден</div>;

  const hasChannels = bot.channels?.length > 0;

  return (
    <div>
      {confirmDialog}

      {/* Status banner */}
      {bot.status !== 'active' && (
        <div className={cn('rounded-xl px-4 py-3 mb-4 flex items-center justify-between', bot.status === 'error' ? 'bg-red-500/10 border border-red-500/20' : 'bg-yellow-500/8 border border-yellow-500/20')}>
          <div className="flex items-center gap-2">
            <span className={cn('w-3 h-3 rounded-full', bot.status === 'error' ? 'bg-red-500' : 'bg-yellow-500')} />
            <span className="text-sm font-medium">{bot.status === 'error' ? '❌ Бот остановлен с ошибкой' : '⏸️ Бот остановлен'}</span>
            {bot.errorMessage && <span className="text-xs text-red-400 ml-2">{bot.errorMessage}</span>}
          </div>
          <button onClick={() => botAction.mutate({ id: botId, action: 'start' })} disabled={botAction.isPending}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors">
            <Play size={14} className="inline mr-1.5" />{botAction.isPending ? 'Запуск...' : 'Запустить'}
          </button>
        </div>
      )}

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1.5 text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        <Link to="/bots" className="hover:text-zinc-300 transition-colors">Боты</Link>
        <span>›</span>
        <span>{bot.name}</span>
        <span className="ml-auto flex gap-2">
          <Link to={`/posts?botId=${botId}`} className="text-blue-400/70 hover:text-blue-400 transition-colors">Посты →</Link>
        </span>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{bot.name}</h1>
            {bot.username && <span className="text-xs sm:text-sm hidden sm:inline" style={{ color: 'var(--text-muted)' }}>@{bot.username}</span>}
            <span className={cn('w-2.5 h-2.5 rounded-full', bot.status === 'active' ? 'bg-green-500' : bot.status === 'error' ? 'bg-red-500' : 'bg-zinc-500')} />
            <span className={cn('text-xs', bot.status === 'active' ? 'text-green-400' : bot.status === 'error' ? 'text-red-400' : 'text-zinc-500')}>
              {{ active: 'Работает', stopped: 'Остановлен', error: 'Ошибка' }[bot.status as string] ?? bot.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {bot.status === 'active' && (
            <button onClick={() => confirm({ title: 'Остановить бота?', message: 'Все задачи перестанут работать до следующего запуска.', confirmLabel: 'Остановить', variant: 'warning', onConfirm: () => botAction.mutate({ id: botId, action: 'stop' }) })} disabled={botAction.isPending} className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25">
              <Square size={14} /> {botAction.isPending ? '...' : 'Остановить'}
            </button>
          )}
        </div>
      </div>

      {/* Next steps — show until all done */}
      {(() => {
        const hasCh = hasChannels;

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
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
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
          <DndContext sensors={dndSensors} onDragEnd={handleTaskDragEnd}>
          <div className="space-y-4">
            {(() => {
              // Group channels: parent channels (no threadId) first, topics nested under them
              const parents = bot.channels.filter((ch: any) => !ch.threadId);
              const topics = bot.channels.filter((ch: any) => ch.threadId);

              // Match topics to parents by chatId OR by title (handles @username vs numeric ID mismatch)
              const topicsByParentId: Record<number, any[]> = {};
              for (const topic of topics) {
                const parent = parents.find((p: any) => p.chatId === topic.chatId || p.title === topic.title);
                if (parent) {
                  (topicsByParentId[parent.id] ??= []).push(topic);
                }
              }
              // Standalone topics (no matching parent) — show as regular items
              const orphanTopics = topics.filter((t: any) => !parents.some((p: any) => p.chatId === t.chatId || p.title === t.title));

              const renderCard = (channel: any, isTopic = false) => (
                <div key={channel.id} className={isTopic ? 'ml-2 sm:ml-6 border-l-2 pl-2 sm:pl-4' : ''} style={isTopic ? { borderColor: 'var(--border)' } : undefined}>
                  <ChannelCard
                    channel={channel}
                    botId={botId}
                    allChannels={bot.channels}
                    isTopic={isTopic}
                    onAddTask={(type?: string) => setShowAddTask({ channelId: channel.id, channelType: type || channel.type })}
                    onDeleteChannel={() => confirm({ title: isTopic ? 'Удалить топик?' : 'Удалить канал?', message: `${isTopic ? 'Топик' : 'Канал'} "${channel.threadTitle || channel.title}" и все его задачи будут удалены.`, onConfirm: () => deleteChannelMut.mutate(channel.id) })}
                    onRunTask={(task: any) => {
                      const run = () => { setTaskRunResult((prev) => { const next = { ...prev }; delete next[task.id]; return next; }); runTaskMut.mutate(task.id); };
                      const posts = task.type === 'news_feed' || task.type === 'web_search';
                      // Anything but draft mode ends up in the channel on its own
                      if (posts && task.config?.postMode !== 'draft') {
                        confirm({
                          title: 'Запустить задачу?',
                          message: task.config?.postMode === 'publish'
                            ? 'Это не тест: задача создаст настоящие посты, и они сразу уйдут в канал.'
                            : 'Это не тест: задача создаст настоящие посты и поставит их в очередь — они выйдут в канал по расписанию.',
                          confirmLabel: 'Запустить',
                          variant: 'warning',
                          onConfirm: run,
                        });
                      } else run();
                    }}
                    onEditTask={(task: any) => setEditingTask(task)}
                    onToggleTask={(taskId: number, enabled: boolean) => editTaskMut.mutate({ id: taskId, enabled })}
                    onDeleteTask={(taskId: number) => confirm({ title: 'Удалить задачу?', message: 'Задача и все её источники будут удалены.', onConfirm: () => deleteTaskMut.mutate(taskId) })}
                    onAddSource={(taskId: number) => setShowAddSource(taskId)}
                    onFetchSource={(sourceId: number) => fetchSourceMut.mutate(sourceId)}
                    onDeleteSource={(sourceId: number) => confirm({ title: 'Удалить источник?', message: 'Источник контента будет удалён.', onConfirm: () => deleteSourceMut.mutate(sourceId) })}
                    runningTaskId={runTaskMut.isPending ? (runTaskMut.variables as number) : null}
                    fetchingSourceId={fetchSourceMut.isPending ? (fetchSourceMut.variables as number) : null}
                    fetchResults={fetchResult}
                    taskRunResults={taskRunResult}
                  />
                </div>
              );

              return (
                <>
                  {parents.map((parent: any) => (
                    <div key={parent.id}>
                      {renderCard(parent)}
                      {(topicsByParentId[parent.id] ?? []).map((topic: any) => renderCard(topic, true))}
                    </div>
                  ))}
                  {orphanTopics.map((ch: any) => renderCard(ch, true))}
                </>
              );
            })()}
          </div>
          </DndContext>
        )}
      </div>

      {/* Add Channel Modal */}
      {showAddChannel && (
        <Modal title="Добавить канал / группу" onClose={() => setShowAddChannel(false)}>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Вставьте ссылку на канал/группу или топик.<br />
            <b>Важно:</b> бот должен быть добавлен в канал/группу как администратор.
          </p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const raw = channelInput.trim();
            if (!raw) return;
            const tmeMatch = raw.match(/(?:https?:\/\/)?t\.me\/([^\/\s]+)(?:\/(\d+))?/);
            let chatId = raw;
            let parsedThread = threadId ? Number(threadId) : undefined;
            if (tmeMatch) {
              chatId = `@${tmeMatch[1]}`;
              if (tmeMatch[2]) parsedThread = Number(tmeMatch[2]);
            } else if (!raw.startsWith('@') && !raw.startsWith('-') && !/^\d+$/.test(raw)) {
              chatId = `@${raw}`;
            }
            addChannelMut.mutate({ chatId, threadId: parsedThread, threadTitle: threadTitle.trim() || undefined } as any);
          }}>
            <label className="block text-sm font-medium mb-1">Канал или группа</label>
            <input value={channelInput} onChange={(e) => {
              setChannelInput(e.target.value);
              // Auto-detect thread from t.me link
              const m = e.target.value.match(/(?:https?:\/\/)?t\.me\/[^\/\s]+\/(\d+)/);
              if (m && !threadTitle) setThreadTitle('');
            }}
              placeholder="https://t.me/my_channel/123 или @my_channel"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono mb-1" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />
            {/* Show thread title input when topic detected */}
            {(() => {
              const m = channelInput.match(/(?:https?:\/\/)?t\.me\/[^\/\s]+\/(\d+)/);
              const detectedThread = m?.[1];
              return detectedThread ? (
                <div className="mb-1">
                  <div className="text-[10px] mb-1 flex items-center gap-1.5" style={{ color: 'var(--text-muted)' }}>
                    <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 font-mono"># топик {detectedThread}</span>
                    определён из ссылки
                  </div>
                  <input value={threadTitle} onChange={(e) => setThreadTitle(e.target.value)}
                    placeholder="Название топика (например: Обсуждение, Новости)"
                    className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                </div>
              ) : null;
            })()}
            <p className="text-[10px] mb-3" style={{ color: 'var(--text-muted)' }}>
              Ссылка t.me — топик определится автоматически. Или @username, или числовой ID.
            </p>
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
          { value: 'web_search', icon: '🔍', title: 'Мониторинг тем', desc: 'Ищет статьи в интернете по ключевым запросам. Нужен поисковый провайдер (Tavily, Serper и др.).', needsSchedule: true, forChannel: true, forGroup: true },
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
            if (taskType === 'news_feed') config = { useAi: taskConfig.useAi, systemPrompt: taskConfig.useAi ? (taskConfig.systemPrompt || undefined) : undefined, rawTemplate: taskConfig.useAi ? undefined : taskConfig.rawTemplate };
            if (taskType === 'auto_reply') config = { rules: taskConfig.rules.filter((r: any) => r.pattern), cooldownSeconds: taskConfig.cooldownSeconds ?? 0 };
            if (taskType === 'welcome') config = { welcomeText: taskConfig.welcomeText, deleteAfterSeconds: taskConfig.deleteAfterSeconds || 0, imageUrl: taskConfig.imageUrl || undefined, buttons: taskConfig.buttons?.filter((b: any) => b.text && b.url) ?? [], farewellText: taskConfig.farewellText || undefined, farewellImageUrl: taskConfig.farewellImageUrl || undefined };
            if (taskType === 'moderation') config = { ...taskConfig };
            if (taskType === 'web_search') config = { queries: (taskConfig.queries ?? []).filter((q: string) => q.trim()), useAi: taskConfig.useAi, systemPrompt: taskConfig.useAi ? (taskConfig.systemPrompt || undefined) : undefined, rawTemplate: taskConfig.useAi ? undefined : taskConfig.rawTemplate, postMode: taskConfig.postMode, maxResults: taskConfig.maxResults, timeRange: taskConfig.timeRange, postLanguage: taskConfig.postLanguage, searchLang: taskConfig.searchLang, searchCountries: taskConfig.searchCountries, includeDomains: taskConfig.includeDomains?.length ? taskConfig.includeDomains : undefined, maxPostsPerDay: taskConfig.maxPostsPerDay, postIntervalMinutes: taskConfig.postIntervalMinutes, postMaxLength: taskConfig.postMaxLength, aiSetupPrompt: taskConfig.aiSetupPrompt || undefined };
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

            {/* Schedule */}
            {(taskType === 'news_feed' || taskType === 'web_search') && <SchedulePicker value={taskSchedule} onChange={setTaskSchedule} />}

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
                {taskConfig.useAi && (
                  <div className="mt-3">
                    <label className="block text-xs font-medium mb-1">AI промпт</label>
                    <textarea value={taskConfig.systemPrompt ?? ''} onChange={(e) => setTaskConfig({ ...taskConfig, systemPrompt: e.target.value })} rows={3}
                      placeholder="Ты — редактор Telegram-канала. Пиши кратко, информативно, с HTML-форматированием (<b>, <i>, <a href=''>). Используй эмодзи умеренно. Добавляй ссылку на источник."
                      className="w-full px-3 py-2 rounded-lg border text-xs outline-none resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Опишите стиль и тон постов. Если пусто — используется стандартный промпт.</p>
                  </div>
                )}
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
              <AutoReplyConfigUI rules={taskConfig.rules ?? [{ pattern: '', response: '' }]} cooldownSeconds={taskConfig.cooldownSeconds ?? 0}
                onChangeRules={(r: any) => setTaskConfig({ ...taskConfig, rules: r })}
                onChangeCooldown={(v: number) => setTaskConfig({ ...taskConfig, cooldownSeconds: v })} />
            )}

            {/* Welcome config */}
            {taskType === 'welcome' && (
              <div className="mb-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Текст приветствия</label>
                  <textarea value={taskConfig.welcomeText} onChange={(e) => setTaskConfig({ ...taskConfig, welcomeText: e.target.value })} onKeyDown={ctrlEnter} rows={3} className="w-full px-3 py-2 rounded-lg border text-xs outline-none resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{'{name}'} — имя, {'{username}'} — @username. Поддерживается HTML.</p>
                  <div className="mt-2 rounded-lg p-2 text-xs" style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Превью: </span>
                    {taskConfig.welcomeText?.replace(/\{name\}/g, 'Иван').replace(/\{username\}/g, '@ivan')}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Картинка / GIF (URL)</label>
                  <input value={taskConfig.imageUrl ?? ''} onChange={(e) => setTaskConfig({ ...taskConfig, imageUrl: e.target.value })}
                    placeholder="https://example.com/welcome.jpg" className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Необязательно. Картинка отправится вместе с текстом.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Кнопки (inline)</label>
                  {(taskConfig.buttons ?? []).map((btn: any, i: number) => (
                    <div key={i} className="flex gap-2 mb-1">
                      <input value={btn.text} onChange={(e) => { const b = [...(taskConfig.buttons ?? [])]; b[i] = { ...b[i], text: e.target.value }; setTaskConfig({ ...taskConfig, buttons: b }); }}
                        placeholder="Текст кнопки" className="flex-1 px-2 py-1 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                      <input value={btn.url} onChange={(e) => { const b = [...(taskConfig.buttons ?? [])]; b[i] = { ...b[i], url: e.target.value }; setTaskConfig({ ...taskConfig, buttons: b }); }}
                        placeholder="https://..." className="flex-1 px-2 py-1 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                      <button type="button" onClick={() => setTaskConfig({ ...taskConfig, buttons: (taskConfig.buttons ?? []).filter((_: any, j: number) => j !== i) })}
                        className="text-red-400/50 hover:text-red-400"><Trash2 size={12} /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setTaskConfig({ ...taskConfig, buttons: [...(taskConfig.buttons ?? []), { text: '', url: '' }] })}
                    className="text-[11px] text-blue-400">+ Добавить кнопку</button>
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Например: «Правила группы» → ссылка на пост с правилами.</p>
                </div>
                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-xs font-medium mb-1">Удалить через (сек)</label>
                    <input type="number" min={0} value={taskConfig.deleteAfterSeconds} onChange={(e) => setTaskConfig({ ...taskConfig, deleteAfterSeconds: Number(e.target.value) })}
                      className="w-24 px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                    <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>0 = не удалять</span>
                  </div>
                </div>
                <div className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                  <label className="block text-xs font-medium mb-1">Прощание (при выходе участника)</label>
                  <input value={taskConfig.farewellText ?? ''} onChange={(e) => setTaskConfig({ ...taskConfig, farewellText: e.target.value })}
                    placeholder="Необязательно. Например: {name} покинул(а) чат 👋" className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  <input value={taskConfig.farewellImageUrl ?? ''} onChange={(e) => setTaskConfig({ ...taskConfig, farewellImageUrl: e.target.value })}
                    placeholder="URL картинки для прощания (необязательно)" className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none mt-1" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Пусто = без прощания. {'{name}'}, {'{username}'} работают.</p>
                </div>
              </div>
            )}

            {/* Moderation config */}
            {taskType === 'moderation' && (
              <ModerationConfigUI config={taskConfig} onChange={(c: any) => setTaskConfig({ ...taskConfig, ...c })} />
            )}

            {/* Web Search config */}
            {taskType === 'web_search' && (
              <WebSearchConfigUI config={taskConfig} onChange={(c: any) => setTaskConfig({ ...taskConfig, ...c })} botId={botId} onScheduleChange={setTaskSchedule} />
            )}

            {/* Hint per task type */}
            <div className="rounded-lg p-3 mb-4 text-xs" style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--text-muted)' }}>
              {taskType === 'news_feed' && taskConfig.useAi && <>💡 Добавьте источники → «Запустить сейчас». AI переработает новости в посты.</>}
              {taskType === 'news_feed' && !taskConfig.useAi && <>💡 Добавьте источники. Бот подставит данные в шаблон.</>}
              {taskType === 'web_search' && <>💡 Задайте поисковые запросы. Бот найдёт статьи и создаст посты.</>}
              {taskType === 'auto_reply' && <>💡 Авто-ответы работают на <b>всю группу</b> (все топики). Достаточно добавить один раз.</>}
              {taskType === 'welcome' && <>💡 Приветствие действует на <b>всю группу</b>. Достаточно добавить один раз.</>}
              {taskType === 'moderation' && <>💡 Модерация действует на <b>всю группу</b> (все топики). Достаточно добавить один раз.</>}
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
          botId={botId}
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

// ─── Auto-Reply Config UI ────────────────────────────────────────────────────
