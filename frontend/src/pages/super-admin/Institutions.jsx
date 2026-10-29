import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function SuperInstitutions() {
  const [institutions, setInstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingInst, setEditingInst] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', address: '', contactEmail: '', contactPhone: '' });

  useEffect(() => { fetchInstitutions(); }, []);

  const fetchInstitutions = async () => {
    try {
      const res = await adminAPI.getInstitutions();
      setInstitutions(res.data.data || res.data || []);
    } catch (err) { toast.error('Failed to load institutions'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingInst) {
        await adminAPI.updateInstitution(editingInst._id, form);
        toast.success('Institution updated');
      } else {
        await adminAPI.createInstitution(form);
        toast.success('Institution created');
      }
      resetForm();
      fetchInstitutions();
    } catch (err) { toast.error(err.response?.data?.message || 'Operation failed'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this institution? This will affect all associated data.')) return;
    try {
      await adminAPI.deleteInstitution(id);
      toast.success('Institution deleted');
      fetchInstitutions();
    } catch (err) { toast.error('Failed to delete'); }
  };

  const resetForm = () => {
    setForm({ name: '', code: '', address: '', contactEmail: '', contactPhone: '' });
    setEditingInst(null);
    setShowForm(false);
  };

  const startEdit = (inst) => {
    setEditingInst(inst);
    setForm({ name: inst.name, code: inst.code || '', address: inst.address || '', contactEmail: inst.contactEmail || '', contactPhone: inst.contactPhone || '' });
    setShowForm(true);
  };

  const filtered = institutions.filter(i => i.name?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Institutions</h1>
          <p className="text-muted mt-1">{institutions.length} institution{institutions.length !== 1 ? 's' : ''} registered</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="btn-primary px-4 py-2 rounded-btn text-sm">
          {showForm ? 'Cancel' : '+ Add Institution'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-heading">{editingInst ? 'Edit' : 'New'} Institution</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="form-input w-full" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Code</label>
              <input type="text" value={form.code} onChange={e => setForm({...form, code: e.target.value})} className="form-input w-full" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-1">Address</label>
              <input type="text" value={form.address} onChange={e => setForm({...form, address: e.target.value})} className="form-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contact Email</label>
              <input type="email" value={form.contactEmail} onChange={e => setForm({...form, contactEmail: e.target.value})} className="form-input w-full" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contact Phone</label>
              <input type="text" value={form.contactPhone} onChange={e => setForm({...form, contactPhone: e.target.value})} className="form-input w-full" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary px-4 py-2 rounded-btn text-sm">{editingInst ? 'Update' : 'Create'}</button>
            <button type="button" onClick={resetForm} className="px-4 py-2 border border-border rounded-btn text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      )}

      <input type="text" placeholder="Search institutions..." value={search} onChange={e => setSearch(e.target.value)} className="form-input w-full max-w-md" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted">No institutions found</div>
        ) : (
          filtered.map(inst => (
            <div key={inst._id} className="bg-surface rounded-card shadow-card border border-border p-5">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-heading">{inst.name}</h3>
                  {inst.code && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full mt-1 inline-block">{inst.code}</span>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(inst)} className="text-blue-600 hover:text-blue-800 text-sm px-2 py-1">Edit</button>
                  <button onClick={() => handleDelete(inst._id)} className="text-red-600 hover:text-red-800 text-sm px-2 py-1">Delete</button>
                </div>
              </div>
              {inst.address && <p className="text-sm text-muted mt-2">{inst.address}</p>}
              <div className="mt-3 pt-3 border-t border-border grid grid-cols-2 gap-2 text-sm">
                {inst.contactEmail && <div><span className="text-muted">Email:</span> <span className="text-body">{inst.contactEmail}</span></div>}
                {inst.contactPhone && <div><span className="text-muted">Phone:</span> <span className="text-body">{inst.contactPhone}</span></div>}
              </div>
              <div className="mt-2 text-sm text-muted">
                <span>{inst.departments?.length || 0} departments</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
