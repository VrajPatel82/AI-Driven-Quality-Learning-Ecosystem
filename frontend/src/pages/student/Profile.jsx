import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { authAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function StudentProfile() {
  const { user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', bio: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const res = await authAPI.getProfile();
      const p = res.data.user || res.data;
      setProfile(p);
      updateUser(p);
      setForm({ 
        name: p.name || '', 
        phone: p.phone || '', 
        bio: p.bio || ''
      });
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
      updateUser({ 
        name: updated.name
      });
    } catch (err) {
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  const initialLetter = (profile?.name || user?.name || 'U')[0].toUpperCase();

  return (
    <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6">
      {/* Page Heading */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-heading">Profile</h1>
        <p className="text-xs sm:text-sm text-muted mt-0.5">Manage your student account and academic placement information</p>
      </div>

      <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-6">
        {/* 1. Student Identity Section */}
        <div className="flex items-center gap-4 pb-6 border-b border-border">
          <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl sm:text-2xl font-bold shadow-sm shrink-0">
            {initialLetter}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-heading break-words">
              {profile?.name || user?.name}
            </h2>
            <p className="text-xs sm:text-sm text-muted mt-0.5 break-all">
              {profile?.email || user?.email}
            </p>
            <span className="inline-block mt-1 px-2.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded-full capitalize">
              {profile?.role || user?.role || 'Student'}
            </span>
          </div>
        </div>

        {/* 2. Personal Information */}
        <section aria-labelledby="personal-info-heading" className="space-y-3.5">
          <h3 id="personal-info-heading" className="text-xs font-semibold text-muted uppercase tracking-wider">
            Personal Information
          </h3>

          <div className="space-y-3.5">
            <div>
              <label className="block text-xs font-medium text-heading mb-1">Full Name</label>
              {editing ? (
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="form-input w-full text-sm"
                  placeholder="Enter full name"
                />
              ) : (
                <p className="text-sm text-body p-2.5 bg-gray-50 rounded-lg border border-border/60 font-medium">
                  {profile?.name || '—'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-heading mb-1">Email</label>
              <p className="text-sm text-body p-2.5 bg-gray-50 rounded-lg border border-border/60 break-all font-medium">
                {profile?.email || '—'}
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-heading mb-1">Phone</label>
              {editing ? (
                <input
                  type="text"
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="form-input w-full text-sm"
                  placeholder="Enter phone number"
                />
              ) : (
                <p className="text-sm text-body p-2.5 bg-gray-50 rounded-lg border border-border/60 font-medium">
                  {profile?.phone || 'Not set'}
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-heading mb-1">Bio</label>
              {editing ? (
                <textarea
                  value={form.bio}
                  onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
                  className="form-input w-full text-sm"
                  rows={3}
                  placeholder="Tell us about yourself"
                />
              ) : (
                <p className="text-sm text-body p-2.5 bg-gray-50 rounded-lg border border-border/60 leading-relaxed">
                  {profile?.bio || 'No bio set'}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* 3. Academic Information (Read-Only) */}
        <section aria-labelledby="academic-info-heading" className="pt-2 border-t border-border space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 id="academic-info-heading" className="text-xs font-semibold text-muted uppercase tracking-wider flex items-center gap-1.5">
              <span>Academic Information</span>
              <span className="text-[11px] font-normal normal-case px-2 py-0.5 bg-gray-100 text-muted rounded-full">
                Read-only
              </span>
            </h3>
          </div>

          <div className="space-y-3.5">
            <div>
              <label className="text-xs font-medium text-heading mb-1 flex items-center gap-1">
                <span>Enrollment Number</span>
                <Icons.Lock className="w-3 h-3 text-muted" />
              </label>
              <p className="text-sm text-body p-2.5 bg-gray-50 rounded-lg border border-border/70 font-mono font-medium">
                {profile?.enrollmentNumber || 'N/A'}
              </p>
            </div>

            {profile?.institution && (
              <div>
                <label className="text-xs font-medium text-heading mb-1 flex items-center gap-1">
                  <span>Institution</span>
                  <Icons.Lock className="w-3 h-3 text-muted" />
                </label>
                <p className="text-sm text-body p-2.5 bg-gray-50 rounded-lg border border-border/70 break-words font-medium">
                  {profile.institution.name || 'N/A'}
                </p>
              </div>
            )}

            {profile?.department && (
              <div>
                <label className="text-xs font-medium text-heading mb-1 flex items-center gap-1">
                  <span>Department</span>
                  <Icons.Lock className="w-3 h-3 text-muted" />
                </label>
                <p className="text-sm text-body p-2.5 bg-gray-50 rounded-lg border border-border/70 break-words font-medium">
                  {profile.department.name || 'N/A'}
                </p>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-heading mb-1 flex items-center gap-1">
                <span>Current Semester</span>
                <Icons.Lock className="w-3 h-3 text-muted" />
              </label>
              <p className="text-sm text-body p-2.5 bg-gray-50 rounded-lg border border-border/70 font-medium">
                Semester {profile?.currentSemester || 1}
              </p>
            </div>
          </div>

          {/* 4. Academic Profile Notice */}
          <div className="mt-3 p-3 rounded-lg bg-blue-50/70 border border-blue-100 flex items-start gap-2 text-xs text-blue-900">
            <Icons.Lock className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              Academic profile placement is managed exclusively by Department Administrators.
            </span>
          </div>
        </section>

        {/* 5. Membership Information */}
        <section aria-labelledby="membership-info-heading" className="pt-2 border-t border-border">
          <label id="membership-info-heading" className="block text-xs font-semibold text-muted uppercase tracking-wider mb-1">
            Member Since
          </label>
          <p className="text-sm text-body p-2.5 bg-gray-50 rounded-lg border border-border/60 flex items-center gap-2 font-medium">
            <Icons.Calendar className="w-3.5 h-3.5 text-muted" />
            <span>{profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}</span>
          </p>
        </section>

        {/* 6. Edit Profile Action */}
        <div className="pt-2 border-t border-border flex flex-wrap gap-3">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="btn-primary min-h-[42px] px-5 py-2 text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/60 border-t-white rounded-full animate-spin shrink-0" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="min-h-[42px] px-5 py-2 border border-border rounded-btn text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="btn-primary min-h-[42px] px-5 py-2 text-sm flex items-center justify-center gap-2"
            >
              <Icons.Edit className="w-4 h-4" />
              <span>Edit Profile</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
