import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Bot, FileText, Calendar, BarChart3, UserCheck, Settings, Users, Activity, LogOut, Menu, X, BookOpen, ListChecks, ChevronDown, PenLine, MessagesSquare } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/auth.js';
import { useI18n } from '../../lib/i18n.js';
import { cn } from '../../lib/utils.js';
import { apiFetch } from '../../lib/api.js';
import { useAlerts } from '../home/use-workspace.js';

type NavItem = { path: string; labelKey: string; icon: typeof Bot; superadminOnly?: boolean };

// The three work screens; they are also the bottom bar on a phone
const mainItems: NavItem[] = [
  { path: '/', labelKey: 'nav.compose', icon: PenLine },
  { path: '/chat', labelKey: 'nav.chat', icon: MessagesSquare },
  { path: '/overview', labelKey: 'nav.overview', icon: LayoutDashboard },
];

// Lists behind them
const navItems: NavItem[] = [
  { path: '/posts', labelKey: 'nav.posts', icon: FileText },
  { path: '/schedule', labelKey: 'nav.schedule', icon: Calendar },
  { path: '/members', labelKey: 'nav.members', icon: UserCheck },
  { path: '/analytics', labelKey: 'nav.analytics', icon: BarChart3 },
];

// Setup and rarely used pages, folded under "More"
const moreItems: NavItem[] = [
  { path: '/bots', labelKey: 'nav.bots', icon: Bot },
  { path: '/polls', labelKey: 'nav.polls', icon: ListChecks },
  { path: '/activity', labelKey: 'nav.activity', icon: Activity, superadminOnly: true },
  { path: '/users', labelKey: 'nav.users', icon: Users, superadminOnly: true },
  { path: '/settings', labelKey: 'nav.settings', icon: Settings },
  { path: '/docs', labelKey: 'nav.docs', icon: BookOpen },
];

const MORE_KEY = 'nav:more';

export function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { count: alertCount } = useAlerts();
  const [moreOpen, setMoreOpen] = useState(() => { try { return localStorage.getItem(MORE_KEY) === '1'; } catch { return false; } });

  const toggleMore = () => {
    setMoreOpen((open) => {
      try { localStorage.setItem(MORE_KEY, open ? '0' : '1'); } catch {}
      return !open;
    });
  };

  const isActive = (path: string) => path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);
  const visible = (item: NavItem) => !item.superadminOnly || user?.role === 'superadmin';
  // Keep the group open while one of its pages is showing
  const showMore = moreOpen || moreItems.some((item) => isActive(item.path));

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    return (
      <Link
        key={item.path}
        to={item.path}
        onClick={() => setMobileOpen(false)}
        className={cn(
          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
          isActive(item.path) ? 'bg-blue-500/15 text-blue-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
        )}
      >
        <Icon size={18} />
        {t(item.labelKey)}
        {item.path === '/overview' && alertCount > 0 && (
          <span className="ml-auto text-[10px] px-1.5 rounded-full bg-red-500/20 text-red-400">{alertCount}</span>
        )}
      </Link>
    );
  };

  const { data: bots } = useQuery({
    queryKey: ['bots'],
    queryFn: () => apiFetch('/bots'),
    refetchInterval: 30000,
  });
  const totalBots = bots?.length ?? 0;
  const activeBots = bots?.filter((b: any) => b.status === 'active').length ?? 0;
  const hasErrors = bots?.some((b: any) => b.status === 'error') ?? false;

  const nav = (
    <>
      <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Bot size={20} className="text-blue-500" />
          <span className="hidden sm:inline">Command Center</span>
          <span className="sm:hidden">CC</span>
        </h1>
        <div className="flex items-center gap-2">
          {totalBots > 0 && (
            <Link to="/bots" className={cn('text-[10px] px-2 py-1 rounded-lg font-medium flex items-center gap-1',
              hasErrors ? 'bg-red-500/15 text-red-400' : activeBots > 0 ? 'bg-green-500/15 text-green-400' : 'bg-zinc-700/50 text-zinc-500'
            )} title={`${activeBots} из ${totalBots} ботов работает`}>
              <span className={cn('w-1.5 h-1.5 rounded-full', hasErrors ? 'bg-red-500' : activeBots > 0 ? 'bg-green-500' : 'bg-zinc-500')} />
              {activeBots}/{totalBots}
            </Link>
          )}
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1 rounded-lg hover:bg-white/5">
            <X size={18} />
          </button>
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {mainItems.map(renderItem)}
        <div className="my-2 border-t" style={{ borderColor: 'var(--border)' }} />
        {navItems.filter(visible).map(renderItem)}

        <button
          type="button"
          onClick={toggleMore}
          aria-expanded={showMore}
          className="w-full flex items-center justify-between px-3 py-2 mt-2 rounded-lg text-xs uppercase tracking-wide text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
        >
          {t('nav.more')}
          <ChevronDown size={14} className={cn('transition-transform', showMore && 'rotate-180')} />
        </button>
        {showMore && moreItems.filter(visible).map(renderItem)}
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
      {/* Mobile bottom bar: the three work screens plus the full menu */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-4 border-t" style={{ background: 'var(--bg-sidebar)', borderColor: 'var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {mainItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.path} to={item.path}
              className={cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px]', isActive(item.path) ? 'text-blue-400' : 'text-zinc-400')}>
              <Icon size={20} />
              {t(item.path === '/' ? 'nav.composeShort' : item.labelKey)}
              {item.path === '/overview' && alertCount > 0 && <span className="absolute top-1.5 right-1/4 w-2 h-2 rounded-full bg-red-500" />}
            </Link>
          );
        })}
        <button type="button" onClick={() => setMobileOpen(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-zinc-400">
          <Menu size={20} />
          {t('nav.menu')}
        </button>
      </nav>

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
