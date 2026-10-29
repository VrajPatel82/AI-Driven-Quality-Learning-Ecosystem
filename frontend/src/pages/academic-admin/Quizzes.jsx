import { useState, useEffect } from 'react';
import { quizzesAPI, coursesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';

export default function AcademicQuizzes() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState([]);
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
      const [quizzesRes, coursesRes] = await Promise.allSettled([
        quizzesAPI.getAll({ limit: 50 }),
        coursesAPI.getAll({ department: deptId, limit: 50 })
      ]);

      if (quizzesRes.status === 'fulfilled') {
        setQuizzes(quizzesRes.value.data.data || quizzesRes.value.data || []);
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

  const filtered = quizzes.filter(q => {
    const courseId = q.course?._id || q.course;
    return !filterCourse || courseId === filterCourse;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Quizzes</h1>
          <p className="text-muted mt-1 text-sm">
            {quizzes.length} quizzes conducted across department courses.
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
            No quizzes found for this department.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Quiz Title</th>
                  <th className="py-3.5 px-4">Course</th>
                  <th className="py-3.5 px-4 text-center">Questions</th>
                  <th className="py-3.5 px-4 text-center">Time Limit</th>
                  <th className="py-3.5 px-4">Created By</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(q => (
                  <tr key={q._id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {q.title}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono font-bold text-blue-700">
                      {q.course?.code || 'CE401'}
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-xs text-slate-700">
                      {q.questions?.length || 10} MCQs
                    </td>
                    <td className="py-3 px-4 text-center text-xs text-slate-600">
                      {q.timeLimit ? `${q.timeLimit} mins` : '15 mins'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {q.professor?.name || 'Faculty Member'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        Active
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
