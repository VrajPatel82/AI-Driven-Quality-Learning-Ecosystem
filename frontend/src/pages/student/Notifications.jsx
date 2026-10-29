import { useState, useEffect } from 'react';
import { notificationsAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function StudentNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchNotifications(); }, []);

  const fetchNotifications = async () => {
    try {
      const res = await notificationsAPI.getMy();
      setNotifications(res.data.data || []);
    } catch (err) { toast.error('Failed to load notifications'); }
    finally { setLoading(false); }
  };

  const markRead = async (id) => {
    try {
      await notificationsAPI.markRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, isRead: true } : n));
    } catch (err) { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await notificationsAPI.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      toast.success('All marked as read');
    } catch (err) { toast.error('Failed to mark all read'); }
  };

  const handleDelete = async (id) => {
    try {
      await notificationsAPI.delete(id);
      setNotifications(prev => prev.filter(n => n._id !== id));
      toast.success('Notification removed');
    } catch (err) { toast.error('Failed to delete'); }
  };

  const unread = notifications.filter(n => !n.isRead).length;

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-5 sm:space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">Notifications</h1>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            {unread > 0 ? `${unread} unread notification${unread !== 1 ? 's' : ''}` : "You're all caught up"}
          </p>
        </div>
        {unread > 0 && (
          <button
            onClick={markAllRead}
            className="px-3.5 py-1.5 sm:px-4 sm:py-2 border border-border rounded-lg text-xs sm:text-sm font-medium text-heading hover:bg-gray-50 active:scale-95 transition-all"
          >
            Mark All Read
          </button>
        )}
      </div>

      {/* Notifications List */}
      <div className="space-y-2.5 sm:space-y-3">
        {notifications.length === 0 ? (
          <div className="bg-surface rounded-card shadow-card border border-border p-10 sm:p-14 text-center flex flex-col items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
              <Icons.Bell className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-heading">No notifications</h3>
            <p className="text-xs sm:text-sm text-muted mt-1 max-w-sm">
              You&apos;re all caught up. Check back later for assignment, quiz, or course updates.
            </p>
          </div>
        ) : (
          notifications.map(n => (
            <div
              key={n._id}
              onClick={() => !n.isRead && markRead(n._id)}
              className={`bg-surface rounded-card border p-3.5 sm:p-4 transition-all duration-150 cursor-pointer ${
                n.isRead
                  ? 'border-border hover:border-gray-300'
                  : 'border-blue-300 bg-blue-50/40 shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {!n.isRead && (
                      <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" aria-label="Unread" />
                    )}
                    <h3 className="font-semibold text-sm sm:text-base text-heading break-words">
                      {n.title}
                    </h3>
                  </div>
                  <p className="text-xs sm:text-sm text-body mt-1 break-words leading-relaxed">
                    {n.message}
                  </p>
                  <p className="text-xs text-muted/80 mt-2 flex items-center gap-1.5">
                    <Icons.Clock className="w-3.5 h-3.5 shrink-0 text-muted/60" />
                    <span>{new Date(n.createdAt).toLocaleString()}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(n._id);
                  }}
                  aria-label="Dismiss notification"
                  title="Dismiss notification"
                  className="p-1.5 sm:p-2 text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors shrink-0 min-w-[36px] min-h-[36px] flex items-center justify-center -mr-1 -mt-1 active:scale-95"
                >
                  <Icons.X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
