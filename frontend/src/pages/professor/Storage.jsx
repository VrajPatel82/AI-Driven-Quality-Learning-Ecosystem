import { useState, useEffect } from 'react';
import { resourcesAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function ProfessorStorage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [breakdown, setBreakdown] = useState(null);
  const [usageLogs, setUsageLogs] = useState([]);
  const [logPagination, setLogPagination] = useState({ page: 1, limit: 20, total: 0, pages: 1 });
  const [showAllActivity, setShowAllActivity] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedAction, setSelectedAction] = useState('');

  useEffect(() => {
    fetchStorageData();
  }, []);

  useEffect(() => {
    fetchLogs(logPagination.page);
  }, [selectedCategory, selectedAction]);

  const fetchStorageData = async () => {
    setLoading(true);
    try {
      const [resOverview, resBreakdown] = await Promise.allSettled([
        resourcesAPI.getOverview(),
        resourcesAPI.getProfessorBreakdown()
      ]);

      if (resOverview.status === 'fulfilled' && resOverview.value.data?.data) {
        setOverview(resOverview.value.data.data.storage);
        if (resOverview.value.data.data.storage?.breakdown) {
          setBreakdown(resOverview.value.data.data.storage.breakdown);
        }
      }

      if (resBreakdown.status === 'fulfilled' && resBreakdown.value.data?.data?.breakdown) {
        setBreakdown(resBreakdown.value.data.data.breakdown);
        if (!overview && resBreakdown.value.data.data.overview) {
          setOverview(resBreakdown.value.data.data.overview);
        }
      }

      await fetchLogs(1);
    } catch (err) {
      toast.error('Failed to load storage details');
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async (page = 1) => {
    try {
      const params = { page, limit: 20 };
      if (selectedCategory) params.fileCategory = selectedCategory;
      if (selectedAction) params.action = selectedAction;

      const res = await resourcesAPI.getUsageLogs(params);
      if (res.data?.success) {
        setUsageLogs(res.data.data || []);
        if (res.data.pagination) {
          setLogPagination(res.data.pagination);
        }
      }
    } catch (err) {
      console.error('Failed to fetch storage usage logs:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const allocatedBytes = overview?.allocated || overview?.totalCapacity || 0;
  const usedBytes = overview?.used || 0;
  const remainingBytes = Math.max(0, allocatedBytes - usedBytes);
  const percentageUsed = allocatedBytes > 0 ? Number(((usedBytes / allocatedBytes) * 100).toFixed(2)) : 0;
  const remainingPercentage = allocatedBytes > 0 ? Number(((remainingBytes / allocatedBytes) * 100).toFixed(2)) : 0;

  // Warning thresholds (<80% None, 80%-94.9% Low, >=95% Almost Full, 100% Full)
  const isStorageFull = allocatedBytes > 0 && remainingBytes <= 0;
  const isCriticalStorage = allocatedBytes > 0 && percentageUsed >= 95 && !isStorageFull;
  const isLowStorage = allocatedBytes > 0 && percentageUsed >= 80 && percentageUsed < 95;

  const b = breakdown || {
    lectureVideos: { bytes: 0, count: 0 },
    additionalMaterials: { bytes: 0, count: 0 },
    transcriptPdfs: { bytes: 0, count: 0 },
    generatedAudio: { bytes: 0, count: 0 },
    otherFiles: { bytes: 0, count: 0 },
    totalUsed: usedBytes
  };

  // Structured breakdown categories sorted by size descending
  const breakdownCategories = [
    { key: 'lectureVideos', label: 'Lecture Videos', bytes: b.lectureVideos?.bytes || 0, count: b.lectureVideos?.count || 0 },
    { key: 'generatedAudio', label: 'Generated Audio', bytes: b.generatedAudio?.bytes || 0, count: b.generatedAudio?.count || 0 },
    { key: 'transcriptPdfs', label: 'Transcript PDFs', bytes: b.transcriptPdfs?.bytes || 0, count: b.transcriptPdfs?.count || 0 },
    { key: 'additionalMaterials', label: 'Materials', bytes: b.additionalMaterials?.bytes || 0, count: b.additionalMaterials?.count || 0 },
    { key: 'otherFiles', label: 'Other', bytes: b.otherFiles?.bytes || 0, count: b.otherFiles?.count || 0 }
  ].sort((a, b) => b.bytes - a.bytes);

  // Recent activity: initial 5 items or full paginated list
  const displayedLogs = showAllActivity ? usageLogs : usageLogs.slice(0, 5);

  const formatCategoryName = (cat) => {
    switch (cat) {
      case 'LECTURE_VIDEO': return 'Lecture Video';
      case 'GENERATED_AUDIO': return 'Generated Audio';
      case 'TRANSCRIPT_PDF': return 'Transcript PDF';
      case 'LECTURE_MATERIAL': return 'Materials';
      case 'LAB': return 'Labs';
      default: return cat ? cat.replace('_', ' ') : 'Other';
    }
  };

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6">
      {/* 1. Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Icons.HardDrive className="w-6 h-6 text-blue-600 shrink-0" />
            <span>My Storage</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            View your storage usage and available space.
          </p>
        </div>
        <button
          onClick={fetchStorageData}
          className="btn-secondary self-start sm:self-auto flex items-center justify-center gap-2 text-xs py-2.5 px-4 rounded-xl shadow-2xs font-semibold cursor-pointer w-full sm:w-auto"
        >
          <span className="text-sm">↻</span> Refresh Storage
        </button>
      </div>

      {/* 2. Simplified Storage Warnings */}
      {isStorageFull && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-900">
          <Icons.AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Storage is full</p>
            <p className="text-xs text-red-800 mt-0.5">
              Your allocated capacity of {formatBytes(allocatedBytes)} is full. New uploads are disabled. Please delete existing lectures or contact your Department Admin.
            </p>
          </div>
        </div>
      )}

      {isCriticalStorage && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-start gap-3 text-rose-900">
          <Icons.AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Storage is almost full</p>
            <p className="text-xs text-rose-800 mt-0.5">
              Only {formatBytes(remainingBytes)} remaining ({remainingPercentage}% space left). Large video uploads may fail.
            </p>
          </div>
        </div>
      )}

      {isLowStorage && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900">
          <Icons.AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">Storage is getting low</p>
            <p className="text-xs text-amber-800 mt-0.5">
              You have {formatBytes(remainingBytes)} remaining of your {formatBytes(allocatedBytes)} quota.
            </p>
          </div>
        </div>
      )}

      {allocatedBytes === 0 && (
        <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-3 text-blue-900">
          <Icons.AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">No Storage Allocation Assigned</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Your account currently has no storage quota allocated. Please contact your Department Administrator to assign a storage quota.
            </p>
          </div>
        </div>
      )}

      {/* 3. Top Storage Cards (3 clean cards: desktop 3-col, tablet 3-col, mobile stacked) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Storage Limit</span>
          <p className="text-2xl font-bold text-slate-900">{formatBytes(allocatedBytes)}</p>
          <span className="text-xs text-slate-400 block">Your total storage</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Used</span>
          <p className="text-2xl font-bold text-purple-700">{formatBytes(usedBytes)}</p>
          <span className="text-xs text-slate-400 block">Currently used</span>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1.5">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Available</span>
          <p className={`text-2xl font-bold ${remainingPercentage <= 5 ? 'text-red-600' : 'text-emerald-700'}`}>
            {formatBytes(remainingBytes)}
          </p>
          <span className="text-xs text-slate-400 block">Space remaining</span>
        </div>
      </div>

      {/* 4. Single Prominent Storage Progress Section */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap justify-between items-center text-xs sm:text-sm gap-1">
          <span className="font-semibold text-slate-900">Storage Used</span>
          <span className="font-semibold text-slate-700">
            {formatBytes(usedBytes)} <span className="font-normal text-slate-400">of</span> {formatBytes(allocatedBytes)}
          </span>
        </div>

        <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              percentageUsed >= 95 ? 'bg-red-500' : percentageUsed >= 80 ? 'bg-amber-500' : 'bg-blue-600'
            }`}
            style={{ width: `${Math.min(percentageUsed, 100)}%` }}
          />
        </div>

        <div className="flex flex-wrap justify-between items-center text-xs text-slate-500 gap-1">
          <span className="font-medium text-slate-700">{percentageUsed.toFixed(1)}% used</span>
          <span>{formatBytes(remainingBytes)} remaining</span>
        </div>
      </div>

      {/* 5. What's Using Your Storage? (Compact sorted list with mini progress bars) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div>
          <h2 className="text-base font-bold text-slate-900">What's Using Your Storage?</h2>
          <p className="text-xs text-slate-500 mt-0.5">Breakdown of storage space by file category</p>
        </div>

        <div className="divide-y divide-slate-100">
          {breakdownCategories.map((cat) => {
            const catPct = usedBytes > 0 ? (cat.bytes / usedBytes) * 100 : 0;
            return (
              <div key={cat.key} className="py-3">
                {/* Desktop / Tablet view: Category | Progress | Files | Size */}
                <div className="hidden sm:flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-[140px] sm:min-w-[180px]">
                    <span className="text-sm font-medium text-slate-800">{cat.label}</span>
                  </div>
                  <div className="flex-1 max-w-xs">
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(catPct, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <span className="text-xs text-slate-400 whitespace-nowrap">
                      {cat.count} {cat.count === 1 ? 'file' : 'files'}
                    </span>
                    <span className="text-sm font-semibold text-slate-900 w-24 whitespace-nowrap">
                      {formatBytes(cat.bytes)}
                    </span>
                  </div>
                </div>

                {/* Mobile view: Stacked card with full-width progress bar */}
                <div className="sm:hidden space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-800">{cat.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400">
                        {cat.count} {cat.count === 1 ? 'file' : 'files'}
                      </span>
                      <span className="font-bold text-slate-900">
                        {formatBytes(cat.bytes)}
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all"
                      style={{ width: `${Math.min(catPct, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. Recent Storage Activity */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recent Storage Activity</h2>
            <p className="text-xs text-slate-500 mt-0.5">Latest additions and updates to your storage</p>
          </div>

          {/* Filters only displayed when full activity view is expanded */}
          {showAllActivity && (
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs form-input py-1.5 px-2.5 h-9 rounded-xl flex-1 sm:flex-initial"
              >
                <option value="">All Categories</option>
                <option value="LECTURE_VIDEO">Lecture Videos</option>
                <option value="LECTURE_MATERIAL">Materials</option>
                <option value="TRANSCRIPT_PDF">Transcript PDFs</option>
                <option value="GENERATED_AUDIO">Generated Audio</option>
                <option value="LAB">Labs</option>
                <option value="OTHER">Other</option>
              </select>

              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
                className="text-xs form-input py-1.5 px-2.5 h-9 rounded-xl flex-1 sm:flex-initial"
              >
                <option value="">All Actions</option>
                <option value="UPLOADED">Uploaded</option>
                <option value="GENERATED">Generated</option>
                <option value="DELETED">Deleted / Released</option>
              </select>
            </div>
          )}
        </div>

        {/* Desktop / Tablet Table View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50/80 text-slate-600 border-b border-slate-200 font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3 text-left">File</th>
                <th className="px-5 py-3 text-left">Type</th>
                <th className="px-5 py-3 text-right">Change</th>
                <th className="px-5 py-3 text-right">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedLogs.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-8 text-slate-400">
                    No recent storage activity found.
                  </td>
                </tr>
              ) : (
                displayedLogs.map((log) => {
                  const isDeleted = log.action === 'DELETED';
                  const sizeFormatted = formatBytes(log.fileSizeBytes || 0);

                  return (
                    <tr key={log._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-5 py-3.5 max-w-xs sm:max-w-md">
                        <span className="font-medium text-slate-900 block truncate" title={log.fileName}>
                          {log.fileName}
                        </span>
                        {log.lecture?.title && (
                          <span className="text-[11px] text-slate-400 block truncate">
                            {log.lecture.title}
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded font-semibold text-[11px] bg-slate-100 text-slate-700">
                          {formatCategoryName(log.fileCategory)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold whitespace-nowrap">
                        <span className={isDeleted ? 'text-red-600' : 'text-slate-900'}>
                          {isDeleted ? `-${sizeFormatted}` : `+${sizeFormatted}`}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right whitespace-nowrap text-slate-500">
                        {new Date(log.createdAt).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Responsive Activity Cards */}
        <div className="sm:hidden divide-y divide-slate-100">
          {displayedLogs.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs">
              No recent storage activity found.
            </div>
          ) : (
            displayedLogs.map((log) => {
              const isDeleted = log.action === 'DELETED';
              const sizeFormatted = formatBytes(log.fileSizeBytes || 0);

              return (
                <div key={log._id} className="p-4 space-y-2.5">
                  <div>
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block">
                      File
                    </span>
                    <span className="font-semibold text-slate-900 text-xs block break-words" title={log.fileName}>
                      {log.fileName}
                    </span>
                    {log.lecture?.title && (
                      <span className="text-[11px] text-slate-400 block truncate mt-0.5">
                        {log.lecture.title}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 items-end pt-1">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                        Type
                      </span>
                      <span className="inline-block px-2 py-0.5 rounded font-semibold text-[11px] bg-slate-100 text-slate-700 truncate max-w-full">
                        {formatCategoryName(log.fileCategory)}
                      </span>
                    </div>

                    <div className="text-center">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                        Change
                      </span>
                      <span className={`text-xs font-bold ${isDeleted ? 'text-red-600' : 'text-slate-900'}`}>
                        {isDeleted ? `-${sizeFormatted}` : `+${sizeFormatted}`}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 block mb-1">
                        Date
                      </span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* View All Activity / Show Less Toggle & Pagination */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-xs">
          <button
            type="button"
            onClick={() => setShowAllActivity(!showAllActivity)}
            className="text-blue-600 hover:text-blue-800 font-semibold transition flex items-center justify-center sm:justify-start gap-1.5 py-2 sm:py-0"
          >
            <span>{showAllActivity ? '▲ Show Recent (5 items)' : '▼ View All Activity'}</span>
            {!showAllActivity && logPagination.total > 0 && (
              <span className="text-slate-400 font-normal">({logPagination.total} total)</span>
            )}
          </button>

          {showAllActivity && logPagination.pages > 1 && (
            <div className="flex items-center justify-between sm:justify-end gap-3 text-slate-500 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200">
              <span>
                Page {logPagination.page} of {logPagination.pages}
              </span>
              <div className="flex gap-1.5">
                <button
                  disabled={logPagination.page <= 1}
                  onClick={() => fetchLogs(logPagination.page - 1)}
                  className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={logPagination.page >= logPagination.pages}
                  onClick={() => fetchLogs(logPagination.page + 1)}
                  className="btn-secondary py-1.5 px-3 text-xs disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
