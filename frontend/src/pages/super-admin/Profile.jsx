import { useState, useEffect } from 'react';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function SuperProfile() {
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
    <div className="w-full max-w-2xl mx-auto space-y-4 sm:space-y-6 min-w-0">
      <h1 className="text-xl sm:text-2xl font-bold text-heading">Profile</h1>

      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        {/* Profile Header Banner */}
        <div className="bg-gradient-to-r from-purple-700 to-purple-500 p-5 sm:p-6 text-white">
          <div className="flex flex-col sm:flex-row items-center text-center sm:text-left gap-3.5 sm:gap-4 min-w-0">
            <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-2xl font-bold flex-shrink-0 shadow-xs ring-4 ring-white/10">
              {profile?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg sm:text-xl font-bold truncate">{profile?.name}</h2>
              <p className="text-purple-100 text-xs sm:text-sm mt-0.5">Super Administrator</p>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 space-y-4">
          {editing ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-1 text-heading">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm({...form, name: e.target.value})}
                  className="form-input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-1 text-heading">Phone</label>
                <input
                  type="text"
                  value={form.phone}
                  onChange={e => setForm({...form, phone: e.target.value})}
                  className="form-input w-full text-sm"
                />
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium mb-1 text-heading">Bio</label>
                <textarea
                  value={form.bio}
                  onChange={e => setForm({...form, bio: e.target.value})}
                  className="form-input w-full text-sm"
                  rows={3}
                />
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3 pt-2">
                <button
                  onClick={handleSave}
                  className="btn-primary w-full sm:w-auto px-5 py-2 rounded-btn text-sm font-medium text-center transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="w-full sm:w-auto px-5 py-2 border border-border rounded-btn text-sm font-medium hover:bg-gray-50 text-center transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {[
                { label: 'Email', value: profile?.email },
                { label: 'Phone', value: profile?.phone || '—' },
                { label: 'Role', value: 'Super Administrator' },
                { label: 'Bio', value: profile?.bio || '—' },
                { label: 'Joined', value: profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : '—' }
              ].map(f => (
                <div
                  key={f.label}
                  className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-2.5 sm:py-2 border-b border-border last:border-0 gap-0.5 sm:gap-4"
                >
                  <span className="text-xs sm:text-sm text-muted flex-shrink-0">{f.label}</span>
                  <span className="text-sm font-medium text-heading break-all sm:break-normal text-left sm:text-right">
                    {f.value}
                  </span>
                </div>
              ))}
              <div className="pt-3 sm:pt-2">
                <button
                  onClick={() => setEditing(true)}
                  className="btn-primary w-full sm:w-auto px-5 py-2 rounded-btn text-sm font-medium inline-flex items-center justify-center transition-colors"
                >
                  Edit Profile
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
