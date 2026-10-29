import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { lecturesAPI, quizzesAPI, assignmentsAPI, coursesAPI, notificationsAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function StudentDashboard() {
  const { user, refreshUser } = useAuth();
  const [stats, setStats] = useState({ lectures: 0, labs: 0, quizzes: 0, assignments: 0, courses: 0 });
  const [recentLectures, setRecentLectures] = useState([]);
  const [recentLabs, setRecentLabs] = useState([]);
  const [upcomingQuizzes, setUpcomingQuizzes] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchDashboardData = async () => {
    try {
      const activeUser = await refreshUser() || user;

      // Fetch student's enrolled courses directly from backend authorization
      let enrolledCourses = [];
      try {
        const cRes = await coursesAPI.getAll({ limit: 50 });
        enrolledCourses = cRes.data?.data || [];
      } catch (e) {
        enrolledCourses = [];
      }

      const enrolledCourseIds = enrolledCourses
        .map(c => typeof c === 'string' ? c : c._id)
        .slice(0, 5);
      
      const courseParams = enrolledCourseIds.length > 0 ? enrolledCourseIds.join(',') : undefined;

      const [lecturesRes, labsRes, quizzesRes, assignmentsRes, notifRes] = await Promise.allSettled([
        lecturesAPI.getStudentContent({ limit: 5, sort: '-createdAt', type: 'lecture' }),
        lecturesAPI.getStudentContent({ limit: 5, sort: '-createdAt', type: 'lab' }),
        quizzesAPI.getAll({ limit: 5, sort: '-createdAt', ...(courseParams ? { course: courseParams } : {}) }),
        assignmentsAPI.getAll({ limit: 5, ...(courseParams ? { course: courseParams } : {}) }),
        notificationsAPI.getMy({ limit: 5 })
      ]);

      if (lecturesRes.status === 'fulfilled') {
        const ld = lecturesRes.value.data;
        setRecentLectures(ld.data || []);
        setStats(s => ({ ...s, lectures: ld.pagination?.total || (ld.data || []).length }));
      }
      if (labsRes.status === 'fulfilled') {
        const bd = labsRes.value.data;
        setRecentLabs(bd.data || []);
        setStats(s => ({ ...s, labs: bd.pagination?.total || (bd.data || []).length }));
      }
      if (quizzesRes.status === 'fulfilled') {
        const qd = quizzesRes.value.data;
        setUpcomingQuizzes(qd.data || []);
        setStats(s => ({ ...s, quizzes: qd.pagination?.total || (qd.data || []).length }));
      }
      if (assignmentsRes.status === 'fulfilled') {
        const ad = assignmentsRes.value.data;
        setStats(s => ({ ...s, assignments: ad.pagination?.total || (ad.data || []).length }));
      }
      // Set courses count from enrolled courses
      setStats(s => ({ ...s, courses: enrolledCourses.length }));
      if (notifRes.status === 'fulfilled') {
        const nd = notifRes.value.data;
        setNotifications(nd.data || []);
      }
    } catch (err) {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-heading tracking-tight">
          Welcome back, {user?.name || 'Student'}!
        </h1>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-4">
        {[
          { label: 'Courses', value: stats.courses, icon: Icons.Book, color: 'bg-blue-50 text-blue-700', link: '/student/lectures', isFullWidthMobile: false },
          { label: 'Lectures', value: stats.lectures, icon: Icons.GraduationCap, color: 'bg-green-50 text-green-700', link: '/student/lectures', isFullWidthMobile: false },
          { label: 'Labs', value: stats.labs, icon: Icons.Flask, color: 'bg-purple-50 text-purple-700', link: '/student/labs', isFullWidthMobile: false },
          { label: 'Quizzes', value: stats.quizzes, icon: Icons.FileEdit, color: 'bg-indigo-50 text-indigo-700', link: '/student/quiz', isFullWidthMobile: false },
          { label: 'Assignments', value: stats.assignments, icon: Icons.Clipboard, color: 'bg-amber-50 text-amber-700', link: '/student/assignments', isFullWidthMobile: true }
        ].map(stat => (
          <Link 
            to={stat.link} 
            key={stat.label} 
            className={`bg-surface rounded-card shadow-card p-3 sm:p-4 lg:p-5 hover:shadow-md active:scale-[0.99] transition-all border border-border flex flex-col justify-between ${
              stat.isFullWidthMobile ? 'col-span-2 lg:col-span-1' : 'col-span-1'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs sm:text-sm font-medium text-muted truncate">{stat.label}</p>
              <span className={`p-1.5 sm:p-2 lg:p-2.5 rounded-lg sm:rounded-xl ${stat.color} flex items-center justify-center shrink-0`}>
                <stat.icon className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6" />
              </span>
            </div>
            <div className="mt-2 sm:mt-3 flex items-baseline justify-between">
              <p className="text-xl sm:text-2xl font-bold text-heading">{stat.value}</p>
              {stat.isFullWidthMobile && (
                <span className="text-[11px] sm:text-xs text-amber-600 font-medium flex items-center gap-1 sm:hidden">
                  <span>View all</span>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Recent Lectures */}
        <div className="bg-surface rounded-card shadow-card border border-border">
          <div className="px-3.5 py-3 sm:px-4 sm:py-3.5 border-b border-border flex justify-between items-center">
            <h2 className="text-sm sm:text-base font-semibold text-heading">Recent Lectures</h2>
            <Link to="/student/lectures" className="text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline min-h-[36px] flex items-center">View All</Link>
          </div>
          <div className="p-3 sm:p-4">
            {recentLectures.length === 0 ? (
              <p className="text-muted text-center py-4 text-xs sm:text-sm">No lectures available yet.</p>
            ) : (
              <div className="space-y-2 sm:space-y-2.5">
                {recentLectures.slice(0, 5).map(lecture => (
                  <Link to={`/student/lectures/${lecture._id}`} key={lecture._id} className="flex items-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors border border-transparent hover:border-slate-100 min-w-0">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 border border-blue-100/60">
                      {lecture.title?.[0]?.toUpperCase() || 'L'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-heading truncate">{lecture.title}</p>
                      <p className="text-[11px] sm:text-xs text-muted truncate mt-0.5">{lecture.course?.name || 'General'} • {new Date(lecture.createdAt).toLocaleDateString()}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Labs */}
        <div className="bg-surface rounded-card shadow-card border border-border">
          <div className="px-3.5 py-3 sm:px-4 sm:py-3.5 border-b border-border flex justify-between items-center">
            <h2 className="text-sm sm:text-base font-semibold text-heading">Recent Labs</h2>
            <Link to="/student/labs" className="text-xs sm:text-sm font-medium text-purple-600 hover:text-purple-700 hover:underline min-h-[36px] flex items-center">View All</Link>
          </div>
          <div className="p-3 sm:p-4">
            {recentLabs.length === 0 ? (
              <p className="text-muted text-center py-4 text-xs sm:text-sm">No labs available yet.</p>
            ) : (
              <div className="space-y-2 sm:space-y-2.5">
                {recentLabs.slice(0, 5).map(lab => (
                  <Link to={`/student/labs/${lab._id}`} key={lab._id} className="flex items-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors border border-transparent hover:border-slate-100 min-w-0">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 bg-purple-50 text-purple-600 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 border border-purple-100/60">
                      {lab.title?.[0]?.toUpperCase() || 'L'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-heading truncate">{lab.title}</p>
                      <p className="text-[11px] sm:text-xs text-muted truncate mt-0.5">{lab.course?.name || 'General'} • {new Date(lab.createdAt).toLocaleDateString()}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Quizzes */}
        <div className="bg-surface rounded-card shadow-card border border-border">
          <div className="px-3.5 py-3 sm:px-4 sm:py-3.5 border-b border-border flex justify-between items-center">
            <h2 className="text-sm sm:text-base font-semibold text-heading">Recent Quizzes</h2>
            <Link to="/student/quiz" className="text-xs sm:text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:underline min-h-[36px] flex items-center">View All</Link>
          </div>
          <div className="p-3 sm:p-4">
            {upcomingQuizzes.length === 0 ? (
              <p className="text-muted text-center py-4 text-xs sm:text-sm">No quizzes available yet.</p>
            ) : (
              <div className="space-y-2 sm:space-y-2.5">
                {upcomingQuizzes.slice(0, 5).map(quiz => (
                  <Link to={`/student/quiz/${quiz._id}`} key={quiz._id} className="flex items-center gap-2.5 sm:gap-3 p-2 sm:p-2.5 rounded-lg hover:bg-slate-50 active:bg-slate-100 transition-colors border border-transparent hover:border-slate-100 min-w-0">
                    <div className="w-8 h-8 sm:w-9 sm:h-9 bg-indigo-50 text-indigo-600 rounded-lg flex items-center justify-center font-bold text-xs sm:text-sm shrink-0 border border-indigo-100/60">
                      {quiz.title?.[0]?.toUpperCase() || 'Q'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium text-heading truncate">{quiz.title}</p>
                      <p className="text-[11px] sm:text-xs text-muted truncate mt-0.5">
                        {quiz.questions?.length || 0} questions • {quiz.duration || 30} min
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 text-[11px] sm:text-xs font-medium rounded-full shrink-0 ${quiz.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {quiz.isActive !== false ? 'Active' : 'Closed'}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-surface rounded-card shadow-card border border-border">
        <div className="px-3.5 py-3 sm:px-4 sm:py-3.5 border-b border-border flex justify-between items-center">
          <h2 className="text-sm sm:text-base font-semibold text-heading">Recent Notifications</h2>
          <Link to="/student/notifications" className="text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline min-h-[36px] flex items-center">View All</Link>
        </div>
        <div className="p-3 sm:p-4">
          {notifications.length === 0 ? (
            <p className="text-muted text-center py-4 text-xs sm:text-sm">No new notifications.</p>
          ) : (
            <div className="space-y-2 sm:space-y-2.5">
              {notifications.map(notif => (
                <div key={notif._id} className={`p-2.5 sm:p-3 rounded-lg border ${notif.isRead ? 'bg-slate-50/70 border-slate-100' : 'bg-blue-50/50 border-blue-100'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs sm:text-sm font-semibold text-heading">{notif.title}</p>
                    <span className="text-[10px] sm:text-xs text-muted shrink-0 mt-0.5">
                      {new Date(notif.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed break-words">{notif.message}</p>
                  <p className="text-[10.5px] text-muted mt-1 flex items-center gap-1">
                    <span>{new Date(notif.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
