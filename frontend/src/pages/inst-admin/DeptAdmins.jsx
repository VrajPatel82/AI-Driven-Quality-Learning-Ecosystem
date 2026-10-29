import { useState, useEffect } from 'react';
import { usersAPI, adminAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function InstDeptAdmins() {
  const [admins, setAdmins] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', department: '' });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [adminsRes, deptRes] = await Promise.allSettled([
        usersAPI.getAll({ role: 'dept_admin', limit: 100 }),
        adminAPI.getDepartments()
      ]);
      if (adminsRes.status === 'fulfilled') setAdmins(adminsRes.value.data.data || []);
      if (deptRes.status === 'fulfilled') setDepartments(deptRes.value.data.data || deptRes.value.data || []);
    } catch (err) { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await usersAPI.create({ ...form, role: 'dept_admin' });
      toast.success('Department admin created');
      setForm({ name: '', email: '', password: '', department: '' });
      setShowPassword(false);
      setShowForm(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create admin'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this department admin?')) return;
    try {
      await usersAPI.delete(id);
      toast.success('Admin removed');
      fetchData();
    } catch (err) { toast.error('Failed to remove admin'); }
  };

  const filtered = admins.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Department Admins</h1>
          <p className="text-muted mt-1">{admins.length} admin{admins.length !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setShowPassword(false); }} className="btn-primary px-4 py-2 rounded-btn text-sm">
          {showForm ? 'Cancel' : '+ Add Admin'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-heading">New Department Admin</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="form-input w-full" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email *</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="form-input w-full" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Password *</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm({...form, password: e.target.value})}
                  className="form-input w-full pr-10"
                  required
                  minLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-slate-700 focus:outline-none"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Department *</label>
              <select value={form.department} onChange={e => setForm({...form, department: e.target.value})} className="form-input w-full" required>
                <option value="">Select department</option>
                {departments.map(d => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="btn-primary px-4 py-2 rounded-btn text-sm">Create Admin</button>
        </form>
      )}

      <input type="text" placeholder="Search admins..." value={search} onChange={e => setSearch(e.target.value)} className="form-input w-full max-w-md" />

      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted">Email</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-muted">Department</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-muted">No department admins found</td></tr>
            ) : (
              filtered.map(admin => (
                <tr key={admin._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center text-sm font-medium">
                        {admin.name?.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{admin.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">{admin.email}</td>
                  <td className="px-4 py-3 text-sm">{admin.department?.name || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => handleDelete(admin._id)} className="text-red-600 hover:text-red-800 text-sm">Remove</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
