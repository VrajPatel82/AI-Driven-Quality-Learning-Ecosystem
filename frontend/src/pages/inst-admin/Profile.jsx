import { useState, useEffect } from 'react';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function InstProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', bio: '' });

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    try {
      const res = await authAPI.getProfile();
      const data = res.data.data || res.data.user || res.data;
      setProfile(data);
      setForm({ name: data.name || '', phone: data.phone || '', bio: data.bio || '' });
    } catch (err) { toast.error('Failed to load profile'); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      await authAPI.updateProfile(form);
      toast.success('Profile updated');
      setEditing(false);
      fetchProfile();
    } catch (err) { toast.error(err.response?.data?.message || 'Update failed'); }
  };

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-heading">Profile</h1>

      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-500 p-6 text-white">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold">
              {profile?.name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold">{profile?.name}</h2>
              <p className="text-blue-100">{profile?.role?.replace('_', ' ').toUpperCase()}</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {editing ? (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">Name</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="form-input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input type="text" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="form-input w-full" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bio</label>
                <textarea value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} className="form-input w-full" rows={3} />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSave} className="btn-primary px-4 py-2 rounded-btn text-sm">Save</button>
                <button onClick={() => setEditing(false)} className="px-4 py-2 border border-border rounded-btn text-sm hover:bg-gray-50">Cancel</button>
              </div>
            </>
          ) : (
            <>
              {[
                { label: 'Email', value: profile?.email },
                { label: 'Phone', value: profile?.phone || '—' },
                { label: 'Institution', value: profile?.institution?.name || '—' },
                { label: 'Bio', value: profile?.bio || '—' },
                { label: 'Joined', value: profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—' }
              ].map(f => (
                <div key={f.label} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                  <span className="text-sm text-muted">{f.label}</span>
                  <span className="text-sm font-medium">{f.value}</span>
                </div>
              ))}
              <div className="pt-2">
                <button onClick={() => setEditing(true)} className="btn-primary px-4 py-2 rounded-btn text-sm">Edit Profile</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
