import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import AIPerformanceAnalytics from '../../components/shared/AIPerformanceAnalytics';
import { Icons } from '../../components/shared/Icons';

export default function SuperMonitoring({ defaultTab = 'all' }) {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || defaultTab || 'all';

  const handleTabChange = (tabId) => {
    if (tabId === 'all') {
      searchParams.delete('tab');
      setSearchParams(searchParams, { replace: true });
    } else {
      setSearchParams({ tab: tabId }, { replace: true });
    }
  };

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const res = await adminAPI.getStats();
      setStats(res.data.data || res.data);
    } catch (err) { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  const refreshData = async () => {
    setLoading(true);
    await fetchData();
  };

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  const total = (stats.totalUsers || stats.users || 0);

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">System Monitoring</h1>
          <p className="text-xs text-muted mt-0.5">Platform health and API Performance telemetry</p>
        </div>
        <button
          onClick={refreshData}
          className="btn-primary w-full sm:w-auto px-4 py-2 rounded-btn text-sm inline-flex items-center justify-center gap-1.5 transition-colors"
        >
          <Icons.Refresh className="w-4 h-4" /> Refresh
        </button>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-border gap-1.5 overflow-x-auto pb-0.5">
        {[
          { id: 'all', label: 'All Monitoring', icon: Icons.Dashboard },
          { id: 'system', label: 'System Overview', icon: Icons.Activity },
          { id: 'api-performance', label: 'API Performance', icon: Icons.Sparkles },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`py-2 px-3 sm:px-4 text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-2 rounded-t-lg border-b-2 ${
                isActive
                  ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* System Status & Overview Section */}
      {(activeTab === 'all' || activeTab === 'system') && (
        <>
          {/* Top summary cards from Analytics */}
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {[
          { label: 'Institutions', value: stats.totalInstitutions || stats.institutions || 0 },
          { label: 'Departments', value: stats.totalDepartments || stats.departments || 0 },
          { label: 'Courses', value: stats.totalCourses || stats.courses || 0 },
          { label: 'Lectures', value: stats.totalLectures || stats.lectures || 0 },
          { label: 'Users', value: total }
        ].map((s, idx) => (
          <div
            key={s.label}
            className={`bg-surface rounded-card shadow-card border border-border p-4 sm:p-5 text-center min-w-0 ${
              idx === 4 ? 'col-span-2 sm:col-span-2 md:col-span-1 lg:col-span-1' : ''
            }`}
          >
            <p className="text-xl sm:text-2xl font-bold truncate">{s.value}</p>
            <p className="text-xs sm:text-sm text-muted mt-1 truncate">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* System Status from Monitoring */}
        <div className="bg-surface rounded-card shadow-card border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-base sm:text-lg font-semibold text-heading">System Status</h2>
          </div>
          <div className="p-4 space-y-3 sm:space-y-4">
            {[
              { name: 'API Server', status: 'operational' },
              { name: 'Database', status: 'operational' },
              { name: 'File Storage', status: 'operational' },
              { name: 'Authentication', status: 'operational' }
            ].map(svc => (
              <div key={svc.name} className="flex items-center justify-between py-1.5 sm:py-2 gap-2">
                <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                  <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full flex-shrink-0 ${svc.status === 'operational' ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className="font-medium text-xs sm:text-sm truncate">{svc.name}</span>
                </div>
                <span className={`text-[11px] sm:text-xs px-2 py-0.5 sm:py-1 rounded-full flex-shrink-0 capitalize ${svc.status === 'operational' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {svc.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* User Breakdown from Analytics */}
        <div className="bg-surface rounded-card shadow-card border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-base sm:text-lg font-semibold text-heading">User Breakdown</h2>
          </div>
          <div className="p-4 space-y-3 sm:space-y-4">
            {[
              { role: 'Students', count: stats.totalStudents || stats.students || 0, color: 'bg-blue-500' },
              { role: 'Professors', count: stats.totalProfessors || stats.professors || 0, color: 'bg-green-500' },
              { role: 'Dept Admins', count: stats.totalDeptAdmins || 0, color: 'bg-purple-500' },
              { role: 'Inst Admins', count: stats.totalInstAdmins || 0, color: 'bg-amber-500' },
              { role: 'Super Admins', count: stats.totalSuperAdmins || 0, color: 'bg-red-500' }
            ].map(r => {
              const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
              return (
                <div key={r.role}>
                  <div className="flex justify-between items-center text-xs sm:text-sm mb-1 gap-2">
                    <span className="font-medium truncate">{r.role}</span>
                    <span className="text-muted flex-shrink-0">{r.count} ({pct}%)</span>
                  </div>
                  <div className="h-2.5 sm:h-3 bg-gray-100 rounded-full overflow-hidden w-full">
                    <div className={`h-full ${r.color} rounded-full transition-all`} style={{ width: `${pct}%` }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Content Metrics from Analytics */}
        <div className="bg-surface rounded-card shadow-card border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-base sm:text-lg font-semibold text-heading">Content Metrics</h2>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {[
                { label: 'Quizzes', value: stats.totalQuizzes || stats.quizzes || 0, icon: Icons.FileText },
                { label: 'Assignments', value: stats.totalAssignments || stats.assignments || 0, icon: Icons.Clipboard },
                { label: 'Forum Posts', value: stats.totalForumPosts || stats.forumPosts || 0, icon: Icons.MessageSquare },
                { label: 'Events', value: stats.totalEvents || stats.events || 0, icon: Icons.Calendar },
                { label: 'Announcements', value: stats.totalAnnouncements || stats.announcements || 0, icon: Icons.Megaphone }
              ].map(c => {
                const MetricIcon = c.icon;
                return (
                  <div key={c.label} className="bg-gray-50 rounded-lg p-3 sm:p-4 flex items-center gap-3 min-w-0">
                    <MetricIcon className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-base sm:text-lg font-bold truncate">{c.value}</p>
                      <p className="text-xs text-muted truncate">{c.label}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Growth Summary from Analytics */}
        <div className="bg-surface rounded-card shadow-card border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-base sm:text-lg font-semibold text-heading">Growth Summary</h2>
          </div>
          <div className="p-4 sm:p-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="text-center p-2 sm:p-0">
                <p className="text-3xl sm:text-4xl font-bold text-blue-600">{stats.totalCourses || stats.courses || 0}</p>
                <p className="text-muted mt-1 text-sm sm:text-base">Active Courses</p>
                <p className="text-xs sm:text-sm text-green-600 mt-1">Platform-wide</p>
              </div>
              <div className="text-center p-2 sm:p-0">
                <p className="text-3xl sm:text-4xl font-bold text-green-600">{stats.totalLectures || stats.lectures || 0}</p>
                <p className="text-muted mt-1 text-sm sm:text-base">Lectures Published</p>
                <p className="text-xs sm:text-sm text-green-600 mt-1">All institutions</p>
              </div>
            </div>
          </div>
        </div>
      </div>
        </>
      )}

      {/* Hierarchical API Performance Analytics */}
      {(activeTab === 'all' || activeTab === 'api-performance') && (
        <AIPerformanceAnalytics role="super_admin" />
      )}
    </div>
  );
}
