import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trash2, Sparkles } from 'lucide-react';
import { apiFetch } from '../../lib/api.js';
import { cn } from '../../lib/utils.js';
import { ctrlEnter, SectionHeader } from './shared.js';

export function AutoReplyConfigUI({ rules, cooldownSeconds, onChangeRules, onChangeCooldown }: {
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

export function BannedWordsInput({ words, onChange }: { words: string[]; onChange: (w: string[]) => void }) {
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

export const WARN_DEFAULTS: Record<string, string> = {
  bannedWords: '⚠️ {user}, ваше сообщение удалено за нарушение правил.',
  links: '🔗 {user}, ссылки в чате запрещены.',
  flood: '🚫 {user}, слишком много сообщений! Подождите минуту.',
  shortMsg: '✏️ {user}, сообщение слишком короткое.',
  forwards: '🚫 {user}, пересланные сообщения запрещены.',
  stickers: '🚫 {user}, стикеры и GIF запрещены.',
  voice: '🚫 {user}, голосовые сообщения запрещены.',
};

export function WarnConfig({ label, warnKey, value, onChange }: {
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

export function WebSearchConfigUI({ config, onChange, botId, onScheduleChange }: { config: any; onChange: (patch: any) => void; botId?: number; onScheduleChange?: (cron: string) => void }) {
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

export function ModerationConfigUI({ config, onChange }: { config: any; onChange: (patch: any) => void }) {
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
          <input type="checkbox" checked={config.blockVoice ?? false} onChange={(e) => set({ blockVoice: e.target.checked, blockVideoNotes: config.blockVideoNotes ?? config.blockVoice ?? false })} />
          Запретить голосовые
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={config.blockVideoNotes ?? config.blockVoice ?? false} onChange={(e) => set({ blockVideoNotes: e.target.checked })} />
          Запретить видео-кружки
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

export type ScheduleMode = 'daily' | 'multi' | 'interval' | 'custom';

export function SchedulePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
