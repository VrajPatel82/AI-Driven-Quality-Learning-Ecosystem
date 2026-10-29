import { useState, useEffect, useMemo } from 'react';
import { analyticsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';

export default function UniversityAcademicOverview() {
  const { user } = useAuth();
  
  // Primary state
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Filter state
  const [filters, setFilters] = useState({
    institution: '',
    department: '',
    semester: '',
    academicTerm: '',
    professor: '',
    course: '',
    division: ''
  });

  useEffect(() => {
    fetchAnalytics(filters, true);
  }, []);

  const fetchAnalytics = async (activeFilters, isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
      // Clean empty params
      const cleanParams = {};
      Object.keys(activeFilters).forEach(key => {
        if (activeFilters[key] !== '' && activeFilters[key] !== null && activeFilters[key] !== undefined) {
          cleanParams[key] = activeFilters[key];
        }
      });

      const res = await analyticsAPI.getUniversityAdminOverview(cleanParams);
      if (res.data && res.data.success !== false) {
        setData(res.data);
      } else {
        setError(res.data?.message || 'Failed to fetch university analytics.');
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Error connecting to analytics server.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleFilterChange = (key, value) => {
    const updated = { ...filters, [key]: value };
    if (key === 'institution') {
      updated.department = '';
      updated.course = '';
    }
    if (key === 'department') {
      updated.course = '';
    }
    setFilters(updated);
    fetchAnalytics(updated, false);
  };

  const handleClearFilters = () => {
    const cleared = {
      institution: '',
      department: '',
      semester: '',
      academicTerm: '',
      professor: '',
      course: '',
      division: ''
    };
    setFilters(cleared);
    fetchAnalytics(cleared, false);
  };

  const hasActiveFilters = useMemo(() => {
    return Object.values(filters).some(v => v !== '');
  }, [filters]);

  const filterOptions = data?.filterOptions || {
    institutions: [],
    departments: [],
    professors: [],
    courses: []
  };

  const availableDepartments = useMemo(() => {
    if (!filters.institution) return filterOptions.departments || [];
    return (filterOptions.departments || []).filter(
      d => d.institutionId === filters.institution || d.institution === filters.institution
    );
  }, [filterOptions.departments, filters.institution]);

  const availableCourses = useMemo(() => {
    let list = filterOptions.courses || [];
    if (filters.department) {
      list = list.filter(c => c.departmentId === filters.department || c.department === filters.department);
    }
    if (filters.semester) {
      list = list.filter(c => c.semester === parseInt(filters.semester, 10));
    }
    return list;
  }, [filterOptions.courses, filters.department, filters.semester]);

  const summary = data?.summary || {};
  const riskBreakdown = data?.studentInsights?.riskBreakdown || {};

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Academic Overview</h1>
          <p className="text-muted mt-1 text-sm">University-wide academic performance, attendance, capacity, and exceptions.</p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-border p-16 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm font-semibold text-slate-700">Loading University Academic Analytics...</p>
          <p className="text-xs text-muted mt-1">Aggregating institutional data across campuses and departments.</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Academic Overview</h1>
          <p className="text-muted mt-1 text-sm">University-wide academic performance, attendance, capacity, and exceptions.</p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-rose-200 p-8 text-center text-rose-700">
          <Icons.AlertTriangle className="w-10 h-10 mx-auto mb-3 text-rose-500" />
          <h3 className="font-bold text-lg mb-1">Failed to Load Overview</h3>
          <p className="text-sm mb-4">{error}</p>
          <button
            onClick={() => fetchAnalytics(filters, true)}
            className="px-4 py-2 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700 transition-colors"
          >
            Retry Analytics Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative">
      {/* Non-blocking filter refresh indicator */}
      {refreshing && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium shadow-sm animate-pulse">
          <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          Updating analytics...
        </div>
      )}

      {/* Header & Description */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Academic Overview</h1>
          <p className="text-muted mt-1 text-sm">
            University-wide academic performance, attendance, capacity, and exceptions.
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
            <Icons.Filter className="w-4 h-4 text-blue-600" />
            <span>Institutional Scope Filters</span>
          </div>
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 transition-colors"
            >
              <Icons.X className="w-3.5 h-3.5" /> Clear Filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3 text-xs">
          {/* Institute Filter */}
          <div>
            <label className="block text-muted font-medium mb-1">Campus / Institute</label>
            <select
              value={filters.institution}
              onChange={e => handleFilterChange('institution', e.target.value)}
              className="form-input w-full py-1.5 px-2.5 text-xs rounded-md"
            >
              <option value="">All Campuses</option>
              {filterOptions.institutions?.map(i => (
                <option key={i._id} value={i._id}>{i.name} ({i.code})</option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <label className="block text-muted font-medium mb-1">Department</label>
            <select
              value={filters.department}
              onChange={e => handleFilterChange('department', e.target.value)}
              className="form-input w-full py-1.5 px-2.5 text-xs rounded-md"
            >
              <option value="">All Departments</option>
              {availableDepartments.map(d => (
                <option key={d._id} value={d._id}>{d.name} ({d.code})</option>
              ))}
            </select>
          </div>

          {/* Semester Filter */}
          <div>
            <label className="block text-muted font-medium mb-1">Semester</label>
            <select
              value={filters.semester}
              onChange={e => handleFilterChange('semester', e.target.value)}
              className="form-input w-full py-1.5 px-2.5 text-xs rounded-md"
            >
              <option value="">All Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <option key={s} value={s}>Semester {s}</option>
              ))}
            </select>
          </div>

          {/* Academic Term Filter */}
          <div>
            <label className="block text-muted font-medium mb-1">Academic Term</label>
            <select
              value={filters.academicTerm}
              onChange={e => handleFilterChange('academicTerm', e.target.value)}
              className="form-input w-full py-1.5 px-2.5 text-xs rounded-md"
            >
              <option value="">All Terms</option>
              <option value="CURRENT">CURRENT</option>
            </select>
          </div>

          {/* Professor Filter */}
          <div>
            <label className="block text-muted font-medium mb-1">Faculty Member</label>
            <select
              value={filters.professor}
              onChange={e => handleFilterChange('professor', e.target.value)}
              className="form-input w-full py-1.5 px-2.5 text-xs rounded-md"
            >
              <option value="">All Faculty</option>
              {filterOptions.professors?.map(p => (
                <option key={p._id} value={p._id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Course Filter */}
          <div>
            <label className="block text-muted font-medium mb-1">Course</label>
            <select
              value={filters.course}
              onChange={e => handleFilterChange('course', e.target.value)}
              className="form-input w-full py-1.5 px-2.5 text-xs rounded-md"
            >
              <option value="">All Courses</option>
              {availableCourses.map(c => (
                <option key={c._id} value={c._id}>{c.code} - {c.name}</option>
              ))}
            </select>
          </div>

          {/* Division Filter */}
          <div>
            <label className="block text-muted font-medium mb-1">Division</label>
            <select
              value={filters.division}
              onChange={e => handleFilterChange('division', e.target.value)}
              className="form-input w-full py-1.5 px-2.5 text-xs rounded-md"
            >
              <option value="">All Divisions</option>
              <option value="A">Division A</option>
              <option value="B">Division B</option>
              <option value="C">Division C</option>
              <option value="D">Division D</option>
            </select>
          </div>
        </div>
      </div>

      {/* SECTION 1: UNIVERSITY SUMMARY (8-CARD KPI GRID) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Students */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-semibold uppercase tracking-wider">Total Students</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Icons.Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{summary.totalStudents ?? 0}</p>
          <span className="text-xs text-muted font-medium mt-1 inline-block">
            {summary.activeStudents ?? 0} active students
          </span>
        </div>

        {/* Total Faculty */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-semibold uppercase tracking-wider">Total Faculty</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <Icons.Users className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{summary.totalFaculty ?? 0}</p>
          <span className="text-xs text-muted font-medium mt-1 inline-block">
            {summary.activeFaculty ?? 0} active faculty members
          </span>
        </div>

        {/* Active Courses */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-semibold uppercase tracking-wider">Active Courses</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Icons.Book className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{summary.totalCourses ?? 0}</p>
          <span className="text-xs text-purple-600 font-semibold mt-1 inline-block">
            {summary.assignedCourses ?? 0} assigned, {summary.unassignedCourses ?? 0} unassigned
          </span>
        </div>

        {/* Departments */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-semibold uppercase tracking-wider">Departments</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Icons.Building className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{summary.totalDepartments ?? 0}</p>
          <span className="text-xs text-emerald-600 font-semibold mt-1 inline-block">
            Across {summary.totalInstitutions ?? 0} campus institution{summary.totalInstitutions !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Average Performance */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-semibold uppercase tracking-wider">Average Performance</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Icons.Activity className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{summary.averagePerformance ?? 0}%</p>
          <span className="text-xs text-blue-600 font-semibold mt-1 inline-block">Gradebook weighted avg</span>
        </div>

        {/* Average Attendance */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-semibold uppercase tracking-wider">Average Attendance</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center">
              <Icons.Check className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{summary.averageAttendance ?? 0}%</p>
          <span className="text-xs text-teal-600 font-semibold mt-1 inline-block">Conducted lectures</span>
        </div>

        {/* Pass Rate */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-semibold uppercase tracking-wider">Pass Rate</span>
            <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
              <Icons.Check className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold text-slate-800 mt-2">{summary.passRate ?? 0}%</p>
          <span className="text-xs text-green-600 font-semibold mt-1 inline-block">Threshold: &ge;50% grade</span>
        </div>

        {/* At-Risk Students */}
        <div className={`bg-surface rounded-card shadow-card border p-4 ${summary.atRiskStudents > 0 ? 'border-amber-300 bg-amber-50/20' : 'border-border'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted font-semibold uppercase tracking-wider">At-Risk Students</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${summary.atRiskStudents > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
              <Icons.AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className={`text-2xl font-bold mt-2 ${summary.atRiskStudents > 0 ? 'text-amber-800' : 'text-slate-800'}`}>{summary.atRiskStudents ?? 0}</p>
          <span className={`text-xs font-semibold mt-1 inline-block ${summary.atRiskStudents > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
            {summary.atRiskStudents > 0 ? 'Requires attention' : 'No risk flags detected'}
          </span>
        </div>
      </div>

      {/* SECTION 2: ATTENTION REQUIRED (INSTITUTIONAL EXCEPTIONS) */}
      <div className="bg-surface rounded-card shadow-card border border-border p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
            <Icons.AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800">Attention Required & Exceptions</h2>
            <p className="text-xs text-muted">Key risk indicators requiring institutional oversight.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: At-Risk Students */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-700 uppercase">At-Risk Students</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${summary.atRiskStudents > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
                {summary.atRiskStudents ?? 0}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Students flagged for low academic marks (&lt;50%), low attendance (&lt;75%), or backlogs.
            </p>
            {summary.atRiskStudents > 0 && (
              <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-slate-600 space-y-0.5 font-medium">
                <div>• Low Marks (&lt;50%): <strong className="text-slate-800">{riskBreakdown.lowAcademicPerformance ?? 0}</strong></div>
                <div>• Low Attendance (&lt;75%): <strong className="text-slate-800">{riskBreakdown.lowAttendance ?? 0}</strong></div>
                <div>• Multiple Risk Factors: <strong className="text-amber-800">{riskBreakdown.multipleRiskFactors ?? 0}</strong></div>
              </div>
            )}
          </div>

          {/* Card 2: Active Backlogs */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-700 uppercase">Active Backlogs</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${summary.activeBacklogs > 0 ? 'bg-rose-100 text-rose-800' : 'bg-slate-200 text-slate-700'}`}>
                {summary.activeBacklogs ?? 0}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Total active backlog course enrollments across university departments.
            </p>
            <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-slate-600">
              Backlog students: <strong className="text-slate-800">{riskBreakdown.activeBacklog ?? summary.activeBacklogs ?? 0}</strong>
            </div>
          </div>

          {/* Card 3: Unassigned Courses */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-700 uppercase">Unassigned Courses</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${summary.unassignedCourses > 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
                {summary.unassignedCourses ?? 0}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Active curriculum courses with no designated faculty member.
            </p>
            <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-slate-600">
              Assigned coverage: <strong className="text-slate-800">{summary.assignedCourses ?? 0} / {summary.totalCourses ?? 0} courses</strong>
            </div>
          </div>

          {/* Card 4: Faculty Without Courses */}
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
            <div className="flex justify-between items-start">
              <span className="text-xs font-bold text-slate-700 uppercase">Faculty Unassigned</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${(data?.facultyInsights?.facultyWithoutCourses?.length || 0) > 0 ? 'bg-indigo-100 text-indigo-800' : 'bg-green-100 text-green-700'}`}>
                {data?.facultyInsights?.facultyWithoutCourses?.length ?? 0}
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-2">
              Active professors currently without assigned course workloads.
            </p>
            <div className="mt-3 pt-2 border-t border-slate-200 text-[11px] text-slate-600">
              Active faculty pool: <strong className="text-slate-800">{summary.totalFaculty ?? 0} members</strong>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 3: INSTITUTE PERFORMANCE TABLE */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">Institute / Campus Comparison</h2>
            <p className="text-xs text-muted">Aggregated performance and compliance metrics compared across university campuses.</p>
          </div>
          <span className="text-xs text-muted font-medium">
            {data?.institutionPerformance?.length || 0} campus institution{(data?.institutionPerformance?.length || 0) !== 1 ? 's' : ''}
          </span>
        </div>

        {(!data?.institutionPerformance || data.institutionPerformance.length === 0) ? (
          <div className="p-8 text-center text-muted text-sm">
            No institution performance data matches the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Campus / Institute</th>
                  <th className="py-3 px-4 text-center">Students</th>
                  <th className="py-3 px-4 text-center">Faculty</th>
                  <th className="py-3 px-4 text-center">Courses</th>
                  <th className="py-3 px-4 text-center">Avg Performance</th>
                  <th className="py-3 px-4 text-center">Attendance</th>
                  <th className="py-3 px-4 text-center">Pass Rate</th>
                  <th className="py-3 px-4 text-center">At-Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.institutionPerformance.map(inst => (
                  <tr key={inst.institutionId} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{inst.institutionName}</div>
                      <div className="text-xs text-muted font-mono">{inst.code}</div>
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">{inst.studentCount}</td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">{inst.facultyCount}</td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">{inst.courseCount}</td>
                    <td className="py-3 px-4 text-center font-bold text-blue-700">{inst.averagePerformance}%</td>
                    <td className="py-3 px-4 text-center font-bold text-teal-700">{inst.averageAttendance}%</td>
                    <td className="py-3 px-4 text-center font-bold text-green-700">{inst.passRate}%</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${inst.atRiskStudents > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                        {inst.atRiskStudents}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 4: DEPARTMENT PERFORMANCE TABLE */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">Department Performance & Coverage</h2>
            <p className="text-xs text-muted">Departmental breakdown of academic results, attendance, and faculty allocation.</p>
          </div>
          <span className="text-xs text-muted font-medium">
            {data?.departmentPerformance?.length || 0} department{(data?.departmentPerformance?.length || 0) !== 1 ? 's' : ''}
          </span>
        </div>

        {(!data?.departmentPerformance || data.departmentPerformance.length === 0) ? (
          <div className="p-8 text-center text-muted text-sm">
            No department performance data matches the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Campus</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4 text-center">Students</th>
                  <th className="py-3 px-4 text-center">Faculty</th>
                  <th className="py-3 px-4 text-center">Courses</th>
                  <th className="py-3 px-4 text-center">Avg Performance</th>
                  <th className="py-3 px-4 text-center">Attendance</th>
                  <th className="py-3 px-4 text-center">Pass Rate</th>
                  <th className="py-3 px-4 text-center">At-Risk</th>
                  <th className="py-3 px-4 text-center">Faculty Coverage</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.departmentPerformance.map(dept => (
                  <tr key={dept.departmentId} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 text-xs font-medium text-slate-600">{dept.institutionName}</td>
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-800">{dept.departmentName}</div>
                      <div className="text-xs text-muted font-mono">{dept.code}</div>
                    </td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">{dept.studentCount}</td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">{dept.facultyCount}</td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">{dept.courseCount}</td>
                    <td className="py-3 px-4 text-center font-bold text-blue-700">{dept.averagePerformance}%</td>
                    <td className="py-3 px-4 text-center font-bold text-teal-700">{dept.averageAttendance}%</td>
                    <td className="py-3 px-4 text-center font-bold text-green-700">{dept.passRate}%</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${dept.atRiskStudents > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                        {dept.atRiskStudents}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${dept.facultyCoverage >= 100 ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'}`}>
                        {dept.facultyCoverage}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 5: SEMESTER PERFORMANCE TABLE */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">Academic Performance by Semester</h2>
            <p className="text-xs text-muted">Academic metrics and attendance compliance tracked across semesters 1 through 8.</p>
          </div>
        </div>

        {(!data?.semesterPerformance || data.semesterPerformance.length === 0) ? (
          <div className="p-8 text-center text-muted text-sm">
            No semester data matches the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Semester</th>
                  <th className="py-3 px-4 text-center">Students</th>
                  <th className="py-3 px-4 text-center">Courses</th>
                  <th className="py-3 px-4 text-center">Avg Performance</th>
                  <th className="py-3 px-4 text-center">Attendance</th>
                  <th className="py-3 px-4 text-center">Pass Rate</th>
                  <th className="py-3 px-4 text-center">At-Risk Students</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.semesterPerformance.map(sem => (
                  <tr key={sem.semester} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-bold text-slate-800">Semester {sem.semester}</td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">{sem.studentCount}</td>
                    <td className="py-3 px-4 text-center font-semibold text-slate-700">{sem.courseCount}</td>
                    <td className="py-3 px-4 text-center font-bold text-blue-700">{sem.averagePerformance}%</td>
                    <td className="py-3 px-4 text-center font-bold text-teal-700">{sem.averageAttendance}%</td>
                    <td className="py-3 px-4 text-center font-bold text-green-700">{sem.passRate}%</td>
                    <td className="py-3 px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${sem.atRiskStudents > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>
                        {sem.atRiskStudents}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* SECTION 6: COURSE PERFORMANCE DETAIL CATALOG */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">Course-Level Performance Catalog</h2>
            <p className="text-xs text-muted">Detailed course metrics including enrollment, weighted averages, pass rates, and pass/fail counts.</p>
          </div>
          <span className="text-xs text-muted font-medium">
            Showing {data?.coursePerformance?.length || 0} course offering{(data?.coursePerformance?.length || 0) !== 1 ? 's' : ''}
          </span>
        </div>

        {(!data?.coursePerformance || data.coursePerformance.length === 0) ? (
          <div className="p-8 text-center text-muted text-sm">
            No course offerings match the selected filters.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4 bg-slate-50">Course Code</th>
                  <th className="py-3 px-4 bg-slate-50">Course Name</th>
                  <th className="py-3 px-4 bg-slate-50">Department</th>
                  <th className="py-3 px-4 text-center bg-slate-50">Sem</th>
                  <th className="py-3 px-4 bg-slate-50">Assigned Professor</th>
                  <th className="py-3 px-4 text-center bg-slate-50">Enrolled</th>
                  <th className="py-3 px-4 text-center bg-slate-50">Avg %</th>
                  <th className="py-3 px-4 text-center bg-slate-50">Pass %</th>
                  <th className="py-3 px-4 text-center bg-slate-50">Pass / Fail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.coursePerformance.map(c => (
                  <tr key={c.courseId} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-mono text-xs font-bold text-blue-700">{c.courseCode}</td>
                    <td className="py-3 px-4 font-semibold text-slate-800">{c.courseName}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{c.departmentName}</td>
                    <td className="py-3 px-4 text-center text-xs font-bold text-slate-700">Sem {c.semester}</td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-700">{c.professor || 'Unassigned'}</td>
                    <td className="py-3 px-4 text-center text-xs font-bold text-slate-700">{c.enrolledCount}</td>
                    <td className="py-3 px-4 text-center text-xs font-bold text-blue-700">{c.averagePercentage}%</td>
                    <td className="py-3 px-4 text-center text-xs font-bold text-green-700">{c.passPercentage}%</td>
                    <td className="py-3 px-4 text-center text-xs font-medium">
                      <span className="text-green-700 font-bold">{c.passCount}</span>
                      <span className="text-muted mx-1">/</span>
                      <span className="text-rose-600 font-bold">{c.failCount}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
