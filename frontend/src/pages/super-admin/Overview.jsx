import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminAPI, notificationsAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Icons } from '../../components/shared/Icons';

export default function SuperOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [statsRes, notifRes] = await Promise.allSettled([
        adminAPI.getStats(),
        notificationsAPI.getMy({ limit: 5 })
      ]);
      if (statsRes.status === 'fulfilled') {
        const d = statsRes.value?.data;
        setStats(d?.data || d || {});
      }
      if (notifRes.status === 'fulfilled') {
        const d = notifRes.value?.data;
        setNotifications(Array.isArray(d?.data) ? d.data : (Array.isArray(d) ? d : []));
      }
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 sm:h-12 sm:w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const safeStats = stats || {};
  const safeNotifications = Array.isArray(notifications) ? notifications : [];

  const statCards = [
    { label: 'Universities', value: safeStats.totalUniversities !== undefined ? safeStats.totalUniversities : (safeStats.universities || 0), icon: Icons.GraduationCap },
    { label: 'Institutions', value: safeStats.totalInstitutions !== undefined ? safeStats.totalInstitutions : (safeStats.institutions || 0), icon: Icons.Landmark },
    { label: 'Departments', value: safeStats.totalDepartments !== undefined ? safeStats.totalDepartments : (safeStats.departments || 0), icon: Icons.Building },
    { label: 'Courses', value: safeStats.totalCourses !== undefined ? safeStats.totalCourses : (safeStats.courses || 0), icon: Icons.Book },
    { label: 'Students', value: safeStats.totalStudents !== undefined ? safeStats.totalStudents : (safeStats.students || 0), icon: Icons.GraduationCap },
    { label: 'Professors', value: safeStats.totalProfessors !== undefined ? safeStats.totalProfessors : (safeStats.professors || 0), icon: Icons.UserCheck }
  ];

  const quickActions = [
    { label: 'Universities', link: '/super-admin/universities', icon: Icons.GraduationCap },
    { label: 'Uni Admins', link: '/super-admin/university-admins', icon: Icons.Briefcase },
    { label: 'Storage Pool', link: '/super-admin/storage', icon: Icons.HardDrive },
    { label: 'Uni Analytics', link: '/super-admin/university-analytics', icon: Icons.BarChart },
    { label: 'Monitoring', link: '/super-admin/monitoring', icon: Icons.Activity },
    { label: 'Security Logs', link: '/super-admin/security-logs', icon: Icons.Lock },
    { label: 'Policies', link: '/super-admin/policies', icon: Icons.FileText }
  ];

  return (
    <div className="space-y-2.5 sm:space-y-4 lg:space-y-6 w-full">
      {/* Page Header */}
      <div className="flex flex-col">
        <h1 className="text-base sm:text-xl lg:text-2xl font-bold text-heading tracking-tight leading-tight">Overview</h1>
        <p className="text-[11px] sm:text-xs lg:text-sm text-muted mt-0.5">Welcome back, {user?.name || 'superadmin'}</p>
      </div>

      {/* Statistics Cards - 6 Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-1.5 sm:gap-2.5 lg:gap-4">
        {statCards.map(s => {
          const StatIcon = s.icon;
          return (
            <div
              key={s.label}
              className="bg-surface rounded-lg sm:rounded-card shadow-xs sm:shadow-card border border-border px-2.5 py-1.5 sm:px-3 sm:py-2.5 xl:px-2.5 xl:py-3.5 2xl:p-4 min-w-0 flex items-center justify-between transition-all hover:shadow-md"
            >
              <div className="min-w-0 pr-1 sm:pr-2">
                <p className="text-[9.5px] sm:text-xs xl:text-[10px] 2xl:text-xs text-muted font-medium uppercase tracking-tight sm:tracking-normal 2xl:tracking-wide truncate">
                  {s.label}
                </p>
                <p className="text-base sm:text-xl lg:text-2xl font-bold mt-0.5 text-slate-800 tracking-tight leading-none">
                  {s.value}
                </p>
              </div>
              <StatIcon className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 2xl:w-7 2xl:h-7 text-indigo-600 shrink-0" />
            </div>
          );
        })}
      </div>

      {/* Quick Actions & Recent Notifications */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 sm:gap-4 lg:gap-6">
        {/* Quick Actions */}
        <div className="bg-surface rounded-lg sm:rounded-card shadow-xs sm:shadow-card border border-border overflow-hidden">
          <div className="px-3 py-1.5 sm:px-4 sm:py-3 border-b border-border">
            <h2 className="text-xs sm:text-base lg:text-lg font-semibold text-heading leading-tight">Quick Actions</h2>
          </div>
          <div className="p-2 sm:p-3 lg:p-4 grid grid-cols-2 sm:grid-cols-3 gap-1.5 sm:gap-2.5 lg:gap-3">
            {quickActions.map((a, idx) => {
              const ActionIcon = a.icon;
              const isLastOddItem = idx === quickActions.length - 1;
              return (
                <Link
                  key={a.label}
                  to={a.link}
                  className={`border border-border rounded-lg hover:bg-blue-50/50 hover:border-blue-200 active:bg-blue-100/60 active:scale-[0.98] text-center transition-all group flex flex-col items-center justify-center h-[46px] sm:h-[68px] lg:min-h-[84px] lg:h-auto lg:p-3.5 touch-manipulation px-2 py-1 ${
                    isLastOddItem ? 'col-span-2 sm:col-span-1' : ''
                  }`}
                >
                  <ActionIcon className="w-3.5 h-3.5 sm:w-5 sm:h-5 lg:w-6 lg:h-6 mx-auto text-indigo-600 group-hover:scale-110 group-active:scale-95 transition-transform shrink-0" />
                  <p className="text-[11px] sm:text-xs font-semibold mt-0.5 sm:mt-1.5 lg:mt-2 text-slate-700 truncate w-full px-0.5 leading-tight">
                    {a.label}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Notifications */}
        <div className="bg-surface rounded-lg sm:rounded-card shadow-xs sm:shadow-card border border-border overflow-hidden">
          <div className="px-3 py-1.5 sm:px-4 sm:py-3 border-b border-border">
            <h2 className="text-xs sm:text-base lg:text-lg font-semibold text-heading leading-tight">Recent Notifications</h2>
          </div>
          <div className="p-2 sm:p-3 lg:p-4">
            {safeNotifications.length === 0 ? (
              <p className="text-muted text-center py-4 text-xs sm:text-sm">No notifications</p>
            ) : (
              <div className="space-y-1.5 sm:space-y-2 lg:space-y-2.5">
                {safeNotifications.map((n, idx) => (
                  <div
                    key={n._id || n.id || `notif-${idx}`}
                    className={`px-2.5 py-1.5 sm:px-3 sm:py-2.5 lg:p-3.5 rounded-lg transition-colors ${
                      n.isRead ? 'bg-gray-50' : 'bg-blue-50/70 border border-blue-100/60'
                    }`}
                  >
                    <p className="text-xs sm:text-sm font-semibold text-slate-800 break-words leading-tight">{n.title}</p>
                    <p className="text-[10.5px] sm:text-xs text-muted mt-0.5 break-words leading-snug">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
