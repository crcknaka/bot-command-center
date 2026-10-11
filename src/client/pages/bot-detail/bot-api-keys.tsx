import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { InfoTip } from '../../components/ui/tooltip.js';
import { apiFetch } from '../../lib/api.js';
import { ctrlEnter } from './shared.js';

export function BotApiKeys({ bot, botId }: { bot: any; botId: number }) {
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
