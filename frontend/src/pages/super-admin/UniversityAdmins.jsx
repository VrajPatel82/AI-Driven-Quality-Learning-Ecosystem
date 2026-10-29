import { useState, useEffect } from 'react';
import { universityAdminsAPI, universitiesAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function UniversityAdmins() {
  const [admins, setAdmins] = useState([]);
  const [universities, setUniversities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    universityId: '',
    status: 'active'
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [adminsRes, unisRes] = await Promise.allSettled([
        universityAdminsAPI.getAll(),
        universitiesAPI.getAll()
      ]);

      const loadedUnis = (unisRes.status === 'fulfilled' && (unisRes.value.data.data || unisRes.value.data)) || [];
      setUniversities(loadedUnis);

      if (adminsRes.status === 'fulfilled') {
        setAdmins(adminsRes.value.data.data || adminsRes.value.data || []);
      }
    } catch {
      toast.error('Failed to load university administrators');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email) return toast.error('Name and Email are required');
    if (!form.universityId) return toast.error('Please assign a University');
    if (!editingAdmin && !form.password) return toast.error('Password is required');

    try {
      if (editingAdmin) {
        await universityAdminsAPI.update(editingAdmin._id, {
          name: form.name,
          email: form.email,
          universityId: form.universityId
        });
        toast.success('University Admin updated');
      } else {
        await universityAdminsAPI.create({
          name: form.name,
          email: form.email,
          password: form.password,
          universityId: form.universityId
        });
        toast.success('University Admin created successfully');
      }
      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this University Admin?')) return;
    try {
      await universityAdminsAPI.delete(id);
      toast.success('University Admin removed');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      email: '',
      password: '',
      universityId: universities[0]?._id || '',
      status: 'active'
    });
    setEditingAdmin(null);
    setShowForm(false);
  };

  const startEdit = (admin) => {
    setEditingAdmin(admin);
    setForm({
      name: admin.name || '',
      email: admin.email || '',
      password: '',
      universityId: admin.university?._id || admin.university || universities[0]?._id || '',
      status: admin.status || 'active'
    });
    setShowForm(true);
  };

  const filtered = admins.filter(a =>
    a.name?.toLowerCase().includes(search.toLowerCase()) ||
    a.email?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">University Administrators</h1>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="btn-primary w-full sm:w-auto px-4 py-2 rounded-btn text-sm flex items-center justify-center gap-2"
        >
          {showForm ? 'Cancel' : <><Icons.Plus className="w-4 h-4" /> Create University Admin</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4">
          <h2 className="text-base sm:text-lg font-semibold text-heading">
            {editingAdmin ? 'Edit University Administrator' : 'Assign New University Administrator'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Full Name *</label>
              <input
                type="text"
                placeholder="Dr. John Doe"
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
                placeholder="vicechancellor@university.edu"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className="form-input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">
                {editingAdmin ? 'Password (leave blank to keep unchanged)' : 'Initial Password *'}
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className="form-input w-full"
                required={!editingAdmin}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Assigned University *</label>
              <select
                value={form.universityId}
                onChange={e => setForm({ ...form, universityId: e.target.value })}
                className="form-input w-full"
                required
              >
                <option value="">Select University</option>
                {universities.map(u => (
                  <option key={u._id} value={u._id}>
                    {u.name} ({u.code || 'UNI'})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="w-full sm:w-auto px-4 py-2 border border-border rounded-btn text-sm hover:bg-gray-50 text-slate-700 text-center"
            >
              Cancel
            </button>
            <button type="submit" className="w-full sm:w-auto btn-primary px-5 py-2 rounded-btn text-sm text-center">
              {editingAdmin ? 'Save Changes' : 'Save Administrator'}
            </button>
          </div>
        </form>
      )}

      {/* Table & Cards Container */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-3.5 sm:p-4 border-b border-border flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 sm:gap-4">
          <div className="relative w-full sm:w-72">
            <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              placeholder="Search by administrator name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-input w-full pl-9 text-sm"
            />
          </div>
          <span className="text-xs text-muted font-medium text-right sm:text-left">
            Total {filtered.length} Administrator{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Icons.Briefcase className="w-10 h-10 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold mt-2 text-slate-700">No University Admins Found</p>
          </div>
        ) : (
          <>
            {/* Desktop Table: exactly as original */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Administrator</th>
                  <th className="py-3 px-4">Assigned University</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(admin => (
                  <tr key={admin._id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">{admin.name}</div>
                      <div className="text-xs text-muted">{admin.email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-xs">
                        {admin.university?.name || admin.universityName || 'Assigned University'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-600">
                      UNIVERSITY_ADMIN
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        {admin.status || 'active'}
                      </span>
                    </td>
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

          {/* Mobile Cards: compact list items without horizontal scrolling */}
          <div className="block md:hidden divide-y divide-border">
            {filtered.map(admin => (
              <div key={admin._id} className="p-3.5 sm:p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-sm text-slate-900 break-words">{admin.name}</h4>
                    <p className="text-xs text-muted truncate mt-0.5">{admin.email}</p>
                  </div>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 bg-green-100 text-green-700">
                    {admin.status || 'active'}
                  </span>
                </div>

                <div className="space-y-1.5 bg-slate-50/70 p-2.5 rounded-lg border border-slate-100 text-xs">
                  <div>
                    <span className="text-muted text-[10px] uppercase font-medium block">Assigned University</span>
                    <span className="font-medium text-blue-700 break-words block mt-0.5">
                      {admin.university?.name || admin.universityName || 'Assigned University'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-200/60 pt-1.5 mt-1">
                    <span className="text-muted text-[10px] uppercase font-medium">Role</span>
                    <span className="font-mono text-[11px] text-slate-600">UNIVERSITY_ADMIN</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 gap-2">
                  <button
                    onClick={() => startEdit(admin)}
                    className="flex-1 py-1.5 px-3 border border-border rounded-btn text-xs font-semibold text-slate-700 hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Icons.Edit className="w-3.5 h-3.5 text-slate-600" /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(admin._id)}
                    className="py-1.5 px-3 border border-red-200 text-red-600 rounded-btn text-xs font-semibold hover:bg-red-50 flex items-center justify-center gap-1 transition-colors"
                    title="Delete"
                  >
                    <Icons.Trash className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      </div>
    </div>
  );
}
