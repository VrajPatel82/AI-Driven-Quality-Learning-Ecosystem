import { useState, useEffect } from 'react';
import { usersAPI, adminAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function UniversityInstitutionAdmins() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    institutionId: ''
  });

  const uniName = user?.university?.name || user?.universityName || 'Apex National University';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, instRes] = await Promise.allSettled([
        usersAPI.getAll({ role: 'inst_admin' }),
        adminAPI.getInstitutions()
      ]);

      const instList = (instRes.status === 'fulfilled' && (instRes.value.data.data || instRes.value.data)) || [];
      setInstitutions(instList);

      if (usersRes.status === 'fulfilled') {
        setAdmins(usersRes.value.data.data || usersRes.value.data || []);
      }
    } catch {
      toast.error('Failed to load institution administrators');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email) return toast.error('Name and Email are required');
    if (!form.institutionId) return toast.error('Please assign a campus');

    try {
      if (editingAdmin) {
        await usersAPI.update(editingAdmin._id, {
          name: form.name,
          email: form.email,
          institution: form.institutionId
        });
        toast.success('Admin updated');
      } else {
        await usersAPI.create({
          name: form.name,
          email: form.email,
          password: form.password,
          role: 'inst_admin',
          institution: form.institutionId
        });
        toast.success('Institutional Admin created');
      }
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this Institutional Admin?')) return;
    try {
      await usersAPI.delete(id);
      toast.success('Admin removed');
      fetchData();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const resetForm = () => {
    setForm({ name: '', email: '', password: '', institutionId: institutions[0]?._id || '' });
    setEditingAdmin(null);
    setShowPassword(false);
    setShowForm(false);
  };

  const startEdit = (admin) => {
    setEditingAdmin(admin);
    setForm({
      name: admin.name || '',
      email: admin.email || '',
      password: '',
      institutionId: admin.institution?._id || admin.institution || ''
    });
    setShowForm(true);
  };

  const filtered = admins.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Institution Administrators</h1>
          <p className="text-muted mt-1 text-sm">
            {admins.length} campus administrator{admins.length !== 1 ? 's' : ''} provisioned.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="btn-primary px-4 py-2 rounded-btn text-sm flex items-center gap-2"
        >
          {showForm ? 'Cancel' : <><Icons.Plus className="w-4 h-4" /> Add Campus Admin</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-heading">
            {editingAdmin ? 'Edit Campus Administrator' : 'Assign New Campus Administrator'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Full Name *</label>
              <input
                type="text"
                placeholder="Prof. / Dr. Name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="form-input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Official Email *</label>
              <input
                type="email"
                placeholder="principal@campus.edu"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="form-input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">
                {editingAdmin ? 'Password (leave empty to keep)' : 'Initial Password *'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="form-input w-full pr-10"
                  required={!editingAdmin}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-slate-700"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Affiliated Campus *</label>
              <select
                value={form.institutionId}
                onChange={e => setForm({ ...form, institutionId: e.target.value })}
                className="form-input w-full"
                required
              >
                <option value="">Select Campus</option>
                {institutions.map(inst => (
                  <option key={inst._id} value={inst._id}>
                    {inst.name} ({inst.code || 'CAMPUS'})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-border rounded-btn text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary px-5 py-2 rounded-btn text-sm">
              {editingAdmin ? 'Save Changes' : 'Create Admin'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input w-72 text-sm"
          />
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm">
            No institutional administrators found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Administrator</th>
                  <th className="py-3.5 px-4">Assigned Campus</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(admin => (
                  <tr key={admin._id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {admin.name}
                      <p className="text-xs text-muted font-normal">{admin.email}</p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">
                        {admin.institution?.name || 'Assigned Campus'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">INST_ADMIN</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => startEdit(admin)}
                          className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
                        >
                          <Icons.Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(admin._id)}
                          className="p-1.5 hover:bg-red-50 rounded text-red-600"
                        >
                          <Icons.Trash className="w-4 h-4" />
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
    </div>
  );
}
