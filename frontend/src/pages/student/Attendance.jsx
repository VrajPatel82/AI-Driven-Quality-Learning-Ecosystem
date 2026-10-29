import { useState, useEffect, useCallback } from 'react';
import { attendanceAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';
import { FiRefreshCw } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function StudentAttendance() {
  const { user } = useAuth();
  const studentId = user?.id || user?._id;

  const [summaryData, setSummaryData] = useState(null);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedCourseFilter, setSelectedCourseFilter] = useState('');

  const fetchData = useCallback(async (isManualRefresh = false) => {
    if (!studentId) return;
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const [summaryRes, attRes] = await Promise.allSettled([
        attendanceAPI.getStudentSummary(studentId),
        attendanceAPI.getStudentAttendance(studentId)
      ]);

      if (summaryRes.status === 'fulfilled') {
        setSummaryData(summaryRes.value.data);
      }

      if (attRes.status === 'fulfilled') {
        const data = attRes.value.data;
        setHistoryRecords(data.records || []);
      }
      if (isManualRefresh) {
        toast.success('Attendance refreshed');
      }
    } catch (err) {
      toast.error('Failed to load attendance records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    if (refreshing || loading) return;
    fetchData(true);
  };

  // Filter personal history log by selected course
  const filteredHistory = selectedCourseFilter
    ? historyRecords.filter(r => {
        const cId = r.course?._id || r.course?.id || r.course;
        return cId === selectedCourseFilter;
      })
    : historyRecords;

  const overall = summaryData?.overall || { conducted: 0, present: 0, absent: 0, percentage: 0 };
  const courseSummaries = summaryData?.courses || [];

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
        <span className="text-xs sm:text-sm text-muted">Loading attendance data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">Attendance</h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-muted mt-1">
            <span>Student: <strong className="font-semibold text-heading">{user?.name || 'Student'}</strong></span>
            {user?.currentSemester && (
              <>
                <span className="text-slate-300">•</span>
                <span>Current Semester: <strong className="font-semibold text-heading">{user.currentSemester}</strong></span>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-semibold text-heading bg-surface border border-border rounded-btn hover:bg-slate-50 disabled:opacity-50 transition-all shadow-2xs self-start sm:self-auto min-h-[40px] active:scale-[0.98]"
          title="Refresh Attendance Data"
        >
          <FiRefreshCw className={`w-3.5 h-3.5 text-slate-500 ${refreshing ? 'animate-spin text-blue-600' : ''}`} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      {/* ATTENDANCE SUMMARY CARDS */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Overall Attendance Card (Prominent) */}
        <div className="lg:col-span-1 bg-surface rounded-card shadow-card border border-blue-200/80 p-4 sm:p-5 bg-gradient-to-br from-blue-50/90 via-indigo-50/60 to-white flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] sm:text-xs text-blue-800 font-bold uppercase tracking-wider">Overall Attendance</p>
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                overall.percentage >= 75 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {overall.percentage >= 75 ? 'On Track' : 'Low'}
              </span>
            </div>
            <p className="text-3xl sm:text-4xl font-extrabold text-blue-700 tracking-tight mt-1.5">{overall.percentage}%</p>
          </div>
          <p className="text-xs text-blue-600 font-medium mt-2">Official Authoritative Rate</p>
        </div>

        {/* 3 Metric Cards Grid */}
        <div className="lg:col-span-3 grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="bg-surface rounded-card shadow-card border border-border p-3.5 sm:p-5 flex flex-col justify-between">
            <p className="text-[11px] sm:text-xs text-muted font-medium uppercase tracking-wider truncate">Conducted</p>
            <p className="text-xl sm:text-2xl font-bold text-heading mt-1 sm:mt-2">{overall.conducted}</p>
            <p className="text-[11px] sm:text-xs text-muted mt-1 truncate">Total classes</p>
          </div>

          <div className="bg-surface rounded-card shadow-card border border-border p-3.5 sm:p-5 flex flex-col justify-between">
            <p className="text-[11px] sm:text-xs text-muted font-medium uppercase tracking-wider truncate">Attended</p>
            <p className="text-xl sm:text-2xl font-bold text-emerald-600 mt-1 sm:mt-2">{overall.present}</p>
            <p className="text-[11px] sm:text-xs text-emerald-600 font-medium mt-1 truncate">Present</p>
          </div>

          <div className="bg-surface rounded-card shadow-card border border-border p-3.5 sm:p-5 flex flex-col justify-between">
            <p className="text-[11px] sm:text-xs text-muted font-medium uppercase tracking-wider truncate">Missed</p>
            <p className="text-xl sm:text-2xl font-bold text-rose-600 mt-1 sm:mt-2">{overall.absent}</p>
            <p className="text-[11px] sm:text-xs text-rose-600 font-medium mt-1 truncate">Absent</p>
          </div>
        </div>
      </div>

      {/* COURSE-WISE ATTENDANCE BREAKDOWN */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4">
        <div className="border-b border-border pb-3">
          <h3 className="text-base sm:text-lg font-bold text-heading">Course-wise Attendance Breakdown</h3>
          <p className="text-xs text-muted mt-0.5">Attendance details for your active course enrollments</p>
        </div>

        {courseSummaries.length === 0 ? (
          <div className="text-center py-8 text-muted text-xs sm:text-sm">No course attendance records found.</div>
        ) : (
          <>
            {/* Mobile Card List View (block md:hidden) */}
            <div className="block md:hidden space-y-3">
              {courseSummaries.map((c) => {
                const rowKey = c.enrollmentId || `${c.courseId}-${c.academicTerm || c.attemptNumber || 'current'}`;
                return (
                  <div key={rowKey} className="p-3.5 rounded-xl border border-border bg-white space-y-3 shadow-2xs">
                    {/* Course Title, Code & Percentage Badge */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-heading text-sm leading-snug break-words">
                          {c.courseName}
                        </h4>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted mt-1">
                          <span className="font-mono text-slate-600">{c.courseCode}</span>
                          {c.isBacklog && (
                            <span className="px-1.5 py-0.2 text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 rounded border border-amber-300">
                              Backlog
                            </span>
                          )}
                          {c.attemptNumber && (
                            <span className="text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded text-[11px] font-medium">
                              Attempt {c.attemptNumber}
                            </span>
                          )}
                          {c.academicTerm && c.academicTerm !== 'CURRENT' && (
                            <span className="text-slate-600 text-[11px]">
                              {c.academicTerm}
                            </span>
                          )}
                        </div>
                      </div>

                      <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold ${
                        c.percentage >= 75 ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        {c.percentage}%
                      </span>
                    </div>

                    {/* Semester • Division info */}
                    <div className="text-xs text-slate-600 flex items-center gap-1.5 font-medium">
                      <span>Semester {c.semester || 1}</span>
                      {c.division && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span>Division {c.division}</span>
                        </>
                      )}
                    </div>

                    {/* Conducted / Present / Absent mini-stats */}
                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/70 text-center">
                      <div className="bg-slate-50 rounded-lg p-2">
                        <p className="text-[10px] uppercase font-semibold text-muted">Conducted</p>
                        <p className="text-sm font-bold text-heading mt-0.5">{c.conducted}</p>
                      </div>
                      <div className="bg-emerald-50/70 rounded-lg p-2">
                        <p className="text-[10px] uppercase font-semibold text-emerald-700">Present</p>
                        <p className="text-sm font-bold text-emerald-700 mt-0.5">{c.present}</p>
                      </div>
                      <div className="bg-rose-50/70 rounded-lg p-2">
                        <p className="text-[10px] uppercase font-semibold text-rose-700">Absent</p>
                        <p className="text-sm font-bold text-rose-700 mt-0.5">{c.absent}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-muted uppercase border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Course</th>
                    <th className="py-3 px-4">Sem / Div</th>
                    <th className="py-3 px-4 text-center">Conducted</th>
                    <th className="py-3 px-4 text-center">Present</th>
                    <th className="py-3 px-4 text-center">Absent</th>
                    <th className="py-3 px-4 text-right">Attendance %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {courseSummaries.map((c) => {
                    const rowKey = c.enrollmentId || `${c.courseId}-${c.academicTerm || c.attemptNumber || 'current'}`;
                    return (
                      <tr key={rowKey} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-heading">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">{c.courseName}</p>
                            {c.isBacklog && (
                              <span className="px-1.5 py-0.5 text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 rounded border border-amber-300">
                                Backlog
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted mt-0.5 flex-wrap">
                            <span className="font-mono">{c.courseCode}</span>
                            {c.attemptNumber && (
                              <span className="font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[11px]">
                                Attempt {c.attemptNumber}
                              </span>
                            )}
                            {c.academicTerm && c.academicTerm !== 'CURRENT' && (
                              <span className="font-medium text-slate-600 text-[11px]">
                                {c.academicTerm}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-medium text-slate-700">
                          Sem {c.semester || 1} {c.division ? `| Div ${c.division}` : ''}
                        </td>
                        <td className="py-3.5 px-4 text-center font-medium">{c.conducted}</td>
                        <td className="py-3.5 px-4 text-center font-semibold text-emerald-600">{c.present}</td>
                        <td className="py-3.5 px-4 text-center font-semibold text-rose-600">{c.absent}</td>
                        <td className="py-3.5 px-4 text-right">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold ${
                            c.percentage >= 75 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {c.percentage}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* PERSONAL ATTENDANCE HISTORY LOG */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3 sm:pb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-heading">Personal Attendance History</h3>
            <p className="text-xs text-muted mt-0.5">Complete log of individual class session attendance</p>
          </div>
          <div className="w-full sm:w-auto">
            <select
              value={selectedCourseFilter}
              onChange={(e) => setSelectedCourseFilter(e.target.value)}
              className="w-full sm:w-auto rounded-lg border border-border bg-white px-3 py-2 text-xs sm:text-sm font-medium focus:ring-2 focus:ring-blue-500 min-h-[40px]"
            >
              <option value="">All Enrolled Courses</option>
              {courseSummaries.map(c => {
                const optionKey = c.enrollmentId || `${c.courseId}-${c.academicTerm || c.attemptNumber || 'current'}`;
                const attemptSuffix = c.attemptNumber ? ` (Attempt ${c.attemptNumber})` : '';
                return (
                  <option key={optionKey} value={c.courseId}>
                    {c.courseName} ({c.courseCode}){attemptSuffix}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="text-center py-8 text-muted text-xs sm:text-sm">No attendance records found.</div>
        ) : (
          <>
            {/* Mobile History Card List View (block md:hidden) */}
            <div className="block md:hidden space-y-3">
              {filteredHistory.map((r, idx) => {
                const sess = r.session || {};
                const course = r.course || sess.course || {};
                const dateVal = sess.date || r.createdAt;
                const dateStr = dateVal ? new Date(dateVal).toISOString().split('T')[0] : '—';
                const rawStatus = (r.status || '').toUpperCase();
                const isPresent = rawStatus === 'PRESENT' || rawStatus === 'LATE';

                return (
                  <div key={r._id || idx} className="p-3.5 rounded-xl border border-border bg-white space-y-2.5 shadow-2xs">
                    {/* Top row: Date & Time + Status Pill */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-muted">
                        <span className="font-semibold text-heading">{dateStr}</span>
                        <span className="text-slate-300">•</span>
                        <span>{sess.startTime || 'Standard Time'}</span>
                      </div>

                      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                        isPresent ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}>
                        {isPresent ? 'PRESENT' : 'ABSENT'}
                      </span>
                    </div>

                    {/* Course name & Code */}
                    <div>
                      <h4 className="font-semibold text-heading text-sm leading-snug break-words">
                        {course.name || 'Course'}
                      </h4>
                      {course.code && (
                        <p className="text-xs font-mono text-muted mt-0.5">{course.code}</p>
                      )}
                    </div>

                    {/* Topic & Semester/Division */}
                    <div className="pt-2 border-t border-border/70 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                      <span className="text-slate-700 truncate max-w-[200px]" title={sess.topic || 'Regular Lecture Session'}>
                        {sess.topic || 'Regular Lecture Session'}
                      </span>
                      <span className="font-medium text-slate-500">
                        Sem {sess.semester || course.semester || 1}{sess.division ? ` • Div ${sess.division}` : ''}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop History Table View (hidden md:block) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-muted uppercase border-b border-border">
                  <tr>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Course</th>
                    <th className="py-3 px-4">Topic / Session Info</th>
                    <th className="py-3 px-4">Sem / Div</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredHistory.map((r, idx) => {
                    const sess = r.session || {};
                    const course = r.course || sess.course || {};
                    const dateVal = sess.date || r.createdAt;
                    const dateStr = dateVal ? new Date(dateVal).toISOString().split('T')[0] : '—';
                    const rawStatus = (r.status || '').toUpperCase();
                    const isPresent = rawStatus === 'PRESENT' || rawStatus === 'LATE';

                    return (
                      <tr key={r._id || idx} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-heading">
                          <p className="font-semibold">{dateStr}</p>
                          <p className="text-xs text-muted">{sess.startTime || 'Standard Time'}</p>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-semibold text-heading">{course.name || 'Course'}</p>
                          <p className="text-xs font-mono text-muted">{course.code}</p>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-muted">
                          {sess.topic || 'Regular Lecture Session'}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700">
                          Sem {sess.semester || course.semester || 1} {sess.division ? `| Div ${sess.division}` : ''}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${
                            isPresent ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {isPresent ? 'PRESENT' : 'ABSENT'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

