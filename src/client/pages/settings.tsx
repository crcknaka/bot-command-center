import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Check, Plus, Trash2, Zap, X, Settings2, Cpu, Search, FileText, Pencil } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { useConfirm } from '../components/ui/confirm-dialog.js';
import { cn } from '../lib/utils.js';

// ─── Tabs ────────────────────────────────────────────────────────────────────

const tabs = [
  { id: 'general', label: 'Общие', icon: Settings2 },
  { id: 'ai', label: 'AI-модели', icon: Cpu },
  { id: 'search', label: 'Поиск', icon: Search },
  { id: 'templates', label: 'Шаблоны', icon: FileText },
] as const;

type TabId = (typeof tabs)[number]['id'];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('general');

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Настройки</h1>
        <InfoTip text="Глобальные настройки: общие параметры, AI-модели, поисковые провайдеры, шаблоны постов. Для каждого бота можно переопределить отдельно." position="bottom" />
      </div>

      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: 'var(--border)' }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              )}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'general' && <GeneralTab />}
      {activeTab === 'ai' && <AIModelsTab />}
      {activeTab === 'search' && <SearchTab />}
      {activeTab === 'templates' && <TemplatesTab />}
    </div>
  );
}

// ─── General Tab ─────────────────────────────────────────────────────────────

function GeneralTab() {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: () => apiFetch('/settings') });
  const [form, setForm] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) setForm(settings);
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: (data: Record<string, string>) => apiFetch('/settings', { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>;

  const timezones = [
    { group: 'Европа', zones: [
      { value: 'Europe/Moscow', label: 'Москва (UTC+3)' },
      { value: 'Europe/Kiev', label: 'Киев (UTC+2)' },
      { value: 'Europe/Minsk', label: 'Минск (UTC+3)' },
      { value: 'Europe/Riga', label: 'Рига (UTC+2)' },
      { value: 'Europe/Vilnius', label: 'Вильнюс (UTC+2)' },
      { value: 'Europe/Tallinn', label: 'Таллин (UTC+2)' },
      { value: 'Europe/Warsaw', label: 'Варшава (UTC+1)' },
      { value: 'Europe/Berlin', label: 'Берлин (UTC+1)' },
      { value: 'Europe/London', label: 'Лондон (UTC+0)' },
      { value: 'Europe/Paris', label: 'Париж (UTC+1)' },
      { value: 'Europe/Istanbul', label: 'Стамбул (UTC+3)' },
    ]},
    { group: 'Азия', zones: [
      { value: 'Asia/Almaty', label: 'Алматы (UTC+6)' },
      { value: 'Asia/Tashkent', label: 'Ташкент (UTC+5)' },
      { value: 'Asia/Tbilisi', label: 'Тбилиси (UTC+4)' },
      { value: 'Asia/Baku', label: 'Баку (UTC+4)' },
      { value: 'Asia/Dubai', label: 'Дубай (UTC+4)' },
      { value: 'Asia/Bangkok', label: 'Бангкок (UTC+7)' },
      { value: 'Asia/Singapore', label: 'Сингапур (UTC+8)' },
      { value: 'Asia/Tokyo', label: 'Токио (UTC+9)' },
    ]},
    { group: 'Америка', zones: [
      { value: 'America/New_York', label: 'Нью-Йорк (UTC-5)' },
      { value: 'America/Chicago', label: 'Чикаго (UTC-6)' },
      { value: 'America/Denver', label: 'Денвер (UTC-7)' },
      { value: 'America/Los_Angeles', label: 'Лос-Анджелес (UTC-8)' },
      { value: 'America/Toronto', label: 'Торонто (UTC-5)' },
      { value: 'America/Sao_Paulo', label: 'Сан-Паулу (UTC-3)' },
    ]},
    { group: 'Другие', zones: [
      { value: 'UTC', label: 'UTC (UTC+0)' },
      { value: 'Australia/Sydney', label: 'Сидней (UTC+11)' },
      { value: 'Pacific/Auckland', label: 'Окленд (UTC+13)' },
    ]},
  ];

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <label className="block text-sm font-medium mb-1">Часовой пояс</label>
        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>Используется для расписания публикаций.</p>
        <select
          value={form['default_timezone'] ?? ''}
          onChange={(e) => setForm({ ...form, default_timezone: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border text-sm"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
        >
          <option value="">Не выбран</option>
          {timezones.map((g) => (
            <optgroup key={g.group} label={g.group}>
              {g.zones.map((z) => (
                <option key={z.value} value={z.value}>{z.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <button onClick={() => saveMut.mutate(form)} disabled={saveMut.isPending} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors" style={{ background: saved ? 'var(--success)' : 'var(--primary)' }}>
        {saved ? <><Check size={16} /> Сохранено</> : <><Save size={16} /> {saveMut.isPending ? 'Сохраняю...' : 'Сохранить'}</>}
      </button>

      {/* Change password */}
      <ChangePassword />
    </div>
  );
}

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const changeMut = useMutation({
    mutationFn: () => apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: current, newPassword: newPwd }) }),
    onSuccess: () => { setDone(true); setCurrent(''); setNewPwd(''); setTimeout(() => { setDone(false); setOpen(false); }, 2000); },
    onError: (err) => setError((err as Error).message),
  });

  if (!open) {
    return (
      <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
        <button onClick={() => setOpen(true)} className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          Сменить пароль
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
      <h3 className="text-sm font-semibold mb-3">Смена пароля</h3>
      {error && <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2 mb-3">{error}</div>}
      {done && <div className="text-xs text-green-400 bg-green-500/10 rounded-lg p-2 mb-3">Пароль изменён</div>}
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1">Текущий пароль</label>
          <input type="password" value={current} onChange={(e) => { setCurrent(e.target.value); setError(''); }} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Новый пароль</label>
          <input type="password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setOpen(false); setError(''); }} className="px-3 py-1.5 rounded-lg text-xs" style={{ color: 'var(--text-muted)' }}>Отмена</button>
          <button onClick={() => changeMut.mutate()} disabled={changeMut.isPending || !current || !newPwd} className="px-3 py-1.5 rounded-lg text-xs font-medium text-white" style={{ background: 'var(--primary)' }}>
            {changeMut.isPending ? 'Меняю...' : 'Сменить пароль'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── AI Models Tab ───────────────────────────────────────────────────────────

const providerTypes = [
  // Cloud
  { value: 'openai', label: 'OpenAI', desc: 'GPT-4o, o3 и другие', models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'], group: 'cloud', needsKey: true },
  { value: 'anthropic', label: 'Anthropic', desc: 'Claude Sonnet, Haiku', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'], group: 'cloud', needsKey: true },
  { value: 'google', label: 'Google Gemini', desc: 'Gemini 2.5 Flash/Pro', models: ['gemini-2.5-flash', 'gemini-2.5-pro'], group: 'cloud', needsKey: true },
  { value: 'openrouter', label: 'OpenRouter', desc: '100+ моделей через один ключ', models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514'], group: 'cloud', needsKey: true },
  // Local
  { value: 'ollama', label: 'Ollama', desc: 'Локальные модели (llama3, mistral, qwen)', models: ['llama3.1', 'mistral', 'qwen2.5', 'gemma2', 'phi3'], group: 'local', needsKey: false, defaultUrl: 'http://localhost:11434/v1' },
  { value: 'lmstudio', label: 'LM Studio', desc: 'Локальные модели через GUI', models: ['loaded-model'], group: 'local', needsKey: false, defaultUrl: 'http://localhost:1234/v1' },
  // Custom
  { value: 'custom', label: 'Свой сервер', desc: 'Любой OpenAI-совместимый API (vLLM, LocalAI, text-generation-webui)', models: [], group: 'custom', needsKey: false },
];

function AIModelsTab() {
  const qc = useQueryClient();
  const { data: providers, isLoading } = useQuery({ queryKey: ['ai-providers'], queryFn: () => apiFetch('/ai-providers') });
  const { confirm, dialog: confirmDlg } = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'openai', apiKey: '', baseUrl: '', isDefault: false });
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; msg: string }>>({});

  const createMut = useMutation({
    mutationFn: (data: any) => apiFetch('/ai-providers', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ai-providers'] }); setShowAdd(false); setForm({ name: '', type: 'openai', apiKey: '', isDefault: false }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/ai-providers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ai-providers'] }),
  });
  const testMut = useMutation({
    mutationFn: ({ id, modelId }: { id: number; modelId: string }) => apiFetch(`/ai-providers/${id}/test`, { method: 'POST', body: JSON.stringify({ modelId }) }),
    onSuccess: (data, vars) => setTestResult((prev) => ({ ...prev, [vars.id]: { ok: data.ok, msg: data.response ?? data.error } })),
    onError: (err, vars) => setTestResult((prev) => ({ ...prev, [vars.id]: { ok: false, msg: (err as Error).message } })),
  });

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>;

  return (
    <div>
      {confirmDlg}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Глобальные AI-провайдеры — доступны всем ботам. Для отдельного бота можно переназначить на его странице.
        </p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white shrink-0 ml-4" style={{ background: 'var(--primary)' }}>
          <Plus size={14} /> Добавить
        </button>
      </div>

      {providers?.length === 0 ? (
        <div className="text-center py-12 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Zap size={40} className="mx-auto mb-3 text-zinc-600" />
          <p className="font-medium mb-1">Нет AI-провайдеров</p>
          <p className="text-xs mb-4 max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>Получите API-ключ на сайте <b>OpenAI</b>, <b>Anthropic</b>, <b>Google</b> или <b>OpenRouter</b>.</p>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>Добавить провайдера</button>
        </div>
      ) : (
        <div className="space-y-3">
          {providers?.map((p: any) => {
            const typeInfo = providerTypes.find((t) => t.value === p.type);
            const test = testResult[p.id];
            return (
              <div key={p.id} className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {p.name}
                      {p.isDefault && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">По умолчанию</span>}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{typeInfo?.label ?? p.type} · {typeInfo?.desc ?? ''} · Ключ: {p.apiKey ?? 'не задан'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => testMut.mutate({ id: p.id, modelId: typeInfo?.models[0] ?? 'gpt-4o' })} disabled={testMut.isPending} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25">Проверить</button>
                    <button onClick={() => confirm({ title: 'Удалить?', message: 'Провайдер будет удалён.', onConfirm: () => deleteMut.mutate(p.id) })} className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/15"><Trash2 size={16} /></button>
                  </div>
                </div>
                {test && (
                  <div className={`mt-2 text-xs p-2 rounded-lg ${test.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {test.ok ? <><Check size={12} className="inline mr-1" />Работает: {test.msg}</> : <><X size={12} className="inline mr-1" />Ошибка: {test.msg}</>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (() => {
        const selected = providerTypes.find((t) => t.value === form.type);
        const isLocal = selected?.group === 'local' || selected?.group === 'custom';
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
            <div className="w-full max-w-md mx-4 p-6 rounded-2xl border max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-1">Добавить AI-провайдера</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Облачный сервис или локальная модель на вашем компьютере.</p>
              <form onSubmit={(e) => { e.preventDefault(); createMut.mutate({ ...form, baseUrl: form.baseUrl || (selected as any)?.defaultUrl || '' }); }} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Название</label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={isLocal ? 'Например: Мой Ollama' : 'Например: Мой OpenAI'} className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Тип</label>
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase font-medium tracking-wider" style={{ color: 'var(--text-muted)' }}>Облачные</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {providerTypes.filter((t) => t.group === 'cloud').map((t) => (
                        <button key={t.value} type="button" onClick={() => setForm({ ...form, type: t.value, baseUrl: '' })}
                          className={cn('p-2 rounded-lg border text-left text-xs transition-colors', form.type === t.value ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
                          style={{ borderColor: form.type === t.value ? undefined : 'var(--border)' }}>
                          <div className="font-medium">{t.label}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.desc}</div>
                        </button>
                      ))}
                    </div>
                    <div className="text-[10px] uppercase font-medium tracking-wider mt-3" style={{ color: 'var(--text-muted)' }}>Локальные</div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {providerTypes.filter((t) => t.group === 'local').map((t) => (
                        <button key={t.value} type="button" onClick={() => setForm({ ...form, type: t.value, apiKey: '', baseUrl: (t as any).defaultUrl ?? '' })}
                          className={cn('p-2 rounded-lg border text-left text-xs transition-colors', form.type === t.value ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
                          style={{ borderColor: form.type === t.value ? undefined : 'var(--border)' }}>
                          <div className="font-medium">{t.label}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.desc}</div>
                        </button>
                      ))}
                      {providerTypes.filter((t) => t.group === 'custom').map((t) => (
                        <button key={t.value} type="button" onClick={() => setForm({ ...form, type: t.value, apiKey: '', baseUrl: '' })}
                          className={cn('p-2 rounded-lg border text-left text-xs transition-colors', form.type === t.value ? 'border-blue-500 bg-blue-500/5' : 'hover:border-zinc-600')}
                          style={{ borderColor: form.type === t.value ? undefined : 'var(--border)' }}>
                          <div className="font-medium">{t.label}</div>
                          <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                {selected?.needsKey && (
                  <div>
                    <label className="block text-sm font-medium mb-1">API-ключ</label>
                    <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-..." className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  </div>
                )}
                {isLocal && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Адрес сервера</label>
                    <input value={form.baseUrl || (selected as any)?.defaultUrl || ''} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} placeholder="http://localhost:11434/v1" className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                    <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                      {form.type === 'ollama' && 'Ollama по умолчанию работает на порту 11434. Убедитесь что Ollama запущен.'}
                      {form.type === 'lmstudio' && 'LM Studio по умолчанию на порту 1234. Включите Local Server в LM Studio.'}
                      {form.type === 'custom' && 'Любой сервер с OpenAI-совместимым API (vLLM, LocalAI, text-generation-webui).'}
                    </p>
                  </div>
                )}
                {isLocal && !selected?.needsKey && (
                  <details className="text-xs">
                    <summary className="cursor-pointer" style={{ color: 'var(--text-muted)' }}>API-ключ (если требуется)</summary>
                    <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="Обычно не нужен для локальных" className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono mt-2" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                  </details>
                )}
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Использовать по умолчанию
                </label>
                <div className="flex gap-3 justify-end pt-2">
                  <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
                  <button type="submit" disabled={createMut.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>{createMut.isPending ? 'Добавляю...' : 'Добавить'}</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Search Providers Tab ────────────────────────────────────────────────────

const searchTypes = [
  { value: 'tavily', label: 'Tavily', desc: '1000 запросов/мес бесплатно', placeholder: 'tvly-...' },
  { value: 'serper', label: 'Serper', desc: 'Google Search API, 2500 запросов/мес бесплатно', placeholder: '' },
  { value: 'brave', label: 'Brave Search', desc: '2000 запросов/мес бесплатно', placeholder: 'BSA...' },
  { value: 'serpapi', label: 'SerpAPI', desc: 'Google, Bing и другие, 100 запросов/мес бесплатно', placeholder: '' },
  { value: 'google_cse', label: 'Google Custom Search', desc: '100 запросов/день бесплатно', placeholder: '' },
];

function SearchTab() {
  const qc = useQueryClient();
  const { confirm, dialog: confirmDlg } = useConfirm();
  const { data: providers, isLoading } = useQuery({ queryKey: ['search-providers'], queryFn: () => apiFetch('/search-providers') });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'tavily', apiKey: '', isDefault: false });
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; msg: string }>>({});

  const createMut = useMutation({
    mutationFn: (data: any) => apiFetch('/search-providers', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['search-providers'] }); setShowAdd(false); setForm({ name: '', type: 'tavily', apiKey: '', isDefault: false }); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/search-providers/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['search-providers'] }),
  });
  const testMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/search-providers/${id}/test`, { method: 'POST' }),
    onSuccess: (data, id) => setTestResult((prev) => ({ ...prev, [id]: { ok: data.ok, msg: data.ok ? `Найдено: ${data.firstTitle}` : data.error } })),
    onError: (err, id) => setTestResult((prev) => ({ ...prev, [id]: { ok: false, msg: (err as Error).message } })),
  });

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>;

  return (
    <div>
      {confirmDlg}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Поисковые провайдеры ищут новости в интернете для генерации постов. Для каждого бота можно переназначить отдельно.
        </p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white shrink-0 ml-4" style={{ background: 'var(--primary)' }}>
          <Plus size={14} /> Добавить
        </button>
      </div>

      {providers?.length === 0 ? (
        <div className="text-center py-12 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Search size={40} className="mx-auto mb-3 text-zinc-600" />
          <p className="font-medium mb-1">Нет поисковых провайдеров</p>
          <p className="text-xs mb-4 max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
            Добавьте API-ключ от <b>Tavily</b>, <b>Serper</b>, <b>Brave Search</b> или другого поискового сервиса.
          </p>
          <button onClick={() => setShowAdd(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>Добавить провайдера</button>
        </div>
      ) : (
        <div className="space-y-3">
          {providers?.map((p: any) => {
            const typeInfo = searchTypes.find((t) => t.value === p.type);
            const test = testResult[p.id];
            return (
              <div key={p.id} className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold flex items-center gap-2">
                      {p.name}
                      {p.isDefault && <span className="text-[10px] px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">По умолчанию</span>}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{typeInfo?.label ?? p.type} · {typeInfo?.desc ?? ''} · Ключ: {p.apiKey ?? 'не задан'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => testMut.mutate(p.id)} disabled={testMut.isPending} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25">Проверить</button>
                    <button onClick={() => confirm({ title: 'Удалить?', message: 'Провайдер будет удалён.', onConfirm: () => deleteMut.mutate(p.id) })} className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/15"><Trash2 size={16} /></button>
                  </div>
                </div>
                {test && (
                  <div className={`mt-2 text-xs p-2 rounded-lg ${test.ok ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                    {test.ok ? <><Check size={12} className="inline mr-1" />{test.msg}</> : <><X size={12} className="inline mr-1" />Ошибка: {test.msg}</>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-md mx-4 p-6 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Добавить поисковый провайдер</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Выберите сервис и вставьте API-ключ.</p>
            <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Название</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: Мой Tavily" className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Сервис</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                  {searchTypes.map((t) => <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">API-ключ</label>
                <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder={searchTypes.find((t) => t.value === form.type)?.placeholder ?? ''} className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} /> Использовать по умолчанию
              </label>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
                <button type="submit" disabled={createMut.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>{createMut.isPending ? 'Добавляю...' : 'Добавить'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Templates Tab ───────────────────────────────────────────────────────────

const defaultTemplates = [
  { name: '📰 Новость', description: 'Стандартный новостной пост', content: '<b>{title}</b>\n\n{summary}\n\n<a href="{url}">Источник</a>', systemPrompt: 'Напиши новостной пост для Telegram. Краткий, информативный. HTML-форматирование.', category: 'news' },
  { name: '📝 Обзор', description: 'Обзор продукта или события', content: '<b>Обзор: {title}</b>\n\n{content}\n\n👍 Плюсы:\n👎 Минусы:\n\n⭐ Итог:', systemPrompt: 'Напиши обзор для Telegram. Структура: описание, плюсы, минусы, итог. HTML-форматирование.', category: 'review' },
  { name: '📢 Анонс', description: 'Анонс события или релиза', content: '<b>🔥 {title}</b>\n\n{summary}\n\n📅 Дата:\n📍 Где:\n\n<a href="{url}">Подробнее</a>', systemPrompt: 'Напиши анонс для Telegram. Кратко, с эмодзи, HTML-форматирование.', category: 'announcement' },
  { name: '❓ Опрос', description: 'Вопрос аудитории', content: '<b>{title}</b>\n\n{question}\n\nОтвет 1️⃣:\nОтвет 2️⃣:\nОтвет 3️⃣:', systemPrompt: 'Создай интерактивный пост-опрос для Telegram. С вариантами ответов.', category: 'poll' },
];

function TemplatesTab() {
  const qc = useQueryClient();
  const { data: templates, isLoading } = useQuery({ queryKey: ['templates'], queryFn: () => apiFetch('/templates') });
  const { confirm, dialog: confirmDlg } = useConfirm();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', content: '', systemPrompt: '', category: '' });
  const [editId, setEditId] = useState<number | null>(null);

  const createMut = useMutation({
    mutationFn: (data: any) => apiFetch('/templates', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); setShowAdd(false); resetForm(); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: any) => apiFetch(`/templates/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['templates'] }); setEditId(null); resetForm(); },
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/templates/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['templates'] }),
  });

  const resetForm = () => setForm({ name: '', description: '', content: '', systemPrompt: '', category: '' });

  const seedDefaults = () => {
    defaultTemplates.forEach((t) => createMut.mutate(t));
  };

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>;

  return (
    <div>
      {confirmDlg}
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          Шаблоны используются при создании постов вручную и через AI. Определяют структуру и стиль поста.
        </p>
        <button onClick={() => { resetForm(); setShowAdd(true); setEditId(null); }} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white shrink-0 ml-4" style={{ background: 'var(--primary)' }}>
          <Plus size={14} /> Создать
        </button>
      </div>

      {templates?.length === 0 ? (
        <div className="text-center py-12 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <FileText size={40} className="mx-auto mb-3 text-zinc-600" />
          <p className="font-medium mb-1">Нет шаблонов</p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Шаблоны помогают быстро создавать посты в нужном формате.</p>
          <button onClick={seedDefaults} disabled={createMut.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
            {createMut.isPending ? 'Добавляю...' : 'Добавить стандартные шаблоны'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {templates?.map((t: any) => (
            <div key={t.id} className="rounded-xl p-4 border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{t.name}</div>
                  {t.description && <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{t.description}</div>}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => { setForm(t); setEditId(t.id); setShowAdd(true); }} className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-white/5"><Pencil size={14} /></button>
                  <button onClick={() => confirm({ title: 'Удалить шаблон?', message: 'Шаблон будет удалён.', onConfirm: () => deleteMut.mutate(t.id) })} className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/15"><Trash2 size={14} /></button>
                </div>
              </div>
              {t.content && (
                <div className="mt-2 text-[11px] p-2 rounded-lg font-mono line-clamp-2" style={{ background: 'rgba(255,255,255,0.03)', color: 'var(--text-muted)' }}>
                  {t.content}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setShowAdd(false); setEditId(null); }}>
          <div className="w-full max-w-lg mx-4 p-6 rounded-2xl border max-h-[90vh] overflow-y-auto" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-4">{editId ? 'Редактировать шаблон' : 'Новый шаблон'}</h2>
            <form onSubmit={(e) => { e.preventDefault(); editId ? updateMut.mutate({ id: editId, ...form }) : createMut.mutate(form); }} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Название</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="📰 Новость" className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Описание</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Для чего этот шаблон" className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">HTML-шаблон</label>
                <textarea value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} rows={4} placeholder="<b>{title}</b>\n\n{summary}" className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Плейсхолдеры: {'{title}'}, {'{summary}'}, {'{content}'}, {'{url}'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">AI-промпт (для генерации)</label>
                <textarea value={form.systemPrompt ?? ''} onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })} rows={2} placeholder="Напиши новостной пост для Telegram..." className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => { setShowAdd(false); setEditId(null); }} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
                <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
                  {editId ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
