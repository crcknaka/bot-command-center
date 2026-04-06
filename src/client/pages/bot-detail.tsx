import React, { useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Play, Square, Hash, Settings2, Trash2, Zap, RefreshCw, Pencil, Copy, Send, Eye, BarChart3, Users, GripVertical, Sparkles } from 'lucide-react';
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { Spinner } from '../components/ui/spinner.js';
import { useConfirm } from '../components/ui/confirm-dialog.js';
import { InfoTip } from '../components/ui/tooltip.js';

import { Stepper } from '../components/ui/stepper.js';
import { useBotAction } from '../hooks/use-bots.js';
import { apiFetch } from '../lib/api.js';
import { cn, timeAgo } from '../lib/utils.js';

/** Ctrl+Enter submits the closest form or clicks the nearest primary button */
const ctrlEnter = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const form = (e.target as HTMLElement).closest('form');
    if (form) { form.requestSubmit(); return; }
    // Fallback: find the save/submit button in the modal
    const modal = (e.target as HTMLElement).closest('[class*="rounded-2xl"]');
    const btn = modal?.querySelector('button[class*="text-white"]') as HTMLButtonElement | null;
    if (btn && !btn.disabled) btn.click();
  }
};

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
                    onRunTask={(taskId: number) => { setTaskRunResult((prev) => { const next = { ...prev }; delete next[taskId]; return next; }); runTaskMut.mutate(taskId); }}
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

function AutoReplyConfigUI({ rules, cooldownSeconds, onChangeRules, onChangeCooldown }: {
  rules: any[]; cooldownSeconds: number;
  onChangeRules: (r: any[]) => void; onChangeCooldown: (v: number) => void;
}) {
  const updateRule = (i: number, patch: any) => {
    const r = [...rules]; r[i] = { ...r[i], ...patch }; onChangeRules(r);
  };
  const removeRule = (i: number) => {
    const r = rules.filter((_: any, j: number) => j !== i);
    onChangeRules(r.length ? r : [{ pattern: '', response: '' }]);
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium mb-2">Правила авто-ответов</label>
      <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>Когда сообщение совпадает с ключевым словом — бот отправляет ответ.</p>

      <div className="space-y-3">
        {rules.map((rule: any, i: number) => {
          const patterns: string[] = rule.patterns ?? (rule.pattern ? [rule.pattern] : []);
          const responses: string[] = rule.responses ?? (rule.response ? [rule.response] : []);
          return (
          <div key={i} className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex justify-between items-center">
              <label className="block text-[10px] font-medium" style={{ color: 'var(--text-muted)' }}>Ключевые слова</label>
              <button type="button" onClick={() => removeRule(i)} className="p-1 text-red-400/50 hover:text-red-400"><Trash2 size={14} /></button>
            </div>
            {/* Patterns as tags */}
            <div className="flex flex-wrap gap-1 mb-1">
              {patterns.map((p: string, j: number) => (
                <span key={j} className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-400 flex items-center gap-1">
                  {p}
                  <button type="button" onClick={() => { const np = patterns.filter((_: string, k: number) => k !== j); updateRule(i, { patterns: np, pattern: np[0] ?? '' }); }} className="hover:text-blue-300">×</button>
                </span>
              ))}
            </div>
            <input
              placeholder="Введите слово и нажмите Enter"
              className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault();
                  const val = (e.target as HTMLInputElement).value.trim().replace(/,$/, '');
                  if (val) { const np = [...patterns, val]; updateRule(i, { patterns: np, pattern: np[0] }); (e.target as HTMLInputElement).value = ''; }
                }
              }}
            />

            {/* Responses */}
            <label className="block text-[10px] font-medium mt-2" style={{ color: 'var(--text-muted)' }}>
              Варианты ответа {responses.length > 1 && <span className="font-normal">(рандомно)</span>}
            </label>
            {responses.map((r: string, j: number) => (
              <div key={j} className="flex gap-1">
                <textarea value={r} onChange={(e) => { const nr = [...responses]; nr[j] = e.target.value; updateRule(i, { responses: nr, response: nr[0] ?? '' }); }} onKeyDown={ctrlEnter}
                  placeholder="Привет, {user}!"
                  rows={2} className="flex-1 px-2 py-1.5 rounded-lg border text-xs outline-none resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                {responses.length > 1 && (
                  <button type="button" onClick={() => { const nr = responses.filter((_: string, k: number) => k !== j); updateRule(i, { responses: nr, response: nr[0] ?? '' }); }} className="text-red-400/50 hover:text-red-400 px-1"><Trash2 size={10} /></button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => updateRule(i, { responses: [...responses, ''], response: responses[0] ?? '' })}
              className="text-[10px] text-blue-400">+ Ещё вариант ответа</button>

            <div className="flex gap-3 flex-wrap pt-1">
              <label className="text-[11px] flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={rule.exactMatch ?? false} onChange={(e) => updateRule(i, { exactMatch: e.target.checked })} />
                Точное слово
              </label>
              <label className="text-[11px] flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={rule.isRegex ?? false} onChange={(e) => updateRule(i, { isRegex: e.target.checked })} />
                Regex
              </label>
              <label className="text-[11px] flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={rule.replyInDm ?? false} onChange={(e) => updateRule(i, { replyInDm: e.target.checked })} />
                Ответить в ЛС
              </label>
            </div>
          </div>
          );
        })}
      </div>

      <button type="button" onClick={() => onChangeRules([...rules, { patterns: [], responses: [''], pattern: '', response: '' }])}
        className="text-[11px] text-blue-400 hover:text-blue-300 mt-2">+ Добавить правило</button>

      <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
        Переменные в ответе: {'{user}'} — имя, {'{username}'} — @username, {'{chatTitle}'} — название чата.
      </p>

      <div className="flex items-center gap-2 text-xs mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
        <span style={{ color: 'var(--text-muted)' }}>Пауза между ответами одному юзеру:</span>
        <input type="number" min={0} value={cooldownSeconds} onChange={(e) => onChangeCooldown(Number(e.target.value))}
          className="w-16 px-2 py-1 rounded-lg border text-xs text-center" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>сек (0 = всегда)</span>
      </div>
    </div>
  );
}

// ─── Banned Words Input ──────────────────────────────────────────────────────

function BannedWordsInput({ words, onChange }: { words: string[]; onChange: (w: string[]) => void }) {
  const [input, setInput] = useState('');

  const addWord = () => {
    const newWords = input.split(',').map((w) => w.trim()).filter(Boolean).filter((w) => !words.includes(w));
    if (newWords.length) { onChange([...words, ...newWords]); setInput(''); }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addWord(); }
  };

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} onBlur={addWord}
          placeholder="Введите слово и нажмите Enter"
          className="flex-1 px-3 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
        <button type="button" onClick={addWord} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 shrink-0">
          Добавить
        </button>
      </div>
      <div className="flex gap-2 mb-2 flex-wrap items-center">
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          Enter или запятая для добавления.
        </p>
        <button type="button" onClick={() => {
          const mat = ['хуй','хуя','хуе','хуи','хуё','пизд','пизж','бля','блять','бляд','блят','ебат','ебать','ебан','ебал','ебу','ёбан','ёб','еба','сука','сучк','сучар','мудак','мудил','мудо','пидор','пидар','пидр','педик','залуп','шлюх','шалав','блядь','ёбтвоюмать','нахуй','нахуя','похуй','похуя','охуе','охуи','ахуе','ахуи','заеб','заёб','отъеб','въеб','уёб','уеб','доеб','доёб','наеб','наёб','поеб','поёб','выеб','выёб','ёбнут','ебнут','пиздец','пиздат','пиздюк','пиздюл','распизд','спизд','припизд','пиздёж','манда','елда','хер','херн','дроч','гандон','кондом'];
          const newWords = mat.filter(w => !words.includes(w));
          if (newWords.length) onChange([...words, ...newWords]);
        }} className="px-2 py-1 rounded-lg text-[10px] font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20">
          🤬 + Русский мат
        </button>
        <button type="button" onClick={() => {
          const drugs = ['наркотик','наркоман','наркота','героин','кокаин','марихуана','каннабис','гашиш','амфетамин','метамфетамин','экстази','mdma','lsd','лсд','мефедрон','спайс','закладка','закладки','кладмен','барыга','барыжит','гидропоника','снюс','насвай','крэк','crack','кетамин','морфий','опиум','ширяться','ширнуться','торчок','обдолбан','обдолбаться','укуренный','наркоша','нарик','передоз','передозировка'];
          const newWords = drugs.filter(w => !words.includes(w));
          if (newWords.length) onChange([...words, ...newWords]);
        }} className="px-2 py-1 rounded-lg text-[10px] font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20">
          💊 + Наркотики
        </button>
      </div>
      {words.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {words.map((w, i) => (
            <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-red-500/10 text-red-400 flex items-center gap-1">
              {w}
              <button type="button" onClick={() => onChange(words.filter((_, j) => j !== i))} className="hover:text-red-300">×</button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Нет запрещённых слов. Добавьте выше.</p>
      )}
    </div>
  );
}

// ─── Warn Config (reusable per-violation warning editor) ─────────────────────

const WARN_DEFAULTS: Record<string, string> = {
  bannedWords: '⚠️ {user}, ваше сообщение удалено за нарушение правил.',
  links: '🔗 {user}, ссылки в чате запрещены.',
  flood: '🚫 {user}, слишком много сообщений! Подождите минуту.',
  shortMsg: '✏️ {user}, сообщение слишком короткое.',
  forwards: '🚫 {user}, пересланные сообщения запрещены.',
  stickers: '🚫 {user}, стикеры и GIF запрещены.',
  voice: '🚫 {user}, голосовые сообщения запрещены.',
};

function WarnConfig({ label, warnKey, value, onChange }: {
  label: string;
  warnKey: string;
  value: { enabled: boolean; texts: string[] } | undefined;
  onChange: (v: { enabled: boolean; texts: string[] }) => void;
}) {
  const enabled = value?.enabled ?? true;
  const texts = value?.texts ?? [];
  const defaultText = WARN_DEFAULTS[warnKey] ?? '';

  return (
    <div className="ml-5 mt-1 mb-2 rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <label className="flex items-center gap-2 text-[11px] mb-1">
        <input type="checkbox" checked={enabled} onChange={(e) => onChange({ enabled: e.target.checked, texts })} />
        Предупреждение: {label}
      </label>
      {enabled && (
        <div className="space-y-1 mt-1">
          {texts.length === 0 && (
            <div className="text-[10px] px-2 py-1 rounded bg-zinc-800" style={{ color: 'var(--text-muted)' }}>
              По умолчанию: {defaultText}
            </div>
          )}
          {texts.map((t, i) => (
            <div key={i} className="flex gap-1">
              <input value={t} onChange={(e) => { const n = [...texts]; n[i] = e.target.value; onChange({ enabled, texts: n }); }}
                placeholder={defaultText}
                className="flex-1 px-2 py-1 rounded border text-[11px] outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <button type="button" onClick={() => onChange({ enabled, texts: texts.filter((_, j) => j !== i) })}
                className="text-red-400/50 hover:text-red-400 px-1"><Trash2 size={10} /></button>
            </div>
          ))}
          <button type="button" onClick={() => onChange({ enabled, texts: [...texts, ''] })}
            className="text-[10px] text-blue-400">+ {texts.length === 0 ? 'Свой текст' : 'Ещё вариант'}</button>
          {texts.length > 1 && <span className="text-[9px] ml-2" style={{ color: 'var(--text-muted)' }}>(рандомно)</span>}
        </div>
      )}
    </div>
  );
}

// ─── Web Search Config UI ────────────────────────────────────────────────────

function WebSearchConfigUI({ config, onChange, botId, onScheduleChange }: { config: any; onChange: (patch: any) => void; botId?: number; onScheduleChange?: (cron: string) => void }) {
  const [newQ, setNewQ] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [aiSetupPrompt, setAiSetupPrompt] = useState(config.aiSetupPrompt ?? '');
  const [aiSetupLoading, setAiSetupLoading] = useState(false);
  const [aiSetupDone, setAiSetupDone] = useState(false);
  const [aiSetupError, setAiSetupError] = useState('');
  const queries: string[] = config.queries ?? [];
  const domains: string[] = config.includeDomains ?? [];
  const { data: searchProviders } = useQuery({ queryKey: ['search-providers'], queryFn: () => apiFetch('/search-providers') });

  const allLocales = [
    { code: 'ru', flag: '🇷🇺', lang: 'Русский', country: 'Россия' },
    { code: 'us', flag: '🇺🇸', lang: 'English', country: 'США' },
    { code: 'ua', flag: '🇺🇦', lang: 'Українська', country: 'Украина' },
    { code: 'lv', flag: '🇱🇻', lang: 'Latviešu', country: 'Латвия' },
    { code: 'de', flag: '🇩🇪', lang: 'Deutsch', country: 'Германия' },
    { code: 'gb', flag: '🇬🇧', lang: 'English', country: 'UK' },
    { code: 'fr', flag: '🇫🇷', lang: 'Français', country: 'Франция' },
    { code: 'es', flag: '🇪🇸', lang: 'Español', country: 'Испания' },
    { code: 'kz', flag: '🇰🇿', lang: 'Русский', country: 'Казахстан' },
    { code: 'by', flag: '🇧🇾', lang: 'Русский', country: 'Беларусь' },
    { code: 'il', flag: '🇮🇱', lang: 'English', country: 'Израиль' },
  ];
  const langCodes: Record<string, string> = { ru: 'ru', us: 'en', ua: 'uk', lv: 'lv', de: 'de', gb: 'en', fr: 'fr', es: 'es', kz: 'ru', by: 'ru', il: 'en' };
  const countries: string[] = config.searchCountries ?? ['ru'];

  return (
    <div className="mb-4 space-y-2">
      {/* AI Smart Setup */}
      <div className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border)', background: 'rgba(139,92,246,0.04)' }}>
        <div className="text-xs font-semibold flex items-center gap-1.5">✨ Быстрая настройка</div>
        <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          Опишите какие новости искать и как писать посты. AI настроит всё автоматически: запросы, регион, промпт и лимиты. Вы сможете подправить любую настройку ниже.
        </p>
        <textarea
          value={aiSetupPrompt}
          onChange={(e) => setAiSetupPrompt(e.target.value)}
          placeholder="Например: новости про моноколёса связанные с Латвией и Прибалтикой, на русском языке, с юмором"
          rows={2}
          className="w-full px-3 py-2 rounded-lg border text-xs resize-none"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              if (!aiSetupPrompt.trim()) return;
              setAiSetupLoading(true); setAiSetupError(''); setAiSetupDone(false);
              try {
                const res = await apiFetch('/tasks/ai-setup', { method: 'POST', body: JSON.stringify({ prompt: aiSetupPrompt, botId }) });
                if (res.ok && res.config) {
                  onChange({
                    queries: res.config.queries,
                    searchCountries: res.config.searchCountries,
                    searchLang: res.config.searchLang,
                    systemPrompt: res.config.systemPrompt,
                    timeRange: res.config.timeRange,
                    maxResults: res.config.maxResults,
                    maxPostsPerDay: res.config.maxPostsPerDay,
                    postIntervalMinutes: res.config.postIntervalMinutes,
                    postMaxLength: res.config.postMaxLength,
                    useAi: true,
                    aiSetupPrompt: aiSetupPrompt.trim(),
                  });
                  if (res.config.schedule && onScheduleChange) {
                    onScheduleChange(res.config.schedule);
                  }
                  setAiSetupDone(true);
                  setTimeout(() => setAiSetupDone(false), 3000);
                }
              } catch (err) {
                setAiSetupError((err as Error).message);
              } finally { setAiSetupLoading(false); }
            }}
            disabled={aiSetupLoading || !aiSetupPrompt.trim()}
            className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Sparkles size={12} /> {aiSetupLoading ? 'Настраиваю...' : 'Настроить автоматически'}
          </button>
          {aiSetupDone && <span className="text-[11px] text-green-400">✅ Готово! Проверьте настройки ниже.</span>}
          {aiSetupError && <div className="text-[11px] text-red-400 mt-1">{aiSetupError.includes('quota') || aiSetupError.includes('rate') ? '⚠️ Лимит AI-провайдера исчерпан. Подождите минуту или смените провайдер в Настройках.' : `❌ ${aiSetupError}`}</div>}
        </div>
      </div>

      {/* Mini flow diagram */}
      <div className="flex items-center gap-2 text-[11px] py-2 px-3 rounded-lg" style={{ background: 'rgba(59,130,246,0.06)', color: 'var(--text-muted)' }}>
        <span>🔍 Запросы</span><span>→</span><span>📄 Результаты</span><span>→</span><span>🤖 AI</span><span>→</span><span>📤 Пост</span>
      </div>

      {!searchProviders?.length && (
        <div className="rounded-lg p-3 text-xs bg-yellow-500/10 text-yellow-400">
          ⚠️ Поисковый провайдер не подключён. <b>Настройки → Поиск</b> → добавьте Serper, Tavily или другой.
        </div>
      )}

      {/* ═══ SECTION 1: Queries ═══ */}
      <div className="text-xs font-semibold flex items-center gap-1.5 pb-1">🔍 Поисковые запросы</div>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        Бот ищет статьи по этим запросам. Чем конкретнее — тем лучше. Пример: <code>electric unicycle review 2026</code>
      </p>
      <div className="flex gap-2 mb-1">
        <input value={newQ} onChange={(e) => setNewQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newQ.trim()) { onChange({ queries: [...queries, newQ.trim()] }); setNewQ(''); } } }}
          placeholder="Введите запрос..."
          className="flex-1 px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
        <button type="button" onClick={() => { if (newQ.trim()) { onChange({ queries: [...queries, newQ.trim()] }); setNewQ(''); } }}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 shrink-0">
          Добавить
        </button>
      </div>
      {queries.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {queries.map((q: string, i: number) => (
            <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-400 flex items-center gap-1">
              {q} <button type="button" onClick={() => onChange({ queries: queries.filter((_: string, j: number) => j !== i) })} className="hover:text-blue-300">×</button>
            </span>
          ))}
        </div>
      )}

      {/* ═══ SECTION 2: Region ═══ */}
      <div className="text-xs font-semibold flex items-center gap-1.5 pt-3 pb-1 border-t mt-3" style={{ borderColor: 'var(--border)' }}>🌍 Регион и язык</div>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        Выберите страны — поиск будет приоритизировать результаты оттуда.
      </p>
      <div className="flex items-center gap-2 mb-1">
        <label className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Язык результатов:</label>
        <select value={config.searchLang ?? 'ru'} onChange={(e) => onChange({ searchLang: e.target.value })}
          className="px-2 py-0.5 rounded border text-[10px]" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
          <option value="ru">Русский</option>
          <option value="en">English</option>
          <option value="lv">Latviešu</option>
          <option value="uk">Українська</option>
          <option value="de">Deutsch</option>
          <option value="fr">Français</option>
          <option value="es">Español</option>
        </select>
      </div>
      <div className="flex flex-wrap gap-1 mb-1">
        {countries.map((code: string) => {
          const loc = allLocales.find(x => x.code === code);
          return (
            <span key={code} className="px-2 py-0.5 rounded-full text-[10px] bg-green-500/10 text-green-400 flex items-center gap-1">
              {loc?.flag} {loc?.country ?? code} <span style={{ color: 'var(--text-muted)' }}>({loc?.lang ?? '?'})</span>
              <button type="button" onClick={() => { const next = countries.filter((x: string) => x !== code); onChange({ searchCountries: next.length ? next : ['ru'] }); }} className="hover:text-green-300">×</button>
            </span>
          );
        })}
      </div>
      <select value="" onChange={(e) => {
        if (e.target.value) {
          const next = [...countries, e.target.value];
          onChange({ searchCountries: next });
        }
        e.target.value = '';
      }} className="px-2 py-1 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
        <option value="">+ Добавить страну</option>
        {allLocales.filter(c => !countries.includes(c.code)).map(c => <option key={c.code} value={c.code}>{c.flag} {c.country} ({c.lang})</option>)}
      </select>

      {/* ═══ SECTION 3: Search params ═══ */}
      <div className="text-xs font-semibold flex items-center gap-1.5 pt-3 pb-1 border-t mt-3" style={{ borderColor: 'var(--border)' }}>⚙️ Параметры поиска</div>
      <div className="text-[9px] -mt-1 mb-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
        💡 Точность фильтрации по стране зависит от поискового провайдера. Serper/Google лучше всех фильтруют по региону. Tavily ищет глобально и добавляет страну как подсказку в запрос.
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Свежесть результатов</label>
          <select value={config.timeRange ?? 'day'} onChange={(e) => onChange({ timeRange: e.target.value })}
            className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
            <option value="day">За последний день</option>
            <option value="week">За неделю</option>
            <option value="month">За месяц</option>
          </select>
        </div>
        <div>
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Источников для AI на запрос</label>
          <input type="number" min={1} max={10} value={config.maxResults ?? 3} onChange={(e) => onChange({ maxResults: Number(e.target.value) })}
            className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          <div className="text-[9px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
            AI получит {config.maxResults ?? 3} {(config.maxResults ?? 3) === 1 ? 'статью' : (config.maxResults ?? 3) < 5 ? 'статьи' : 'статей'} и напишет из них 1 пост. Больше источников = больше контекста, но дороже по токенам.
          </div>
        </div>
      </div>

      {/* Domains */}
      <div>
        <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Искать только на этих сайтах (необязательно)</label>
        <div className="flex gap-2 mb-1">
          <input value={newDomain} onChange={(e) => setNewDomain(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const d = newDomain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''); if (d) { onChange({ includeDomains: [...domains, d] }); setNewDomain(''); } } }}
            placeholder="example.com"
            className="flex-1 px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          <button type="button" onClick={() => { const d = newDomain.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, ''); if (d) { onChange({ includeDomains: [...domains, d] }); setNewDomain(''); } }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 shrink-0">+</button>
        </div>
        {domains.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {domains.map((d: string, i: number) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-purple-500/10 text-purple-400 flex items-center gap-1">
                {d} <button type="button" onClick={() => onChange({ includeDomains: domains.filter((_: string, j: number) => j !== i) })} className="hover:text-purple-300">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ═══ SECTION 4: Post generation ═══ */}
      <div className="text-xs font-semibold flex items-center gap-1.5 pt-3 pb-1 border-t mt-3" style={{ borderColor: 'var(--border)' }}>✍️ Генерация поста</div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onChange({ useAi: true })}
          className={cn('p-3 rounded-xl border text-left text-xs transition-colors', (config.useAi !== false) ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
          style={{ borderColor: (config.useAi !== false) ? undefined : 'var(--border)' }}>
          <div className="font-medium mb-1">🤖 С AI</div>
          <div style={{ color: 'var(--text-muted)' }}>AI напишет уникальный пост. Нужен AI-провайдер.</div>
        </button>
        <button type="button" onClick={() => onChange({ useAi: false })}
          className={cn('p-3 rounded-xl border text-left text-xs transition-colors', config.useAi === false ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
          style={{ borderColor: config.useAi === false ? undefined : 'var(--border)' }}>
          <div className="font-medium mb-1">📋 Шаблон</div>
          <div style={{ color: 'var(--text-muted)' }}>Заголовок + текст + ссылка. Без AI.</div>
        </button>
      </div>
      {config.useAi !== false && (
        <div>
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>AI промпт (как бот должен писать посты)</label>
          <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-muted)' }}>AI получит: ваш промпт + найденные статьи (заголовок, текст, URL). AI напишет: один пост для Telegram.</p>
          <textarea value={config.systemPrompt ?? ''} onChange={(e) => onChange({ systemPrompt: e.target.value })}
            placeholder="Ты — редактор Telegram-канала про моноколёса. Пиши с юмором, кратко, на русском. Добавляй ссылку на источник."
            rows={5} className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Пусто = стандартный промпт. Здесь можно задать тон, стиль, язык постов.</p>
        </div>
      )}
      {config.useAi === false && (
        <div>
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Шаблон поста</label>
          <textarea value={config.rawTemplate ?? ''} onChange={(e) => onChange({ rawTemplate: e.target.value })}
            placeholder={'<b>{title}</b>\n\n{summary}\n\n<a href="{url}">Читать далее</a>'}
            rows={5} className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none resize-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Переменные: <code>{'{title}'}</code>, <code>{'{summary}'}</code>, <code>{'{url}'}</code>. Поддерживается HTML.</p>
        </div>
      )}

      {/* Post mode */}
      <div className="mt-2">
        <div className="text-xs font-medium mb-1.5">📤 После генерации:</div>
        <div className="grid grid-cols-3 gap-2">
          <button type="button" onClick={() => onChange({ postMode: 'queue' })}
            className={cn('px-3 py-1.5 rounded-lg border text-xs text-center transition-colors', (config.postMode ?? 'queue') === 'queue' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'hover:border-zinc-600')}
            style={{ borderColor: (config.postMode ?? 'queue') === 'queue' ? undefined : 'var(--border)' }}>
            В очередь
          </button>
          <button type="button" onClick={() => onChange({ postMode: 'draft' })}
            className={cn('px-3 py-1.5 rounded-lg border text-xs text-center transition-colors', config.postMode === 'draft' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'hover:border-zinc-600')}
            style={{ borderColor: config.postMode === 'draft' ? undefined : 'var(--border)' }}>
            Черновик
          </button>
          <button type="button" onClick={() => onChange({ postMode: 'publish' })}
            className={cn('px-3 py-1.5 rounded-lg border text-xs text-center transition-colors', config.postMode === 'publish' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'hover:border-zinc-600')}
            style={{ borderColor: config.postMode === 'publish' ? undefined : 'var(--border)' }}>
            Сразу
          </button>
        </div>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
          {(config.postMode ?? 'queue') === 'queue' && 'Посты попадут в очередь и будут опубликованы по расписанию.'}
          {config.postMode === 'draft' && 'Посты сохранятся как черновики — вы проверите и одобрите вручную.'}
          {config.postMode === 'publish' && 'Посты будут опубликованы сразу после генерации — без проверки.'}
        </p>
      </div>

      {/* Limits */}
      <div className="text-xs font-semibold flex items-center gap-1.5 pt-3 pb-1 border-t mt-3" style={{ borderColor: 'var(--border)' }}>📊 Лимиты</div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Макс. постов в день</label>
          <input type="number" min={1} max={50} value={config.maxPostsPerDay ?? 5} onChange={(e) => onChange({ maxPostsPerDay: Number(e.target.value) })}
            className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
        </div>
        <div>
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Интервал (мин)</label>
          <input type="number" min={1} max={1440} value={config.postIntervalMinutes ?? 60} onChange={(e) => onChange({ postIntervalMinutes: Number(e.target.value) })}
            className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>Минимум между публикациями</div>
        </div>
        <div>
          <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Макс. символов</label>
          <input type="number" min={100} max={4000} step={100} value={config.postMaxLength ?? 2000} onChange={(e) => onChange({ postMaxLength: Number(e.target.value) })}
            className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
        </div>
      </div>
    </div>
  );
}

// ─── Moderation Config UI (shared between create and edit) ───────────────────

function SectionHeader({ title, icon }: { title: string; icon: string }) {
  return <div className="text-xs font-semibold flex items-center gap-1.5 pt-3 pb-1 border-t mt-3" style={{ borderColor: 'var(--border)' }}>{icon} {title}</div>;
}

function ModerationConfigUI({ config, onChange }: { config: any; onChange: (patch: any) => void }) {
  const set = (patch: any) => onChange(patch);

  return (
    <div className="mb-4 space-y-2">

      {/* ═══ SECTION 1: Banned words ═══ */}
      <div className="text-xs font-semibold flex items-center gap-1.5 pb-1">🚫 Запрещённые слова</div>
      <BannedWordsInput words={config.bannedWords ?? []} onChange={(w: string[]) => set({ bannedWords: w })} />
      <div className="flex items-center gap-4 text-xs">
        <span style={{ color: 'var(--text-muted)' }}>При нарушении:</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="deleteOnBan" checked={config.deleteOnBan !== false} onChange={() => set({ deleteOnBan: true })} />
          Удалить сообщение
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input type="radio" name="deleteOnBan" checked={config.deleteOnBan === false} onChange={() => set({ deleteOnBan: false })} />
          Оставить (только предупреждение)
        </label>
      </div>
      <WarnConfig label="запрещённые слова" warnKey="bannedWords" value={config.bannedWordsWarn} onChange={(v) => set({ bannedWordsWarn: v })} />

      {/* ═══ SECTION 2: Content filters ═══ */}
      <SectionHeader title="Фильтры контента" icon="🛡" />
      <p className="text-[10px] -mt-1 mb-2" style={{ color: 'var(--text-muted)' }}>Какие типы сообщений запрещены в чате. Нарушения обрабатываются по правилам из раздела «Наказания» ниже.</p>

      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={config.blockLinks ?? false} onChange={(e) => set({ blockLinks: e.target.checked })} />
          Запретить ссылки
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>(http, t.me, @каналы)</span>
        </label>
        {config.blockLinks && <WarnConfig label="ссылки" warnKey="links" value={config.linksWarn} onChange={(v) => set({ linksWarn: v })} />}

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={config.blockForwards ?? false} onChange={(e) => set({ blockForwards: e.target.checked })} />
          Запретить пересланные сообщения
        </label>
        {config.blockForwards && <WarnConfig label="пересылки" warnKey="forwards" value={config.forwardsWarn} onChange={(v) => set({ forwardsWarn: v })} />}

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={config.blockStickers ?? false} onChange={(e) => set({ blockStickers: e.target.checked })} />
          Запретить стикеры и GIF
        </label>
        {config.blockStickers && <WarnConfig label="стикеры" warnKey="stickers" value={config.stickersWarn} onChange={(v) => set({ stickersWarn: v })} />}

        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={config.blockVoice ?? false} onChange={(e) => set({ blockVoice: e.target.checked })} />
          Запретить голосовые и видео-кружки
        </label>
        {config.blockVoice && <WarnConfig label="голосовые" warnKey="voice" value={config.voiceWarn} onChange={(v) => set({ voiceWarn: v })} />}

        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>Мин. длина сообщения:</span>
          <input type="number" min={0} max={100} value={config.minMessageLength ?? 0} onChange={(e) => set({ minMessageLength: Number(e.target.value) })}
            className="w-14 px-2 py-1 rounded-lg border text-xs text-center" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>символов (0 = выкл)</span>
        </div>
        {(config.minMessageLength ?? 0) > 0 && <WarnConfig label="короткие" warnKey="shortMsg" value={config.shortMsgWarn} onChange={(v) => set({ shortMsgWarn: v })} />}
      </div>

      {/* ═══ SECTION 3: Anti-flood ═══ */}
      <SectionHeader title="Защита от спама" icon="🌊" />
      <p className="text-[10px] -mt-1 mb-2" style={{ color: 'var(--text-muted)' }}>Ограничение частоты сообщений — если пользователь пишет слишком много сообщений подряд.</p>
      <label className="flex items-center gap-2 text-xs cursor-pointer">
        <input type="checkbox" checked={config.antiFlood ?? false} onChange={(e) => set({ antiFlood: e.target.checked })} />
        Включить защиту от спама
      </label>
      {config.antiFlood && (
        <div className="ml-5 space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Макс.</span>
            <input type="number" min={1} max={30} value={config.maxMessagesPerMinute ?? 5} onChange={(e) => set({ maxMessagesPerMinute: Number(e.target.value) })}
              className="w-14 px-2 py-1 rounded-lg border text-xs text-center" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            <span style={{ color: 'var(--text-muted)' }}>сообщений в минуту от одного юзера</span>
          </div>
          <WarnConfig label="спам" warnKey="flood" value={config.floodWarn} onChange={(v) => set({ floodWarn: v })} />
        </div>
      )}

      {/* ═══ SECTION 4: Punishments ═══ */}
      <SectionHeader title="Наказания за нарушения" icon="⚖️" />
      <p className="text-[10px] -mt-1 mb-2" style={{ color: 'var(--text-muted)' }}>Что делать с пользователем при нарушении любого правила выше (запрещённые слова, фильтры, спам).</p>
      <div className="space-y-2.5">
        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <input type="radio" name="punishment" className="mt-0.5" checked={!config.strikesEnabled && !config.muteOnViolation} onChange={() => set({ strikesEnabled: false, muteOnViolation: false })} />
          <div>
            <div className="font-medium">Только предупреждение</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Бот отправит предупреждение в чат. Пользователь не будет замучен.</div>
          </div>
        </label>
        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <input type="radio" name="punishment" className="mt-0.5" checked={config.strikesEnabled ?? false} onChange={() => set({ strikesEnabled: true, muteOnViolation: false })} />
          <div>
            <div className="font-medium">Система страйков</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>После N предупреждений — автоматический мут. Счётчик сбрасывается через время.</div>
          </div>
        </label>
        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <input type="radio" name="punishment" className="mt-0.5" checked={!config.strikesEnabled && config.muteOnViolation} onChange={() => set({ strikesEnabled: false, muteOnViolation: true })} />
          <div>
            <div className="font-medium">Мут сразу</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>Мут при первом же нарушении, без предупреждений.</div>
          </div>
        </label>
      </div>

      {/* Strike settings */}
      {config.strikesEnabled && (
        <div className="ml-5 rounded-lg p-3 space-y-2" style={{ background: 'rgba(255,255,255,0.02)' }}>
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span style={{ color: 'var(--text-muted)' }}>Страйков до мута:</span>
            <input type="number" min={1} max={10} value={config.maxStrikes ?? 3} onChange={(e) => set({ maxStrikes: Number(e.target.value) })}
              className="w-14 px-2 py-1 rounded-lg border text-xs text-center" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            <span style={{ color: 'var(--text-muted)' }}>Мут на:</span>
            <input type="number" min={1} max={1440} value={config.strikeMuteDuration ?? 60} onChange={(e) => set({ strikeMuteDuration: Number(e.target.value) })}
              className="w-16 px-2 py-1 rounded-lg border text-xs text-center" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>мин</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Сброс через:</span>
            <input type="number" min={1} max={168} value={config.strikeResetHours ?? 24} onChange={(e) => set({ strikeResetHours: Number(e.target.value) })}
              className="w-14 px-2 py-1 rounded-lg border text-xs text-center" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>часов без нарушений</span>
          </div>
          <div>
            <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Текст предупреждения ({'{user}'} {'{n}'} {'{max}'}):</label>
            <input value={config.strikeWarnText ?? '⚠️ {user}, предупреждение {n}/{max}.'} onChange={(e) => set({ strikeWarnText: e.target.value })}
              className="w-full px-2 py-1 rounded-lg border text-[11px] outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          </div>
          <div>
            <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Текст при муте ({'{user}'} {'{n}'} {'{max}'} {'{mins}'}):</label>
            <input value={config.strikeMuteText ?? '🚫 {user}, {n}/{max} предупреждений. Мут на {mins} мин.'} onChange={(e) => set({ strikeMuteText: e.target.value })}
              className="w-full px-2 py-1 rounded-lg border text-[11px] outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          </div>
        </div>
      )}

      {/* Direct mute settings */}
      {!config.strikesEnabled && config.muteOnViolation && (
        <div className="ml-5 flex items-center gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>Длительность мута:</span>
          <input type="number" min={1} max={1440} value={config.muteDurationMinutes ?? 5} onChange={(e) => set({ muteDurationMinutes: Number(e.target.value) })}
            className="w-16 px-2 py-1 rounded-lg border text-xs text-center" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>минут</span>
        </div>
      )}

      {/* ═══ SECTION 5: Bot messages ═══ */}
      <SectionHeader title="Сообщения бота" icon="💬" />
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span style={{ color: 'var(--text-muted)' }}>Предупреждения бота:</span>
        <select value={config.warnDeleteSeconds ?? 10} onChange={(e) => set({ warnDeleteSeconds: Number(e.target.value) })}
          className="px-2 py-1 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
          <option value={0}>Оставлять в чате</option>
          <option value={5}>Удалять через 5 сек</option>
          <option value={10}>Удалять через 10 сек</option>
          <option value={30}>Удалять через 30 сек</option>
          <option value={60}>Удалять через 1 мин</option>
        </select>
      </div>
      <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        {'{user}'} — кликабельное имя нарушителя. В предупреждениях можно добавить несколько вариантов текста — бот выберет случайный.
      </p>
    </div>
  );
}

// ─── Schedule Picker ─────────────────────────────────────────────────────────

type ScheduleMode = 'daily' | 'multi' | 'interval' | 'custom';

function SchedulePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Parse current cron to detect mode
  const detectMode = (): ScheduleMode => {
    if (!value || value === '0 * * * *') return 'interval';
    if (value.match(/^0 \d+,/) ) return 'multi';
    if (value.match(/^0 \*\/\d+ \* \* \*$/)) return 'interval';
    if (value.match(/^0 \d+ \* \* \*$/)) return 'daily';
    return 'custom';
  };

  const [mode, setMode] = useState<ScheduleMode>(detectMode);
  const [dailyHour, setDailyHour] = useState(() => {
    const m = value.match(/^0 (\d+) \* \* \*$/);
    return m ? Number(m[1]) : 9;
  });
  const [multiHours, setMultiHours] = useState<number[]>(() => {
    const m = value.match(/^0 ([\d,]+) \* \* \*$/);
    return m ? m[1].split(',').map(Number) : [9, 18];
  });
  const [intervalH, setIntervalH] = useState(() => {
    const m = value.match(/^0 \*\/(\d+) \* \* \*$/);
    return m ? Number(m[1]) : 6;
  });

  const applyDaily = (h: number) => { setDailyHour(h); onChange(`0 ${h} * * *`); };
  const applyMulti = (hours: number[]) => { setMultiHours(hours); onChange(`0 ${hours.sort((a, b) => a - b).join(',')} * * *`); };
  const applyInterval = (h: number) => { setIntervalH(h); onChange(`0 */${h} * * *`); };
  const toggleMultiHour = (h: number) => {
    const next = multiHours.includes(h) ? multiHours.filter((x) => x !== h) : [...multiHours, h];
    if (next.length > 0) applyMulti(next);
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="mb-5">
      <label className="block text-sm font-medium mb-2">Расписание</label>

      {/* Mode selector */}
      <div className="flex gap-1.5 mb-3 flex-wrap">
        {[
          { id: 'daily' as ScheduleMode, label: 'Раз в день' },
          { id: 'multi' as ScheduleMode, label: 'Несколько раз' },
          { id: 'interval' as ScheduleMode, label: 'Каждые N часов' },
          { id: 'custom' as ScheduleMode, label: 'Cron' },
        ].map((m) => (
          <button key={m.id} type="button" onClick={() => {
            setMode(m.id);
            if (m.id === 'daily') applyDaily(dailyHour);
            if (m.id === 'multi') applyMulti(multiHours);
            if (m.id === 'interval') applyInterval(intervalH);
          }}
            className={cn('px-3 py-1.5 rounded-lg text-[11px] font-medium transition-colors', mode === m.id ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300')}>
            {m.label}
          </button>
        ))}
      </div>

      {/* Daily: single hour picker */}
      {mode === 'daily' && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs">Каждый день в</span>
            <select value={dailyHour} onChange={(e) => applyDaily(Number(e.target.value))}
              className="px-2 py-1 rounded-lg border text-sm font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
              {hours.map((h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}
            </select>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Бот запустится один раз в день в выбранное время.</p>
        </div>
      )}

      {/* Multi: multiple hours */}
      {mode === 'multi' && (
        <div>
          <p className="text-xs mb-2">Выберите часы (нажмите на нужные):</p>
          <div className="flex flex-wrap gap-1 mb-2">
            {hours.map((h) => (
              <button key={h} type="button" onClick={() => toggleMultiHour(h)}
                className={cn('w-10 py-1 rounded text-[11px] font-mono transition-colors', multiHours.includes(h) ? 'bg-blue-500/20 text-blue-400' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300')}>
                {String(h).padStart(2, '0')}
              </button>
            ))}
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            Выбрано: {multiHours.sort((a, b) => a - b).map((h) => `${String(h).padStart(2, '0')}:00`).join(', ') || 'ничего'}
          </p>
        </div>
      )}

      {/* Interval */}
      {mode === 'interval' && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs">Каждые</span>
            <select value={intervalH} onChange={(e) => applyInterval(Number(e.target.value))}
              className="px-2 py-1 rounded-lg border text-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
              {[1, 2, 3, 4, 6, 8, 12].map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <span className="text-xs">часов</span>
          </div>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {intervalH === 1 ? '24 раза в сутки' : `${Math.floor(24 / intervalH)} раз в сутки`}
          </p>
        </div>
      )}

      {/* Custom cron */}
      {mode === 'custom' && (
        <div>
          <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="0 9 * * *"
            className="w-full px-3 py-2 rounded-lg border text-sm font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          <div className="text-[10px] mt-1.5 space-y-0.5" style={{ color: 'var(--text-muted)' }}>
            <div>Формат: <code>минута час день месяц день_недели</code></div>
            <div><code>0 9 * * 1-5</code> — по будням в 9:00</div>
            <div><code>30 14 * * *</code> — каждый день в 14:30</div>
          </div>
        </div>
      )}

      {/* Current cron display */}
      <div className="mt-2 text-[10px] font-mono px-2 py-1 rounded bg-zinc-800" style={{ color: 'var(--text-muted)' }}>
        cron: {value}
      </div>
    </div>
  );
}

function EditTaskModal({ task, onSave, onClose, isPending, botId }: {
  task: any; onSave: (data: any) => void; onClose: () => void; isPending: boolean; botId?: number;
}) {
  const config = task.config ?? {};
  const defaultName = { news_feed: '📰 Новостная лента', web_search: '🔍 Мониторинг тем', auto_reply: '🤖 Авто-ответы', welcome: '👋 Приветствие', moderation: '🛡️ Модерация' }[task.type as string] ?? task.type;
  const [name, setName] = useState(task.name || defaultName);
  const [schedule, setSchedule] = useState(task.schedule ?? '');
  const [enabled, setEnabled] = useState(task.enabled ?? true);
  const [useAi, setUseAi] = useState(config.useAi !== false);
  const [taskPrompt, setTaskPrompt] = useState(config.systemPrompt ?? '');
  const [rawTemplate, setRawTemplate] = useState(config.rawTemplate ?? '<b>{title}</b>\n\n{summary}\n\n<a href="{url}">Читать далее</a>');
  const [postMode, setPostMode] = useState(config.postMode ?? 'queue');
  const [nfMaxPostsPerDay, setNfMaxPostsPerDay] = useState(config.maxPostsPerDay ?? 5);
  const [nfIntervalMinutes, setNfIntervalMinutes] = useState(config.postIntervalMinutes ?? 60);
  const [nfMaxLength, setNfMaxLength] = useState(config.postMaxLength ?? 2000);
  const [filterKeywords, setFilterKeywords] = useState<string[]>(config.filterKeywords ?? []);
  const [newFilterKw, setNewFilterKw] = useState('');
  const [maxAgeDays, setMaxAgeDays] = useState(config.maxAgeDays ?? 7);
  // Auto-reply
  const [rules, setRules] = useState<Array<{ pattern: string; response: string; isRegex?: boolean; replyInDm?: boolean }>>(config.rules ?? [{ pattern: '', response: '' }]);
  const [cooldownSec, setCooldownSec] = useState(config.cooldownSeconds ?? 0);
  // Welcome
  const [welcomeText, setWelcomeText] = useState(config.welcomeText ?? '👋 Привет, {name}!');
  const [deleteAfterSec, setDeleteAfterSec] = useState(config.deleteAfterSeconds ?? 0);
  const [welcomeImageUrl, setWelcomeImageUrl] = useState(config.imageUrl ?? '');
  const [welcomeButtons, setWelcomeButtons] = useState<Array<{ text: string; url: string }>>(config.buttons ?? []);
  const [farewellText, setFarewellText] = useState(config.farewellText ?? '');
  const [farewellImageUrl, setFarewellImageUrl] = useState(config.farewellImageUrl ?? '');
  // Moderation — single state object for ModerationConfigUI
  const [modConfig, setModConfig] = useState<Record<string, any>>({ ...config });
  // Web search
  const [webSearchConfig, setWebSearchConfig] = useState<Record<string, any>>({ ...config });

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
        {(task.type === 'news_feed' || task.type === 'web_search') && <SchedulePicker value={schedule} onChange={setSchedule} />}

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
            {useAi && (
              <div className="mt-2">
                <label className="block text-xs font-medium mb-1">AI промпт</label>
                <textarea value={taskPrompt} onChange={(e) => setTaskPrompt(e.target.value)} onKeyDown={ctrlEnter} rows={3}
                  placeholder="Ты — редактор Telegram-канала. Пиши кратко, с HTML-форматированием. Добавляй ссылку на источник."
                  className="w-full px-3 py-2 rounded-lg border text-xs outline-none resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Опишите стиль постов. Пусто = стандартный промпт.</p>
              </div>
            )}
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
          <AutoReplyConfigUI rules={rules} cooldownSeconds={cooldownSec}
            onChangeRules={setRules} onChangeCooldown={setCooldownSec} />
        )}

        {/* Welcome config */}
        {task.type === 'welcome' && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">Текст приветствия</label>
              <textarea value={welcomeText} onChange={(e) => setWelcomeText(e.target.value)} onKeyDown={ctrlEnter} rows={3} className="w-full px-3 py-2 rounded-lg border text-xs resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{'{name}'} — имя, {'{username}'} — @username. HTML поддерживается.</p>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Картинка / GIF (URL)</label>
              <input value={welcomeImageUrl} onChange={(e) => setWelcomeImageUrl(e.target.value)}
                placeholder="https://example.com/welcome.jpg" className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Кнопки (inline)</label>
              {welcomeButtons.map((btn, i) => (
                <div key={i} className="flex gap-2 mb-1">
                  <input value={btn.text} onChange={(e) => { const b = [...welcomeButtons]; b[i] = { ...b[i], text: e.target.value }; setWelcomeButtons(b); }}
                    placeholder="Текст кнопки" className="flex-1 px-2 py-1 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  <input value={btn.url} onChange={(e) => { const b = [...welcomeButtons]; b[i] = { ...b[i], url: e.target.value }; setWelcomeButtons(b); }}
                    placeholder="https://..." className="flex-1 px-2 py-1 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  <button type="button" onClick={() => setWelcomeButtons(welcomeButtons.filter((_, j) => j !== i))} className="text-red-400/50 hover:text-red-400"><Trash2 size={12} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setWelcomeButtons([...welcomeButtons, { text: '', url: '' }])} className="text-[11px] text-blue-400">+ Добавить кнопку</button>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Удалить через (сек)</label>
              <input type="number" min={0} value={deleteAfterSec} onChange={(e) => setDeleteAfterSec(Number(e.target.value))} className="w-24 px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <span className="text-[10px] ml-2" style={{ color: 'var(--text-muted)' }}>0 = не удалять</span>
            </div>
            <div className="pt-2 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
              <label className="block text-xs font-medium mb-1">Прощание</label>
              <input value={farewellText} onChange={(e) => setFarewellText(e.target.value)}
                placeholder="{name} покинул(а) чат 👋" className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <input value={farewellImageUrl} onChange={(e) => setFarewellImageUrl(e.target.value)}
                placeholder="URL картинки для прощания (необязательно)" className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none mt-1" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Пусто = без прощания.</p>
            </div>
          </div>
        )}

        {/* Moderation config */}
        {task.type === 'moderation' && (
          <ModerationConfigUI config={modConfig} onChange={(patch: any) => setModConfig((prev: any) => ({ ...prev, ...patch }))} />
        )}

        {/* Web Search config */}
        {task.type === 'web_search' && (
          <WebSearchConfigUI config={webSearchConfig} onChange={(patch: any) => setWebSearchConfig((prev: any) => ({ ...prev, ...patch }))} botId={botId} onScheduleChange={setSchedule} />
        )}

        {/* Filter keywords */}
        {task.type === 'news_feed' && (
          <div>
            <label className="block text-sm font-medium mb-1">Фильтр по ключевым словам</label>
            <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
              Из RSS-источников будут браться только статьи, содержащие хотя бы одно из этих слов в заголовке или тексте. Пусто = все статьи.
            </p>
            <div className="flex gap-2 mb-2">
              <input value={newFilterKw} onChange={(e) => setNewFilterKw(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newFilterKw.trim()) { setFilterKeywords([...filterKeywords, newFilterKw.trim()]); setNewFilterKw(''); } } }}
                placeholder="Например: unicycle, EUC, моноколесо"
                className="flex-1 px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <button type="button" onClick={() => { if (newFilterKw.trim()) { setFilterKeywords([...filterKeywords, newFilterKw.trim()]); setNewFilterKw(''); } }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 shrink-0">
                Добавить
              </button>
            </div>
            {filterKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {filterKeywords.map((kw, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-400 flex items-center gap-1">
                    {kw}
                    <button type="button" onClick={() => setFilterKeywords(filterKeywords.filter((_, j) => j !== i))} className="hover:text-blue-300">×</button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 text-xs mt-2">
              <span style={{ color: 'var(--text-muted)' }}>Свежесть статей:</span>
              <select value={maxAgeDays} onChange={(e) => setMaxAgeDays(Number(e.target.value))}
                className="px-2 py-1 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                <option value={1}>За последний день</option>
                <option value={3}>За 3 дня</option>
                <option value={7}>За неделю</option>
                <option value={14}>За 2 недели</option>
                <option value={30}>За месяц</option>
              </select>
              <InfoTip text="Статьи старше этого срока не будут загружаться. Защита от старых новостей." position="top" />
            </div>
          </div>
        )}

        {/* Post mode */}
        {task.type === 'news_feed' && (
          <div>
            <div className="text-xs font-medium mb-1.5">📤 После генерации:</div>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setPostMode('queue')}
                className={cn('px-3 py-1.5 rounded-lg border text-xs text-center transition-colors', postMode === 'queue' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'hover:border-zinc-600')}
                style={{ borderColor: postMode === 'queue' ? undefined : 'var(--border)' }}>
                В очередь
              </button>
              <button type="button" onClick={() => setPostMode('draft')}
                className={cn('px-3 py-1.5 rounded-lg border text-xs text-center transition-colors', postMode === 'draft' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'hover:border-zinc-600')}
                style={{ borderColor: postMode === 'draft' ? undefined : 'var(--border)' }}>
                Черновик
              </button>
              <button type="button" onClick={() => setPostMode('publish')}
                className={cn('px-3 py-1.5 rounded-lg border text-xs text-center transition-colors', postMode === 'publish' ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'hover:border-zinc-600')}
                style={{ borderColor: postMode === 'publish' ? undefined : 'var(--border)' }}>
                Сразу
              </button>
            </div>
            <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {postMode === 'queue' && 'Посты попадут в очередь и будут опубликованы по расписанию.'}
              {postMode === 'draft' && 'Посты сохранятся как черновики — вы проверите и одобрите вручную.'}
              {postMode === 'publish' && 'Посты будут опубликованы сразу после генерации — без проверки.'}
            </p>
            {/* Limits */}
            <div className="text-[10px] font-semibold mt-3 mb-1" style={{ color: 'var(--text-muted)' }}>📊 Лимиты</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Макс. постов/день</label>
                <input type="number" min={1} max={50} value={nfMaxPostsPerDay} onChange={(e) => setNfMaxPostsPerDay(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              </div>
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Интервал (мин)</label>
                <input type="number" min={1} max={1440} value={nfIntervalMinutes} onChange={(e) => setNfIntervalMinutes(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              </div>
              <div>
                <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Макс. символов</label>
                <input type="number" min={100} max={4000} step={100} value={nfMaxLength} onChange={(e) => setNfMaxLength(Number(e.target.value))}
                  className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3 justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
          <button
            onClick={() => {
              let cfg: any = config;
              if (task.type === 'news_feed') cfg = { ...config, useAi, systemPrompt: useAi ? (taskPrompt || undefined) : undefined, rawTemplate: useAi ? undefined : rawTemplate, postMode, maxPostsPerDay: nfMaxPostsPerDay, postIntervalMinutes: nfIntervalMinutes, postMaxLength: nfMaxLength, filterKeywords: filterKeywords.length ? filterKeywords : undefined, maxAgeDays };
              if (task.type === 'auto_reply') cfg = { ...config, rules: rules.filter(r => r.pattern), cooldownSeconds: cooldownSec };
              if (task.type === 'welcome') cfg = { ...config, welcomeText, deleteAfterSeconds: deleteAfterSec, imageUrl: welcomeImageUrl || undefined, buttons: welcomeButtons.filter(b => b.text && b.url), farewellText: farewellText || undefined, farewellImageUrl: farewellImageUrl || undefined };
              if (task.type === 'moderation') cfg = { ...modConfig };
              if (task.type === 'web_search') cfg = { ...webSearchConfig, queries: (webSearchConfig.queries ?? []).filter((q: string) => q.trim()) };
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
  web: { icon: '🌐', label: 'Веб-страница', desc: 'Автоматический парсинг ссылок и заголовков с новостной страницы.', placeholder: 'https://example.com/news', hint: 'Укажите URL страницы со списком статей. Бот найдёт ссылки с заголовками автоматически. Лучше работает на страницах-каталогах (архив, раздел новостей).' },
};

const rssPresets = [
  { cat: '🛞 Моноколёса / EUC', items: [
    { name: 'r/ElectricUnicycle', url: 'ElectricUnicycle', type: 'reddit', desc: 'Главный Reddit про EUC: обзоры, вопросы, видео поездок. Картинки есть.' },
    { name: 'Wrong Way (YouTube)', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC2RaB95OJ2j3-o-JJubz0qw', type: 'youtube', desc: 'Wrong Way — крупнейший EUC канал. Обзоры, тесты, поездки.' },
    { name: 'Chooch Tech (YouTube)', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCFeDZyrD6D5AjG1KSO9NLVQ', type: 'youtube', desc: 'Chooch Tech — обзоры самых быстрых EUC, тесты.' },
    { name: 'Alien Rides (YouTube)', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCfsmUHp1lI4s_8qpMJwF6ng', type: 'youtube', desc: 'Alien Rides — обзоры EUC, групповые поездки.' },
    { name: 'Johnny Go Vroom (YouTube)', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCDj4iyBli4Y4EwLxktpE58A', type: 'youtube', desc: 'Johnny Go Vroom — обзоры EUC, защита, экипировка.' },
    { name: 'Esk8 NYC (YouTube)', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UC0KLwxSbtWArsKvDgtnSe0g', type: 'youtube', desc: 'Esk8 NYC — EUC, esk8, электротранспорт в городе.' },
    { name: 'EUC World Blog', url: 'https://euc.world/blog/feed', type: 'rss', desc: 'Блог EUC World — приложение для моноколёс.' },
    { name: 'r/onewheel', url: 'onewheel', type: 'reddit', desc: 'Onewheel: трюки, маршруты, модификации' },
    { name: 'GN: Electric Unicycle', url: 'https://news.google.com/rss/search?q=electric+unicycle&hl=en', type: 'rss', desc: 'Google News: electric unicycle (EN). Без картинок.' },
    { name: 'GN: Моноколесо', url: 'https://news.google.com/rss/search?q=%D0%BC%D0%BE%D0%BD%D0%BE%D0%BA%D0%BE%D0%BB%D0%B5%D1%81%D0%BE&hl=ru', type: 'rss', desc: 'Google News: моноколесо (RU). Без картинок.' },
    { name: 'GN: Begode Inmotion KingSong', url: 'https://news.google.com/rss/search?q=begode+OR+inmotion+OR+leaperkim+OR+kingsong+unicycle&hl=en', type: 'rss', desc: 'Google News: бренды EUC (EN). Без картинок.' },
    { name: 'Electrek (+ фильтр)', url: 'https://electrek.co/feed/', type: 'rss', desc: 'Electrek: всё про EV. Используй фильтр "unicycle" чтобы получать только EUC.' },
  ]},
  { cat: '⚡ Электротранспорт / EV', items: [
    { name: 'Electrek', url: 'https://electrek.co/feed/', type: 'rss', desc: 'Главный сайт про EV, e-bikes, электроскутеры. Ежедневные новости индустрии' },
    { name: 'InsideEVs', url: 'https://insideevs.com/feed/', type: 'rss', desc: 'Обзоры, тесты и новости электромобилей и электротранспорта' },
    { name: 'Electric Bike Report', url: 'https://electricbikereport.com/feed', type: 'rss', desc: 'Обзоры электровелосипедов, сравнения, гайды для покупателей' },
    { name: 'CleanTechnica', url: 'https://cleantechnica.com/feed/', type: 'rss', desc: 'Чистая энергия, EV, солнечные панели, экологичные технологии' },
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
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  const info = sourceTypeInfo[form.type] ?? sourceTypeInfo.rss;
  const qc = useQueryClient();

  const togglePreset = (url: string) => {
    setSelectedPresets((prev) => { const n = new Set(prev); n.has(url) ? n.delete(url) : n.add(url); return n; });
  };

  const bulkAddMut = useMutation({
    mutationFn: async (items: Array<{ name: string; type: string; url: string }>) => {
      for (const item of items) {
        await apiFetch(`/tasks/${taskId}/sources`, { method: 'POST', body: JSON.stringify(item) });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['sources', taskId] }); setSelectedPresets(new Set()); onClose(); },
  });

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
              className="w-full px-3 py-2 rounded-lg border text-xs outline-none focus:border-[var(--primary)]"
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
          {filteredPresets.map((cat: any) => {
            const catUrls = cat.items.map((i: any) => i.url);
            const allSelected = catUrls.every((u: string) => selectedPresets.has(u));
            return (
            <div key={cat.cat}>
              <div className="flex items-center gap-2 mb-1">
                <button type="button" onClick={() => {
                  setSelectedPresets((prev) => {
                    const n = new Set(prev);
                    if (allSelected) { catUrls.forEach((u: string) => n.delete(u)); } else { catUrls.forEach((u: string) => n.add(u)); }
                    return n;
                  });
                }} className="text-[10px] text-blue-400 hover:text-blue-300">{allSelected ? '☑' : '☐'}</button>
                <div className="text-xs font-semibold">{cat.cat}</div>
              </div>
              {cat.desc && <div className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>{cat.desc}</div>}
              <div className="space-y-1">
                {cat.items.map((item: any) => (
                  <button key={item.url} onClick={() => togglePreset(item.url)} className={cn('w-full px-3 py-2 rounded-lg text-left transition-colors', selectedPresets.has(item.url) ? 'bg-blue-500/10 border border-blue-500/30' : 'hover:bg-white/5')}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px]">{selectedPresets.has(item.url) ? '☑' : '☐'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium">{item.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50 shrink-0" style={{ color: 'var(--text-muted)' }}>{item.type}</span>
                        </div>
                        {item.desc && <div className="text-[10px] mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{item.desc}</div>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );})}
          </div>
          {selectedPresets.size > 0 ? (
            <button type="button" disabled={bulkAddMut.isPending} onClick={() => {
              const allItems = rssPresets.flatMap((c: any) => c.items);
              const items = allItems.filter((i: any) => selectedPresets.has(i.url));
              bulkAddMut.mutate(items);
            }} className="w-full mt-3 py-2.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--primary)' }}>
              {bulkAddMut.isPending ? 'Добавляю...' : `Добавить ${selectedPresets.size} источников`}
            </button>
          ) : (
            <div className="rounded-lg p-2 mt-3 text-[11px]" style={{ background: 'rgba(59,130,246,0.06)', color: 'var(--text-muted)' }}>
              💡 Отметьте нужные фиды и нажмите кнопку. Или кликните один для ручного добавления.
            </div>
          )}
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
  const [postLang, setPostLang] = useState(bot.postLanguage ?? 'Russian');
  const [maxPerDay, setMaxPerDay] = useState(bot.maxPostsPerDay ?? 5);
  const [minInterval, setMinInterval] = useState(bot.minPostIntervalMinutes ?? 60);
  const [maxLength, setMaxLength] = useState(bot.maxPostLength ?? 2000);
  const [signature, setSignature] = useState(bot.postSignature ?? '');
  const [botSystemPrompt, setBotSystemPrompt] = useState(bot.systemPrompt ?? '');
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
            <div>
              <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                Системный промпт (AI)
                <InfoTip text="Общий промпт для AI-генерации постов этого бота. Можно переопределить на уровне задачи." position="right" />
              </label>
              <textarea value={botSystemPrompt} onChange={(e) => setBotSystemPrompt(e.target.value)} onKeyDown={ctrlEnter} rows={2}
                placeholder="Ты — редактор Telegram-канала. Пиши кратко, с HTML..."
                className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
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
                systemPrompt: botSystemPrompt || null,
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

function ChannelCard({ channel, botId, allChannels, isTopic, onAddTask, onDeleteChannel, onEditTask, onToggleTask, onRunTask, onDeleteTask, onAddSource, onFetchSource, onDeleteSource, runningTaskId, fetchingSourceId, taskRunResults, fetchResults }: any) {
  const { setNodeRef, isOver } = useDroppable({ id: `channel-${channel.id}` });
  const qc = useQueryClient();
  const { data: tasks } = useQuery({
    queryKey: ['tasks', channel.id],
    queryFn: () => apiFetch(`/channels/${channel.id}/tasks`),
  });

  const [showDuplicate, setShowDuplicate] = useState(false);
  const [dupChatId, setDupChatId] = useState('');
  const [dupThreadId, setDupThreadId] = useState('');
  const duplicateMut = useMutation({
    mutationFn: (data: { chatId: string; threadId?: number }) =>
      apiFetch(`/channels/${channel.id}/duplicate`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); setShowDuplicate(false); setDupChatId(''); setDupThreadId(''); },
  });

  const duplicateTaskMut = useMutation({
    mutationFn: (taskId: number) => apiFetch(`/tasks/${taskId}/duplicate`, { method: 'POST' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks', channel.id] }); },
  });

  const [showSend, setShowSend] = useState(false);
  const [sendText, setSendText] = useState('');
  const [sendImage, setSendImage] = useState('');
  const sendMut = useMutation({
    mutationFn: (data: { channelId: number; text: string; imageUrl?: string }) =>
      apiFetch(`/bots/${botId}/send`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { setShowSend(false); setSendText(''); setSendImage(''); },
  });


  return (
    <div ref={setNodeRef} className={`rounded-xl border overflow-hidden transition-colors ${isOver ? 'ring-2 ring-blue-500/50' : ''}`} style={{ background: isOver ? 'rgba(59,130,246,0.05)' : 'var(--bg-card)', borderColor: isOver ? 'var(--primary)' : 'var(--border)' }}>
      {/* Channel header */}
      <div className="px-3 sm:px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          {isTopic ? (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400"># Топик</span>
          ) : channel.type === 'channel' ? (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">📢 Канал</span>
          ) : (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">👥 Группа</span>
          )}
          <span className="font-medium text-sm truncate max-w-32 sm:max-w-none">
            {isTopic ? (<><span style={{ color: 'var(--text-muted)' }}>{channel.title} ›</span> {channel.threadTitle || `Топик ${channel.threadId}`}</>) : channel.title}
          </span>
          {!isTopic && <span className="text-[11px] font-mono hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{channel.chatId}</span>}
          {channel.isLinked ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/50" style={{ color: 'var(--text-muted)' }}>Подключён</span>
          ) : (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Не подключён</span>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button onClick={() => setShowSend(true)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors" title="Написать от лица бота">
            <Send size={12} />
          </button>
          {(channel.type === 'supergroup' || channel.type === 'group') && (
            <>
              <Link to="/analytics" className="p-1.5 rounded-lg hover:bg-white/5" title="Аналитика группы">
                <BarChart3 size={13} className="text-blue-400/60 hover:text-blue-400" />
              </Link>
              <Link to="/members" className="p-1.5 rounded-lg hover:bg-white/5" title="Участники группы">
                <Users size={13} className="text-green-400/60 hover:text-green-400" />
              </Link>
            </>
          )}
          <button onClick={() => onAddTask(channel.type)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
            <Plus size={12} /> Задача
          </button>
          <button onClick={() => setShowDuplicate(true)} className="p-1.5 rounded-lg hover:bg-white/5" title="Дублировать канал со всеми задачами">
            <Copy size={14} className="text-zinc-400/60 hover:text-zinc-300" />
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
                onToggle={(taskId: number, enabled: boolean) => onToggleTask(taskId, enabled)}
                onRun={() => onRunTask(task.id)}
                onDelete={() => onDeleteTask(task.id)}
                onDuplicate={() => duplicateTaskMut.mutate(task.id)}
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

      {/* Duplicate Channel Modal */}
      {showDuplicate && (
        <Modal title="Дублировать канал" onClose={() => setShowDuplicate(false)}>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            Все задачи, настройки и источники будут скопированы на новый канал/группу.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); if (!dupChatId.trim()) return; duplicateMut.mutate({ chatId: dupChatId.trim(), threadId: dupThreadId ? Number(dupThreadId) : undefined }); }}>
            <label className="block text-sm font-medium mb-1">Новый канал/группа</label>
            <input value={dupChatId} onChange={(e) => setDupChatId(e.target.value)}
              placeholder="@new_channel" required autoFocus
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono mb-3" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            <label className="block text-xs font-medium mb-1">Топик (thread_id)</label>
            <input value={dupThreadId} onChange={(e) => setDupThreadId(e.target.value)}
              placeholder="Пусто = General"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono mb-4" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowDuplicate(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
              <button type="submit" disabled={duplicateMut.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
                {duplicateMut.isPending ? 'Дублирую...' : 'Дублировать'}
              </button>
            </div>
          </form>
          {duplicateMut.isError && (
            <p className="text-xs text-red-400 mt-2">{(duplicateMut.error as Error).message}</p>
          )}
        </Modal>
      )}

      {/* Send Message Modal */}
      {showSend && (
        <Modal title={`Написать в ${channel.title}`} onClose={() => setShowSend(false)}>
          <form onSubmit={(e) => { e.preventDefault(); if (!sendText.trim()) return; sendMut.mutate({ channelId: channel.id, text: sendText.trim(), imageUrl: sendImage.trim() || undefined }); }}>
            <label className="block text-xs font-medium mb-1">Сообщение (HTML)</label>
            <textarea value={sendText} onChange={(e) => setSendText(e.target.value)} onKeyDown={ctrlEnter} rows={4} autoFocus required
              placeholder="Текст сообщения... Ctrl+Enter — отправить"
              className="w-full px-3 py-2 rounded-lg border text-xs outline-none resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            <label className="block text-xs font-medium mb-1 mt-3">Картинка (URL, необязательно)</label>
            <input value={sendImage} onChange={(e) => setSendImage(e.target.value)}
              placeholder="https://example.com/photo.jpg"
              className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none mb-4" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setShowSend(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
              <button type="submit" disabled={sendMut.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
                {sendMut.isPending ? 'Отправляю...' : 'Отправить'}
              </button>
            </div>
          </form>
          {sendMut.isError && <p className="text-xs text-red-400 mt-2">{(sendMut.error as Error).message}</p>}
          {sendMut.isSuccess && <p className="text-xs text-green-400 mt-2">Сообщение отправлено!</p>}
        </Modal>
      )}

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

function TaskCard({ task, onEdit, onRun, onToggle, onDelete, onDuplicate, onAddSource, onFetchSource, onDeleteSource, fetchResults, isRunning, fetchingSourceId, runResult }: any) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `task-${task.id}` });
  const [preview, setPreview] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testAi, setTestAi] = useState<any>(null);
  const [testAiLoading, setTestAiLoading] = useState(false);
  const { data: sources } = useQuery({
    queryKey: ['sources', task.id],
    queryFn: () => apiFetch(`/tasks/${task.id}/sources`),
  });

  return (
    <div ref={setNodeRef} className={`rounded-lg border p-2 sm:p-3 transition-opacity ${isDragging ? 'opacity-30' : ''}`} style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 hidden sm:block" title="Перетащите в другой канал">
            <GripVertical size={14} />
          </div>
          <span className="text-sm font-medium">
            {task.name || { news_feed: '📰 Новостная лента', web_search: '🔍 Мониторинг тем', auto_reply: '🤖 Авто-ответы', welcome: '👋 Приветствие', moderation: '🛡️ Модерация' }[task.type as string] || task.type}
          </span>
          {(task.type === 'news_feed' || task.type === 'web_search') && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded', (task.config as any)?.useAi === false ? 'bg-zinc-700/50 text-zinc-400' : 'bg-purple-500/10 text-purple-400')}>
              {(task.config as any)?.useAi === false ? '📋 Без AI' : '🤖 AI'}
            </span>
          )}
          {(task.type === 'news_feed' || task.type === 'web_search') && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded', {
              'bg-yellow-500/10 text-yellow-400': (task.config as any)?.postMode !== 'draft' && (task.config as any)?.postMode !== 'publish',
              'bg-zinc-700/50 text-zinc-400': (task.config as any)?.postMode === 'draft',
              'bg-green-500/10 text-green-400': (task.config as any)?.postMode === 'publish',
            })}>
              {(task.config as any)?.postMode === 'draft' ? '📝 Черновик' : (task.config as any)?.postMode === 'publish' ? '⚡ Сразу' : '📤 В очередь'}
            </span>
          )}
          {(task.type === 'news_feed' || task.type === 'web_search') && task.schedule && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-700/50 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              🕐 {cronToHuman(task.schedule)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Left: toggle + run */}
          <div className="flex gap-1.5">
            <button onClick={() => onToggle(task.id, !task.enabled)}
              className={cn('px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer', task.enabled ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-zinc-700/50 text-zinc-500 hover:bg-zinc-700')}
              title={task.enabled ? 'Выключить задачу' : 'Включить задачу'}>
              {task.enabled ? '✓ Вкл' : '✗ Выкл'}
            </button>
            {(task.type === 'news_feed' || task.type === 'web_search') && (<>
              <button onClick={async () => {
                setPreviewLoading(true);
                try {
                  const data = await apiFetch(`/tasks/${task.id}/preview`, { method: 'POST' });
                  setPreview(data);
                } catch {} finally { setPreviewLoading(false); }
              }} disabled={previewLoading} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 flex items-center gap-1 transition-colors" title="Показать какие статьи будут обработаны">
                <Eye size={12} /> {previewLoading ? '...' : 'Превью'}
              </button>
              <button onClick={onRun} disabled={isRunning} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 flex items-center gap-1 transition-colors" title={task.type === 'web_search' ? `Поиск по ${(task.config as any)?.queries?.length ?? 0} запросам → создать посты` : 'Загрузить статьи из источников → создать посты'}>
                <Zap size={12} /> {isRunning ? 'Работаю...' : 'Запустить'}
              </button>
            </>)}
          </div>
          {/* Right: edit + move + duplicate + delete */}
          <div className="flex gap-1">
            <button onClick={onEdit} className="p-1.5 rounded-md hover:bg-white/5 transition-colors" title="Редактировать">
              <Pencil size={12} className="text-zinc-500 hover:text-zinc-300" />
            </button>
            <button onClick={onDuplicate} className="p-1.5 rounded-md hover:bg-white/5 transition-colors" title="Дублировать задачу">
              <Copy size={12} className="text-zinc-500 hover:text-zinc-300" />
            </button>
            <button onClick={onDelete} className="p-1.5 rounded-md hover:bg-white/5 transition-colors" title="Удалить задачу">
              <Trash2 size={12} className="text-red-400/60 hover:text-red-400" />
            </button>
          </div>
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
          {runResult.ok !== false && runResult.createdPostIds?.length > 0 && (
            <div className="mt-2 flex items-center gap-3">
              <span className="text-[11px] font-medium text-green-400">Создано {runResult.createdPostIds.length} {runResult.createdPostIds.length === 1 ? 'пост' : 'постов'}</span>
              <Link to="/posts" className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors">
                Открыть в Постах →
              </Link>
            </div>
          )}
          {runResult.ok !== false && (!runResult.createdPostIds || runResult.createdPostIds.length === 0) && runResult.steps?.some((s: any) => s.status === 'ok') && (
            <div className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>Новых постов не создано — все статьи уже обработаны.</div>
          )}
        </div>
      )}

      {/* Sources — only for news_feed */}
      {task.type === 'news_feed' && <div className="ml-5 mt-2">
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
            {sources.map((source: any) => (
                <div key={source.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('px-1.5 py-0.5 rounded font-mono uppercase text-[10px] shrink-0', source.lastError ? 'bg-red-500/15 text-red-400' : source.lastFetchedAt ? 'bg-green-500/10 text-green-400' : 'bg-zinc-700/50')}>{source.type}</span>
                      <span className="shrink-0">{source.name}</span>
                      <span className="font-mono truncate max-w-48 hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{source.url}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {source.lastFetchedAt && (
                        <span className="text-[10px] hidden sm:inline" style={{ color: 'var(--text-muted)' }}>
                          {source.lastError ? '❌' : '✅'} {source.lastFetchCount != null ? `${source.lastFetchCount} новых` : ''} · {timeAgo(source.lastFetchedAt)}
                        </span>
                      )}
                      <button onClick={() => onDeleteSource(source.id)} className="p-0.5 rounded text-red-400/40 hover:text-red-400 hover:bg-red-500/10" title="Удалить источник">
                        <Trash2 size={10} />
                      </button>
                    </div>
                  </div>
                  {source.lastError && (
                    <div className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-400 truncate" title={source.lastError}>
                      Ошибка: {source.lastError}
                    </div>
                  )}
                </div>
              ))}
          </div>
        )}
      </div>}

      {/* Task info hints */}
      {task.type !== 'news_feed' && task.type !== 'web_search' && (
        <div className="ml-5 mt-2 text-[11px] rounded-lg p-2" style={{ background: 'rgba(59,130,246,0.06)', color: 'var(--text-muted)' }}>
          💡 {task.type === 'auto_reply' && 'Авто-ответы работают на всю группу (все топики) в реальном времени.'}
          {task.type === 'welcome' && 'Приветствия работают на всю группу при входе нового участника.'}
          {task.type === 'moderation' && 'Модерация работает в реальном времени на ВСЮ группу (все топики). Достаточно одной задачи модерации на группу.'}
          {' '}Нажмите ✏️ чтобы настроить. Бот перезапустится автоматически.
        </div>
      )}
      {task.type === 'news_feed' && !sources?.length && (
        <div className="ml-5 mt-2 text-[11px] rounded-lg p-2" style={{ background: 'rgba(234,179,8,0.06)', color: 'var(--text-muted)' }}>
          ⚠️ Добавьте хотя бы один источник чтобы задача могла собирать новости.
        </div>
      )}
      {(task.type === 'news_feed' || task.type === 'web_search') && (
        <div className="ml-5 mt-2 text-[11px] rounded-lg p-2 space-y-1" style={{ background: 'rgba(59,130,246,0.06)', color: 'var(--text-muted)' }}>
          {task.type === 'news_feed' ? (
            <div>📰 <b>«Превью»</b> — покажет найденные статьи. <b>«Запустить»</b> — создаст по одному посту на каждую новую статью (макс. {(task.config as any)?.maxPostsPerDay ?? 5} в день).</div>
          ) : (
            <div>🔍 <b>«Превью»</b> — покажет результаты поиска. <b>«Запустить»</b> — создаст по одному посту на каждый запрос ({(task.config as any)?.queries?.filter((q: string) => q.trim()).length ?? 0} {((task.config as any)?.queries?.filter((q: string) => q.trim()).length ?? 0) === 1 ? 'запрос' : 'запросов'} = {(task.config as any)?.queries?.filter((q: string) => q.trim()).length ?? 0} {((task.config as any)?.queries?.filter((q: string) => q.trim()).length ?? 0) === 1 ? 'пост' : 'постов'}).</div>
          )}
          <div style={{ opacity: 0.7 }}>
            {(task.config as any)?.postMode === 'draft' ? '📝 Посты создадутся как черновики — вы проверите каждый вручную.' :
             (task.config as any)?.postMode === 'publish' ? '⚡ Посты опубликуются в Telegram мгновенно.' :
             '📤 Посты встанут в очередь и опубликуются автоматически по интервалу.'}
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {preview && (() => {
        const useAi = (task.config as any)?.useAi !== false;
        const cfg = task.config as any;
        const systemPrompt = cfg?.systemPrompt
          ? `Базовые правила (всегда):\nHTML-форматирование, ссылки на источник, не выдумывать факты.\n\nВаши инструкции:\n${cfg.systemPrompt}`
          : 'Стандартный промпт: краткий информативный пост с HTML-форматированием и ссылкой.';
        const articlesForAi = preview.articles?.slice(0, cfg?.maxResults ?? 3) ?? [];
        return (
        <Modal title={task.type === 'web_search' ? 'Результаты поиска' : 'Найденные статьи'} onClose={() => setPreview(null)}>

          {/* STEP 1: What was found */}
          <div className="mb-4">
            <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              📄 Шаг 1: Что нашлось ({preview.articles?.length ?? 0})
            </div>
            {preview.articles?.length === 0 ? (
              <div className="text-xs rounded-lg p-3 border border-dashed" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                Ничего не найдено. Попробуйте изменить запросы или расширить период поиска.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {preview.articles.map((a: any, i: number) => (
                  <div key={a.id} className="rounded-lg border p-2.5 flex gap-2.5" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                    {a.imageUrl && <img src={a.imageUrl} alt="" className="w-12 h-12 rounded object-cover shrink-0" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />}
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-medium">{a.title}</div>
                      <div className="text-[10px] line-clamp-1" style={{ color: 'var(--text-muted)' }}>{a.summary}</div>
                      {a.url && <div className="text-[9px] truncate" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{a.url}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* STEP 2: What AI will receive */}
          {useAi && preview.articles?.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                🤖 Шаг 2: Что получит AI
              </div>
              <div className="rounded-lg border p-3 text-[10px] space-y-2" style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.15)' }}>
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Промпт:</span>
                  <div className="whitespace-pre-wrap mt-1" style={{ color: 'var(--text-muted)', opacity: 0.8 }}>{systemPrompt}</div>
                </div>
                <div>
                  <span className="font-medium" style={{ color: 'var(--text-muted)' }}>Источники ({articlesForAi.length} из {preview.articles.length}):</span>
                  <div className="mt-1 space-y-1" style={{ color: 'var(--text-muted)', opacity: 0.8 }}>
                    {articlesForAi.map((a: any, i: number) => (
                      <div key={i}>[{i + 1}] {a.title}</div>
                    ))}
                  </div>
                </div>
                <div style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  → AI напишет из этого <b>1 пост</b> для Telegram
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Test result */}
          {useAi && preview.articles?.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                ✨ Шаг 3: Тестовый пост
                {!testAi && <span className="font-normal text-[10px]" style={{ color: 'var(--text-muted)' }}>— нажмите кнопку чтобы сгенерировать</span>}
              </div>
              {testAi?.ok ? (
                <div className="rounded-lg border p-3" style={{ borderColor: 'var(--border)', background: 'rgba(139,92,246,0.05)' }}>
                  <div className="text-[10px] font-medium mb-2 flex items-center justify-between" style={{ color: 'var(--text-muted)' }}>
                    <span>{testAi.model} · {testAi.tokensUsed} токенов · {testAi.post?.length ?? 0} символов</span>
                  </div>
                  <div className="flex gap-3 max-h-80 overflow-y-auto">
                    {testAi.article?.imageUrl && (
                      <img src={testAi.article.imageUrl} alt="" className="w-20 h-20 rounded object-cover shrink-0" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                    )}
                    <div className="text-xs" dangerouslySetInnerHTML={{ __html: testAi.post }} />
                  </div>
                </div>
              ) : testAi?.error ? (
                <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">{testAi.error}</div>
              ) : (
                <div className="text-[11px] rounded-lg p-3 border border-dashed flex items-center justify-center" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                  Нажмите «Тест» чтобы увидеть как будет выглядеть пост
                </div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-3 justify-end pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
            <button onClick={() => { setPreview(null); setTestAi(null); }} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Закрыть</button>
            {useAi && preview.articles?.length > 0 && (
              <button onClick={async () => {
                setTestAiLoading(true); setTestAi(null);
                try {
                  const res = await apiFetch(`/tasks/${task.id}/test-ai`, {
                    method: 'POST',
                    body: JSON.stringify({ articles: preview.articles?.slice(0, cfg?.maxResults ?? 3) }),
                  });
                  setTestAi(res);
                } catch (e) { setTestAi({ error: (e as Error).message }); }
                setTestAiLoading(false);
              }} disabled={testAiLoading} className="px-4 py-2 rounded-lg text-sm font-medium bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 flex items-center gap-1.5" title="Сгенерировать один тестовый пост из найденных источников — не сохраняется">
                <Sparkles size={14} /> {testAiLoading ? 'Генерирую...' : testAi?.ok ? 'Сгенерировать ещё раз' : 'Тест — сгенерировать пост'}
              </button>
            )}
            <button onClick={() => { setPreview(null); setTestAi(null); onRun(); }} className="px-4 py-2 rounded-lg text-sm font-medium text-white flex items-center gap-1.5" style={{ background: 'var(--primary)' }} title={`Создать посты для всех ${task.type === 'web_search' ? 'запросов' : 'статей'}`}>
              <Zap size={14} /> Запустить
            </button>
          </div>
        </Modal>
        );
      })()}
    </div>
  );
}

// ── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md p-6 rounded-2xl border max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}
