import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Clock, FileText, Bold, Italic, Link2, Image, Upload, X, FlaskConical } from 'lucide-react';
import { apiFetch, uploadImage } from '../../lib/api.js';
import { cn } from '../../lib/utils.js';
import { useToast } from '../ui/toast.js';
import { useConfirm } from '../ui/confirm-dialog.js';
import { TelegramPreview } from '../telegram-preview.js';

export interface ComposerChannel {
  id: number;
  title: string;
  /** Chat name without the topic suffix */
  chatTitle: string;
  chatId: string;
  type: string;
  threadId: number | null;
  threadTitle: string | null;
  botId: number;
  botName: string;
  botRunning: boolean;
}

/** A chat to post into; in a group with topics the post goes to the topics picked under it */
interface Destination {
  key: string;
  chatId: string;
  title: string;
  type: string;
  botId: number;
  botName: string;
  botRunning: boolean;
  rows: ComposerChannel[];
}

const GENERAL = 'general';
const DEST_KEY = 'home:dest';
const topicsKey = (destKey: string) => `home:topics:${destKey}`;
// Telegram limits: 4096 for a message, 1024 for a photo caption
const TEXT_LIMIT = 4096;
const CAPTION_LIMIT = 1024;

function readSaved(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}

/** datetime-local value for "now + 1 hour", in local time */
function defaultScheduleValue(): string {
  const d = new Date(Date.now() + 60 * 60000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function Composer({ channels }: { channels: ComposerChannel[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const [destKey, setDestKey] = useState<string | null>(() => readSaved(DEST_KEY));
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showImage, setShowImage] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(defaultScheduleValue);
  const [busy, setBusy] = useState(false);

  // Where «В тест» sends: one chat for checks, kept in the panel settings
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => apiFetch('/settings') });
  const testChannel = channels.find((ch) => String(ch.id) === settings?.test_channel_id);
  const [pickingTest, setPickingTest] = useState(false);
  const [testPick, setTestPick] = useState('');
  // First guess for the picker: a chat called "test", otherwise the last one
  const guessTest = () => (channels.find((ch) => /тест|test/i.test(ch.title)) ?? channels[channels.length - 1])?.id;

  // Topics of one group are separate channel rows; they collapse into one destination here
  const destinations: Destination[] = [];
  for (const ch of channels) {
    const key = `${ch.botId}:${ch.chatId}`;
    const existing = destinations.find((d) => d.key === key);
    if (existing) existing.rows.push(ch);
    else destinations.push({ key, chatId: ch.chatId, title: ch.chatTitle, type: ch.type, botId: ch.botId, botName: ch.botName, botRunning: ch.botRunning, rows: [ch] });
  }
  const dest = destinations.find((d) => d.key === destKey) ?? destinations[0];
  const multiBot = new Set(channels.map((ch) => ch.botId)).size > 1;
  const isGroup = dest?.type === 'group' || dest?.type === 'supergroup';

  // Topics the bot has seen messages in, plus the ones added by hand on the bot page
  const { data: threads } = useQuery({
    queryKey: ['stats-threads', dest?.chatId],
    queryFn: () => apiFetch(`/stats/chat/${dest!.chatId}/threads`),
    enabled: !!dest && isGroup,
  });
  const topicNames = new Map<number, string>();
  for (const t of threads ?? []) if (t.threadId !== GENERAL) topicNames.set(Number(t.threadId), t.title);
  for (const row of dest?.rows ?? []) {
    if (row.threadId && (!topicNames.has(row.threadId) || topicNames.get(row.threadId)!.startsWith('Топик #'))) {
      topicNames.set(row.threadId, row.threadTitle || `Топик #${row.threadId}`);
    }
  }
  const topics = [{ id: GENERAL, title: 'Общий' }, ...[...topicNames].map(([id, title]) => ({ id: String(id), title }))];
  const isForum = topicNames.size > 0;

  // Picked topics, remembered per chat
  const [pickedByDest, setPickedByDest] = useState<Record<string, string[]>>({});
  const picked = (() => {
    if (!dest) return [];
    const stored = pickedByDest[dest.key] ?? readSaved(topicsKey(dest.key))?.split(',').filter(Boolean) ?? [GENERAL];
    return stored.filter((id) => topics.some((t) => t.id === id));
  })();
  const setPicked = (ids: string[]) => {
    setPickedByDest((prev) => ({ ...prev, [dest!.key]: ids }));
    save(topicsKey(dest!.key), ids.join(','));
  };
  const togglePicked = (id: string) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);

  const selectDest = (key: string) => {
    setDestKey(key);
    save(DEST_KEY, key);
  };

  const pickedTitles = topics.filter((t) => picked.includes(t.id)).map((t) => t.title);
  const targetLabel = !dest ? '' : !isForum ? dest.title
    : pickedTitles.length === 1 ? `${dest.title} # ${pickedTitles[0]}`
    : `${dest.title}: ${pickedTitles.length} топик(ов)`;

  /** Channel rows to post into; a topic that has no row yet gets one */
  const resolveTargets = async (): Promise<number[]> => {
    if (!isForum) return [(dest!.rows.find((r) => !r.threadId) ?? dest!.rows[0]).id];
    const ids: number[] = [];
    for (const id of picked) {
      const threadId = id === GENERAL ? null : Number(id);
      let row: { id: number } | undefined = dest!.rows.find((r) => (r.threadId ?? null) === threadId);
      if (!row) {
        row = await apiFetch(`/bots/${dest!.botId}/channels`, {
          method: 'POST',
          body: JSON.stringify({ chatId: dest!.chatId, threadId: threadId ?? undefined, threadTitle: threadId ? topicNames.get(threadId) : undefined }),
        });
        qc.invalidateQueries({ queryKey: ['bots'] });
      }
      ids.push(row!.id);
    }
    return ids;
  };

  const plainLength = content.replace(/<[^>]+>/g, '').length;
  const image = showImage ? imageUrl.trim() : '';
  const limit = TEXT_LIMIT;
  const overLimit = plainLength > limit;
  const longCaption = !!image && plainLength > CAPTION_LIMIT && !overLimit;
  const canSend = !!dest && content.trim() !== '' && !overLimit && !busy && (!isForum || picked.length > 0);
  const canTest = content.trim() !== '' && !overLimit && !busy;

  /** Wrap the selected text in an HTML tag Telegram understands */
  const wrap = (open: string, close: string) => {
    const el = textRef.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = content.slice(0, start) + open + content.slice(start, end) + close + content.slice(end);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + open.length, end + open.length);
    });
  };

  const addLink = () => {
    const url = window.prompt('Адрес ссылки', 'https://');
    if (url && url !== 'https://') wrap(`<a href="${url}">`, '</a>');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      setImageUrl(await uploadImage(file));
      setShowImage(true);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const reset = () => {
    setContent('');
    setImageUrl('');
    setShowImage(false);
    setShowSchedule(false);
  };

  const createPost = (channelId: number, extra: { status: string; scheduledFor?: string }) =>
    apiFetch('/posts', {
      method: 'POST',
      body: JSON.stringify({ channelId, content, imageUrl: image || undefined, ...extra }),
    });

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    }
  };

  const saveDraft = () => run(async () => {
    for (const channelId of await resolveTargets()) await createPost(channelId, { status: 'draft' });
    toast.success('Сохранено в черновики');
    reset();
  });

  const schedule = () => run(async () => {
    const when = new Date(scheduleAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      throw new Error('Выберите время в будущем');
    }
    for (const channelId of await resolveTargets()) await createPost(channelId, { status: 'queued', scheduledFor: when.toISOString() });
    toast.success(`Запланировано на ${when.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
    reset();
  });

  const sendTest = (channelId: number) => run(async () => {
    await apiFetch('/posts/test-send', {
      method: 'POST',
      body: JSON.stringify({ channelId, content, imageUrl: image || undefined }),
    });
    const title = channels.find((ch) => ch.id === channelId)?.title;
    toast.success(`Отправлено в «${title}» — посмотрите, как выглядит`);
  });

  const openTestPicker = () => {
    setTestPick(String(testChannel?.id ?? guessTest() ?? ''));
    setPickingTest(true);
  };

  const saveTestChat = () => run(async () => {
    const channelId = Number(testPick);
    await apiFetch('/settings', { method: 'PUT', body: JSON.stringify({ test_channel_id: String(channelId) }) });
    await qc.invalidateQueries({ queryKey: ['settings'] });
    setPickingTest(false);
    if (canTest) await sendTest(channelId);
  });

  const publishNow = () => confirm({
    title: `Опубликовать в «${targetLabel}»?`,
    message: isForum && picked.length > 1
      ? `Пост уйдёт в Telegram сразу, в топики: ${pickedTitles.join(', ')}. Отменить отправку будет нельзя.`
      : 'Пост уйдёт в Telegram сразу. Отменить отправку будет нельзя.',
    confirmLabel: 'Опубликовать',
    variant: 'warning',
    onConfirm: () => run(async () => {
      const targets = await resolveTargets();
      const failed: string[] = [];
      for (const channelId of targets) {
        // Kept as a draft if sending fails, so the text is not lost
        const post = await createPost(channelId, { status: 'draft' });
        try {
          await apiFetch(`/posts/${post.id}/publish`, { method: 'POST' });
        } catch (err) {
          failed.push((err as Error).message);
        }
      }
      if (failed.length === targets.length) throw new Error(failed[0]);
      if (failed.length > 0) toast.error(`Не отправлено в ${failed.length} из ${targets.length}: ${failed[0]}. Эти посты остались в «Постах».`);
      else toast.success(targets.length > 1 ? `Опубликовано в ${targets.length} топиках` : 'Опубликовано');
      reset();
    }),
  });

  if (channels.length === 0) return null;

  const toolBtn = 'p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors';

  return (
    <div className="rounded-xl border p-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      {dialog}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Куда:</span>
        {destinations.length > 1 ? (
          <select
            value={dest?.key}
            onChange={(e) => selectDest(e.target.value)}
            className="text-xs rounded-lg border px-2 py-1.5 bg-transparent max-w-full"
            style={{ borderColor: 'var(--border)' }}
          >
            {destinations.map((d) => (
              <option key={d.key} value={d.key}>{d.title}{multiBot ? ` · ${d.botName}` : ''}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-medium">{dest?.title}</span>
        )}
      </div>

      {isForum && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-[11px] mr-1" style={{ color: 'var(--text-muted)' }}>Топики:</span>
          {topics.map((t) => (
            <button key={t.id} type="button" aria-pressed={picked.includes(t.id)} onClick={() => togglePicked(t.id)}
              className={cn('px-2.5 py-1 rounded-lg border text-xs transition-colors', picked.includes(t.id) ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'text-zinc-400 hover:border-zinc-600')}
              style={picked.includes(t.id) ? undefined : { borderColor: 'var(--border)' }}>
              {t.title}
            </button>
          ))}
          <button type="button" onClick={() => setPicked(picked.length === topics.length ? [] : topics.map((t) => t.id))}
            className="px-2 py-1 text-[11px] text-zinc-500 hover:text-zinc-300">
            {picked.length === topics.length ? 'Снять все' : 'Все'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_20rem] gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1 mb-1">
            <button type="button" className={toolBtn} title="Жирный" onClick={() => wrap('<b>', '</b>')}><Bold size={15} /></button>
            <button type="button" className={toolBtn} title="Курсив" onClick={() => wrap('<i>', '</i>')}><Italic size={15} /></button>
            <button type="button" className={toolBtn} title="Ссылка" onClick={addLink}><Link2 size={15} /></button>
            <button type="button" className={toolBtn} title="Загрузить картинку" disabled={uploading} onClick={() => fileRef.current?.click()}><Upload size={15} /></button>
            <button type="button" className={cn(toolBtn, showImage && 'text-blue-400')} title="Картинка по ссылке" onClick={() => setShowImage((v) => !v)}><Image size={15} /></button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
            {uploading && <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Загрузка…</span>}
            <span className={cn('ml-auto text-[11px]', overLimit ? 'text-red-400' : '')} style={overLimit ? undefined : { color: 'var(--text-muted)' }}>
              {plainLength} / {limit}
            </span>
          </div>

          <textarea
            ref={textRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={7}
            placeholder="Текст поста…"
            className="w-full rounded-lg border px-3 py-2 text-sm bg-transparent resize-y outline-none focus:border-blue-500"
            style={{ borderColor: 'var(--border)' }}
          />

          {showImage && (
            <div className="flex items-center gap-2 mt-2">
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Ссылка на картинку (https://…) или загрузите файл"
                className="flex-1 min-w-0 rounded-lg border px-3 py-2 text-sm bg-transparent outline-none focus:border-blue-500"
                style={{ borderColor: 'var(--border)' }}
              />
              <button type="button" className={toolBtn} title="Убрать картинку" onClick={() => { setShowImage(false); setImageUrl(''); }}><X size={15} /></button>
            </div>
          )}

          {overLimit && (
            <p className="text-xs text-red-400 mt-2">
Telegram принимает не больше 4096 символов.
            </p>
          )}
          {longCaption && (
            <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
              Текст длиннее подписи к фото (1024). {image.startsWith('/uploads/') ? 'Картинка уйдёт отдельным сообщением перед текстом.' : 'Пост уйдёт одним сообщением: картинка сверху, текст под ней.'}
            </p>
          )}
          {dest && !dest.botRunning && (
            <p className="text-xs text-orange-400 mt-2">Бот «{dest.botName}» остановлен — опубликовать сейчас не получится, но можно сохранить черновик.</p>
          )}

          {showSchedule && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <input
                type="datetime-local"
                value={scheduleAt}
                onChange={(e) => setScheduleAt(e.target.value)}
                className="rounded-lg border px-3 py-2 text-sm bg-transparent outline-none focus:border-blue-500"
                style={{ borderColor: 'var(--border)', colorScheme: 'dark' }}
              />
              <button type="button" disabled={!canSend} onClick={schedule}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-yellow-600 hover:bg-yellow-700 disabled:opacity-40 disabled:cursor-not-allowed">
                Поставить в очередь
              </button>
              <button type="button" onClick={() => setShowSchedule(false)} className="px-3 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
            </div>
          )}

          {!showSchedule && (
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 mt-3">
              <button type="button" disabled={!canSend || !dest?.botRunning} onClick={publishNow}
                className="col-span-2 justify-center flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                <Send size={14} /> Опубликовать сейчас
              </button>
              <button type="button" disabled={!canTest || (!!testChannel && !testChannel.botRunning)}
                onClick={() => testChannel ? sendTest(testChannel.id) : openTestPicker()}
                title={testChannel ? `Отправить в «${testChannel.title}», чтобы посмотреть, как выглядит. Пост не сохраняется.` : 'Выбрать тестовый чат и отправить туда'}
                className="justify-center flex items-center gap-2 px-4 py-2 rounded-lg text-sm border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 disabled:cursor-not-allowed">
                <FlaskConical size={14} /> В тест
              </button>
              <button type="button" disabled={!canSend} onClick={() => { setScheduleAt(defaultScheduleValue()); setShowSchedule(true); }}
                className="justify-center flex items-center gap-2 px-4 py-2 rounded-lg text-sm border hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--border)' }}>
                <Clock size={14} /> На время
              </button>
              <button type="button" disabled={!canSend} onClick={saveDraft}
                className="col-span-2 justify-center flex items-center gap-2 px-4 py-2 rounded-lg text-sm border hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--border)' }}>
                <FileText size={14} /> В черновики
              </button>
            </div>
          )}

          {pickingTest ? (
            <div className="flex flex-wrap items-center gap-2 mt-3 rounded-lg border px-3 py-2" style={{ borderColor: 'var(--border)' }}>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Тесты отправлять в</span>
              <select value={testPick} onChange={(e) => setTestPick(e.target.value)}
                className="text-xs rounded-lg border px-2 py-1.5 bg-transparent max-w-full" style={{ borderColor: 'var(--border)' }}>
                {channels.map((ch) => <option key={ch.id} value={ch.id}>{ch.title}{multiBot ? ` · ${ch.botName}` : ''}</option>)}
              </select>
              <button type="button" disabled={!testPick || busy} onClick={saveTestChat}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40">
                {canTest ? 'Сохранить и отправить' : 'Сохранить'}
              </button>
              <button type="button" onClick={() => setPickingTest(false)} className="px-2 py-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>Отмена</button>
            </div>
          ) : testChannel && (
            <p className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
              «В тест» отправляет в «{testChannel.title}» и ничего не сохраняет.{' '}
              <button type="button" onClick={openTestPicker} className="underline hover:text-zinc-300">Сменить чат</button>
              {!testChannel.botRunning && <span className="text-orange-400"> Бот этого чата остановлен.</span>}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Так увидят в Telegram</div>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {content.trim() || image ? (
              <TelegramPreview content={content.replace(/\n/g, '<br>')} imageUrl={image || undefined} channelTitle={targetLabel} />
            ) : (
              <p className="text-xs text-center py-10 px-3" style={{ color: 'var(--text-muted)' }}>Начните писать — здесь появится предпросмотр</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
