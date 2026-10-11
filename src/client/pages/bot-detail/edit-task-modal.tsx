import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { InfoTip } from '../../components/ui/tooltip.js';
import { cn } from '../../lib/utils.js';
import { ctrlEnter, Modal } from './shared.js';
import { AutoReplyConfigUI, WebSearchConfigUI, ModerationConfigUI, SchedulePicker } from './task-config.js';

export function EditTaskModal({ task, onSave, onClose, isPending, botId }: {
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
