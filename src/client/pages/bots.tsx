import { useState, useRef } from 'react';
import { Plus, Bot as BotIcon, Upload } from 'lucide-react';
import { Spinner } from '../components/ui/spinner.js';
import { useBots, useCreateBot } from '../hooks/use-bots.js';
import { useToast } from '../components/ui/toast.js';
import { BotCard } from '../components/bot-card.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { apiFetch } from '../lib/api.js';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

export function BotsPage() {
  const { data: bots, isLoading } = useBots();
  const createBot = useCreateBot();
  const toast = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [showAddBot, setShowAddBot] = useState(false);
  const [token, setToken] = useState('');
  const [botSearch, setBotSearch] = useState('');
  const [importing, setImporting] = useState(false);

  const handleImport = async (file: File) => {
    try {
      setImporting(true);
      const text = await file.text();
      const data = JSON.parse(text);
      const res = await apiFetch('/bots/import', { method: 'POST', body: JSON.stringify(data) });
      qc.invalidateQueries({ queryKey: ['bots'] });
      toast.success(`Импортировано! ${res.channels} каналов, ${res.tasks} задач.`);
      navigate(`/bots/${res.botId}`);
    } catch (err) {
      toast.error(`Ошибка импорта: ${(err as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  const handleAddBot = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createBot.mutateAsync(token);
      setToken('');
      setShowAddBot(false);
      toast.success('Бот успешно добавлен!');
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Боты</h1>
          <InfoTip text="Все ваши Telegram-боты. Добавьте бота, запустите, затем настройте каналы и задачи." position="bottom" />
        </div>
        <div className="flex gap-2">
          <input ref={fileInput} type="file" accept=".json" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleImport(e.target.files[0]); e.target.value = ''; }} />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-white/5 transition-colors"
            title="Импорт бота из JSON-файла"
          >
            <Upload size={16} /> {importing ? 'Импорт...' : 'Импорт'}
          </button>
          <button
            onClick={() => setShowAddBot(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors hover:opacity-90"
            style={{ background: 'var(--primary)' }}
          >
            <Plus size={16} /> Добавить бота
          </button>
        </div>
      </div>

      {isLoading ? (
        <Spinner text="Загрузка ботов..." />
      ) : bots?.length === 0 ? (
        <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <BotIcon size={40} className="mx-auto mb-3 text-zinc-600" />
          <h2 className="text-lg font-semibold mb-2">Пока нет ботов</h2>
          <p className="text-sm mb-1" style={{ color: 'var(--text-muted)' }}>
            Добавьте первого Telegram-бота, чтобы начать.
          </p>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            Откройте <b>@BotFather</b> в Telegram → отправьте <code>/newbot</code> → скопируйте токен → вставьте сюда.
          </p>
          <button onClick={() => setShowAddBot(true)} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
            <Plus size={16} className="inline mr-1" /> Добавить бота
          </button>
        </div>
      ) : (
        <div>
          {(bots?.length ?? 0) > 3 && (
            <div className="mb-4">
              <input
                type="text"
                value={botSearch}
                onChange={(e) => setBotSearch(e.target.value)}
                placeholder="Поиск по ботам..."
                className="px-3 py-1.5 rounded-lg border text-xs outline-none w-full sm:w-64"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
              />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {(botSearch
              ? bots!.filter((bot: any) => bot.name.toLowerCase().includes(botSearch.toLowerCase()) || bot.username?.toLowerCase().includes(botSearch.toLowerCase()))
              : bots!
            ).map((bot: any) => <BotCard key={bot.id} bot={bot} />)}
          </div>
        </div>
      )}

      {/* Add Bot Modal */}
      {showAddBot && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onMouseDown={(e) => { if (e.target === e.currentTarget) (() => setShowAddBot(false))(); }}>
          <div className="w-full max-w-md mx-4 p-6 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Добавить Telegram-бота</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Откройте <b>@BotFather</b> в Telegram → отправьте <code>/newbot</code> → следуйте инструкциям → скопируйте токен API и вставьте ниже.
            </p>
            <form onSubmit={handleAddBot}>
              <label className="block text-sm font-medium mb-1.5">Токен бота</label>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456789:ABCdefGHI..."
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-[var(--primary)] mb-4 font-mono"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
                required
              />
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowAddBot(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>
                  Отмена
                </button>
                <button type="submit" disabled={createBot.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
                  {createBot.isPending ? 'Проверяю токен...' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
