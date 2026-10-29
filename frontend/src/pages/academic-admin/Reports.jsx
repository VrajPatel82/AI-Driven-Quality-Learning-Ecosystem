import { useState, useEffect, useCallback, useMemo } from 'react';
import { analyticsAPI, exportAPI, coursesAPI, usersAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function AcademicReports() {
  const { user } = useAuth();
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(true);

  const deptName = user?.department?.name || user?.departmentName || 'Department';
  const deptId = user?.department?._id || user?.department;

  // Filter States
  const [academicTerm, setAcademicTerm] = useState('');
  const [selectedSemester, setSelectedSemester] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedProfessor, setSelectedProfessor] = useState('');

  // Overview Data State
  const [data, setData] = useState({
    summary: {
      totalStudents: 0,
      totalCourses: 0,
      averagePerformance: 0,
      averageAttendance: 0,
      atRiskStudents: 0
    },
    filterOptions: {
      courses: [],
      professors: []
    },
    semesterPerformance: [],
    coursePerformance: [],
    marksDistribution: [],
    attendanceAnalytics: {
      averageAttendance: 0,
      bySemester: [],
      byCourse: [],
      lowAttendanceStudents: []
    },
    atRiskStudents: []
  });

  // Fallback initial dropdown options
  const [fallbackCourses, setFallbackCourses] = useState([]);
  const [fallbackProfessors, setFallbackProfessors] = useState([]);

  useEffect(() => {
    async function loadFallbackDropdowns() {
      try {
        const [cRes, pRes] = await Promise.allSettled([
          coursesAPI.getAll({ department: deptId }),
          usersAPI.getAll({ role: 'professor', department: deptId })
        ]);

        if (cRes.status === 'fulfilled') {
          const cData = cRes.value.data?.courses || cRes.value.data || [];
          setFallbackCourses(Array.isArray(cData) ? cData : []);
        }
        if (pRes.status === 'fulfilled') {
          const pData = pRes.value.data?.users || pRes.value.data || [];
          setFallbackProfessors(Array.isArray(pData) ? pData : []);
        }
      } catch (err) {
        console.error('Error loading fallback options:', err);
      }
    }
    loadFallbackDropdowns();
  }, [deptId]);

  // Fetch overview data
  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (academicTerm) params.academicTerm = academicTerm;
      if (selectedSemester) params.semester = selectedSemester;
      if (selectedCourse) params.course = selectedCourse;
      if (selectedDivision) params.division = selectedDivision;
      if (selectedProfessor) params.professor = selectedProfessor;
      if (deptId) params.department = deptId;

      const res = await analyticsAPI.getAcademicAdminOverview(params);
      if (res.data?.success || res.data) {
        setData(res.data);
      }
    } catch (err) {
      console.error('Error fetching academic admin analytics:', err);
      toast.error('Failed to load academic analytics');
    } finally {
      setLoading(false);
    }
  }, [academicTerm, selectedSemester, selectedCourse, selectedDivision, selectedProfessor, deptId]);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  // All scoped department courses & professors from filterOptions or fallbacks
  const allCourses = useMemo(() => {
    return data.filterOptions?.courses?.length > 0
      ? data.filterOptions.courses
      : fallbackCourses;
  }, [data.filterOptions, fallbackCourses]);

  const allProfessors = useMemo(() => {
    return data.filterOptions?.professors?.length > 0
      ? data.filterOptions.professors
      : fallbackProfessors;
  }, [data.filterOptions, fallbackProfessors]);

  // Dynamically compute available courses based on active filters
  const availableCourses = useMemo(() => {
    let list = allCourses;
    if (selectedSemester) {
      const sem = parseInt(selectedSemester, 10);
      list = list.filter(c => c.semester === sem);
    }
    if (selectedProfessor) {
      const pId = selectedProfessor.toString();
      list = list.filter(c => {
        if (c.professorId && c.professorId.toString() === pId) return true;
        const prof = allProfessors.find(p => p._id.toString() === pId);
        return prof && prof.courses && prof.courses.includes(c._id.toString());
      });
    }
    return list;
  }, [allCourses, allProfessors, selectedSemester, selectedProfessor]);

  // Dynamically compute available professors based on active filters
  const availableProfessors = useMemo(() => {
    let matchingCourseIds = null;
    if (selectedCourse) {
      matchingCourseIds = new Set([selectedCourse.toString()]);
    } else if (selectedSemester) {
      const sem = parseInt(selectedSemester, 10);
      const semCourses = allCourses.filter(c => c.semester === sem);
      matchingCourseIds = new Set(semCourses.map(c => c._id.toString()));
    }

    if (!matchingCourseIds) {
      return allProfessors;
    }

    const filteredProfs = allProfessors.filter(p => {
      const profCourseIds = (p.courses || []).map(id => id.toString());
      const isAssignedViaUser = profCourseIds.some(id => matchingCourseIds.has(id));
      const isAssignedViaCourse = allCourses.some(c => matchingCourseIds.has(c._id.toString()) && c.professorId === p._id.toString());
      return isAssignedViaUser || isAssignedViaCourse;
    });

    return filteredProfs.length > 0 ? filteredProfs : allProfessors;
  }, [allCourses, allProfessors, selectedSemester, selectedCourse]);

  // Clear child filter if no longer available in filtered dropdown
  useEffect(() => {
    if (selectedCourse && availableCourses.length > 0 && !availableCourses.some(c => c._id.toString() === selectedCourse.toString())) {
      setSelectedCourse('');
    }
  }, [availableCourses, selectedCourse]);

  useEffect(() => {
    if (selectedProfessor && availableProfessors.length > 0 && !availableProfessors.some(p => p._id.toString() === selectedProfessor.toString())) {
      setSelectedProfessor('');
    }
  }, [availableProfessors, selectedProfessor]);

  const handleResetFilters = () => {
    setAcademicTerm('');
    setSelectedSemester('');
    setSelectedCourse('');
    setSelectedDivision('');
    setSelectedProfessor('');
  };

  const handleDownload = async (type) => {
    setDownloading(true);
    try {
      if (type === 'students') {
        const res = await exportAPI.students({ department: deptId });
        triggerDownload(res.data, `${deptName.replace(/\s+/g, '_')}_students.csv`);
      } else if (type === 'attendance') {
        const res = await exportAPI.attendance({ department: deptId });
        triggerDownload(res.data, `${deptName.replace(/\s+/g, '_')}_attendance.csv`);
      } else {
        toast.success(`Generated ${type} report`);
      }
    } catch {
      toast.error('Failed to export report');
    } finally {
      setDownloading(false);
    }
  };

  const triggerDownload = (downloadData, filename) => {
    const blob = new Blob([downloadData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report downloaded successfully');
  };

  const summary = data.summary || {};
  const semesterPerf = data.semesterPerformance || [];
  const coursePerf = data.coursePerformance || [];
  const marksDist = data.marksDistribution || [];
  const attAnalytics = data.attendanceAnalytics || {};
  const atRiskList = data.atRiskStudents || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Academic Analytics</h1>
          <p className="text-xs text-muted mt-1">
            Departmental academic performance, Gradebook distributions, attendance compliance, and student risk analytics.
          </p>
        </div>

        <button
          onClick={fetchOverview}
          className="btn-secondary text-xs px-3 py-2 flex items-center gap-2 rounded-btn self-start md:self-auto"
        >
          <Icons.Refresh className="w-3.5 h-3.5" /> Refresh Analytics
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Icons.Filter className="w-4 h-4 text-blue-600" />
            <span>Filter Analytics</span>
          </div>
          {(academicTerm || selectedSemester || selectedCourse || selectedDivision || selectedProfessor) && (
            <button
              onClick={handleResetFilters}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-medium text-muted mb-1">Academic Term</label>
            <input
              type="text"
              placeholder="e.g. CURRENT"
              value={academicTerm}
              onChange={(e) => setAcademicTerm(e.target.value)}
              className="input-field text-xs py-1.5"
            />
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted mb-1">Semester</label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="input-field text-xs py-1.5"
            >
              <option value="">All Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <option key={s} value={s}>Semester {s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted mb-1">Course</label>
            <select
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
              className="input-field text-xs py-1.5"
            >
              <option value="">All Courses</option>
              {availableCourses.map(c => (
                <option key={c._id} value={c._id}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted mb-1">Division</label>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="input-field text-xs py-1.5"
            >
              <option value="">All Divisions</option>
              {['A', 'B', 'C', 'D'].map(d => (
                <option key={d} value={d}>Division {d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-muted mb-1">Professor</label>
            <select
              value={selectedProfessor}
              onChange={(e) => setSelectedProfessor(e.target.value)}
              className="input-field text-xs py-1.5"
            >
              <option value="">All Faculty</option>
              {availableProfessors.map(p => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-surface rounded-card p-12 text-center border border-border">
          <Icons.Loader className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-3" />
          <p className="text-xs text-muted">Loading department academic analytics...</p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-surface rounded-card p-4 shadow-card border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted font-medium">Total Students</span>
                <div className="w-8 h-8 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center">
                  <Icons.Users className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{summary.totalStudents || 0}</p>
              <p className="text-[11px] text-muted mt-1">Active enrolled scope</p>
            </div>

            <div className="bg-surface rounded-card p-4 shadow-card border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted font-medium">Total Courses</span>
                <div className="w-8 h-8 bg-indigo-50 text-indigo-700 rounded-lg flex items-center justify-center">
                  <Icons.BookOpen className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">{summary.totalCourses || 0}</p>
              <p className="text-[11px] text-muted mt-1">Matching active courses</p>
            </div>

            <div className="bg-surface rounded-card p-4 shadow-card border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted font-medium">Avg Performance</span>
                <div className="w-8 h-8 bg-emerald-50 text-emerald-700 rounded-lg flex items-center justify-center">
                  <Icons.Award className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">
                {summary.averagePerformance ? `${summary.averagePerformance}%` : '0%'}
              </p>
              <p className="text-[11px] text-muted mt-1">Gradebook weighted avg</p>
            </div>

            <div className="bg-surface rounded-card p-4 shadow-card border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted font-medium">Avg Attendance</span>
                <div className="w-8 h-8 bg-sky-50 text-sky-700 rounded-lg flex items-center justify-center">
                  <Icons.Calendar className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-2">
                {summary.averageAttendance ? `${summary.averageAttendance}%` : '0%'}
              </p>
              <p className="text-[11px] text-muted mt-1">Conducted sessions</p>
            </div>

            <div className="bg-surface rounded-card p-4 shadow-card border border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted font-medium">At-Risk Students</span>
                <div className="w-8 h-8 bg-amber-50 text-amber-700 rounded-lg flex items-center justify-center">
                  <Icons.AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <p className="text-2xl font-bold text-amber-700 mt-2">{summary.atRiskStudents || 0}</p>
              <p className="text-[11px] text-amber-600 mt-1 font-medium">&lt;75% Att. / &lt;50% Marks / Backlog</p>
            </div>
          </div>

          {/* Section 1: Semester Performance */}
          <div className="bg-surface rounded-card shadow-card border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Semester Performance Breakdown</h2>
                <p className="text-xs text-muted">Aggregated Gradebook results per academic semester</p>
              </div>
            </div>

            {semesterPerf.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">No semester performance data available for current filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-slate-50/50">
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Semester</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Students</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Courses</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Avg Marks %</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Passed</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Failed</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Pass Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {semesterPerf.map(s => (
                      <tr key={s.semester} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900">Semester {s.semester}</td>
                        <td className="py-2.5 px-3 text-slate-700">{s.studentCount}</td>
                        <td className="py-2.5 px-3 text-slate-700">{s.courseCount}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-800">{s.averagePercentage}%</td>
                        <td className="py-2.5 px-3 text-emerald-700 font-medium">{s.passCount}</td>
                        <td className="py-2.5 px-3 text-rose-700 font-medium">{s.failCount}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-24 bg-slate-100 h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${s.passPercentage >= 75 ? 'bg-emerald-500' : s.passPercentage >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                style={{ width: `${Math.min(100, s.passPercentage)}%` }}
                              />
                            </div>
                            <span className="font-semibold text-slate-900">{s.passPercentage}%</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 2: Course Performance */}
          <div className="bg-surface rounded-card shadow-card border border-border p-6">
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900">Course-Level Academic Performance</h2>
              <p className="text-xs text-muted">Authoritative Gradebook scores per course</p>
            </div>

            {coursePerf.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">No course performance data found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-slate-50/50">
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Course</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Semester</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Faculty</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Enrolled</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Avg %</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">High / Low</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Pass / Fail</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Pass Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {coursePerf.map(c => (
                      <tr key={c.courseId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-2.5 px-3">
                          <span className="font-bold text-slate-900">{c.courseCode}</span>
                          <span className="block text-[11px] text-muted">{c.courseName}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">Sem {c.semester}</td>
                        <td className="py-2.5 px-3 text-slate-700 font-medium">{c.professor}</td>
                        <td className="py-2.5 px-3 text-slate-700">{c.enrolledCount}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{c.averagePercentage}%</td>
                        <td className="py-2.5 px-3 text-slate-600">{c.highestPercentage}% / {c.lowestPercentage}%</td>
                        <td className="py-2.5 px-3">
                          <span className="text-emerald-700 font-medium">{c.passCount} P</span> / <span className="text-rose-700 font-medium">{c.failCount} F</span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${c.passPercentage >= 75 ? 'bg-emerald-50 text-emerald-700' : c.passPercentage >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-700'}`}>
                            {c.passPercentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 3: Marks Distribution */}
          <div className="bg-surface rounded-card shadow-card border border-border p-6">
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900">Gradebook Marks Distribution</h2>
              <p className="text-xs text-muted">7 non-overlapping percentage score brackets</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
              {marksDist.map(b => {
                const totalGraded = marksDist.reduce((sum, item) => sum + item.count, 0);
                const pct = totalGraded > 0 ? ((b.count / totalGraded) * 100).toFixed(1) : 0;
                return (
                  <div key={b.label} className="bg-slate-50/70 border border-border rounded-lg p-3 text-center flex flex-col justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-slate-600 block">{b.label}%</span>
                      <p className="text-xl font-bold text-slate-900 mt-1">{b.count}</p>
                      <span className="text-[10px] text-muted block">{pct}% of students</span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full mt-3 overflow-hidden">
                      <div
                        className="bg-blue-600 h-full rounded-full"
                        style={{ width: `${Math.min(100, parseFloat(pct))}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 4: Attendance Analytics */}
          <div className="bg-surface rounded-card shadow-card border border-border p-6 space-y-6">
            <div>
              <h2 className="text-base font-bold text-slate-900">Attendance Analytics</h2>
              <p className="text-xs text-muted">Authoritative session logs &amp; low-attendance defalcation warnings (&lt;75%)</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Course Attendance Breakdown */}
              <div className="border border-border rounded-lg p-4">
                <h3 className="text-xs font-bold text-slate-800 mb-3">Course Attendance Breakdown</h3>
                {attAnalytics.byCourse?.length === 0 ? (
                  <p className="text-xs text-muted py-2">No session records found.</p>
                ) : (
                  <div className="space-y-3">
                    {attAnalytics.byCourse?.map(c => (
                      <div key={c.courseId} className="flex items-center justify-between text-xs">
                        <div>
                          <span className="font-semibold text-slate-800">{c.courseCode}</span>
                          <span className="text-muted ml-2">({c.totalSessions} sessions)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-20 bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${c.averageAttendance >= 75 ? 'bg-sky-500' : 'bg-rose-500'}`}
                              style={{ width: `${Math.min(100, c.averageAttendance)}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-900 w-12 text-right">{c.averageAttendance}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Low Attendance Students (<75%) */}
              <div className="border border-border rounded-lg p-4">
                <h3 className="text-xs font-bold text-rose-800 mb-3 flex items-center gap-1.5">
                  <Icons.AlertCircle className="w-4 h-4 text-rose-600" />
                  Defalcation Risk (&lt;75% Attendance)
                </h3>
                {attAnalytics.lowAttendanceStudents?.length === 0 ? (
                  <p className="text-xs text-emerald-700 py-2 font-medium">All students meet the 75% attendance threshold!</p>
                ) : (
                  <div className="overflow-y-auto max-h-56 divide-y divide-border text-xs">
                    {attAnalytics.lowAttendanceStudents?.map(st => (
                      <div key={st.studentId} className="py-2 flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{st.name}</p>
                          <span className="text-[11px] text-muted">{st.enrollmentNumber} | Sem {st.semester} Div {st.division}</span>
                        </div>
                        <div className="text-right">
                          <span className="font-bold text-rose-700 text-xs">{st.attendancePercentage}%</span>
                          <span className="block text-[10px] text-muted">{st.presentClasses}/{st.totalClasses} Present</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 5: At-Risk Students */}
          <div className="bg-surface rounded-card shadow-card border border-border p-6">
            <div className="mb-4">
              <h2 className="text-base font-bold text-slate-900">Academic At-Risk Students</h2>
              <p className="text-xs text-muted">Students flagged for Low Attendance (&lt;75%), Low Marks (&lt;50%), or Active Backlogs</p>
            </div>

            {atRiskList.length === 0 ? (
              <div className="bg-emerald-50/50 border border-emerald-200 rounded-lg p-4 text-center">
                <Icons.CheckCircle className="w-6 h-6 text-emerald-600 mx-auto mb-1" />
                <p className="text-xs font-semibold text-emerald-800">No academic at-risk students identified for current criteria!</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-border bg-slate-50/50">
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Student</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Roll / Enrollment</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Sem / Div</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Academic %</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Attendance %</th>
                      <th className="py-2.5 px-3 font-semibold text-slate-700">Risk Factors</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {atRiskList.map(st => (
                      <tr key={st.studentId} className="hover:bg-amber-50/30 transition-colors">
                        <td className="py-2.5 px-3 font-bold text-slate-900">{st.name}</td>
                        <td className="py-2.5 px-3 text-slate-700 font-mono text-[11px]">{st.enrollmentNumber}</td>
                        <td className="py-2.5 px-3 text-slate-700">Sem {st.semester} - {st.division}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {st.academicPercentage !== null ? `${st.academicPercentage}%` : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {st.attendancePercentage !== null ? `${st.attendancePercentage}%` : 'N/A'}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap gap-1">
                            {st.riskFactors.map(rf => (
                              <span
                                key={rf}
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  rf.includes('Attendance')
                                    ? 'bg-rose-100 text-rose-800'
                                    : rf.includes('Academic')
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-purple-100 text-purple-800'
                                }`}
                              >
                                {rf}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Section 6: Existing Exports */}
          <div className="bg-surface rounded-card shadow-card border border-border p-6">
            <h2 className="text-base font-bold text-slate-900 mb-1">Department Export Utilities</h2>
            <p className="text-xs text-muted mb-4">Export official department records and audit spreadsheets</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-50/70 rounded-lg border border-border p-4 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 bg-blue-50 text-blue-700 rounded-lg flex items-center justify-center mb-3">
                    <Icons.Users className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900">Department Student Roster</h3>
                  <p className="text-xs text-muted mt-1">
                    Full list of enrolled department students with enrollment numbers, current semesters, and divisions.
                  </p>
                </div>
                <button
                  onClick={() => handleDownload('students')}
                  disabled={downloading}
                  className="mt-4 btn-primary w-full py-2 rounded-btn text-xs flex items-center justify-center gap-2"
                >
                  <Icons.Download className="w-3.5 h-3.5" /> Export Students CSV
                </button>
              </div>

              <div className="bg-slate-50/70 rounded-lg border border-border p-4 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 bg-sky-50 text-sky-700 rounded-lg flex items-center justify-center mb-3">
                    <Icons.Calendar className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900">Attendance Log &amp; Eligibility</h3>
                  <p className="text-xs text-muted mt-1">
                    Official attendance percentages, defalcation warnings (&lt;75%), and session logs across all courses.
                  </p>
                </div>
                <button
                  onClick={() => handleDownload('attendance')}
                  disabled={downloading}
                  className="mt-4 btn-primary w-full py-2 rounded-btn text-xs flex items-center justify-center gap-2"
                >
                  <Icons.Download className="w-3.5 h-3.5" /> Export Attendance Audit
                </button>
              </div>

              <div className="bg-slate-50/70 rounded-lg border border-border p-4 flex flex-col justify-between">
                <div>
                  <div className="w-10 h-10 bg-purple-50 text-purple-700 rounded-lg flex items-center justify-center mb-3">
                    <Icons.BarChart className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-sm text-slate-900">Semester Marksheet Summary</h3>
                  <p className="text-xs text-muted mt-1">
                    Continuous assessment, Gradebook marks, and evaluation summary for academic grading.
                  </p>
                </div>
                <button
                  onClick={() => handleDownload('gradebook')}
                  disabled={downloading}
                  className="mt-4 btn-primary w-full py-2 rounded-btn text-xs flex items-center justify-center gap-2"
                >
                  <Icons.Download className="w-3.5 h-3.5" /> Export Marksheet
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
