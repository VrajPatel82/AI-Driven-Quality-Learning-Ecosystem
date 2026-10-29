import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function AcademicProfile() {
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

  const deptName = user?.department?.name || user?.departmentName || 'Computer Engineering';
  const instName = user?.institution?.name || user?.institutionName || 'Engineering Campus';

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
        <h2 className="text-lg font-semibold text-heading mb-4">Academic Administrator Details</h2>
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
              <label className="block text-sm font-medium mb-1 text-slate-700">Assigned Department</label>
              <input
                type="text"
                value={deptName}
                disabled
                className="form-input w-full bg-slate-100 cursor-not-allowed text-slate-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Assigned Campus</label>
              <input
                type="text"
                value={instName}
                disabled
                className="form-input w-full bg-slate-100 cursor-not-allowed text-slate-500"
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
              <input
                type="password"
                placeholder="••••••••"
                value={passwordData.currentPassword}
                onChange={e => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                className="form-input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">New Password</label>
              <input
                type="password"
                placeholder="Min 6 characters"
                value={passwordData.newPassword}
                onChange={e => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                className="form-input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Confirm Password</label>
              <input
                type="password"
                placeholder="Repeat new password"
                value={passwordData.confirmPassword}
                onChange={e => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                className="form-input w-full"
                required
              />
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
