import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const ctrlEnter = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    const form = (e.target as HTMLElement).closest('form');
    if (form) { form.requestSubmit(); return; }
    const modal = (e.target as HTMLElement).closest('[class*="rounded-2xl"]');
    const btn = modal?.querySelector('button[class*="text-white"]') as HTMLButtonElement | null;
    if (btn && !btn.disabled) btn.click();
  }
};
import { Send, Trash2, Eye, FileText, Plus, Pencil, Filter, X, Sparkles, CheckSquare, Square, Share2, CheckCircle } from 'lucide-react';
import { usePosts, usePublishPost, useDeletePost, useUpdatePost, useCreatePost, useGeneratePost } from '../hooks/use-posts.js';
import { useToast } from '../components/ui/toast.js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TelegramPreview } from '../components/telegram-preview.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { cn } from '../lib/utils.js';
import { timeAgo } from '../lib/utils.js';
import { apiFetch } from '../lib/api.js';
import { useConfirm } from '../components/ui/confirm-dialog.js';
import { safeHtml } from '../lib/sanitize.js';
import { Link } from 'react-router-dom';

const statusFilters = [
  { value: 'all', label: 'Все' },
  { value: 'draft', label: 'Черновики' },
  { value: 'queued', label: 'В очереди' },
  { value: 'published', label: 'Опубликовано' },
  { value: 'failed', label: 'Ошибки' },
] as const;

const statusBadge: Record<string, { cls: string; label: string }> = {
  draft: { cls: 'bg-zinc-500/15 text-zinc-400', label: 'Черновик' },
  queued: { cls: 'bg-yellow-500/15 text-yellow-400', label: 'В очереди' },
  publishing: { cls: 'bg-blue-500/15 text-blue-400', label: 'Публикуется...' },
  published: { cls: 'bg-green-500/15 text-green-400', label: 'Опубликован' },
  failed: { cls: 'bg-red-500/15 text-red-400', label: 'Ошибка' },
};

export function PostsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [botFilter, setBotFilter] = useState<string>('all');
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [previewPost, setPreviewPost] = useState<any>(null);
  const [editPost, setEditPost] = useState<any>(null);
  const [editContent, setEditContent] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [showAiGen, setShowAiGen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [exportPostId, setExportPostId] = useState<number | null>(null);

  const qc = useQueryClient();
  const toast = useToast();
  const { data: rawPosts, isLoading } = usePosts(statusFilter !== 'all' ? { status: statusFilter } : undefined);
  const { data: bots } = useQuery({ queryKey: ['bots'], queryFn: () => apiFetch('/bots') });
  const publishMut = usePublishPost();
  const deleteMut = useDeletePost();
  const updateMut = useUpdatePost();
  const createMut = useCreatePost();

  const [regenId, setRegenId] = useState<number | null>(null);
  const regenMut = useMutation({
    mutationFn: async (post: any) => {
      const res = await apiFetch('/ai-providers/generate', {
        method: 'POST',
        body: JSON.stringify({
          providerId: post.aiProviderId,
          modelId: post.aiModel || '__default__',
          topic: `Перепиши этот пост другими словами, сохрани смысл и HTML-форматирование:\n\n${post.content}`,
          language: 'Russian',
          maxLength: 2000,
        }),
      });
      await apiFetch(`/posts/${post.id}`, { method: 'PATCH', body: JSON.stringify({ content: res.content }) });
      return res;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posts'] }); setRegenId(null); },
  });

  const [bulkError, setBulkError] = useState('');
  const bulkMut = useMutation({
    mutationFn: (data: { ids: number[]; action: string }) =>
      apiFetch('/posts/bulk', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (data) => { qc.invalidateQueries({ queryKey: ['posts'] }); setSelected(new Set()); if (data.failed > 0) setBulkError(`${data.ok} успешно, ${data.failed} ошибок`); },
    onError: (err) => setBulkError((err as Error).message),
  });

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === posts.length) setSelected(new Set());
    else setSelected(new Set(posts.map((p: any) => p.id)));
  };

  // Build lookups
  const channelMap: Record<number, { botName: string; channelTitle: string; botId: number }> = {};
  const botList: Array<{ id: number; name: string }> = [];
  const channelList: Array<{ id: number; title: string; displayTitle: string; botId: number; botName: string }> = [];

  bots?.forEach((bot: any) => {
    botList.push({ id: bot.id, name: bot.name });
    bot.channels?.forEach?.((ch: any) => {
      const threadLabel = ch.threadId ? ` # ${ch.threadTitle || ch.threadId}` : '';
      const displayTitle = ch.title + threadLabel;
      channelMap[ch.id] = { botName: bot.name, channelTitle: displayTitle, botId: bot.id };
      channelList.push({ id: ch.id, title: ch.title, displayTitle, botId: bot.id, botName: bot.name });
    });
  });

  // Apply client-side filters
  let posts = rawPosts ?? [];
  if (botFilter !== 'all') {
    const botId = Number(botFilter);
    const botChannelIds = channelList.filter((ch) => ch.botId === botId).map((ch) => ch.id);
    posts = posts.filter((p: any) => botChannelIds.includes(p.channelId));
  }
  if (channelFilter !== 'all') {
    posts = posts.filter((p: any) => p.channelId === Number(channelFilter));
  }
  if (searchText.trim()) {
    const q = searchText.toLowerCase();
    posts = posts.filter((p: any) => p.content?.toLowerCase().includes(q));
  }

  const activeFilterCount = [
    botFilter !== 'all',
    channelFilter !== 'all',
    searchText.trim() !== '',
  ].filter(Boolean).length;

  const clearFilters = () => { setBotFilter('all'); setChannelFilter('all'); setSearchText(''); };

  // Channels filtered by bot selection
  const filteredChannels = botFilter !== 'all'
    ? channelList.filter((ch) => ch.botId === Number(botFilter))
    : channelList;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Посты</h1>
          <InfoTip text="Все посты со всех ботов. Используйте фильтры чтобы найти нужные. Черновик → одобрите → автопубликация." position="bottom" />
        </div>
      </div>

      {confirmDialog}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAiGen(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors" title="Ввести тему — AI сгенерирует пост">
            <Sparkles size={16} /> <span className="hidden sm:inline">Создать с</span> AI
          </button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }} title="Написать пост вручную">
            <Plus size={16} /> <span className="hidden sm:inline">Вручную</span>
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="rounded-xl border p-4 mb-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        {/* Row 1: Status tabs */}
        <div className="flex gap-2 mb-3 flex-wrap">
          {statusFilters.map((s) => (
            <button
              key={s.value}
              onClick={() => setStatusFilter(s.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                statusFilter === s.value ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Row 2: Bot, Channel, Search */}
        <div className="flex gap-3 flex-wrap items-center">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-zinc-500" />
          </div>

          <select
            value={botFilter}
            onChange={(e) => { setBotFilter(e.target.value); setChannelFilter('all'); }}
            className="px-3 py-1.5 rounded-lg border text-xs"
            style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
          >
            <option value="all">Все боты</option>
            {botList.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>

          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-xs"
            style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
          >
            <option value="all">Все каналы</option>
            {filteredChannels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {botFilter === 'all' ? `${ch.botName} → ` : ''}{ch.displayTitle}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Поиск по тексту..."
            className="px-3 py-1.5 rounded-lg border text-xs flex-1 min-w-32 outline-none"
            style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
          />

          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors">
              <X size={12} /> Сбросить ({activeFilterCount})
            </button>
          )}
        </div>
      </div>

      {/* Results count + bulk toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {posts.length} {posts.length === 1 ? 'пост' : posts.length < 5 ? 'поста' : 'постов'}
          {activeFilterCount > 0 && <span> (фильтры применены)</span>}
        </div>

        {posts.length > 0 && (
          <button onClick={selectAll} className="text-[11px] text-zinc-500 hover:text-zinc-300 flex items-center gap-1 transition-colors">
            {selected.size === posts.length ? <CheckSquare size={12} /> : <Square size={12} />}
            {selected.size > 0 ? `Выбрано: ${selected.size}` : 'Выбрать все'}
          </button>
        )}
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 px-4 py-2.5 rounded-xl border" style={{ background: 'rgba(59,130,246,0.06)', borderColor: 'var(--border)' }}>
          <span className="text-xs font-medium">Выбрано: {selected.size}</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => confirm({ title: 'Одобрить посты?', message: `${selected.size} постов будут поставлены в очередь.`, confirmLabel: 'Одобрить', variant: 'warning', onConfirm: () => bulkMut.mutate({ ids: [...selected], action: 'approve' }) })}
              disabled={bulkMut.isPending}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-colors"
            >
              Одобрить все
            </button>
            <button
              onClick={() => confirm({ title: 'Опубликовать посты?', message: `${selected.size} постов будут отправлены в Telegram.`, confirmLabel: 'Опубликовать', variant: 'warning', onConfirm: () => bulkMut.mutate({ ids: [...selected], action: 'publish' }) })}
              disabled={bulkMut.isPending}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 flex items-center gap-1 transition-colors"
            >
              <Send size={10} /> Опубликовать все
            </button>
            <button
              onClick={() => confirm({ title: 'Удалить посты?', message: `${selected.size} постов будут удалены безвозвратно.`, onConfirm: () => bulkMut.mutate({ ids: [...selected], action: 'delete' }) })}
              disabled={bulkMut.isPending}
              className="px-3 py-1.5 rounded-lg text-[11px] font-medium text-red-400/70 hover:text-red-400 hover:bg-red-500/10 flex items-center gap-1 transition-colors"
            >
              <Trash2 size={10} /> Удалить все
            </button>
            <button onClick={() => setSelected(new Set())} className="px-2 py-1.5 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-300">
              <X size={12} />
            </button>
          </div>
          {bulkMut.isPending && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Выполняю...</span>}
          {bulkMut.isSuccess && !bulkError && <span className="text-[11px] text-green-400">Готово</span>}
          {bulkError && <span className="text-[11px] text-yellow-400">{bulkError}</span>}
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>Загрузка...</div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <FileText size={40} className="mx-auto mb-3 text-zinc-600" />
          <p className="font-medium mb-1">
            {activeFilterCount > 0 ? 'Ничего не найдено' : 'Пока нет постов'}
          </p>
          <p className="text-xs max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
            {activeFilterCount > 0
              ? 'Попробуйте изменить фильтры или сбросить их.'
              : 'Посты появятся после запуска задачи или создания вручную.'}
          </p>
          <div className="flex gap-2 mt-3 justify-center">
            {activeFilterCount > 0 ? (
              <button onClick={clearFilters} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-400">
                Сбросить фильтры
              </button>
            ) : (
              <>
                <button onClick={() => setShowAiGen(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-500/15 text-purple-400">
                  <Sparkles size={12} className="inline mr-1" /> Создать с AI
                </button>
                <button onClick={() => setShowCreate(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-400">
                  <Plus size={12} className="inline mr-1" /> Вручную
                </button>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post: any) => {
            const badge = statusBadge[post.status] ?? { cls: 'bg-zinc-500/15 text-zinc-400', label: post.status };
            const ctx = channelMap[post.channelId];
            return (
              <div key={post.id} className={cn('rounded-xl p-4 border flex gap-3', selected.has(post.id) && 'border-blue-500/50')} style={{ background: selected.has(post.id) ? 'rgba(59,130,246,0.04)' : 'var(--bg-card)', borderColor: selected.has(post.id) ? undefined : 'var(--border)' }}>
                <button onClick={() => toggleSelect(post.id)} className="shrink-0 mt-0.5">
                  {selected.has(post.id)
                    ? <CheckSquare size={16} className="text-blue-400" />
                    : <Square size={16} className="text-zinc-600 hover:text-zinc-400" />
                  }
                </button>
                <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {ctx && (
                    <Link to={`/bots/${ctx.botId}`} className="text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-colors">
                      {ctx.botName}
                    </Link>
                  )}
                  {ctx && (
                    <span className="text-[11px] px-2 py-0.5 rounded bg-zinc-700/50" style={{ color: 'var(--text-muted)' }}>
                      {ctx.channelTitle}
                    </span>
                  )}
                  <span className={cn('px-2 py-0.5 rounded text-[11px] font-medium', badge.cls)}>{badge.label}</span>
                  {post.taskName && <span className="text-[11px] px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400">{post.taskName}</span>}
                  {post.aiModel && <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400">{post.aiModel}</span>}
                  <span className="text-[11px] ml-auto" style={{ color: 'var(--text-muted)' }}>{timeAgo(post.createdAt)}</span>
                </div>
                {post.errorMessage && (
                  <div className="text-[11px] text-red-400 bg-red-500/10 rounded-lg px-2.5 py-1.5 mb-2">
                    <span className="font-medium">Ошибка:</span> {post.errorMessage}
                  </div>
                )}
                <div className="flex gap-3">
                  {post.imageUrl && (
                    <img src={post.imageUrl} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0" onError={(e) => (e.target as HTMLImageElement).style.display = 'none'} />
                  )}
                  <div className="text-sm line-clamp-3 flex-1" dangerouslySetInnerHTML={safeHtml(post.content)} />
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button onClick={() => setPreviewPost(post)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 flex items-center gap-1 transition-colors">
                    <Eye size={12} /> Превью
                  </button>
                  <div className="relative">
                    <button onClick={() => setExportPostId(exportPostId === post.id ? null : post.id)} className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 flex items-center gap-1 transition-colors" title="Экспортировать текст для другой платформы">
                      <Share2 size={12} /> Экспорт
                    </button>
                    {exportPostId === post.id && (
                      <ExportDropdown content={post.content} onClose={() => setExportPostId(null)} />
                    )}
                  </div>
                  {post.status !== 'published' && (
                    <button onClick={() => { setEditPost(post); setEditContent(post.content); }} className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 flex items-center gap-1 transition-colors">
                      <Pencil size={12} /> Редактировать
                    </button>
                  )}
                  {post.aiProviderId && post.status !== 'published' && (
                    <button onClick={() => { setRegenId(post.id); regenMut.mutate(post); }} disabled={regenMut.isPending && regenId === post.id}
                      className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-purple-400/70 hover:text-purple-400 hover:bg-purple-500/10 flex items-center gap-1 transition-colors">
                      <Sparkles size={12} /> {regenMut.isPending && regenId === post.id ? 'Генерирую...' : 'Перегенерировать'}
                    </button>
                  )}
                  {post.status === 'draft' && (
                    <button onClick={() => updateMut.mutate({ id: post.id, status: 'queued' })} className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 flex items-center gap-1 transition-colors">
                      <CheckCircle size={12} /> Одобрить
                    </button>
                  )}
                  {(post.status === 'queued' || post.status === 'draft') && (
                    <button onClick={() => publishMut.mutate(post.id, { onError: (err) => toast.error(`Публикация: ${(err as Error).message}`), onSuccess: () => toast.success('Опубликовано!') })} disabled={publishMut.isPending} className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 flex items-center gap-1 transition-colors">
                      <Send size={12} /> Опубликовать
                    </button>
                  )}
                  {post.status !== 'published' && (
                    <button onClick={() => confirm({ title: 'Удалить пост?', message: 'Пост будет удалён безвозвратно.', onConfirm: () => deleteMut.mutate(post.id) })} className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-red-400/50 hover:text-red-400 hover:bg-red-500/10 flex items-center gap-1 transition-colors ml-auto">
                      <Trash2 size={12} /> Удалить
                    </button>
                  )}
                </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Modal */}
      {previewPost && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setPreviewPost(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-xs text-center" style={{ color: 'var(--text-muted)' }}>Так пост будет выглядеть в Telegram:</div>
            <TelegramPreview content={previewPost.content} imageUrl={previewPost.imageUrl} />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editPost && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setEditPost(null)}>
          <div className="w-full max-w-lg mx-4 p-6 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Редактировать пост</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>HTML-теги: &lt;b&gt;жирный&lt;/b&gt;, &lt;i&gt;курсив&lt;/i&gt;, &lt;a href="..."&gt;ссылка&lt;/a&gt;</p>
            <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} onKeyDown={ctrlEnter} rows={8} className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            <div className="mt-3 mb-4">
              <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Превью:</div>
              <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(255,255,255,0.03)' }} dangerouslySetInnerHTML={safeHtml(editContent)} />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditPost(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
              <button onClick={() => { updateMut.mutate({ id: editPost.id, content: editContent }); setEditPost(null); }} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>Сохранить</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreatePostModal
          channels={channelList.map((ch) => ({ id: ch.id, title: ch.displayTitle, botName: ch.botName }))}
          onClose={() => setShowCreate(false)}
          onCreate={(data) => { createMut.mutate(data); setShowCreate(false); }}
          isPending={createMut.isPending}
        />
      )}

      {showAiGen && (
        <AiGenerateModal
          channels={channelList.map((ch) => ({ id: ch.id, title: ch.displayTitle, botName: ch.botName }))}
          onClose={() => setShowAiGen(false)}
          onSave={(channelId, content) => { createMut.mutate({ channelId, content, status: 'draft' }); setShowAiGen(false); }}
        />
      )}
    </div>
  );
}

function CreatePostModal({ channels, onClose, onCreate, isPending }: {
  channels: Array<{ id: number; title: string; botName: string }>;
  onClose: () => void;
  onCreate: (data: { channelId: number; content: string; status: string }) => void;
  isPending: boolean;
}) {
  const [channelId, setChannelId] = useState<string>(channels[0]?.id?.toString() ?? '');
  const [content, setContent] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="w-full max-w-lg mx-4 p-6 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1">Создать пост вручную</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Выберите канал и напишите текст поста.</p>
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Канал</label>
          {channels.length === 0 ? (
            <p className="text-xs text-red-400">Нет каналов. Сначала добавьте канал к боту.</p>
          ) : (
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
              {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.botName} → {ch.title}</option>)}
            </select>
          )}
        </div>
        <div className="mb-3">
          <label className="block text-sm font-medium mb-1">Текст поста</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} onKeyDown={ctrlEnter} rows={6} placeholder="<b>Заголовок</b>\nТекст поста... Ctrl+Enter — сохранить" className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
        </div>
        {content && (
          <div className="mb-4">
            <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Превью:</div>
            <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(255,255,255,0.03)' }} dangerouslySetInnerHTML={safeHtml(content)} />
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
          <button onClick={() => onCreate({ channelId: Number(channelId), content, status: 'draft' })} disabled={isPending || !content || !channelId} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
            {isPending ? 'Создаю...' : 'Создать черновик'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AiGenerateModal({ channels, onClose, onSave }: {
  channels: Array<{ id: number; title: string; botName: string }>;
  onClose: () => void;
  onSave: (channelId: number, content: string) => void;
}) {
  const [channelId, setChannelId] = useState<string>(channels[0]?.id?.toString() ?? '');
  const [topic, setTopic] = useState('');
  const [language, setLanguage] = useState('Russian');
  const [generated, setGenerated] = useState('');
  const { data: providers } = useQuery({ queryKey: ['ai-providers'], queryFn: () => apiFetch('/ai-providers') });
  const generateMut = useGeneratePost();

  const handleGenerate = () => {
    if (!providers?.length) return;
    const provider = providers.find((p: any) => p.isDefault) ?? providers[0];
    generateMut.mutate(
      { providerId: provider.id, modelId: '__default__', topic, language, useSearch: false },
      { onSuccess: (data) => setGenerated(data.content) }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="w-full max-w-lg mx-4 p-6 rounded-2xl border max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><Sparkles size={18} className="text-purple-400" /> Создать пост с AI</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Введите тему — AI сгенерирует пост. Без источников, просто по теме.</p>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Канал</label>
            {channels.length === 0 ? (
              <p className="text-xs text-red-400">Нет каналов. Сначала добавьте канал к боту.</p>
            ) : (
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.botName} → {ch.title}</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Тема поста</label>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Например: Новые электроколёса 2026 года" className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Язык</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
              <option value="Russian">Русский</option>
              <option value="English">English</option>
              <option value="Ukrainian">Українська</option>
            </select>
          </div>

          {!providers?.length && (
            <div className="text-xs text-yellow-400 bg-yellow-500/10 rounded-lg p-2">
              Нет AI-провайдеров. Добавьте в Настройки → AI-модели.
            </div>
          )}

          <button onClick={handleGenerate} disabled={generateMut.isPending || !topic || !providers?.length} className="w-full py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors bg-purple-500/15 text-purple-400 hover:bg-purple-500/25">
            <Sparkles size={14} /> {generateMut.isPending ? 'Генерирую...' : 'Сгенерировать'}
          </button>

          {generateMut.isError && (
            <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2">
              {(generateMut.error as Error).message}
            </div>
          )}

          {generated && (
            <div>
              <label className="block text-sm font-medium mb-1">Результат (можно отредактировать)</label>
              <textarea value={generated} onChange={(e) => setGenerated(e.target.value)} rows={6} className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <div className="mt-2">
                <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Превью:</div>
                <div className="rounded-lg p-3 text-sm" style={{ background: 'rgba(255,255,255,0.03)' }} dangerouslySetInnerHTML={safeHtml(generated)} />
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
          {generated && (
            <>
              <button onClick={handleGenerate} disabled={generateMut.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-purple-400 bg-purple-500/10 hover:bg-purple-500/20">
                Перегенерировать
              </button>
              <button onClick={() => onSave(Number(channelId), generated)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
                Сохранить как черновик
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Export Dropdown ─────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function htmlToMarkdown(html: string): string {
  return html
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<i>(.*?)<\/i>/gi, '*$1*')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<a\s+href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const exportFormats = [
  { id: 'linkedin', label: 'LinkedIn', icon: '💼', transform: (h: string) => htmlToMarkdown(h) },
  { id: 'twitter', label: 'Twitter / X', icon: '𝕏', transform: (h: string) => { const t = stripHtml(h); return t.length > 280 ? t.slice(0, 277) + '...' : t; } },
  { id: 'facebook', label: 'Facebook', icon: '📘', transform: (h: string) => stripHtml(h) },
  { id: 'plain', label: 'Текст', icon: '📄', transform: (h: string) => stripHtml(h) },
  { id: 'markdown', label: 'Markdown', icon: '📝', transform: (h: string) => htmlToMarkdown(h) },
  { id: 'html', label: 'HTML', icon: '🏷️', transform: (h: string) => h },
];

function ExportDropdown({ content, onClose }: { content: string; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => { setCopied(null); onClose(); }, 1000);
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div className="absolute top-full left-0 mt-1 z-50 w-48 rounded-xl border p-1.5 shadow-lg" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="text-[10px] px-2 py-1 mb-0.5" style={{ color: 'var(--text-muted)' }}>Скопировать как:</div>
        {exportFormats.map((fmt) => (
          <button key={fmt.id} onClick={() => handleCopy(fmt.id, fmt.transform(content))} className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] text-left hover:bg-white/5 transition-colors">
            <span>{fmt.icon}</span>
            <span className="flex-1">{fmt.label}</span>
            {copied === fmt.id && <span className="text-green-400 text-[10px]">✓</span>}
          </button>
        ))}
      </div>
    </>
  );
}
