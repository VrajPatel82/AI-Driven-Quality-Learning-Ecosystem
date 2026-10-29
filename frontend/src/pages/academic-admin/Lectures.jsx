import { useState, useEffect } from 'react';
import { lecturesAPI, coursesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';

export default function AcademicLectures() {
  const { user } = useAuth();
  const [lectures, setLectures] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterCourse, setFilterCourse] = useState('');

  const deptName = user?.department?.name || user?.departmentName || 'Computer Engineering';
  const deptId = user?.department?._id || user?.department;

  useEffect(() => {
    fetchData();
  }, [deptId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [lecturesRes, coursesRes] = await Promise.allSettled([
        lecturesAPI.getAll({ department: deptId, limit: 50 }),
        coursesAPI.getAll({ department: deptId, limit: 50 })
      ]);

      if (lecturesRes.status === 'fulfilled') {
        setLectures(lecturesRes.value.data.data || lecturesRes.value.data || []);
      }
      if (coursesRes.status === 'fulfilled') {
        setCourses(coursesRes.value.data.data || coursesRes.value.data || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const filtered = lectures.filter(l => {
    const courseId = l.course?._id || l.course;
    return !filterCourse || courseId === filterCourse;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Lectures</h1>
          <p className="text-muted mt-1 text-sm">
            {lectures.length} recorded lecture sessions with multilingual audio support.
          </p>
        </div>

        <select
          value={filterCourse}
          onChange={e => setFilterCourse(e.target.value)}
          className="form-input text-sm w-full sm:w-60"
        >
          <option value="">All Courses</option>
          {courses.map(c => (
            <option key={c._id} value={c._id}>{c.code}: {c.name}</option>
          ))}
        </select>
      </div>

      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm">
            No lectures found for this department.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Lecture Title</th>
                  <th className="py-3.5 px-4">Course</th>
                  <th className="py-3.5 px-4">Instructor</th>
                  <th className="py-3.5 px-4 text-center">Duration</th>
                  <th className="py-3.5 px-4 text-center">Subtitles / Dubbing</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(l => (
                  <tr key={l._id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {l.title}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono font-bold text-blue-700">
                      {l.course?.code || 'CE401'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {l.professor?.name || 'Faculty Member'}
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-slate-600">
                      {l.duration ? `${Math.round(l.duration / 60)} mins` : '45 mins'}
                    </td>
                    <td className="py-3 px-4 text-center text-xs">
                      <span className="bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded mr-1">EN</span>
                      <span className="bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded mr-1">HI</span>
                      <span className="bg-purple-50 text-purple-700 font-semibold px-2 py-0.5 rounded">GU</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        {l.status || 'Ready'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
