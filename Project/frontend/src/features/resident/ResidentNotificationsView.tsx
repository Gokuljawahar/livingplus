import { Bell, Check } from 'lucide-react';
import { Card, EmptyState } from '../../components/ui';
import type { ResidentNotification } from './types';

interface Props {
  notifications: ResidentNotification[];
  onMarkRead: (notificationId: string) => Promise<void>;
}

export default function ResidentNotificationsView({ notifications, onMarkRead }: Props) {
  if (!notifications.length) {
    return <EmptyState title="No notifications yet. You're all caught up!" />;
  }

  return (
    <div className="space-y-4">
      <Card className="p-5 sm:p-6">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-ink">
          <Bell className="h-4 w-4 text-navy-900" /> All notifications
        </h2>
        <div className="divide-y divide-hairline overflow-hidden rounded-[var(--radius-card)] border border-hairline">
          {notifications.slice(0, 10).map((notification) => (
            <article
              key={notification.id}
              className={`flex items-start justify-between gap-4 p-4 transition-colors hover:bg-surface/50 ${notification.readAt ? 'opacity-65' : 'bg-surface/40'}`}
            >
              <div>
                <p className="text-sm font-bold text-ink">{notification.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{notification.message}</p>
                <p className="mt-1 text-xs font-medium text-muted">{new Date(notification.createdAt).toLocaleString()}</p>
              </div>
              {!notification.readAt && (
                <button
                  onClick={() => void onMarkRead(notification.id)}
                  aria-label="Mark notification as read"
                  title="Mark as read"
                  className="shrink-0 rounded-[var(--radius-field)] p-2 text-muted transition-colors hover:bg-surface hover:text-positive"
                >
                  <Check className="h-4 w-4" />
                </button>
              )}
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}
