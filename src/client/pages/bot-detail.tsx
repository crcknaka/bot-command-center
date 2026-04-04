import React, { useState, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRightLeft, Plus, Play, Square, Hash, Settings2, Trash2, Zap, RefreshCw, Pencil, Copy, Send } from 'lucide-react';
import { useConfirm } from '../components/ui/confirm-dialog.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { safeHtml } from '../lib/sanitize.js';
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

  const addSourceMut = useMutation({
    mutationFn: ({ taskId, ...data }: { taskId: number; name: string; type: string; url: string }) =>
      apiFetch(`/tasks/${taskId}/sources`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['sources'] }); setShowAddSource(null); setSourceForm({ name: '', type: 'rss', url: '' }); },
  });

  const [fetchResult, setFetchResult] = useState<Record<number, { ok: boolean; msg: string }>>({});

  const fetchSourceMut = useMutation({
    mutationFn: (sourceId: number) => apiFetch(`/sources/${sourceId}/fetch`, { method: 'POST' }),
    onSuccess: (data, sourceId) => {
      let msg = `Источник работает. ${data.totalArticles} статей в фиде.`;
      if (data.filterInfo) {
        const fi = data.filterInfo;
        msg += fi.matched > 0
          ? ` Фильтр: ${fi.matched} из ${fi.total} подходят (${fi.keywords.join(', ')})`
          : ` Фильтр: 0 из ${fi.total} подходят (${fi.keywords.join(', ')})`;
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

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>;
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

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/" className="p-2 rounded-lg hover:bg-white/5"><ArrowLeft size={18} /></Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{bot.name}</h1>
            {bot.username && <span className="text-sm" style={{ color: 'var(--text-muted)' }}>@{bot.username}</span>}
            <span className={cn('w-2.5 h-2.5 rounded-full', bot.status === 'active' ? 'bg-green-500' : bot.status === 'error' ? 'bg-red-500' : 'bg-zinc-500')} />
            <span className={cn('text-xs', bot.status === 'active' ? 'text-green-400' : bot.status === 'error' ? 'text-red-400' : 'text-zinc-500')}>
              {{ active: 'Работает', stopped: 'Остановлен', error: 'Ошибка' }[bot.status as string] ?? bot.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {bot.status === 'active' && (
            <button onClick={() => confirm({ title: 'Остановить бота?', message: 'Все задачи перестанут работать до следующего запуска.', confirmLabel: 'Остановить', variant: 'warning', onConfirm: () => botAction.mutate({ id: botId, action: 'stop' }) })} disabled={botAction.isPending} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-red-500/15 text-red-400 hover:bg-red-500/25">
              <Square size={16} /> {botAction.isPending ? '...' : 'Остановить'}
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
                allChannels={bot.channels}
                onAddTask={(type?: string) => setShowAddTask({ channelId: channel.id, channelType: type || channel.type })}
                onDeleteChannel={() => confirm({ title: 'Удалить канал?', message: `Канал "${channel.title}" и все его задачи будут удалены.`, onConfirm: () => deleteChannelMut.mutate(channel.id) })}
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
            ))}
          </div>
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
            if (taskType === 'web_search') config = { queries: (taskConfig.queries ?? []).filter((q: string) => q.trim()), useAi: taskConfig.useAi, systemPrompt: taskConfig.useAi ? (taskConfig.systemPrompt || undefined) : undefined, rawTemplate: taskConfig.useAi ? undefined : taskConfig.rawTemplate, autoApprove: taskConfig.autoApprove, maxResults: taskConfig.maxResults, timeRange: taskConfig.timeRange };
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

            {/* Schedule (only for news_feed) */}
            {taskType === 'news_feed' && <SchedulePicker value={taskSchedule} onChange={setTaskSchedule} />}

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
              <WebSearchConfigUI config={taskConfig} onChange={(c: any) => setTaskConfig({ ...taskConfig, ...c })} />
            )}

            {/* Hint per task type */}
            <div className="rounded-lg p-3 mb-4 text-xs" style={{ background: 'rgba(59,130,246,0.08)', color: 'var(--text-muted)' }}>
              {taskType === 'news_feed' && taskConfig.useAi && <>💡 Добавьте источники → «Запустить сейчас». AI переработает новости в уникальные посты.</>}
              {taskType === 'news_feed' && !taskConfig.useAi && <>💡 Добавьте источники. Бот подставит данные в шаблон — без AI, бесплатно.</>}
              {taskType === 'web_search' && <>💡 Задайте поисковые запросы. Бот найдёт свежие статьи в интернете и создаст посты.</>}
              {taskType === 'auto_reply' && <>💡 Настройте правила. Бот перезапустится автоматически при сохранении.</>}
              {taskType === 'welcome' && <>💡 Задайте текст приветствия. Бот перезапустится автоматически.</>}
              {taskType === 'moderation' && <>💡 Задайте настройки модерации. Бот перезапустится автоматически.</>}
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
        {rules.map((rule: any, i: number) => (
          <div key={i} className="rounded-lg border p-3 space-y-2" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="flex gap-2 items-start">
              <div className="flex-1">
                <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Ключевое слово / паттерн</label>
                <input value={rule.pattern} onChange={(e) => updateRule(i, { pattern: e.target.value })}
                  placeholder="цена, /start, привет"
                  className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              </div>
              <button type="button" onClick={() => removeRule(i)} className="mt-4 p-1 text-red-400/50 hover:text-red-400"><Trash2 size={14} /></button>
            </div>
            <div>
              <label className="block text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Ответ бота (HTML)</label>
              <textarea value={rule.response} onChange={(e) => updateRule(i, { response: e.target.value })} onKeyDown={ctrlEnter}
                placeholder="Привет, {user}! Ctrl+Enter — сохранить"
                rows={2} className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            </div>
            <div className="flex gap-3 flex-wrap">
              <label className="text-[11px] flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={rule.exactMatch ?? false} onChange={(e) => updateRule(i, { exactMatch: e.target.checked })} />
                Точное слово
                <InfoTip text="Совпадает только целое слово, а не подстрока. 'да' не поймает 'давай'." position="top" />
              </label>
              <label className="text-[11px] flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={rule.isRegex ?? false} onChange={(e) => updateRule(i, { isRegex: e.target.checked })} />
                Regex
                <InfoTip text="Регулярное выражение. Например: ^/help$ или (цена|стоимость|прайс)" position="top" />
              </label>
              <label className="text-[11px] flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={rule.replyInDm ?? false} onChange={(e) => updateRule(i, { replyInDm: e.target.checked })} />
                Ответить в ЛС
                <InfoTip text="Бот ответит в ЛС юзеру. Важно: юзер должен хотя бы раз написать боту /start в личку, иначе Telegram не разрешит отправить." position="top" />
              </label>
            </div>
          </div>
        ))}
      </div>

      <button type="button" onClick={() => onChangeRules([...rules, { pattern: '', response: '' }])}
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

function WebSearchConfigUI({ config, onChange }: { config: any; onChange: (patch: any) => void }) {
  const [newQ, setNewQ] = useState('');
  const queries: string[] = config.queries ?? [];
  const { data: searchProviders } = useQuery({ queryKey: ['search-providers'], queryFn: () => apiFetch('/search-providers') });

  return (
    <div className="mb-4 space-y-4">
      {/* Search provider status */}
      {!searchProviders?.length && (
        <div className="rounded-lg p-3 text-xs bg-yellow-500/10 text-yellow-400">
          ⚠️ Поисковый провайдер не подключён. Перейдите в <b>Настройки → Поиск</b> и добавьте Tavily, Serper или другой.
        </div>
      )}

      {/* Queries */}
      <div>
        <label className="block text-sm font-medium mb-1">Поисковые запросы</label>
        <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
          Бот будет искать статьи в интернете по этим запросам. Чем конкретнее запрос — тем точнее результат.
        </p>
        <div className="flex gap-2 mb-2">
          <input value={newQ} onChange={(e) => setNewQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (newQ.trim()) { onChange({ queries: [...queries, newQ.trim()] }); setNewQ(''); } } }}
            placeholder="Например: electric unicycle news 2026"
            className="flex-1 px-2 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          <button type="button" onClick={() => { if (newQ.trim()) { onChange({ queries: [...queries, newQ.trim()] }); setNewQ(''); } }}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 shrink-0">
            Добавить
          </button>
        </div>
        {queries.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {queries.map((q: string, i: number) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500/10 text-blue-400 flex items-center gap-1">
                🔍 {q}
                <button type="button" onClick={() => onChange({ queries: queries.filter((_: string, j: number) => j !== i) })} className="hover:text-blue-300">×</button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* AI mode */}
      <div>
        <label className="block text-sm font-medium mb-2">Как делать пост из результатов?</label>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onChange({ useAi: true })}
            className={cn('p-3 rounded-xl border text-left text-xs transition-colors', (config.useAi !== false) ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
            style={{ borderColor: (config.useAi !== false) ? undefined : 'var(--border)' }}>
            <div className="font-medium mb-1">🤖 С AI</div>
            <div style={{ color: 'var(--text-muted)' }}>AI напишет уникальный пост на основе найденных статей. Нужен AI-провайдер.</div>
          </button>
          <button type="button" onClick={() => onChange({ useAi: false })}
            className={cn('p-3 rounded-xl border text-left text-xs transition-colors', config.useAi === false ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
            style={{ borderColor: config.useAi === false ? undefined : 'var(--border)' }}>
            <div className="font-medium mb-1">📋 Без AI</div>
            <div style={{ color: 'var(--text-muted)' }}>Заголовок + текст + ссылка из шаблона. Бесплатно, без AI.</div>
          </button>
        </div>
      </div>

      {/* Time range */}
      <div className="flex items-center gap-2 text-xs">
        <span style={{ color: 'var(--text-muted)' }}>Искать за:</span>
        <select value={config.timeRange ?? 'day'} onChange={(e) => onChange({ timeRange: e.target.value })}
          className="px-2 py-1 rounded-lg border text-xs" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
          <option value="day">Последний день</option>
          <option value="week">Неделю</option>
          <option value="month">Месяц</option>
        </select>
        <span style={{ color: 'var(--text-muted)' }}>Макс. результатов:</span>
        <input type="number" min={1} max={10} value={config.maxResults ?? 3} onChange={(e) => onChange({ maxResults: Number(e.target.value) })}
          className="w-14 px-2 py-1 rounded-lg border text-xs text-center" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
      </div>

      {/* Auto-approve */}
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={config.autoApprove ?? false} onChange={(e) => onChange({ autoApprove: e.target.checked })} />
        Авто-одобрение (сразу в очередь, без ручной проверки)
      </label>
    </div>
  );
}

// ─── Moderation Config UI (shared between create and edit) ───────────────────

function ModerationConfigUI({ config, onChange }: { config: any; onChange: (patch: any) => void }) {
  const set = (patch: any) => onChange(patch);

  return (
    <div className="mb-4 space-y-3">
      {/* Banned words */}
      <div>
        <label className="block text-sm font-medium mb-1">Запрещённые слова</label>
        <BannedWordsInput words={config.bannedWords ?? []} onChange={(w: string[]) => set({ bannedWords: w })} />
        <WarnConfig label="запрещённые слова" warnKey="bannedWords" value={config.bannedWordsWarn} onChange={(v) => set({ bannedWordsWarn: v })} />
      </div>

      {/* Additional protection */}
      <div className="pt-2 mt-2 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
        <div className="text-xs font-medium">Дополнительная защита</div>

        {/* Block links */}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={config.blockLinks ?? false} onChange={(e) => set({ blockLinks: e.target.checked })} />
          Запретить ссылки
          <InfoTip text="Удаляет сообщения со ссылками (http, t.me, @упоминания каналов)." position="right" />
        </label>
        {config.blockLinks && (
          <WarnConfig label="ссылки" warnKey="links" value={config.linksWarn} onChange={(v) => set({ linksWarn: v })} />
        )}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={config.antiFlood ?? false} onChange={(e) => set({ antiFlood: e.target.checked })} />
          Анти-флуд
          <InfoTip text="Если юзер отправляет слишком много сообщений подряд — бот удаляет и предупреждает." position="right" />
        </label>
        {config.antiFlood && (
          <div className="ml-5 space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: 'var(--text-muted)' }}>Макс.</span>
              <input type="number" min={1} max={30} value={config.maxMessagesPerMinute ?? 5} onChange={(e) => set({ maxMessagesPerMinute: Number(e.target.value) })}
                className="w-14 px-2 py-1 rounded-lg border text-xs text-center" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <span style={{ color: 'var(--text-muted)' }}>сообщений в минуту</span>
            </div>
            <WarnConfig label="флуд" warnKey="flood" value={config.floodWarn} onChange={(v) => set({ floodWarn: v })} />
          </div>
        )}

        {/* Block forwards */}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={config.blockForwards ?? false} onChange={(e) => set({ blockForwards: e.target.checked })} />
          Блокировать пересланные сообщения
          <InfoTip text="Удаляет все пересланные (forward) сообщения." position="right" />
        </label>
        {config.blockForwards && (
          <WarnConfig label="пересылки" warnKey="forwards" value={config.forwardsWarn} onChange={(v) => set({ forwardsWarn: v })} />
        )}

        {/* Block stickers */}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={config.blockStickers ?? false} onChange={(e) => set({ blockStickers: e.target.checked })} />
          Блокировать стикеры и GIF
          <InfoTip text="Удаляет стикеры и GIF-анимации." position="right" />
        </label>
        {config.blockStickers && (
          <WarnConfig label="стикеры" warnKey="stickers" value={config.stickersWarn} onChange={(v) => set({ stickersWarn: v })} />
        )}

        {/* Block voice */}
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={config.blockVoice ?? false} onChange={(e) => set({ blockVoice: e.target.checked })} />
          Блокировать голосовые и видео-кружки
          <InfoTip text="Удаляет голосовые сообщения и видео-заметки." position="right" />
        </label>
        {config.blockVoice && (
          <WarnConfig label="голосовые" warnKey="voice" value={config.voiceWarn} onChange={(v) => set({ voiceWarn: v })} />
        )}

        {/* Min message length */}
        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>Мин. длина сообщения:</span>
          <input type="number" min={0} max={100} value={config.minMessageLength ?? 0} onChange={(e) => set({ minMessageLength: Number(e.target.value) })}
            className="w-14 px-2 py-1 rounded-lg border text-xs text-center" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>символов (0 = выкл)</span>
          <InfoTip text="Сообщения короче этой длины удаляются." position="right" />
        </div>
        {(config.minMessageLength ?? 0) > 0 && (
          <WarnConfig label="короткие сообщения" warnKey="shortMsg" value={config.shortMsgWarn} onChange={(v) => set({ shortMsgWarn: v })} />
        )}

        {/* Mute */}
        <label className="flex items-center gap-2 text-xs mt-2">
          <input type="checkbox" checked={config.muteOnViolation ?? false} onChange={(e) => set({ muteOnViolation: e.target.checked })} />
          Мут за нарушения (запрещённые слова, флуд)
          <InfoTip text="Юзер не сможет писать N минут. Бот должен быть админом." position="right" />
        </label>
        {config.muteOnViolation && (
          <div className="ml-5 flex items-center gap-2 text-xs">
            <span style={{ color: 'var(--text-muted)' }}>Длительность:</span>
            <input type="number" min={1} max={1440} value={config.muteDurationMinutes ?? 5} onChange={(e) => set({ muteDurationMinutes: Number(e.target.value) })}
              className="w-16 px-2 py-1 rounded-lg border text-xs text-center" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>минут</span>
          </div>
        )}
      </div>

      {/* Warn auto-delete */}
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
        {'{user}'} — кликабельное имя нарушителя. Несколько вариантов текста — рандомный выбор.
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

function EditTaskModal({ task, onSave, onClose, isPending }: {
  task: any; onSave: (data: any) => void; onClose: () => void; isPending: boolean;
}) {
  const config = task.config ?? {};
  const defaultName = { news_feed: '📰 Новостная лента', web_search: '🔍 Мониторинг тем', auto_reply: '🤖 Авто-ответы', welcome: '👋 Приветствие', moderation: '🛡️ Модерация' }[task.type as string] ?? task.type;
  const [name, setName] = useState(task.name || defaultName);
  const [schedule, setSchedule] = useState(task.schedule ?? '');
  const [enabled, setEnabled] = useState(task.enabled ?? true);
  const [useAi, setUseAi] = useState(config.useAi !== false);
  const [taskPrompt, setTaskPrompt] = useState(config.systemPrompt ?? '');
  const [rawTemplate, setRawTemplate] = useState(config.rawTemplate ?? '<b>{title}</b>\n\n{summary}\n\n<a href="{url}">Читать далее</a>');
  const [autoApprove, setAutoApprove] = useState(config.autoApprove ?? false);
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
  const [modConfig, setModConfig] = useState<Record<string, any>>({
    bannedWords: config.bannedWords ?? [],
    bannedWordsWarn: config.bannedWordsWarn,
    maxLinksPerMessage: config.maxLinksPerMessage ?? 0,
    linksWarn: config.linksWarn,
    antiFlood: config.antiFlood ?? false,
    maxMessagesPerMinute: config.maxMessagesPerMinute ?? 5,
    floodWarn: config.floodWarn,
    blockForwards: config.blockForwards ?? false,
    forwardsWarn: config.forwardsWarn,
    blockStickers: config.blockStickers ?? false,
    stickersWarn: config.stickersWarn,
    blockVoice: config.blockVoice ?? false,
    voiceWarn: config.voiceWarn,
    minMessageLength: config.minMessageLength ?? 0,
    shortMsgWarn: config.shortMsgWarn,
    muteOnViolation: config.muteOnViolation ?? false,
    muteDurationMinutes: config.muteDurationMinutes ?? 5,
  });
  // Web search
  const [webSearchConfig, setWebSearchConfig] = useState<Record<string, any>>({
    queries: config.queries ?? [],
    useAi: config.useAi ?? true,
    systemPrompt: config.systemPrompt,
    rawTemplate: config.rawTemplate,
    autoApprove: config.autoApprove ?? false,
    maxResults: config.maxResults ?? 3,
    timeRange: config.timeRange ?? 'day',
  });

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
          <WebSearchConfigUI config={webSearchConfig} onChange={(patch: any) => setWebSearchConfig((prev: any) => ({ ...prev, ...patch }))} />
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
              if (task.type === 'news_feed') cfg = { ...config, useAi, systemPrompt: useAi ? (taskPrompt || undefined) : undefined, rawTemplate: useAi ? undefined : rawTemplate, autoApprove, filterKeywords: filterKeywords.length ? filterKeywords : undefined, maxAgeDays };
              if (task.type === 'auto_reply') cfg = { rules: rules.filter(r => r.pattern), cooldownSeconds: cooldownSec };
              if (task.type === 'welcome') cfg = { welcomeText, deleteAfterSeconds: deleteAfterSec, imageUrl: welcomeImageUrl || undefined, buttons: welcomeButtons.filter(b => b.text && b.url), farewellText: farewellText || undefined, farewellImageUrl: farewellImageUrl || undefined };
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
    { name: 'r/ElectricUnicycle', url: 'ElectricUnicycle', type: 'reddit', desc: 'Главный Reddit про EUC: обзоры, вопросы, видео поездок' },
    { name: 'EUC World Blog', url: 'https://euc.world/blog/feed', type: 'rss', desc: 'Блог EUC World — приложение для моноколёс. Обзоры, обновления' },
    { name: 'GN: Electric Unicycle', url: 'https://news.google.com/rss/search?q=electric+unicycle&hl=en', type: 'rss', desc: 'Google News: все новости про electric unicycle на английском' },
    { name: 'GN: Моноколесо', url: 'https://news.google.com/rss/search?q=%D0%BC%D0%BE%D0%BD%D0%BE%D0%BA%D0%BE%D0%BB%D0%B5%D1%81%D0%BE&hl=ru', type: 'rss', desc: 'Google News: моноколесо на русском языке' },
    { name: 'GN: EUC review', url: 'https://news.google.com/rss/search?q=EUC+review+electric+unicycle&hl=en', type: 'rss', desc: 'Google News: обзоры EUC на английском' },
    { name: 'GN: Begode Inmotion', url: 'https://news.google.com/rss/search?q=begode+OR+inmotion+OR+leaperkim+OR+kingsong+unicycle&hl=en', type: 'rss', desc: 'Google News: бренды моноколёс — Begode, Inmotion, Leaperkim, KingSong' },
    { name: 'r/onewheel', url: 'onewheel', type: 'reddit', desc: 'Onewheel: трюки, маршруты, модификации' },
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

function ChannelCard({ channel, botId, allChannels, onAddTask, onDeleteChannel, onEditTask, onToggleTask, onRunTask, onDeleteTask, onAddSource, onFetchSource, onDeleteSource, runningTaskId, fetchingSourceId, taskRunResults, fetchResults }: any) {
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

  const moveTaskMut = useMutation({
    mutationFn: ({ taskId, channelId }: { taskId: number; channelId: number }) =>
      apiFetch(`/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify({ channelId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bot', botId] }); qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });

  const otherChannels = (allChannels ?? []).filter((ch: any) => ch.id !== channel.id);

  const [showSend, setShowSend] = useState(false);
  const [sendText, setSendText] = useState('');
  const [sendImage, setSendImage] = useState('');
  const sendMut = useMutation({
    mutationFn: (data: { channelId: number; text: string; imageUrl?: string }) =>
      apiFetch(`/bots/${botId}/send`, { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { setShowSend(false); setSendText(''); setSendImage(''); },
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
          {channel.threadId && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400">
              # {channel.threadTitle || `топик ${channel.threadId}`}
            </span>
          )}
          <span className="text-[11px] font-mono hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{channel.chatId}</span>
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
                onMove={otherChannels.length > 0 ? (chId: number) => moveTaskMut.mutate({ taskId: task.id, channelId: chId }) : undefined}
                otherChannels={otherChannels}
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

function TaskCard({ task, onEdit, onRun, onToggle, onDelete, onDuplicate, onMove, otherChannels, onAddSource, onFetchSource, onDeleteSource, fetchResults, isRunning, fetchingSourceId, runResult }: any) {
  const [showMove, setShowMove] = useState(false);
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
            {task.name || { news_feed: '📰 Новостная лента', web_search: '🔍 Мониторинг тем', auto_reply: '🤖 Авто-ответы', welcome: '👋 Приветствие', moderation: '🛡️ Модерация' }[task.type as string] || task.type}
          </span>
          {task.type === 'news_feed' && (
            <span className={cn('text-[10px] px-1.5 py-0.5 rounded', (task.config as any)?.useAi === false ? 'bg-zinc-700/50 text-zinc-400' : 'bg-purple-500/10 text-purple-400')}>
              {(task.config as any)?.useAi === false ? '📋 Без AI' : '🤖 AI'}
            </span>
          )}
          {(task.type === 'news_feed' || task.type === 'web_search') && task.schedule && (
            <span className="text-[11px] px-1.5 py-0.5 rounded bg-zinc-700/50 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
              🕐 {cronToHuman(task.schedule)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {/* Left: toggle + run */}
          <div className="flex gap-1.5">
            <button onClick={() => onToggle(task.id, !task.enabled)}
              className={cn('px-2.5 py-1 rounded-md text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer', task.enabled ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-zinc-700/50 text-zinc-500 hover:bg-zinc-700')}
              title={task.enabled ? 'Выключить задачу' : 'Включить задачу'}>
              {task.enabled ? '✓ Вкл' : '✗ Выкл'}
            </button>
            {(task.type === 'news_feed' || task.type === 'web_search') && (
              <button onClick={onRun} disabled={isRunning} className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-green-500/15 text-green-400 hover:bg-green-500/25 flex items-center gap-1 transition-colors" title="Запустить один раз для теста">
                <Zap size={12} /> {isRunning ? 'Работаю...' : 'Запустить'}
              </button>
            )}
          </div>
          {/* Right: edit + move + duplicate + delete */}
          <div className="flex gap-1">
            <button onClick={onEdit} className="p-1.5 rounded-md hover:bg-white/5 transition-colors" title="Редактировать">
              <Pencil size={12} className="text-zinc-500 hover:text-zinc-300" />
            </button>
            {onMove && otherChannels?.length > 0 && (
              <div className="relative">
                <button onClick={() => setShowMove(!showMove)} className="p-1.5 rounded-md hover:bg-white/5 transition-colors" title="Переместить в другой канал">
                  <ArrowRightLeft size={12} className="text-zinc-500 hover:text-zinc-300" />
                </button>
                {showMove && (
                  <div className="absolute right-0 top-8 z-50 rounded-lg border p-1 min-w-48 shadow-xl" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                    <div className="text-[10px] px-2 py-1 font-medium" style={{ color: 'var(--text-muted)' }}>Переместить в:</div>
                    {otherChannels.map((ch: any) => (
                      <button key={ch.id} onClick={() => { onMove(ch.id); setShowMove(false); }}
                        className="w-full text-left px-2 py-1.5 rounded text-[11px] hover:bg-white/5 transition-colors flex items-center gap-2">
                        <span>{ch.type === 'channel' ? '📢' : '👥'}</span>
                        <span className="truncate">{ch.title}</span>
                        {ch.threadId && <span className="text-[9px] text-cyan-400">#{ch.threadTitle || ch.threadId}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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
          {runResult.ok !== false && runResult.steps?.some((s: any) => s.status === 'ok' && s.action.startsWith('Генерация')) && (
            <Link to="/posts?status=draft" className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-blue-400 hover:text-blue-300 transition-colors">
              Перейти к постам →
            </Link>
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
            {sources.map((source: any) => {
              const fr = fetchResults?.[source.id];
              return (
                <div key={source.id} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cn('px-1.5 py-0.5 rounded font-mono uppercase text-[10px] shrink-0', source.lastError ? 'bg-red-500/15 text-red-400' : source.lastFetchedAt ? 'bg-green-500/10 text-green-400' : 'bg-zinc-700/50')}>{source.type}</span>
                      <span className="shrink-0">{source.name}</span>
                      <span className="font-mono truncate max-w-48 hidden sm:inline" style={{ color: 'var(--text-muted)' }}>{source.url}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {source.lastFetchedAt && (
                        <span className="text-[10px] hidden sm:inline" style={{ color: 'var(--text-muted)' }} title={source.lastFetchedAt}>
                          {source.lastError ? '❌' : '✅'} {source.lastFetchCount != null ? `${source.lastFetchCount} новых` : ''} · {timeAgo(source.lastFetchedAt)}
                        </span>
                      )}
                      <button onClick={() => onFetchSource(source.id)} disabled={fetchingSourceId === source.id} className="px-2 py-0.5 rounded text-blue-400 hover:bg-blue-500/15 flex items-center gap-1">
                        <RefreshCw size={10} className={fetchingSourceId === source.id ? 'animate-spin' : ''} />
                        {fetchingSourceId === source.id ? '...' : 'Проверить'}
                      </button>
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
      </div>}

      {/* Event-driven tasks info */}
      {task.type !== 'news_feed' && (
        <div className="ml-5 mt-2 text-[11px] rounded-lg p-2" style={{ background: 'rgba(59,130,246,0.06)', color: 'var(--text-muted)' }}>
          💡 {task.type === 'auto_reply' && 'Авто-ответы работают в реальном времени. Бот отвечает при получении сообщения.'}
          {task.type === 'welcome' && 'Приветствия отправляются автоматически при входе нового участника.'}
          {task.type === 'moderation' && 'Модерация работает в реальном времени. Запрещённые сообщения удаляются сразу.'}
          {' '}Нажмите ✏️ чтобы настроить. Бот перезапустится автоматически.
        </div>
      )}
    </div>
  );
}

// ── Modal wrapper ────────────────────────────────────────────────────────────

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="w-full max-w-md p-6 rounded-2xl border max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}
