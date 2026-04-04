import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, MessageSquare, AlertTriangle } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { cn, timeAgo } from '../lib/utils.js';

const typeLabels: Record<string, string> = {
  text: 'Текст', photo: 'Фото', video: 'Видео', sticker: 'Стикер',
  voice: 'Голосовое', video_note: 'Кружок', animation: 'GIF',
  forward: 'Пересылка', document: 'Файл', audio: 'Аудио', other: 'Другое',
};

const violationLabels: Record<string, string> = {
  'mod.deleted': '🗑 Удалено', 'mod.muted': '🔇 Мут', 'mod.warned': '⚠️ Предупреждение',
};

export function UserProfileModal({ chatId, userId, onClose }: { chatId: string; userId: number; onClose: () => void }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const { data: profile } = useQuery({
    queryKey: ['user-profile', chatId, userId, search, page],
    queryFn: () => apiFetch(`/stats/chat/${chatId}/user/${userId}?search=${encodeURIComponent(search)}&offset=${page * 50}`),
  });

  if (!profile) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-zinc-700 flex items-center justify-center text-xl font-bold">
              {profile.userName?.[0]?.toUpperCase() ?? '?'}
            </div>
            <div>
              <h2 className="text-base font-bold">{profile.userName}</h2>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {profile.username ? `@${profile.username} · ` : ''}
                {profile.total} сообщений
                {profile.firstSeen && ` · с ${new Date(profile.firstSeen + 'Z').toLocaleDateString('ru')}`}
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-lg font-bold">{profile.total}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Сообщений</div>
            </div>
            <div className="text-center rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-lg font-bold">{Object.keys(profile.activity ?? {}).length}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Активных дней</div>
            </div>
            <div className="text-center rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <div className="text-lg font-bold text-red-400">{profile.violations?.length ?? 0}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Нарушений</div>
            </div>
          </div>

          {/* Types */}
          {Object.keys(profile.types ?? {}).length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(profile.types as Record<string, number>)
                .sort((a, b) => b[1] - a[1])
                .map(([type, cnt]) => (
                  <span key={type} className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-700/50" style={{ color: 'var(--text-muted)' }}>
                    {typeLabels[type] ?? type}: {cnt as number}
                  </span>
                ))}
            </div>
          )}

          {/* Violations */}
          {profile.violations?.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                <AlertTriangle size={12} className="text-red-400" /> Нарушения
              </h3>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {profile.violations.map((v: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-[10px] px-2 py-1 rounded" style={{ background: 'rgba(239,68,68,0.05)' }}>
                    <span className="text-red-400">{violationLabels[v.action] ?? v.action}</span>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {v.reason && <span className="mr-2">{v.reason}</span>}
                      {timeAgo(v.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Message search */}
          <div>
            <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5">
              <MessageSquare size={12} /> Сообщения
              {profile.searchTotal != null && <span className="font-normal" style={{ color: 'var(--text-muted)' }}>({profile.searchTotal} найдено)</span>}
            </h3>
            <div className="relative mb-2">
              <Search size={12} className="absolute left-2.5 top-2" style={{ color: 'var(--text-muted)' }} />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Поиск по сообщениям..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-none" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {profile.messages?.length === 0 && (
                <p className="text-[10px] text-center py-4" style={{ color: 'var(--text-muted)' }}>
                  {search ? 'Ничего не найдено' : 'Нет сообщений с текстом'}
                </p>
              )}
              {profile.messages?.map((m: any) => (
                <div key={m.id} className="flex gap-2 px-2 py-1.5 rounded text-[11px] hover:bg-white/[0.02]">
                  <span className="text-[9px] shrink-0 mt-0.5 w-10 text-right font-mono" style={{ color: 'var(--text-muted)' }}>
                    {new Date(m.createdAt + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <div className="flex-1 min-w-0">
                    {m.text ? (
                      <span>{search ? highlightSearch(m.text, search) : m.text}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>[{typeLabels[m.type] ?? m.type}]</span>
                    )}
                  </div>
                  <span className="text-[9px] shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {new Date(m.createdAt + 'Z').toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })}
                  </span>
                </div>
              ))}
              {profile.hasMore && (
                <button onClick={() => setPage(p => p + 1)} className="w-full py-2 text-[11px] text-blue-400 hover:text-blue-300">
                  Загрузить ещё
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
          <button onClick={onClose} className="w-full py-2 rounded-lg text-xs hover:bg-white/5" style={{ color: 'var(--text-muted)' }}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

function highlightSearch(text: string, search: string) {
  if (!search) return text;
  const idx = text.toLowerCase().indexOf(search.toLowerCase());
  if (idx === -1) return text;
  return (
    <span>
      {text.slice(0, idx)}
      <mark className="bg-yellow-500/30 text-yellow-200 rounded px-0.5">{text.slice(idx, idx + search.length)}</mark>
      {text.slice(idx + search.length)}
    </span>
  );
}
