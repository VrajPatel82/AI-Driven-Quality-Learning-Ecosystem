import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { coursesAPI, usersAPI, adminAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function AcademicCourses() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [studentCounts, setStudentCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [deleteConfirmCourse, setDeleteConfirmCourse] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Dedicated Faculty Assignment Modal state
  const [facultyModalCourse, setFacultyModalCourse] = useState(null);
  const [selectedFacultyIds, setSelectedFacultyIds] = useState([]);
  const [isSavingFaculty, setIsSavingFaculty] = useState(false);

  const [form, setForm] = useState({
    name: '',
    code: '',
    semester: 1,
    professors: []
  });

  const deptName = user?.department?.name || user?.departmentName || 'Computer Engineering';
  const deptId = user?.department?._id || user?.department;

  useEffect(() => {
    fetchData();
  }, [deptId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [coursesRes, profsRes] = await Promise.allSettled([
        coursesAPI.getAll({ department: deptId, limit: 100 }),
        usersAPI.getAll({ role: 'professor', department: deptId, limit: 100 })
      ]);

      let loadedCourses = [];
      if (coursesRes.status === 'fulfilled') {
        loadedCourses = coursesRes.value.data.data || coursesRes.value.data || [];
        setCourses(loadedCourses);
      }
      if (profsRes.status === 'fulfilled') {
        setProfessors(profsRes.value.data.data || profsRes.value.data || []);
      }

      // Asynchronously fetch live enrolled student counts for loaded courses
      if (loadedCourses.length > 0) {
        const studentPromises = loadedCourses.map(c => coursesAPI.getStudents(c._id));
        const studentResults = await Promise.allSettled(studentPromises);
        const countsMap = {};
        studentResults.forEach((res, idx) => {
          const cId = loadedCourses[idx]._id;
          if (res.status === 'fulfilled') {
            const list = res.value.data?.data || res.value.data || [];
            countsMap[cId] = Array.isArray(list) ? list.length : 0;
          } else {
            countsMap[cId] = 0;
          }
        });
        setStudentCounts(countsMap);
      }
    } catch {
      toast.error('Failed to load course catalog data');
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract assigned professor objects for any course
  const getCourseProfessors = (c) => {
    if (!c) return [];
    if (Array.isArray(c.professors) && c.professors.length > 0) {
      return c.professors
        .map(p => (typeof p === 'object' && p ? p : professors.find(prof => prof._id === String(p))))
        .filter(Boolean);
    }
    if (c.professor) {
      const profObj = typeof c.professor === 'object' && c.professor
        ? c.professor
        : professors.find(p => p._id === String(c.professor));
      return profObj ? [profObj] : [];
    }
    return [];
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.code) return toast.error('Course Title and Code are required');

    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        department: deptId,
        semester: parseInt(form.semester, 10) || 1,
        professors: form.professors,
        professor: form.professors[0] || null
      };

      if (editingCourse) {
        await adminAPI.updateCourse(editingCourse._id, payload);
        toast.success(`Course "${payload.code}" updated successfully`);
      } else {
        await coursesAPI.create(payload);
        toast.success(`Course "${payload.code}" created successfully`);
      }

      resetForm();
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save course offering');
    }
  };

  const handleEditClick = (course) => {
    setEditingCourse(course);
    const assignedIds = getCourseProfessors(course).map(p => String(p._id));
    setForm({
      name: course.name || '',
      code: course.code || '',
      semester: course.semester || 1,
      professors: assignedIds
    });
    setShowForm(true);
  };

  // Open Faculty Assignment Modal for a specific course
  const handleOpenFacultyModal = (course) => {
    setFacultyModalCourse(course);
    const assignedIds = getCourseProfessors(course).map(p => String(p._id));
    setSelectedFacultyIds(assignedIds);
  };

  // Save Faculty Assignments from Modal
  const handleSaveFacultyAssignments = async () => {
    if (!facultyModalCourse) return;
    setIsSavingFaculty(true);
    try {
      const payload = {
        professors: selectedFacultyIds,
        professor: selectedFacultyIds[0] || null
      };
      await adminAPI.updateCourse(facultyModalCourse._id, payload);
      toast.success(`Faculty assignments for ${facultyModalCourse.code} updated successfully`);
      setFacultyModalCourse(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update faculty assignments');
    } finally {
      setIsSavingFaculty(false);
    }
  };

  const toggleFacultySelectionInModal = (profId) => {
    setSelectedFacultyIds(prev =>
      prev.includes(profId)
        ? prev.filter(id => id !== profId)
        : [...prev, profId]
    );
  };

  const toggleFormFacultySelection = (profId) => {
    setForm(prev => ({
      ...prev,
      professors: prev.professors.includes(profId)
        ? prev.professors.filter(id => id !== profId)
        : [...prev.professors, profId]
    }));
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmCourse) return;
    setIsDeleting(true);
    try {
      await adminAPI.deleteCourse(deleteConfirmCourse._id);
      toast.success(`Course "${deleteConfirmCourse.code}" deleted successfully`);
      setDeleteConfirmCourse(null);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete course offering');
    } finally {
      setIsDeleting(false);
    }
  };

  const resetForm = () => {
    setForm({ name: '', code: '', semester: 1, professors: [] });
    setEditingCourse(null);
    setShowForm(false);
  };

  // Filtered Courses
  const filtered = useMemo(() => {
    return courses.filter(c => {
      const matchSearch = c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.code?.toLowerCase().includes(search.toLowerCase());
      const matchSem = !filterSemester || String(c.semester) === String(filterSemester);
      return matchSearch && matchSem;
    });
  }, [courses, search, filterSemester]);

  // Statistics calculation from loaded courses
  const stats = useMemo(() => {
    const total = courses.length;
    const assigned = courses.filter(c => getCourseProfessors(c).length > 0).length;
    const unassigned = total - assigned;
    return { total, assigned, unassigned };
  }, [courses, professors]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
            <Icons.Book className="w-6 h-6 text-primary" />
            Course Catalog & Faculty
          </h1>
          <p className="text-xs text-muted mt-1">
            Departmental accredited course offerings, semester placement, and faculty assignments for {deptName}.
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) resetForm();
            else { resetForm(); setShowForm(true); }
          }}
          className="btn-primary px-4 py-2 rounded-btn text-xs font-semibold flex items-center gap-2"
        >
          {showForm ? 'Cancel' : <><Icons.Plus className="w-4 h-4" /> Add New Course</>}
        </button>
      </div>

      {/* Course Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface rounded-card p-4 border border-border shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Total Department Courses</p>
            <p className="text-2xl font-extrabold text-heading mt-0.5">{stats.total}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center font-bold">
            <Icons.Book className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface rounded-card p-4 border border-border shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Assigned Faculty</p>
            <p className="text-2xl font-extrabold text-emerald-700 mt-0.5">{stats.assigned}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center font-bold">
            <Icons.UserCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface rounded-card p-4 border border-border shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-500">Unassigned Courses</p>
            <p className="text-2xl font-extrabold text-amber-600 mt-0.5">{stats.unassigned}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center font-bold">
            <Icons.AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Add / Edit Form Modal / Inline Section */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-base font-bold text-heading flex items-center gap-2">
              <Icons.Edit className="w-4 h-4 text-blue-600" />
              {editingCourse ? `Edit Course Offering (${editingCourse.code})` : 'Create New Course Offering'}
            </h2>
            <button
              type="button"
              onClick={resetForm}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <Icons.X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1 text-slate-700 uppercase">Course Title *</label>
              <input
                type="text"
                placeholder="e.g. Operating System Concepts"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="form-input w-full text-xs font-medium"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-slate-700 uppercase">Course Code *</label>
              <input
                type="text"
                placeholder="e.g. CE401"
                value={form.code}
                onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="form-input w-full font-mono text-xs uppercase"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1 text-slate-700 uppercase">Teaching Semester *</label>
              <select
                value={form.semester}
                onChange={e => setForm({ ...form, semester: parseInt(e.target.value, 10) })}
                className="form-input w-full text-xs font-medium"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1 text-slate-700 uppercase">
              Assigned Faculty / Instructors (Multi-Select Allowed)
            </label>
            {professors.length === 0 ? (
              <p className="text-xs text-muted italic">No department professors found to assign.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-lg">
                {professors.map(p => {
                  const isSelected = form.professors.includes(String(p._id));
                  return (
                    <label
                      key={p._id}
                      className={`flex items-center gap-2 p-1.5 rounded-lg border text-xs cursor-pointer transition select-none ${
                        isSelected
                          ? 'bg-blue-50 border-blue-300 text-blue-900 font-semibold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleFormFacultySelection(String(p._id))}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="truncate">{p.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-border rounded-btn text-xs font-medium hover:bg-slate-50"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary px-5 py-2 rounded-btn text-xs font-semibold">
              {editingCourse ? 'Save Changes' : 'Create Course'}
            </button>
          </div>
        </form>
      )}

      {/* Filter Bar */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-80">
            <Icons.Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search course by title or code..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-input w-full pl-8 py-1.5 text-xs"
            />
          </div>

          <div className="relative w-full sm:w-44">
            <select
              value={filterSemester}
              onChange={e => setFilterSemester(e.target.value)}
              className="form-input w-full py-1.5 text-xs font-medium appearance-none pr-7"
            >
              <option value="">All Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <option key={s} value={s}>Semester {s}</option>
              ))}
            </select>
            <Icons.ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        <span className="text-xs text-muted font-medium">
          Showing {filtered.length} of {courses.length} courses
        </span>
      </div>

      {/* Course Table */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-xs text-muted flex items-center justify-center gap-2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            Loading course offerings...
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted text-xs">
            No courses found matching criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-border text-[11px] text-muted uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Code</th>
                  <th className="py-3.5 px-4">Course Title</th>
                  <th className="py-3.5 px-4 text-center">Semester</th>
                  <th className="py-3.5 px-4">Assigned Faculty</th>
                  <th className="py-3.5 px-4 text-center">Enrolled</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(c => {
                  const assignedProfs = getCourseProfessors(c);
                  const count = studentCounts[c._id];
                  return (
                    <tr key={c._id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 px-4 font-mono font-bold text-blue-700">
                        <Link to={`/academic-admin/courses/${c._id}`} className="hover:underline">
                          {c.code}
                        </Link>
                      </td>
                      <td className="py-3 px-4 font-semibold text-heading">
                        <Link to={`/academic-admin/courses/${c._id}`} className="hover:text-blue-600 transition">
                          {c.name}
                        </Link>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="font-bold text-[11px] bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-0.5 rounded-full">
                          Sem {c.semester || 1}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {assignedProfs.length === 0 ? (
                            <span className="text-slate-400 font-medium italic text-[11px]">-- Unassigned --</span>
                          ) : (
                            assignedProfs.map(p => (
                              <span
                                key={p._id}
                                className="inline-flex items-center gap-1 font-semibold text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-xs"
                              >
                                <Icons.UserCheck className="w-3 h-3 text-emerald-600" />
                                {p.name}
                              </span>
                            ))
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenFacultyModal(c)}
                            className="p-1 hover:bg-slate-100 text-slate-500 hover:text-blue-600 rounded-md transition"
                            title="Manage Faculty Assignments"
                          >
                            <Icons.Edit className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-semibold text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          <Icons.Users className="w-3 h-3 text-slate-400" />
                          {count !== undefined ? `${count} Students` : '...'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleOpenFacultyModal(c)}
                            className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 font-semibold rounded-lg text-xs border border-emerald-200 transition flex items-center gap-1"
                            title="Assign Faculty"
                          >
                            <Icons.UserCheck className="w-3.5 h-3.5" />
                            Faculty
                          </button>

                          <Link
                            to={`/academic-admin/courses/${c._id}`}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold rounded-lg text-xs border border-slate-200 transition"
                            title="View Details"
                          >
                            Details
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleEditClick(c)}
                            className="p-1 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition"
                            title="Edit Course"
                          >
                            <Icons.Edit className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeleteConfirmCourse(c)}
                            className="p-1 text-slate-500 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                            title="Delete Course"
                          >
                            <Icons.Trash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dedicated Faculty Assignment Modal */}
      {facultyModalCourse && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#0f172a]/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl border border-border w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-heading flex items-center gap-2">
                  <Icons.UserCheck className="w-5 h-5 text-emerald-600" />
                  Faculty Assignment — {facultyModalCourse.code}
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  {facultyModalCourse.name} &bull; Semester {facultyModalCourse.semester}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFacultyModalCourse(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 uppercase">Select Department Professors:</span>
                <button
                  type="button"
                  onClick={() => setSelectedFacultyIds([])}
                  className="text-red-600 hover:underline font-semibold"
                >
                  Clear All (Unassign)
                </button>
              </div>

              {professors.length === 0 ? (
                <p className="text-xs text-muted p-4 text-center border rounded-xl bg-slate-50">
                  No professors registered in this department.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {professors.map(p => {
                    const profIdStr = String(p._id);
                    const isSelected = selectedFacultyIds.includes(profIdStr);
                    return (
                      <label
                        key={p._id}
                        className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition select-none ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-semibold shadow-xs'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleFacultySelectionInModal(profIdStr)}
                            className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                          />
                          <div>
                            <p className="font-bold text-slate-900">{p.name}</p>
                            <p className="text-[11px] text-slate-500">{p.email || p.professorId || 'Faculty'}</p>
                          </div>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Assigned
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}

              <p className="text-[11px] text-muted leading-relaxed bg-blue-50/60 border border-blue-200/60 p-3 rounded-xl">
                <Icons.Info className="w-3.5 h-3.5 text-blue-600 inline mr-1" />
                Selecting multiple professors assigns co-instructors to this course offering without modifying student enrollments.
              </p>
            </div>

            <div className="px-6 py-4 border-t border-border bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setFacultyModalCourse(null)}
                className="btn-secondary text-xs px-4 py-2"
                disabled={isSavingFaculty}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveFacultyAssignments}
                disabled={isSavingFaculty}
                className="btn-primary text-xs px-5 py-2 flex items-center gap-2"
              >
                {isSavingFaculty ? 'Saving...' : 'Save Assignments'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmCourse && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#0f172a]/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl border border-border w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                  <Icons.AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-heading">Delete Course Offering</h3>
                  <p className="text-xs text-muted">This action cannot be undone.</p>
                </div>
              </div>

              <div className="p-3 bg-red-50/70 border border-red-200/80 rounded-xl text-xs space-y-1">
                <p className="font-bold text-red-900">Target Course:</p>
                <p className="font-mono text-red-700 font-bold">{deleteConfirmCourse.code} &bull; {deleteConfirmCourse.name}</p>
                <p className="text-slate-600 text-[11px] mt-1">
                  Deleting this course offering will remove it from the department catalog and disassociate instructor records.
                </p>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-border bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmCourse(null)}
                className="btn-secondary text-xs px-4 py-2"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded-btn transition disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
