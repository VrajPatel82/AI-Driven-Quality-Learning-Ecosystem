import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { attendanceAPI, adminAPI, usersAPI, exportAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function InstAttendance() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  // Extract institution ID safely from auth context
  const instId = typeof user?.institution === 'object' ? user.institution?._id || user.institution?.id : user?.institution;
  const instName = user?.institution?.name || 'Institution';

  // Common metadata loaded once for the institution
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  // Derive semesters dynamically from available courses data
  const availableSemesters = Array.from(new Set(courses.map(c => c.semester).filter(Boolean))).sort((a, b) => a - b);
  const semestersList = availableSemesters.length > 0 ? availableSemesters : [1, 2, 3, 4, 5, 6, 7, 8];

  // ----------------------------------------------------
  // TAB 1: OVERVIEW & DEPARTMENT COMPARISON STATE
  // ----------------------------------------------------
  const [overviewSummary, setOverviewSummary] = useState(null);
  const [loadingOverview, setLoadingOverview] = useState(false);
  const [overviewFilters, setOverviewFilters] = useState({
    departmentId: '',
    semester: '',
    division: '',
    from: '',
    to: ''
  });

  // Department comparison state
  const [deptSummaries, setDeptSummaries] = useState([]);
  const [loadingDeptSummaries, setLoadingDeptSummaries] = useState(false);

  // Course Inspector state
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [courseSummaryData, setCourseSummaryData] = useState(null);
  const [loadingCourseSummary, setLoadingCourseSummary] = useState(false);
  const [courseSummaryFilters, setCourseSummaryFilters] = useState({
    semester: '',
    division: ''
  });

  // ----------------------------------------------------
  // TAB 2: LOW ATTENDANCE STATE
  // ----------------------------------------------------
  const [lowAttendanceData, setLowAttendanceData] = useState(null);
  const [loadingLowAttendance, setLoadingLowAttendance] = useState(false);
  const [lowAttendanceFilters, setLowAttendanceFilters] = useState({
    threshold: '75',
    department: '',
    course: '',
    semester: '',
    division: ''
  });

  // ----------------------------------------------------
  // TAB 3: SESSION HISTORY STATE
  // ----------------------------------------------------
  const [historyData, setHistoryData] = useState({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 1 } });
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyFilters, setHistoryFilters] = useState({
    department: '',
    course: '',
    semester: '',
    division: '',
    professor: '',
    from: '',
    to: '',
    status: '',
    page: 1,
    limit: 20
  });

  // Session Details Modal
  const [selectedSessionDetails, setSelectedSessionDetails] = useState(null);
  const [loadingSessionModal, setLoadingSessionModal] = useState(false);
  const [showSessionModal, setShowSessionModal] = useState(false);

  // ----------------------------------------------------
  // TAB 4: FACULTY SUBSTITUTIONS STATE
  // ----------------------------------------------------
  const [substitutionData, setSubstitutionData] = useState({ data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 1 } });
  const [loadingSubstitutions, setLoadingSubstitutions] = useState(false);
  const [substitutionFilters, setSubstitutionFilters] = useState({
    department: '',
    course: '',
    status: '',
    page: 1,
    limit: 20
  });

  // Create Substitution Modal
  const [showCreateSubModal, setShowCreateSubModal] = useState(false);
  const [submittingSub, setSubmittingSub] = useState(false);
  const [subForm, setSubForm] = useState({
    courseId: '',
    substituteProfessorId: '',
    date: new Date().toISOString().split('T')[0],
    division: ''
  });

  // Cancel Substitution Modal
  const [subToCancel, setSubToCancel] = useState(null);
  const [cancelingSub, setCancelingSub] = useState(false);

  // Export State
  const [exporting, setExporting] = useState(false);

  // ----------------------------------------------------
  // INITIAL DATA FETCH (Departments, Courses, Professors)
  // ----------------------------------------------------
  useEffect(() => {
    const fetchInitialData = async () => {
      if (!instId) return;
      try {
        const [deptsRes, coursesRes, profsRes] = await Promise.allSettled([
          adminAPI.getDepartments({ institution: instId, limit: 100 }),
          adminAPI.getCourses({ institution: instId, limit: 100 }),
          usersAPI.getAll({ role: 'professor', institution: instId, limit: 100 })
        ]);

        if (deptsRes.status === 'fulfilled') {
          setDepartments(deptsRes.value.data?.data || deptsRes.value.data || []);
        }

        if (coursesRes.status === 'fulfilled') {
          const rawCourses = coursesRes.value.data?.data || coursesRes.value.data || [];
          setCourses(rawCourses);
          if (rawCourses.length > 0) {
            setSelectedCourseId(rawCourses[0]._id || rawCourses[0].id);
          }
        }

        if (profsRes.status === 'fulfilled') {
          setProfessors(profsRes.value.data?.data || profsRes.value.data || []);
        }
      } catch (err) {
        toast.error('Failed to load institution metadata');
      } finally {
        setLoadingInitial(false);
      }
    };

    fetchInitialData();
  }, [instId]);

  // ----------------------------------------------------
  // TAB 1 FETCHERS (Institution Overview & Dept Comparison)
  // ----------------------------------------------------
  const fetchOverviewSummary = useCallback(async () => {
    if (!instId) return;
    setLoadingOverview(true);
    try {
      const params = {};
      if (overviewFilters.departmentId) params.departmentId = overviewFilters.departmentId;
      if (overviewFilters.semester) params.semester = overviewFilters.semester;
      if (overviewFilters.division) params.division = overviewFilters.division;
      if (overviewFilters.from) params.from = overviewFilters.from;
      if (overviewFilters.to) params.to = overviewFilters.to;

      const res = await attendanceAPI.getInstitutionSummary(instId, params);
      setOverviewSummary(res.data);
    } catch (err) {
      toast.error('Failed to load institution attendance summary');
    } finally {
      setLoadingOverview(false);
    }
  }, [instId, overviewFilters]);

  // Fetch department summaries for comparison table
  const fetchDeptSummaries = useCallback(async () => {
    if (departments.length === 0) return;
    setLoadingDeptSummaries(true);
    try {
      const summaries = await Promise.all(
        departments.map(async (dept) => {
          const deptIdStr = dept._id || dept.id;
          try {
            const params = {};
            if (overviewFilters.semester) params.semester = overviewFilters.semester;
            if (overviewFilters.division) params.division = overviewFilters.division;
            if (overviewFilters.from) params.from = overviewFilters.from;
            if (overviewFilters.to) params.to = overviewFilters.to;

            const res = await attendanceAPI.getDepartmentSummary(deptIdStr, params);
            return {
              departmentId: deptIdStr,
              departmentName: dept.name,
              code: dept.code || '',
              summary: res.data?.summary || { conductedSessions: 0, totalRecords: 0, presentRecords: 0, absentRecords: 0, percentage: 0 }
            };
          } catch (e) {
            return {
              departmentId: deptIdStr,
              departmentName: dept.name,
              code: dept.code || '',
              summary: { conductedSessions: 0, totalRecords: 0, presentRecords: 0, absentRecords: 0, percentage: 0 }
            };
          }
        })
      );
      setDeptSummaries(summaries);
    } catch (err) {
      toast.error('Failed to load department comparison data');
    } finally {
      setLoadingDeptSummaries(false);
    }
  }, [departments, overviewFilters]);

  const fetchCourseSummary = useCallback(async () => {
    if (!selectedCourseId) return;
    setLoadingCourseSummary(true);
    try {
      const params = {};
      if (courseSummaryFilters.semester) params.semester = courseSummaryFilters.semester;
      if (courseSummaryFilters.division) params.division = courseSummaryFilters.division;

      const res = await attendanceAPI.getCourseSummary(selectedCourseId, params);
      setCourseSummaryData(res.data);
    } catch (err) {
      toast.error('Failed to load course summary');
    } finally {
      setLoadingCourseSummary(false);
    }
  }, [selectedCourseId, courseSummaryFilters]);

  useEffect(() => {
    if (activeTab === 'overview') {
      fetchOverviewSummary();
      fetchDeptSummaries();
    }
  }, [activeTab, fetchOverviewSummary, fetchDeptSummaries]);

  useEffect(() => {
    if (activeTab === 'overview' && selectedCourseId) {
      fetchCourseSummary();
    }
  }, [activeTab, selectedCourseId, fetchCourseSummary]);

  // ----------------------------------------------------
  // TAB 2 FETCHERS (Low Attendance)
  // ----------------------------------------------------
  const fetchLowAttendance = useCallback(async () => {
    if (!instId) return;
    setLoadingLowAttendance(true);
    try {
      const params = { institution: instId };
      if (lowAttendanceFilters.threshold) params.threshold = lowAttendanceFilters.threshold;
      if (lowAttendanceFilters.department) params.department = lowAttendanceFilters.department;
      if (lowAttendanceFilters.course) params.course = lowAttendanceFilters.course;
      if (lowAttendanceFilters.semester) params.semester = lowAttendanceFilters.semester;
      if (lowAttendanceFilters.division) params.division = lowAttendanceFilters.division;

      const res = await attendanceAPI.getLowAttendance(params);
      setLowAttendanceData(res.data);
    } catch (err) {
      toast.error('Failed to load low attendance report');
    } finally {
      setLoadingLowAttendance(false);
    }
  }, [instId, lowAttendanceFilters]);

  useEffect(() => {
    if (activeTab === 'low-attendance') {
      fetchLowAttendance();
    }
  }, [activeTab, fetchLowAttendance]);

  // ----------------------------------------------------
  // TAB 3 FETCHERS (Session History & Modal)
  // ----------------------------------------------------
  const fetchHistory = useCallback(async () => {
    if (!instId) return;
    setLoadingHistory(true);
    try {
      const params = { institution: instId };
      if (historyFilters.department) params.department = historyFilters.department;
      if (historyFilters.course) params.course = historyFilters.course;
      if (historyFilters.semester) params.semester = historyFilters.semester;
      if (historyFilters.division) params.division = historyFilters.division;
      if (historyFilters.professor) params.professor = historyFilters.professor;
      if (historyFilters.from) params.from = historyFilters.from;
      if (historyFilters.to) params.to = historyFilters.to;
      if (historyFilters.status) params.status = historyFilters.status;
      if (historyFilters.page) params.page = historyFilters.page;
      if (historyFilters.limit) params.limit = historyFilters.limit;

      const res = await attendanceAPI.getHistory(params);
      setHistoryData(res.data || { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 1 } });
    } catch (err) {
      toast.error('Failed to load session history');
    } finally {
      setLoadingHistory(false);
    }
  }, [instId, historyFilters]);

  useEffect(() => {
    if (activeTab === 'history') {
      fetchHistory();
    }
  }, [activeTab, fetchHistory]);

  const handleOpenSessionModal = async (sessionId) => {
    setLoadingSessionModal(true);
    setShowSessionModal(true);
    try {
      const res = await attendanceAPI.getSessionById(sessionId);
      setSelectedSessionDetails(res.data);
    } catch (err) {
      toast.error('Failed to load session details');
      setShowSessionModal(false);
    } finally {
      setLoadingSessionModal(false);
    }
  };

  // ----------------------------------------------------
  // TAB 4 FETCHERS (Faculty Substitutions)
  // ----------------------------------------------------
  const fetchSubstitutions = useCallback(async () => {
    if (!instId) return;
    setLoadingSubstitutions(true);
    try {
      const params = { institution: instId };
      if (substitutionFilters.department) params.department = substitutionFilters.department;
      if (substitutionFilters.course) params.course = substitutionFilters.course;
      if (substitutionFilters.status) params.status = substitutionFilters.status;
      if (substitutionFilters.page) params.page = substitutionFilters.page;
      if (substitutionFilters.limit) params.limit = substitutionFilters.limit;

      const res = await attendanceAPI.getSubstitutions(params);
      setSubstitutionData(res.data || { data: [], pagination: { total: 0, page: 1, limit: 20, totalPages: 1 } });
    } catch (err) {
      toast.error('Failed to load faculty substitutions');
    } finally {
      setLoadingSubstitutions(false);
    }
  }, [instId, substitutionFilters]);

  useEffect(() => {
    if (activeTab === 'substitutions') {
      fetchSubstitutions();
    }
  }, [activeTab, fetchSubstitutions]);

  // Create Substitution Handler
  const handleCreateSubstitution = async (e) => {
    e.preventDefault();
    if (!subForm.courseId) return toast.error('Please select a course');
    if (!subForm.substituteProfessorId) return toast.error('Please select a substitute professor');
    if (!subForm.date) return toast.error('Please select a date');

    setSubmittingSub(true);
    try {
      await attendanceAPI.createSubstitution({
        courseId: subForm.courseId,
        substituteProfessorId: subForm.substituteProfessorId,
        date: subForm.date,
        division: subForm.division ? subForm.division.trim().toUpperCase() : ''
      });
      toast.success('Faculty substitution assigned successfully');
      setShowCreateSubModal(false);
      setSubForm({
        courseId: '',
        substituteProfessorId: '',
        date: new Date().toISOString().split('T')[0],
        division: ''
      });
      fetchSubstitutions();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to create substitution';
      toast.error(msg);
    } finally {
      setSubmittingSub(false);
    }
  };

  // Cancel Substitution Handler
  const handleCancelSubstitution = async () => {
    if (!subToCancel) return;
    setCancelingSub(true);
    try {
      await attendanceAPI.updateSubstitution(subToCancel._id, { status: 'CANCELLED' });
      toast.success('Faculty substitution cancelled successfully');
      setSubToCancel(null);
      fetchSubstitutions();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to cancel substitution';
      toast.error(msg);
    } finally {
      setCancelingSub(false);
    }
  };

  // ----------------------------------------------------
  // EXPORT HANDLER
  // ----------------------------------------------------
  const handleExport = async () => {
    setExporting(true);
    try {
      const params = {};
      if (overviewFilters.departmentId) params.department = overviewFilters.departmentId;
      if (overviewFilters.division) params.division = overviewFilters.division;
      if (overviewFilters.from) params.from = overviewFilters.from;
      if (overviewFilters.to) params.to = overviewFilters.to;

      const res = await exportAPI.attendance(params);
      const data = res.data?.data || res.data || [];

      if (data.length === 0) {
        toast.error('No attendance records found to export');
        return;
      }

      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `institution_attendance_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      toast.success(`Exported ${data.length} attendance records`);
    } catch (err) {
      toast.error('Failed to export institution attendance');
    } finally {
      setExporting(false);
    }
  };

  // Selected course helper for modal
  const selectedCourseForModal = courses.find(c => (c._id || c.id) === subForm.courseId);
  const regularProfForModal = selectedCourseForModal?.professor?.name || 'Assigned Regular Professor';

  // Filter courses by department if selected
  const filteredCoursesForTab = lowAttendanceFilters.department
    ? courses.filter(c => (c.department?._id || c.department) === lowAttendanceFilters.department)
    : courses;

  if (loadingInitial) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER & TOP BAR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Attendance</h1>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium text-sm transition-colors shadow-sm disabled:opacity-50"
        >
          <Icons.Upload className="w-4 h-4 rotate-180" />
          {exporting ? 'Exporting...' : 'Export Attendance Report'}
        </button>
      </div>

      {/* NAVIGATION TABS */}
      <div className="flex border-b border-border gap-2 overflow-x-auto">
        {[
          { id: 'overview', label: 'Institution Overview', icon: Icons.Dashboard },
          { id: 'low-attendance', label: 'Low Attendance Alerts', icon: Icons.AlertTriangle },
          { id: 'history', label: 'Session History', icon: Icons.Clock },
          { id: 'substitutions', label: 'Faculty Substitutions', icon: Icons.Users }
        ].map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'border-blue-600 text-blue-600 bg-blue-50/50 rounded-t-lg'
                  : 'border-transparent text-muted hover:text-heading hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* ================================================================================= */}
      {/* TAB 1: OVERVIEW & DEPARTMENT COMPARISON */}
      {/* ================================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* FILTERS */}
          <div className="bg-surface rounded-card shadow-card border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-heading mb-3">
              <Icons.Filter className="w-4 h-4" />
              <span>Institution Summary Filters</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block text-muted mb-1 font-medium">Department</label>
                <select
                  value={overviewFilters.departmentId}
                  onChange={(e) => setOverviewFilters(prev => ({ ...prev, departmentId: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Departments</option>
                  {departments.map(d => (
                    <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Semester</label>
                <select
                  value={overviewFilters.semester}
                  onChange={(e) => setOverviewFilters(prev => ({ ...prev, semester: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Semesters</option>
                  {semestersList.map(s => <option key={s} value={s}>Semester {s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Division</label>
                <select
                  value={overviewFilters.division}
                  onChange={(e) => setOverviewFilters(prev => ({ ...prev, division: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Divisions</option>
                  {['A', 'B', 'C', 'D', 'E'].map(d => <option key={d} value={d}>Division {d}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">From Date</label>
                <input
                  type="date"
                  value={overviewFilters.from}
                  onChange={(e) => setOverviewFilters(prev => ({ ...prev, from: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">To Date</label>
                <input
                  type="date"
                  value={overviewFilters.to}
                  onChange={(e) => setOverviewFilters(prev => ({ ...prev, to: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* INSTITUTION KPI METRICS CARDS */}
          {loadingOverview ? (
            <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-surface rounded-card shadow-card border border-border p-5">
                <p className="text-xs text-muted font-medium uppercase tracking-wider">Conducted Sessions</p>
                <p className="text-2xl font-bold text-heading mt-2">{overviewSummary?.summary?.conductedSessions || 0}</p>
                <p className="text-xs text-muted mt-1">Across all departments</p>
              </div>

              <div className="bg-surface rounded-card shadow-card border border-border p-5">
                <p className="text-xs text-muted font-medium uppercase tracking-wider">Total Records</p>
                <p className="text-2xl font-bold text-heading mt-2">{overviewSummary?.summary?.totalRecords || 0}</p>
                <p className="text-xs text-muted mt-1">Student attendance entries</p>
              </div>

              <div className="bg-surface rounded-card shadow-card border border-border p-5">
                <p className="text-xs text-muted font-medium uppercase tracking-wider">Present Records</p>
                <p className="text-2xl font-bold text-green-600 mt-2">{overviewSummary?.summary?.presentRecords || 0}</p>
                <p className="text-xs text-muted mt-1">Marked Present</p>
              </div>

              <div className="bg-surface rounded-card shadow-card border border-border p-5 bg-gradient-to-br from-blue-50 to-indigo-50">
                <p className="text-xs text-blue-800 font-semibold uppercase tracking-wider">Institution Attendance %</p>
                <p className="text-3xl font-extrabold text-blue-700 mt-2">{overviewSummary?.summary?.percentage || 0}%</p>
                <p className="text-xs text-blue-600 mt-1">Authoritative Backend Rate</p>
              </div>
            </div>
          )}

          {/* DEPARTMENT ATTENDANCE COMPARISON TABLE */}
          <div className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
            <div className="border-b border-border pb-3">
              <h3 className="text-lg font-bold text-heading">Department Attendance Comparison</h3>
              <p className="text-xs text-muted">Overview of attendance metrics across departments in this institution</p>
            </div>

            {loadingDeptSummaries ? (
              <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
            ) : deptSummaries.length === 0 ? (
              <div className="text-center py-8 text-muted text-sm">No departments found for this institution.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold text-muted uppercase border-b border-border">
                    <tr>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4 text-center">Conducted Sessions</th>
                      <th className="py-3 px-4 text-center">Total Records</th>
                      <th className="py-3 px-4 text-center">Present</th>
                      <th className="py-3 px-4 text-center">Absent</th>
                      <th className="py-3 px-4 text-right">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {deptSummaries.map((ds) => (
                      <tr key={ds.departmentId} className="hover:bg-gray-50/50">
                        <td className="py-3.5 px-4 font-semibold text-heading">
                          {ds.departmentName} {ds.code ? `(${ds.code})` : ''}
                        </td>
                        <td className="py-3.5 px-4 text-center font-medium">{ds.summary.conductedSessions}</td>
                        <td className="py-3.5 px-4 text-center font-medium">{ds.summary.totalRecords}</td>
                        <td className="py-3.5 px-4 text-center font-semibold text-green-600">{ds.summary.presentRecords}</td>
                        <td className="py-3.5 px-4 text-center font-semibold text-red-600">{ds.summary.absentRecords}</td>
                        <td className="py-3.5 px-4 text-right">
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold ${
                            ds.summary.percentage >= 75 ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                          }`}>
                            {ds.summary.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* COURSE ATTENDANCE INSPECTOR */}
          <div className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-heading">Course Attendance Inspector</h3>
                <p className="text-xs text-muted">Inspect course-level student attendance records</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500"
                >
                  <option value="" disabled>Select Institution Course</option>
                  {courses.map(c => (
                    <option key={c._id || c.id} value={c._id || c.id}>
                      {c.name} ({c.code}) - {c.department?.name || 'Dept'}
                    </option>
                  ))}
                </select>

                <select
                  value={courseSummaryFilters.division}
                  onChange={(e) => setCourseSummaryFilters(prev => ({ ...prev, division: e.target.value }))}
                  className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Divisions</option>
                  {['A', 'B', 'C', 'D'].map(d => <option key={d} value={d}>Division {d}</option>)}
                </select>
              </div>
            </div>

            {loadingCourseSummary ? (
              <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
            ) : courseSummaryData ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-gray-50 p-4 rounded-lg border border-border">
                  <div>
                    <p className="font-bold text-heading text-base">{courseSummaryData.course?.name} ({courseSummaryData.course?.code})</p>
                    <p className="text-xs text-muted">Semester {courseSummaryData.course?.semester}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-muted block">Conducted Sessions</span>
                    <span className="text-xl font-bold text-blue-600">{courseSummaryData.summary?.conducted || 0}</span>
                  </div>
                </div>

                {courseSummaryData.students?.length === 0 ? (
                  <div className="text-center py-8 text-muted text-sm">No eligible students found for this course selection.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-50 text-xs font-semibold text-muted uppercase border-b border-border">
                        <tr>
                          <th className="py-3 px-4">Student Name</th>
                          <th className="py-3 px-4">Enrollment No.</th>
                          <th className="py-3 px-4">Division</th>
                          <th className="py-3 px-4 text-center">Present</th>
                          <th className="py-3 px-4 text-center">Absent</th>
                          <th className="py-3 px-4 text-right">Attendance %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {courseSummaryData.students.map((st) => (
                          <tr key={st.studentId} className="hover:bg-gray-50/50">
                            <td className="py-3 px-4 font-medium text-heading">
                              <div>
                                <p className="font-semibold">{st.name}</p>
                                <p className="text-xs text-muted">{st.email}</p>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-xs text-muted">{st.enrollmentNumber || '—'}</td>
                            <td className="py-3 px-4 text-xs font-medium">{st.division || 'A'}</td>
                            <td className="py-3 px-4 text-center font-semibold text-green-600">{st.present}</td>
                            <td className="py-3 px-4 text-center font-semibold text-red-600">{st.absent}</td>
                            <td className="py-3 px-4 text-right">
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                                st.percentage >= 75 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {st.percentage}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted text-sm">Select a course to view details.</div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================================= */}
      {/* TAB 2: LOW ATTENDANCE ALERTS */}
      {/* ================================================================================= */}
      {activeTab === 'low-attendance' && (
        <div className="space-y-6">
          {/* LOW ATTENDANCE FILTERS & HEADER */}
          <div className="bg-surface rounded-card shadow-card border border-border p-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-heading flex items-center gap-2">
                  <Icons.AlertTriangle className="w-5 h-5 text-amber-500" />
                  Institution Low Attendance Alerts
                </h3>
                <p className="text-xs text-muted mt-1">Identify students falling below threshold across institution departments</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted">Threshold:</span>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={lowAttendanceFilters.threshold}
                  onChange={(e) => setLowAttendanceFilters(prev => ({ ...prev, threshold: e.target.value }))}
                  className="w-20 rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-bold text-center focus:ring-2 focus:ring-blue-500"
                />
                <span className="text-sm font-bold text-muted">%</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs pt-3 border-t border-border">
              <div>
                <label className="block text-muted mb-1 font-medium">Department</label>
                <select
                  value={lowAttendanceFilters.department}
                  onChange={(e) => setLowAttendanceFilters(prev => ({ ...prev, department: e.target.value, course: '' }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Departments</option>
                  {departments.map(d => (
                    <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Course</label>
                <select
                  value={lowAttendanceFilters.course}
                  onChange={(e) => setLowAttendanceFilters(prev => ({ ...prev, course: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Courses</option>
                  {filteredCoursesForTab.map(c => (
                    <option key={c._id || c.id} value={c._id || c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Semester</label>
                <select
                  value={lowAttendanceFilters.semester}
                  onChange={(e) => setLowAttendanceFilters(prev => ({ ...prev, semester: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Semesters</option>
                  {semestersList.map(s => <option key={s} value={s}>Semester {s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Division</label>
                <select
                  value={lowAttendanceFilters.division}
                  onChange={(e) => setLowAttendanceFilters(prev => ({ ...prev, division: e.target.value }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Divisions</option>
                  {['A', 'B', 'C', 'D'].map(d => <option key={d} value={d}>Division {d}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* LOW ATTENDANCE TABLE */}
          <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <span className="text-sm font-semibold text-heading">
                Students Below Threshold ({lowAttendanceData?.threshold || lowAttendanceFilters.threshold}%)
              </span>
              <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold">
                {lowAttendanceData?.count || 0} Students Flagged
              </span>
            </div>

            {loadingLowAttendance ? (
              <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
            ) : !lowAttendanceData || lowAttendanceData.students?.length === 0 ? (
              <div className="text-center py-12 text-muted space-y-2">
                <Icons.CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
                <p className="font-semibold text-heading">No Low Attendance Alerts</p>
                <p className="text-xs">No students currently fall below the specified {lowAttendanceFilters.threshold}% threshold.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold text-muted uppercase border-b border-border">
                    <tr>
                      <th className="py-3 px-4">Student</th>
                      <th className="py-3 px-4">Enrollment No.</th>
                      <th className="py-3 px-4">Division</th>
                      <th className="py-3 px-4 text-center">Conducted</th>
                      <th className="py-3 px-4 text-center">Present</th>
                      <th className="py-3 px-4 text-center">Absent</th>
                      <th className="py-3 px-4 text-right">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lowAttendanceData.students.map((item) => (
                      <tr key={item.student?.id || item.student?._id} className="hover:bg-amber-50/30">
                        <td className="py-3.5 px-4 font-medium text-heading">
                          <div>
                            <p className="font-semibold text-slate-900">{item.student?.name}</p>
                            <p className="text-xs text-muted">{item.student?.email}</p>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-muted">{item.student?.enrollmentNumber || '—'}</td>
                        <td className="py-3.5 px-4 text-xs font-semibold">{item.student?.division || 'A'}</td>
                        <td className="py-3.5 px-4 text-center font-medium">{item.conducted}</td>
                        <td className="py-3.5 px-4 text-center font-semibold text-green-600">{item.present}</td>
                        <td className="py-3.5 px-4 text-center font-semibold text-red-600">{item.absent}</td>
                        <td className="py-3.5 px-4 text-right">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-red-100 text-red-800">
                            {item.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================================= */}
      {/* TAB 3: SESSION HISTORY */}
      {/* ================================================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* HISTORY FILTERS */}
          <div className="bg-surface rounded-card shadow-card border border-border p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-heading mb-3">
              <Icons.Filter className="w-4 h-4" />
              <span>Institution Session History Filters</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3 text-xs">
              <div>
                <label className="block text-muted mb-1 font-medium">Department</label>
                <select
                  value={historyFilters.department}
                  onChange={(e) => setHistoryFilters(prev => ({ ...prev, department: e.target.value, page: 1 }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Departments</option>
                  {departments.map(d => (
                    <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Course</label>
                <select
                  value={historyFilters.course}
                  onChange={(e) => setHistoryFilters(prev => ({ ...prev, course: e.target.value, page: 1 }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Courses</option>
                  {courses.map(c => (
                    <option key={c._id || c.id} value={c._id || c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Semester</label>
                <select
                  value={historyFilters.semester}
                  onChange={(e) => setHistoryFilters(prev => ({ ...prev, semester: e.target.value, page: 1 }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Semesters</option>
                  {semestersList.map(s => <option key={s} value={s}>Semester {s}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Division</label>
                <select
                  value={historyFilters.division}
                  onChange={(e) => setHistoryFilters(prev => ({ ...prev, division: e.target.value, page: 1 }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Divisions</option>
                  {['A', 'B', 'C', 'D'].map(d => <option key={d} value={d}>Division {d}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Professor</label>
                <select
                  value={historyFilters.professor}
                  onChange={(e) => setHistoryFilters(prev => ({ ...prev, professor: e.target.value, page: 1 }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Professors</option>
                  {professors.map(p => (
                    <option key={p._id || p.id} value={p._id || p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Status</label>
                <select
                  value={historyFilters.status}
                  onChange={(e) => setHistoryFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="CONDUCTED">CONDUCTED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">From</label>
                <input
                  type="date"
                  value={historyFilters.from}
                  onChange={(e) => setHistoryFilters(prev => ({ ...prev, from: e.target.value, page: 1 }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">To</label>
                <input
                  type="date"
                  value={historyFilters.to}
                  onChange={(e) => setHistoryFilters(prev => ({ ...prev, to: e.target.value, page: 1 }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* HISTORY TABLE */}
          <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
            {loadingHistory ? (
              <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
            ) : historyData.data?.length === 0 ? (
              <div className="text-center py-12 text-muted">No attendance sessions found for the selected filters.</div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-xs font-semibold text-muted uppercase border-b border-border">
                      <tr>
                        <th className="py-3 px-4">Date & Time</th>
                        <th className="py-3 px-4">Course & Dept</th>
                        <th className="py-3 px-4">Sem/Div</th>
                        <th className="py-3 px-4">Topic</th>
                        <th className="py-3 px-4">Marked By</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-center">Records</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {historyData.data.map((item) => {
                        const sess = item.session;
                        const recs = item.records || [];
                        const presentCount = recs.filter(r => r.status === 'PRESENT').length;
                        const absentCount = recs.filter(r => r.status === 'ABSENT').length;
                        const sessionDateStr = sess.date ? new Date(sess.date).toISOString().split('T')[0] : '—';

                        return (
                          <tr key={sess._id} className="hover:bg-gray-50/50">
                            <td className="py-3.5 px-4">
                              <p className="font-semibold text-heading">{sessionDateStr}</p>
                              <p className="text-xs text-muted">{sess.startTime || 'Standard Time'}</p>
                            </td>
                            <td className="py-3.5 px-4 font-medium">
                              <p className="text-heading font-semibold">{sess.course?.name || 'Course'}</p>
                              <p className="text-xs font-mono text-muted">{sess.course?.code} {sess.department?.name ? `(${sess.department.name})` : ''}</p>
                            </td>
                            <td className="py-3.5 px-4 text-xs font-medium">
                              Sem {sess.semester} | Div {sess.division || 'A'}
                            </td>
                            <td className="py-3.5 px-4 text-xs text-muted max-w-[180px] truncate">
                              {sess.topic || 'Regular Lecture'}
                            </td>
                            <td className="py-3.5 px-4 text-xs font-medium text-heading">
                              {sess.markedBy?.name || 'Faculty'}
                            </td>
                            <td className="py-3.5 px-4 text-center">
                              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${
                                sess.status === 'CONDUCTED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                              }`}>
                                {sess.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4 text-center text-xs">
                              {sess.status === 'CONDUCTED' ? (
                                <span className="font-semibold">
                                  <span className="text-green-600">{presentCount} P</span> / <span className="text-red-600">{absentCount} A</span>
                                </span>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </td>
                            <td className="py-3.5 px-4 text-right">
                              <button
                                onClick={() => handleOpenSessionModal(sess._id)}
                                className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-heading rounded text-xs font-medium transition-colors"
                              >
                                View Details
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* PAGINATION */}
                {historyData.pagination && historyData.pagination.totalPages > 1 && (
                  <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted">
                    <span>
                      Page {historyData.pagination.page} of {historyData.pagination.totalPages} ({historyData.pagination.total} total sessions)
                    </span>
                    <div className="flex gap-2">
                      <button
                        disabled={historyData.pagination.page <= 1}
                        onClick={() => setHistoryFilters(prev => ({ ...prev, page: prev.page - 1 }))}
                        className="px-3 py-1 rounded border border-border bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Previous
                      </button>
                      <button
                        disabled={historyData.pagination.page >= historyData.pagination.totalPages}
                        onClick={() => setHistoryFilters(prev => ({ ...prev, page: prev.page + 1 }))}
                        className="px-3 py-1 rounded border border-border bg-white hover:bg-gray-50 disabled:opacity-50"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ================================================================================= */}
      {/* TAB 4: FACULTY SUBSTITUTIONS */}
      {/* ================================================================================= */}
      {activeTab === 'substitutions' && (
        <div className="space-y-6">
          {/* HEADER & FILTERS */}
          <div className="bg-surface rounded-card shadow-card border border-border p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-heading">Faculty Substitution Management</h3>
                <p className="text-xs text-muted">Manage temporary faculty substitutions across institution courses</p>
              </div>

              <button
                onClick={() => setShowCreateSubModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition-colors"
              >
                <Icons.Plus className="w-4 h-4" />
                Assign Faculty Substitution
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-3 border-t border-border">
              <div>
                <label className="block text-muted mb-1 font-medium">Department Filter</label>
                <select
                  value={substitutionFilters.department}
                  onChange={(e) => setSubstitutionFilters(prev => ({ ...prev, department: e.target.value, course: '', page: 1 }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Departments</option>
                  {departments.map(d => (
                    <option key={d._id || d.id} value={d._id || d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Course Filter</label>
                <select
                  value={substitutionFilters.course}
                  onChange={(e) => setSubstitutionFilters(prev => ({ ...prev, course: e.target.value, page: 1 }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Courses</option>
                  {courses.map(c => (
                    <option key={c._id || c.id} value={c._id || c.id}>{c.name} ({c.code})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-muted mb-1 font-medium">Status Filter</label>
                <select
                  value={substitutionFilters.status}
                  onChange={(e) => setSubstitutionFilters(prev => ({ ...prev, status: e.target.value, page: 1 }))}
                  className="w-full rounded-lg border border-border bg-white p-2 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Statuses</option>
                  <option value="APPROVED">APPROVED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
            </div>
          </div>

          {/* SUBSTITUTIONS TABLE */}
          <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
            {loadingSubstitutions ? (
              <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
            ) : substitutionData.data?.length === 0 ? (
              <div className="text-center py-12 text-muted">No faculty substitutions found.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold text-muted uppercase border-b border-border">
                    <tr>
                      <th className="py-3 px-4">Course & Dept</th>
                      <th className="py-3 px-4">Regular Professor</th>
                      <th className="py-3 px-4">Substitute Professor</th>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Sem/Div</th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {substitutionData.data.map((sub) => {
                      const subDateStr = sub.date ? new Date(sub.date).toISOString().split('T')[0] : '—';
                      return (
                        <tr key={sub._id} className="hover:bg-gray-50/50">
                          <td className="py-3.5 px-4 font-medium text-heading">
                            <p className="font-semibold">{sub.course?.name}</p>
                            <p className="text-xs font-mono text-muted">{sub.course?.code} {sub.department?.name ? `(${sub.department.name})` : ''}</p>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-medium">
                            <p className="text-heading font-semibold">{sub.regularProfessor?.name || 'Assigned Regular'}</p>
                            <p className="text-muted">{sub.regularProfessor?.email}</p>
                          </td>
                          <td className="py-3.5 px-4 text-xs font-medium">
                            <p className="text-blue-600 font-bold">{sub.substituteProfessor?.name || 'Substitute Prof'}</p>
                            <p className="text-muted">{sub.substituteProfessor?.email}</p>
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs font-bold text-slate-800">
                            {subDateStr}
                          </td>
                          <td className="py-3.5 px-4 text-xs">
                            Sem {sub.semester || '—'} {sub.division ? `| Div ${sub.division}` : '| All Divs'}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${
                              sub.status === 'APPROVED' ? 'bg-green-100 text-green-800' : 'bg-gray-200 text-gray-700'
                            }`}>
                              {sub.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            {sub.status === 'APPROVED' ? (
                              <button
                                onClick={() => setSubToCancel(sub)}
                                className="px-3 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-xs font-semibold transition-colors"
                              >
                                Cancel
                              </button>
                            ) : (
                              <span className="text-xs text-muted italic">Cancelled</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================================================================================= */}
      {/* SESSION DETAILS MODAL */}
      {/* ================================================================================= */}
      {showSessionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-card shadow-2xl border border-border w-full max-w-3xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="p-4 border-b border-border flex items-center justify-between bg-gray-50">
              <h3 className="text-base font-bold text-heading">Session Attendance Details</h3>
              <button
                onClick={() => { setShowSessionModal(false); setSelectedSessionDetails(null); }}
                className="text-muted hover:text-heading p-1"
                aria-label="Close"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {loadingSessionModal ? (
                <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
              ) : selectedSessionDetails ? (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg border border-border text-xs">
                    <div>
                      <span className="text-muted block">Course</span>
                      <span className="font-bold text-heading text-sm">{selectedSessionDetails.session?.course?.name}</span>
                    </div>
                    <div>
                      <span className="text-muted block">Date & Time</span>
                      <span className="font-semibold text-heading">
                        {selectedSessionDetails.session?.date ? new Date(selectedSessionDetails.session.date).toISOString().split('T')[0] : '—'}{' '}
                        ({selectedSessionDetails.session?.startTime || 'Regular'})
                      </span>
                    </div>
                    <div>
                      <span className="text-muted block">Sem / Division</span>
                      <span className="font-semibold text-heading">Sem {selectedSessionDetails.session?.semester} | Div {selectedSessionDetails.session?.division || 'A'}</span>
                    </div>
                    <div>
                      <span className="text-muted block">Session Status</span>
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold mt-0.5 ${
                        selectedSessionDetails.session?.status === 'CONDUCTED' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}>
                        {selectedSessionDetails.session?.status}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted block">Topic Covered</span>
                      <span className="font-medium text-heading">{selectedSessionDetails.session?.topic || 'N/A'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-muted block">Marked By</span>
                      <span className="font-medium text-heading">{selectedSessionDetails.session?.markedBy?.name} ({selectedSessionDetails.session?.markedBy?.email})</span>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-bold text-heading mb-3">Student Attendance Records ({selectedSessionDetails.records?.length || 0})</h4>
                    {selectedSessionDetails.records?.length === 0 ? (
                      <p className="text-xs text-muted">No student records saved for this session.</p>
                    ) : (
                      <div className="overflow-x-auto border border-border rounded-lg">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-gray-50 text-muted font-semibold border-b border-border uppercase">
                            <tr>
                              <th className="py-2.5 px-3">Student Name</th>
                              <th className="py-2.5 px-3">Enrollment No.</th>
                              <th className="py-2.5 px-3">Division</th>
                              <th className="py-2.5 px-3 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {selectedSessionDetails.records.map((r) => (
                              <tr key={r._id}>
                                <td className="py-2.5 px-3 font-semibold text-heading">{r.student?.name}</td>
                                <td className="py-2.5 px-3 font-mono text-muted">{r.student?.enrollmentNumber || '—'}</td>
                                <td className="py-2.5 px-3">{r.student?.division || 'A'}</td>
                                <td className="py-2.5 px-3 text-right">
                                  <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                                    r.status === 'PRESENT' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                  }`}>
                                    {r.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </div>

            <div className="p-4 border-t border-border flex justify-end bg-gray-50">
              <button
                onClick={() => { setShowSessionModal(false); setSelectedSessionDetails(null); }}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-heading rounded-lg text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================================= */}
      {/* CREATE FACULTY SUBSTITUTION MODAL */}
      {/* ================================================================================= */}
      {showCreateSubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-card shadow-2xl border border-border w-full max-w-lg overflow-hidden">
            <div className="p-4 border-b border-border flex items-center justify-between bg-gray-50">
              <h3 className="text-base font-bold text-heading">Assign Institution Faculty Substitution</h3>
              <button
                onClick={() => setShowCreateSubModal(false)}
                className="text-muted hover:text-heading p-1"
                aria-label="Close"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubstitution} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-heading mb-1">Select Course *</label>
                <select
                  value={subForm.courseId}
                  onChange={(e) => setSubForm(prev => ({ ...prev, courseId: e.target.value }))}
                  required
                  className="w-full rounded-lg border border-border bg-white p-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Choose Course --</option>
                  {courses.map(c => (
                    <option key={c._id || c.id} value={c._id || c.id}>
                      {c.name} ({c.code}) - {c.department?.name || 'Dept'}
                    </option>
                  ))}
                </select>
              </div>

              {subForm.courseId && (
                <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-lg">
                  <span className="text-muted block">Assigned Regular Professor:</span>
                  <span className="font-bold text-blue-900 text-sm">{regularProfForModal}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-heading mb-1">Substitute Professor *</label>
                <select
                  value={subForm.substituteProfessorId}
                  onChange={(e) => setSubForm(prev => ({ ...prev, substituteProfessorId: e.target.value }))}
                  required
                  className="w-full rounded-lg border border-border bg-white p-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Choose Substitute Professor --</option>
                  {professors
                    .filter(p => (p._id || p.id) !== selectedCourseForModal?.professor?._id && (p._id || p.id) !== selectedCourseForModal?.professor)
                    .map(p => (
                      <option key={p._id || p.id} value={p._id || p.id}>
                        {p.name} ({p.email}) - {p.department?.name || 'Faculty'}
                      </option>
                    ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-heading mb-1">Substitution Date *</label>
                  <input
                    type="date"
                    required
                    value={subForm.date}
                    onChange={(e) => setSubForm(prev => ({ ...prev, date: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-white p-2.5 text-sm focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-heading mb-1">Division (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. A (Leave empty for all)"
                    value={subForm.division}
                    onChange={(e) => setSubForm(prev => ({ ...prev, division: e.target.value }))}
                    className="w-full rounded-lg border border-border bg-white p-2.5 text-sm focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                </div>
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs">
                <span className="font-bold">Note:</span> Substitution is temporary and date/division-scoped. Regular course professor assignment remains intact.
              </div>

              <div className="pt-4 border-t border-border flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateSubModal(false)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-heading rounded-lg font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSub}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                >
                  {submittingSub ? 'Submitting...' : 'Approve Substitution'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================================= */}
      {/* CANCEL SUBSTITUTION CONFIRMATION MODAL */}
      {/* ================================================================================= */}
      {subToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface rounded-card shadow-2xl border border-border w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <Icons.AlertCircle className="w-6 h-6" />
              <h3 className="text-base font-bold text-heading">Cancel Substitution?</h3>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Are you sure you want to cancel the faculty substitution for course{' '}
              <span className="font-bold text-heading">{subToCancel.course?.name}</span> on{' '}
              <span className="font-bold text-heading">
                {subToCancel.date ? new Date(subToCancel.date).toISOString().split('T')[0] : ''}
              </span>{' '}
              assigned to <span className="font-bold text-heading">{subToCancel.substituteProfessor?.name}</span>?
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <button
                disabled={cancelingSub}
                onClick={() => setSubToCancel(null)}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-heading rounded-lg text-xs font-semibold transition-colors"
              >
                Keep Active
              </button>
              <button
                disabled={cancelingSub}
                onClick={handleCancelSubstitution}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
              >
                {cancelingSub ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
