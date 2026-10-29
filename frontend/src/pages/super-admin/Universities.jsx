import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { universitiesAPI, adminAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function SuperUniversities() {
  const [universities, setUniversities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUni, setEditingUni] = useState(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    state: '',
    address: '',
    contactEmail: '',
    contactPhone: '',
    status: 'active'
  });

  useEffect(() => {
    fetchUniversities();
  }, []);

  const fetchUniversities = async () => {
    setLoading(true);
    try {
      const res = await universitiesAPI.getAll();
      setUniversities(res.data.data || res.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load universities');
      setUniversities([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('University name is required');
    if (!form.code.trim()) return toast.error('University code is required');

    try {
      const payload = { ...form, acronym: form.code.trim().toUpperCase(), code: form.code.trim().toUpperCase() };
      if (editingUni) {
        await universitiesAPI.update(editingUni._id, payload);
        toast.success('University updated successfully');
      } else {
        await universitiesAPI.create(payload);
        toast.success('University created successfully');
      }
      resetForm();
      fetchUniversities();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to deactivate/delete this university?')) return;
    try {
      await universitiesAPI.delete(id);
      toast.success('University deleted');
      fetchUniversities();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete university');
    }
  };

  const resetForm = () => {
    setForm({
      name: '',
      code: '',
      state: '',
      address: '',
      contactEmail: '',
      contactPhone: '',
      status: 'active'
    });
    setEditingUni(null);
    setShowForm(false);
  };

  const startEdit = (uni) => {
    setEditingUni(uni);
    setForm({
      name: uni.name || '',
      code: uni.code || '',
      state: uni.state || '',
      address: uni.address || '',
      contactEmail: uni.contactEmail || '',
      contactPhone: uni.contactPhone || '',
      status: uni.status || 'active'
    });
    setShowForm(true);
  };

  const filtered = universities.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">Universities</h1>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="btn-primary w-full sm:w-auto px-4 py-2 rounded-btn text-sm flex items-center justify-center gap-2"
        >
          {showForm ? 'Cancel' : <><Icons.Plus className="w-4 h-4" /> Add University</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4">
          <h2 className="text-base sm:text-lg font-semibold text-heading">
            {editingUni ? 'Edit University' : 'Create New University'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">University Name *</label>
              <input
                type="text"
                placeholder="e.g. Gujarat Technological University"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="form-input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">University Acronym *</label>
              <input
                type="text"
                placeholder="e.g. IITB or GTU"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase().trim() })}
                className="form-input w-full"
                required
              />
              <p className="text-[11px] text-muted mt-1">Acronym used for student enrollment numbers &amp; college emails</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">State / Region</label>
              <input
                type="text"
                placeholder="e.g. Gujarat"
                value={form.state}
                onChange={e => setForm({ ...form, state: e.target.value })}
                className="form-input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Status</label>
              <select
                value={form.status}
                onChange={e => setForm({ ...form, status: e.target.value })}
                className="form-input w-full"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1 text-slate-700">Campus Address</label>
              <input
                type="text"
                placeholder="Main university campus address"
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                className="form-input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Contact Email</label>
              <input
                type="email"
                placeholder="admin@university.edu.in"
                value={form.contactEmail}
                onChange={e => setForm({ ...form, contactEmail: e.target.value })}
                className="form-input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Contact Phone</label>
              <input
                type="text"
                placeholder="+91 79 12345678"
                value={form.contactPhone}
                onChange={e => setForm({ ...form, contactPhone: e.target.value })}
                className="form-input w-full"
              />
            </div>
          </div>
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="w-full sm:w-auto px-4 py-2 border border-border rounded-btn text-sm hover:bg-gray-50 text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto btn-primary px-5 py-2 rounded-btn text-sm"
            >
              {editingUni ? 'Save Changes' : 'Create University'}
            </button>
          </div>
        </form>
      )}

      {/* Search & Stats Bar */}
      <div className="bg-surface rounded-card shadow-card border border-border p-3.5 sm:p-4 flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-2.5 sm:gap-4">
        <div className="relative w-full sm:w-80">
          <Icons.Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search universities by name or code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input w-full pl-9 text-sm"
          />
        </div>
        <span className="text-xs text-muted font-medium text-right sm:text-left">
          Showing {filtered.length} of {universities.length} Universities
        </span>
      </div>

      {/* Universities Content */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-sm text-muted mt-3">Loading universities...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Icons.GraduationCap className="w-12 h-12 text-slate-400 mx-auto" />
            <h3 className="text-base font-semibold mt-3 text-slate-800">No Universities Found</h3>
            <p className="text-sm text-muted mt-1">Get started by creating your first university.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table: exactly as original */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                  <tr>
                    <th className="py-3.5 px-4">University</th>
                    <th className="py-3.5 px-4">Code</th>
                    <th className="py-3.5 px-4">State</th>
                    <th className="py-3.5 px-4 text-center">Institutions</th>
                    <th className="py-3.5 px-4 text-center">Departments</th>
                    <th className="py-3.5 px-4 text-center">Students</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map(uni => (
                    <tr key={uni._id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <Link to={`/super-admin/universities/${uni._id}`} className="font-semibold text-blue-600 hover:underline">
                          {uni.name}
                        </Link>
                        {uni.contactEmail && (
                          <p className="text-xs text-muted mt-0.5">{uni.contactEmail}</p>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {uni.code || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600">{uni.state || 'National'}</td>
                      <td className="py-3 px-4 text-center font-medium text-slate-800">
                        {uni.institutionsCount ?? '-'}
                      </td>
                      <td className="py-3 px-4 text-center font-medium text-slate-800">
                        {uni.departmentsCount ?? '-'}
                      </td>
                      <td className="py-3 px-4 text-center font-medium text-slate-800">
                        {uni.studentsCount ?? '-'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          uni.status === 'inactive' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {uni.status || 'active'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            to={`/super-admin/universities/${uni._id}`}
                            className="p-1.5 hover:bg-slate-100 rounded text-blue-600"
                            title="View Details"
                          >
                            <Icons.Eye className="w-4 h-4" />
                          </Link>
                          <button
                            onClick={() => startEdit(uni)}
                            className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
                            title="Edit"
                          >
                            <Icons.Edit className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(uni._id)}
                            className="p-1.5 hover:bg-red-50 rounded text-red-600"
                            title="Delete / Deactivate"
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
              {filtered.map(uni => (
                <div key={uni._id} className="p-3.5 sm:p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/super-admin/universities/${uni._id}`}
                        className="font-bold text-sm text-blue-600 hover:underline break-words"
                      >
                        {uni.name}
                      </Link>
                      {uni.contactEmail && (
                        <p className="text-xs text-muted truncate mt-0.5">{uni.contactEmail}</p>
                      )}
                    </div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0 ${
                      uni.status === 'inactive' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {uni.status || 'active'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50/70 p-2.5 rounded-lg border border-slate-100">
                    <div>
                      <span className="text-muted text-[10px] uppercase font-medium block">Code</span>
                      <span className="font-mono font-semibold text-slate-800">{uni.code || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-muted text-[10px] uppercase font-medium block">State</span>
                      <span className="text-slate-700 truncate block">{uni.state || 'National'}</span>
                    </div>
                    <div>
                      <span className="text-muted text-[10px] uppercase font-medium block">Institutions</span>
                      <span className="font-semibold text-slate-800">{uni.institutionsCount ?? '-'}</span>
                    </div>
                    <div>
                      <span className="text-muted text-[10px] uppercase font-medium block">Departments</span>
                      <span className="font-semibold text-slate-800">{uni.departmentsCount ?? '-'}</span>
                    </div>
                    <div className="col-span-2 flex items-center justify-between border-t border-slate-200/60 pt-1.5 mt-0.5">
                      <span className="text-muted text-[11px]">Enrolled Students</span>
                      <span className="font-bold text-slate-800">{uni.studentsCount ?? '-'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 gap-2">
                    <Link
                      to={`/super-admin/universities/${uni._id}`}
                      className="flex-1 py-1.5 px-3 bg-blue-50 text-blue-700 rounded-btn text-xs font-semibold flex items-center justify-center gap-1.5 hover:bg-blue-100 transition-colors"
                    >
                      <Icons.Eye className="w-3.5 h-3.5" /> View
                    </Link>
                    <button
                      onClick={() => startEdit(uni)}
                      className="flex-1 py-1.5 px-3 border border-border rounded-btn text-xs font-semibold text-slate-700 hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Icons.Edit className="w-3.5 h-3.5 text-slate-600" /> Edit
                    </button>
                    <button
                      onClick={() => handleDelete(uni._id)}
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
