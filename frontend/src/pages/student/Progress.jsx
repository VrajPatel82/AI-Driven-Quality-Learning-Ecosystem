import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { analyticsAPI, attendanceAPI, coursesAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function StudentProgress() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?._id, user?.id]);

  const fetchProgress = async () => {
    try {
      const studentId = (user?._id || user?.id)?.toString();
      if (!studentId) {
        setLoading(false);
        return;
      }

      const [analyticsRes, coursesRes, attendanceRes] = await Promise.allSettled([
        analyticsAPI.getStudent(studentId),
        coursesAPI.getAll({ limit: 50 }),
        attendanceAPI.getStudentAttendance(studentId, { limit: 100 })
      ]);

      if (analyticsRes.status === 'fulfilled') {
        setAnalytics(analyticsRes.value.data.data || analyticsRes.value.data);
      }
      if (coursesRes.status === 'fulfilled') {
        setCourses(coursesRes.value.data.data || coursesRes.value.data || []);
      }
      if (attendanceRes.status === 'fulfilled') {
        const attData = attendanceRes.value.data;
        const rawAttendance = attData?.records || attData?.data || attData?.attendance || [];
        setAttendance(Array.isArray(rawAttendance) ? rawAttendance : []);
      }
    } catch (err) {
      toast.error('Failed to load progress data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const quizStats = analytics?.quizzes || {
    totalAttempted: analytics?.totalQuizzes || 0,
    averageScore: analytics?.avgScore
  };
  const assignmentStats = analytics?.assignments || {
    totalSubmitted: analytics?.totalAssignments || 0
  };

  const totalAttemptedQuizzes = quizStats.totalAttempted ?? analytics?.totalQuizzes ?? 0;
  const avgQuizScore = quizStats.averageScore ?? analytics?.avgScore;
  const avgQuizScoreDisplay = (avgQuizScore !== null && avgQuizScore !== undefined && !isNaN(avgQuizScore) && totalAttemptedQuizzes > 0)
    ? `${Math.round(avgQuizScore)}%`
    : 'N/A';

  const quizResultsList = analytics?.quizResults || analytics?.quizScores || [];

  return (
    <div className="space-y-5 sm:space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-heading">Progress</h1>
        <p className="text-xs sm:text-sm text-muted mt-0.5">Track your academic standing, quiz scores, and course attendance</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        <div className="bg-surface rounded-card shadow-card border border-border p-3 sm:p-4 flex flex-col justify-between">
          <p className="text-xs sm:text-sm font-medium text-muted truncate">Courses Enrolled</p>
          <p className="text-2xl sm:text-3xl font-bold text-heading mt-1">{courses.length}</p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-border p-3 sm:p-4 flex flex-col justify-between">
          <p className="text-xs sm:text-sm font-medium text-muted truncate">Quizzes Taken</p>
          <p className="text-2xl sm:text-3xl font-bold text-heading mt-1">{totalAttemptedQuizzes}</p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-border p-3 sm:p-4 flex flex-col justify-between">
          <p className="text-xs sm:text-sm font-medium text-muted truncate">Avg Quiz Score</p>
          <p className="text-2xl sm:text-3xl font-bold text-heading mt-1">{avgQuizScoreDisplay}</p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-border p-3 sm:p-4 flex flex-col justify-between">
          <p className="text-xs sm:text-sm font-medium text-muted truncate">Assignments Done</p>
          <p className="text-2xl sm:text-3xl font-bold text-heading mt-1">{assignmentStats.totalSubmitted || 0}</p>
        </div>
      </div>

      {/* Course Progress */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold text-heading">Course Progress</h2>
          <span className="text-xs text-muted font-medium">{courses.length} {courses.length === 1 ? 'Course' : 'Courses'}</span>
        </div>
        <div className="p-3.5 sm:p-5">
          {courses.length === 0 ? (
            <p className="text-muted text-sm text-center py-6">No course progress available yet.</p>
          ) : (
            <div className="space-y-3 sm:space-y-3.5">
              {courses.map(course => {
                const courseIdStr = (course._id || course)?.toString();
                const courseAttendance = attendance.filter(a => {
                  const aCourseId = (a.course?._id || a.course)?.toString();
                  return aCourseId === courseIdStr;
                });
                const totalClasses = courseAttendance.length;
                const present = courseAttendance.filter(a => {
                  if (a.status) {
                    return a.status.toString().toUpperCase() === 'PRESENT';
                  }
                  if (Array.isArray(a.students)) {
                    const studentIdStr = (user?._id || user?.id)?.toString();
                    const record = a.students.find(s => (s.student?._id || s.student)?.toString() === studentIdStr);
                    return record?.status?.toString().toUpperCase() === 'PRESENT';
                  }
                  return false;
                }).length;
                const attendancePercent = totalClasses > 0 ? Math.round((present / totalClasses) * 100) : 0;

                return (
                  <div key={course._id} className="p-3.5 sm:p-4 border border-border rounded-lg bg-surface hover:border-gray-300 transition-colors">
                    <div className="mb-2.5">
                      <p className="font-semibold text-sm sm:text-base text-heading break-words">{course.name}</p>
                      <p className="text-xs text-muted mt-0.5">{course.code} • Semester {course.semester}</p>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs sm:text-sm">
                        <span className="text-muted font-medium">Attendance</span>
                        <span className={`font-semibold ${
                          attendancePercent >= 75 ? 'text-green-600' : attendancePercent >= 50 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {attendancePercent}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                        <div
                          className={`h-2.5 rounded-full transition-all duration-300 ${
                            attendancePercent >= 75 ? 'bg-green-500' : attendancePercent >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, attendancePercent))}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Quiz Results */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-semibold text-heading">Recent Quiz Results</h2>
          {quizResultsList && quizResultsList.length > 0 && (
            <span className="text-xs text-muted font-medium">{Math.min(10, quizResultsList.length)} recent</span>
          )}
        </div>
        <div className="p-3.5 sm:p-5">
          {!quizResultsList || quizResultsList.length === 0 ? (
            <p className="text-muted text-sm text-center py-6">No quiz results available yet.</p>
          ) : (
            <div className="space-y-2.5 sm:space-y-3">
              {quizResultsList.slice(0, 10).map((result, idx) => (
                <div key={idx} className="p-3 sm:p-3.5 border border-border rounded-lg bg-surface hover:border-gray-300 transition-colors">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-sm sm:text-base text-heading truncate">
                      {result.quiz?.title || result.quizTitle || 'Quiz'}
                    </p>
                    <p className={`text-base sm:text-lg font-bold shrink-0 ${
                      (result.percentage || 0) >= 70 ? 'text-green-600' : (result.percentage || 0) >= 40 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {result.percentage || 0}%
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1 text-xs text-muted">
                    <span>{new Date(result.submittedAt || result.createdAt || result.date).toLocaleDateString()}</span>
                    <span className="font-semibold text-heading/90">{result.score}/{result.totalMarks || result.maxScore || result.total}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
