import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { useToast } from '../components/ui/toast.js';
import { useConfirm } from '../components/ui/confirm-dialog.js';
import { Spinner } from '../components/ui/spinner.js';
import { EmptyState } from '../components/ui/empty-state.js';
import { cn, timeAgo } from '../lib/utils.js';

export function PollsPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [botFilter, setBotFilter] = useState<string>('all');
  const toast = useToast();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const qc = useQueryClient();

  const { data: polls, isLoading } = useQuery({ queryKey: ['polls'], queryFn: () => apiFetch('/polls') });
  const { data: bots } = useQuery({ queryKey: ['bots'], queryFn: () => apiFetch('/bots') });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/polls/${id}`, { method: 'DELETE' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['polls'] }); toast.success('Опрос удалён'); },
  });

  // Build channel list for create modal
  const channelList: Array<{ id: number; title: string; botName: string; botId: number }> = [];
  const botList: Array<{ id: number; name: string }> = [];
  bots?.forEach((bot: any) => {
    botList.push({ id: bot.id, name: bot.name });
    bot.channels?.forEach?.((ch: any) => {
      const threadLabel = ch.threadId ? ` # ${ch.threadTitle || ch.threadId}` : '';
      channelList.push({ id: ch.id, title: ch.title + threadLabel, botName: bot.name, botId: bot.id });
    });
  });

  // Filter
  let filtered = polls ?? [];
  if (typeFilter !== 'all') filtered = filtered.filter((p: any) => p.type === typeFilter);
  if (botFilter !== 'all') filtered = filtered.filter((p: any) => p.botId === Number(botFilter));

  return (
    <div>
      {confirmDialog}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Опросы</h1>
        </div>
        <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
          <Plus size={16} /> Создать опрос
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex gap-1 rounded-lg p-1" style={{ background: 'var(--bg-card)' }}>
          {[{ id: 'all', label: 'Все' }, { id: 'regular', label: '📊 Голосования' }, { id: 'quiz', label: '🧠 Квизы' }].map(f => (
            <button key={f.id} onClick={() => setTypeFilter(f.id)}
              className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition-colors', typeFilter === f.id ? 'bg-blue-500/20 text-blue-400' : 'text-zinc-500 hover:text-zinc-300')}>
              {f.label}
            </button>
          ))}
        </div>
        {botList.length > 1 && (
          <select value={botFilter} onChange={(e) => setBotFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-xs" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
            <option value="all">Все боты</option>
            {botList.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        )}
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} {filtered.length === 1 ? 'опрос' : 'опросов'}</span>
      </div>

      {/* List */}
      {isLoading ? (
        <Spinner text="Загрузка..." />
      ) : filtered.length === 0 ? (
        <EmptyState icon={BarChart3} title="Нет опросов" description="Создайте первый опрос для вашего канала." action={
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white mt-2" style={{ background: 'var(--primary)' }}>
            <Plus size={14} className="inline mr-1" /> Создать опрос
          </button>
        } />
      ) : (
        <div className="space-y-2">
          {filtered.map((poll: any) => (
            <div key={poll.id} className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={cn('text-[11px] px-2 py-0.5 rounded font-medium', poll.type === 'quiz' ? 'bg-green-500/15 text-green-400' : 'bg-cyan-500/15 text-cyan-400')}>
                      {poll.type === 'quiz' ? '🧠 Квиз' : '📊 Голосование'}
                    </span>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400">{poll.botName}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>→ {poll.channelTitle}</span>
                    {poll.status === 'failed' && <span className="text-[11px] px-2 py-0.5 rounded bg-red-500/15 text-red-400">Ошибка</span>}
                  </div>
                  <h3 className="text-sm font-medium mb-2">{poll.question}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {(poll.options as string[]).map((opt: string, i: number) => (
                      <span key={i} className={cn('text-[11px] px-2 py-0.5 rounded border', poll.type === 'quiz' && poll.correctOptionId === i ? 'border-green-500/30 bg-green-500/10 text-green-400' : '')} style={poll.type !== 'quiz' || poll.correctOptionId !== i ? { borderColor: 'var(--border)', color: 'var(--text-muted)' } : {}}>
                        {poll.type === 'quiz' && poll.correctOptionId === i && '✓ '}{opt}
                      </span>
                    ))}
                  </div>
                  {poll.errorMessage && <div className="text-[11px] text-red-400 mt-1.5">{poll.errorMessage}</div>}
                  <div className="flex gap-3 mt-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {poll.isAnonymous && <span>Анонимный</span>}
                    {poll.allowsMultipleAnswers && <span>Несколько ответов</span>}
                    {poll.explanation && <span>Пояснение: «{poll.explanation}»</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{timeAgo(poll.createdAt)}</span>
                  <button onClick={() => confirm({ title: 'Удалить опрос?', message: 'Запись будет удалена из истории. Опрос в Telegram останется.', onConfirm: () => deleteMut.mutate(poll.id) })}
                    className="p-1.5 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-500/10">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <CreatePollModal channels={channelList} onClose={() => setShowCreate(false)} onSuccess={() => { qc.invalidateQueries({ queryKey: ['polls'] }); setShowCreate(false); }} />
      )}
    </div>
  );
}

// ─── Create Poll Modal ──────────────────────────────────────────────────────

function CreatePollModal({ channels, onClose, onSuccess }: { channels: Array<{ id: number; title: string; botName: string; botId: number }>; onClose: () => void; onSuccess: () => void }) {
  const [channelId, setChannelId] = useState<string>(channels[0]?.id?.toString() ?? '');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [type, setType] = useState<'regular' | 'quiz'>('regular');
  const [correctIdx, setCorrectIdx] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(true);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const toast = useToast();

  const selectedChannel = channels.find(ch => ch.id === Number(channelId));

  const handleSend = async () => {
    if (!question.trim() || !selectedChannel) return;
    const cleanOptions = options.filter(o => o.trim());
    if (cleanOptions.length < 2) { setError('Минимум 2 варианта'); return; }
    setSending(true); setError('');
    try {
      await apiFetch('/polls', {
        method: 'POST',
        body: JSON.stringify({
          botId: selectedChannel.botId, channelId: Number(channelId), question, options: cleanOptions,
          isAnonymous, allowsMultipleAnswers: allowMultiple, type,
          correctOptionId: type === 'quiz' ? correctIdx : undefined,
          explanation: type === 'quiz' ? explanation || undefined : undefined,
        }),
      });
      toast.success('Опрос отправлен!');
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto p-5 sm:p-6 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <h2 className="text-lg font-bold mb-1 flex items-center gap-2"><BarChart3 size={18} className="text-cyan-400" /> Создать опрос</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Отправится сразу в выбранный канал.</p>

        {error && <div className="text-sm text-red-400 bg-red-500/10 rounded-lg p-3 mb-3">{error}</div>}

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1">Канал</label>
            {channels.length === 0 ? (
              <p className="text-xs text-red-400">Нет каналов.</p>
            ) : (
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.botName} → {ch.title}</option>)}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Вопрос</label>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Какое моноколесо лучше?"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Варианты ответа</label>
            <div className="space-y-1.5">
              {options.map((opt, i) => (
                <div key={i} className="flex gap-1.5">
                  {type === 'quiz' && (
                    <button type="button" onClick={() => setCorrectIdx(i)} className={cn('w-7 h-8 rounded-lg text-xs shrink-0 transition-colors', correctIdx === i ? 'bg-green-500/20 text-green-400' : 'bg-zinc-700/50 text-zinc-500')} title="Правильный ответ">✓</button>
                  )}
                  <input value={opt} onChange={(e) => { const n = [...options]; n[i] = e.target.value; setOptions(n); }}
                    placeholder={`Вариант ${i + 1}`}
                    className="flex-1 px-3 py-1.5 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  {options.length > 2 && (
                    <button type="button" onClick={() => { setOptions(options.filter((_, j) => j !== i)); if (correctIdx >= options.length - 1) setCorrectIdx(0); }}
                      className="px-2 text-red-400/50 hover:text-red-400"><Trash2 size={12} /></button>
                  )}
                </div>
              ))}
            </div>
            {options.length < 10 && (
              <button type="button" onClick={() => setOptions([...options, ''])} className="text-[11px] text-blue-400 mt-1.5">+ Добавить вариант</button>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5">Тип</label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setType('regular')} className={cn('flex-1 py-2 rounded-lg text-xs font-medium transition-colors', type === 'regular' ? 'bg-cyan-500/15 text-cyan-400' : 'bg-zinc-700/30 text-zinc-500')}>📊 Голосование</button>
              <button type="button" onClick={() => setType('quiz')} className={cn('flex-1 py-2 rounded-lg text-xs font-medium transition-colors', type === 'quiz' ? 'bg-green-500/15 text-green-400' : 'bg-zinc-700/30 text-zinc-500')}>🧠 Квиз</button>
            </div>
          </div>

          {type === 'quiz' && (
            <div>
              <label className="block text-xs font-medium mb-1">Пояснение (после ответа)</label>
              <input value={explanation} onChange={(e) => setExplanation(e.target.value)} placeholder="Правильный ответ потому что..."
                className="w-full px-3 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            </div>
          )}

          <div className="flex gap-4 flex-wrap">
            <label className="text-[11px] flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
              <input type="checkbox" checked={isAnonymous} onChange={(e) => setIsAnonymous(e.target.checked)} /> Анонимный
            </label>
            {type === 'regular' && (
              <label className="text-[11px] flex items-center gap-1.5 cursor-pointer" style={{ color: 'var(--text-muted)' }}>
                <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} /> Несколько ответов
              </label>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
          <button onClick={handleSend} disabled={sending || !question.trim() || options.filter(o => o.trim()).length < 2}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: sending ? 'var(--text-muted)' : 'var(--primary)' }}>
            {sending ? 'Отправляю...' : 'Отправить опрос'}
          </button>
        </div>
      </div>
    </div>
  );
}
