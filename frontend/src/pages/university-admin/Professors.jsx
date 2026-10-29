import { useState, useEffect, useMemo } from 'react';
import { analyticsAPI, usersAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';

export default function UniversityProfessors() {
  const { user } = useAuth();

  // Aggregate analytics state
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Global filters
  const [filters, setFilters] = useState({
    institution: '',
    department: ''
  });

  // Find a Faculty Member state (On-Demand Search)
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

  // Faculty Detail Drawer state
  const [selectedFaculty, setSelectedFaculty] = useState(null);
  const [facultyDetail, setFacultyDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);

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
        setError(res.data?.message || 'Failed to fetch university faculty analytics.');
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
      department: ''
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

  // Execute server-side faculty search
  const executeFacultySearch = async (queryText, targetPage = 1) => {
    if (!queryText.trim()) return;

    setSearching(true);
    setSearchError(null);
    setSearchHasExecuted(true);
    setSubmittedQuery(queryText.trim());

    try {
      const params = {
        role: 'professor',
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
      setSearchError(err.response?.data?.message || err.message || 'Failed to search faculty records.');
    } finally {
      setSearching(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    executeFacultySearch(searchQuery, 1);
  };

  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= searchPagination.pages) {
      executeFacultySearch(submittedQuery, newPage);
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

  // Open Faculty Details Drawer
  const handleOpenFacultyDetail = async (faculty) => {
    setSelectedFaculty(faculty);
    setFacultyDetail(null);
    setDetailLoading(true);
    setDetailError(null);

    try {
      const res = await usersAPI.getById(faculty._id);
      if (res.data) {
        setFacultyDetail(res.data.user || res.data);
      } else {
        setDetailError('No details available for this faculty member.');
      }
    } catch (err) {
      setDetailError(err.response?.data?.message || 'Failed to load faculty profile details.');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseFacultyDetail = () => {
    setSelectedFaculty(null);
    setFacultyDetail(null);
    setDetailError(null);
  };

  // Distribution & Analytics Calculations
  const summary = data?.summary || {};
  const facultyInsights = data?.facultyInsights || {};

  const byInstitutionList = facultyInsights.byInstitution || [];
  const maxInstCount = useMemo(() => Math.max(...byInstitutionList.map(i => i.count || 0), 1), [byInstitutionList]);

  const byDeptList = facultyInsights.byDepartment || [];
  const maxDeptCount = useMemo(() => Math.max(...byDeptList.map(d => d.count || 0), 1), [byDeptList]);

  const courseAllocationList = facultyInsights.courseAllocation || [];
  const facultyCoverageList = facultyInsights.facultyCoverage || [];
  const facultyWithoutCoursesList = facultyInsights.facultyWithoutCourses || [];
  const unassignedCoursesList = facultyInsights.unassignedCourses || [];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Faculty Insights</h1>
          <p className="text-muted mt-1 text-sm">
            University-wide faculty distribution, course allocation, and department coverage insights.
          </p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-border p-16 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm font-semibold text-slate-700">Loading Faculty Analytics...</p>
          <p className="text-xs text-muted mt-1">Aggregating faculty metrics across all campuses and departments.</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Faculty Insights</h1>
          <p className="text-muted mt-1 text-sm">
            University-wide faculty distribution, course allocation, and department coverage insights.
          </p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-rose-200 p-8 text-center text-rose-700">
          <Icons.AlertTriangle className="w-10 h-10 mx-auto mb-3 text-rose-500" />
          <h3 className="font-bold text-lg mb-1">Failed to Load Faculty Insights</h3>
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
          <h1 className="text-2xl font-bold text-heading">Faculty Insights</h1>
          <p className="text-muted mt-1 text-sm">
            University-wide faculty distribution, course allocation, and department coverage insights.
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
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full sm:w-auto flex-1 max-w-xl">
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
          </div>

          {hasActiveFilters && (
            <div className="pt-2 sm:pt-5">
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

      {/* 3. Faculty Summary (4 KPI Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Faculty */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wider">Total Faculty</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">
                {(summary.totalFaculty || 0).toLocaleString()}
              </h3>
              <p className="text-xs text-muted mt-1">Academic teaching staff</p>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
              <Icons.UserCog className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Active Faculty */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wider">Active Faculty</p>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1">
                {(summary.activeFaculty || 0).toLocaleString()}
              </h3>
              <p className="text-xs text-emerald-600 mt-1 font-medium">Currently active profiles</p>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
              <Icons.UserCheck className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Courses Assigned */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wider">Courses Assigned</p>
              <h3 className="text-2xl font-bold text-indigo-700 mt-1">
                {(summary.assignedCourses || 0).toLocaleString()}
              </h3>
              <p className="text-xs text-indigo-600 mt-1 font-medium">Staffed course sections</p>
            </div>
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
              <Icons.BookOpen className="w-6 h-6" />
            </div>
          </div>
        </div>

        {/* Unassigned Courses */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-medium text-muted uppercase tracking-wider">Unassigned Courses</p>
              <h3 className="text-2xl font-bold text-rose-600 mt-1">
                {(summary.unassignedCourses || 0).toLocaleString()}
              </h3>
              <p className="text-xs text-rose-600 mt-1 font-medium">Pending faculty allocation</p>
            </div>
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
              <Icons.AlertCircle className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Faculty Distribution (2 Cards) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* A. Faculty by Institute */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icons.Building className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-slate-800 text-base">Faculty by Institute</h3>
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
                  <div key={inst.name || idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">{inst.name || 'Campus'}</span>
                      <span className="font-mono font-bold text-slate-900">{inst.count} faculty</span>
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

        {/* B. Faculty by Department */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icons.Layers className="w-5 h-5 text-purple-600" />
              <h3 className="font-bold text-slate-800 text-base">Faculty by Department</h3>
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
                  <div key={dept.name || idx} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">{dept.name || 'Department'}</span>
                      <span className="font-mono font-bold text-slate-900">{dept.count} faculty</span>
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
      </div>

      {/* 5. Course Allocation & 6. Department Coverage */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Course Allocation */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icons.BookOpen className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Faculty Course Allocation</h3>
                  <p className="text-xs text-muted">Factual course teaching counts and student reach.</p>
                </div>
              </div>
              <span className="text-xs text-muted font-medium">{courseAllocationList.length} Records</span>
            </div>

            {courseAllocationList.length === 0 ? (
              <p className="text-xs text-muted py-8 text-center">No course allocation records available.</p>
            ) : (
              <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Faculty</th>
                      <th className="py-2.5 px-3 text-center">Courses Assigned</th>
                      <th className="py-2.5 px-3 text-center">Students Taught</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {courseAllocationList.map((item, idx) => (
                      <tr key={item.professorId || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="font-semibold text-slate-800">{item.name}</div>
                          <div className="text-[11px] text-slate-400">{item.email}</div>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                          {item.coursesCount}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                          {item.studentsTaught}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Department Faculty Coverage */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Icons.ShieldCheck className="w-5 h-5 text-teal-600" />
                <div>
                  <h3 className="font-bold text-slate-800 text-base">Department Faculty Coverage</h3>
                  <p className="text-xs text-muted">Ratio of staffed courses relative to total department offerings.</p>
                </div>
              </div>
              <span className="text-xs text-muted font-medium">{facultyCoverageList.length} Departments</span>
            </div>

            {facultyCoverageList.length === 0 ? (
              <p className="text-xs text-muted py-8 text-center">No department coverage data available.</p>
            ) : (
              <div className="overflow-x-auto max-h-72 overflow-y-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3 text-center">Total Courses</th>
                      <th className="py-2.5 px-3 text-center">Assigned Courses</th>
                      <th className="py-2.5 px-3 text-center">Coverage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {facultyCoverageList.map((dept, idx) => (
                      <tr key={dept.departmentId || idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 font-semibold text-slate-800">
                          {dept.name}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                          {dept.totalCourses}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-900">
                          {dept.assignedCourses}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                            {dept.coveragePercentage}%
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
      </div>

      {/* 7. Attention / Exceptions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* A. Faculty Without Course Assignments */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icons.UserCog className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="font-bold text-slate-800 text-base">Faculty Without Course Assignments</h3>
                <p className="text-xs text-muted">Active professors currently without assigned course sections.</p>
              </div>
            </div>
            <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200">
              {facultyWithoutCoursesList.length} Faculty
            </span>
          </div>

          {facultyWithoutCoursesList.length === 0 ? (
            <div className="p-6 bg-emerald-50/50 border border-emerald-200 rounded-xl text-center text-emerald-800 text-xs">
              <Icons.CheckCircle className="w-6 h-6 mx-auto mb-1 text-emerald-600" />
              <p className="font-semibold">All active faculty members have course assignments.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-60 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Faculty Name</th>
                    <th className="py-2.5 px-3">Email</th>
                    <th className="py-2.5 px-3">Department</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {facultyWithoutCoursesList.map((p, idx) => (
                    <tr key={p.professorId || idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-slate-800">{p.name}</td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono text-[11px]">{p.email}</td>
                      <td className="py-2.5 px-3 text-slate-700">{p.departmentName || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* B. Unassigned Courses */}
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Icons.AlertCircle className="w-5 h-5 text-rose-600" />
              <div>
                <h3 className="font-bold text-slate-800 text-base">Unassigned Courses</h3>
                <p className="text-xs text-muted">Active course offerings lacking an assigned professor.</p>
              </div>
            </div>
            <span className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
              {unassignedCoursesList.length} Courses
            </span>
          </div>

          {unassignedCoursesList.length === 0 ? (
            <div className="p-6 bg-emerald-50/50 border border-emerald-200 rounded-xl text-center text-emerald-800 text-xs">
              <Icons.CheckCircle className="w-6 h-6 mx-auto mb-1 text-emerald-600" />
              <p className="font-semibold">All active course offerings are fully assigned.</p>
            </div>
          ) : (
            <div className="overflow-x-auto max-h-60 overflow-y-auto rounded-xl border border-slate-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 sticky top-0 border-b border-slate-200 text-slate-600 font-semibold uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Course Code & Name</th>
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3 text-center">Semester</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {unassignedCoursesList.map((c, idx) => (
                    <tr key={c.courseId || idx} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-slate-800">{c.name}</div>
                        <div className="text-[11px] font-mono text-blue-600">{c.code}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{c.departmentName || 'N/A'}</td>
                      <td className="py-2.5 px-3 text-center font-bold text-slate-800">Sem {c.semester}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* 8. Find a Faculty Member (On-Demand Lookup) */}
      <div className="bg-surface rounded-card shadow-card border border-border p-5">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
          <div>
            <h3 className="font-bold text-slate-800 text-lg flex items-center gap-2">
              <Icons.Search className="w-5 h-5 text-blue-600" />
              Find a Faculty Member
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Search individual faculty profiles by name or email on-demand.
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
              placeholder="Enter faculty name or email..."
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
                Search Faculty
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
              <p className="text-sm font-semibold text-slate-700">On-Demand Individual Faculty Lookup</p>
              <p className="text-xs text-muted mt-1 max-w-md mx-auto">
                Enter a faculty name or email address above to search and inspect individual teaching profiles.
              </p>
            </div>
          ) : searching ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-xs text-slate-600 font-medium">Searching faculty records...</p>
            </div>
          ) : searchError ? (
            <div className="p-6 bg-rose-50 text-rose-700 rounded-xl border border-rose-200 text-center">
              <Icons.AlertTriangle className="w-6 h-6 mx-auto mb-2 text-rose-500" />
              <p className="text-sm font-bold">{searchError}</p>
            </div>
          ) : searchResults.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200">
              <p className="text-sm font-semibold text-slate-700">No matching faculty records found.</p>
              <p className="text-xs text-muted mt-1">
                Try searching with a different name or email address.
              </p>
            </div>
          ) : (
            <div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-100 border-b border-slate-200 text-xs text-slate-600 uppercase font-semibold">
                    <tr>
                      <th className="py-3 px-4">Faculty Name</th>
                      <th className="py-3 px-4">Campus / College</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Role</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {searchResults.map(prof => (
                      <tr key={prof._id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-800">{prof.name}</div>
                          <div className="text-xs text-muted">{prof.email}</div>
                        </td>
                        <td className="py-3 px-4 text-xs font-medium text-slate-700">
                          {prof.institution?.name || prof.institutionName || 'Main Campus'}
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {prof.department?.name || prof.departmentName || 'Academic Dept'}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-slate-600">
                          PROFESSOR
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                            Active
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleOpenFacultyDetail(prof)}
                            className="px-3 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 text-xs font-semibold rounded-md transition-colors inline-flex items-center gap-1.5"
                          >
                            <Icons.Eye className="w-3.5 h-3.5" />
                            View Profile
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

      {/* 9. Faculty Detail Drawer Modal */}
      {selectedFaculty && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex justify-end transition-opacity">
          <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col overflow-hidden border-l border-slate-200">
            {/* Drawer Header */}
            <div className="p-5 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
                  <Icons.UserCog className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{selectedFaculty.name}</h3>
                  <p className="text-xs text-slate-500 font-mono">{selectedFaculty.email}</p>
                </div>
              </div>
              <button
                onClick={handleCloseFacultyDetail}
                className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {detailLoading ? (
                <div className="p-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  <p className="text-xs text-slate-600 font-medium">Loading faculty profile details...</p>
                </div>
              ) : detailError ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs">
                  <p className="font-bold mb-1">Profile Notice</p>
                  <p>{detailError}</p>
                </div>
              ) : facultyDetail ? (
                <div className="space-y-6">
                  {/* Profile Summary Card */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block font-medium">Role</span>
                      <span className="font-mono font-semibold text-slate-800 block mt-0.5">
                        {facultyDetail.role ? facultyDetail.role.toUpperCase() : 'PROFESSOR'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block font-medium">Campus / Institution</span>
                      <span className="font-semibold text-slate-800 block mt-0.5">
                        {facultyDetail.institution?.name || selectedFaculty.institution?.name || 'Main Campus'}
                      </span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500 block font-medium">Department</span>
                      <span className="font-semibold text-slate-800 block mt-0.5">
                        {facultyDetail.department?.name || selectedFaculty.department?.name || 'Academic Dept'}
                      </span>
                    </div>
                  </div>

                  {/* Assigned Courses Section */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                      <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                        <Icons.BookOpen className="w-4 h-4 text-indigo-600" />
                        Assigned Courses ({facultyDetail.courses?.length || 0})
                      </h4>
                    </div>

                    {(!facultyDetail.courses || facultyDetail.courses.length === 0) ? (
                      <div className="p-6 text-center text-slate-500 text-xs">
                        <Icons.Info className="w-6 h-6 text-slate-400 mx-auto mb-1" />
                        No courses currently assigned to this faculty member.
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {facultyDetail.courses.map((c, idx) => (
                          <div key={c._id || idx} className="p-3.5 text-xs flex justify-between items-center hover:bg-slate-50/50">
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">{c.name}</p>
                              <p className="text-slate-400 font-mono text-[11px] mt-0.5">{c.code}</p>
                            </div>
                            <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 font-semibold rounded-md border border-indigo-100 text-xs">
                              Semester {c.semester || 'N/A'}
                            </span>
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
                onClick={handleCloseFacultyDetail}
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

