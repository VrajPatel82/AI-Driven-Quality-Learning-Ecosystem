import { useState, useEffect } from 'react';
import { announcementsAPI, adminAPI } from '../../services/api';
import toast from 'react-hot-toast';

export default function SuperPolicies() {
  const [announcements, setAnnouncements] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ 
    title: '', 
    message: '', 
    priority: 'normal', 
    type: 'department',
    targetType: 'all',
    selectedDepartments: [],
    selectedCourses: []
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => { 
    fetchAnnouncements();
    fetchDepartmentsAndCourses();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      const res = await announcementsAPI.getAll();
      setAnnouncements(res.data.data || []);
    } catch (err) { toast.error('Failed to load policies'); }
    finally { setLoading(false); }
  };

  const fetchDepartmentsAndCourses = async () => {
    try {
      const [deptsRes, coursesRes] = await Promise.all([
        adminAPI.getDepartments({ limit: 100 }),
        adminAPI.getCourses({ limit: 100 })
      ]);
      setDepartments(deptsRes.data.data || []);
      setCourses(coursesRes.data.data || []);
    } catch (err) {
      console.error('Failed to load departments/courses:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.message) return toast.error('Title and message required');
    
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        message: form.message,
        type: form.type,
        priority: form.priority,
        targetAudience: {}
      };

      // Set target audience based on selection
      if (form.type === 'department') {
        if (form.targetType === 'all') {
          payload.targetAudience.department = null; // null means all departments
        } else if (form.selectedDepartments.length > 0) {
          payload.targetAudience.department = form.selectedDepartments[0];
        } else {
          return toast.error('Select at least one department');
        }
      } else if (form.type === 'course') {
        if (form.targetType === 'all') {
          payload.targetAudience.course = null; // null means all courses
        } else if (form.selectedCourses.length > 0) {
          payload.targetAudience.course = form.selectedCourses[0];
        } else {
          return toast.error('Select at least one course');
        }
      }

      // Fix field name: backend expects 'content' not 'message'
      payload.content = payload.message;
      delete payload.message;

      await announcementsAPI.create(payload);
      toast.success('Policy published');
      setShowForm(false);
      setForm({ 
        title: '', 
        message: '', 
        priority: 'normal', 
        type: 'department',
        targetType: 'all',
        selectedDepartments: [],
        selectedCourses: []
      });
      fetchAnnouncements();
    } catch (err) { 
      const errorMsg = err.response?.data?.errors?.join(', ') || err.response?.data?.message || 'Failed to publish';
      toast.error(errorMsg); 
    }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this policy announcement?')) return;
    try {
      await announcementsAPI.delete(id);
      toast.success('Deleted');
      fetchAnnouncements();
    } catch (err) { toast.error('Failed to delete'); }
  };

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">Policies</h1>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary w-full sm:w-auto flex items-center justify-center">
          New Policy
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4 w-full">
          <h2 className="text-base sm:text-lg font-semibold text-heading">New Policy Announcement</h2>
          
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Title *</label>
            <input 
              type="text" 
              placeholder="Title" 
              value={form.title} 
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))} 
              className="form-input w-full text-sm" 
              required
            />
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Message *</label>
            <textarea 
              placeholder="Message" 
              value={form.message} 
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))} 
              className="form-input w-full text-sm" 
              rows={4}
              required
            />
          </div>

          {/* Priority and Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Priority</label>
              <select 
                value={form.priority} 
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} 
                className="form-input w-full text-sm"
              >
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Send To</label>
              <select 
                value={form.type} 
                onChange={e => setForm(f => ({ ...f, type: e.target.value, targetType: 'all', selectedDepartments: [], selectedCourses: [] }))} 
                className="form-input w-full text-sm"
              >
                <option value="department">Department</option>
                <option value="course">Course</option>
              </select>
            </div>
          </div>

          {/* Target Selection */}
          <div>
            <label className="block text-sm font-medium text-heading mb-1">
              {form.type === 'department' ? 'Department Selection' : 'Course Selection'}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, targetType: 'all', selectedDepartments: [], selectedCourses: [] }))}
                className={`px-3 py-2 rounded-btn text-sm font-medium transition-colors ${
                  form.targetType === 'all'
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                All {form.type === 'department' ? 'Departments' : 'Courses'}
              </button>
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, targetType: 'specific' }))}
                className={`px-3 py-2 rounded-btn text-sm font-medium transition-colors ${
                  form.targetType === 'specific'
                    ? 'bg-blue-100 text-blue-700 border border-blue-300'
                    : 'bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-50'
                }`}
              >
                Specific {form.type === 'department' ? 'Department' : 'Course'}
              </button>
            </div>
          </div>

          {/* Specific Selection Dropdown */}
          {form.targetType === 'specific' && (
            <div>
              <label className="block text-sm font-medium text-heading mb-1">
                Select {form.type === 'department' ? 'Department' : 'Course'}
              </label>
              <select
                value={form.type === 'department' ? (form.selectedDepartments[0] || '') : (form.selectedCourses[0] || '')}
                onChange={e => {
                  if (form.type === 'department') {
                    setForm(f => ({ ...f, selectedDepartments: [e.target.value] }));
                  } else {
                    setForm(f => ({ ...f, selectedCourses: [e.target.value] }));
                  }
                }}
                className="form-input w-full text-sm"
              >
                <option value="">-- Select --</option>
                {form.type === 'department' ? (
                  departments.map(d => (
                    <option key={d._id} value={d._id}>
                      {d.name} ({d.departmentId})
                    </option>
                  ))
                ) : (
                  courses.map(c => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.code})
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50 w-full sm:w-auto flex items-center justify-center">
            {saving ? 'Publishing...' : 'Publish Policy'}
          </button>
        </form>
      )}

      <div className="space-y-3">
        {announcements.length === 0 ? (
          <div className="text-center py-12 bg-surface rounded-card border border-border"><p className="text-muted">No policies published</p></div>
        ) : (
          announcements.map(a => (
            <div key={a._id} className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 sm:gap-4">
                <div className="min-w-0 flex-1 space-y-1">
                  <h3 className="font-semibold text-heading text-sm sm:text-base break-words">{a.title}</h3>
                  <p className="text-xs sm:text-sm text-body break-words whitespace-pre-wrap">{a.content}</p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-xs text-muted">{new Date(a.createdAt).toLocaleDateString()}</span>
                    {a.priority && a.priority !== 'normal' && (
                      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${a.priority === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {a.priority}
                      </span>
                    )}
                  </div>
                </div>
                <button 
                  onClick={() => handleDelete(a._id)} 
                  className="text-red-600 hover:text-red-800 text-xs sm:text-sm font-medium px-2.5 py-1 sm:p-0 rounded bg-red-50 hover:bg-red-100 sm:bg-transparent transition-colors shrink-0"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
