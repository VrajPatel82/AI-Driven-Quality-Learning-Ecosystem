import { useState, useEffect } from 'react';
import { universitiesAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import { formatBytes } from '../../components/shared/ResourceManagement';

export default function UniversityAnalytics() {
  const [loading, setLoading] = useState(true);
  const [analyticsData, setAnalyticsData] = useState([]);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const res = await universitiesAPI.getAnalytics();
      setAnalyticsData(res.data.data || res.data || []);
    } catch (err) {
      console.error('Error fetching university analytics:', err);
      setAnalyticsData([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-heading">University Analytics</h1>
      </div>

      {/* University Comparison Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {analyticsData.map(uni => {
          const allocatedBytes = uni.storageAllocated ?? uni.storage?.allocated ?? 0;
          const usedBytes = uni.storageUsed ?? uni.storage?.used ?? 0;
          const allocatedFormatted = uni.storageAllocatedFormatted || uni.storage?.allocatedFormatted || formatBytes(allocatedBytes);
          const usedFormatted = uni.storageUsedFormatted || uni.storage?.usedFormatted || formatBytes(usedBytes);

          const usagePercentage = typeof uni.storageUsagePercentage === 'number'
            ? uni.storageUsagePercentage
            : (typeof uni.storage?.usagePercentage === 'number'
                ? uni.storage.usagePercentage
                : (allocatedBytes > 0 ? Number(((usedBytes / allocatedBytes) * 100).toFixed(2)) : 0));

          const clampedPercentage = Math.min(Math.max(usagePercentage, 0), 100);

          return (
            <div key={uni._id} className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4 sm:space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 border-b border-border pb-3.5 sm:pb-4">
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 break-words">{uni.name}</h3>
                  <span className="font-mono text-xs bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded mt-1 inline-block">
                    {uni.code}
                  </span>
                </div>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 sm:px-3 py-1 rounded-full self-start sm:self-auto shrink-0">
                  Attendance Avg: {uni.attendanceRate ?? 'N/A'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="p-2 sm:p-3 bg-slate-50 rounded-lg text-center">
                  <p className="text-[11px] sm:text-xs text-muted truncate">Institutions</p>
                  <p className="text-base sm:text-xl font-bold text-slate-800 mt-0.5">{uni.institutions}</p>
                </div>
                <div className="p-2 sm:p-3 bg-slate-50 rounded-lg text-center">
                  <p className="text-[11px] sm:text-xs text-muted truncate">Departments</p>
                  <p className="text-base sm:text-xl font-bold text-slate-800 mt-0.5">{uni.departments}</p>
                </div>
                <div className="p-2 sm:p-3 bg-slate-50 rounded-lg text-center">
                  <p className="text-[11px] sm:text-xs text-muted truncate">Active Courses</p>
                  <p className="text-base sm:text-xl font-bold text-slate-800 mt-0.5">{uni.courses}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3 pt-1 sm:pt-2">
                <div className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 border border-border rounded-xl">
                  <Icons.GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] sm:text-xs text-muted font-medium truncate">Enrolled Students</p>
                    <p className="text-base sm:text-lg font-bold text-slate-800 mt-0.5">{uni.students?.toLocaleString() ?? 0}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 border border-border rounded-xl">
                  <Icons.UserCheck className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] sm:text-xs text-muted font-medium truncate">Faculty Members</p>
                    <p className="text-base sm:text-lg font-bold text-slate-800 mt-0.5">{uni.professors ?? 0}</p>
                  </div>
                </div>
              </div>

              {/* Storage Progress Bar */}
              <div className="space-y-1.5 pt-1 sm:pt-2">
                <div className="flex flex-col sm:flex-row justify-between text-xs font-semibold text-slate-700 gap-0.5 sm:gap-2">
                  <span>Storage Utilization</span>
                  <span className="text-slate-600 font-mono text-[11px] sm:text-xs">{usedFormatted} / {allocatedFormatted} ({usagePercentage}%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${clampedPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
