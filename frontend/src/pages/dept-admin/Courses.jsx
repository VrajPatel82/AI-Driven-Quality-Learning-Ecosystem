import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { adminAPI, usersAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function DeptCourses() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', semester: 1, professor: '' });
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { 
    fetchData(); 
  }, [user?.department?._id]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [coursesRes, profsRes] = await Promise.allSettled([
        adminAPI.getCourses({ department: user?.department?._id, limit: 50 }),
        usersAPI.getAll({ role: 'professor', department: user?.department?._id, limit: 100 })
      ]);
      if (coursesRes.status === 'fulfilled') setCourses(coursesRes.value.data.data || []);
      if (profsRes.status === 'fulfilled') setProfessors(profsRes.value.data.data || []);
    } catch (err) {
      toast.error('Failed to load courses data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.name || !form.code) return toast.error('Name and code are required');
    setSaving(true);
    try {
      const courseData = {
        ...form,
        department: form.department || user?.department?._id
      };
      if (editId) {
        await adminAPI.updateCourse(editId, courseData);
        toast.success('Course updated successfully');
      } else {
        await adminAPI.createCourse(courseData);
        toast.success('Course created successfully');
      }
      setShowForm(false);
      setEditId(null);
      setForm({ name: '', code: '', semester: 1, professor: '' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save course');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (c) => {
    setForm({ 
      name: c.name, 
      code: c.code, 
      semester: c.semester || 1, 
      department: c.department?._id || c.department,
      professor: c.professor?._id || c.professor || ''
    });
    setEditId(c._id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this course?')) return;
    try {
      await adminAPI.deleteCourse(id);
      toast.success('Course deleted');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const filtered = courses.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Courses</h1>
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm({ name: '', code: '', semester: 1, professor: '' }); }} className="btn-primary">
          + Add Course
        </button>
      </div>

      {showForm && (
        <div className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-heading">{editId ? 'Edit' : 'Add'} Course</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="form-input w-full" placeholder="e.g. Machine Learning" />
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Code *</label>
              <input type="text" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} className="form-input w-full" placeholder="e.g. CS301" />
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Semester *</label>
              <select value={form.semester} onChange={e => setForm(f => ({ ...f, semester: parseInt(e.target.value) || 1 }))} className="form-input w-full">
                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Assigned Professor</label>
              <select value={form.professor} onChange={e => setForm(f => ({ ...f, professor: e.target.value }))} className="form-input w-full">
                <option value="">Select Professor (Optional)</option>
                {professors.map(p => (
                  <option key={p._id} value={p._id}>{p.name} {p.professorId ? `(${p.professorId})` : ''}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Saving...' : editId ? 'Update' : 'Create'}</button>
            <button onClick={() => { setShowForm(false); setEditId(null); }} className="px-4 py-2 border border-border rounded-btn hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      )}

      <input type="text" placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)} className="form-input w-full sm:w-64" />

      {loading ? (
        <div className="flex justify-center h-40"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-card border border-border"><p className="text-muted">No courses found</p></div>
      ) : (
        <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Code</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Semester</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Assigned Professor</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(c => (
                <tr key={c._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-heading">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-muted">{c.code}</td>
                  <td className="px-4 py-3 text-sm text-muted">Semester {c.semester}</td>
                  <td className="px-4 py-3 text-sm font-medium text-heading">
                    {c.professor?.name ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {c.professor.name}
                      </span>
                    ) : (
                      <span className="text-muted italic text-xs">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => handleEdit(c)} className="text-blue-600 hover:text-blue-800 text-sm">Edit</button>
                    <button onClick={() => handleDelete(c._id)} className="text-red-600 hover:text-red-800 text-sm">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
