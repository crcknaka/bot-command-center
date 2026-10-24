import { Link, useLocation } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAlerts } from '../home/use-workspace.js';

/** One line above every screen when something needs a look: a stopped bot, posts that failed to send */
export function AlertsBar() {
  const location = useLocation();
  const { failedPosts, stoppedBots } = useAlerts();
  // The overview lists the same problems in its own block
  if (location.pathname === '/overview' || (failedPosts.length === 0 && stoppedBots.length === 0)) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2.5 mb-4 text-xs" style={{ background: 'rgba(239,68,68,0.06)', borderColor: 'rgba(239,68,68,0.25)' }}>
      <AlertTriangle size={14} className="text-red-400 shrink-0" />
      {stoppedBots.map((b: any) => (
        <Link key={b.id} to={`/bots/${b.id}`} className="text-orange-400 hover:text-orange-300">
          Бот «{b.name}» {b.status === 'error' ? 'упал с ошибкой' : 'остановлен'} — посты не уходят, модерация не работает →
        </Link>
      ))}
      {failedPosts.length > 0 && (
        <Link to="/posts?status=failed" className="text-red-400 hover:text-red-300">
          {failedPosts.length === 1 ? '1 пост не отправился' : `${failedPosts.length} постов не отправились`} →
        </Link>
      )}
    </div>
  );
}
