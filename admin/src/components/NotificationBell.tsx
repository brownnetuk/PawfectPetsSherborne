import { useEffect, useState } from 'react';
import * as api from '../api/client';
import type { NotificationItem } from '../api/client';
import { BellIcon } from './icons';
import Modal from './Modal';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Topbar notification centre: a bell with a red dot when there are unread
// notifications; clicking opens a modal with the feed and marks all read.
export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[] | null>(null);

  function refreshCount() {
    api
      .notificationsUnreadCount()
      .then((r) => setUnread(r.count))
      .catch(() => {});
  }

  useEffect(() => {
    refreshCount();
    const id = setInterval(refreshCount, 60000);
    return () => clearInterval(id);
  }, []);

  async function handleOpen() {
    setOpen(true);
    setItems(null);
    try {
      const list = await api.listNotifications();
      setItems(list);
      if (list.some((n) => !n.read)) {
        await api.markNotificationsRead();
        setUnread(0);
      }
    } catch {
      setItems([]);
    }
  }

  return (
    <>
      <button
        className="icon-btn notification-bell"
        onClick={handleOpen}
        title="Notifications"
        type="button"
        style={{ position: 'relative' }}
      >
        <BellIcon />
        {unread > 0 && (
          <span
            aria-label={`${unread} unread`}
            style={{
              position: 'absolute',
              top: 2,
              right: 2,
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: 'var(--error, #e5484d)',
              border: '2px solid var(--card, #fff)',
            }}
          />
        )}
      </button>

      {open && (
        <Modal title="Notifications" onClose={() => setOpen(false)}>
          {items === null ? (
            <div className="empty-state">Loading…</div>
          ) : items.length === 0 ? (
            <div className="empty-state">No notifications yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {items.map((n) => (
                <div
                  key={n._id}
                  style={{
                    padding: '10px 4px',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{n.title}</div>
                    <div style={{ color: 'var(--muted)', fontSize: '0.88rem' }}>{n.body}</div>
                  </div>
                  <div style={{ color: 'var(--muted)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                    {relativeTime(n.createdAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
