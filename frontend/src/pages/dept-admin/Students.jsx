import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usersAPI, adminAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function DeptStudents() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    currentSemester: '1'
  });
  const [saving, setSaving] = useState(false);
  const [editingSemester, setEditingSemester] = useState(null);

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const res = await usersAPI.getAll({ 
        role: 'student', 
        department: user?.department?._id,
        limit: 100 
      });
      setStudents(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  const handleAddClick = () => {
    setEditId(null);
    setForm({
      name: '',
      email: '',
      password: '',
      currentSemester: '1'
    });
    setShowForm(true);
  };

  const handleEdit = (student) => {
    setEditId(student._id);
    setForm({
      name: student.name,
      email: student.email,
      password: '',
      currentSemester: student.currentSemester?.toString() || '1'
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.email) return toast.error('Name and email are required');
    if (!editId && !form.password) return toast.error('Password is required for new student');

    setSaving(true);
    try {
      if (editId) {
        const updateData = {
          name: form.name,
          currentSemester: parseInt(form.currentSemester)
        };
        if (form.password) {
          updateData.password = form.password;
        }
        await usersAPI.update(editId, updateData);
        toast.success('Student updated');
      } else {
        await usersAPI.create({
          name: form.name,
          email: form.email,
          password: form.password,
          role: 'student',
          institution: user?.institution?._id,
          department: user?.department?._id,
          currentSemester: parseInt(form.currentSemester)
        });
        toast.success('Student added');
      }
      setShowForm(false);
      setEditId(null);
      fetchStudents();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save student');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this student?')) return;
    try {
      await usersAPI.delete(id);
      toast.success('Student removed');
      fetchStudents();
    } catch (err) {
      toast.error('Failed to remove student');
    }
  };

  const handleUpdateSemester = async (studentId, newSemester) => {
    try {
      await usersAPI.updateSemester(studentId, {
        currentSemester: parseInt(newSemester)
      });
      toast.success('Semester updated');
      setEditingSemester(null);
      fetchStudents();
    } catch (err) {
      toast.error('Failed to update semester');
    }
  };

  const filtered = students.filter(s => {
    const matchesSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
                         s.email.toLowerCase().includes(search.toLowerCase()) ||
                         s.enrollmentNumber?.toLowerCase().includes(search.toLowerCase());
    const matchesSemester = !filterSemester || s.currentSemester?.toString() === filterSemester;
    return matchesSearch && matchesSemester;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Students</h1>
        </div>
        <button onClick={handleAddClick} className="btn-primary">Add Student</button>
      </div>

      {showForm && (
        <div className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-heading">{editId ? 'Edit Student' : 'Add Student'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              disabled={!!editId}
            />
            {!editId && (
              <input
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="form-input"
              />
            )}
            {editId && (
              <input
                type="password"
                placeholder="Password (leave blank to keep current)"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                className="form-input"
              />
            )}
            <select
              value={form.currentSemester}
              onChange={e => setForm(f => ({ ...f, currentSemester: e.target.value }))}
              className="form-input"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <option key={s} value={s.toString()}>Semester {s}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-border rounded-btn hover:bg-gray-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search by name, email, or enrollment number..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input flex-1"
        />
        <select
          value={filterSemester}
          onChange={e => setFilterSemester(e.target.value)}
          className="form-input w-full sm:w-32"
        >
          <option value="">All Semesters</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
            <option key={s} value={s.toString()}>Semester {s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center h-40"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-card border border-border"><p className="text-muted">No students found</p></div>
      ) : (
        <div className="bg-surface rounded-card shadow-card border border-border overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Email</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Enrollment #</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Semester</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(s => (
                <tr key={s._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm">
                        {s.name?.[0]}
                      </div>
                      <span className="font-medium text-heading">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">{s.email}</td>
                  <td className="px-4 py-3 text-sm text-muted font-mono bg-green-50 px-2 py-1 rounded">
                    {s.enrollmentNumber || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {editingSemester === s._id ? (
                      <div className="flex gap-2">
                        <select
                          value={editingSemester === s._id ? s.currentSemester : ''}
                          onChange={(e) => handleUpdateSemester(s._id, e.target.value)}
                          className="form-input text-sm py-1"
                        >
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                            <option key={sem} value={sem}>{sem}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="bg-yellow-50 text-yellow-700 px-2 py-1 rounded text-xs font-medium">
                          Sem {s.currentSemester || 1}
                        </span>
                        <button
                          onClick={() => setEditingSemester(s._id)}
                          className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                        >
                          Change
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right flex justify-end gap-2">
                    <button
                      onClick={() => handleEdit(s)}
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(s._id)}
                      className="text-red-600 hover:text-red-800 text-sm font-medium"
                    >
                      Remove
                    </button>
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
