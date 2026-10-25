import { useState, useEffect, useRef } from 'react';
import { Bell, Check, Trash2, AlertTriangle, Activity, ClipboardList, Info } from 'lucide-react';
import { apiClient } from '@/lib/aws-api-client';
import { timeAgo, classNames } from '@/lib/utils';
import type { Notification, NotificationType } from '@/lib/types';
import { Spinner, EmptyState } from '@/components/ui';

export function NotificationsDropdown({ userId, onClose, onMarkRead }: { userId: string; onClose: () => void; onMarkRead: () => void }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadNotifications();

    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadNotifications() {
    try {
      const data = await apiClient.getNotifications();
      setNotifications(data || []);
    } catch (error) {
      console.error('Failed to load notifications', error);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }

  async function markAllRead() {
    try {
      const unread = notifications.filter((n) => !n.read);
      await Promise.all(unread.map((n) => apiClient.markNotificationRead(n.id)));
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      onMarkRead();
    } catch (error) {
      console.error('Failed to mark all as read', error);
    }
  }

  async function markOneRead(id: string) {
    try {
      await apiClient.markNotificationRead(id);
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      onMarkRead();
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }
  }

  async function deleteOne(id: string) {
    try {
      await apiClient.deleteNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      onMarkRead();
    } catch (error) {
      console.error('Failed to delete notification', error);
    }
  }

  const iconFor = (type: NotificationType | null | undefined) => {
    switch (type) {
      case 'risk_alert': return <AlertTriangle size={16} className="text-risk-very-high" />;
      case 'plan_update': return <ClipboardList size={16} className="text-accent" />;
      case 'adherence_reminder': return <Check size={16} className="text-amber-500" />;
      case 'agent_activity': return <Activity size={16} className="text-blue-500" />;
      default: return <Info size={16} className="text-ink-faint" />;
    }
  };

  return (
    <div ref={ref} className="absolute right-0 mt-2 w-96 bg-surface rounded border border-hairline shadow-2xl shadow-black/60 z-50 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-hairline">
        <div className="flex items-center gap-2">
          <Bell size={18} className="text-ink-dim" />
          <span className="font-semibold text-ink">Notifications</span>
        </div>
        {notifications.some((n) => !n.read) && (
          <button
            onClick={markAllRead}
            className="text-smallall text-accent hover:text-accent-bright font-medium"
          >
            Mark all read
          </button>
        )}
      </div>
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : notifications.length === 0 ? (
          <EmptyState
            icon={<Bell size={32} />}
            title="No notifications"
            message="You're all caught up."
          />
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={classNames(
                'flex items-start gap-3 p-4 border-b border-hairline hover:bg-surface-2 transition-colors group',
                !n.read && 'bg-accent/5'
              )}
            >
              <div className="mt-0.5 flex-shrink-0">{iconFor(n.type ?? 'system')}</div>
              <div className="flex-1 min-w-0">
                <div className="text-small font-medium text-ink">{n.title}</div>
                <div className="text-small text-ink-dim mt-0.5">{n.message}</div>
                <div className="text-smallall text-ink-faint mt-1">{timeAgo(n.created_at)}</div>
              </div>
              <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {!n.read && (
                  <button onClick={() => markOneRead(n.id)} className="text-ink-faint hover:text-accent" title="Mark read">
                    <Check size={16} />
                  </button>
                )}
                <button onClick={() => deleteOne(n.id)} className="text-ink-faint hover:text-risk-very-high" title="Delete">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
