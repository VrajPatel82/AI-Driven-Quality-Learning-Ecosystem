import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { analyticsAPI, adminAPI, usersAPI } from '../../services/api';
import toast from 'react-hot-toast';
import ResourceManagement from '../../components/shared/ResourceManagement';

// Simple Pie Chart Component
function PieChart({ data, title }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444'];
  
  return (
    <div className="bg-surface rounded-card shadow-card border border-border p-6">
      <h3 className="text-lg font-semibold text-heading mb-4">{title}</h3>
      <div className="space-y-3">
        {Object.entries(data).map(([ language, count ], idx) => {
          const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : 0;
          return (
            <div key={language}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-heading">{language}</span>
                <span className="text-muted">{percentage}%</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${percentage}%`, backgroundColor: colors[idx % colors.length] }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Simple Bar Chart Component
function BarChart({ data, title, dataKey }) {
  const maxValue = Math.max(...Object.values(data).map(d => d[dataKey] || 0));
  
  return (
    <div className="bg-surface rounded-card shadow-card border border-border p-6">
      <h3 className="text-lg font-semibold text-heading mb-4">{title}</h3>
      <div className="space-y-3">
        {Object.entries(data).map(([ name, item ]) => {
          const value = item[dataKey] || 0;
          const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0;
          return (
            <div key={name}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-heading truncate">{name}</span>
                <span className="text-muted font-bold">{value}</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DeptAnalytics() {
  const { user } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [stats, setStats] = useState(null);
  const [lectureAnalytics, setLectureAnalytics] = useState(null);
  const [languageAnalytics, setLanguageAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const deptId = typeof user.department === 'object' ? user.department._id || user.department.id : user.department;
      
      const results = await Promise.allSettled([
        Promise.all([
          adminAPI.getCourses({ department: deptId, limit: 100 }),
          usersAPI.getAll({ role: 'professor', department: deptId, limit: 100 }),
          usersAPI.getAll({ role: 'student', department: deptId, limit: 100 })
        ]),
        analyticsAPI.getDepartment(deptId),
        analyticsAPI.getLectureUploadAnalytics(deptId),
        analyticsAPI.getLanguageUsageAnalytics(deptId)
      ]);

      if (results[0].status === 'fulfilled') {
        const [coursesRes, facultyRes, studentsRes] = results[0].value;
        setStats({
          totalCourses: (coursesRes.data.data || []).length,
          totalProfessors: (facultyRes.data.data || []).length,
          totalStudents: (studentsRes.data.data || []).length
        });
      }
      if (results[1].status === 'fulfilled') setAnalytics(results[1].value.data.data || results[1].value.data);
      if (results[2].status === 'fulfilled') setLectureAnalytics(results[2].value.data);
      if (results[3].status === 'fulfilled') setLanguageAnalytics(results[3].value.data);
    } catch (err) {
      toast.error('Failed to load analytics');
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
        <h1 className="text-2xl font-bold text-heading">Analytics</h1>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Students', value: stats?.totalStudents || analytics?.totalStudents || 0 },
          { label: 'Professors', value: stats?.totalProfessors || analytics?.totalProfessors || 0 },
          { label: 'Courses', value: stats?.totalCourses || analytics?.totalCourses || 0 },
          { label: 'Total Lectures', value: lectureAnalytics?.totalLectures || 0 }
        ].map(s => (
          <div key={s.label} className="bg-surface rounded-card shadow-card border border-border p-5">
            <p className="text-sm text-muted">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Language Usage Analytics */}
      {languageAnalytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PieChart 
            data={languageAnalytics.departmentLanguageDistribution}
            title="Teaching Language Distribution"
          />
          
          {languageAnalytics.professorLanguageStats && languageAnalytics.professorLanguageStats.length > 0 && (
            <div className="bg-surface rounded-card shadow-card border border-border p-6">
              <h3 className="text-lg font-semibold text-heading mb-4">Language Usage by Professor</h3>
              <div className="space-y-4 max-h-64 overflow-y-auto">
                {languageAnalytics.professorLanguageStats.map((prof) => (
                  <div key={prof.professorId} className="border-b border-border pb-4">
                    <p className="font-medium text-heading text-sm">{prof.professorName}</p>
                    <p className="text-xs text-muted mb-2">{prof.totalLectures} lectures</p>
                    <div className="space-y-1">
                      {Object.entries(prof.languageDistribution).map(([ lang, pct ]) => (
                        <div key={lang} className="flex justify-between text-xs">
                          <span className="text-muted">{lang}</span>
                          <span className="font-medium text-heading">{pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Lecture Upload Analytics */}
      {lectureAnalytics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <BarChart
            data={Object.fromEntries(
              lectureAnalytics.professorStats.map(prof => [
                prof.professorName,
                { count: prof.totalLectures }
              ])
            )}
            title="Lectures per Professor"
            dataKey="count"
          />
          
          <div className="bg-surface rounded-card shadow-card border border-border p-6">
            <h3 className="text-lg font-semibold text-heading mb-4">Lecture Upload Summary</h3>
            <div className="space-y-3">
              {lectureAnalytics.professorStats.map((prof) => (
                <div key={prof.professorId} className="border-b border-border pb-3 last:border-0">
                  <p className="font-medium text-heading text-sm">{prof.professorName}</p>
                  <div className="grid grid-cols-2 text-xs text-muted mt-1">
                    <span>Lectures: <span className="font-bold text-heading">{prof.lecturesByType.lecture}</span></span>
                    <span>Labs: <span className="font-bold text-heading">{prof.lecturesByType.lab}</span></span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Course Performance */}
      {analytics?.courseStats && analytics.courseStats.length > 0 && (
        <div className="bg-surface rounded-card shadow-card border border-border">
          <div className="p-4 border-b border-border">
            <h2 className="text-lg font-semibold text-heading">Course Performance</h2>
          </div>
          <div className="p-4 space-y-3">
            {analytics.courseStats.map((cs, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 border border-border rounded-lg">
                <div>
                  <p className="font-medium text-heading">{cs.courseName}</p>
                  <p className="text-xs text-muted">{cs.totalAttempts || 0} quiz attempts</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-blue-600">{Math.round(cs.avgScore || 0)}%</p>
                  <p className="text-xs text-muted">avg score</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ResourceManagement role="dept_admin" />
    </div>
  );
}
