import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Icons } from '../../components/shared/Icons';

export default function InstDepartments() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingDept, setEditingDept] = useState(null);
  const [form, setForm] = useState({ name: '', code: '', description: '' });
  const [selectedDept, setSelectedDept] = useState(null);
  const [showDetail, setShowDetail] = useState(false);

  useEffect(() => { fetchDepartments(); }, []);

  const fetchDepartments = async () => {
    try {
      const res = await adminAPI.getDepartments();
      setDepartments(res.data.data || res.data || []);
    } catch (err) { toast.error('Failed to load departments'); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingDept) {
        await adminAPI.updateDepartment(editingDept._id, form);
        toast.success('Department updated');
      } else {
        await adminAPI.createDepartment(form);
        toast.success('Department created');
      }
      resetForm();
      fetchDepartments();
    } catch (err) { toast.error(err.response?.data?.message || 'Operation failed'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this department?')) return;
    try {
      await adminAPI.deleteDepartment(id);
      toast.success('Department deleted');
      fetchDepartments();
    } catch (err) { toast.error('Failed to delete department'); }
  };

  const resetForm = () => {
    setForm({ name: '', code: '', description: '' });
    setEditingDept(null);
    setShowForm(false);
  };

  const startEdit = (dept) => {
    setEditingDept(dept);
    setForm({ name: dept.name, code: dept.code || '', description: dept.description || '' });
    setShowForm(true);
  };

  const openDetail = (dept) => {
    setSelectedDept(dept);
    setShowDetail(true);
  };

  const closeDetail = () => {
    setSelectedDept(null);
    setShowDetail(false);
  };

  const filtered = departments.filter(d => d.name?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-heading">Departments</h1>
        <button onClick={() => { resetForm(); setShowForm(!showForm); }} className="btn-primary px-4 py-2 rounded-btn text-sm">
          {showForm ? 'Cancel' : '+ Add Department'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
          <h2 className="text-lg font-semibold text-heading">{editingDept ? 'Edit' : 'New'} Department</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name *</label>
              <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="form-input w-full" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Department Code *</label>
              <input
                type="text"
                value={form.code}
                onChange={e => setForm({...form, code: e.target.value.toUpperCase().trim()})}
                className="form-input w-full font-mono"
                placeholder="e.g., CSE, ECE, MECH"
                required
              />
              <p className="text-[11px] text-muted mt-1">Used in student permanent enrollment numbers (e.g. IITB-CSE-02-001)</p>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="form-input w-full" rows={3} />
          </div>
          <div className="flex gap-3">
            <button type="submit" className="btn-primary px-4 py-2 rounded-btn text-sm">{editingDept ? 'Update' : 'Create'}</button>
            <button type="button" onClick={resetForm} className="px-4 py-2 border border-border rounded-btn text-sm hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      )}

      <div>
        <input type="text" placeholder="Search departments..." value={search} onChange={e => setSearch(e.target.value)} className="form-input w-full max-w-md" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-12 text-muted">No departments found</div>
        ) : (
          filtered.map(dept => (
            <div 
              key={dept._id} 
              className="bg-surface rounded-card shadow-card border border-border p-5 cursor-pointer hover:shadow-lg hover:border-blue-300 transition-all"
              onClick={() => openDetail(dept)}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="font-semibold text-heading">{dept.name}</h3>
                  {dept.code && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full mt-1 inline-block">{dept.code}</span>}
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => startEdit(dept)} className="text-blue-600 hover:text-blue-800 text-sm px-2 py-1">Edit</button>
                  <button onClick={() => handleDelete(dept._id)} className="text-red-600 hover:text-red-800 text-sm px-2 py-1">Delete</button>
                </div>
              </div>
              {dept.description && <p className="text-sm text-muted mt-2">{dept.description}</p>}
              <div className="mt-3 pt-3 border-t border-border text-sm text-muted">
                <span className="font-medium">{dept.coursesCount || 0} courses</span>
                <span className="mx-2">•</span>
                <span className="font-medium">{dept.professorsCount || 0} professors</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Detail Modal */}
      {showDetail && selectedDept && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-card shadow-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-border">
            <div className="sticky top-0 bg-surface border-b border-border p-6 flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-heading">{selectedDept.name}</h2>
                {selectedDept.code && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full mt-1 inline-block">{selectedDept.code}</span>}
              </div>
              <button 
                onClick={closeDetail}
                className="text-muted hover:text-heading cursor-pointer p-1"
                aria-label="Close"
              >
                <Icons.X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {selectedDept.description && (
                <div>
                  <h3 className="text-lg font-semibold text-heading mb-2">Description</h3>
                  <p className="text-muted">{selectedDept.description}</p>
                </div>
              )}

              {/* Professors Section */}
              <div>
                <h3 className="text-lg font-semibold text-heading mb-3 flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                    {selectedDept.professorsCount || 0}
                  </span>
                  Professors
                </h3>
                {selectedDept.professors && selectedDept.professors.length > 0 ? (
                  <div className="space-y-3">
                    {selectedDept.professors.map((prof) => {
                      // Get courses taught by this professor
                      const profCourses = selectedDept.courses?.filter(c => 
                        c.teachers && c.teachers.some(t => t._id.toString() === prof._id.toString())
                      ) || [];
                      
                      return (
                        <div key={prof._id} className="bg-slate-50 rounded-lg p-4 border border-border">
                          <div className="font-semibold text-heading">{prof.name}</div>
                          <div className="text-sm text-muted mt-1">{prof.email}</div>
                          {profCourses.length > 0 && (
                            <div className="mt-3 text-sm">
                              <div className="text-muted font-medium mb-2">Courses Taught:</div>
                              <div className="flex flex-wrap gap-2">
                                {profCourses.map((course) => (
                                  <span key={course._id} className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-medium">
                                    {course.code || course.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-muted text-sm">No professors assigned to this department</p>
                )}
              </div>

              {/* Courses Section */}
              <div>
                <h3 className="text-lg font-semibold text-heading mb-3 flex items-center gap-2">
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">
                    {selectedDept.coursesCount || 0}
                  </span>
                  Courses
                </h3>
                {selectedDept.courses && selectedDept.courses.length > 0 ? (
                  <div className="space-y-2">
                    {selectedDept.courses.map((course) => (
                      <div key={course._id} className="bg-slate-50 rounded-lg p-3 border border-border flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-semibold text-heading">{course.name}</div>
                          <div className="text-xs text-muted">{course.code}</div>
                          {course.semester && (
                            <div className="text-xs text-muted mt-1">
                              <span className="font-medium">Semester:</span> {course.semester}
                            </div>
                          )}
                          {course.teachers && course.teachers.length > 0 && (
                            <div className="text-sm text-muted mt-2">
                              <span className="font-medium">Instructors:</span>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {course.teachers.map((teacher) => (
                                  <span key={teacher._id} className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs">
                                    {teacher.name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted text-sm">No courses assigned to this department</p>
                )}
              </div>
            </div>

            <div className="bg-slate-50 border-t border-border p-6 flex justify-end gap-3">
              <button 
                onClick={closeDetail}
                className="px-4 py-2 border border-border rounded-btn text-sm font-medium hover:bg-gray-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
