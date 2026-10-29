import { useState, useEffect } from 'react';
import { coursesAPI, analyticsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import ResourceManagement from '../../components/shared/ResourceManagement';

export default function ProfessorAnalytics() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState('1');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [courseAnalytics, setCourseAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { 
    fetchCourses(); 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id, user?.id]);

  useEffect(() => {
    if (selectedCourse) {
      fetchCourseAnalytics();
    } else {
      setCourseAnalytics(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourse, selectedSemester]);

  const fetchCourses = async () => {
    setLoading(true);
    try {
      const userIdStr = (user?._id || user?.id)?.toString();
      const userCourseIds = (user?.courses || []).map(c => (c._id || c)?.toString());

      const res = await coursesAPI.getAll({ limit: 100 });
      const apiCourses = res.data?.data || res.data || [];
      const assigned = apiCourses.filter(c => {
        const profId = (c.professor?._id || c.professor)?.toString();
        if (profId && profId === userIdStr) return true;
        return userCourseIds.includes((c._id || c)?.toString());
      });

      setCourses(assigned);

      if (assigned.length > 0) {
        const forSem = assigned.filter(c => String(c.semester || '') === String(selectedSemester));
        if (forSem.length > 0) {
          setSelectedCourse(forSem[0]._id);
        } else {
          const firstSem = String(assigned[0].semester || '1');
          setSelectedSemester(firstSem);
          setSelectedCourse(assigned[0]._id);
        }
      }
    } catch (err) {
      toast.error('Failed to load courses');
    } finally {
      setLoading(false);
    }
  };

  const handleSemesterChange = (newSem) => {
    setSelectedSemester(newSem);
    const validCourses = courses.filter(c => String(c.semester || '') === String(newSem));
    if (validCourses.length > 0) {
      setSelectedCourse(validCourses[0]._id);
    } else {
      setSelectedCourse('');
      setCourseAnalytics(null);
    }
  };

  const fetchCourseAnalytics = async () => {
    if (!selectedCourse) return;
    try {
      const res = await analyticsAPI.getCourse(selectedCourse, { semester: selectedSemester });
      setCourseAnalytics(res.data?.data || res.data || null);
    } catch (err) {
      setCourseAnalytics(null);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  const totalStudents = courseAnalytics?.totalStudents || 0;
  const avgAttendance = courseAnalytics?.avgAttendance;
  const avgAttendanceDisplay = (avgAttendance !== null && avgAttendance !== undefined && !isNaN(avgAttendance))
    ? `${Math.round(avgAttendance)}%`
    : 'N/A';

  const avgQuiz = courseAnalytics?.avgQuizScore ?? courseAnalytics?.avgScore;
  const avgQuizDisplay = (avgQuiz !== null && avgQuiz !== undefined && !isNaN(avgQuiz))
    ? `${Math.round(avgQuiz)}%`
    : 'N/A';

  const totalLectures = courseAnalytics?.totalLectures ?? courseAnalytics?.lectureCount ?? 0;
  const quizList = courseAnalytics?.quizPerformance || courseAnalytics?.quizBreakdown || [];
  const attTrend = courseAnalytics?.attendanceTrend || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Analytics</h1>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="w-full sm:w-auto">
          <label className="block text-sm font-medium mb-2">Semester</label>
          <select value={selectedSemester} onChange={e => handleSemesterChange(e.target.value)} className="form-input w-full sm:w-48">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={String(s)}>Semester {s}</option>)}
          </select>
        </div>
        <div className="w-full sm:w-auto">
          <label className="block text-sm font-medium mb-2">Course</label>
          <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)} className="form-input w-full sm:w-48">
            <option value="">Select a course</option>
            {courses.filter(c => String(c.semester || '') === String(selectedSemester)).map(c => (
              <option key={c._id} value={c._id}>{c.name} {c.code ? `(${c.code})` : ''}</option>
            ))}
          </select>
          {courses.filter(c => String(c.semester || '') === String(selectedSemester)).length === 0 && (
            <p className="text-xs text-amber-600 mt-1">No courses for Semester {selectedSemester}</p>
          )}
        </div>
      </div>

      {!courseAnalytics ? (
        <div className="text-center py-12 bg-surface rounded-card border border-border">
          <p className="text-muted">Select a course to view analytics</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-1 min-[360px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5">
              <p className="text-sm text-muted">Total Students</p>
              <p className="text-2xl font-bold text-heading mt-1">{totalStudents}</p>
            </div>
            <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5">
              <p className="text-sm text-muted">Avg Attendance</p>
              <p className="text-2xl font-bold text-heading mt-1">{avgAttendanceDisplay}</p>
            </div>
            <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5">
              <p className="text-sm text-muted">Avg Quiz Score</p>
              <p className="text-2xl font-bold text-heading mt-1">{avgQuizDisplay}</p>
            </div>
            <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5">
              <p className="text-sm text-muted">Lectures</p>
              <p className="text-2xl font-bold text-heading mt-1">{totalLectures}</p>
            </div>
          </div>

          {/* Quiz Performance */}
          {quizList.length > 0 && (
            <div className="bg-surface rounded-card shadow-card border border-border">
              <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-heading">Quiz Performance</h2>
              </div>
              <div className="p-4 space-y-3">
                {quizList.map((qp, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 border border-border rounded-lg gap-2">
                    <div className="min-w-0 pr-2">
                      <p className="font-medium text-heading truncate">{qp.title || qp.quizTitle || qp.quiz?.title || `Quiz ${idx+1}`}</p>
                      <p className="text-xs text-muted">{qp.attempts ?? qp.totalAttempts ?? 0} attempts</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-blue-600">{Math.round(qp.avgScore || 0)}%</p>
                      <p className="text-xs text-muted">avg score</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Attendance Trend */}
          {attTrend.length > 0 && (
            <div className="bg-surface rounded-card shadow-card border border-border">
              <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-heading">Attendance Trend</h2>
              </div>
              <div className="p-4 overflow-x-auto">
                <div className="flex items-end gap-1 h-32 min-w-[280px]">
                  {attTrend.map((at, idx) => (
                    <div key={idx} className="flex-1 flex flex-col items-center">
                      <div className="w-full bg-blue-500 rounded-t" style={{ height: `${at.percentage || 0}%` }}></div>
                      <span className="text-xs text-muted mt-1 truncate w-full text-center">{at.date ? new Date(at.date).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : idx+1}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <ResourceManagement role="professor" />
    </div>
  );
}
