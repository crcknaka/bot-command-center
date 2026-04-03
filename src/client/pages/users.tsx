import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Users as UsersIcon, Mail, Shield, UserCheck } from 'lucide-react';
import { apiFetch } from '../lib/api.js';
import { InfoTip } from '../components/ui/tooltip.js';
import { timeAgo } from '../lib/utils.js';

export function UsersPage() {
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteResult, setInviteResult] = useState<string | null>(null);

  const inviteMut = useMutation({
    mutationFn: (email: string) => apiFetch('/auth/invite', { method: 'POST', body: JSON.stringify({ email }) }),
    onSuccess: (data) => {
      setInviteResult(`Инвайт создан! ID: ${data.inviteId}\nОтправьте эту ссылку клиенту: /register?invite=${data.inviteId}`);
      setInviteEmail('');
    },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Пользователи</h1>
          <InfoTip text="Управление клиентами. Вы можете приглашать клиентов по email — они получат ссылку для регистрации и смогут управлять только своими ботами." position="bottom" />
        </div>
        <button onClick={() => setShowInvite(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white" style={{ background: 'var(--primary)' }}>
          <Plus size={16} /> Пригласить клиента
        </button>
      </div>

      <div className="text-center py-16 rounded-xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <UsersIcon size={40} className="mx-auto mb-3 text-zinc-600" />
        <p className="font-medium mb-1">Управление клиентами</p>
        <p className="text-xs max-w-sm mx-auto mb-4" style={{ color: 'var(--text-muted)' }}>
          Нажмите «Пригласить клиента», чтобы отправить приглашение. Клиент сможет зарегистрироваться и управлять своими ботами.
        </p>
        <button onClick={() => setShowInvite(true)} className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-500/15 text-blue-400">
          <Mail size={14} className="inline mr-1.5" /> Пригласить
        </button>
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setShowInvite(false); setInviteResult(null); }}>
          <div className="w-full max-w-md p-6 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-1">Пригласить клиента</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
              Введите email клиента. Система создаст инвайт-ссылку, которую нужно отправить клиенту. Ссылка действует 7 дней.
            </p>

            {inviteResult ? (
              <div className="rounded-lg p-3 text-xs bg-green-500/10 text-green-400 whitespace-pre-wrap mb-4">
                {inviteResult}
              </div>
            ) : (
              <form onSubmit={(e) => { e.preventDefault(); inviteMut.mutate(inviteEmail); }}>
                <label className="block text-sm font-medium mb-1">Email клиента</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="client@example.com"
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none mb-4"
                  style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
                  required
                />
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
