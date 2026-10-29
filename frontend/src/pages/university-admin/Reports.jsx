import { useState, useEffect, useMemo } from 'react';
import { analyticsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';
import AIPerformanceAnalytics from '../../components/shared/AIPerformanceAnalytics';
import toast from 'react-hot-toast';

export default function UniversityReports() {
  const { user } = useAuth();

  // Primary state
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Active Category & Report selection
  const [activeCategory, setActiveCategory] = useState('student'); // 'student', 'faculty', 'academic', 'institutional'
  const [activeReport, setActiveReport] = useState('student-summary');

  // Contextual Filters
  const [filters, setFilters] = useState({
    institution: '',
    department: '',
    semester: '',
    division: '',
    professor: '',
    course: ''
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
        setError(res.data?.message || 'Failed to fetch report analytics data.');
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
      division: '',
      professor: '',
      course: ''
    };
    setFilters(cleared);
    fetchAnalytics(cleared, false);
  };

  const handleCategoryChange = (categoryKey) => {
    setActiveCategory(categoryKey);
    // Set default report for category
    if (categoryKey === 'student') setActiveReport('student-summary');
    else if (categoryKey === 'faculty') setActiveReport('faculty-summary');
    else if (categoryKey === 'academic') setActiveReport('course-performance');
    else if (categoryKey === 'institutional') setActiveReport('executive-summary');
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

  // Client-Side CSV Generator Helper
  const downloadCSV = (rows, headers, filename) => {
    if (!rows || !rows.length) {
      toast.error('No data available to export');
      return;
    }

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return `"${str}"`;
    };

    const headerLine = headers.map(h => escapeCSV(h.label)).join(',');
    const bodyLines = rows.map(r =>
      headers.map(h => escapeCSV(h.accessor(r))).join(',')
    );

    const csvContent = [headerLine, ...bodyLines].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success(`Exported ${rows.length} records to ${filename}`);
  };

  // Extract preview data and export handler based on active report
  const getReportDetails = () => {
    const summary = data?.summary || {};
    const studentInsights = data?.studentInsights || {};
    const facultyInsights = data?.facultyInsights || {};
    const riskBreakdown = studentInsights.riskBreakdown || {};

    switch (activeReport) {
      // --- STUDENT REPORTS ---
      case 'student-summary':
        return {
          title: 'University Student Summary',
          description: 'Overall student population metrics, active enrollment counts, and at-risk student totals.',
          recordsCount: studentInsights.byInstitution?.length || 0,
          exportFn: () => downloadCSV(
            studentInsights.byInstitution || [],
            [
              { label: 'Campus Name', accessor: r => r.name || 'Campus' },
              { label: 'Total Student Count', accessor: r => r.count || 0 }
            ],
            'university-student-summary.csv'
          )
        };
      case 'student-institution-dept':
        return {
          title: 'Institute / Department Student Summary',
          description: 'Detailed breakdown of student headcount distributed by campus and academic department.',
          recordsCount: (studentInsights.byInstitution?.length || 0) + (studentInsights.byDepartment?.length || 0),
          exportFn: () => downloadCSV(
            studentInsights.byDepartment || [],
            [
              { label: 'Department Name', accessor: r => r.name || 'Department' },
              { label: 'Student Count', accessor: r => r.count || 0 }
            ],
            'student-headcount-by-department.csv'
          )
        };
      case 'student-semester':
        return {
          title: 'Semester Student Distribution',
          description: 'Distribution of active student enrollments across academic semesters 1 through 8.',
          recordsCount: studentInsights.bySemester?.length || 0,
          exportFn: () => downloadCSV(
            studentInsights.bySemester || [],
            [
              { label: 'Semester Level', accessor: r => `Semester ${r.semester}` },
              { label: 'Student Count', accessor: r => r.count || 0 }
            ],
            'semester-student-distribution.csv'
          )
        };
      case 'student-risk':
        return {
          title: 'At-Risk Student Risk Summary',
          description: 'Comprehensive audit of academic risk factors including low performance, low attendance, and backlogs.',
          recordsCount: 4,
          exportFn: () => downloadCSV(
            [
              { category: 'Low Academic Performance', count: riskBreakdown.lowAcademicPerformance || 0 },
              { category: 'Low Attendance (<75%)', count: riskBreakdown.lowAttendance || 0 },
              { category: 'Active Backlogs', count: riskBreakdown.activeBacklog || 0 },
              { category: 'Multiple Intersecting Risk Factors', count: riskBreakdown.multipleRiskFactors || 0 }
            ],
            [
              { label: 'Vulnerability Category', accessor: r => r.category },
              { label: 'Affected Student Count', accessor: r => r.count }
            ],
            'at-risk-student-summary.csv'
          )
        };

      // --- FACULTY REPORTS ---
      case 'faculty-summary':
        return {
          title: 'Faculty Summary',
          description: 'Overview of academic teaching staff counts, active faculty profiles, and campus distribution.',
          recordsCount: facultyInsights.byInstitution?.length || 0,
          exportFn: () => downloadCSV(
            facultyInsights.byInstitution || [],
            [
              { label: 'Campus Name', accessor: r => r.name || 'Campus' },
              { label: 'Faculty Count', accessor: r => r.count || 0 }
            ],
            'university-faculty-summary.csv'
          )
        };
      case 'faculty-allocation':
        return {
          title: 'Faculty Course Allocation',
          description: 'Factual teaching allocation metrics showing assigned course counts and student reach per faculty member.',
          recordsCount: facultyInsights.courseAllocation?.length || 0,
          exportFn: () => downloadCSV(
            facultyInsights.courseAllocation || [],
            [
              { label: 'Faculty Name', accessor: r => r.name },
              { label: 'Email', accessor: r => r.email },
              { label: 'Courses Assigned', accessor: r => r.coursesCount },
              { label: 'Students Taught', accessor: r => r.studentsTaught }
            ],
            'faculty-course-allocation.csv'
          )
        };
      case 'department-coverage':
        return {
          title: 'Department Faculty Coverage',
          description: 'Ratio of staffed courses relative to total course offerings across academic departments.',
          recordsCount: facultyInsights.facultyCoverage?.length || 0,
          exportFn: () => downloadCSV(
            facultyInsights.facultyCoverage || [],
            [
              { label: 'Department Name', accessor: r => r.name },
              { label: 'Total Offering Courses', accessor: r => r.totalCourses },
              { label: 'Assigned Courses', accessor: r => r.assignedCourses },
              { label: 'Coverage Percentage', accessor: r => `${r.coveragePercentage}%` }
            ],
            'department-faculty-coverage.csv'
          )
        };
      case 'faculty-exceptions':
        return {
          title: 'Faculty & Course Exceptions',
          description: 'Audit of active faculty members without course assignments and unassigned course offerings.',
          recordsCount: (facultyInsights.facultyWithoutCourses?.length || 0) + (facultyInsights.unassignedCourses?.length || 0),
          exportFn: () => downloadCSV(
            facultyInsights.unassignedCourses || [],
            [
              { label: 'Course Code', accessor: r => r.code },
              { label: 'Course Title', accessor: r => r.name },
              { label: 'Department', accessor: r => r.departmentName },
              { label: 'Semester', accessor: r => `Semester ${r.semester}` }
            ],
            'unassigned-courses-exception-report.csv'
          )
        };

      // --- ACADEMIC REPORTS ---
      case 'course-performance':
        return {
          title: 'Course Performance Summary',
          description: 'Detailed course-level academic metrics including average score, pass percentage, and student counts.',
          recordsCount: data?.coursePerformance?.length || 0,
          exportFn: () => downloadCSV(
            data?.coursePerformance || [],
            [
              { label: 'Course Code', accessor: r => r.courseCode },
              { label: 'Course Name', accessor: r => r.courseName },
              { label: 'Campus', accessor: r => r.institutionName },
              { label: 'Department', accessor: r => r.departmentName },
              { label: 'Semester', accessor: r => r.semester },
              { label: 'Assigned Faculty', accessor: r => r.professor },
              { label: 'Enrolled Students', accessor: r => r.enrolledCount },
              { label: 'Average Score %', accessor: r => `${r.averagePercentage}%` },
              { label: 'Pass Rate %', accessor: r => `${r.passPercentage}%` },
              { label: 'Passed Count', accessor: r => r.passCount },
              { label: 'Failed Count', accessor: r => r.failCount }
            ],
            'course-academic-performance.csv'
          )
        };
      case 'department-performance':
        return {
          title: 'Department Performance Report',
          description: 'Comparative academic performance, attendance averages, and pass rates across departments.',
          recordsCount: data?.departmentPerformance?.length || 0,
          exportFn: () => downloadCSV(
            data?.departmentPerformance || [],
            [
              { label: 'Department Name', accessor: r => r.departmentName },
              { label: 'Campus', accessor: r => r.institutionName },
              { label: 'Student Count', accessor: r => r.studentCount },
              { label: 'Faculty Count', accessor: r => r.facultyCount },
              { label: 'Course Count', accessor: r => r.courseCount },
              { label: 'Avg Performance %', accessor: r => `${r.averagePerformance}%` },
              { label: 'Avg Attendance %', accessor: r => `${r.averageAttendance}%` },
              { label: 'Pass Rate %', accessor: r => `${r.passRate}%` },
              { label: 'At-Risk Students', accessor: r => r.atRiskStudents },
              { label: 'Faculty Coverage %', accessor: r => `${r.facultyCoverage}%` }
            ],
            'department-performance-report.csv'
          )
        };
      case 'institution-performance':
        return {
          title: 'Institute Performance Report',
          description: 'Campus-wide academic metrics, attendance compliance, pass rates, and risk ratios.',
          recordsCount: data?.institutionPerformance?.length || 0,
          exportFn: () => downloadCSV(
            data?.institutionPerformance || [],
            [
              { label: 'Campus Name', accessor: r => r.institutionName },
              { label: 'Campus Code', accessor: r => r.code },
              { label: 'Student Count', accessor: r => r.studentCount },
              { label: 'Faculty Count', accessor: r => r.facultyCount },
              { label: 'Course Count', accessor: r => r.courseCount },
              { label: 'Avg Performance %', accessor: r => `${r.averagePerformance}%` },
              { label: 'Avg Attendance %', accessor: r => `${r.averageAttendance}%` },
              { label: 'Pass Rate %', accessor: r => `${r.passRate}%` },
              { label: 'At-Risk Students', accessor: r => r.atRiskStudents }
            ],
            'institute-performance-report.csv'
          )
        };
      case 'semester-performance':
        return {
          title: 'Semester Performance Breakdown',
          description: 'Academic performance and attendance averages segmented by semester level.',
          recordsCount: data?.semesterPerformance?.length || 0,
          exportFn: () => downloadCSV(
            data?.semesterPerformance || [],
            [
              { label: 'Semester Level', accessor: r => `Semester ${r.semester}` },
              { label: 'Student Count', accessor: r => r.studentCount },
              { label: 'Course Count', accessor: r => r.courseCount },
              { label: 'Avg Performance %', accessor: r => `${r.averagePerformance}%` },
              { label: 'Avg Attendance %', accessor: r => `${r.averageAttendance}%` },
              { label: 'Pass Rate %', accessor: r => `${r.passRate}%` },
              { label: 'At-Risk Students', accessor: r => r.atRiskStudents }
            ],
            'semester-performance-breakdown.csv'
          )
        };

      // --- INSTITUTIONAL REPORTS ---
      case 'executive-summary':
        return {
          title: 'Executive Institutional Summary',
          description: 'High-level executive overview combining campus performance, department coverage, and total capacity.',
          recordsCount: data?.institutionPerformance?.length || 0,
          exportFn: () => downloadCSV(
            data?.institutionPerformance || [],
            [
              { label: 'Campus Name', accessor: r => r.institutionName },
              { label: 'Students', accessor: r => r.studentCount },
              { label: 'Faculty', accessor: r => r.facultyCount },
              { label: 'Courses', accessor: r => r.courseCount },
              { label: 'Avg Grade %', accessor: r => `${r.averagePerformance}%` },
              { label: 'Avg Attendance %', accessor: r => `${r.averageAttendance}%` },
              { label: 'Pass Rate %', accessor: r => `${r.passRate}%` }
            ],
            'executive-institutional-summary.csv'
          )
        };
      case 'curriculum-coverage':
        return {
          title: 'Curriculum Coverage Audit',
          description: 'Comprehensive audit of course staffing coverage and unassigned course offerings.',
          recordsCount: facultyInsights.facultyCoverage?.length || 0,
          exportFn: () => downloadCSV(
            facultyInsights.facultyCoverage || [],
            [
              { label: 'Department Name', accessor: r => r.name },
              { label: 'Total Courses Offered', accessor: r => r.totalCourses },
              { label: 'Assigned Courses', accessor: r => r.assignedCourses },
              { label: 'Coverage Percentage', accessor: r => `${r.coveragePercentage}%` }
            ],
            'curriculum-coverage-audit.csv'
          )
        };

      default:
        return {
          title: 'University Report',
          description: 'Formal institutional analytics report.',
          recordsCount: 0,
          exportFn: () => toast.error('No export action defined for this report.')
        };
    }
  };

  const reportDetails = getReportDetails();

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Reports & Analytics</h1>
          <p className="text-muted mt-1 text-sm">
            Formal university-level report generation, filtering, preview, and export center.
          </p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-border p-16 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm font-semibold text-slate-700">Loading University Reports Engine...</p>
          <p className="text-xs text-muted mt-1">Fetching university-scoped analytics and preview data.</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-heading">Reports & Analytics</h1>
          <p className="text-muted mt-1 text-sm">
            Formal university-level report generation, filtering, preview, and export center.
          </p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-rose-200 p-8 text-center text-rose-700">
          <Icons.AlertTriangle className="w-10 h-10 mx-auto mb-3 text-rose-500" />
          <h3 className="font-bold text-lg mb-1">Failed to Load Reports Engine</h3>
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
          <h1 className="text-2xl font-bold text-heading">Reports & Analytics</h1>
          <p className="text-muted mt-1 text-sm">
            Formal university-level report generation, filtering, preview, and export center.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {refreshing && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
              <span className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></span>
              Updating preview...
            </span>
          )}
          <span className="text-xs text-muted font-medium bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
            University Scoped
          </span>
        </div>
      </div>

      {/* 2. Category Tabs */}
      <div className="flex border-b border-slate-200 gap-2 overflow-x-auto">
        {[
          { key: 'student', label: 'Student Reports', icon: Icons.GraduationCap },
          { key: 'faculty', label: 'Faculty Reports', icon: Icons.UserCog },
          { key: 'academic', label: 'Academic Reports', icon: Icons.BookOpen },
          { key: 'institutional', label: 'Institutional Reports', icon: Icons.Building },
          { key: 'ai-performance', label: 'API Performance', icon: Icons.Activity }
        ].map(cat => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.key;
          return (
            <button
              key={cat.key}
              onClick={() => handleCategoryChange(cat.key)}
              className={`py-3 px-4 text-xs font-bold transition-colors whitespace-nowrap flex items-center gap-2 border-b-2 ${
                isActive
                  ? 'border-blue-600 text-blue-600 bg-blue-50/40 rounded-t-lg'
                  : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {cat.label}
            </button>
          );
        })}
      </div>

      {activeCategory === 'ai-performance' ? (
        <AIPerformanceAnalytics role="university_admin" />
      ) : (
        <>
          {/* 3. Report Selection Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {activeCategory === 'student' && (
          <>
            <ReportCard
              title="University Student Summary"
              desc="Overall student population, active headcount, and risk totals."
              active={activeReport === 'student-summary'}
              onClick={() => setActiveReport('student-summary')}
              icon={Icons.Users}
            />
            <ReportCard
              title="Campus & Dept Headcount"
              desc="Student distribution across campuses and academic departments."
              active={activeReport === 'student-institution-dept'}
              onClick={() => setActiveReport('student-institution-dept')}
              icon={Icons.Building}
            />
            <ReportCard
              title="Semester Distribution"
              desc="Progression and student counts across semesters 1 to 8."
              active={activeReport === 'student-semester'}
              onClick={() => setActiveReport('student-semester')}
              icon={Icons.BookOpen}
            />
            <ReportCard
              title="At-Risk Risk Summary"
              desc="Audit of low performance, attendance warnings, and backlogs."
              active={activeReport === 'student-risk'}
              onClick={() => setActiveReport('student-risk')}
              icon={Icons.AlertTriangle}
            />
          </>
        )}

        {activeCategory === 'faculty' && (
          <>
            <ReportCard
              title="Faculty Summary"
              desc="Academic teaching staff totals and campus distribution."
              active={activeReport === 'faculty-summary'}
              onClick={() => setActiveReport('faculty-summary')}
              icon={Icons.UserCog}
            />
            <ReportCard
              title="Faculty Course Allocation"
              desc="Factual course assignments and student reach per professor."
              active={activeReport === 'faculty-allocation'}
              onClick={() => setActiveReport('faculty-allocation')}
              icon={Icons.BookOpen}
            />
            <ReportCard
              title="Department Faculty Coverage"
              desc="Staffing coverage ratios across department course offerings."
              active={activeReport === 'department-coverage'}
              onClick={() => setActiveReport('department-coverage')}
              icon={Icons.ShieldCheck}
            />
            <ReportCard
              title="Faculty & Course Exceptions"
              desc="Unallocated professors and unassigned active courses."
              active={activeReport === 'faculty-exceptions'}
              onClick={() => setActiveReport('faculty-exceptions')}
              icon={Icons.AlertCircle}
            />
          </>
        )}

        {activeCategory === 'academic' && (
          <>
            <ReportCard
              title="Course Performance Summary"
              desc="Course-level average percentage, pass rate, and pass/fail counts."
              active={activeReport === 'course-performance'}
              onClick={() => setActiveReport('course-performance')}
              icon={Icons.BarChart}
            />
            <ReportCard
              title="Department Performance"
              desc="Comparative department performance, attendance, and pass rates."
              active={activeReport === 'department-performance'}
              onClick={() => setActiveReport('department-performance')}
              icon={Icons.Layers}
            />
            <ReportCard
              title="Institute Performance"
              desc="Campus-wide academic metrics, attendance, and risk ratios."
              active={activeReport === 'institution-performance'}
              onClick={() => setActiveReport('institution-performance')}
              icon={Icons.Building}
            />
            <ReportCard
              title="Semester Performance"
              desc="Academic performance averages segmented by semester level."
              active={activeReport === 'semester-performance'}
              onClick={() => setActiveReport('semester-performance')}
              icon={Icons.TrendingUp}
            />
          </>
        )}

        {activeCategory === 'institutional' && (
          <>
            <ReportCard
              title="Executive Institutional Summary"
              desc="Combined campus performance overview and total capacity."
              active={activeReport === 'executive-summary'}
              onClick={() => setActiveReport('executive-summary')}
              icon={Icons.ShieldCheck}
            />
            <ReportCard
              title="Curriculum Coverage Audit"
              desc="Audit of department staffing coverage and unassigned courses."
              active={activeReport === 'curriculum-coverage'}
              onClick={() => setActiveReport('curriculum-coverage')}
              icon={Icons.CheckCircle}
            />
          </>
        )}
      </div>

      {/* 4. Contextual Filter Bar */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full lg:w-auto flex-1">
            {/* Institution Filter (All Categories) */}
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

            {/* Department Filter (All Categories) */}
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

            {/* Semester Filter (Student & Academic Reports) */}
            {(activeCategory === 'student' || activeCategory === 'academic') && (
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
            )}

            {/* Division Filter (Student Reports) */}
            {activeCategory === 'student' && (
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
            )}

            {/* Course Filter (Academic Reports) */}
            {activeCategory === 'academic' && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Course</label>
                <select
                  value={filters.course}
                  onChange={e => handleFilterChange('course', e.target.value)}
                  className="form-input w-full text-xs"
                >
                  <option value="">All Courses</option>
                  {availableCourses.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.code ? `${c.code} - ${c.title || c.name}` : (c.title || c.name)}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Professor Filter (Faculty & Academic Reports) */}
            {(activeCategory === 'faculty' || activeCategory === 'academic') && (
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Faculty Member</label>
                <select
                  value={filters.professor}
                  onChange={e => handleFilterChange('professor', e.target.value)}
                  className="form-input w-full text-xs"
                >
                  <option value="">All Faculty</option>
                  {(filterOptions.professors || []).map(p => (
                    <option key={p._id} value={p._id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
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

      {/* 5. Report Preview & Action Toolbar */}
      <div className="bg-surface rounded-card shadow-card border border-border p-5 space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
              <Icons.FileText className="w-5 h-5 text-blue-600" />
              {reportDetails.title}
            </h3>
            <p className="text-xs text-muted mt-0.5">{reportDetails.description}</p>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            <span className="text-xs font-medium text-slate-500">
              Previewing <strong className="text-slate-800 font-mono">{reportDetails.recordsCount}</strong> records
            </span>
            <button
              onClick={reportDetails.exportFn}
              disabled={reportDetails.recordsCount === 0 || refreshing}
              className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
            >
              <Icons.Download className="w-4 h-4" />
              Download CSV
            </button>
          </div>
        </div>

        {/* 6. Dynamic Preview Tables / Cards */}
        <div className="pt-2">
          {refreshing ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-xs text-slate-600 font-medium">Refreshing report preview...</p>
            </div>
          ) : (
            <ReportPreviewDisplay activeReport={activeReport} data={data} />
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

// Subcomponent: Report Selection Card
function ReportCard({ title, desc, active, onClick, icon: Icon }) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
        active
          ? 'bg-blue-50/60 border-blue-300 ring-2 ring-blue-500/20'
          : 'bg-surface border-border hover:border-slate-300 hover:bg-slate-50/50'
      }`}
    >
      <div>
        <div className={`p-2.5 rounded-lg w-fit mb-3 ${active ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
          <Icon className="w-5 h-5" />
        </div>
        <h4 className={`font-bold text-sm ${active ? 'text-blue-950' : 'text-slate-800'}`}>{title}</h4>
        <p className="text-xs text-slate-500 mt-1">{desc}</p>
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
        <span className={`text-[11px] font-bold ${active ? 'text-blue-600' : 'text-slate-400'}`}>
          {active ? 'Selected Preview' : 'Click to Preview'}
        </span>
        <Icons.ChevronRight className={`w-3.5 h-3.5 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
      </div>
    </div>
  );
}

// Subcomponent: Dynamic Preview Table Renderer
function ReportPreviewDisplay({ activeReport, data }) {
  const summary = data?.summary || {};
  const studentInsights = data?.studentInsights || {};
  const facultyInsights = data?.facultyInsights || {};
  const riskBreakdown = studentInsights.riskBreakdown || {};

  switch (activeReport) {
    // --- STUDENT REPORTS PREVIEWS ---
    case 'student-summary':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <span className="text-slate-500 font-medium block uppercase tracking-wider">Total Students</span>
              <span className="text-xl font-bold text-slate-900 mt-1 block">{(summary.totalStudents || 0).toLocaleString()}</span>
            </div>
            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
              <span className="text-emerald-700 font-medium block uppercase tracking-wider">Active Students</span>
              <span className="text-xl font-bold text-emerald-900 mt-1 block">{(summary.activeStudents || 0).toLocaleString()}</span>
            </div>
            <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
              <span className="text-amber-700 font-medium block uppercase tracking-wider">At-Risk Students</span>
              <span className="text-xl font-bold text-amber-900 mt-1 block">{(summary.atRiskStudents || 0).toLocaleString()}</span>
            </div>
            <div className="bg-rose-50 p-3 rounded-xl border border-rose-200">
              <span className="text-rose-700 font-medium block uppercase tracking-wider">Active Backlogs</span>
              <span className="text-xl font-bold text-rose-900 mt-1 block">{(summary.activeBacklogs || 0).toLocaleString()}</span>
            </div>
          </div>
          <SimpleTable
            headers={['Campus / Institution Name', 'Student Count']}
            rows={studentInsights.byInstitution || []}
            renderRow={(item, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="py-2.5 px-3 font-semibold text-slate-800">{item.name}</td>
                <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.count}</td>
              </tr>
            )}
          />
        </div>
      );

    case 'student-institution-dept':
      return (
        <SimpleTable
          headers={['Department Name', 'Student Count']}
          rows={studentInsights.byDepartment || []}
          renderRow={(item, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="py-2.5 px-3 font-semibold text-slate-800">{item.name}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.count}</td>
            </tr>
          )}
        />
      );

    case 'student-semester':
      return (
        <SimpleTable
          headers={['Semester Level', 'Active Student Count']}
          rows={studentInsights.bySemester || []}
          renderRow={(item, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="py-2.5 px-3 font-bold text-slate-800">Semester {item.semester}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.count}</td>
            </tr>
          )}
        />
      );

    case 'student-risk':
      return (
        <SimpleTable
          headers={['Academic Risk Category', 'Vulnerable Student Count']}
          rows={[
            { category: 'Low Academic Performance (Gradebook <50%)', count: riskBreakdown.lowAcademicPerformance || 0 },
            { category: 'Low Attendance Records (<75%)', count: riskBreakdown.lowAttendance || 0 },
            { category: 'Active Course Backlogs', count: riskBreakdown.activeBacklog || 0 },
            { category: 'Multiple Intersecting Risk Factors', count: riskBreakdown.multipleRiskFactors || 0 }
          ]}
          renderRow={(item, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="py-2.5 px-3 font-semibold text-slate-800">{item.category}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-amber-700">{item.count}</td>
            </tr>
          )}
        />
      );

    // --- FACULTY REPORTS PREVIEWS ---
    case 'faculty-summary':
      return (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-blue-50 p-3 rounded-xl border border-blue-200">
              <span className="text-blue-700 font-medium block uppercase tracking-wider">Total Faculty</span>
              <span className="text-xl font-bold text-blue-900 mt-1 block">{(summary.totalFaculty || 0).toLocaleString()}</span>
            </div>
            <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
              <span className="text-emerald-700 font-medium block uppercase tracking-wider">Active Faculty Profiles</span>
              <span className="text-xl font-bold text-emerald-900 mt-1 block">{(summary.activeFaculty || 0).toLocaleString()}</span>
            </div>
          </div>
          <SimpleTable
            headers={['Campus / Institution Name', 'Faculty Count']}
            rows={facultyInsights.byInstitution || []}
            renderRow={(item, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="py-2.5 px-3 font-semibold text-slate-800">{item.name}</td>
                <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.count}</td>
              </tr>
            )}
          />
        </div>
      );

    case 'faculty-allocation':
      return (
        <SimpleTable
          headers={['Faculty Name', 'Email', 'Assigned Courses', 'Students Taught']}
          rows={facultyInsights.courseAllocation || []}
          renderRow={(item, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="py-2.5 px-3 font-semibold text-slate-800">{item.name}</td>
              <td className="py-2.5 px-3 text-slate-500 font-mono">{item.email}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.coursesCount}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{item.studentsTaught}</td>
            </tr>
          )}
        />
      );

    case 'department-coverage':
      return (
        <SimpleTable
          headers={['Department Name', 'Total Offering Courses', 'Assigned Courses', 'Staffing Coverage %']}
          rows={facultyInsights.facultyCoverage || []}
          renderRow={(item, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="py-2.5 px-3 font-semibold text-slate-800">{item.name}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{item.totalCourses}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.assignedCourses}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-teal-700">{item.coveragePercentage}%</td>
            </tr>
          )}
        />
      );

    case 'faculty-exceptions':
      return (
        <div className="space-y-4">
          <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
            <h4 className="font-bold text-amber-900 text-xs uppercase">Unassigned Courses Exception List ({facultyInsights.unassignedCourses?.length || 0})</h4>
          </div>
          <SimpleTable
            headers={['Course Code', 'Course Title', 'Department', 'Semester']}
            rows={facultyInsights.unassignedCourses || []}
            renderRow={(item, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{item.code}</td>
                <td className="py-2.5 px-3 font-semibold text-slate-800">{item.name}</td>
                <td className="py-2.5 px-3 text-slate-700">{item.departmentName}</td>
                <td className="py-2.5 px-3 font-bold text-slate-800">Sem {item.semester}</td>
              </tr>
            )}
          />
        </div>
      );

    // --- ACADEMIC REPORTS PREVIEWS ---
    case 'course-performance':
      return (
        <SimpleTable
          headers={['Code', 'Course Title', 'Campus', 'Department', 'Sem', 'Faculty', 'Students', 'Avg Score', 'Pass Rate']}
          rows={data?.coursePerformance || []}
          renderRow={(item, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="py-2.5 px-3 font-mono font-bold text-blue-600">{item.courseCode}</td>
              <td className="py-2.5 px-3 font-semibold text-slate-800">{item.courseName}</td>
              <td className="py-2.5 px-3 text-slate-600">{item.institutionName}</td>
              <td className="py-2.5 px-3 text-slate-600">{item.departmentName}</td>
              <td className="py-2.5 px-3 font-bold text-slate-800">Sem {item.semester}</td>
              <td className="py-2.5 px-3 text-slate-700">{item.professor}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.enrolledCount}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{item.averagePercentage}%</td>
              <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{item.passPercentage}%</td>
            </tr>
          )}
        />
      );

    case 'department-performance':
      return (
        <SimpleTable
          headers={['Department', 'Campus', 'Students', 'Faculty', 'Courses', 'Avg Grade', 'Avg Attendance', 'Pass Rate', 'At-Risk']}
          rows={data?.departmentPerformance || []}
          renderRow={(item, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="py-2.5 px-3 font-semibold text-slate-800">{item.departmentName}</td>
              <td className="py-2.5 px-3 text-slate-600">{item.institutionName}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.studentCount}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{item.facultyCount}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{item.courseCount}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{item.averagePerformance}%</td>
              <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{item.averageAttendance}%</td>
              <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{item.passRate}%</td>
              <td className="py-2.5 px-3 font-mono font-bold text-amber-700">{item.atRiskStudents}</td>
            </tr>
          )}
        />
      );

    case 'institution-performance':
      return (
        <SimpleTable
          headers={['Campus Name', 'Code', 'Students', 'Faculty', 'Courses', 'Avg Grade', 'Avg Attendance', 'Pass Rate', 'At-Risk']}
          rows={data?.institutionPerformance || []}
          renderRow={(item, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="py-2.5 px-3 font-semibold text-slate-800">{item.institutionName}</td>
              <td className="py-2.5 px-3 font-mono text-slate-500">{item.code || 'INST'}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.studentCount}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{item.facultyCount}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{item.courseCount}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{item.averagePerformance}%</td>
              <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{item.averageAttendance}%</td>
              <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{item.passRate}%</td>
              <td className="py-2.5 px-3 font-mono font-bold text-amber-700">{item.atRiskStudents}</td>
            </tr>
          )}
        />
      );

    case 'semester-performance':
      return (
        <SimpleTable
          headers={['Semester Level', 'Students', 'Courses', 'Avg Grade', 'Avg Attendance', 'Pass Rate', 'At-Risk']}
          rows={data?.semesterPerformance || []}
          renderRow={(item, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="py-2.5 px-3 font-bold text-slate-800">Semester {item.semester}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.studentCount}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{item.courseCount}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{item.averagePerformance}%</td>
              <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{item.averageAttendance}%</td>
              <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{item.passRate}%</td>
              <td className="py-2.5 px-3 font-mono font-bold text-amber-700">{item.atRiskStudents}</td>
            </tr>
          )}
        />
      );

    // --- INSTITUTIONAL REPORTS PREVIEWS ---
    case 'executive-summary':
      return (
        <div className="space-y-4">
          <h4 className="font-bold text-slate-800 text-xs uppercase">Executive Campus Performance Summary</h4>
          <SimpleTable
            headers={['Campus Name', 'Students', 'Faculty', 'Courses', 'Avg Grade', 'Avg Attendance', 'Pass Rate']}
            rows={data?.institutionPerformance || []}
            renderRow={(item, idx) => (
              <tr key={idx} className="hover:bg-slate-50">
                <td className="py-2.5 px-3 font-semibold text-slate-800">{item.institutionName}</td>
                <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.studentCount}</td>
                <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{item.facultyCount}</td>
                <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{item.courseCount}</td>
                <td className="py-2.5 px-3 font-mono font-bold text-blue-700">{item.averagePerformance}%</td>
                <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">{item.averageAttendance}%</td>
                <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">{item.passRate}%</td>
              </tr>
            )}
          />
        </div>
      );

    case 'curriculum-coverage':
      return (
        <SimpleTable
          headers={['Department Name', 'Total Courses Offered', 'Assigned Courses', 'Staffing Coverage %']}
          rows={facultyInsights.facultyCoverage || []}
          renderRow={(item, idx) => (
            <tr key={idx} className="hover:bg-slate-50">
              <td className="py-2.5 px-3 font-semibold text-slate-800">{item.name}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-700">{item.totalCourses}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{item.assignedCourses}</td>
              <td className="py-2.5 px-3 font-mono font-bold text-teal-700">{item.coveragePercentage}%</td>
            </tr>
          )}
        />
      );

    default:
      return <p className="text-xs text-slate-500 py-6 text-center">Select a report above to render live preview.</p>;
  }
}

// Subcomponent: Reusable Simple Table
function SimpleTable({ headers, rows, renderRow }) {
  if (!rows || rows.length === 0) {
    return <p className="text-xs text-slate-500 py-6 text-center bg-slate-50 rounded-xl border border-slate-200">No records available for this report preview.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-100 border-b border-slate-200 text-slate-600 font-semibold uppercase">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="py-2.5 px-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 bg-white">
          {rows.map((r, i) => renderRow(r, i))}
        </tbody>
      </table>
    </div>
  );
}

