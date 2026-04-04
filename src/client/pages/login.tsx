import { useState } from 'react';
import { useAuth } from '../lib/auth.js';
import { Bot } from 'lucide-react';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setError('Неверный email или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl border" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="text-center mb-8">
          <Bot size={40} className="mx-auto mb-3 text-blue-500" />
          <h1 className="text-xl font-bold">Bot Command Center</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Войдите, чтобы управлять ботами</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 rounded-lg p-3">{error}</div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@localhost"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-[var(--primary)] transition-colors"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-[var(--primary)] transition-colors"
              style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ background: loading ? 'var(--text-muted)' : 'var(--primary)' }}
          >
            {loading ? 'Входим...' : 'Войти'}
          </button>
        </form>
      </div>
    </div>
  );
}
