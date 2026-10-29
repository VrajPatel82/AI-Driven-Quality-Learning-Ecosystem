import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usersAPI, adminAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function DeptFaculty() {
  const { user } = useAuth();
  const [faculty, setFaculty] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editingProfessor, setEditingProfessor] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', department: '', courses: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => { 
    fetchFaculty();
    const deptId = user?.department?._id || user?.department;
    if (deptId) {
      fetchCourses(deptId);
    }
  }, [user?.department]);

  useEffect(() => {
    const deptId = user?.department?._id || user?.department;
    if (deptId) {
      setForm(f => ({ ...f, department: deptId }));
    }
  }, [user?.department]);

  const fetchFaculty = async () => {
    setLoading(true);
    try {
      const deptId = user?.department?._id || user?.department;
      const res = await usersAPI.getAll({ 
        role: 'professor', 
        department: deptId,
        limit: 50 
      });
      const facultyData = res.data.data || [];
      setFaculty(facultyData);
    } catch (err) {
      toast.error('Failed to load faculty');
    } finally {
      setLoading(false);
    }
  };

  const fetchCourses = async (departmentId) => {
    try {
      const res = await adminAPI.getCourses({ limit: 100, department: departmentId });
      const allCourses = res.data.data || [];
      console.log('Fetched courses:', allCourses);
      setCourses(allCourses);
      if (!allCourses || allCourses.length === 0) {
        console.warn('No courses found for department:', departmentId);
      }
    } catch (err) {
      console.error('Failed to load courses:', err);
      toast.error('Failed to load courses');
    }
  };

  const handleAdd = async () => {
    if (!form.name || !form.email || !form.password || !form.department) return toast.error('All fields required');
    setSaving(true);
    try {
      await usersAPI.create({ 
        ...form, 
        role: 'professor',
        institution: user?.institution?._id,
        department: form.department,
        courses: form.courses
      });
      toast.success('Professor added');
      setShowForm(false);
      setForm({ name: '', email: '', password: '', department: user?.department?._id || '', courses: [] });
      fetchFaculty();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add professor');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this faculty member?')) return;
    try {
      await usersAPI.delete(id);
      toast.success('Faculty removed');
      fetchFaculty();
    } catch (err) {
      toast.error('Failed to remove');
    }
  };

  const handleEditCourses = (prof) => {
    // Normalize courses array to string IDs in case prof.courses contains populated course objects
    const currentCourseIds = (prof.courses || []).map(c => typeof c === 'object' ? (c._id?.toString() || c._id) : c);
    setEditingProfessor({ ...prof, courses: currentCourseIds });
    setShowCourseModal(true);
  };

  const handleSaveCourses = async () => {
    if (!editingProfessor) return;
    try {
      await usersAPI.update(editingProfessor._id, { courses: editingProfessor.courses || [] });
      toast.success('Courses assigned to professor');
      setShowCourseModal(false);
      setEditingProfessor(null);
      fetchFaculty();
    } catch (err) {
      toast.error('Failed to save courses');
    }
  };

  const toggleCourse = (courseId) => {
    if (!editingProfessor) return;
    const currentCourses = (editingProfessor.courses || []).map(c => typeof c === 'object' ? (c._id?.toString() || c._id) : c);
    const updated = currentCourses.includes(courseId)
      ? currentCourses.filter(c => c !== courseId)
      : [...currentCourses, courseId];
    setEditingProfessor({ ...editingProfessor, courses: updated });
  };

  const filtered = faculty.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.email.toLowerCase().includes(search.toLowerCase()) ||
    f.professorId?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Faculty</h1>
        </div>
        <button onClick={() => setShowForm(true)} className="btn-primary">Add Professor</button>
      </div>

      {showForm && (
        <div className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-heading">Add Professor</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <input 
              type="text" 
              placeholder="Full Name" 
              value={form.name} 
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} 
              className="form-input" 
            />
            <input 
              type="email" 
              placeholder="Email" 
              value={form.email} 
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))} 
              className="form-input" 
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={form.password} 
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))} 
              className="form-input" 
            />
            <div>
              <select
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                className="form-input"
              >
                <option value="">Select Department</option>
                {user?.department && (
                  <option value={user.department._id}>{user.department.name}</option>
                )}
              </select>
            </div>
          </div>
          
          {/* Courses Selection */}
          <div>
            <label className="block text-sm font-medium text-heading mb-2">Assign Courses (Multiple Selection)</label>
            <div className="bg-gray-50 rounded-btn border border-border p-4 space-y-2 max-h-40 overflow-y-auto">
              {courses.length === 0 ? (
                <p className="text-sm text-muted">No courses available in this department</p>
              ) : (
                courses.map(course => (
                  <label key={course._id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.courses.includes(course._id)}
                      onChange={() => {
                        const updated = form.courses.includes(course._id)
                          ? form.courses.filter(c => c !== course._id)
                          : [...form.courses, course._id];
                        setForm(f => ({ ...f, courses: updated }));
                      }}
                      className="w-4 h-4"
                    />
                    <span className="text-sm text-heading">{course.name} (Sem {course.semester})</span>
                  </label>
                ))
              )}
            </div>
            {form.courses.length > 0 && (
              <p className="text-xs text-blue-600 mt-1">{form.courses.length} course(s) selected</p>
            )}
          </div>
          
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Adding...' : 'Add'}</button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded-btn hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <input type="text" placeholder="Search faculty..." value={search} onChange={e => setSearch(e.target.value)} className="form-input w-full sm:w-64" />

      {loading ? (
        <div className="flex justify-center h-40"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-card border border-border"><p className="text-muted">No faculty found</p></div>
      ) : (
        <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Email</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Professor ID</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Assigned Courses</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(f => (
                <tr key={f._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-bold text-sm">{f.name?.[0]}</div>
                      <span className="font-medium text-heading">{f.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">{f.email}</td>
                  <td className="px-4 py-3 text-sm text-muted font-mono bg-blue-50 px-2 py-1 rounded">{f.professorId || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    {f.courses && f.courses.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {f.courses.map((courseItem, idx) => {
                          const cId = typeof courseItem === 'object' ? (courseItem._id?.toString() || courseItem._id) : courseItem;
                          const cName = typeof courseItem === 'object' 
                            ? (courseItem.name || courseItem.code || 'Course') 
                            : (courses.find(c => c._id === cId)?.name || cId);
                          return (
                            <span key={cId || idx} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                              {cName}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-muted text-xs">No courses assigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right flex justify-end gap-2">
                    <button onClick={() => handleEditCourses(f)} className="text-blue-600 hover:text-blue-800 text-sm">Edit Courses</button>
                    <button onClick={() => handleDelete(f._id)} className="text-red-600 hover:text-red-800 text-sm">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Course Assignment Modal */}
      {showCourseModal && editingProfessor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl max-h-96 overflow-y-auto">
            <h3 className="text-lg font-bold text-heading mb-4">
              Assign Courses to {editingProfessor.name}
            </h3>
            
            <div className="space-y-3 mb-6">
              {courses && courses.length > 0 ? (
                courses.map(course => (
                  <label key={course._id} className="flex items-center p-3 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer">
                    <input 
                      type="checkbox"
                      checked={(editingProfessor.courses || []).map(c => typeof c === 'object' ? (c._id?.toString() || c._id) : c).includes(course._id)}
                      onChange={() => toggleCourse(course._id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="ml-3 font-medium text-heading">{course.name}</span>
                    {course.code && <span className="ml-auto text-sm text-muted">{course.code}</span>}
                  </label>
                ))
              ) : (
                <div className="p-4 text-center bg-gray-50 rounded border border-gray-200">
                  <p className="text-muted text-sm">
                    {courses && courses.length === 0 
                      ? 'No courses available in this department' 
                      : 'Loading courses...'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowCourseModal(false);
                  setEditingProfessor(null);
                }}
                className="px-4 py-2 text-muted border border-gray-300 rounded hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCourses}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                Save Courses
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
