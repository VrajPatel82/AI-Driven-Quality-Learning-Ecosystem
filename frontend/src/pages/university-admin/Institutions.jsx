import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { adminAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function UniversityInstitutions() {
  const { user } = useAuth();
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingInst, setEditingInst] = useState(null);
  const [form, setForm] = useState({
    name: '',
    code: '',
    address: '',
    contactEmail: '',
    contactPhone: ''
  });

  const uniName = user?.university?.name || user?.universityName || 'Apex National University';

  useEffect(() => {
    fetchInstitutions();
  }, []);

  const fetchInstitutions = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getInstitutions();
      setInstitutions(res.data.data || res.data || []);
    } catch {
      toast.error('Failed to load institutions');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Institution name is required');

    try {
      const payload = {
        ...form,
        university: user?.university?._id || user?.university
      };

      if (editingInst) {
        await adminAPI.updateInstitution(editingInst._id, payload);
        toast.success('Institution updated');
      } else {
        await adminAPI.createInstitution(payload);
        toast.success('Institution added under ' + uniName);
      }
      resetForm();
      fetchInstitutions();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this institution from university?')) return;
    try {
      await adminAPI.deleteInstitution(id);
      toast.success('Institution deleted');
      fetchInstitutions();
    } catch {
      toast.error('Failed to delete institution');
    }
  };

  const resetForm = () => {
    setForm({ name: '', code: '', address: '', contactEmail: '', contactPhone: '' });
    setEditingInst(null);
    setShowForm(false);
  };

  const startEdit = (inst) => {
    setEditingInst(inst);
    setForm({
      name: inst.name || '',
      code: inst.code || '',
      address: inst.address || '',
      contactEmail: inst.contactEmail || '',
      contactPhone: inst.contactPhone || ''
    });
    setShowForm(true);
  };

  const filtered = institutions.filter(i =>
    i.name?.toLowerCase().includes(search.toLowerCase()) ||
    i.code?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Institutions</h1>
          <p className="text-muted mt-1 text-sm">
            {institutions.length} affiliated campus{institutions.length !== 1 ? 'es' : ''} enrolled.
          </p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(!showForm); }}
          className="btn-primary px-4 py-2 rounded-btn text-sm flex items-center gap-2"
        >
          {showForm ? 'Cancel' : <><Icons.Plus className="w-4 h-4" /> Add Campus / College</>}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-border pb-3">
            <h2 className="text-lg font-semibold text-heading">
              {editingInst ? 'Edit Institution' : 'Register New Campus / College'}
            </h2>
            <span className="text-xs bg-blue-100 text-blue-800 font-semibold px-2.5 py-0.5 rounded">
              Locked to: {uniName}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Campus / College Name *</label>
              <input
                type="text"
                placeholder="e.g. Institute of Technology"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="form-input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Code / Abbreviation</label>
              <input
                type="text"
                placeholder="e.g. IOT"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="form-input w-full"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1 text-slate-700">Campus Address</label>
              <input
                type="text"
                placeholder="Campus address location"
                value={form.address}
                onChange={e => setForm({ ...form, address: e.target.value })}
                className="form-input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Contact Email</label>
              <input
                type="email"
                placeholder="principal@college.edu"
                value={form.contactEmail}
                onChange={e => setForm({ ...form, contactEmail: e.target.value })}
                className="form-input w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Contact Phone</label>
              <input
                type="text"
                placeholder="+91 ..."
                value={form.contactPhone}
                onChange={e => setForm({ ...form, contactPhone: e.target.value })}
                className="form-input w-full"
              />
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
              {editingInst ? 'Save Changes' : 'Save Institution'}
            </button>
          </div>
        </form>
      )}

      {/* Table */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <input
            type="text"
            placeholder="Search campus by name or code..."
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
          <div className="p-12 text-center">
            <Icons.Landmark className="w-10 h-10 text-slate-400 mx-auto" />
            <p className="text-sm font-semibold mt-2 text-slate-700">No Institutions Registered</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Campus / College</th>
                  <th className="py-3.5 px-4">Code</th>
                  <th className="py-3.5 px-4">Contact</th>
                  <th className="py-3.5 px-4">Address</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(inst => (
                  <tr key={inst._id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      <Link to={`/university-admin/institutions/${inst._id}`} className="text-blue-600 hover:underline">
                        {inst.name}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {inst.code || 'N/A'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">
                      {inst.contactEmail && inst.contactPhone
                        ? `${inst.contactEmail} (${inst.contactPhone})`
                        : inst.contactEmail || inst.contactPhone || 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 max-w-xs truncate">{inst.address || 'N/A'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/university-admin/institutions/${inst._id}`}
                          className="p-1.5 hover:bg-slate-100 rounded text-blue-600"
                          title="View Campus"
                        >
                          <Icons.Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => startEdit(inst)}
                          className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
                          title="Edit"
                        >
                          <Icons.Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(inst._id)}
                          className="p-1.5 hover:bg-red-50 rounded text-red-600"
                          title="Delete"
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
