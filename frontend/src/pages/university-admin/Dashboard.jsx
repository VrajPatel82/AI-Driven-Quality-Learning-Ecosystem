import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';

export default function UniversityDashboard() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [institutions, setInstitutions] = useState([]);
  const [stats, setStats] = useState({
    institutions: 0,
    departments: 0,
    students: 0,
    professors: 0,
    courses: 0
  });

  const uniName = user?.university?.name || user?.universityName || 'University Admin Portal';

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const [statsRes, instRes] = await Promise.allSettled([
        adminAPI.getStats(),
        adminAPI.getInstitutions()
      ]);

      const statsData = (statsRes.status === 'fulfilled' && (statsRes.value.data.data || statsRes.value.data)) || {};
      const instList = (instRes.status === 'fulfilled' && (instRes.value.data.data || instRes.value.data)) || [];

      setInstitutions(instList);
      setStats({
        institutions: statsData.totalInstitutions ?? statsData.institutions ?? instList.length,
        departments: statsData.totalDepartments ?? statsData.departments ?? 0,
        students: statsData.totalStudents ?? statsData.students ?? 0,
        professors: statsData.totalProfessors ?? statsData.professors ?? 0,
        courses: statsData.totalCourses ?? statsData.courses ?? 0
      });
    } catch (err) {
      console.error('Error fetching university dashboard:', err);
      setStats({
        institutions: 0,
        departments: 0,
        students: 0,
        professors: 0,
        courses: 0
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Overview</h1>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Campuses / Colleges', value: stats.institutions, icon: Icons.Landmark },
          { label: 'Departments', value: stats.departments, icon: Icons.Building },
          { label: 'Total Students', value: stats.students.toLocaleString(), icon: Icons.GraduationCap },
          { label: 'Faculty Members', value: stats.professors, icon: Icons.UserCheck },
          { label: 'Active Courses', value: stats.courses, icon: Icons.Book }
        ].map(item => {
          const ItemIcon = item.icon;
          return (
            <div key={item.label} className="bg-surface rounded-card shadow-card border border-border p-4">
              <p className="text-xs text-muted font-medium uppercase tracking-wide">{item.label}</p>
              <div className="flex items-center justify-between mt-1.5">
                <span className="text-2xl font-bold text-slate-800">{item.value}</span>
                <ItemIcon className="w-7 h-7 text-indigo-600" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Breakdown by Institution */}
      <div className="bg-surface rounded-card shadow-card border border-border">
        <div className="p-4 border-b border-border flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-heading">Colleges & Campuses</h2>
            <p className="text-xs text-muted">Institutions affiliated under {uniName}</p>
          </div>
          <Link
            to="/university-admin/institutions"
            className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
          >
            Manage Campuses &rarr;
          </Link>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          {institutions.length === 0 ? (
            <div className="col-span-3 text-center py-8 text-muted text-sm">
              No institutions registered under this university yet.
            </div>
          ) : (
            institutions.map(inst => (
              <div key={inst._id} className="border border-border rounded-lg p-4 bg-white hover:border-blue-200 transition-colors">
                <div className="flex justify-between items-start">
                  <span className="badge badge-info">
                    {inst.code || 'CAMPUS'}
                  </span>
                  <span className="badge badge-success">
                    Active
                  </span>
                </div>
                <h3 className="font-semibold text-heading mt-2.5 text-base">{inst.name}</h3>
                <p className="text-xs text-muted mt-0.5 truncate">{inst.address || 'College Campus'}</p>

                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-border text-xs text-body">
                  <div>
                    <span className="text-muted block text-[11px]">Contact</span>
                    <span className="font-medium truncate block text-slate-700">{inst.contactEmail || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-muted block text-[11px]">Phone</span>
                    <span className="font-medium truncate block text-slate-700">{inst.contactPhone || 'N/A'}</span>
                  </div>
                </div>

                <div className="mt-3 text-right">
                  <Link
                    to={`/university-admin/institutions/${inst._id}`}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Campus Profile &rarr;
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions Matrix */}
      <div className="bg-surface rounded-card shadow-card border border-border">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold text-heading">University Operations</h2>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            to="/university-admin/students"
            className="p-4 border border-border rounded-lg bg-white hover:bg-blue-50/50 hover:border-blue-200 transition-all group block"
          >
            <Icons.Users className="w-6 h-6 mb-2 text-primary group-hover:scale-110 transition-transform" />
            <h4 className="font-semibold text-heading text-sm group-hover:text-primary transition-colors">Student Directory</h4>
            <p className="text-xs text-muted mt-1">View synchronized student rosters across campuses</p>
            <span className="text-xs font-semibold text-primary mt-3 inline-block">View Students &rarr;</span>
          </Link>
          <Link
            to="/university-admin/academics"
            className="p-4 border border-border rounded-lg bg-white hover:bg-blue-50/50 hover:border-blue-200 transition-all group block"
          >
            <Icons.BarChart className="w-6 h-6 mb-2 text-primary group-hover:scale-110 transition-transform" />
            <h4 className="font-semibold text-heading text-sm group-hover:text-primary transition-colors">Academic Health</h4>
            <p className="text-xs text-muted mt-1">Attendance oversight, quizzes and course coverage</p>
            <span className="text-xs font-semibold text-primary mt-3 inline-block">Monitor Academics &rarr;</span>
          </Link>
          <Link
            to="/university-admin/storage"
            className="p-4 border border-border rounded-lg bg-white hover:bg-blue-50/50 hover:border-blue-200 transition-all group block"
          >
            <Icons.HardDrive className="w-6 h-6 mb-2 text-primary group-hover:scale-110 transition-transform" />
            <h4 className="font-semibold text-heading text-sm group-hover:text-primary transition-colors">Storage Distribution</h4>
            <p className="text-xs text-muted mt-1">Campus disk quotas and active storage consumption</p>
            <span className="text-xs font-semibold text-primary mt-3 inline-block">Manage Quota &rarr;</span>
          </Link>
          <Link
            to="/university-admin/reports"
            className="p-4 border border-border rounded-lg bg-white hover:bg-blue-50/50 hover:border-blue-200 transition-all group block"
          >
            <Icons.FileText className="w-6 h-6 mb-2 text-primary group-hover:scale-110 transition-transform" />
            <h4 className="font-semibold text-heading text-sm group-hover:text-primary transition-colors">University Reports</h4>
            <p className="text-xs text-muted mt-1">Export student and academic audit data spreadsheets</p>
            <span className="text-xs font-semibold text-primary mt-3 inline-block">Export Reports &rarr;</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
