import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { usersAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Icons } from '../../components/shared/Icons';

export default function DeptAcademicAdmins() {
  const { user } = useAuth();
  const [academicAdmins, setAcademicAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  
  const [addForm, setAddForm] = useState({
    name: '',
    email: '',
    password: '',
    phone: ''
  });
  
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: ''
  });
  
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAcademicAdmins();
  }, [user?.department]);

  const fetchAcademicAdmins = async () => {
    setLoading(true);
    try {
      const deptId = user?.department?._id || user?.department;
      const res = await usersAPI.getAll({
        role: 'academic_administrator',
        department: deptId,
        limit: 100
      });
      setAcademicAdmins(res.data.data || []);
    } catch (err) {
      console.error('Failed to load academic administrators:', err);
      toast.error('Failed to load academic administrators');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addForm.name || !addForm.email || !addForm.password) {
      return toast.error('Name, Email, and Password are required');
    }

    setSaving(true);
    try {
      const deptId = user?.department?._id || user?.department;
      const instId = user?.institution?._id || user?.institution;
      
      await usersAPI.create({
        name: addForm.name,
        email: addForm.email,
        password: addForm.password,
        phone: addForm.phone,
        role: 'academic_administrator',
        department: deptId,
        institution: instId
      });

      toast.success('Academic Administrator added successfully');
      setShowAddModal(false);
      setAddForm({ name: '', email: '', password: '', phone: '' });
      fetchAcademicAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to add academic administrator');
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (admin) => {
    setEditingAdmin(admin);
    setEditForm({
      name: admin.name || '',
      email: admin.email || '',
      phone: admin.phone || '',
      password: ''
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingAdmin) return;

    setSaving(true);
    try {
      const payload = {
        name: editForm.name,
        email: editForm.email,
        phone: editForm.phone
      };
      if (editForm.password) {
        payload.password = editForm.password;
      }

      await usersAPI.update(editingAdmin._id, payload);
      toast.success('Academic Administrator updated successfully');
      setEditingAdmin(null);
      fetchAcademicAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update academic administrator');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to remove ${name}?`)) return;
    try {
      await usersAPI.delete(id);
      toast.success('Academic Administrator removed');
      fetchAcademicAdmins();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove academic administrator');
    }
  };

  const filtered = academicAdmins.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase()) ||
    a.phone?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Academic Administrators</h1>
        </div>
        <button 
          onClick={() => setShowAddModal(true)} 
          className="btn-primary flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Academic Admin
        </button>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-card shadow-card border border-border p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold text-heading">Add Academic Administrator</h2>
              <button onClick={() => setShowAddModal(false)} className="text-muted hover:text-heading" aria-label="Close"><Icons.X className="w-5 h-5" /></button>
            </div>
            
            <form onSubmit={handleAdd} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-heading mb-1">Full Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Neha Gupta"
                  value={addForm.name}
                  onChange={e => setAddForm({ ...addForm, name: e.target.value })}
                  className="form-input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-heading mb-1">Email *</label>
                <input
                  type="email"
                  placeholder="acad.cse@iitb.ac.in"
                  value={addForm.email}
                  onChange={e => setAddForm({ ...addForm, email: e.target.value })}
                  className="form-input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-heading mb-1">Password *</label>
                <input
                  type="password"
                  placeholder="Password@123"
                  value={addForm.password}
                  onChange={e => setAddForm({ ...addForm, password: e.target.value })}
                  className="form-input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-heading mb-1">Phone Number</label>
                <input
                  type="text"
                  placeholder="+91-9876543210"
                  value={addForm.phone}
                  onChange={e => setAddForm({ ...addForm, phone: e.target.value })}
                  className="form-input w-full"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-border rounded-btn hover:bg-gray-50 text-body"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary disabled:opacity-50"
                >
                  {saving ? 'Creating...' : 'Create Academic Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingAdmin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-card shadow-card border border-border p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg font-semibold text-heading">Edit Academic Administrator</h2>
              <button onClick={() => setEditingAdmin(null)} className="text-muted hover:text-heading" aria-label="Close"><Icons.X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-heading mb-1">Full Name *</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="form-input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-heading mb-1">Email *</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  className="form-input w-full"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-heading mb-1">Phone Number</label>
                <input
                  type="text"
                  value={editForm.phone}
                  onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                  className="form-input w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-heading mb-1">
                  Reset Password <span className="text-xs text-muted font-normal">(Leave blank to keep unchanged)</span>
                </label>
                <input
                  type="password"
                  placeholder="Enter new password"
                  value={editForm.password}
                  onChange={e => setEditForm({ ...editForm, password: e.target.value })}
                  className="form-input w-full"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingAdmin(null)}
                  className="px-4 py-2 border border-border rounded-btn hover:bg-gray-50 text-body"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <input 
          type="text" 
          placeholder="Search academic administrators..." 
          value={search} 
          onChange={e => setSearch(e.target.value)} 
          className="form-input w-full sm:w-80" 
        />
        <span className="text-xs text-muted">
          Total: {filtered.length} administrator(s)
        </span>
      </div>

      {/* List / Table */}
      {loading ? (
        <div className="flex justify-center h-40 items-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-card border border-border">
          <p className="text-muted">No academic administrators found in this department</p>
        </div>
      ) : (
        <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-border">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Name</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Email</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Phone</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-muted">Department</th>
                <th className="text-right px-4 py-3 text-sm font-medium text-muted">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(admin => (
                <tr key={admin._id} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-bold text-sm">
                        {admin.name?.[0]?.toUpperCase() || 'A'}
                      </div>
                      <span className="font-medium text-heading">{admin.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-body">{admin.email}</td>
                  <td className="px-4 py-3 text-sm text-muted">{admin.phone || '—'}</td>
                  <td className="px-4 py-3 text-sm text-muted">
                    {admin.department?.name || user?.department?.name || 'CSE'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => openEditModal(admin)} 
                        className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDelete(admin._id, admin.name)} 
                        className="text-red-600 hover:text-red-800 text-sm font-medium"
                      >
                        Remove
                      </button>
                    </div>
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
