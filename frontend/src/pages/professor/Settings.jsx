import { useState, useEffect } from 'react';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function ProfessorSettings() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', phone: '', bio: '' });
  const [saving, setSaving] = useState(false);

  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [changingPassword, setChangingPassword] = useState(false);

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
      toast.success('Settings updated');
      const storedUser = JSON.parse(localStorage.getItem('user') || '{}');
      localStorage.setItem('user', JSON.stringify({ ...storedUser, name: updated.name }));
    } catch (err) {
      toast.error('Failed to update');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Settings</h1>
      </div>

      <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-5">
        <div className="flex items-center gap-3 sm:gap-4 pb-5 border-b border-border">
          <div className="w-14 h-14 sm:w-16 sm:h-16 bg-blue-600 rounded-full flex items-center justify-center text-white text-xl sm:text-2xl font-bold shrink-0">
            {(profile?.name || 'P')[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-semibold text-heading truncate">{profile?.name}</h2>
            <p className="text-xs sm:text-sm text-muted truncate">{profile?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full capitalize">Professor</span>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-heading mb-1">Full Name</label>
          <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="form-input w-full" />
        </div>

        <div>
          <label className="block text-sm font-medium text-heading mb-1">Email</label>
          <input type="email" value={profile?.email || ''} disabled className="form-input w-full bg-gray-50" />
        </div>

        <div>
          <label className="block text-sm font-medium text-heading mb-1">Phone</label>
          <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className="form-input w-full" placeholder="Enter phone number" />
        </div>

        <div>
          <label className="block text-sm font-medium text-heading mb-1">Bio</label>
          <textarea value={form.bio} onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} className="form-input w-full" rows={3} placeholder="Tell us about yourself" />
        </div>

        {profile?.institution && (
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Institution</label>
            <p className="text-body p-2 bg-gray-50 rounded-lg break-words">{profile.institution.name}</p>
          </div>
        )}

        {profile?.department && (
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Department</label>
            <p className="text-body p-2 bg-gray-50 rounded-lg break-words">{profile.department.name}</p>
          </div>
        )}

        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Change Password */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-5">
        <h2 className="text-lg font-semibold text-heading">Change Password</h2>
        <div>
          <label className="block text-sm font-medium text-heading mb-1">Current Password</label>
          <input type="password" value={passwordForm.currentPassword} onChange={e => setPasswordForm(f => ({ ...f, currentPassword: e.target.value }))} className="form-input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-heading mb-1">New Password</label>
          <input type="password" value={passwordForm.newPassword} onChange={e => setPasswordForm(f => ({ ...f, newPassword: e.target.value }))} className="form-input w-full" />
        </div>
        <div>
          <label className="block text-sm font-medium text-heading mb-1">Confirm New Password</label>
          <input type="password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm(f => ({ ...f, confirmPassword: e.target.value }))} className="form-input w-full" />
        </div>
        <button
          onClick={async () => {
            if (passwordForm.newPassword !== passwordForm.confirmPassword) {
              toast.error('New passwords do not match');
              return;
            }
            if (passwordForm.newPassword.length < 6) {
              toast.error('Password must be at least 6 characters');
              return;
            }
            setChangingPassword(true);
            try {
              await authAPI.changePassword({
                currentPassword: passwordForm.currentPassword,
                newPassword: passwordForm.newPassword
              });
              toast.success('Password changed successfully');
              setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            } catch (err) {
              toast.error(err.response?.data?.message || 'Failed to change password');
            } finally {
              setChangingPassword(false);
            }
          }}
          disabled={changingPassword || !passwordForm.currentPassword || !passwordForm.newPassword}
          className="btn-primary disabled:opacity-50"
        >
          {changingPassword ? 'Changing...' : 'Change Password'}
        </button>
      </div>
    </div>
  );
}
