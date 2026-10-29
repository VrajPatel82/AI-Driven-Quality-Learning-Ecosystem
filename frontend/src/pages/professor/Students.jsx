import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { analyticsAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function ProfessorStudents() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [students, setStudents] = useState([]);
  const [filtersData, setFiltersData] = useState({ courses: [], semesters: [], divisions: [] });
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [search, setSearch] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('all');
  const [selectedSemester, setSelectedSemester] = useState('all');
  const [selectedDivision, setSelectedDivision] = useState('all');
  const [selectedPerformance, setSelectedPerformance] = useState('all');

  // Selected student for detail view
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    fetchStudentsOverview();
  }, [user?._id, user?.id]);

  useEffect(() => {
    if (selectedStudentId) {
      fetchStudentDetail(selectedStudentId);
    } else {
      setDetailData(null);
    }
  }, [selectedStudentId]);

  const fetchStudentsOverview = async () => {
    setLoading(true);
    try {
      const res = await analyticsAPI.getProfessorStudentsOverview();
      const data = res.data;
      if (data && data.success) {
        setStudents(data.students || []);
        setFiltersData(data.filters || { courses: [], semesters: [], divisions: [] });
      } else {
        setStudents([]);
      }
    } catch (err) {
      console.error('Error fetching students overview:', err);
      toast.error('Failed to load student overview data');
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchStudentDetail = async (studentId) => {
    setLoadingDetail(true);
    try {
      const res = await analyticsAPI.getProfessorStudentDetail(studentId);
      if (res.data && res.data.success) {
        setDetailData(res.data);
      } else {
        toast.error('Could not load student details');
        setDetailData(null);
      }
    } catch (err) {
      console.error('Error fetching student detail:', err);
      toast.error('Failed to load student academic details');
      setDetailData(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  // Filter students array
  const filteredStudents = students.filter(s => {
    // Search query
    const query = search.toLowerCase().trim();
    const matchSearch = !query ||
      (s.name || '').toLowerCase().includes(query) ||
      (s.email || '').toLowerCase().includes(query) ||
      (s.enrollmentNumber || '').toLowerCase().includes(query);

    // Course filter
    const matchCourse = selectedCourse === 'all' ||
      (s.enrolledCourseIds && s.enrolledCourseIds.includes(selectedCourse));

    // Semester filter
    const matchSemester = selectedSemester === 'all' ||
      String(s.currentSemester) === String(selectedSemester);

    // Division filter
    const matchDivision = selectedDivision === 'all' ||
      (s.division || '').toUpperCase() === selectedDivision.toUpperCase();

    // Performance filter
    const matchPerformance = selectedPerformance === 'all' ||
      (selectedPerformance === 'needs_attention' && s.performanceStatus === 'Needs Attention') ||
      (selectedPerformance === 'high' && s.performanceStatus === 'High Performance');

    return matchSearch && matchCourse && matchSemester && matchDivision && matchPerformance;
  });

  // Quick stats summary
  const totalCount = students.length;
  const attList = students.map(s => s.attendancePercentage).filter(v => v !== null);
  const avgAtt = attList.length > 0 ? (attList.reduce((a, b) => a + b, 0) / attList.length).toFixed(1) : null;

  const marksList = students.map(s => s.averageMarks).filter(v => v !== null);
  const avgMarks = marksList.length > 0 ? (marksList.reduce((a, b) => a + b, 0) / marksList.length).toFixed(1) : null;

  const needsAttentionCount = students.filter(s => s.performanceStatus === 'Needs Attention').length;

  // Helper badge color for AI Evaluation Status
  const getAiEvalBadge = (status) => {
    switch (status) {
      case 'COMPLETED':
      case 'FINALIZED':
      case 'PROFESSOR_REVIEWED':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">AI Evaluated</span>;
      case 'PROCESSING':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-200 animate-pulse">Processing</span>;
      case 'FAILED':
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 border border-red-200">Evaluation Failed</span>;
      case 'NOT_EVALUATED':
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">Pending AI</span>;
    }
  };

  // Helper badge for Attention Indicators
  const renderIndicatorBadge = (indicator) => {
    switch (indicator) {
      case 'Low Attendance':
        return (
          <span key={indicator} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <Icons.AlertCircle className="w-3 h-3 text-amber-600" />
            Low Attendance
          </span>
        );
      case 'Pending Assignment':
        return (
          <span key={indicator} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
            <Icons.Clock className="w-3 h-3 text-blue-600" />
            Pending Assignment
          </span>
        );
      case 'Recent Performance Drop':
        return (
          <span key={indicator} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200">
            <Icons.AlertTriangle className="w-3 h-3 text-orange-600" />
            Recent Performance Drop
          </span>
        );
      case 'No Pending Issues':
      default:
        return (
          <span key={indicator} className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <Icons.CheckCircle className="w-3 h-3 text-emerald-600" />
            No Pending Issues
          </span>
        );
    }
  };

  // -------------------------------------------------------------
  // RENDER: STUDENT DETAIL VIEW
  // -------------------------------------------------------------
  if (selectedStudentId) {
    return (
      <div className="space-y-6">
        {/* Back Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => setSelectedStudentId(null)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-surface text-muted hover:text-heading hover:bg-gray-100 border border-border transition-colors"
          >
            <Icons.ChevronLeft className="w-4 h-4" />
            Back to Students
          </button>
        </div>

        {loadingDetail || !detailData ? (
          <div className="flex justify-center items-center h-64 bg-surface rounded-card border border-border">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-sm text-muted font-medium">Loading student academic overview...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Detail Header */}
            <div className="bg-surface rounded-card p-4 sm:p-6 border border-border shadow-card flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start sm:items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-lg sm:text-xl border border-blue-200 shrink-0">
                  {detailData.student?.name?.[0] || 'S'}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                    <h1 className="text-xl sm:text-2xl font-bold text-heading truncate">{detailData.student?.name}</h1>
                    <span className="px-2.5 py-0.5 bg-gray-100 text-slate-700 font-mono text-xs font-semibold rounded border border-gray-200 shrink-0">
                      {detailData.student?.enrollmentNumber}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-muted mt-1">
                    {detailData.student?.department} • Semester {detailData.student?.currentSemester} • Division {detailData.student?.division}
                  </p>
                </div>
              </div>

              {/* Module Deep Links */}
              <div className="grid grid-cols-1 min-[360px]:grid-cols-2 md:flex md:flex-wrap gap-2 pt-2 md:pt-0 w-full md:w-auto">
                <button
                  onClick={() => navigate('/professor/attendance')}
                  className="w-full md:w-auto justify-center px-3 py-1.5 text-xs font-medium bg-surface text-slate-700 hover:bg-slate-50 border border-border rounded-lg inline-flex items-center gap-1.5 transition-colors"
                >
                  <Icons.Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  View Attendance
                </button>
                <button
                  onClick={() => navigate('/professor/gradebook')}
                  className="w-full md:w-auto justify-center px-3 py-1.5 text-xs font-medium bg-surface text-slate-700 hover:bg-slate-50 border border-border rounded-lg inline-flex items-center gap-1.5 transition-colors"
                >
                  <Icons.Award className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                  View Gradebook
                </button>
                <button
                  onClick={() => navigate('/professor/assignments')}
                  className="w-full md:w-auto justify-center px-3 py-1.5 text-xs font-medium bg-surface text-slate-700 hover:bg-slate-50 border border-border rounded-lg inline-flex items-center gap-1.5 transition-colors"
                >
                  <Icons.FileText className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  View Assignments
                </button>
                <button
                  onClick={() => navigate('/professor/quizzes')}
                  className="w-full md:w-auto justify-center px-3 py-1.5 text-xs font-medium bg-surface text-slate-700 hover:bg-slate-50 border border-border rounded-lg inline-flex items-center gap-1.5 transition-colors"
                >
                  <Icons.Quiz className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  View Quiz Results
                </button>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* Attendance Card */}
              <div className="bg-surface rounded-card p-4 border border-border shadow-card">
                <div className="flex items-center justify-between text-muted mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Attendance</span>
                  <Icons.Calendar className="w-4 h-4 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-heading">
                  {detailData.summary?.attendancePercentage !== null
                    ? `${detailData.summary.attendancePercentage}%`
                    : <span className="text-sm font-normal text-muted">No attendance data</span>}
                </div>
                <p className="text-xs text-muted mt-1">Class participation score</p>
              </div>

              {/* Average Card */}
              <div className="bg-surface rounded-card p-4 border border-border shadow-card">
                <div className="flex items-center justify-between text-muted mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Average</span>
                  <Icons.Award className="w-4 h-4 text-purple-600" />
                </div>
                <div className="text-2xl font-bold text-heading">
                  {detailData.summary?.averageMarks !== null
                    ? `${detailData.summary.averageMarks}%`
                    : <span className="text-sm font-normal text-muted">No grade data</span>}
                </div>
                <p className="text-xs text-muted mt-1">Gradebook & coursework average</p>
              </div>

              {/* Assignments Card */}
              <div className="bg-surface rounded-card p-4 border border-border shadow-card">
                <div className="flex items-center justify-between text-muted mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Assignments</span>
                  <Icons.FileText className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-2xl font-bold text-heading">
                  {detailData.summary?.assignmentTotal > 0
                    ? `${detailData.summary.assignmentSubmitted}/${detailData.summary.assignmentTotal}`
                    : <span className="text-sm font-normal text-muted">No assignment data</span>}
                </div>
                <p className="text-xs text-muted mt-1">Submitted coursework ratio</p>
              </div>

              {/* Progress Card */}
              <div className="bg-surface rounded-card p-4 border border-border shadow-card">
                <div className="flex items-center justify-between text-muted mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Progress</span>
                  <Icons.Activity className="w-4 h-4 text-indigo-600" />
                </div>
                <div className="text-2xl font-bold text-heading">
                  {detailData.summary?.progressPercentage !== null
                    ? `${detailData.summary.progressPercentage}%`
                    : <span className="text-sm font-normal text-muted">N/A</span>}
                </div>
                <p className="text-xs text-muted mt-1">Overall academic completion</p>
              </div>
            </div>

            {/* Course Performance Table */}
            <div className="bg-surface rounded-card border border-border shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-heading flex items-center gap-2">
                  <Icons.BookOpen className="w-4 h-4 text-blue-600" />
                  Course Performance
                </h3>
                <span className="text-xs text-muted">Scoped to your courses</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[500px] md:min-w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-border text-xs font-semibold text-muted uppercase">
                    <tr>
                      <th className="px-5 py-3">Course</th>
                      <th className="px-5 py-3 text-center">Attendance</th>
                      <th className="px-5 py-3 text-center">Average</th>
                      <th className="px-5 py-3 text-center">Progress</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm">
                    {detailData.coursePerformance && detailData.coursePerformance.length > 0 ? (
                      detailData.coursePerformance.map(cp => (
                        <tr key={cp.courseId} className="hover:bg-gray-50/50">
                          <td className="px-5 py-3.5">
                            <span className="font-medium text-heading block">{cp.courseName}</span>
                            <span className="text-xs text-muted font-mono">{cp.courseCode} • Sem {cp.semester}</span>
                          </td>
                          <td className="px-5 py-3.5 text-center font-medium text-slate-700">
                            {cp.attendancePercentage !== null ? `${cp.attendancePercentage}%` : <span className="text-muted font-normal text-xs">No attendance data</span>}
                          </td>
                          <td className="px-5 py-3.5 text-center font-medium text-slate-700">
                            {cp.averageMarks !== null ? `${cp.averageMarks}%` : <span className="text-muted font-normal text-xs">No grade data</span>}
                          </td>
                          <td className="px-5 py-3.5 text-center font-bold text-blue-600">
                            {cp.progressPercentage !== null ? `${cp.progressPercentage}%` : <span className="text-muted font-normal text-xs">N/A</span>}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="4" className="px-5 py-6 text-center text-muted">
                          No course enrollment records found for this student.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Assignments & Quizzes Section (Grid 2 cols) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Assignments Breakdown */}
              <div className="bg-surface rounded-card border border-border shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-heading flex items-center gap-2">
                      <Icons.FileText className="w-4 h-4 text-emerald-600" />
                      Assignments
                    </h3>
                  </div>
                  <div className="text-xs text-muted flex gap-3">
                    <span>Submitted: <strong>{detailData.assignments?.submitted ?? 0}</strong></span>
                    <span>Pending: <strong>{detailData.assignments?.pending ?? 0}</strong></span>
                  </div>
                </div>

                <div className="p-4">
                  {detailData.assignments?.list && detailData.assignments.list.length > 0 ? (
                    <div className="space-y-3">
                      {detailData.assignments.list.slice(0, 6).map(asg => (
                        <div key={asg._id} className="p-3 rounded-lg border border-border bg-gray-50/50 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="text-sm font-medium text-heading truncate">{asg.title}</h4>
                            <p className="text-xs text-muted mt-0.5">{asg.courseName} • Due {asg.dueDate ? new Date(asg.dueDate).toLocaleDateString() : 'N/A'}</p>
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className={`text-xs font-bold ${asg.marksText === 'Pending' ? 'text-amber-600' : 'text-slate-800'}`}>
                              {asg.marksText}
                            </span>
                            {getAiEvalBadge(asg.evaluationStatus)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted text-sm">
                      No assignment data available
                    </div>
                  )}
                </div>
              </div>

              {/* Quiz Performance */}
              <div className="bg-surface rounded-card border border-border shadow-card overflow-hidden">
                <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                  <h3 className="font-semibold text-heading flex items-center gap-2">
                    <Icons.Quiz className="w-4 h-4 text-purple-600" />
                    Quiz Performance
                  </h3>
                  <div className="text-xs text-muted">
                    Attempted: <strong>{detailData.quizzes?.attempted ?? 0} / {detailData.quizzes?.totalQuizzes ?? 0}</strong>
                  </div>
                </div>

                <div className="p-4">
                  {detailData.quizzes?.list && detailData.quizzes.list.length > 0 ? (
                    <div className="space-y-3">
                      {detailData.quizzes.list.slice(0, 6).map(qz => (
                        <div key={qz._id} className="p-3 rounded-lg border border-border bg-gray-50/50 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <h4 className="text-sm font-medium text-heading truncate">{qz.quizTitle}</h4>
                            <p className="text-xs text-muted mt-0.5">{qz.courseName} • Submitted {qz.submittedAt ? new Date(qz.submittedAt).toLocaleDateString() : ''}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-sm font-bold text-heading block">{qz.scoreText}</span>
                            <span className="text-xs text-muted font-medium">{qz.percentage}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-muted text-sm">
                      No quiz data available
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Recent Activity */}
            <div className="bg-surface rounded-card border border-border shadow-card overflow-hidden">
              <div className="px-5 py-4 border-b border-border">
                <h3 className="font-semibold text-heading flex items-center gap-2">
                  <Icons.Activity className="w-4 h-4 text-blue-600" />
                  Recent Activity
                </h3>
              </div>
              <div className="p-5">
                {detailData.recentActivity && detailData.recentActivity.length > 0 ? (
                  <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                    {detailData.recentActivity.map((act, idx) => (
                      <div key={idx} className="relative flex items-start justify-between gap-4">
                        <div className="absolute -left-[23px] top-1 w-2.5 h-2.5 rounded-full bg-blue-600 ring-4 ring-white" />
                        <div>
                          <p className="text-sm font-medium text-heading">{act.title}</p>
                          <p className="text-xs text-muted mt-0.5">{act.detail}</p>
                        </div>
                        <span className="text-xs text-muted shrink-0 font-mono">
                          {act.date ? new Date(act.date).toLocaleDateString() : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-muted text-sm">
                    No recent activity recorded
                  </div>
                )}
              </div>
            </div>

          </>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: MAIN STUDENTS LIST OVERVIEW
  // -------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-heading">Students</h1>
        <p className="text-muted text-sm mt-1">Review academic performance and student progress</p>
      </div>

      {/* Quick Summary Header Cards */}
      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface p-4 rounded-card border border-border shadow-card">
          <span className="text-xs text-muted font-semibold uppercase tracking-wider block">Total Students</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xl font-bold text-heading">{totalCount}</span>
            <Icons.Users className="w-5 h-5 text-blue-600" />
          </div>
        </div>

        <div className="bg-surface p-4 rounded-card border border-border shadow-card">
          <span className="text-xs text-muted font-semibold uppercase tracking-wider block">Average Attendance</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xl font-bold text-heading">
              {avgAtt !== null ? `${avgAtt}%` : 'No attendance data'}
            </span>
            <Icons.Calendar className="w-5 h-5 text-emerald-600" />
          </div>
        </div>

        <div className="bg-surface p-4 rounded-card border border-border shadow-card">
          <span className="text-xs text-muted font-semibold uppercase tracking-wider block">Average Marks</span>
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xl font-bold text-heading">
              {avgMarks !== null ? `${avgMarks}%` : 'No grade data'}
            </span>
            <Icons.Award className="w-5 h-5 text-purple-600" />
          </div>
        </div>

        <div className="bg-surface p-4 rounded-card border border-border shadow-card">
          <span className="text-xs text-muted font-semibold uppercase tracking-wider block">Needs Attention</span>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-2xl font-bold ${needsAttentionCount > 0 ? 'text-amber-700' : 'text-slate-800'}`}>
              {needsAttentionCount}
            </span>
            <Icons.AlertCircle className={`w-5 h-5 ${needsAttentionCount > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
          </div>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="bg-surface p-4 rounded-card border border-border shadow-card space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search bar */}
          <div className="relative flex-1">
            <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search by student name, ID, or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-input w-full pl-9"
            />
          </div>
        </div>

        {/* Dynamic Filters */}
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 md:grid-cols-4 gap-3 pt-1 border-t border-border">
          {/* Course filter */}
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Course</label>
            <select
              value={selectedCourse}
              onChange={e => setSelectedCourse(e.target.value)}
              className="form-select w-full text-xs"
            >
              <option value="all">All Courses</option>
              {filtersData.courses.map(c => (
                <option key={c._id} value={c._id}>
                  {c.code} - {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Semester filter */}
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Semester</label>
            <select
              value={selectedSemester}
              onChange={e => setSelectedSemester(e.target.value)}
              className="form-select w-full text-xs"
            >
              <option value="all">All Semesters</option>
              {filtersData.semesters.map(sem => (
                <option key={sem} value={sem}>
                  Semester {sem}
                </option>
              ))}
            </select>
          </div>

          {/* Division filter */}
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Division</label>
            <select
              value={selectedDivision}
              onChange={e => setSelectedDivision(e.target.value)}
              className="form-select w-full text-xs"
            >
              <option value="all">All Divisions</option>
              {filtersData.divisions.map(div => (
                <option key={div} value={div}>
                  Division {div}
                </option>
              ))}
            </select>
          </div>

          {/* Performance filter */}
          <div>
            <label className="text-xs font-semibold text-muted block mb-1">Performance</label>
            <select
              value={selectedPerformance}
              onChange={e => setSelectedPerformance(e.target.value)}
              className="form-select w-full text-xs"
            >
              <option value="all">All Performance</option>
              <option value="high">High Performance</option>
              <option value="needs_attention">Needs Attention</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Student Cards List */}
      {loading ? (
        <div className="flex justify-center items-center h-48 bg-surface rounded-card border border-border">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : filteredStudents.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-card border border-border">
          <p className="text-muted text-base font-medium">
            {students.length === 0 ? 'No students associated with your courses' : 'No students match your filter criteria'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredStudents.map(st => (
            <div
              key={st._id}
              className="bg-surface rounded-card p-5 border border-border shadow-card hover:border-slate-300 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              {/* Left Student Info */}
              <div className="flex items-start gap-3 sm:gap-4 min-w-0 lg:min-w-[280px]">
                <div className="w-11 h-11 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold text-base border border-blue-200 shrink-0">
                  {st.name?.[0] || 'S'}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-heading text-base truncate">{st.name}</h3>
                    <span className="px-2 py-0.5 bg-gray-100 text-slate-700 font-mono text-xs rounded border border-gray-200 shrink-0">
                      {st.enrollmentNumber}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-0.5">{st.department}</p>
                  <p className="text-xs text-slate-600 font-medium mt-1">
                    Semester {st.currentSemester} • Division {st.division}
                  </p>

                  {/* Attention Indicators */}
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {st.indicators && st.indicators.map(ind => renderIndicatorBadge(ind))}
                  </div>
                </div>
              </div>

              {/* Academic Metrics Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 py-3 lg:py-0 border-t lg:border-t-0 border-border">
                <div className="text-center lg:text-left">
                  <span className="text-xs font-semibold text-muted block uppercase tracking-wider">Attendance</span>
                  <span className="text-base font-bold text-heading mt-0.5 block">
                    {st.attendancePercentage !== null ? `${st.attendancePercentage}%` : <span className="text-xs text-muted font-normal">No data</span>}
                  </span>
                </div>

                <div className="text-center lg:text-left">
                  <span className="text-xs font-semibold text-muted block uppercase tracking-wider">Average</span>
                  <span className="text-base font-bold text-heading mt-0.5 block">
                    {st.averageMarks !== null ? `${st.averageMarks}%` : <span className="text-xs text-muted font-normal">No data</span>}
                  </span>
                </div>

                <div className="text-center lg:text-left">
                  <span className="text-xs font-semibold text-muted block uppercase tracking-wider">Assignments</span>
                  <span className="text-base font-bold text-heading mt-0.5 block">
                    {st.assignmentTotal > 0 ? `${st.assignmentSubmitted}/${st.assignmentTotal}` : <span className="text-xs text-muted font-normal">No data</span>}
                  </span>
                </div>

                <div className="text-center lg:text-left">
                  <span className="text-xs font-semibold text-muted block uppercase tracking-wider">Progress</span>
                  <span className="text-base font-bold text-blue-600 mt-0.5 block">
                    {st.progressPercentage !== null ? `${st.progressPercentage}%` : <span className="text-xs text-muted font-normal">N/A</span>}
                  </span>
                </div>
              </div>

              {/* View Action Button */}
              <div className="shrink-0 flex justify-stretch sm:justify-end w-full lg:w-auto">
                <button
                  onClick={() => setSelectedStudentId(st._id)}
                  className="w-full sm:w-auto justify-center px-4 py-2 text-sm font-medium bg-surface text-slate-700 hover:bg-slate-50 border border-border rounded-lg inline-flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  <Icons.Eye className="w-4 h-4 text-blue-600" />
                  View Student
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
