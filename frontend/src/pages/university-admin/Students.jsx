import { useState, useEffect, useMemo } from 'react';
import { analyticsAPI, usersAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';

export default function UniversityStudents() {
  const { user } = useAuth();

  // Aggregate analytics state
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Global filters
  const [filters, setFilters] = useState({
    institution: '',
    department: '',
    semester: '',
    division: ''
  });

  // Find a Student state (On-Demand Search)
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchHasExecuted, setSearchHasExecuted] = useState(false);
  const [searchPagination, setSearchPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    pages: 1
  });

  // Student Detail Drawer state
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentAnalytics, setStudentAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState(null);

  useEffect(() => {
    fetchAnalytics(filters, true);
  }, []);

  // Fetch overview analytics with active filters
  const fetchAnalytics = async (activeFilters, isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    setError(null);

    try {
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
        setError(res.data?.message || 'Failed to fetch university student analytics.');
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
    }
    setFilters(updated);
    fetchAnalytics(updated, false);
  };

  const handleClearFilters = () => {
    const cleared = {
      institution: '',
      department: '',
      semester: '',
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

  // Execute server-side student search
  const executeStudentSearch = async (queryText, targetPage = 1) => {
    if (!queryText.trim()) return;

    setSearching(true);
    setSearchError(null);
    setSearchHasExecuted(true);
    setSubmittedQuery(queryText.trim());

    try {
      const params = {
        role: 'student',
        search: queryText.trim(),
        page: targetPage,
        limit: 10
      };

      if (filters.institution) params.institution = filters.institution;
      if (filters.department) params.department = filters.department;

      const res = await usersAPI.getAll(params);
      const resData = res.data;

      if (resData) {
        const rawList = resData.data || resData.users || (Array.isArray(resData) ? resData : []);
        setSearchResults(Array.isArray(rawList) ? rawList : []);

        if (resData.pagination) {
          setSearchPagination(resData.pagination);
        } else {
          setSearchPagination({
            page: targetPage,
            limit: 10,
            total: rawList.length,
            pages: Math.ceil(rawList.length / 10) || 1
          });
        }
      }
    } catch (err) {
      setSearchError(err.response?.data?.message || err.message || 'Failed to search student records.');
    } finally {
      setSearching(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    executeStudentSearch(searchQuery, 1);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= searchPagination.pages) {
      executeStudentSearch(submittedQuery, newPage);
    }
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setSubmittedQuery('');
    setSearchResults([]);
    setSearchHasExecuted(false);
    setSearchError(null);
    setSearchPagination({ page: 1, limit: 10, total: 0, pages: 1 });
  };

  // Open Student Details Drawer
  const handleOpenStudentDetail = async (student) => {
    setSelectedStudent(student);
    setStudentAnalytics(null);
    setAnalyticsLoading(true);
    setAnalyticsError(null);

    try {
      const res = await analyticsAPI.getStudent(student._id);
      if (res.data) {
        setStudentAnalytics(res.data);
      } else {
        setAnalyticsError('No analytics data available for this student.');
      }
    } catch (err) {
      setAnalyticsError(err.response?.data?.message || 'Failed to load detailed student analytics.');
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleCloseStudentDetail = () => {
    setSelectedStudent(null);
    setStudentAnalytics(null);
    setAnalyticsError(null);
  };

  // Distribution calculations
  const summary = data?.summary || {};
  const studentInsights = data?.studentInsights || {};
  const riskBreakdown = studentInsights.riskBreakdown || {};

  const byInstitutionList = studentInsights.byInstitution || [];
  const maxInstCount = useMemo(() => Math.max(...byInstitutionList.map(i => i.count || 0), 1), [byInstitutionList]);

  const byDeptList = studentInsights.byDepartment || [];
  const maxDeptCount = useMemo(() => Math.max(...byDeptList.map(d => d.count || 0), 1), [byDeptList]);

  const sortedSemesterList = useMemo(() => {
    const list = [...(studentInsights.bySemester || [])];
    return list.sort((a, b) => (a.semester || 0) - (b.semester || 0));
  }, [studentInsights.bySemester]);
  const maxSemCount = useMemo(() => Math.max(...sortedSemesterList.map(s => s.count || 0), 1), [sortedSemesterList]);

  const byDivisionList = studentInsights.byDivision || [];
  const maxDivCount = useMemo(() => Math.max(...byDivisionList.map(d => d.count || 0), 1), [byDivisionList]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Student Insights</h1>
          <p className="text-muted mt-1 text-sm">
            University-wide student population, academic risk, attendance, and progression insights.
          </p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-border p-16 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm font-semibold text-slate-700">Loading Student Analytics...</p>
          <p className="text-xs text-muted mt-1">Aggregating student data across all campuses and departments.</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Student Insights</h1>
          <p className="text-muted mt-1 text-sm">
            University-wide student population, academic risk, attendance, and progression insights.
          </p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-rose-200 p-8 text-center text-rose-700">
          <Icons.AlertTriangle className="w-10 h-10 mx-auto mb-3 text-rose-500" />
          <h3 className="font-bold text-lg mb-1">Failed to Load Student Insights</h3>
          <p className="text-sm mb-4">{error}</p>
          <button
            onClick={() => fetchAnalytics(filters, true)}
            className="px-4 py-2 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700 transition-colors"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Student Insights</h1>
          <p className="text-muted mt-1 text-sm">
            University-wide student population, academic risk, attendance, and progression insights.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {refreshing && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
              <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></span>
              Updating insights...
            </span>
          )}
          <span className="text-xs text-muted font-medium bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            Institutional Scope
          </span>
        </div>
      </div>

      {/* 2. Global Filters */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full lg:w-auto flex-1">
            {/* Institution Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Campus / Institution</label>
              <select
                value={filters.institution}
                onChange={e => handleFilterChange('institution', e.target.value)}
                className="form-input w-full text-xs"
              >
                <option value="">All Campuses</option>
                {(filterOptions.institutions || []).map(inst => (
                  <option key={inst._id} value={inst._id}>
                    {inst.name} ({inst.code || 'INST'})
                  </option>
                ))}
              </select>
            </div>

            {/* Department Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Department</label>
              <select
                value={filters.department}
                onChange={e => handleFilterChange('department', e.target.value)}
                className="form-input w-full text-xs"
              >
                <option value="">All Departments</option>
                {availableDepartments.map(dept => (
                  <option key={dept._id} value={dept._id}>
                    {dept.name} ({dept.code || 'DEPT'})
                  </option>
                ))}
              </select>
            </div>

            {/* Semester Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Semester</label>
              <select
                value={filters.semester}
                onChange={e => handleFilterChange('semester', e.target.value)}
                className="form-input w-full text-xs"
              >
                <option value="">All Semesters</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </select>
            </div>

            {/* Division Filter */}
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Division</label>
              <select
                value={filters.division}
                onChange={e => handleFilterChange('division', e.target.value)}
                className="form-input w-full text-xs"
              >
                <option value="">All Divisions</option>
                {['A', 'B', 'C', 'D'].map(d => (
                  <option key={d} value={d}>Division {d}</option>
                ))}
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="pt-2 lg:pt-5">
              <button
                onClick={handleClearFilters}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <Icons.X className="w-3.5 h-3.5" />
                Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 3. Student Summary (4 KPI Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Students */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wider">Total Students</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {(summary.totalStudents || 0).toLocaleString()}
              </h3>
              <p className="text-xs text-muted mt-1">Enrolled across all campuses</p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Icons.GraduationCap className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Active Students */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wider">Active Students</p>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1">
                {(summary.activeStudents || 0).toLocaleString()}
              </h3>
              <p className="text-xs text-emerald-600 mt-1 font-medium">In good academic standing</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <Icons.UserCheck className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* At-Risk Students */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wider">At-Risk Students</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">
                {(summary.atRiskStudents || 0).toLocaleString()}
              </h3>
              <p className="text-xs text-amber-600 mt-1 font-medium">Low grades or low attendance</p>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
              <Icons.AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Active Backlogs */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wider">Active Backlogs</p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1">
                {(summary.activeBacklogs || 0).toLocaleString()}
              </h3>
              <p className="text-xs text-rose-600 mt-1 font-medium">Outstanding course backlogs</p>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
              <Icons.AlertCircle className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Student Distribution (2x2 Grid) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* A. Students by Institute */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icons.Building className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-800 text-base">Students by Institute</h3>
            </div>
            <span className="text-xs text-muted font-medium">{byInstitutionList.length} Campuses</span>
          </div>

          {byInstitutionList.length === 0 ? (
            <p className="text-xs text-muted py-6 text-center">No campus distribution data available.</p>
          ) : (
            <div className="space-y-3">
              {byInstitutionList.map((inst, idx) => {
                const pct = Math.round(((inst.count || 0) / maxInstCount) * 100);
                return (
                  <div key={inst._id || idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">{inst.name || 'Campus'}</span>
                      <span className="font-mono font-bold text-slate-900">{inst.count} students</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* B. Students by Department */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icons.Layers className="w-5 h-5 text-purple-600" />
              <h3 className="font-bold text-slate-800 text-base">Students by Department</h3>
            </div>
            <span className="text-xs text-muted font-medium">{byDeptList.length} Departments</span>
          </div>

          {byDeptList.length === 0 ? (
            <p className="text-xs text-muted py-6 text-center">No department distribution data available.</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {byDeptList.map((dept, idx) => {
                const pct = Math.round(((dept.count || 0) / maxDeptCount) * 100);
                return (
                  <div key={dept._id || idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">{dept.name || 'Department'}</span>
                      <span className="font-mono font-bold text-slate-900">{dept.count} students</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* C. Students by Semester */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icons.BookOpen className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-slate-800 text-base">Students by Semester</h3>
            </div>
            <span className="text-xs text-muted font-medium">Numerical progression</span>
          </div>

          {sortedSemesterList.length === 0 ? (
            <p className="text-xs text-muted py-6 text-center">No semester breakdown data available.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {sortedSemesterList.map(sem => {
                const pct = Math.round(((sem.count || 0) / maxSemCount) * 100);
                return (
                  <div key={sem.semester} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <span className="text-xs font-bold text-slate-500 uppercase block">Sem {sem.semester}</span>
                    <span className="text-xl font-bold text-slate-900 block mt-1">{sem.count}</span>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                      <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${pct}%` }}></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* D. Students by Division */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icons.Grid className="w-5 h-5 text-teal-600" />
              <h3 className="font-bold text-slate-800 text-base">Students by Division</h3>
            </div>
            <span className="text-xs text-muted font-medium">Section allocation</span>
          </div>

          {byDivisionList.length === 0 ? (
            <p className="text-xs text-muted py-6 text-center">No division breakdown data available.</p>
          ) : (
            <div className="space-y-3">
              {byDivisionList.map((div, idx) => {
                const pct = Math.round(((div.count || 0) / maxDivCount) * 100);
                return (
                  <div key={div.division || idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">Division {div.division || 'Unassigned'}</span>
                      <span className="font-mono font-bold text-slate-900">{div.count} students</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-teal-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${pct}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 5. Risk Breakdown & 6. Attention / Exception Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Risk Breakdown (2 Cols) */}
        <div className="lg:col-span-2 bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Icons.AlertTriangle className="w-5 h-5 text-amber-600" />
            <div>
              <h3 className="font-bold text-slate-800 text-base">Student Risk Breakdown</h3>
              <p className="text-xs text-muted">Categorized academic and attendance vulnerability indicators.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Low Academic Performance */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-slate-600">Low Academic Performance</span>
                  <p className="text-2xl font-bold text-amber-700 mt-1">
                    {riskBreakdown.lowAcademicPerformance || 0}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">
                  Gradebook
                </span>
              </div>
              <p className="text-xs text-muted mt-2">Students scoring below target course percentage.</p>
            </div>

            {/* Low Attendance */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-slate-600">Low Attendance</span>
                  <p className="text-2xl font-bold text-rose-700 mt-1">
                    {riskBreakdown.lowAttendance || 0}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800">
                  &lt; 75%
                </span>
              </div>
              <p className="text-xs text-muted mt-2">Attendance strictly below institutional threshold.</p>
            </div>

            {/* Active Backlog */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-slate-600">Active Backlog</span>
                  <p className="text-2xl font-bold text-purple-700 mt-1">
                    {riskBreakdown.activeBacklog || 0}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 text-purple-800">
                  Backlogs
                </span>
              </div>
              <p className="text-xs text-muted mt-2">Students carrying 1 or more unresolved course backlogs.</p>
            </div>

            {/* Multiple Risk Factors */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-semibold text-slate-600">Multiple Risk Factors</span>
                  <p className="text-2xl font-bold text-red-700 mt-1">
                    {riskBreakdown.multipleRiskFactors || 0}
                  </p>
                </div>
                <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">
                  High Risk
                </span>
              </div>
              <p className="text-xs text-muted mt-2">Intersecting low performance and low attendance records.</p>
            </div>
          </div>
        </div>

        {/* Institutional Attention Summary (1 Col) */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Icons.ShieldCheck className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-800 text-base">Institutional Exception Status</h3>
            </div>

            <p className="text-xs text-muted mb-4">
              High-priority exceptions needing institutional monitoring or academic support intervention.
            </p>

            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-amber-50/60 border border-amber-200/80 rounded-xl">
                <span className="text-xs font-semibold text-amber-900">Total Vulnerable Population</span>
                <span className="font-mono font-bold text-sm text-amber-700">
                  {summary.atRiskStudents || 0}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 bg-rose-50/60 border border-rose-200/80 rounded-xl">
                <span className="text-xs font-semibold text-rose-900">Active Course Backlogs</span>
                <span className="font-mono font-bold text-sm text-rose-700">
                  {summary.activeBacklogs || 0}
                </span>
              </div>

              <div className="flex justify-between items-center p-3 bg-red-50/60 border border-red-200/80 rounded-xl">
                <span className="text-xs font-semibold text-red-900">Critical Multiple Risk Cases</span>
                <span className="font-mono font-bold text-sm text-red-700">
                  {riskBreakdown.multipleRiskFactors || 0}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              Use <span className="font-semibold text-slate-800">Find a Student</span> below to locate specific student records and inspect detailed academic risk profiles.
            </p>
          </div>
        </div>
      </div>

      {/* 7. Find a Student (On-Demand Lookup) */}
      <div className="bg-surface rounded-card shadow-card border border-border p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <Icons.Search className="w-5 h-5 text-blue-600" />
              Find a Student
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Search individual student profiles by name, enrollment number, or roll number on-demand.
            </p>
          </div>
          {searchHasExecuted && (
            <span className="text-xs text-muted font-medium">
              Page {searchPagination.page} of {searchPagination.pages} ({searchPagination.total} total)
            </span>
          )}
        </div>

        {/* Search Input Toolbar */}
        <form onSubmit={handleSearchSubmit} className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Enter student name, enrollment no, roll no..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="form-input w-full text-sm pl-9"
            />
            <Icons.Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          </div>
          <button
            type="submit"
            disabled={searching || !searchQuery.trim()}
            className="px-5 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {searching ? (
              <>
                <span className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></span>
                Searching...
              </>
            ) : (
              <>
                <Icons.Search className="w-3.5 h-3.5" />
                Search Student
              </>
            )}
          </button>
          {searchHasExecuted && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="px-4 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition-colors"
            >
              Reset Search
            </button>
          )}
        </form>

        {/* Search Results / Placeholder Container */}
        <div>
          {!searchHasExecuted ? (
            <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-8 text-center">
              <Icons.Search className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-700">On-Demand Individual Student Lookup</p>
              <p className="text-xs text-muted mt-1 max-w-md mx-auto">
                Enter a student name, enrollment number, or roll number above to search and inspect individual academic insights.
              </p>
            </div>
          ) : searching ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-xs text-slate-600 font-medium">Searching student records...</p>
            </div>
          ) : searchError ? (
            <div className="p-6 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-center">
              <Icons.AlertTriangle className="w-6 h-6 mx-auto mb-2 text-rose-500" />
              <p className="text-sm font-bold">{searchError}</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-sm font-semibold text-slate-700">No matching student records found.</p>
              <p className="text-xs text-muted mt-1">
                Try searching with a different name or enrollment number.
              </p>
            </div>
          ) : (
            <div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 border-b border-slate-200 text-xs text-slate-600 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Enrollment / ID</th>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Campus</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4 text-center">Semester</th>
                      <th className="py-3 px-4 text-center">Division</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {searchResults.map(st => (
                      <tr key={st._id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-blue-700">
                          {st.enrollmentNumber || st.studentId || ('21CE' + String(st._id).slice(-3))}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">{st.name}</div>
                          <div className="text-xs text-muted">{st.email}</div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-700">
                          {st.institution?.name || st.institutionName || 'Main Campus'}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {st.department?.name || st.departmentName || 'Department'}
                        </td>
                        <td className="py-3 px-4 text-center text-xs font-bold text-slate-800">
                          Sem {st.currentSemester || 1}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="font-bold text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                            {st.division || 'A'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            Active
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleOpenStudentDetail(st)}
                            className="px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5"
                          >
                            <Icons.Eye className="w-3.5 h-3.5" />
                            View Insights
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Server-Side Pagination Footer */}
              {searchPagination.pages > 1 && (
                <div className="flex justify-between items-center mt-4 text-xs text-slate-600 px-1">
                  <span>
                    Showing Page <strong className="text-slate-800">{searchPagination.page}</strong> of{' '}
                    <strong className="text-slate-800">{searchPagination.pages}</strong>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePageChange(searchPagination.page - 1)}
                      disabled={searchPagination.page <= 1 || searching}
                      className="px-3 py-1.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 disabled:opacity-40 transition-colors inline-flex items-center gap-1"
                    >
                      <Icons.ChevronLeft className="w-3.5 h-3.5" />
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(searchPagination.page + 1)}
                      disabled={searchPagination.page >= searchPagination.pages || searching}
                      className="px-3 py-1.5 bg-slate-100 text-slate-700 font-semibold rounded-lg hover:bg-slate-200 disabled:opacity-40 transition-colors inline-flex items-center gap-1"
                    >
                      Next
                      <Icons.ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 8. Student Detail / Insights Drawer Modal */}
      {selectedStudent && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex justify-end transition-opacity">
          <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col overflow-hidden border-l border-slate-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
                  <Icons.GraduationCap className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{selectedStudent.name}</h3>
                  <p className="text-xs text-slate-500 font-mono">
                    {selectedStudent.enrollmentNumber || selectedStudent.studentId || selectedStudent.email}
                  </p>
                </div>
              </div>
              <button
                onClick={handleCloseStudentDetail}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Profile Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-slate-500 block font-medium">Campus</span>
                  <span className="font-semibold text-slate-800 block mt-0.5">
                    {selectedStudent.institution?.name || selectedStudent.institutionName || 'Main Campus'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Department</span>
                  <span className="font-semibold text-slate-800 block mt-0.5">
                    {selectedStudent.department?.name || selectedStudent.departmentName || 'Department'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Semester</span>
                  <span className="font-semibold text-slate-800 block mt-0.5">
                    Semester {selectedStudent.currentSemester || 1}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block font-medium">Division</span>
                  <span className="font-semibold text-slate-800 block mt-0.5">
                    Division {selectedStudent.division || 'A'}
                  </span>
                </div>
              </div>

              {/* Analytics Loading / Error / Data */}
              {analyticsLoading ? (
                <div className="p-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-xs text-slate-600 font-medium">Loading student performance profile...</p>
                </div>
              ) : analyticsError ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                  <p className="font-bold mb-1">Analytics Notice</p>
                  <p>{analyticsError}</p>
                </div>
              ) : studentAnalytics ? (
                <div className="space-y-6">
                  {/* KPI Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-blue-50/60 border border-blue-100 rounded-xl p-3 text-center">
                      <span className="text-xs text-blue-700 font-semibold block uppercase tracking-wider">Avg Quiz Score</span>
                      <span className="text-xl font-bold text-blue-900 block mt-1">
                        {studentAnalytics.avgScore !== null && studentAnalytics.avgScore !== undefined
                          ? `${studentAnalytics.avgScore}%`
                          : 'N/A'}
                      </span>
                    </div>

                    <div className="bg-emerald-50/60 border border-emerald-100 rounded-xl p-3 text-center">
                      <span className="text-xs text-emerald-700 font-semibold block uppercase tracking-wider">Attendance</span>
                      <span className="text-xl font-bold text-emerald-900 block mt-1">
                        {studentAnalytics.attendancePercentage !== null && studentAnalytics.attendancePercentage !== undefined
                          ? `${studentAnalytics.attendancePercentage}%`
                          : 'N/A'}
                      </span>
                    </div>

                    <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-3 text-center">
                      <span className="text-xs text-purple-700 font-semibold block uppercase tracking-wider">Class Rank</span>
                      <span className="text-xl font-bold text-purple-900 block mt-1">
                        {studentAnalytics.rank ? `#${studentAnalytics.rank}` : 'N/A'}
                      </span>
                    </div>

                    <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 text-center">
                      <span className="text-xs text-slate-700 font-semibold block uppercase tracking-wider">Assignments</span>
                      <span className="text-xl font-bold text-slate-900 block mt-1">
                        {studentAnalytics.assignments?.totalSubmitted || 0}
                      </span>
                    </div>
                  </div>

                  {/* Attendance Detail */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider mb-2">Attendance Summary</h4>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-600">Total Classes Conducted:</span>
                      <span className="font-bold text-slate-900">{studentAnalytics.totalClasses || 0}</span>
                    </div>
                  </div>

                  {/* Quiz Performance History */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-3 bg-slate-50 border-b border-slate-200">
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                        Quiz Submissions ({studentAnalytics.quizResults?.length || 0})
                      </h4>
                    </div>

                    {(!studentAnalytics.quizResults || studentAnalytics.quizResults.length === 0) ? (
                      <p className="text-xs text-slate-500 p-4 text-center">No quiz submissions recorded.</p>
                    ) : (
                      <div className="max-h-56 overflow-y-auto divide-y divide-slate-100">
                        {studentAnalytics.quizResults.map((qr, idx) => (
                          <div key={qr._id || idx} className="p-3 text-xs flex justify-between items-center">
                            <div>
                              <p className="font-semibold text-slate-800">{qr.quiz?.title || 'Quiz'}</p>
                              <p className="text-slate-400 text-[10px]">
                                {qr.submittedAt ? new Date(qr.submittedAt).toLocaleDateString() : 'N/A'}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="font-mono font-bold text-slate-900">{qr.score} / {qr.totalMarks}</span>
                              <span className="block text-[11px] font-semibold text-blue-600">{qr.percentage}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 text-right">
              <button
                onClick={handleCloseStudentDetail}
                className="px-4 py-2 bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-300 transition-colors"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

