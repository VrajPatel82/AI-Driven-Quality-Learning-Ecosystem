import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function UniversityProfile() {
  const { user, updateUser } = useAuth();
  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const uniName = user?.university?.name || user?.universityName || 'Apex National University';

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await authAPI.updateProfile(profileData);
      updateUser(res.data.data || res.data || profileData);
      toast.success('Profile updated successfully');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      return toast.error('New passwords do not match');
    }
    if (passwordData.newPassword.length < 6) {
      return toast.error('Password must be at least 6 characters');
    }

    setSavingPassword(true);
    try {
      await authAPI.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      toast.success('Password changed successfully');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-heading">Profile & Security</h1>
      </div>

      <div className="bg-surface rounded-card shadow-card border border-border p-6">
        <h2 className="text-lg font-semibold text-heading mb-4">Administrator Information</h2>
        <form onSubmit={handleProfileSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Full Name</label>
              <input
                type="text"
                value={profileData.name}
                onChange={e => setProfileData({ ...profileData, name: e.target.value })}
                className="form-input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Email Address</label>
              <input
                type="email"
                value={profileData.email}
                disabled
                className="form-input w-full bg-slate-100 cursor-not-allowed text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Assigned University</label>
              <input
                type="text"
                value={uniName}
                disabled
                className="form-input w-full bg-slate-100 cursor-not-allowed text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">System Role</label>
              <input
                type="text"
                value="UNIVERSITY_ADMIN"
                disabled
                className="form-input w-full bg-slate-100 cursor-not-allowed font-mono text-xs text-slate-500"
              />
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingProfile}
              className="btn-primary px-5 py-2 rounded-btn text-sm"
            >
              {savingProfile ? 'Saving...' : 'Update Information'}
            </button>
          </div>
        </form>
      </div>

      <div className="bg-surface rounded-card shadow-card border border-border p-6">
        <h2 className="text-lg font-semibold text-heading mb-4">Change Password</h2>
        <form onSubmit={handlePasswordSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Current Password</label>
              <div className="relative">
                <input
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={passwordData.currentPassword}
                  onChange={e => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                  className="form-input w-full pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-slate-700"
                  title={showCurrentPassword ? 'Hide password' : 'Show password'}
                >
                  {showCurrentPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">New Password</label>
              <div className="relative">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Min 6 characters"
                  value={passwordData.newPassword}
                  onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                  className="form-input w-full pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-slate-700"
                  title={showNewPassword ? 'Hide password' : 'Show password'}
                >
                  {showNewPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="Repeat new password"
                  value={passwordData.confirmPassword}
                  onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                  className="form-input w-full pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-slate-700"
                  title={showConfirmPassword ? 'Hide password' : 'Show password'}
                >
                  {showConfirmPassword ? <Icons.EyeOff className="w-4 h-4" /> : <Icons.Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={savingPassword}
              className="btn-primary px-5 py-2 rounded-btn text-sm"
            >
              {savingPassword ? 'Updating...' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
