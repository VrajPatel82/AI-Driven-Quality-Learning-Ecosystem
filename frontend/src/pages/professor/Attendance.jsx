import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { attendanceAPI, coursesAPI, exportAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function ProfAttendance() {
  const { user } = useAuth();
  
  // Scoping & Selection State
  const [courses, setCourses] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState('1');
  const [lectureType, setLectureType] = useState('NORMAL'); // 'NORMAL' | 'PROXY'
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  
  // Navigation & View Tabs
  const [activeTab, setActiveTab] = useState('mark'); // 'mark' | 'history' | 'summary' | 'low_attendance'

  // Mark Attendance Form State
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);
  const [startTime, setStartTime] = useState('');
  const [topic, setTopic] = useState('');
  const [sessionStatus, setSessionStatus] = useState('CONDUCTED');
  const [eligibleStudents, setEligibleStudents] = useState([]);
  const [eligibleStudentsError, setEligibleStudentsError] = useState('');
  const [records, setRecords] = useState({}); // { [studentId]: 'PRESENT' | 'ABSENT' }
  const [isAuthorized, setIsAuthorized] = useState(true);

  // History & Summary Data States
  const [historySessions, setHistorySessions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('ALL'); // 'ALL' | 'REGULAR' | 'SUBSTITUTE'
  
  const [courseSummary, setCourseSummary] = useState(null);
  const [lowAttendanceList, setLowAttendanceList] = useState([]);
  const [lowAttendanceThreshold, setLowAttendanceThreshold] = useState(75);

  // Modal State for View / Edit Session
  const [sessionModal, setSessionModal] = useState(null); // { session, records, mode: 'view' | 'edit' }
  const [editTopic, setEditTopic] = useState('');
  const [editStatus, setEditStatus] = useState('CONDUCTED');
  const [editRecords, setEditRecords] = useState({});

  // Loading States
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Lock background scrolling when modal is open
  useEffect(() => {
    if (sessionModal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [sessionModal]);

  // Load Courses for Professor
  useEffect(() => {
    fetchProfCourses();
  }, [user]);

  const isAssignedCourse = (course) => {
    if (!course || !user) return false;
    const userIdStr = (user._id || user.id)?.toString();
    const profId = (course.professor?._id || course.professor)?.toString();
    if (profId && profId === userIdStr) return true;
    const userCourseIds = (user.courses || []).map(c => (c._id || c)?.toString());
    return userCourseIds.includes((course._id || course)?.toString());
  };

  const fetchProfCourses = async () => {
    setLoadingCourses(true);
    try {
      const res = await coursesAPI.getAll({ limit: 100 });
      const apiCourses = res.data?.data || res.data || [];
      const finalCourses = apiCourses.length > 0 ? apiCourses : (user?.courses || []);
      setCourses(finalCourses);
      
      if (finalCourses.length > 0) {
        const firstSem = finalCourses[0].semester ? String(finalCourses[0].semester) : '1';
        setSelectedSemester(firstSem);
        
        // Find assigned courses for normal mode default
        const assignedForSem = finalCourses.filter(c => 
          String(c.semester || '1') === firstSem && isAssignedCourse(c)
        );
        if (assignedForSem.length > 0) {
          setSelectedCourse(assignedForSem[0]._id.toString());
        } else {
          setSelectedCourse(finalCourses[0]._id.toString());
        }
      }
    } catch (err) {
      toast.error('Failed to load courses');
    } finally {
      setLoadingCourses(false);
    }
  };

  // Immediate Stale UI State Reset
  const resetRosterState = () => {
    setEligibleStudents([]);
    setRecords({});
    setEligibleStudentsError('');
    setIsAuthorized(true);
  };

  // Handle Lecture Type Change
  const handleLectureTypeChange = (newType) => {
    setLectureType(newType);
    resetRosterState();

    const validCourses = courses.filter(c => {
      if (selectedSemester && c.semester && String(c.semester) !== String(selectedSemester)) {
        return false;
      }
      if (newType === 'NORMAL') {
        return isAssignedCourse(c);
      }
      return true;
    });

    if (validCourses.length > 0) {
      setSelectedCourse(validCourses[0]._id.toString());
    } else {
      setSelectedCourse('');
    }
  };

  // Handle Semester Change
  const handleSemesterChange = (newSem) => {
    setSelectedSemester(newSem);
    resetRosterState();

    const validCourses = courses.filter(c => {
      if (c.semester && String(c.semester) !== String(newSem)) return false;
      if (lectureType === 'NORMAL') return isAssignedCourse(c);
      return true;
    });

    if (validCourses.length > 0) {
      setSelectedCourse(validCourses[0]._id.toString());
    } else {
      setSelectedCourse('');
    }
  };

  // When Course / Division / Tab / Date / Semester / Mode changes, load appropriate data
  useEffect(() => {
    if (!selectedCourse) {
      resetRosterState();
      return;
    }
    if (activeTab === 'mark') {
      fetchEligibleStudents();
    } else if (activeTab === 'history') {
      fetchHistory(1);
    } else if (activeTab === 'summary') {
      fetchCourseSummary();
    } else if (activeTab === 'low_attendance') {
      fetchLowAttendance();
    }
  }, [selectedCourse, selectedDivision, activeTab, selectedSemester, attendanceDate, lectureType]);

  // 1. Fetch Authoritative Eligible Students via API
  const fetchEligibleStudents = async () => {
    if (!selectedCourse) {
      resetRosterState();
      return;
    }
    
    setLoadingStudents(true);
    resetRosterState();

    try {
      const res = await attendanceAPI.getEligibleStudents({
        course: selectedCourse,
        division: selectedDivision,
        semester: selectedSemester,
        date: attendanceDate,
        lectureType
      });
      const studentList = res.data?.students || [];
      setEligibleStudents(studentList);
      setEligibleStudentsError('');
      setIsAuthorized(true);

      // Default all eligible students to PRESENT
      const initialMap = {};
      studentList.forEach(s => {
        initialMap[s._id] = 'PRESENT';
      });
      setRecords(initialMap);
    } catch (err) {
      if (err.response?.status === 403) {
        setIsAuthorized(false);
        setEligibleStudentsError(err.response?.data?.message || 'Access forbidden for this course.');
        toast.error(err.response?.data?.message || 'Access forbidden for this course.');
      } else {
        setIsAuthorized(true);
        setEligibleStudentsError('Unable to load eligible students.');
        toast.error(err.response?.data?.message || 'Unable to load eligible students.');
      }
      setEligibleStudents([]);
      setRecords({});
    } finally {
      setLoadingStudents(false);
    }
  };

  // 2. Fetch Session History via API
  const fetchHistory = async (page = 1) => {
    if (!selectedCourse) return;
    setLoadingHistory(true);
    try {
      const params = {
        course: selectedCourse,
        division: selectedDivision,
        semester: selectedSemester,
        from: dateRange.from,
        to: dateRange.to,
        page,
        limit: 10
      };
      const res = await attendanceAPI.getHistory(params);
      setHistorySessions(res.data?.data || []);
      setPagination(res.data?.pagination || { page: 1, limit: 10, total: 0, totalPages: 1 });
    } catch (err) {
      toast.error('Failed to load attendance history');
    } finally {
      setLoadingHistory(false);
    }
  };

  // 3. Fetch Course Attendance Summary via API
  const fetchCourseSummary = async () => {
    if (!selectedCourse) return;
    setLoadingSummary(true);
    try {
      const res = await attendanceAPI.getCourseSummary(selectedCourse, {
        division: selectedDivision,
        semester: selectedSemester
      });
      setCourseSummary(res.data || null);
    } catch (err) {
      toast.error('Failed to load course summary');
    } finally {
      setLoadingSummary(false);
    }
  };

  // 4. Fetch Low Attendance Students via API
  const fetchLowAttendance = async () => {
    setLoadingSummary(true);
    try {
      const res = await attendanceAPI.getLowAttendance({
        threshold: 75,
        course: selectedCourse,
        division: selectedDivision,
        semester: selectedSemester
      });
      setLowAttendanceList(res.data?.students || []);
      if (res.data?.threshold) {
        setLowAttendanceThreshold(res.data.threshold);
      }
    } catch (err) {
      toast.error('Failed to load low attendance data');
    } finally {
      setLoadingSummary(false);
    }
  };

  const markAllStatus = (status) => {
    const updated = {};
    eligibleStudents.forEach(s => {
      updated[s._id] = status;
    });
    setRecords(updated);
  };

  // Submit New Attendance Session (POST /api/attendance/sessions)
  const handleSaveAttendance = async () => {
    if (!selectedCourse) return toast.error('Please select a course');
    if (!isAuthorized) return toast.error('Access forbidden: Cannot save attendance for this course');
    if (eligibleStudents.length === 0) return toast.error('No eligible students to mark attendance');

    setSaving(true);
    try {
      const recordPayload = Object.entries(records).map(([student, status]) => ({
        student,
        status: status.toUpperCase()
      }));

      await attendanceAPI.createSession({
        courseId: selectedCourse,
        semester: selectedSemester,
        division: selectedDivision,
        date: attendanceDate,
        startTime,
        topic,
        status: sessionStatus,
        lectureType,
        records: recordPayload
      });

      toast.success('Attendance session saved successfully');
      setTopic('');
      setStartTime('');
      fetchEligibleStudents();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save attendance session');
    } finally {
      setSaving(false);
    }
  };

  // View Session Details Modal
  const openViewSessionModal = async (sessionId) => {
    try {
      const res = await attendanceAPI.getSessionById(sessionId);
      setSessionModal({
        session: res.data?.session,
        records: res.data?.records || [],
        mode: 'view'
      });
    } catch (err) {
      toast.error('Failed to fetch session details');
    }
  };

  // Open Edit Session Modal
  const openEditSessionModal = async (sessionId) => {
    try {
      const res = await attendanceAPI.getSessionById(sessionId);
      const sess = res.data?.session;
      const recs = res.data?.records || [];
      
      const recordMap = {};
      recs.forEach(r => {
        const sId = r.student?._id || r.student;
        recordMap[sId] = r.status;
      });

      setSessionModal({
        session: sess,
        records: recs,
        mode: 'edit'
      });
      setEditTopic(sess?.topic || '');
      setEditStatus(sess?.status || 'CONDUCTED');
      setEditRecords(recordMap);
    } catch (err) {
      toast.error('Failed to open session for editing');
    }
  };

  // Save Session Edit (PUT /api/attendance/sessions/:id)
  const handleSaveEditSession = async () => {
    if (!sessionModal?.session?._id) return;
    setSaving(true);
    try {
      const recordPayload = Object.entries(editRecords).map(([student, status]) => ({
        student,
        status: status.toUpperCase()
      }));

      await attendanceAPI.updateSession(sessionModal.session._id, {
        topic: editTopic,
        status: editStatus,
        records: recordPayload
      });

      toast.success('Session updated successfully');
      setSessionModal(null);
      fetchHistory(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update session');
    } finally {
      setSaving(false);
    }
  };

  // Export Attendance Report Data
  const handleExportReport = async () => {
    setExporting(true);
    try {
      const res = await exportAPI.attendance({
        course: selectedCourse,
        division: selectedDivision,
        from: dateRange.from,
        to: dateRange.to
      });
      const exportData = res.data?.data || [];
      if (exportData.length === 0) {
        toast.error('No attendance records available for export');
        return;
      }
      
      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `attendance_export_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success(`Exported ${exportData.length} records`);
    } catch (err) {
      toast.error('Failed to export attendance data');
    } finally {
      setExporting(false);
    }
  };

  // Filtered Students Search
  const filteredStudents = eligibleStudents.filter(s => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.name?.toLowerCase().includes(q) ||
      s.enrollmentNumber?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q)
    );
  });

  // Filter Courses based on mode & semester
  const filteredCourses = courses.filter(c => {
    if (selectedSemester && c.semester && String(c.semester) !== String(selectedSemester)) {
      return false;
    }
    if (lectureType === 'NORMAL') {
      return isAssignedCourse(c);
    }
    return true;
  });

  const currentCourseObj = courses.find(c => (c._id || c).toString() === selectedCourse);
  const regularProfName = currentCourseObj?.professor?.name || 'Assigned Professor';

  // Filter History Sessions by Type (All / Regular / Substitute)
  const filteredHistorySessions = historySessions.filter(item => {
    const sess = item.session;
    const markerId = (sess.markedBy?._id || sess.markedBy)?.toString();
    const regularProfId = (sess.course?.professor?._id || sess.course?.professor)?.toString();
    const isSubstituteSession = sess.lectureType ? (sess.lectureType === 'PROXY') : (markerId && regularProfId && markerId !== regularProfId);

    if (historyTypeFilter === 'REGULAR') return !isSubstituteSession;
    if (historyTypeFilter === 'SUBSTITUTE') return isSubstituteSession;
    return true;
  });

  if (loadingCourses) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Attendance</h1>
        </div>
        <button
          onClick={handleExportReport}
          disabled={exporting || !selectedCourse}
          className="btn-primary w-full sm:w-auto px-4 py-2.5 sm:py-2 rounded-btn text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
        >
          {exporting ? 'Exporting...' : 'Export Attendance Report'}
        </button>
      </div>

      {/* Global Filter Bar (Strict Order: Semester -> Lecture Type -> Course -> Division -> Search Student) */}
      <div className="bg-surface p-4 rounded-card shadow-card border border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 1. Semester */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase mb-1">
            Semester
          </label>
          <select
            value={selectedSemester}
            onChange={e => handleSemesterChange(e.target.value)}
            className="form-input w-full"
          >
            {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
              <option key={s} value={String(s)}>Semester {s}</option>
            ))}
          </select>
        </div>

        {/* 2. Lecture Type */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase mb-1">
            Lecture Type
          </label>
          <select
            value={lectureType}
            onChange={e => handleLectureTypeChange(e.target.value)}
            className="form-input w-full font-semibold"
          >
            <option value="NORMAL">Normal Lecture</option>
            <option value="PROXY">Proxy / Substitute Lecture</option>
          </select>
        </div>

        {/* 3. Course */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase mb-1">
            Course *
          </label>
          <select
            value={selectedCourse}
            onChange={e => {
              setSelectedCourse(e.target.value);
              resetRosterState();
            }}
            className="form-input w-full"
          >
            {filteredCourses.length === 0 ? (
              <option value="">
                {lectureType === 'NORMAL'
                  ? `No assigned courses for Semester ${selectedSemester}`
                  : `No department courses for Semester ${selectedSemester}`}
              </option>
            ) : (
              filteredCourses.map(c => (
                <option key={c._id} value={c._id}>
                  {c.name} ({c.code}) {lectureType === 'PROXY' && isAssignedCourse(c) ? ' (Own Course)' : ''}
                </option>
              ))
            )}
          </select>
        </div>

        {/* 4. Division / Section */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase mb-1">
            Division / Section
          </label>
          <select
            value={selectedDivision}
            onChange={e => {
              setSelectedDivision(e.target.value);
              resetRosterState();
            }}
            className="form-input w-full"
          >
            <option value="">All Divisions (Unspecified)</option>
            <option value="A">Division A</option>
            <option value="B">Division B</option>
            <option value="C">Division C</option>
            <option value="D">Division D</option>
          </select>
        </div>

        {/* 5. Search Student */}
        <div>
          <label className="block text-xs font-semibold text-muted uppercase mb-1">Search Student</label>
          <input
            type="text"
            placeholder="Search by name / enrollment..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="form-input w-full"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-2 overflow-x-auto no-scrollbar scroll-smooth whitespace-nowrap pb-px">
        <button
          onClick={() => setActiveTab('mark')}
          className={`shrink-0 px-4 py-2.5 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'mark'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-muted hover:text-heading'
          }`}
        >
          Mark Attendance {lectureType === 'PROXY' && '(Proxy Mode)'}
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`shrink-0 px-4 py-2.5 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'history'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-muted hover:text-heading'
          }`}
        >
          Session History
        </button>
        <button
          onClick={() => setActiveTab('summary')}
          className={`shrink-0 px-4 py-2.5 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'summary'
              ? 'border-blue-600 text-blue-600 font-semibold'
              : 'border-transparent text-muted hover:text-heading'
          }`}
        >
          Course Summary
        </button>
        <button
          onClick={() => setActiveTab('low_attendance')}
          className={`shrink-0 px-4 py-2.5 font-medium text-sm border-b-2 transition-colors ${
            activeTab === 'low_attendance'
              ? 'border-red-600 text-red-600 font-semibold'
              : 'border-transparent text-muted hover:text-heading'
          }`}
        >
          Low Attendance (&lt; {lowAttendanceThreshold}%)
        </button>
      </div>

      {/* TAB 1: MARK ATTENDANCE */}
      {activeTab === 'mark' && (
        <div className="space-y-4">
          {/* PROXY MODE BANNER */}
          {lectureType === 'PROXY' && isAuthorized && selectedCourse && (
            <div className="bg-amber-50 border-l-4 border-amber-600 p-4 rounded-card shadow-sm space-y-2 text-amber-950">
              <div className="flex items-center justify-between">
                <div className="font-bold text-sm text-amber-900 tracking-wide uppercase flex items-center gap-2">
                  <span className="px-2.5 py-1 bg-amber-600 text-white rounded text-xs font-extrabold shadow-sm">
                    PROXY / SUBSTITUTE ATTENDANCE
                  </span>
                  <span className="text-xs font-semibold text-amber-800">
                    Department Proxy Mode
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs pt-1">
                <div>
                  <span className="text-amber-700 block font-medium">Regular Professor:</span>
                  <span className="font-bold text-amber-950">{regularProfName}</span>
                </div>
                <div>
                  <span className="text-amber-700 block font-medium">Proxy Professor:</span>
                  <span className="font-bold text-amber-950">{user?.name || 'Logged-in Professor'}</span>
                </div>
                <div>
                  <span className="text-amber-700 block font-medium">Course:</span>
                  <span className="font-bold text-amber-950">{currentCourseObj?.name || 'N/A'} ({currentCourseObj?.code || ''})</span>
                </div>
                <div>
                  <span className="text-amber-700 block font-medium">Date:</span>
                  <span className="font-bold text-amber-950 font-mono">{attendanceDate}</span>
                </div>
                <div>
                  <span className="text-amber-700 block font-medium">Semester:</span>
                  <span className="font-bold text-amber-950">Semester {selectedSemester}</span>
                </div>
                <div>
                  <span className="text-amber-700 block font-medium">Division:</span>
                  <span className="font-bold text-amber-950">{selectedDivision ? `Division ${selectedDivision}` : 'All Divisions'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Session Header Details Inputs */}
          <div className="bg-surface p-4 rounded-card shadow-card border border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">
                Session Date *
              </label>
              <input
                type="date"
                value={attendanceDate}
                onChange={e => {
                  setAttendanceDate(e.target.value);
                  resetRosterState();
                }}
                className="form-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Start Time (Optional)</label>
              <input
                type="text"
                placeholder="e.g. 09:00 AM"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="form-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Topic / Notes (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Chapter 4 Arrays"
                value={topic}
                onChange={e => setTopic(e.target.value)}
                className="form-input w-full"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted uppercase mb-1">Session Status</label>
              <select
                value={sessionStatus}
                onChange={e => setSessionStatus(e.target.value)}
                className="form-input w-full"
              >
                <option value="CONDUCTED">CONDUCTED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
          </div>

          {/* Roster & Actions Table Container */}
          <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-gray-50">
              <div>
                <h2 className="font-bold text-heading">
                  Eligible Enrolled Students ({!isAuthorized ? 0 : filteredStudents.length})
                </h2>
                <p className="text-xs text-muted">Authoritative enrollment list for Division {selectedDivision || 'Unspecified'}</p>
              </div>
              <div className="flex flex-wrap sm:flex-nowrap gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => markAllStatus('PRESENT')}
                  disabled={!isAuthorized || eligibleStudents.length === 0}
                  className="flex-1 sm:flex-initial text-center px-3 py-2 sm:py-1.5 bg-green-50 text-green-700 text-xs font-semibold rounded hover:bg-green-100 disabled:opacity-40 transition-colors"
                >
                  Mark All Present
                </button>
                <button
                  type="button"
                  onClick={() => markAllStatus('ABSENT')}
                  disabled={!isAuthorized || eligibleStudents.length === 0}
                  className="flex-1 sm:flex-initial text-center px-3 py-2 sm:py-1.5 bg-red-50 text-red-700 text-xs font-semibold rounded hover:bg-red-100 disabled:opacity-40 transition-colors"
                >
                  Mark All Absent
                </button>
                <button
                  type="button"
                  onClick={handleSaveAttendance}
                  disabled={saving || !isAuthorized || eligibleStudents.length === 0}
                  className="w-full sm:w-auto text-center btn-primary px-4 py-2 sm:py-1.5 rounded text-xs font-semibold disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Attendance Session'}
                </button>
              </div>
            </div>

            {/* FORBIDDEN ACCESS NOTICE */}
            {!isAuthorized ? (
              <div className="p-10 text-center bg-red-50/90 border border-red-200 space-y-3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 font-bold mb-1">
                  <Icons.Lock className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-red-900">Access Restricted</h3>
                <p className="text-sm text-red-700 max-w-md mx-auto">
                  {eligibleStudentsError || 'You are not authorized to take attendance for this course in the selected mode.'}
                </p>
              </div>
            ) : loadingStudents ? (
              <div className="p-12 text-center text-muted">Loading eligible students...</div>
            ) : filteredStudents.length === 0 ? (
              <div className="p-12 text-center text-muted">
                No eligible enrolled students found for the selected course, semester, and division.
              </div>
            ) : (
              <>
                {/* Desktop Table (Preserved Exactly) */}
                <table className="hidden sm:table w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-border text-xs uppercase font-semibold text-muted">
                    <tr>
                      <th className="px-4 py-3">#</th>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Enrollment No.</th>
                      <th className="px-4 py-3">Division</th>
                      <th className="px-4 py-3 text-center">Attendance Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredStudents.map((student, idx) => {
                      const currentStatus = records[student._id] || 'PRESENT';
                      return (
                        <tr key={student._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm text-muted">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-sm text-heading">{student.name}</div>
                            <div className="text-xs text-muted">{student.email}</div>
                          </td>
                          <td className="px-4 py-3 text-sm font-mono">{student.enrollmentNumber || 'N/A'}</td>
                          <td className="px-4 py-3 text-sm font-semibold">{student.division || 'Unspecified'}</td>
                          <td className="px-4 py-3 text-center">
                            <div className="inline-flex rounded-lg border border-border p-1 bg-gray-100">
                              <button
                                type="button"
                                onClick={() => setRecords(prev => ({ ...prev, [student._id]: 'PRESENT' }))}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                                  currentStatus === 'PRESENT'
                                    ? 'bg-green-600 text-white shadow-sm'
                                    : 'text-gray-600 hover:text-black'
                                }`}
                              >
                                PRESENT
                              </button>
                              <button
                                type="button"
                                onClick={() => setRecords(prev => ({ ...prev, [student._id]: 'ABSENT' }))}
                                className={`px-3 py-1 text-xs font-bold rounded-md transition-colors ${
                                  currentStatus === 'ABSENT'
                                    ? 'bg-red-600 text-white shadow-sm'
                                    : 'text-gray-600 hover:text-black'
                                }`}
                              >
                                ABSENT
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Mobile Student Attendance Cards */}
                <div className="sm:hidden divide-y divide-border">
                  {filteredStudents.map((student) => {
                    const currentStatus = records[student._id] || 'PRESENT';
                    return (
                      <div key={student._id} className="p-4 space-y-3 bg-white">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-sm text-heading break-words">{student.name}</h4>
                            <p className="text-xs text-muted break-all mt-0.5">{student.email}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs">
                              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-medium">
                                {student.enrollmentNumber || 'N/A'}
                              </span>
                              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                                Div: {student.division || 'Unspecified'}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`shrink-0 px-2.5 py-1 text-xs font-bold rounded-full ${
                              currentStatus === 'PRESENT' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {currentStatus}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setRecords(prev => ({ ...prev, [student._id]: 'PRESENT' }))}
                            className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                              currentStatus === 'PRESENT'
                                ? 'bg-green-600 text-white border-green-600 shadow-sm'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            <Icons.Check className="w-3.5 h-3.5" /> PRESENT
                          </button>
                          <button
                            type="button"
                            onClick={() => setRecords(prev => ({ ...prev, [student._id]: 'ABSENT' }))}
                            className={`py-2 px-3 text-xs font-bold rounded-lg border transition-all flex items-center justify-center gap-1.5 ${
                              currentStatus === 'ABSENT'
                                ? 'bg-red-600 text-white border-red-600 shadow-sm'
                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                            }`}
                          >
                            <Icons.X className="w-3.5 h-3.5" /> ABSENT
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SESSION HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          {/* History Filters */}
          <div className="bg-surface p-4 rounded-card shadow-card border border-border flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 items-stretch sm:items-center flex-wrap w-full sm:w-auto">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase text-muted shrink-0">Type:</span>
                <select
                  value={historyTypeFilter}
                  onChange={e => setHistoryTypeFilter(e.target.value)}
                  className="form-input text-xs w-full sm:w-auto"
                >
                  <option value="ALL">All Sessions</option>
                  <option value="REGULAR">Regular Sessions</option>
                  <option value="SUBSTITUTE">Proxy / Substitute Sessions</option>
                </select>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-semibold uppercase text-muted shrink-0">Dates:</span>
                <input
                  type="date"
                  value={dateRange.from}
                  onChange={e => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                  className="form-input text-xs flex-1 sm:flex-initial"
                />
                <span className="text-xs text-muted">to</span>
                <input
                  type="date"
                  value={dateRange.to}
                  onChange={e => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                  className="form-input text-xs flex-1 sm:flex-initial"
                />
                <button
                  onClick={() => fetchHistory(1)}
                  className="btn-primary text-xs px-3 py-1.5 rounded w-full sm:w-auto text-center"
                >
                  Filter
                </button>
              </div>
            </div>
          </div>

          <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
            {loadingHistory ? (
              <div className="p-12 text-center text-muted">Loading session history...</div>
            ) : filteredHistorySessions.length === 0 ? (
              <div className="p-12 text-center text-muted">No attendance sessions found for the selected course and criteria.</div>
            ) : (
              <>
                {/* Desktop Table (Preserved Exactly) */}
                <table className="hidden md:table w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-border text-xs uppercase font-semibold text-muted">
                    <tr>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Time / Topic</th>
                      <th className="px-4 py-3">Division</th>
                      <th className="px-4 py-3">Type / Marker</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-center">Records</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredHistorySessions.map((item) => {
                      const sess = item.session;
                      const recs = item.records || [];
                      const presentCount = recs.filter(r => r.status === 'PRESENT').length;
                      const absentCount = recs.filter(r => r.status === 'ABSENT').length;
                      const isCancelled = sess.status === 'CANCELLED';

                      const markerName = sess.markedBy?.name || 'Professor';
                      const markerId = (sess.markedBy?._id || sess.markedBy)?.toString();
                      const regularProfId = (sess.course?.professor?._id || sess.course?.professor)?.toString();
                      const isSubstitute = sess.lectureType ? (sess.lectureType === 'PROXY') : (markerId && regularProfId && markerId !== regularProfId);

                      return (
                        <tr key={sess._id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-sm font-semibold">
                            {sess.date ? new Date(sess.date).toISOString().split('T')[0] : 'N/A'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="font-semibold text-heading">{sess.topic || 'Regular Lecture'}</div>
                            {sess.startTime && <div className="text-xs text-muted">{sess.startTime}</div>}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold">{sess.division || 'Unspecified'}</td>
                          <td className="px-4 py-3 text-xs">
                            {isSubstitute ? (
                              <div>
                                <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded">
                                  PROXY / SUBSTITUTE
                                </span>
                                <div className="text-[11px] text-muted mt-0.5">By: {markerName}</div>
                              </div>
                            ) : (
                              <div>
                                <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-bold rounded">
                                  NORMAL
                                </span>
                                <div className="text-[11px] text-muted mt-0.5">By: {markerName}</div>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                isCancelled ? 'bg-gray-100 text-gray-700 border border-gray-300' : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {sess.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-xs">
                            <span className="text-green-700 font-semibold">{presentCount} Present</span>
                            <span className="text-muted mx-1">/</span>
                            <span className="text-red-700 font-semibold">{absentCount} Absent</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex gap-2">
                              <button
                                onClick={() => openViewSessionModal(sess._id)}
                                className="px-2.5 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded hover:bg-blue-100"
                              >
                                View
                              </button>
                              <button
                                onClick={() => openEditSessionModal(sess._id)}
                                className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded hover:bg-gray-200"
                              >
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Mobile Session History Cards */}
                <div className="md:hidden divide-y divide-border">
                  {filteredHistorySessions.map((item) => {
                    const sess = item.session;
                    const recs = item.records || [];
                    const presentCount = recs.filter(r => r.status === 'PRESENT').length;
                    const absentCount = recs.filter(r => r.status === 'ABSENT').length;
                    const isCancelled = sess.status === 'CANCELLED';

                    const markerName = sess.markedBy?.name || 'Professor';
                    const markerId = (sess.markedBy?._id || sess.markedBy)?.toString();
                    const regularProfId = (sess.course?.professor?._id || sess.course?.professor)?.toString();
                    const isSubstitute = sess.lectureType ? (sess.lectureType === 'PROXY') : (markerId && regularProfId && markerId !== regularProfId);

                    return (
                      <div key={sess._id} className="p-4 space-y-3 bg-white">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="text-xs font-mono font-bold text-gray-700">
                              {sess.date ? new Date(sess.date).toISOString().split('T')[0] : 'N/A'}
                            </span>
                            <h4 className="font-bold text-sm text-heading mt-0.5">{sess.topic || 'Regular Lecture'}</h4>
                            {sess.startTime && <p className="text-xs text-muted mt-0.5">{sess.startTime}</p>}
                          </div>
                          <span
                            className={`shrink-0 px-2.5 py-1 text-xs font-bold rounded-full ${
                              isCancelled ? 'bg-gray-100 text-gray-700 border border-gray-300' : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {sess.status}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-gray-100">
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-muted block">Division</span>
                            <span className="font-medium text-heading">{sess.division || 'Unspecified'}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-muted block">Type / Marker</span>
                            {isSubstitute ? (
                              <span className="font-semibold text-amber-800">Proxy ({markerName})</span>
                            ) : (
                              <span className="font-semibold text-blue-800">Normal ({markerName})</span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                          <div className="text-xs">
                            <span className="text-green-700 font-bold">{presentCount} Present</span>
                            <span className="text-muted mx-1">/</span>
                            <span className="text-red-700 font-bold">{absentCount} Absent</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openViewSessionModal(sess._id)}
                              className="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded hover:bg-blue-100 transition-colors"
                            >
                              View
                            </button>
                            <button
                              onClick={() => openEditSessionModal(sess._id)}
                              className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded hover:bg-gray-200 transition-colors"
                            >
                              Edit
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
              <div className="p-4 border-t border-border flex flex-col sm:flex-row justify-between items-center bg-gray-50 gap-3">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchHistory(pagination.page - 1)}
                  className="w-full sm:w-auto px-3 py-1.5 text-xs border border-border rounded font-semibold disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-xs text-muted text-center">
                  Page {pagination.page} of {pagination.totalPages} ({pagination.total} total sessions)
                </span>
                <button
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => fetchHistory(pagination.page + 1)}
                  className="w-full sm:w-auto px-3 py-1.5 text-xs border border-border rounded font-semibold disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: COURSE SUMMARY */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          {loadingSummary ? (
            <div className="p-12 text-center text-muted">Loading course summary...</div>
          ) : !courseSummary ? (
            <div className="p-12 text-center text-muted">No course summary available.</div>
          ) : (
            <div className="space-y-4">
              <div className="bg-surface p-4 rounded-card shadow-card border border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-heading break-words">
                    {courseSummary.course?.name} ({courseSummary.course?.code})
                  </h2>
                  <p className="text-xs text-muted mt-0.5">Total Conducted Sessions: {courseSummary.summary?.conducted || 0}</p>
                </div>
                <div className="text-left sm:text-right border-t sm:border-t-0 border-border pt-2 sm:pt-0 w-full sm:w-auto flex sm:block justify-between items-center">
                  <span className="text-2xl font-extrabold text-blue-600 block">
                    {courseSummary.summary?.conducted > 0 && courseSummary.students?.length > 0
                      ? `${(
                          (courseSummary.students.reduce((acc, s) => acc + s.present, 0) /
                            (courseSummary.summary.conducted * courseSummary.students.length)) *
                          100
                        ).toFixed(1)}%`
                      : '0%'}
                  </span>
                  <p className="text-xs text-muted">Overall Course Attendance</p>
                </div>
              </div>

              <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
                {/* Desktop Table (Preserved Exactly) */}
                <table className="hidden md:table w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-border text-xs uppercase font-semibold text-muted">
                    <tr>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Enrollment No.</th>
                      <th className="px-4 py-3">Division</th>
                      <th className="px-4 py-3 text-center">Present</th>
                      <th className="px-4 py-3 text-center">Absent</th>
                      <th className="px-4 py-3 text-center">Conducted</th>
                      <th className="px-4 py-3 text-right">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {courseSummary.students.map(s => {
                      const isLow = s.percentage < lowAttendanceThreshold;
                      return (
                        <tr key={s.studentId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-sm">{s.name}</td>
                          <td className="px-4 py-3 text-sm font-mono">{s.enrollmentNumber || 'N/A'}</td>
                          <td className="px-4 py-3 text-sm">{s.division || 'A'}</td>
                          <td className="px-4 py-3 text-center text-sm text-green-700 font-semibold">{s.present}</td>
                          <td className="px-4 py-3 text-center text-sm text-red-700 font-semibold">{s.absent}</td>
                          <td className="px-4 py-3 text-center text-sm font-semibold">{courseSummary.summary.conducted}</td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                                isLow ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {s.percentage}%
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Mobile Student Summary Cards */}
                <div className="md:hidden divide-y divide-border">
                  {courseSummary.students.map(s => {
                    const isLow = s.percentage < lowAttendanceThreshold;
                    return (
                      <div key={s.studentId} className="p-4 space-y-3 bg-white">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="font-bold text-sm text-heading break-words">{s.name}</h4>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-1">
                              <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-medium">
                                {s.enrollmentNumber || 'N/A'}
                              </span>
                              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                                Div: {s.division || 'A'}
                              </span>
                            </div>
                          </div>
                          <span
                            className={`shrink-0 px-2.5 py-1 text-xs font-bold rounded-full ${
                              isLow ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                            }`}
                          >
                            {s.percentage}%
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 bg-gray-50 p-2.5 rounded-lg border border-border text-center text-xs">
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-muted block">Present</span>
                            <span className="font-bold text-green-700 text-sm">{s.present}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-muted block">Absent</span>
                            <span className="font-bold text-red-700 text-sm">{s.absent}</span>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-semibold text-muted block">Conducted</span>
                            <span className="font-bold text-gray-800 text-sm">{courseSummary.summary.conducted}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: LOW ATTENDANCE */}
      {activeTab === 'low_attendance' && (
        <div className="space-y-4">
          <div className="bg-red-50 p-4 rounded-card border border-red-200 text-red-900 text-xs sm:text-sm break-words leading-relaxed">
            <strong>Low Attendance Alert (&lt; {lowAttendanceThreshold}%):</strong> Listed below are students enrolled in the selected criteria whose overall attendance is below the official threshold.
          </div>

          <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
            {lowAttendanceList.length === 0 ? (
              <div className="p-8 sm:p-12 text-center text-muted">No students currently meet the low-attendance criteria (&lt; {lowAttendanceThreshold}%).</div>
            ) : (
              <>
                {/* Desktop Table (Preserved Exactly) */}
                <table className="hidden md:table w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-border text-xs uppercase font-semibold text-muted">
                    <tr>
                      <th className="px-4 py-3">Student Name</th>
                      <th className="px-4 py-3">Enrollment No.</th>
                      <th className="px-4 py-3">Division</th>
                      <th className="px-4 py-3 text-center">Conducted</th>
                      <th className="px-4 py-3 text-center">Present</th>
                      <th className="px-4 py-3 text-center">Absent</th>
                      <th className="px-4 py-3 text-right">Attendance %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {lowAttendanceList.map(item => (
                      <tr key={item.student.id} className="hover:bg-red-50/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-sm text-red-900">{item.student.name}</td>
                        <td className="px-4 py-3 text-sm font-mono">{item.student.enrollmentNumber || 'N/A'}</td>
                        <td className="px-4 py-3 text-sm">{item.student.division || 'A'}</td>
                        <td className="px-4 py-3 text-center text-sm font-semibold">{item.conducted}</td>
                        <td className="px-4 py-3 text-center text-sm text-green-700 font-semibold">{item.present}</td>
                        <td className="px-4 py-3 text-center text-sm text-red-700 font-semibold">{item.absent}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="px-2.5 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800">
                            {item.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Mobile Low Attendance Cards */}
                <div className="md:hidden divide-y divide-border">
                  {lowAttendanceList.map(item => (
                    <div key={item.student.id} className="p-4 space-y-3 bg-white">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-red-900 break-words">{item.student.name}</h4>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted mt-1">
                            <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-700 font-medium">
                              {item.student.enrollmentNumber || 'N/A'}
                            </span>
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                              Div: {item.student.division || 'A'}
                            </span>
                          </div>
                        </div>
                        <span className="shrink-0 px-2.5 py-1 text-xs font-bold rounded-full bg-red-100 text-red-800">
                          {item.percentage}%
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-red-50/50 p-2.5 rounded-lg border border-red-100 text-center text-xs">
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-muted block">Present</span>
                          <span className="font-bold text-green-700 text-sm">{item.present}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-muted block">Absent</span>
                          <span className="font-bold text-red-700 text-sm">{item.absent}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-muted block">Conducted</span>
                          <span className="font-bold text-gray-800 text-sm">{item.conducted}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* VIEW / EDIT SESSION MODAL */}
      {sessionModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSessionModal(null);
          }}
        >
          <div 
            className="bg-surface rounded-2xl sm:rounded-card shadow-2xl border border-border max-w-2xl w-full max-h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)] sm:max-h-[90vh] flex flex-col overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-center border-b border-border p-4 sm:p-5 bg-gray-50/80 shrink-0">
              <h3 className="text-base sm:text-lg font-bold text-heading">
                {sessionModal.mode === 'view' ? 'Session Details' : 'Edit Attendance Session'}
              </h3>
              <button 
                onClick={() => setSessionModal(null)} 
                className="text-gray-400 hover:text-heading p-1.5 rounded-full hover:bg-gray-100 transition-colors"
                aria-label="Close"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 min-h-0 overscroll-contain p-4 sm:p-6 space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 bg-gray-50 p-3 rounded-lg border border-border text-xs sm:text-sm">
                <div><strong>Course:</strong> {sessionModal.session?.course?.name} ({sessionModal.session?.course?.code})</div>
                <div><strong>Date:</strong> {sessionModal.session?.date ? new Date(sessionModal.session.date).toISOString().split('T')[0] : ''}</div>
                <div><strong>Division:</strong> {sessionModal.session?.division || 'Unspecified'}</div>
                <div><strong>Semester:</strong> Sem {sessionModal.session?.semester}</div>
                {sessionModal.session?.markedBy && (
                  <div className="sm:col-span-2"><strong>Marked By:</strong> {sessionModal.session.markedBy.name || sessionModal.session.markedBy.email}</div>
                )}
              </div>

              {sessionModal.mode === 'view' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs sm:text-sm">
                    <div><strong>Topic:</strong> {sessionModal.session?.topic || 'N/A'}</div>
                    <div><strong>Status:</strong> {sessionModal.session?.status}</div>
                  </div>

                  {/* Desktop Table (Preserved Exactly) */}
                  <table className="hidden sm:table w-full text-left border-collapse border border-border mt-4">
                    <thead className="bg-gray-50 text-xs font-semibold uppercase text-muted border-b border-border">
                      <tr>
                        <th className="p-2">Student Name</th>
                        <th className="p-2">Enrollment No</th>
                        <th className="p-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border text-xs">
                      {sessionModal.records.map(r => (
                        <tr key={r._id}>
                          <td className="p-2 font-semibold">{r.student?.name}</td>
                          <td className="p-2 font-mono">{r.student?.enrollmentNumber || 'N/A'}</td>
                          <td className="p-2 text-center">
                            <span className={`px-2 py-0.5 rounded font-bold ${r.status === 'PRESENT' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Mobile Student List Cards */}
                  <div className="sm:hidden space-y-2 mt-4">
                    {sessionModal.records.map(r => (
                      <div key={r._id} className="p-3 bg-white rounded-lg border border-border flex items-center justify-between gap-2 text-xs">
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-heading break-words">{r.student?.name}</div>
                          <div className="text-[11px] font-mono text-muted">{r.student?.enrollmentNumber || 'N/A'}</div>
                        </div>
                        <span className={`px-2.5 py-1 rounded font-bold text-xs shrink-0 ${r.status === 'PRESENT' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                /* EDIT MODE */
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase mb-1">Topic / Notes</label>
                    <input
                      type="text"
                      value={editTopic}
                      onChange={e => setEditTopic(e.target.value)}
                      className="form-input w-full"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted uppercase mb-1">Session Status</label>
                    <select
                      value={editStatus}
                      onChange={e => setEditStatus(e.target.value)}
                      className="form-input w-full"
                    >
                      <option value="CONDUCTED">CONDUCTED</option>
                      <option value="CANCELLED">CANCELLED</option>
                    </select>
                  </div>

                  <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
                    {/* Desktop Table (Preserved Exactly) */}
                    <table className="hidden sm:table w-full text-left border-collapse text-xs">
                      <thead className="bg-gray-50 uppercase text-muted font-semibold border-b border-border">
                        <tr>
                          <th className="p-2">Student</th>
                          <th className="p-2 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {sessionModal.records.map(r => {
                          const sId = r.student?._id || r.student;
                          const st = editRecords[sId] || r.status;
                          return (
                            <tr key={sId}>
                              <td className="p-2 font-semibold">{r.student?.name || sId}</td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setEditRecords(prev => ({
                                      ...prev,
                                      [sId]: prev[sId] === 'PRESENT' ? 'ABSENT' : 'PRESENT'
                                    }))
                                  }
                                  className={`px-3 py-1 font-bold rounded ${
                                    st === 'PRESENT' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                                  }`}
                                >
                                  {st}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Mobile Student List Cards */}
                    <div className="sm:hidden space-y-2 p-2">
                      {sessionModal.records.map(r => {
                        const sId = r.student?._id || r.student;
                        const st = editRecords[sId] || r.status;
                        return (
                          <div key={sId} className="p-3 bg-white rounded-lg border border-border flex items-center justify-between gap-2 text-xs">
                            <div className="font-semibold text-heading truncate flex-1 pr-2">{r.student?.name || sId}</div>
                            <button
                              type="button"
                              onClick={() =>
                                setEditRecords(prev => ({
                                  ...prev,
                                  [sId]: prev[sId] === 'PRESENT' ? 'ABSENT' : 'PRESENT'
                                }))
                              }
                              className={`px-3.5 py-1.5 font-bold rounded text-xs transition-colors shrink-0 ${
                                st === 'PRESENT' ? 'bg-green-600 text-white shadow-sm' : 'bg-red-600 text-white shadow-sm'
                              }`}
                            >
                              {st}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 border-t border-border p-4 bg-gray-50/80 shrink-0">
              <button 
                onClick={() => setSessionModal(null)} 
                className="w-full sm:w-auto px-4 py-2 border border-border text-xs font-semibold rounded hover:bg-gray-100 transition-colors text-center"
              >
                Close
              </button>
              {sessionModal.mode === 'edit' && (
                <button 
                  onClick={handleSaveEditSession} 
                  disabled={saving} 
                  className="w-full sm:w-auto btn-primary px-4 py-2 text-xs font-semibold rounded disabled:opacity-50 text-center"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
