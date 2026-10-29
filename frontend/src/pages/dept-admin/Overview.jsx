import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminAPI, usersAPI, coursesAPI, notificationsAPI } from '../../services/api';
import toast from 'react-hot-toast';
import LanguageReportTable from '../../components/shared/LanguageReportTable';
import { Icons } from '../../components/shared/Icons';

export default function DeptOverview() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ courses: 0, faculty: 0, academicAdmins: 0, students: 0 });
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [coursesRes, facultyRes, academicAdminsRes, studentsRes, notifRes] = await Promise.allSettled([
        adminAPI.getCourses({ department: user?.department?._id, limit: 100 }),
        usersAPI.getAll({ role: 'professor', department: user?.department?._id, limit: 100 }),
        usersAPI.getAll({ role: 'academic_administrator', department: user?.department?._id, limit: 100 }),
        usersAPI.getAll({ role: 'student', department: user?.department?._id, limit: 100 }),
        notificationsAPI.getMy({ limit: 5 })
      ]);
      
      let courseCount = 0, facultyCount = 0, acadCount = 0, studentCount = 0;
      
      if (coursesRes.status === 'fulfilled') {
        courseCount = (coursesRes.value.data.data || []).length;
      }
      if (facultyRes.status === 'fulfilled') {
        facultyCount = (facultyRes.value.data.data || []).length;
      }
      if (academicAdminsRes.status === 'fulfilled') {
        acadCount = (academicAdminsRes.value.data.data || []).length;
      }
      if (studentsRes.status === 'fulfilled') {
        studentCount = (studentsRes.value.data.data || []).length;
      }
      
      setStats({
        courses: courseCount,
        faculty: facultyCount,
        academicAdmins: acadCount,
        students: studentCount
      });
      
      if (notifRes.status === 'fulfilled') {
        setNotifications(notifRes.value.data.data || []);
      }
    } catch (err) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Overview</h1>
        <p className="text-muted mt-1">Welcome back, {user?.name}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <p className="text-sm text-muted">Courses</p>
          <p className="text-2xl font-bold mt-1">{stats.courses}</p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <p className="text-sm text-muted">Faculty</p>
          <p className="text-2xl font-bold mt-1">{stats.faculty}</p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <p className="text-sm text-muted">Academic Admins</p>
          <p className="text-2xl font-bold mt-1">{stats.academicAdmins}</p>
        </div>
        <div className="bg-surface rounded-card shadow-card border border-border p-5">
          <p className="text-sm text-muted">Students</p>
          <p className="text-2xl font-bold mt-1">{stats.students}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface rounded-card shadow-card border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-heading">Quick Actions</h2>
          </div>
          <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: 'Courses', link: '/dept-admin/courses', icon: Icons.Book },
              { label: 'Faculty', link: '/dept-admin/faculty', icon: Icons.UserCheck },
              { label: 'Acad. Admins', link: '/dept-admin/academic-admins', icon: Icons.User },
              { label: 'Analytics', link: '/dept-admin/analytics', icon: Icons.BarChart },
              { label: 'Issues', link: '/dept-admin/student-issues', icon: Icons.Ticket },
              { label: 'Students', link: '/dept-admin/students', icon: Icons.GraduationCap }
            ].map(a => {
              const ActionIcon = a.icon;
              return (
                <Link key={a.label} to={a.link} className="p-4 border border-border rounded-lg hover:bg-gray-50 text-center transition-colors">
                  <ActionIcon className="w-6 h-6 mx-auto text-indigo-600" />
                  <p className="text-sm font-medium mt-2">{a.label}</p>
                </Link>
              );
            })}
          </div>
        </div>

        <div className="bg-surface rounded-card shadow-card border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-heading">Recent Notifications</h2>
          </div>
          <div className="p-4">
            {notifications.length === 0 ? (
              <p className="text-muted text-center py-4">No new notifications</p>
            ) : (
              <div className="space-y-2">
                {notifications.map(n => (
                  <div key={n._id} className={`p-3 rounded-lg ${n.isRead ? 'bg-gray-50' : 'bg-blue-50'}`}>
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-muted mt-1">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Language Analysis Report filtered by department */}
      <LanguageReportTable department={user.department?._id || user.department} title="Department Language Analysis Report" />
    </div>
  );
}
