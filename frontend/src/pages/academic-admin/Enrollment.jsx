import { useState, useEffect, useMemo } from 'react';
import { usersAPI, enrollmentAPI, coursesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useStudentSync } from '../../context/StudentSyncContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function AcademicEnrollment() {
  const { user } = useAuth();
  const { getAuthoritativeStudent, authoritativeStudents } = useStudentSync();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Tab View Mode: 'individual' or 'bulk'
  const [activeTab, setActiveTab] = useState('individual');

  // Search & Filter State (Individual View)
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  const [filterDivision, setFilterDivision] = useState('');

  // Individual Enrollment State
  const [activeEnrollments, setActiveEnrollments] = useState([]);
  const [historyEnrollments, setHistoryEnrollments] = useState([]);
  const [loadingEnrollments, setLoadingEnrollments] = useState(false);
  const [enrollmentError, setEnrollmentError] = useState(null);

  // Department Courses State
  const [courses, setCourses] = useState([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [selectedCourseIds, setSelectedCourseIds] = useState([]);
  const [courseSearch, setCourseSearch] = useState('');
  const [isSubmittingEnroll, setIsSubmittingEnroll] = useState(false);

  // Bulk Enrollment Mode State
  const [bulkSemester, setBulkSemester] = useState('1');
  const [selectedBulkCourseIds, setSelectedBulkCourseIds] = useState([]);
  const [selectedBulkStudentIds, setSelectedBulkStudentIds] = useState(new Set());
  const [bulkSearchQuery, setBulkSearchQuery] = useState('');
  const [bulkCurrentPage, setBulkCurrentPage] = useState(1);
  const [bulkPageSize, setBulkPageSize] = useState(25);

  // Bulk Preview Modal State
  const [showBulkPreviewModal, setShowBulkPreviewModal] = useState(false);
  const [validatingBulk, setValidatingBulk] = useState(false);
  const [bulkValidationResult, setBulkValidationResult] = useState(null);
  const [isExecutingBulk, setIsExecutingBulk] = useState(false);

  const deptName = user?.department?.name || user?.departmentName || 'Computer Science & Engineering';
  const deptId = user?.department?._id || user?.department;

  // Helper for student initials in avatar
  const getInitials = (name) => {
    if (!name) return 'ST';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Initial fetch of department students roster & courses
  useEffect(() => {
    fetchStudents();
    fetchDepartmentCourses();
  }, [deptId]);

  const fetchStudents = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      // Limit 1000 to fetch full cohort without artificial 200-student cap
      const res = await usersAPI.getAll({ role: 'student', department: deptId, limit: 1000 });
      const val = res.data?.data || res.data?.users || res.data || [];
      const raw = Array.isArray(val) ? val : [];
      const authStudents = raw.map(s => getAuthoritativeStudent(s));
      setStudents(authStudents);
      if (authStudents.length > 0 && !selectedStudentId) {
        setSelectedStudentId(authStudents[0]._id);
      }
    } catch {
      setFetchError('Unable to load department student records from server.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartmentCourses = async () => {
    if (!deptId) return;
    setLoadingCourses(true);
    try {
      const res = await coursesAPI.getAll({ department: deptId, limit: 100 });
      const data = res.data?.data || res.data?.courses || res.data || [];
      setCourses(Array.isArray(data) ? data : []);
    } catch {
      setCourses([]);
    } finally {
      setLoadingCourses(false);
    }
  };

  // Filter student roster for Individual mode
  const filteredStudents = useMemo(() => {
    const list = students.length > 0 ? students : authoritativeStudents.map(s => getAuthoritativeStudent(s));
    return list.filter(s => {
      const sDept = s.department?._id || s.department;
      if (deptId && sDept && String(sDept) !== String(deptId)) return false;

      if (filterSemester && String(s.currentSemester || 1) !== String(filterSemester)) return false;
      if (filterDivision && String(s.division || 'A').toUpperCase() !== String(filterDivision).toUpperCase()) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const nameMatch = s.name?.toLowerCase().includes(q);
        const rollMatch = (s.enrollmentNumber || s.studentId || '').toLowerCase().includes(q);
        const emailMatch = s.email?.toLowerCase().includes(q);
        if (!nameMatch && !rollMatch && !emailMatch) return false;
      }
      return true;
    });
  }, [students, authoritativeStudents, deptId, filterSemester, filterDivision, searchQuery, getAuthoritativeStudent]);

  // Derive selected student object
  const selectedStudent = useMemo(() => {
    return filteredStudents.find(s => s._id === selectedStudentId) ||
           students.find(s => s._id === selectedStudentId) ||
           (filteredStudents.length > 0 ? filteredStudents[0] : null);
  }, [filteredStudents, students, selectedStudentId]);

  // Fetch Enrollment records whenever selected student changes & reset course selection
  useEffect(() => {
    setSelectedCourseIds([]);
    setCourseSearch('');
    if (!selectedStudent?._id) {
      setActiveEnrollments([]);
      setHistoryEnrollments([]);
      return;
    }

    fetchStudentEnrollments(selectedStudent._id);
  }, [selectedStudent?._id]);

  const fetchStudentEnrollments = async (studentId) => {
    setLoadingEnrollments(true);
    setEnrollmentError(null);
    try {
      const res = await enrollmentAPI.getStudentEnrollment(studentId);
      const data = res.data;
      setActiveEnrollments(Array.isArray(data?.active) ? data.active : []);
      setHistoryEnrollments(Array.isArray(data?.history) ? data.history : []);
    } catch (err) {
      setEnrollmentError(err.response?.data?.message || 'Unable to load student enrollment records.');
      setActiveEnrollments([]);
      setHistoryEnrollments([]);
    } finally {
      setLoadingEnrollments(false);
    }
  };

  const currentSem = Number(selectedStudent?.currentSemester || 1);
  const enrollmentNo = selectedStudent?.enrollmentNumber || selectedStudent?.studentId || 'N/A';

  // Set of actively enrolled course IDs to identify already enrolled courses in the modal
  const activeEnrolledCourseIds = useMemo(() => {
    const set = new Set();
    activeEnrollments.forEach(enr => {
      const cId = enr.course?._id || enr.course;
      if (cId) set.add(String(cId));
    });
    return set;
  }, [activeEnrollments]);

  // Available courses strictly matching the selected student's current semester
  const availableSemesterCourses = useMemo(() => {
    if (!selectedStudent) return [];
    return courses.filter(course => Number(course.semester || 1) === currentSem);
  }, [courses, currentSem, selectedStudent]);

  // Filter available semester courses by search term
  const filteredAvailableCourses = useMemo(() => {
    if (!courseSearch.trim()) return availableSemesterCourses;
    const q = courseSearch.toLowerCase().trim();
    return availableSemesterCourses.filter(course => {
      const matchName = course.name?.toLowerCase().includes(q);
      const matchCode = course.code?.toLowerCase().includes(q);
      return matchName || matchCode;
    });
  }, [availableSemesterCourses, courseSearch]);

  // Non-enrolled courses eligible for multi-selection
  const selectableCourses = useMemo(() => {
    return filteredAvailableCourses.filter(c => !activeEnrolledCourseIds.has(String(c._id)));
  }, [filteredAvailableCourses, activeEnrolledCourseIds]);

  const isAllSelected = selectableCourses.length > 0 && selectableCourses.every(c => selectedCourseIds.includes(c._id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedCourseIds([]);
    } else {
      setSelectedCourseIds(selectableCourses.map(c => c._id));
    }
  };

  const toggleCourseSelection = (courseId) => {
    setSelectedCourseIds(prev =>
      prev.includes(courseId)
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    );
  };

  // Group historical enrollments by semester
  const historyBySemester = useMemo(() => {
    const grouped = {};
    historyEnrollments.forEach(enr => {
      const semKey = enr.course?.semester ? `Semester ${enr.course.semester}` : 'Past Academic Terms';
      if (!grouped[semKey]) grouped[semKey] = [];
      grouped[semKey].push(enr);
    });
    return grouped;
  }, [historyEnrollments]);

  const historySemestersList = Object.keys(historyBySemester).sort((a, b) => b.localeCompare(a));

  // Submit Single-Student Course Enrollment
  const handleEnrollSubmit = async () => {
    if (selectedCourseIds.length === 0 || !selectedStudent?._id) return;
    const coursesToEnroll = courses.filter(c => selectedCourseIds.includes(c._id));
    if (coursesToEnroll.length === 0) return;

    setIsSubmittingEnroll(true);
    try {
      await enrollmentAPI.enroll({
        studentId: selectedStudent._id,
        courseIds: selectedCourseIds,
        division: selectedStudent.division || 'A',
        academicTerm: 'CURRENT'
      });

      // Optimistically update activeEnrollments
      const newActiveRecords = coursesToEnroll.map(course => ({
        _id: 'enr-' + Date.now() + '-' + course._id,
        student: selectedStudent,
        course,
        division: selectedStudent.division || 'A',
        academicTerm: 'CURRENT',
        status: 'active',
        createdAt: new Date().toISOString()
      }));

      setActiveEnrollments(prev => {
        const existingIds = new Set(prev.map(e => String(e.course?._id || e.course)));
        const added = newActiveRecords.filter(r => !existingIds.has(String(r.course._id)));
        return [...added, ...prev];
      });

      toast.success(
        coursesToEnroll.length === 1
          ? `Successfully enrolled ${selectedStudent.name} in ${coursesToEnroll[0].name}!`
          : `Successfully enrolled ${selectedStudent.name} in ${coursesToEnroll.length} courses!`
      );

      setShowEnrollModal(false);
      setSelectedCourseIds([]);
      setCourseSearch('');

      if (selectedStudent._id) {
        await fetchStudentEnrollments(selectedStudent._id);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to complete course enrollment.');
    } finally {
      setIsSubmittingEnroll(false);
    }
  };

  // ==========================================
  // BULK ENROLLMENT DERIVED DATA & HANDLERS
  // ==========================================

  // Courses available for selected bulkSemester
  const bulkAvailableCourses = useMemo(() => {
    return courses.filter(c => String(c.semester || 1) === String(bulkSemester));
  }, [courses, bulkSemester]);

  // Students eligible for selected bulkSemester
  const bulkCohortStudents = useMemo(() => {
    const list = students.length > 0 ? students : authoritativeStudents.map(s => getAuthoritativeStudent(s));
    return list.filter(s => {
      const sDept = s.department?._id || s.department;
      if (deptId && sDept && String(sDept) !== String(deptId)) return false;

      if (String(s.currentSemester || 1) !== String(bulkSemester)) return false;

      if (bulkSearchQuery.trim()) {
        const q = bulkSearchQuery.toLowerCase().trim();
        const matchName = s.name?.toLowerCase().includes(q);
        const matchRoll = (s.enrollmentNumber || s.studentId || '').toLowerCase().includes(q);
        return matchName || matchRoll;
      }
      return true;
    });
  }, [students, authoritativeStudents, deptId, bulkSemester, bulkSearchQuery, getAuthoritativeStudent]);

  // Reset bulk selections when bulk semester changes
  useEffect(() => {
    setSelectedBulkCourseIds([]);
    setSelectedBulkStudentIds(new Set());
    setBulkCurrentPage(1);
  }, [bulkSemester]);

  // Paginated Bulk Students
  const bulkTotalPages = Math.ceil(bulkCohortStudents.length / bulkPageSize) || 1;
  const paginatedBulkStudents = useMemo(() => {
    const start = (bulkCurrentPage - 1) * bulkPageSize;
    return bulkCohortStudents.slice(start, start + bulkPageSize);
  }, [bulkCohortStudents, bulkCurrentPage, bulkPageSize]);

  const toggleBulkCourseSelection = (id) => {
    setSelectedBulkCourseIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleBulkStudentSelection = (id) => {
    setSelectedBulkStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllBulkCohortStudents = () => {
    if (selectedBulkStudentIds.size === bulkCohortStudents.length && bulkCohortStudents.length > 0) {
      setSelectedBulkStudentIds(new Set());
    } else {
      setSelectedBulkStudentIds(new Set(bulkCohortStudents.map(s => s._id)));
    }
  };

  // Open Bulk Preview & Run Dry-Run Validation
  const handleOpenBulkPreview = async () => {
    if (selectedBulkCourseIds.length === 0 || selectedBulkStudentIds.size === 0) {
      toast.error('Please select at least one course and one student for bulk enrollment.');
      return;
    }

    setShowBulkPreviewModal(true);
    setValidatingBulk(true);
    setBulkValidationResult(null);

    try {
      const res = await enrollmentAPI.enrollBulk({
        studentIds: Array.from(selectedBulkStudentIds),
        courseIds: selectedBulkCourseIds,
        academicTerm: 'CURRENT',
        validateOnly: true
      });
      setBulkValidationResult(res.data);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Bulk validation failed';
      const errors = err.response?.data?.errors || [msg];
      setBulkValidationResult({
        valid: false,
        errors,
        summary: null
      });
    } finally {
      setValidatingBulk(false);
    }
  };

  // Execute Bulk Enrollment
  const handleExecuteBulkEnrollment = async () => {
    if (!bulkValidationResult || !bulkValidationResult.valid) return;

    setIsExecutingBulk(true);
    try {
      const res = await enrollmentAPI.enrollBulk({
        studentIds: Array.from(selectedBulkStudentIds),
        courseIds: selectedBulkCourseIds,
        academicTerm: 'CURRENT',
        validateOnly: false
      });

      toast.success(res.data.message || `Bulk enrollment complete!`);
      setShowBulkPreviewModal(false);
      setSelectedBulkCourseIds([]);
      setSelectedBulkStudentIds(new Set());
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to execute bulk enrollment');
    } finally {
      setIsExecutingBulk(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation Tabs */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Enrollments</h1>
        </div>

        {/* Mode Switcher */}
        <div className="flex items-center gap-1.5 bg-surface p-1.5 border border-border rounded-xl shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('individual')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'individual'
                ? 'bg-primary text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Icons.UserCheck className="w-4 h-4" />
            Individual Enrollment
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bulk')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition flex items-center gap-1.5 ${
              activeTab === 'bulk'
                ? 'bg-primary text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Icons.Users className="w-4 h-4" />
            Bulk Enrollment (200+)
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-card text-xs text-red-800 flex items-center justify-between">
          <span>{fetchError}</span>
          <button onClick={fetchStudents} className="font-semibold underline hover:text-red-900 ml-4">
            Retry
          </button>
        </div>
      )}

      {/* ========================================== */}
      {/* INDIVIDUAL ENROLLMENT MODE                 */}
      {/* ========================================== */}
      {activeTab === 'individual' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* LEFT SIDE — SELECT STUDENT */}
          <div className="bg-surface rounded-card shadow-card border border-border p-5 space-y-4 h-fit">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base font-semibold text-heading flex items-center gap-2">
                <Icons.Users className="w-5 h-5 text-primary" />
                Select Student
              </h2>
              <span className="badge badge-secondary text-xs">
                {filteredStudents.length} Students
              </span>
            </div>

            {/* Search Box */}
            <div>
              <label className="block text-[11px] font-semibold text-heading uppercase mb-1">Search</label>
              <div className="relative">
                <Icons.Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name or roll number..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="form-input w-full pl-9 text-xs"
                />
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-semibold text-heading uppercase mb-1">Semester</label>
                <select
                  value={filterSemester}
                  onChange={e => setFilterSemester(e.target.value)}
                  className="form-input w-full text-xs"
                >
                  <option value="">All Semesters</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                    <option key={s} value={s}>Semester {s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-heading uppercase mb-1">Division</label>
                <select
                  value={filterDivision}
                  onChange={e => setFilterDivision(e.target.value)}
                  className="form-input w-full text-xs"
                >
                  <option value="">All Divisions</option>
                  {['A', 'B', 'C'].map(d => (
                    <option key={d} value={d}>Division {d}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Compact Selectable Student List */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs text-muted font-medium px-1">
                <span>Students ({filteredStudents.length})</span>
                {(searchQuery || filterSemester || filterDivision) && (
                  <button
                    type="button"
                    onClick={() => { setSearchQuery(''); setFilterSemester(''); setFilterDivision(''); }}
                    className="text-primary hover:underline text-[11px] font-semibold"
                  >
                    Clear Filters
                  </button>
                )}
              </div>

              {loading ? (
                <div className="p-6 text-center text-xs text-muted flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  Loading students...
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted bg-slate-50 rounded-xl border border-border">
                  No matching students found.
                </div>
              ) : (
                <div className="max-h-[460px] overflow-y-auto space-y-1.5 pr-1">
                  {filteredStudents.map(st => {
                    const isSelected = selectedStudent?._id === st._id;
                    const roll = st.enrollmentNumber || st.studentId || 'ID N/A';
                    return (
                      <button
                        key={st._id}
                        type="button"
                        onClick={() => setSelectedStudentId(st._id)}
                        className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-center gap-3 ${
                          isSelected
                            ? 'bg-blue-50/80 border-blue-500 shadow-sm ring-1 ring-blue-500/20'
                            : 'bg-white hover:bg-slate-50 border-border hover:border-slate-300'
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-full font-bold text-xs flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-primary text-white shadow-sm'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {getInitials(st.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-xs text-heading truncate">
                            {st.name}
                          </div>
                          <div className="font-mono text-[11px] text-primary font-medium truncate">
                            {roll}
                          </div>
                          <div className="text-[10px] text-muted">
                            Semester {st.currentSemester || 1} • Division {st.division || 'A'}
                          </div>
                        </div>
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-primary shrink-0 mr-1" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT SIDE — STUDENT ENROLLMENTS */}
          <div className="lg:col-span-2 space-y-6">

            {enrollmentError && (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-card text-xs text-amber-800 flex items-center justify-between">
                <span>{enrollmentError}</span>
                <button 
                  onClick={() => selectedStudent?._id && fetchStudentEnrollments(selectedStudent._id)} 
                  className="font-semibold underline hover:text-amber-900 ml-4"
                >
                  Retry
                </button>
              </div>
            )}

            {!selectedStudent ? (
              <div className="bg-surface rounded-card shadow-card border border-border p-12 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-blue-50 text-primary mx-auto flex items-center justify-center">
                  <Icons.Users className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-heading">Select a student to view their courses.</h3>
                <p className="text-xs text-muted max-w-sm mx-auto">
                  Choose a student from the list on the left to inspect their active course enrollments and history.
                </p>
              </div>
            ) : (
              <>
                {/* Selected Student Summary Card */}
                <div className="bg-surface rounded-card shadow-card border border-border p-4 flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full bg-primary text-white font-bold text-sm flex items-center justify-center shrink-0 shadow-sm">
                      {getInitials(selectedStudent.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-heading">{selectedStudent.name}</h2>
                        <span className="badge badge-success text-[10px] font-bold">Active Student</span>
                      </div>
                      <div className="font-mono text-xs font-semibold text-primary mt-0.5">
                        {enrollmentNo}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-border">
                      <span className="text-muted">Semester: </span>
                      <span className="font-semibold text-heading">{currentSem}</span>
                    </div>
                    <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-border">
                      <span className="text-muted">Division: </span>
                      <span className="font-semibold text-heading">{selectedStudent.division || 'A'}</span>
                    </div>
                    <div className="px-3 py-1.5 bg-slate-50 rounded-lg border border-border">
                      <span className="text-muted">Department: </span>
                      <span className="font-medium text-heading truncate max-w-[160px] inline-block align-bottom">{deptName}</span>
                    </div>
                  </div>
                </div>

                {/* CURRENT COURSES */}
                <div className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-heading">Current Courses</h2>
                      <span className="badge badge-info text-xs font-bold">
                        {activeEnrollments.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setShowEnrollModal(true);
                        setSelectedCourseIds([]);
                        setCourseSearch('');
                      }}
                      className="btn-primary text-xs font-semibold px-3.5 py-1.5 rounded-btn flex items-center gap-1.5 self-start sm:self-auto"
                    >
                      <Icons.Plus className="w-3.5 h-3.5" />
                      Enroll in Course
                    </button>
                  </div>

                  {loadingEnrollments ? (
                    <div className="p-8 text-center text-xs text-muted flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      Loading current courses...
                    </div>
                  ) : activeEnrollments.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted bg-slate-50 rounded-xl border border-dashed border-border">
                      No current courses.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-muted uppercase font-semibold border-b border-border">
                          <tr>
                            <th className="py-3 px-3">Course</th>
                            <th className="py-3 px-3">Course Code</th>
                            <th className="py-3 px-3 text-center">Semester</th>
                            <th className="py-3 px-3 text-center">Division</th>
                            <th className="py-3 px-3 text-center">Academic Term</th>
                            <th className="py-3 px-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {activeEnrollments.map(enr => (
                            <tr key={enr._id} className="hover:bg-slate-50/60 transition">
                              <td className="py-3 px-3 font-semibold text-heading">
                                <div>{enr.course?.name || 'Untitled Course'}</div>
                                {enr.course?.professor?.name && (
                                  <div className="text-[11px] text-muted font-normal">
                                    Prof. {enr.course.professor.name}
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 font-mono font-bold text-primary">
                                {enr.course?.code || 'N/A'}
                              </td>
                              <td className="py-3 px-3 text-center font-semibold text-slate-700">
                                {enr.course?.semester ? `Sem ${enr.course.semester}` : 'N/A'}
                              </td>
                              <td className="py-3 px-3 text-center font-bold text-slate-800">
                                {enr.division ? `Div ${enr.division}` : `Div ${selectedStudent?.division || 'A'}`}
                              </td>
                              <td className="py-3 px-3 text-center text-slate-600 font-mono text-[11px]">
                                {enr.academicTerm || 'CURRENT'}
                              </td>
                              <td className="py-3 px-3 text-center">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                                  ACTIVE
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* ENROLLMENT HISTORY */}
                <div className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <Icons.Calendar className="w-4 h-4 text-slate-500" />
                      <h2 className="text-base font-bold text-heading">Enrollment History</h2>
                      <span className="badge badge-secondary text-xs">
                        {historyEnrollments.length}
                      </span>
                    </div>
                  </div>

                  {loadingEnrollments ? (
                    <div className="p-6 text-center text-xs text-muted flex items-center justify-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                      Loading enrollment history...
                    </div>
                  ) : historyEnrollments.length === 0 ? (
                    <div className="p-8 text-center text-xs text-muted bg-slate-50 rounded-xl border border-dashed border-border">
                      No enrollment history yet.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {historySemestersList.map(semKey => {
                        const semRecords = historyBySemester[semKey] || [];
                        return (
                          <div key={semKey} className="border border-border rounded-xl p-4 bg-white space-y-3">
                            <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                              <span className="font-bold text-xs text-heading flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                {semKey}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                                {semRecords.length} Course{semRecords.length !== 1 ? 's' : ''}
                              </span>
                            </div>

                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-semibold">
                                  <tr>
                                    <th className="py-2 px-3">Course</th>
                                    <th className="py-2 px-3">Course Code</th>
                                    <th className="py-2 px-3 text-center">Division</th>
                                    <th className="py-2 px-3 text-center">Academic Term</th>
                                    <th className="py-2 px-3 text-center">Status</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {semRecords.map(enr => (
                                    <tr key={enr._id}>
                                      <td className="py-2 px-3 font-medium text-slate-800">
                                        {enr.course?.name || 'Untitled Course'}
                                      </td>
                                      <td className="py-2 px-3 font-mono font-semibold text-slate-700">
                                        {enr.course?.code || 'N/A'}
                                      </td>
                                      <td className="py-2 px-3 text-center text-slate-600 font-semibold">
                                        {enr.division ? `Div ${enr.division}` : 'N/A'}
                                      </td>
                                      <td className="py-2 px-3 text-center text-slate-600 font-mono text-[11px]">
                                        {enr.academicTerm || 'N/A'}
                                      </td>
                                      <td className="py-2 px-3 text-center">
                                        {enr.status === 'completed' ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                                            COMPLETED
                                          </span>
                                        ) : enr.status === 'dropped' ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
                                            DROPPED
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 uppercase">
                                            {enr.status?.toUpperCase() || 'UNKNOWN'}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* BULK ENROLLMENT MODE (200+ STUDENTS)      */}
      {/* ========================================== */}
      {activeTab === 'bulk' && (
        <div className="space-y-6">
          {/* Top Control Panel */}
          <div className="bg-surface rounded-card shadow-card border border-border p-5 space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-4">
              <div>
                <h2 className="text-base font-bold text-heading flex items-center gap-2">
                  <Icons.Users className="w-5 h-5 text-primary" />
                  Bulk Course Enrollment Workspace
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Enroll 200+ cohort students into target semester courses in a single validated batch operation.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-slate-50 p-1.5 border border-border rounded-xl">
                <span className="text-xs font-semibold text-slate-500 pl-2">Target Semester:</span>
                <select
                  value={bulkSemester}
                  onChange={e => setBulkSemester(e.target.value)}
                  className="form-input text-xs font-bold py-1 px-3 cursor-pointer"
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                    <option key={s} value={s}>Semester {s}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 2-Column Selection Grid: Left = Target Courses; Right = Target Cohort Students */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Target Courses Selection Column */}
              <div className="space-y-3 bg-slate-50/60 p-4 rounded-xl border border-border">
                <div className="flex justify-between items-center">
                  <h3 className="text-xs font-bold text-heading uppercase tracking-wide">
                    1. Select Semester {bulkSemester} Courses ({bulkAvailableCourses.length})
                  </h3>
                  <span className="badge badge-info text-[11px] font-bold">
                    {selectedBulkCourseIds.length} Selected
                  </span>
                </div>

                {loadingCourses ? (
                  <div className="p-8 text-center text-xs text-muted flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    Loading courses...
                  </div>
                ) : bulkAvailableCourses.length === 0 ? (
                  <div className="p-6 text-center text-xs text-muted bg-white rounded-xl border border-dashed border-border">
                    No active courses found for Semester {bulkSemester}.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                    {bulkAvailableCourses.map(c => {
                      const isChecked = selectedBulkCourseIds.includes(c._id);
                      return (
                        <div
                          key={c._id}
                          onClick={() => toggleBulkCourseSelection(c._id)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center gap-3 ${
                            isChecked
                              ? 'bg-blue-50/90 border-blue-500 ring-1 ring-blue-500/20'
                              : 'bg-white hover:bg-slate-50 border-border'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleBulkCourseSelection(c._id)}
                            className="rounded text-primary focus:ring-primary accent-primary h-4 w-4 cursor-pointer"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="font-semibold text-xs text-heading truncate">{c.name}</div>
                            <div className="font-mono text-[11px] text-primary font-bold">{c.code}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Target Students Selection Column (2 Cols wide on desktop) */}
              <div className="lg:col-span-2 space-y-3 bg-slate-50/60 p-4 rounded-xl border border-border">
                <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                  <div>
                    <h3 className="text-xs font-bold text-heading uppercase tracking-wide">
                      2. Select Eligible Semester {bulkSemester} Students ({bulkCohortStudents.length})
                    </h3>
                    <p className="text-[11px] text-muted">Selections persist across page navigation.</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={selectAllBulkCohortStudents}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-border rounded-lg transition"
                    >
                      {selectedBulkStudentIds.size === bulkCohortStudents.length && bulkCohortStudents.length > 0
                        ? 'Clear All'
                        : `Select All (${bulkCohortStudents.length})`}
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenBulkPreview}
                      disabled={selectedBulkCourseIds.length === 0 || selectedBulkStudentIds.size === 0}
                      className="btn-primary px-4 py-1.5 rounded-btn text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
                    >
                      <Icons.UserCheck className="w-4 h-4" />
                      Preview Bulk Enrollment ({selectedBulkStudentIds.size})
                    </button>
                  </div>
                </div>

                {/* Search & Filter */}
                <div className="relative">
                  <Icons.Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search cohort students by name or roll number..."
                    value={bulkSearchQuery}
                    onChange={e => setBulkSearchQuery(e.target.value)}
                    className="form-input w-full pl-9 text-xs bg-white"
                  />
                </div>

                {/* Paginated Cohort Table */}
                {loading ? (
                  <div className="p-8 text-center text-xs text-muted flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    Loading cohort students...
                  </div>
                ) : bulkCohortStudents.length === 0 ? (
                  <div className="p-8 text-center text-xs text-muted bg-white rounded-xl border border-dashed border-border">
                    No active students found in Semester {bulkSemester}.
                  </div>
                ) : (
                  <>
                    <div className="border border-border rounded-xl overflow-hidden bg-white">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-muted uppercase font-semibold border-b border-border">
                          <tr>
                            <th className="py-2.5 px-3 w-10 text-center">
                              <input
                                type="checkbox"
                                checked={selectedBulkStudentIds.size === bulkCohortStudents.length && bulkCohortStudents.length > 0}
                                onChange={selectAllBulkCohortStudents}
                                className="rounded text-primary focus:ring-primary accent-primary h-4 w-4 cursor-pointer"
                              />
                            </th>
                            <th className="py-2.5 px-3">Permanent Roll No.</th>
                            <th className="py-2.5 px-3">Student Name</th>
                            <th className="py-2.5 px-3 text-center">Semester</th>
                            <th className="py-2.5 px-3 text-center">Division</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {paginatedBulkStudents.map(st => {
                            const isChecked = selectedBulkStudentIds.has(st._id);
                            return (
                              <tr key={st._id} className={isChecked ? 'bg-blue-50/70' : 'hover:bg-slate-50/50'}>
                                <td className="py-2.5 px-3 text-center">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleBulkStudentSelection(st._id)}
                                    className="rounded text-primary focus:ring-primary accent-primary h-4 w-4 cursor-pointer"
                                  />
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold text-primary">
                                  {st.enrollmentNumber || st.studentId || 'N/A'}
                                </td>
                                <td className="py-2.5 px-3 font-semibold text-heading">
                                  {st.name}
                                </td>
                                <td className="py-2.5 px-3 text-center font-medium text-slate-700">
                                  Sem {st.currentSemester || bulkSemester}
                                </td>
                                <td className="py-2.5 px-3 text-center">
                                  <span className="badge badge-info text-[10px]">
                                    Div {st.division || 'A'}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination Controls */}
                    <div className="pt-2 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <span>Showing {((bulkCurrentPage - 1) * bulkPageSize) + 1} to {Math.min(bulkCurrentPage * bulkPageSize, bulkCohortStudents.length)} of {bulkCohortStudents.length} students</span>
                        <select
                          value={bulkPageSize}
                          onChange={e => { setBulkPageSize(Number(e.target.value)); setBulkCurrentPage(1); }}
                          className="form-input text-xs py-1 px-2 font-medium bg-white"
                        >
                          <option value={25}>25 per page</option>
                          <option value={50}>50 per page</option>
                          <option value={100}>100 per page</option>
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setBulkCurrentPage(p => Math.max(1, p - 1))}
                          disabled={bulkCurrentPage === 1}
                          className="px-2.5 py-1 border border-border rounded-btn font-medium hover:bg-white disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <span className="px-2 font-semibold">Page {bulkCurrentPage} of {bulkTotalPages}</span>
                        <button
                          type="button"
                          onClick={() => setBulkCurrentPage(p => Math.min(bulkTotalPages, p + 1))}
                          disabled={bulkCurrentPage === bulkTotalPages}
                          className="px-2.5 py-1 border border-border rounded-btn font-medium hover:bg-white disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* INDIVIDUAL ENROLL MODAL                    */}
      {/* ========================================== */}
      {showEnrollModal && selectedStudent && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#0f172a]/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl border border-border w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-slate-50/70">
              <div>
                <h2 className="text-lg font-bold text-heading">Enroll in Course</h2>
                <p className="text-xs text-muted">
                  Select one or more available Semester {currentSem} courses for the student.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowEnrollModal(false); setSelectedCourseIds([]); }}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60 transition"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            {/* Selected Student Summary */}
            <div className="mx-6 mt-4 p-3.5 bg-blue-50/70 border border-blue-100 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {getInitials(selectedStudent?.name)}
                </div>
                <div>
                  <div className="font-bold text-heading text-sm">{selectedStudent?.name}</div>
                  <div className="font-mono text-[11px] text-primary">{enrollmentNo}</div>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-slate-600 text-xs">
                <span>Semester: <strong className="text-heading font-semibold">{currentSem}</strong></span>
                <span>•</span>
                <span>Division: <strong className="text-heading font-semibold">{selectedStudent?.division || 'A'}</strong></span>
                <span>•</span>
                <span className="truncate max-w-[160px]">{deptName}</span>
              </div>
            </div>

            {/* Modal Body / Available Courses */}
            <div className="p-6 space-y-3 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-heading uppercase tracking-wide">
                    Available Semester {currentSem} Courses
                  </h3>
                  <span className="badge badge-info text-[11px] font-bold">
                    Sem {currentSem}
                  </span>
                </div>
                <span className="text-[11px] text-muted">
                  {filteredAvailableCourses.length} course{filteredAvailableCourses.length !== 1 ? 's' : ''} available
                </span>
              </div>

              {/* Course Search Box */}
              <div className="relative">
                <Icons.Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by course name or code..."
                  value={courseSearch}
                  onChange={e => setCourseSearch(e.target.value)}
                  className="form-input w-full pl-9 text-xs"
                />
              </div>

              {/* Selectable Course Table */}
              {loadingCourses ? (
                <div className="p-8 text-center text-xs text-muted flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                  Loading courses...
                </div>
              ) : filteredAvailableCourses.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted bg-slate-50 rounded-xl border border-border">
                  No courses found for Semester {currentSem}.
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-muted uppercase font-semibold border-b border-border sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={isAllSelected}
                            disabled={selectableCourses.length === 0}
                            onChange={toggleSelectAll}
                            className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                            title={isAllSelected ? "Deselect All" : "Select All"}
                          />
                        </th>
                        <th className="py-2.5 px-3">Course Name</th>
                        <th className="py-2.5 px-3">Course Code</th>
                        <th className="py-2.5 px-3 text-center">Semester</th>
                        <th className="py-2.5 px-3">Professor</th>
                        <th className="py-2.5 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-white">
                      {filteredAvailableCourses.map(course => {
                        const isAlreadyEnrolled = activeEnrolledCourseIds.has(String(course._id));
                        const isSelected = selectedCourseIds.includes(course._id);
                        return (
                          <tr
                            key={course._id}
                            onClick={() => {
                              if (!isAlreadyEnrolled) {
                                toggleCourseSelection(course._id);
                              }
                            }}
                            className={`transition ${
                              isAlreadyEnrolled
                                ? 'opacity-60 bg-slate-50/50 cursor-not-allowed'
                                : isSelected
                                ? 'bg-blue-50/90 font-medium'
                                : 'hover:bg-slate-50 cursor-pointer'
                            }`}
                          >
                            <td className="py-2.5 px-3 text-center" onClick={e => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isAlreadyEnrolled}
                                onChange={() => toggleCourseSelection(course._id)}
                                className="rounded border-slate-300 text-primary focus:ring-primary h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                              />
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-heading">
                              {course.name}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-primary">
                              {course.code}
                            </td>
                            <td className="py-2.5 px-3 text-center font-medium text-slate-700">
                              Sem {course.semester || currentSem}
                            </td>
                            <td className="py-2.5 px-3 text-muted">
                              {course.professor?.name || 'TBA'}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              {isAlreadyEnrolled ? (
                                <span className="badge badge-success text-[10px] font-bold">
                                  Already Enrolled
                                </span>
                              ) : isSelected ? (
                                <span className="badge badge-primary text-[10px] font-bold">
                                  Selected
                                </span>
                              ) : (
                                <span className="badge badge-info text-[10px] font-bold">
                                  Available
                                </span>
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

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-border bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => { setShowEnrollModal(false); setSelectedCourseIds([]); }}
                className="btn-secondary text-xs px-4 py-2"
                disabled={isSubmittingEnroll}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEnrollSubmit}
                disabled={selectedCourseIds.length === 0 || isSubmittingEnroll}
                className="btn-primary text-xs font-semibold px-4 py-2 rounded-btn flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmittingEnroll ? (
                  <>
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                    Enrolling Courses...
                  </>
                ) : (
                  <>
                    <Icons.Check className="w-4 h-4" />
                    {selectedCourseIds.length <= 1
                      ? `Enroll Student (${selectedCourseIds.length})`
                      : `Enroll ${selectedCourseIds.length} Courses`}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================== */}
      {/* BULK ENROLLMENT PREVIEW MODAL              */}
      {/* ========================================== */}
      {showBulkPreviewModal && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#0f172a]/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl border border-border max-w-xl w-full p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5 text-slate-900">
                <Icons.UserCheck className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg">Bulk Course Enrollment Preview</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkPreviewModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {validatingBulk ? (
              <div className="py-8 text-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-xs text-muted font-medium">Validating bulk enrollment batch...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Validation Status Banner */}
                {bulkValidationResult?.valid ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-xs">
                    <Icons.CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div>
                      <p className="font-bold">Validation Passed: Batch Ready for Execution</p>
                      <p className="text-emerald-700">All student roles, department bounds, and semester matches verified cleanly.</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1 text-rose-900 text-xs">
                    <div className="flex items-center gap-2 font-bold text-rose-700">
                      <Icons.AlertCircle className="w-4 h-4 flex-shrink-0" />
                      Validation Warnings / Errors Detected
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-rose-700 pl-1 max-h-28 overflow-y-auto">
                      {bulkValidationResult?.errors?.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Summary Metrics Grid */}
                {bulkValidationResult?.summary && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-border text-center text-xs">
                    <div className="p-2 bg-white rounded-lg border border-border">
                      <span className="text-slate-500 block">Selected Students</span>
                      <strong className="text-slate-900 text-sm">{bulkValidationResult.summary.totalStudents}</strong>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-border">
                      <span className="text-slate-500 block">Target Courses</span>
                      <strong className="text-slate-900 text-sm">{bulkValidationResult.summary.totalCourses}</strong>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-border">
                      <span className="text-slate-500 block">To Create</span>
                      <strong className="text-emerald-600 text-sm">{bulkValidationResult.summary.enrollmentsToCreate}</strong>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-border">
                      <span className="text-slate-500 block">Already Enrolled</span>
                      <strong className="text-amber-600 text-sm">{bulkValidationResult.summary.alreadyEnrolledCount}</strong>
                    </div>
                  </div>
                )}

                {/* Target Courses List */}
                {bulkValidationResult?.summary?.courses?.length > 0 && (
                  <div className="p-3 bg-white rounded-xl border border-border space-y-2 text-xs">
                    <h4 className="font-bold text-slate-800 uppercase tracking-wide text-[11px]">
                      Selected Courses ({bulkValidationResult.summary.courses.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {bulkValidationResult.summary.courses.map(c => (
                        <span key={c._id} className="badge badge-neutral text-xs">
                          {c.code}: {c.name} (Sem {c.semester})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <button
                type="button"
                onClick={() => setShowBulkPreviewModal(false)}
                className="px-4 py-2 border border-border rounded-btn text-xs font-semibold hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkEnrollment}
                disabled={!bulkValidationResult?.valid || isExecutingBulk || validatingBulk}
                className="btn-primary px-5 py-2 rounded-btn text-xs font-semibold disabled:opacity-50"
              >
                {isExecutingBulk ? 'Executing Bulk Enrollment...' : 'Confirm & Execute Enrollment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
