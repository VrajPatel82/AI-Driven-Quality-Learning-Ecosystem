import { useState, useEffect } from 'react';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function DeptProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', phone: '', bio: '' });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [editing, setEditing] = useState(false);
  const [editingPassword, setEditingPassword] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchProfile(); }, []);

  const fetchProfile = async () => {
    try {
      const res = await authAPI.getProfile();
      const p = res.data.user || res.data;
      setProfile(p);
      setForm({ name: p.name || '', phone: p.phone || '', bio: p.bio || '' });
    } catch (err) {
      toast.error('Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await authAPI.updateProfile(form);
      const updated = res.data.user || res.data;
      setProfile(updated);
      setEditing(false);
      toast.success('Profile updated');
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...storedUser, name: updated.name }));
    } catch (err) {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      return toast.error('All password fields are required');
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return toast.error('New passwords do not match');
    }
    if (passwordForm.newPassword.length < 6) {
      return toast.error('Password must be at least 6 characters');
    }

    setSaving(true);
    try {
      await authAPI.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      toast.success('Password changed successfully');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setEditingPassword(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-heading">Profile</h1>
      
      {/* Personal Information */}
      <div className="bg-surface rounded-card shadow-card border border-border p-6">
        <h2 className="text-lg font-semibold text-heading mb-4">Personal Information</h2>
        <div className="flex items-center gap-4 mb-6 pb-6 border-b border-border">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">{(profile?.name || 'A')[0].toUpperCase()}</div>
          <div>
            <h3 className="text-xl font-semibold text-heading">{profile?.name}</h3>
            <p className="text-muted">{profile?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full">Department Admin</span>
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Name</label>
            {editing ? (
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="form-input w-full" />
            ) : (
              <p className="p-2 bg-gray-50 rounded-lg">{profile?.name}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Email</label>
            <p className="p-2 bg-gray-50 rounded-lg">{profile?.email}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Phone</label>
            {editing ? (
              <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="form-input w-full" />
            ) : (
              <p className="p-2 bg-gray-50 rounded-lg">{profile?.phone || 'Not set'}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Bio</label>
            {editing ? (
              <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} className="form-input w-full" rows={3} />
            ) : (
              <p className="p-2 bg-gray-50 rounded-lg">{profile?.bio || 'No bio set'}</p>
            )}
          </div>
          {profile?.institution && <div><label className="block text-sm font-medium text-heading mb-1">Institution</label><p className="p-2 bg-gray-50 rounded-lg">{profile.institution.name}</p></div>}
          {profile?.department && <div><label className="block text-sm font-medium text-heading mb-1">Department</label><p className="p-2 bg-gray-50 rounded-lg">{profile.department.name}</p></div>}
        </div>
        <div className="mt-6 flex gap-3">
          {editing ? (
            <>
              <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Saving...' : 'Save Changes'}</button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 border border-border rounded-btn hover:bg-gray-50">Cancel</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="btn-primary">Edit Information</button>
          )}
        </div>
      </div>

      {/* Change Password */}
      <div className="bg-surface rounded-card shadow-card border border-border p-6">
        <h2 className="text-lg font-semibold text-heading mb-4">Change Password</h2>
        {editingPassword ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Current Password</label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))}
                className="form-input w-full"
                placeholder="Enter your current password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1">New Password</label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))}
                className="form-input w-full"
                placeholder="Enter new password"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Confirm New Password</label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))}
                className="form-input w-full"
                placeholder="Confirm new password"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={handlePasswordChange} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Updating...' : 'Update Password'}
              </button>
              <button onClick={() => setEditingPassword(false)} className="px-4 py-2 border border-border rounded-btn hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-muted mb-4">Secure your account by changing your password regularly</p>
            <button onClick={() => setEditingPassword(true)} className="btn-primary">Change Password</button>
          </div>
        )}
      </div>
    </div>
  );
}
