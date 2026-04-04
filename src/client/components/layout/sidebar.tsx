import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bot, FileText, Calendar, Settings, Users, Activity, LogOut, Menu, X, BookOpen } from 'lucide-react';
import { useAuth } from '../../lib/auth.js';
import { useI18n } from '../../lib/i18n.js';
import { cn } from '../../lib/utils.js';

const navItems = [
  { path: '/', labelKey: 'nav.home', icon: LayoutDashboard },
  { path: '/posts', labelKey: 'nav.posts', icon: FileText },
  { path: '/schedule', labelKey: 'nav.schedule', icon: Calendar },
  { path: '/activity', labelKey: 'nav.activity', icon: Activity, superadminOnly: true },
  { path: '/users', labelKey: 'nav.users', icon: Users, superadminOnly: true },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings },
  { path: '/docs', labelKey: 'nav.docs', icon: BookOpen },
];

export function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);

  const nav = (
    <>
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Bot size={20} className="text-blue-500" />
          <span className="hidden sm:inline">Command Center</span>
          <span className="sm:hidden">CC</span>
        </h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 rounded-lg hover:bg-white/5">
            <X size={18} />
          </button>
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {navItems
          .filter((item) => !item.superadminOnly || user?.role === 'superadmin')
          .map((item) => {
            const Icon = item.icon;
            const active = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  active ? 'bg-blue-500/15 text-blue-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
                )}
              >
                <Icon size={18} />
                {t(item.labelKey)}
              </Link>
            );
          })}
      </nav>

      <div className="p-4 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between">
          <div className="text-sm min-w-0">
            <div className="font-medium truncate">{user?.name}</div>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {t(`role.${user?.role ?? 'client'}`)}
            </div>
          </div>
          <button onClick={logout} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors shrink-0">
            <LogOut size={14} /> {t('nav.logout')}
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-40 p-2 rounded-lg border"
        style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/60 z-50" onClick={() => setMobileOpen(false)}>
          <aside
            className="w-64 h-full flex flex-col"
            style={{ background: 'var(--bg-sidebar)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {nav}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 h-screen fixed left-0 top-0 flex-col border-r"
        style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)' }}>
        {nav}
      </aside>
    </>
  );
}
