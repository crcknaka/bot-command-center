import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users as UsersIcon, Mail, Shield, UserCheck, UserX, Trash2, Bot } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { useConfirm } from '../components/ui/confirm-dialog.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { timeAgo } from '../lib/utils.js';
import { cn } from '../lib/utils.js';

export function UsersPage() {
  const qc = useQueryClient();
  const { data: usersList, isLoading } = useQuery({ queryKey: ['users'], queryFn: () => apiFetch('/users') });
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  const inviteMut = useMutation({
    mutationFn: (email: string) => apiFetch('/auth/invite', { method: 'POST', body: JSON.stringify({ email }) }),
    onSuccess: (data) => {
      setInviteResult(`Инвайт создан!\nID: ${data.inviteId}\nСсылка: /register?invite=${data.inviteId}`);
      setInviteEmail('');
    },
  });

  const toggleActiveMut = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      apiFetch(`/users/${id}`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/users/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });

  return (
    <div>
      {confirmDialog}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Пользователи</h1>
          <InfoTip text="Управление пользователями. Суперадмин видит всех, может деактивировать и удалять. Клиенты регистрируются только по инвайту." position="bottom" />
        </div>
        <button onClick={() => { setShowInvite(true); setInviteResult(null); }} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
          <Plus size={16} /> Пригласить
        </button>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-muted)' }}>Загрузка...</div>
      ) : (
        <div className="space-y-3">
          {usersList?.map((u: any) => (
            <div key={u.id} className="rounded-xl p-4 border flex items-center gap-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                style={{ background: u.role === 'superadmin' ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)', color: u.role === 'superadmin' ? '#60a5fa' : '#a855f7' }}>
                {u.name?.charAt(0)?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{u.name}</span>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded', u.role === 'superadmin' ? 'bg-blue-500/15 text-blue-400' : 'bg-purple-500/15 text-purple-400')}>
                    {u.role === 'superadmin' ? 'Админ' : 'Клиент'}
                  </span>
                  {!u.isActive && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Деактивирован</span>}
                </div>
                <div className="text-xs mt-0.5 flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
                  <span>{u.email}</span>
                  <span className="flex items-center gap-1"><Bot size={10} /> {u.botCount} ботов</span>
                  {u.lastLoginAt && <span>Вход: {timeAgo(u.lastLoginAt)}</span>}
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                {u.role !== 'superadmin' && (
                  <>
                    <button
                      onClick={() => toggleActiveMut.mutate({ id: u.id, isActive: !u.isActive })}
                      className={cn('px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors', u.isActive ? 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20' : 'bg-green-500/10 text-green-400 hover:bg-green-500/20')}
                    >
                      {u.isActive ? 'Деактивировать' : 'Активировать'}
                    </button>
                    <button
                      onClick={() => confirm({ title: 'Удалить пользователя?', message: `${u.name} и все его боты будут удалены безвозвратно.`, onConfirm: () => deleteMut.mutate(u.id) })}
                      className="p-1.5 rounded-lg text-red-400/50 hover:text-red-400 hover:bg-red-500/10"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowInvite(false)}>
          <div className="w-full max-w-md mx-4 p-6 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Пригласить клиента</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Введите email. Система создаст инвайт-ссылку (действует 7 дней). Отправьте её клиенту.
            </p>

            {inviteResult ? (
              <>
                <div className="rounded-lg p-3 text-xs bg-green-500/10 text-green-400 whitespace-pre-wrap mb-4">{inviteResult}</div>
                <div className="flex gap-2">
                  <button onClick={() => { navigator.clipboard.writeText(inviteResult ?? ''); }} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium bg-blue-500/15 text-blue-400">Скопировать</button>
                  <button onClick={() => setShowInvite(false)} className="flex-1 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>Закрыть</button>
                </div>
              </>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); inviteMut.mutate(inviteEmail); }}>
                <label className="block text-sm font-medium mb-1">Email клиента</label>
                <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="client@example.com" className="w-full px-3 py-2 rounded-lg border text-sm outline-none mb-4" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} required />
                <div className="flex gap-3 justify-end">
                  <button type="button" onClick={() => setShowInvite(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text-muted)' }}>Отмена</button>
                  <button type="submit" disabled={inviteMut.isPending} className="px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
                    {inviteMut.isPending ? 'Создаю...' : 'Создать инвайт'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
