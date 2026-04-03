import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Zap, Check, X } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { InfoTip } from '../components/ui/tooltip.js';

const providerTypes = [
  { value: 'openai', label: 'OpenAI', desc: 'GPT-4o, o3 и другие', models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'] },
  { value: 'anthropic', label: 'Anthropic', desc: 'Claude Sonnet, Haiku', models: ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001'] },
  { value: 'google', label: 'Google Gemini', desc: 'Gemini 2.5 Flash/Pro', models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
  { value: 'openrouter', label: 'OpenRouter', desc: '100+ моделей через один ключ', models: ['openai/gpt-4o', 'anthropic/claude-sonnet-4-20250514', 'google/gemini-2.5-flash'] },
];

export function AIProvidersPage() {
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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">AI-модели</h1>
          <InfoTip text="AI-модели генерируют посты из новостей. Добавьте API-ключ от OpenAI, Anthropic, Google Gemini или OpenRouter — бот будет превращать сырые новости в красивые Telegram-посты." position="bottom" />
        </div>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
          <Plus size={16} /> Добавить провайдера
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-12" style={{ color: 'var(--text-muted)' }}>Загрузка...</div>
      ) : providers?.length === 0 ? (
        <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <Zap size={48} className="mx-auto mb-4 text-zinc-600" />
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
                    <button
                      onClick={() => testMut.mutate({ id: p.id, modelId: typeInfo?.models[0] ?? 'gpt-4o' })}
                      disabled={testMut.isPending}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/15 text-blue-400 hover:bg-blue-500/25"
                    >
                      Проверить
                    </button>
                    <button
                      onClick={() => { if (confirm('Удалить этого провайдера?')) deleteMut.mutate(p.id); }}
                      className="p-1.5 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/15"
                    >
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
                <InfoTip text="Эта модель будет использоваться для генерации постов, если не выбрана другая." position="right" />
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
