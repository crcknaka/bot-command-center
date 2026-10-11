import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Send, Clock, FileText, Bold, Italic, Link2, Image, Upload, X } from 'lucide-react';
import { apiFetch, uploadImage } from '../../lib/api.js';
import { cn } from '../../lib/utils.js';
import { useToast } from '../ui/toast.js';
import { useConfirm } from '../ui/confirm-dialog.js';
import { TelegramPreview } from '../telegram-preview.js';

export interface ComposerChannel {
  id: number;
  title: string;
  botId: number;
  botName: string;
  botRunning: boolean;
}

const CHANNEL_KEY = 'home:channel';
// Telegram limits: 4096 for a message, 1024 for a photo caption
const TEXT_LIMIT = 4096;
const CAPTION_LIMIT = 1024;

function readSavedChannel(): number | null {
  try { const v = localStorage.getItem(CHANNEL_KEY); return v ? Number(v) : null; } catch { return null; }
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

  const [channelId, setChannelId] = useState<number | null>(readSavedChannel);
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showImage, setShowImage] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [scheduleAt, setScheduleAt] = useState(defaultScheduleValue);
  const [busy, setBusy] = useState(false);

  const channel = channels.find((ch) => ch.id === channelId) ?? channels[0];

  const selectChannel = (id: number) => {
    setChannelId(id);
    try { localStorage.setItem(CHANNEL_KEY, String(id)); } catch {}
  };

  const plainLength = content.replace(/<[^>]+>/g, '').length;
  const image = showImage ? imageUrl.trim() : '';
  const limit = TEXT_LIMIT;
  const overLimit = plainLength > limit;
  const longCaption = !!image && plainLength > CAPTION_LIMIT && !overLimit;
  const canSend = !!channel && content.trim() !== '' && !overLimit && !busy;

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

  const createPost = (extra: { status: string; scheduledFor?: string }) =>
    apiFetch('/posts', {
      method: 'POST',
      body: JSON.stringify({ channelId: channel!.id, content, imageUrl: image || undefined, ...extra }),
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
    await createPost({ status: 'draft' });
    toast.success('Сохранено в черновики');
    reset();
  });

  const schedule = () => run(async () => {
    const when = new Date(scheduleAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) {
      throw new Error('Выберите время в будущем');
    }
    await createPost({ status: 'queued', scheduledFor: when.toISOString() });
    toast.success(`Запланировано на ${when.toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`);
    reset();
  });

  const publishNow = () => confirm({
    title: `Опубликовать в «${channel!.title}»?`,
    message: 'Пост уйдёт в Telegram сразу. Отменить отправку будет нельзя.',
    confirmLabel: 'Опубликовать',
    variant: 'warning',
    onConfirm: () => run(async () => {
      // Kept as a draft if sending fails, so the text is not lost
      const post = await createPost({ status: 'draft' });
      await apiFetch(`/posts/${post.id}/publish`, { method: 'POST' });
      toast.success('Опубликовано');
      reset();
    }),
  });

  if (channels.length === 0) return null;

  const toolBtn = 'p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors';

  return (
    <div className="rounded-xl border p-4 mb-6" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Send size={14} className="text-blue-400" /> Новый пост</h3>
        {channels.length > 1 ? (
          <select
            value={channel?.id}
            onChange={(e) => selectChannel(Number(e.target.value))}
            className="text-xs rounded-lg border px-2 py-1.5 bg-transparent max-w-full"
            style={{ borderColor: 'var(--border)' }}
          >
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>{ch.title} · {ch.botName}</option>
            ))}
          </select>
        ) : (
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{channel?.title}</span>
        )}
      </div>

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
          {channel && !channel.botRunning && (
            <p className="text-xs text-orange-400 mt-2">Бот «{channel.botName}» остановлен — опубликовать сейчас не получится, но можно сохранить черновик.</p>
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
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <button type="button" disabled={!canSend || !channel?.botRunning} onClick={publishNow}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed">
                <Send size={14} /> Опубликовать сейчас
              </button>
              <button type="button" disabled={!canSend} onClick={() => { setScheduleAt(defaultScheduleValue()); setShowSchedule(true); }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--border)' }}>
                <Clock size={14} /> На время
              </button>
              <button type="button" disabled={!canSend} onClick={saveDraft}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm border hover:border-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: 'var(--border)' }}>
                <FileText size={14} /> В черновики
              </button>
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>Так увидят в Telegram</div>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
            {content.trim() || image ? (
              <TelegramPreview content={content.replace(/\n/g, '<br>')} imageUrl={image || undefined} channelTitle={channel?.title} />
            ) : (
              <p className="text-xs text-center py-10 px-3" style={{ color: 'var(--text-muted)' }}>Начните писать — здесь появится предпросмотр</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
