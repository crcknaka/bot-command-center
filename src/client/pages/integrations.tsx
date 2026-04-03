import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Zap, Check, X, Cpu, Search, Save } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { cn } from '../lib/utils.js';

// ─── Tabs ────────────────────────────────────────────────────────────────────

const tabs = [
  { id: 'ai', label: 'AI-модели', icon: Cpu, desc: 'OpenAI, Anthropic, Gemini, OpenRouter' },
  { id: 'search', label: 'Поиск', icon: Search, desc: 'Tavily — поиск новостей в интернете' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export function IntegrationsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('ai');

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">Интеграции</h1>
        <InfoTip text="Подключение внешних сервисов: AI-модели для генерации постов и Tavily для поиска новостей. Ключи можно задать глобально (здесь) или для каждого бота отдельно (в настройках бота)." position="bottom" />
      </div>

      {/* Tab bar */}
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

      {activeTab === 'ai' && <AIModelsTab />}
      {activeTab === 'search' && <SearchTab />}
    </div>
  );
}

// ─── AI Models Tab ───────────────────────────────────────────────────────────

const providerTypes = [
  { value: 'openai', label: 'OpenAI', desc: 'GPT-4o, o3 и другие', models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
  { value: 'anthropic', label: 'Anthropic', desc: 'Claude Sonnet, Haiku', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'] },
  { value: 'google', label: 'Google Gemini', desc: 'Gemini 2.5 Flash/Pro', models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
  { value: 'openrouter', label: 'OpenRouter', desc: '100+ моделей через один ключ', models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514', 'google/gemini-2.5-flash'] },
];

function AIModelsTab() {
  const qc = useQueryClient();
  const { data: providers, isLoading } = useQuery({ queryKey: ['ai-providers'], queryFn: () => apiFetch('/ai-providers') });
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'openai', apiKey: '', isDefault: false });
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
    mutationFn: ({ id, modelId }: { id: number; modelId: string }) =>
      apiFetch(`/ai-providers/${id}/test`, { method: 'POST', body: JSON.stringify({ modelId }) }),
    onSuccess: (data, vars) => setTestResult((prev) => ({ ...prev, [vars.id]: { ok: data.ok, msg: data.response ?? data.error } })),
    onError: (err, vars) => setTestResult((prev) => ({ ...prev, [vars.id]: { ok: false, msg: (err as Error).message } })),
  });

  if (isLoading) return <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          AI-модели генерируют посты из новостей. Это глобальные провайдеры — доступны всем ботам. Для отдельного бота можно переназначить в его настройках.
        </p>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-white shrink-0 ml-4" style={{ background: 'var(--primary)' }}>
          <Plus size={14} /> Добавить
        </button>
      </div>

      {providers?.length === 0 ? (
        <div className="text-center py-12 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Zap size={40} className="mx-auto mb-3 text-zinc-600" />
          <p className="font-medium mb-1">Нет AI-провайдеров</p>
          <p className="text-xs mb-4 max-w-sm mx-auto" style={{ color: 'var(--text-muted)' }}>
            Нужен хотя бы один AI-провайдер для генерации постов.<br />
            Получите API-ключ на сайте <b>OpenAI</b>, <b>Anthropic</b>, <b>Google</b> или <b>OpenRouter</b>.
          </p>
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
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {typeInfo?.label ?? p.type} · {typeInfo?.desc ?? ''} · Ключ: {p.apiKey ?? 'не задан'}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => testMut.mutate({ id: p.id, modelId: typeInfo?.models[0] ?? 'gpt-4o' })} disabled={testMut.isPending} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25">
                      Проверить
                    </button>
                    <button onClick={() => { if (confirm('Удалить этого провайдера?')) deleteMut.mutate(p.id); }} className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/15">
                      <Trash2 size={16} />
                    </button>
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

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAdd(false)}>
          <div className="w-full max-w-md p-6 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Добавить AI-провайдера</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Выберите сервис и вставьте API-ключ. Бот будет использовать эту модель для генерации постов.
            </p>
            <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }} className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Название</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: Мой OpenAI" className="w-full px-3 py-2 rounded-lg border text-sm outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Сервис</label>
                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
                  {providerTypes.map((t) => <option key={t.value} value={t.value}>{t.label} — {t.desc}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 flex items-center gap-1.5">
                  API-ключ
                  <InfoTip text="Ключ для доступа к API. Получите его на сайте провайдера в разделе API Keys." position="right" />
                </label>
                <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} placeholder="sk-..." className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
                Использовать по умолчанию
              </label>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
                <button type="submit" disabled={createMut.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
                  {createMut.isPending ? 'Добавляю...' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Search Tab (Tavily) ─────────────────────────────────────────────────────

function SearchTab() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: () => apiFetch('/settings') });
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings?.tavily_api_key) setKey(settings.tavily_api_key);
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: () => apiFetch('/settings', { method: 'PUT', body: JSON.stringify({ tavily_api_key: key }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  return (
    <div className="max-w-xl">
      <div className="rounded-xl p-5 border mb-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-2 mb-3">
          <Search size={18} className="text-blue-400" />
          <h3 className="font-semibold">Tavily</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">Поиск новостей</span>
        </div>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
          Tavily — сервис поиска в интернете. Бот использует его для нахождения свежих новостей по ключевым словам.
          Бесплатный тариф: 1000 запросов/мес. Получите ключ на <b>tavily.com</b>
        </p>

        <label className="block text-sm font-medium mb-1">Глобальный API-ключ</label>
        <p className="text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
          Используется всеми ботами, если у бота не задан свой ключ.
        </p>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="tvly-..."
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none font-mono mb-4"
          style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
        />

        <button
          onClick={() => saveMut.mutate()}
          disabled={saveMut.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          style={{ background: saved ? 'var(--success)' : 'var(--primary)' }}
        >
          {saved ? <><Check size={14} /> Сохранено</> : <><Save size={14} /> {saveMut.isPending ? 'Сохраняю...' : 'Сохранить'}</>}
        </button>
      </div>

      <div className="rounded-lg p-3 text-xs" style={{ background: 'rgba(59,130,246,0.06)' }}>
        <span style={{ color: 'var(--text-muted)' }}>
          💡 Каждому боту можно задать свой Tavily-ключ в его настройках (страница бота → «API-ключи»).
          Если у бота нет своего ключа — используется глобальный, указанный здесь.
        </span>
      </div>
    </div>
  );
}
