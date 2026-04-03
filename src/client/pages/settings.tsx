import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Check, Plus, Trash2, Zap, X, Settings2, Cpu, Search } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { cn } from '../lib/utils.js';

// ─── Tabs ────────────────────────────────────────────────────────────────────

const tabs = [
  { id: 'general', label: 'Общие', icon: Settings2 },
  { id: 'ai', label: 'AI-модели', icon: Cpu },
  { id: 'search', label: 'Поиск', icon: Search },
] as const;

type TabId = (typeof tabs)[number]['id'];

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('general');

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Настройки</h1>
        <InfoTip text="Глобальные настройки платформы: общие параметры, AI-модели для генерации постов и Tavily для поиска новостей. Для каждого бота можно переопределить отдельно." position="bottom" />
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

  const fields = [
    { key: 'default_timezone', label: 'Часовой пояс', type: 'text', description: 'Например: Europe/Moscow, Asia/Almaty, US/Eastern' },
    { key: 'default_system_prompt', label: 'Системный промпт по умолчанию', type: 'textarea', description: 'Глобальная инструкция для AI. У каждого бота можно переопределить свой промпт.' },
  ];

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>;

  return (
    <div className="max-w-xl space-y-5">
      {fields.map((field) => (
        <div key={field.key}>
          <label className="block text-sm font-medium mb-1">{field.label}</label>
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{field.description}</p>
          {field.type === 'textarea' ? (
            <textarea
              value={form[field.key] ?? ''}
              onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none resize-none focus:border-blue-500"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
              placeholder="Ты — редактор Telegram-канала. Создавай информативные посты с HTML-форматированием. Используй эмодзи умеренно."
            />
          ) : (
            <input type={field.type} value={form[field.key] ?? ''} onChange={(e) => setForm({ ...form, [field.key]: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-blue-500" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
          )}
        </div>
      ))}
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
                    <button onClick={() => { if (confirm('Удалить?')) deleteMut.mutate(p.id); }} className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/15"><Trash2 size={16} /></button>
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
                    <button onClick={() => { if (confirm('Удалить?')) deleteMut.mutate(p.id); }} className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/15"><Trash2 size={16} /></button>
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
