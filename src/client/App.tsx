import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './lib/auth.js';
import { I18nProvider } from './lib/i18n.js';
import { Sidebar } from './components/layout/sidebar.js';
import { AlertsBar } from './components/layout/alerts-bar.js';
import { LoginPage } from './pages/login.js';
import { DashboardPage } from './pages/dashboard.js';
import { ComposePage } from './pages/compose.js';
import { ChatPage } from './pages/chat.js';
import { BotsPage } from './pages/bots.js';
import { AnalyticsPage } from './pages/analytics.js';
import { MembersPage } from './pages/members.js';
import { PostsPage } from './pages/posts.js';
import { SettingsPage } from './pages/settings.js';
import { SchedulePage } from './pages/schedule.js';
import { DocsPage } from './pages/docs.js';
// integrations moved into settings tabs
import { BotDetailPage } from './pages/bot-detail.js';
import { ActivityPage } from './pages/activity.js';
import { UsersPage } from './pages/users.js';
import { RegisterPage } from './pages/register.js';
import { PollsPage } from './pages/polls.js';
import { ToastProvider } from './components/ui/toast.js';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1 },
  },
});

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="flex">
      <Sidebar />
      <main className="lg:ml-60 flex-1 min-w-0 p-4 pb-24 lg:p-8 min-h-screen">
        {user?.mustChangePassword && (
          <Link to="/settings" className="block rounded-xl border px-4 py-3 mb-6 text-sm text-red-400 hover:text-red-300" style={{ background: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.3)' }}>
            Вход защищён стандартным паролем, который знает любой. Смените его в настройках →
          </Link>
        )}
        <AlertsBar />
        {children}
      </main>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) return <div className="min-h-screen flex items-center justify-center" style={{ color: 'var(--text-muted)' }}>Loading...</div>;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/register" element={user ? <Navigate to="/" replace /> : <RegisterPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout><ComposePage /></AppLayout></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><AppLayout><ChatPage /></AppLayout></ProtectedRoute>} />
      <Route path="/overview" element={<ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
      <Route path="/bots" element={<ProtectedRoute><AppLayout><BotsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/bots/:id" element={<ProtectedRoute><AppLayout><BotDetailPage /></AppLayout></ProtectedRoute>} />
      <Route path="/posts" element={<ProtectedRoute><AppLayout><PostsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/schedule" element={<ProtectedRoute><AppLayout><SchedulePage /></AppLayout></ProtectedRoute>} />
      <Route path="/polls" element={<ProtectedRoute><AppLayout><PollsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><AppLayout><AnalyticsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/members" element={<ProtectedRoute><AppLayout><MembersPage /></AppLayout></ProtectedRoute>} />
      <Route path="/integrations" element={<Navigate to="/settings" replace />} />
      <Route path="/ai-providers" element={<Navigate to="/settings" replace />} />
      <Route path="/activity" element={<ProtectedRoute><AppLayout><ActivityPage /></AppLayout></ProtectedRoute>} />
      <Route path="/users" element={<ProtectedRoute><AppLayout><UsersPage /></AppLayout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><AppLayout><SettingsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/docs" element={<ProtectedRoute><AppLayout><DocsPage /></AppLayout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <AppRoutes />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}
