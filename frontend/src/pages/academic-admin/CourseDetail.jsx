import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { coursesAPI, usersAPI, adminAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import Breadcrumbs from '../../components/shared/Breadcrumbs';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function AcademicCourseDetail() {
  const { id } = useParams();
  const { user } = useAuth();

  const [course, setCourse] = useState(null);
  const [students, setStudents] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isUpdatingProf, setIsUpdatingProf] = useState(false);

  const deptId = user?.department?._id || user?.department;

  useEffect(() => {
    fetchCourseDetails();
  }, [id, deptId]);

  const fetchCourseDetails = async () => {
    setLoading(true);
    try {
      const [courseRes, studentsRes, profsRes] = await Promise.allSettled([
        coursesAPI.getById(id),
        coursesAPI.getStudents(id),
        usersAPI.getAll({ role: 'professor', department: deptId, limit: 100 })
      ]);

      if (courseRes.status === 'fulfilled') {
        const c = courseRes.value.data?.data || courseRes.value.data;
        if (c) setCourse(c);
      } else {
        // Fallback to searching all courses if getById is unavailable
        try {
          const allRes = await coursesAPI.getAll({ limit: 100 });
          const all = allRes.data?.data || allRes.data || [];
          const found = all.find(item => item._id === id);
          if (found) setCourse(found);
        } catch {
          // ignore fallback error
        }
      }

      if (studentsRes.status === 'fulfilled') {
        const list = studentsRes.value.data?.data || studentsRes.value.data || [];
        setStudents(Array.isArray(list) ? list : []);
      } else {
        setStudents([]);
      }

      if (profsRes.status === 'fulfilled') {
        const profList = profsRes.value.data?.data || profsRes.value.data || [];
        setProfessors(Array.isArray(profList) ? profList : []);
      }
    } catch {
      toast.error('Failed to load course details');
    } finally {
      setLoading(false);
    }
  };

  const handleFacultyReassign = async (newProfessorId) => {
    if (!course) return;
    setIsUpdatingProf(true);
    try {
      await adminAPI.updateCourse(course._id, {
        professor: newProfessorId || null
      });
      toast.success('Assigned faculty updated successfully');
      await fetchCourseDetails();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update assigned faculty');
    } finally {
      setIsUpdatingProf(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const currentProfId = course?.professor?._id || course?.professor || '';

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Course Catalog', to: '/academic-admin/courses' },
          { label: course?.name || 'Course Details' }
        ]}
      />

      {/* Course Header & Faculty Reassignment Bar */}
      <div className="bg-surface rounded-card shadow-card border border-border p-6 space-y-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-[#2563eb] to-[#1e40af] rounded-2xl flex items-center justify-center text-white text-2xl shadow-sm">
              <Icons.Book className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-heading">{course?.name}</h1>
                <span className="font-mono text-xs bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-md">
                  {course?.code}
                </span>
                <span className="font-bold text-xs bg-slate-100 text-slate-800 px-2.5 py-1 rounded">
                  Semester {course?.semester || 1}
                </span>
              </div>
              <p className="text-xs text-muted mt-1">
                Department Course Offering &bull; {course?.department?.name || 'Computer Engineering'}
              </p>
            </div>
          </div>

          <Link
            to="/academic-admin/courses"
            className="px-4 py-2 border border-border rounded-btn text-xs font-semibold hover:bg-gray-50 self-start md:self-auto text-slate-700"
          >
            &larr; Back to Catalog
          </Link>
        </div>

        {/* Faculty Assignment Control Box */}
        <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 border border-blue-200 font-bold flex items-center justify-center text-xs">
              <Icons.UserCheck className="w-4 h-4" />
            </span>
            <div>
              <p className="text-xs font-bold text-slate-800">Assigned Faculty Instructor</p>
              <p className="text-xs text-muted">
                Currently: <strong>{course?.professor?.name || 'Unassigned (No Faculty Assigned)'}</strong>
                {course?.professor?.email && ` (${course.professor.email})`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="reassign-prof-select" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
              Reassign Faculty:
            </label>
            <div className="relative min-w-[200px]">
              <select
                id="reassign-prof-select"
                disabled={isUpdatingProf}
                value={currentProfId}
                onChange={e => handleFacultyReassign(e.target.value)}
                className="w-full text-xs font-medium py-1.5 pl-3 pr-7 bg-white text-slate-800 border border-slate-300 rounded-lg cursor-pointer transition focus:outline-none focus:border-blue-500 appearance-none disabled:opacity-50"
              >
                <option value="">-- Unassigned (No Faculty) --</option>
                {professors.map(p => (
                  <option key={p._id} value={p._id}>
                    {p.name} ({p.professorId || p.email})
                  </option>
                ))}
              </select>
              <Icons.ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Enrolled Students in this Course */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex justify-between items-center bg-slate-50/70">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide flex items-center gap-2">
              <Icons.Users className="w-4 h-4 text-blue-600" />
              Officially Enrolled Students ({students.length})
            </h3>
            <p className="text-xs text-muted">Students registered for this course section.</p>
          </div>
          <Link
            to="/academic-admin/enrollment"
            className="text-xs font-semibold text-primary hover:underline"
          >
            Modify Enrollment &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Permanent Enrollment No.</th>
                <th className="py-3 px-4">Student Name</th>
                <th className="py-3 px-4 text-center">Division</th>
                <th className="py-3 px-4">Enrollment Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {students.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 px-4 text-center text-muted text-sm">
                    No officially enrolled students found for Semester {course?.semester || 1}.
                  </td>
                </tr>
              ) : (
                students.map(st => (
                  <tr key={st._id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-mono text-xs font-bold text-primary">
                      {st.enrollmentNumber || st.studentId || '21CE' + String(st._id).slice(-3)}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {st.name}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-bold text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                        Div {st.division || 'A'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-green-50 text-green-700 border border-green-200/60">
                        {st.status || 'Enrolled'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
