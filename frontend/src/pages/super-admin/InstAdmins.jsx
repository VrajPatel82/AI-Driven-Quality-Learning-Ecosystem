import { useState, useEffect } from 'react';
import { usersAPI, adminAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function SuperInstAdmins() {
  const [admins, setAdmins] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', institution: '' });

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const [adminsRes, instRes] = await Promise.allSettled([
        usersAPI.getAll({ role: 'inst_admin', limit: 100 }),
        adminAPI.getInstitutions()
      ]);
      if (adminsRes.status === 'fulfilled') setAdmins(adminsRes.value.data.data || []);
      if (instRes.status === 'fulfilled') setInstitutions(instRes.value.data.data || instRes.value.data || []);
    } catch (err) { toast.error('Failed to load data'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await usersAPI.create({ ...form, role: 'inst_admin' });
      toast.success('Institution admin created');
      setForm({ name: '', email: '', password: '', institution: '' });
      setShowForm(false);
      fetchData();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to create admin'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Remove this institution admin?')) return;
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
          <h1 className="text-2xl font-bold text-heading">Institution Admins</h1>
          <p className="text-muted mt-1">{admins.length} admin{admins.length !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary px-4 py-2 rounded-btn text-sm">
          {showForm ? 'Cancel' : '+ Add Admin'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-heading">New Institution Admin</h2>
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
              <input type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})} className="form-input w-full" required minLength={6} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Institution *</label>
              <select value={form.institution} onChange={e => setForm({...form, institution: e.target.value})} className="form-input w-full" required>
                <option value="">Select institution</option>
                {institutions.map(i => <option key={i._id} value={i._id}>{i.name}</option>)}
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
              <th className="text-left px-4 py-3 text-sm font-medium text-muted">Institution</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-muted">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr><td colSpan={4} className="text-center py-8 text-muted">No institution admins found</td></tr>
            ) : (
              filtered.map(admin => (
                <tr key={admin._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-medium">
                        {admin.name?.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium">{admin.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-muted">{admin.email}</td>
                  <td className="px-4 py-3 text-sm">{admin.institution?.name || '—'}</td>
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
