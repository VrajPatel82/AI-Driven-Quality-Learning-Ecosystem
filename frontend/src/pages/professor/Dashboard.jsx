import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { lecturesAPI, quizzesAPI, coursesAPI, assignmentsAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function ProfessorDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ lectures: 0, labs: 0, quizzes: 0, courses: 0, assignments: 0 });
  const [recentLectures, setRecentLectures] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      if (!user?.id) {
        console.log('[Dashboard] No user ID, skipping fetch');
        setLoading(false);
        return;
      }

      console.log('[Dashboard] Fetching for professor:', user.name, 'Courses:', user.courses);

      // Fetch all data in parallel
      const [lectRes, labsRes, quizRes, courseRes, assignRes] = await Promise.all([
        lecturesAPI.getAll({ uploadedBy: user.id, type: 'lecture', limit: 100 }).catch(e => ({ error: e })),
        lecturesAPI.getAll({ uploadedBy: user.id, type: 'lab', limit: 100 }).catch(e => ({ error: e })),
        quizzesAPI.getAll({ createdBy: user.id, limit: 100 }).catch(e => ({ error: e })),
        coursesAPI.getAll({ limit: 100 }).catch(e => ({ error: e })),
        assignmentsAPI.getAll({ createdBy: user.id, limit: 100 }).catch(e => ({ error: e }))
      ]);

      // Count lectures
      const lectureCount = lectRes.data?.pagination?.total ?? (lectRes.data?.data || []).length;
      console.log('[Dashboard] Lectures:', lectureCount);
      const recentLecsList = (lectRes.data?.data || []).slice(0, 5);
      setRecentLectures(recentLecsList);

      // Count labs
      const labCount = labsRes.data?.pagination?.total ?? (labsRes.data?.data || []).length;
      console.log('[Dashboard] Labs:', labCount);

      // Count quizzes  
      const quizCount = quizRes.data?.pagination?.total ?? (quizRes.data?.data || []).length;
      console.log('[Dashboard] Quizzes:', quizCount);

      // Count courses - direct from user.courses
      const courseCount = user?.courses?.length || 0;
      console.log('[Dashboard] Courses assigned:', courseCount);

      // Count assignments
      const assignmentCount = assignRes.data?.pagination?.total ?? (assignRes.data?.data || []).length;
      console.log('[Dashboard] Assignments:', assignmentCount);

      // Update stats
      setStats({
        lectures: lectureCount,
        labs: labCount,
        quizzes: quizCount,
        courses: courseCount,
        assignments: assignmentCount
      });

    } catch (err) {
      console.error('[Dashboard] Error:', err);
      toast.error('Failed to load dashboard');
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
    <div className="space-y-5 sm:space-y-6 max-w-full">
      {/* Welcome Heading */}
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-heading tracking-tight break-words">
          Welcome, {user?.name || 'Professor'}!
        </h1>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
        {[
          { label: 'Lectures', value: stats.lectures, icon: Icons.Video, link: '/professor/my-lectures' },
          { label: 'Labs', value: stats.labs, icon: Icons.Flask, link: '/professor/my-labs' },
          { label: 'Quizzes', value: stats.quizzes, icon: Icons.FileEdit, link: '/professor/quiz-builder' },
          { label: 'Courses', value: stats.courses, icon: Icons.Book, link: '/professor/my-lectures' },
          { label: 'Assignments', value: stats.assignments, icon: Icons.Clipboard, link: '/professor/assignments' }
        ].map(s => (
          <Link
            to={s.link}
            key={s.label}
            className="bg-surface rounded-card shadow-card p-4 sm:p-5 hover:shadow-lg transition-all border border-border flex items-center justify-between min-w-0"
          >
            <div className="min-w-0 flex-1 mr-2">
              <p className="text-xs sm:text-sm text-muted font-medium truncate">{s.label}</p>
              <p className="text-xl sm:text-2xl font-bold mt-1 text-heading truncate">{s.value}</p>
            </div>
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-lg bg-blue-50 flex items-center justify-center text-primary shrink-0">
              <s.icon className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
          </Link>
        ))}
      </div>

      {/* Recent Lectures & Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* Recent Lectures */}
        <div className="bg-surface rounded-card shadow-card border border-border flex flex-col min-w-0">
          <div className="p-3.5 sm:p-4 border-b border-border flex justify-between items-center shrink-0">
            <h2 className="text-base sm:text-lg font-semibold text-heading">Recent Lectures</h2>
            <Link to="/professor/my-lectures" className="text-xs sm:text-sm font-medium text-blue-600 hover:underline">
              View All
            </Link>
          </div>
          <div className="p-3.5 sm:p-4 flex-1">
            {recentLectures.length === 0 ? (
              <p className="text-muted text-center py-6 text-sm">
                No lectures yet.{' '}
                <Link to="/professor/upload" className="text-blue-600 hover:underline font-medium">
                  Upload one
                </Link>
              </p>
            ) : (
              <div className="space-y-2.5 sm:space-y-3">
                {recentLectures.map(l => (
                  <div key={l._id} className="flex items-center gap-3 p-2.5 sm:p-3 rounded-lg hover:bg-gray-50 transition-colors min-w-0">
                    <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                      {l.title?.[0] || 'L'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-heading truncate" title={l.title}>
                        {l.title}
                      </p>
                      <p className="text-xs text-muted truncate" title={`${l.course?.name || 'General'} • ${new Date(l.createdAt).toLocaleDateString()}`}>
                        {l.course?.name || 'General'} • {new Date(l.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-surface rounded-card shadow-card border border-border flex flex-col min-w-0">
          <div className="p-3.5 sm:p-4 border-b border-border shrink-0">
            <h2 className="text-base sm:text-lg font-semibold text-heading">Quick Actions</h2>
          </div>
          <div className="p-3.5 sm:p-4 grid grid-cols-2 gap-2.5 sm:gap-3 flex-1">
            {[
              { label: 'Upload Lecture', link: '/professor/upload', icon: Icons.Upload },
              { label: 'Create Quiz', link: '/professor/quiz-builder', icon: Icons.FileEdit },
              { label: 'View Students', link: '/professor/students', icon: Icons.Users },
              { label: 'Analytics', link: '/professor/analytics', icon: Icons.BarChart }
            ].map(a => (
              <Link
                key={a.label}
                to={a.link}
                className="p-3 sm:p-4 border border-border rounded-lg hover:bg-gray-50 text-center transition-colors flex flex-col items-center justify-center min-w-0"
              >
                <a.icon className="w-5 h-5 sm:w-6 sm:h-6 text-primary mb-1.5 sm:mb-2 shrink-0" />
                <p className="text-xs sm:text-sm font-medium text-heading text-center leading-tight">
                  {a.label}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
