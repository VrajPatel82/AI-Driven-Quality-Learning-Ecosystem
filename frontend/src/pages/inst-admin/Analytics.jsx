import { useState, useEffect } from 'react';
import { adminAPI, analyticsAPI } from '../../services/api';
import toast from 'react-hot-toast';
import ResourceManagement from '../../components/shared/ResourceManagement';

export default function InstAnalytics() {
  const [stats, setStats] = useState({});
  const [deptAnalytics, setDeptAnalytics] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [statsRes, deptRes] = await Promise.allSettled([
        adminAPI.getStats(),
        adminAPI.getDepartments()
      ]);
      if (statsRes.status === 'fulfilled') setStats(statsRes.value.data.data || statsRes.value.data);
      if (deptRes.status === 'fulfilled') setDepartments(deptRes.value.data.data || deptRes.value.data || []);
    } catch (err) { toast.error('Failed to load analytics'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (selectedDept) {
      analyticsAPI.getDepartment(selectedDept).then(res => setDeptAnalytics(res.data.data || res.data)).catch(() => {});
    } else { setDeptAnalytics(null); }
  }, [selectedDept]);

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-heading">Analytics</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Departments', value: stats.totalDepartments || stats.departments || 0, color: 'bg-blue-500' },
          { label: 'Courses', value: stats.totalCourses || stats.courses || 0, color: 'bg-green-500' },
          { label: 'Professors', value: stats.totalProfessors || stats.professors || 0, color: 'bg-purple-500' },
          { label: 'Students', value: stats.totalStudents || stats.students || 0, color: 'bg-amber-500' }
        ].map(s => (
          <div key={s.label} className="bg-surface rounded-card shadow-card border border-border p-5">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 ${s.color} rounded-full`}></div>
              <div>
                <p className="text-sm text-muted">{s.label}</p>
                <p className="text-2xl font-bold mt-0.5">{s.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-surface rounded-card shadow-card border border-border">
        <div className="p-4 border-b border-border flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h2 className="text-lg font-semibold text-heading">Department Performance</h2>
          <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="form-input w-full sm:w-auto">
            <option value="">Select department</option>
            {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        </div>
        <div className="p-6">
          {!selectedDept ? (
            <p className="text-center text-muted py-8">Select a department to view analytics</p>
          ) : !deptAnalytics ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-blue-600">{deptAnalytics.totalLectures || 0}</p>
                  <p className="text-sm text-muted">Lectures Uploaded</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-green-600">{deptAnalytics.avgAttendance || 0}%</p>
                  <p className="text-sm text-muted">Avg Attendance</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <p className="text-2xl font-bold text-purple-600">{deptAnalytics.avgScore || 0}%</p>
                  <p className="text-sm text-muted">Avg Quiz Scores</p>
                </div>
              </div>

              {deptAnalytics.coursePerformance && deptAnalytics.coursePerformance.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-heading mb-3">Course Performance</h3>
                  <div className="space-y-3">
                    {deptAnalytics.coursePerformance.map((c, i) => (
                      <div key={i} className="flex items-center gap-4">
                        <span className="text-sm w-40 truncate">{c.name || c.courseName}</span>
                        <div className="flex-1 bg-gray-100 h-6 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full rounded-full" style={{ width: `${Math.min(c.avgScore || c.averageScore || 0, 100)}%` }}></div>
                        </div>
                        <span className="text-sm font-medium w-12 text-right">{Math.round(c.avgScore || c.averageScore || 0)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface rounded-card shadow-card border border-border">
        <div className="p-4 border-b border-border"><h2 className="text-lg font-semibold text-heading">All Departments</h2></div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Department</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-muted">Code</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-muted">Courses</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-muted">Faculty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {departments.map(d => (
                <tr key={d._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3 text-center text-sm text-muted">{d.code || '—'}</td>
                  <td className="px-4 py-3 text-center text-sm">{d.courses?.length || 0}</td>
                  <td className="px-4 py-3 text-center text-sm">{d.faculty?.length || d.professors?.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ResourceManagement role="inst_admin" />
    </div>
  );
}
