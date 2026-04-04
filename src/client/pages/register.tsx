import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Bot, Loader2 } from 'lucide-react';
import { setToken } from '../lib/api.js';

export function RegisterPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inviteId = searchParams.get('invite') ?? '';

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [inviteError, setInviteError] = useState('');

  // Check invite validity on mount
  useEffect(() => {
    if (!inviteId) { setInviteError('Отсутствует код приглашения.'); setChecking(false); return; }
    fetch(`/api/auth/invite/${inviteId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setInviteError(data.error); }
        else { setEmail(data.email); }
      })
      .catch(() => setInviteError('Ошибка проверки приглашения.'))
      .finally(() => setChecking(false));
  }, [inviteId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId, name, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Ошибка регистрации'); return; }
      setToken(data.token);
      navigate('/');
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="text-center mb-8">
          <Bot size={40} className="mx-auto mb-3 text-blue-500" />
          <h1 className="text-xl font-bold">Регистрация</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Создайте аккаунт по приглашению</p>
        </div>

        {checking ? (
          <div className="flex items-center justify-center py-8 gap-2" style={{ color: 'var(--text-muted)' }}>
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">Проверяю приглашение...</span>
          </div>
        ) : inviteError ? (
          <div className="text-center py-8">
            <div className="text-sm text-red-400 bg-red-500/10 rounded-lg p-4 mb-4">{inviteError}</div>
            <a href="/login" className="text-sm text-blue-400 hover:text-blue-300">Перейти к входу</a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="text-sm text-red-400 bg-red-500/10 rounded-lg p-3">{error}</div>}

            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input type="email" value={email} disabled
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none opacity-60"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} />
              <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Email из приглашения, изменить нельзя</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Имя</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Ваше имя"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-[var(--primary)] transition-colors"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
                required />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Пароль</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 6 символов"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-[var(--primary)] transition-colors"
                style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
                required minLength={6} />
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ background: loading ? 'var(--text-muted)' : 'var(--primary)' }}>
              {loading ? 'Создаю аккаунт...' : 'Зарегистрироваться'}
            </button>

            <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
              Уже есть аккаунт? <a href="/login" className="text-blue-400 hover:text-blue-300">Войти</a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
