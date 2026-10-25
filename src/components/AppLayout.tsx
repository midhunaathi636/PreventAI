import { useState, useEffect, type ReactNode } from 'react';
import {
  Bell, LogOut, Menu, X, Shield,
  LayoutDashboard, TrendingUp, HeartPulse, Watch, User, Settings,
  Users, AlertTriangle, ClipboardCheck, BarChart3, CalendarDays,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, Link } from '@/context/RouterContext';
import { Avatar } from '@/components/ui';
import { LogoMark } from '@/components/Logo';
import { getInitials, classNames } from '@/lib/utils';
import { NotificationsDropdown } from '@/components/NotificationsDropdown';
import { apiClient } from '@/lib/aws-api-client';

interface NavItem {
  label: string;
  path: string;
  icon: ReactNode;
}

const patientNav: NavItem[] = [
  { label: 'Overview', path: '/patient', icon: <LayoutDashboard size={18} /> },
  { label: 'Risk Trajectory', path: '/patient/risk', icon: <TrendingUp size={18} /> },
  { label: 'My Plan', path: '/patient/my-plan', icon: <HeartPulse size={18} /> },
  { label: 'Wearables', path: '/patient/wearables', icon: <Watch size={18} /> },
  { label: 'Care & Records', path: '/patient/care', icon: <CalendarDays size={18} /> },
  { label: 'Profile', path: '/patient/profile', icon: <User size={18} /> },
  { label: 'Settings', path: '/patient/settings', icon: <Settings size={18} /> },
];

const clinicianNav: NavItem[] = [
  { label: 'Patients', path: '/clinician', icon: <Users size={18} /> },
  { label: 'Care Desk', path: '/clinician/care', icon: <CalendarDays size={18} /> },
  { label: 'Risk Monitor', path: '/clinician/risk-monitor', icon: <AlertTriangle size={18} /> },
  { label: 'Plans Review', path: '/clinician/plans-review', icon: <ClipboardCheck size={18} /> },
  { label: 'Analytics', path: '/clinician/analytics', icon: <BarChart3 size={18} /> },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const { profile, signOut } = useAuth();
  const { path, navigate } = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!profile) return;
    loadUnread();
    // Poll for unread notifications every 30 seconds
    const interval = setInterval(loadUnread, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  async function loadUnread() {
    if (!profile) return;
    try {
      const data = await apiClient.getNotifications();
      const unreadCount = data?.filter((n) => !n.read).length || 0;
      setUnreadCount(unreadCount);
    } catch (error) {
      console.error('Failed to load unread count', error);
    }
  }

  if (!profile) return null;

  const nav = profile.role === 'clinician' || profile.role === 'doctor' ? clinicianNav : patientNav;
  const isActive = (itemPath: string) =>
    itemPath === path || (itemPath !== `/${profile.role}` && path.startsWith(itemPath));

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen bg-bg">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-bg-deep/80 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={classNames(
          'fixed top-0 z-40 flex h-screen w-64 flex-col border-r border-hairline bg-surface',
          'transition-transform duration-300 ease-out lg:sticky lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-hairline px-5">
          <LogoMark size={34} className="flex-shrink-0" />
          <div className="min-w-0">
            <div className="font-display text-xl uppercase leading-none text-ink">PreventAI</div>
            <div className="text-small text-ink-faint">Four agents, one plan</div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-3 px-3 text-small font-semibold text-ink-faint">
            {profile.role === 'clinician' || profile.role === 'doctor' ? 'Clinician' : 'Patient'}
          </div>
          {nav.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setSidebarOpen(false)}
              className={classNames(
                'mb-0.5 flex items-center gap-3 rounded px-3 py-2.5 text-small font-semibold',
                'transition-colors duration-150',
                isActive(item.path)
                  ? 'bg-surface-3 text-accent'
                  : 'text-ink-dim hover:bg-surface-2 hover:text-ink'
              )}
              aria-current={isActive(item.path) ? 'page' : undefined}
            >
              <span className={isActive(item.path) ? 'text-accent' : 'text-ink-faint'}>
                {item.icon}
              </span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-hairline p-3">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar initials={getInitials(profile.first_name, profile.last_name)} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-small font-semibold text-ink">
                {profile.first_name} {profile.last_name}
              </div>
              <div className="text-small text-ink-faint">
                {profile.role === 'patient' ? 'Patient' : 'Clinician'}
              </div>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-1 flex w-full items-center gap-3 rounded px-3 py-2.5 text-small font-semibold text-ink-dim transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <LogOut size={18} className="text-ink-faint" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-hairline bg-bg px-4 lg:px-6">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded p-2 text-ink-dim transition-colors hover:text-ink lg:hidden"
            aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>

          <div className="hidden items-center gap-2 text-small text-ink-faint lg:flex">
            <Shield size={15} className="text-risk-low" />
            <span>Encrypted in transit and at rest</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative rounded p-2.5 text-ink-dim transition-colors hover:text-ink"
                aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="tabular absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-ink">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
              {notifOpen && (
                <NotificationsDropdown
                  userId={profile.id}
                  onClose={() => setNotifOpen(false)}
                  onMarkRead={loadUnread}
                />
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
