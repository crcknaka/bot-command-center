import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Settings2, Trash2, Zap, Pencil, Copy, Send, Eye, BarChart3, Users, GripVertical, Sparkles } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { apiFetch } from '../../lib/api.js';
import { cn, timeAgo } from '../../lib/utils.js';
import { ctrlEnter, Modal, cronToHuman } from './shared.js';

export function ChannelCard({ channel, botId, allChannels, isTopic, onAddTask, onDeleteChannel, onEditTask, onToggleTask, onRunTask, onDeleteTask, onAddSource, onFetchSource, onDeleteSource, runningTaskId, fetchingSourceId, taskRunResults, fetchResults }: any) {
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
                onRun={() => onRunTask(task)}
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

export function TaskCard({ task, onEdit, onRun, onToggle, onDelete, onDuplicate, onAddSource, onFetchSource, onDeleteSource, fetchResults, isRunning, fetchingSourceId, runResult }: any) {
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
