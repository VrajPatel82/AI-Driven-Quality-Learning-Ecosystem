import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { gradebookAPI, coursesAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function ProfGradebook() {
  const { user } = useAuth();
  const [selectedSemester, setSelectedSemester] = useState('1');
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [gradebook, setGradebook] = useState(null);
  const [studentGrades, setStudentGrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingGradebook, setLoadingGradebook] = useState(false);

  // Component setup
  const [showComponentForm, setShowComponentForm] = useState(false);
  const [components, setComponents] = useState([{ name: '', weightage: '', maxMarks: '' }]);

  // Single Grade entry
  const [showGradeForm, setShowGradeForm] = useState(false);
  const [students, setStudents] = useState([]);
  const [gradeForm, setGradeForm] = useState({ student: '', componentName: '', marksObtained: '' });

  // Bulk Grade entry state
  const [viewMode, setViewMode] = useState('overview'); // 'overview' or 'bulk'
  const [selectedComponent, setSelectedComponent] = useState('');
  const [bulkMarks, setBulkMarks] = useState({});
  const [initialBulkMarks, setInitialBulkMarks] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'ungraded', 'graded'
  const [isSavingBulk, setIsSavingBulk] = useState(false);

  // Excel / CSV Import State
  const fileInputRef = useRef(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isSavingImport, setIsSavingImport] = useState(false);

  useEffect(() => { fetchCourses(); }, [user?.courses]);

  const fetchCourses = async () => {
    try {
      const res = await coursesAPI.getAll({ limit: 100 });
      const apiCourses = res.data?.data || res.data || [];
      const userId = user?._id || user?.id;
      const userCourseIds = (user?.courses || []).map(c => (c._id || c).toString());

      const myCourses = apiCourses.filter(c => {
        const profId = (c.professor?._id || c.professor)?.toString();
        if (profId && userId && profId === userId.toString()) return true;
        if (userCourseIds.includes(c._id.toString())) return true;
        return false;
      });

      if (myCourses.length > 0) {
        setCourses(myCourses);
      } else if (user?.courses?.length) {
        setCourses(user.courses);
      } else {
        setCourses([]);
      }
    } catch (err) {
      if (user?.courses?.length) {
        setCourses(user.courses);
      } else {
        setCourses([]);
      }
    } finally { setLoading(false); }
  };

  useEffect(() => {
    if (selectedCourse) {
      fetchGradebook();
      fetchCourseStudents();
    } else {
      setGradebook(null);
      setStudentGrades([]);
      setStats(null);
      setStudents([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCourse]);

  // Set default selected component when gradebook changes
  useEffect(() => {
    if (gradebook?.components?.length) {
      if (!selectedComponent) {
        setSelectedComponent('ALL');
      }
    } else {
      setSelectedComponent('');
    }
  }, [gradebook, selectedComponent]);

  // Sync initial bulk marks from gradebook for active students & selected component
  useEffect(() => {
    if (!selectedComponent || !students.length || !gradebook) {
      setInitialBulkMarks({});
      setBulkMarks({});
      return;
    }

    const map = {};
    students.forEach(s => {
      const entry = gradebook.grades?.find(
        g => (g.student?._id || g.student)?.toString() === s._id.toString()
          && g.componentName === selectedComponent
      );
      map[s._id] = entry ? String(entry.marksObtained) : '';
    });

    setInitialBulkMarks(map);
    setBulkMarks(map);
  }, [selectedComponent, students, gradebook]);

  const fetchGradebook = async () => {
    setLoadingGradebook(true);
    try {
      const res = await gradebookAPI.getCourse(selectedCourse);
      setGradebook(res.data.gradebook || null);
      setStudentGrades(res.data.studentGrades || []);
      setStats(res.data.stats || null);
    } catch (err) {
      if (err.response?.status === 404) {
        setGradebook(null);
        setStudentGrades([]);
        setStats(null);
      } else {
        toast.error('Failed to load gradebook');
      }
    }
    finally { setLoadingGradebook(false); }
  };

  const fetchCourseStudents = async () => {
    if (!selectedCourse) {
      setStudents([]);
      return;
    }

    try {
      const res = await coursesAPI.getStudents(selectedCourse);

      const studentList =
        res.data?.data ||
        res.data?.students ||
        res.data ||
        [];

      setStudents(Array.isArray(studentList) ? studentList : []);
    } catch (err) {
      console.error('Failed to fetch course students:', err);
      setStudents([]);
    }
  };

  const handleSetComponents = async (e) => {
    e.preventDefault();
    const parsed = components.map(c => ({
      name: c.name,
      weightage: parseFloat(c.weightage),
      maxMarks: parseInt(c.maxMarks)
    }));

    const totalWeight = parsed.reduce((sum, c) => sum + c.weightage, 0);
    if (totalWeight !== 100) {
      toast.error(`Total weightage must be 100% (currently ${totalWeight}%)`);
      return;
    }

    try {
      await gradebookAPI.setComponents(selectedCourse, { components: parsed });
      toast.success('Grade components saved');
      setShowComponentForm(false);
      fetchGradebook();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save components'); }
  };

  const handleEnterGrade = async (e) => {
    e.preventDefault();
    try {
      await gradebookAPI.enterGrades(selectedCourse, {
        grades: [{
          student: gradeForm.student,
          componentName: gradeForm.componentName,
          marksObtained: parseFloat(gradeForm.marksObtained)
        }]
      });
      toast.success('Single grade entered');
      setGradeForm({ student: '', componentName: '', marksObtained: '' });
      setShowGradeForm(false);
      fetchGradebook();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to enter grade'); }
  };

  const handleSaveBulkMarks = async () => {
    if (!selectedCourse || !selectedComponent) return;

    const compObj = gradebook?.components?.find(c => c.name === selectedComponent);
    const maxMarksVal = compObj ? compObj.maxMarks : 100;

    const gradesPayload = [];
    const clientErrors = [];

    students.forEach(s => {
      const val = bulkMarks[s._id];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        const num = Number(val);
        if (isNaN(num)) {
          clientErrors.push(`${s.name}: Marks must be a valid number.`);
        } else if (num < 0) {
          clientErrors.push(`${s.name}: Marks cannot be negative.`);
        } else if (num > maxMarksVal) {
          clientErrors.push(`${s.name}: Marks (${num}) exceed maximum allowed (${maxMarksVal}).`);
        } else {
          gradesPayload.push({
            student: s._id,
            marksObtained: num
          });
        }
      }
    });

    if (clientErrors.length > 0) {
      toast.error(clientErrors[0]);
      return;
    }

    if (gradesPayload.length === 0) {
      toast.error('No marks entered to save');
      return;
    }

    setIsSavingBulk(true);
    try {
      const res = await gradebookAPI.enterBulkGrades(selectedCourse, {
        componentName: selectedComponent,
        grades: gradesPayload
      });
      toast.success(res.data?.message || `Saved ${gradesPayload.length} grades successfully`);
      fetchGradebook();
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Failed to save bulk grades';
      toast.error(errMsg);
      if (err.response?.data?.errors?.length) {
        console.error('Bulk grade validation errors:', err.response.data.errors);
      }
    } finally {
      setIsSavingBulk(false);
    }
  };

  const handleBulkMarkChange = (studentId, val) => {
    setBulkMarks(prev => ({ ...prev, [studentId]: val }));
  };

  // Excel / CSV Template Download
  const handleDownloadTemplate = async (includeExisting = false) => {
    if (!selectedCourse) {
      toast.error('Please select a course first');
      return;
    }
    const targetComponent = selectedComponent || 'ALL';
    try {
      const res = await gradebookAPI.downloadTemplate(selectedCourse, {
        componentName: targetComponent,
        includeExisting
      });

      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const selectedCourseObj = courses.find(c => (c._id?._id || c._id)?.toString() === selectedCourse?.toString());
      const codeStr = selectedCourseObj ? selectedCourseObj.code : 'Course';
      const isAll = targetComponent === 'ALL' || targetComponent === 'All Components';
      const compStr = isAll ? 'Complete_Gradebook' : targetComponent.replace(/[^a-z0-9]/gi, '_');
      const suffix = isAll ? 'Full' : (includeExisting ? 'CurrentMarks' : 'Template');
      link.download = `${codeStr}_${compStr}_${suffix}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(isAll ? 'Downloaded complete gradebook successfully' : `Downloaded ${includeExisting ? 'current marks' : 'template'} successfully`);
    } catch (err) {
      console.error('Download spreadsheet error:', err);
      let errMsg = 'Failed to download spreadsheet';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          if (parsed.message) errMsg = parsed.message;
        } catch (e) {
          // not JSON
        }
      } else if (err.response?.data?.message) {
        errMsg = err.response.data.message;
      }
      toast.error(errMsg);
    }
  };

  // Excel / CSV File Select & Preview Trigger
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedCourse || !selectedComponent) {
      toast.error('Please select a course and component first');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('componentName', selectedComponent);

    setIsUploadingFile(true);
    try {
      const res = await gradebookAPI.previewImport(selectedCourse, formData);
      setImportPreview(res.data);
      setShowImportModal(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to parse file for import');
    } finally {
      setIsUploadingFile(false);
      if (e.target) e.target.value = '';
    }
  };

  // Confirm Import (Calls authoritative POST /api/gradebook/:courseId/grades/bulk API)
  const handleConfirmImport = async () => {
    if (!importPreview || !importPreview.canImport || !importPreview.previewRows) return;

    const gradesPayload = importPreview.previewRows
      .filter(r => r.status === 'Valid' && r.marks !== null && r.marks !== undefined)
      .map(r => ({
        student: r.studentId,
        enrollment: r.enrollmentId,
        marksObtained: r.marks
      }));

    if (gradesPayload.length === 0) {
      toast.error('No valid marks to save');
      return;
    }

    setIsSavingImport(true);
    try {
      const res = await gradebookAPI.enterBulkGrades(selectedCourse, {
        componentName: selectedComponent,
        grades: gradesPayload
      });
      toast.success(res.data?.message || `Imported ${gradesPayload.length} grades successfully`);
      setShowImportModal(false);
      setImportPreview(null);
      fetchGradebook();
    } catch (err) {
      const errMsg = err.response?.data?.message || 'Failed to save imported grades';
      toast.error(errMsg);
    } finally {
      setIsSavingImport(false);
    }
  };

  const addComponentRow = () => {
    setComponents([...components, { name: '', weightage: '', maxMarks: '' }]);
  };

  const removeComponentRow = (idx) => {
    setComponents(components.filter((_, i) => i !== idx));
  };

  const updateComponent = (idx, field, value) => {
    const updated = [...components];
    updated[idx] = { ...updated[idx], [field]: value };
    setComponents(updated);
  };

  const openComponentForm = () => {
    if (gradebook?.components?.length) {
      setComponents(gradebook.components.map(c => ({
        name: c.name,
        weightage: c.weightage.toString(),
        maxMarks: c.maxMarks.toString()
      })));
    } else {
      setComponents([{ name: '', weightage: '', maxMarks: '' }]);
    }
    setShowComponentForm(true);
  };

  const compObj = gradebook?.components?.find(c => c.name === selectedComponent);
  const maxMarksVal = compObj ? compObj.maxMarks : 100;

  // Filter roster by search query and status filter
  const filteredStudents = students.filter(s => {
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const nameMatch = s.name?.toLowerCase().includes(q);
      const enrMatch = s.enrollmentNumber?.toLowerCase().includes(q);
      if (!nameMatch && !enrMatch) return false;
    }

    const val = bulkMarks[s._id];
    const isGraded = val !== undefined && val !== null && String(val).trim() !== '';
    if (statusFilter === 'graded' && !isGraded) return false;
    if (statusFilter === 'ungraded' && isGraded) return false;

    return true;
  });

  const totalCount = students.length;
  const gradedCount = students.filter(s => {
    const v = bulkMarks[s._id];
    return v !== undefined && v !== null && String(v).trim() !== '';
  }).length;
  const missingCount = totalCount - gradedCount;
  const activeMarksCount = students.filter(s => {
    const v = bulkMarks[s._id];
    return v !== undefined && v !== null && String(v).trim() !== '';
  }).length;

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-6">
      {/* Hidden file input for Excel/CSV upload */}
      <input
        type="file"
        ref={fileInputRef}
        accept=".xlsx, .csv"
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-heading">Gradebook</h1>
        {selectedCourse && (
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full sm:w-auto">
            <button onClick={openComponentForm} className="border border-border px-4 py-2 rounded-btn text-sm hover:bg-gray-50 w-full sm:w-auto text-center">
              {gradebook ? 'Edit Components' : 'Setup Components'}
            </button>
            {gradebook && (
              <>
                <button
                  onClick={() => setViewMode(viewMode === 'bulk' ? 'overview' : 'bulk')}
                  className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-4 py-2 rounded-btn text-sm font-medium w-full sm:w-auto text-center"
                >
                  {viewMode === 'bulk' ? 'View Class Overview' : 'Bulk Grade Entry'}
                </button>
                <button onClick={() => setShowGradeForm(!showGradeForm)} className="btn-primary px-4 py-2 rounded-btn text-sm w-full sm:w-auto text-center">
                  {showGradeForm ? 'Cancel' : '+ Enter Single Grade'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-heading mb-1">Semester</label>
          <select
            value={selectedSemester}
            onChange={e => { setSelectedSemester(e.target.value); setSelectedCourse(''); }}
            className="form-input w-full"
          >
            <option value="">Select Semester</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
              <option key={s} value={String(s)}>Semester {s}</option>
            ))}
          </select>
          <p className="text-xs text-muted mt-1">Select the semester first, then choose a course from that semester</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-heading mb-1">Course</label>
          {(() => {
            const filteredForSem = courses.filter(c => Number(c.semester) === Number(selectedSemester));
            return (
              <>
                <select
                  value={selectedCourse}
                  onChange={e => setSelectedCourse(e.target.value)}
                  className="form-input w-full"
                  disabled={!selectedSemester}
                >
                  {!selectedSemester ? (
                    <option value="">Please select a semester first</option>
                  ) : filteredForSem.length === 0 ? (
                    <option value="" disabled selected>No courses from this semester are assigned to you.</option>
                  ) : (
                    <>
                      <option value="">Select course for Semester {selectedSemester}</option>
                      {filteredForSem.map(c => (
                        <option key={c._id} value={c._id}>{c.name} ({c.code})</option>
                      ))}
                    </>
                  )}
                </select>
                {selectedSemester && filteredForSem.length === 0 && (
                  <p className="text-xs text-red-600 mt-1 font-medium">
                    No courses from this semester are assigned to you.
                  </p>
                )}
              </>
            );
          })()}
        </div>
      </div>

      {/* Component Setup Form */}
      {showComponentForm && (
        <form onSubmit={handleSetComponents} className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4">
          <h2 className="text-lg font-semibold text-heading">Grade Components (total weightage must = 100%)</h2>
          {components.map((comp, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input type="text" value={comp.name} onChange={e => updateComponent(i, 'name', e.target.value)} className="form-input w-full" required placeholder="e.g., Midterm Exam" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Weightage (%) *</label>
                <input type="number" value={comp.weightage} onChange={e => updateComponent(i, 'weightage', e.target.value)} className="form-input w-full" required min={0} max={100} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Max Marks *</label>
                <input type="number" value={comp.maxMarks} onChange={e => updateComponent(i, 'maxMarks', e.target.value)} className="form-input w-full" required min={1} />
              </div>
              <div>
                {components.length > 1 && (
                  <button type="button" onClick={() => removeComponentRow(i)} className="text-red-600 hover:text-red-800 text-sm px-3 py-2 w-full sm:w-auto text-left sm:text-center">Remove</button>
                )}
              </div>
            </div>
          ))}
          <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3">
            <button type="button" onClick={addComponentRow} className="border border-border px-4 py-2 rounded-btn text-sm hover:bg-gray-50 w-full sm:w-auto text-center">+ Add Component</button>
            <button type="submit" className="btn-primary px-4 py-2 rounded-btn text-sm w-full sm:w-auto text-center">Save Components</button>
            <button type="button" onClick={() => setShowComponentForm(false)} className="text-muted text-sm px-4 py-2 w-full sm:w-auto text-center">Cancel</button>
          </div>
        </form>
      )}

      {/* Single Grade Entry Form */}
      {showGradeForm && gradebook && (
        <form onSubmit={handleEnterGrade} className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4">
          <h2 className="text-lg font-semibold text-heading">Enter Single Student Grade</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Student *</label>
              <select value={gradeForm.student} onChange={e => setGradeForm({...gradeForm, student: e.target.value})} className="form-input w-full" required>
                <option value="">{students.length === 0 ? 'No enrolled students' : 'Select student'}</option>
                {students.map(student => (
                  <option key={student._id} value={student._id}>
                    {student.name}
                    {student.enrollmentNumber
                      ? ` — ${student.enrollmentNumber}`
                      : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Component *</label>
              <select value={gradeForm.componentName} onChange={e => setGradeForm({...gradeForm, componentName: e.target.value})} className="form-input w-full" required>
                <option value="">Select component</option>
                {gradebook.components.map(c => <option key={c.name} value={c.name}>{c.name} (Max: {c.maxMarks})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Marks Obtained *</label>
              <input type="number" value={gradeForm.marksObtained} onChange={e => setGradeForm({...gradeForm, marksObtained: e.target.value})} className="form-input w-full" required min={0} />
            </div>
          </div>
          <button type="submit" className="btn-primary px-4 py-2 rounded-btn text-sm w-full sm:w-auto text-center">Enter Grade</button>
        </form>
      )}

      {!selectedCourse ? (
        <div className="bg-surface rounded-card shadow-card border border-border p-12 text-center text-muted">Select a course to view gradebook</div>
      ) : loadingGradebook ? (
        <div className="flex justify-center items-center h-32"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
      ) : !gradebook ? (
        <div className="bg-surface rounded-card shadow-card border border-border p-12 text-center text-muted">
          <p className="text-lg mb-2">No gradebook set up for this course</p>
          <p className="text-sm">Click &quot;Setup Components&quot; to define grade components first.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Class Stats */}
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-surface rounded-card shadow-card border border-border p-4 text-center">
                <p className="text-2xl font-bold text-blue-600">{stats.totalStudents}</p>
                <p className="text-xs text-muted mt-1">Students</p>
              </div>
              <div className="bg-surface rounded-card shadow-card border border-border p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{stats.average}%</p>
                <p className="text-xs text-muted mt-1">Average</p>
              </div>
              <div className="bg-surface rounded-card shadow-card border border-border p-4 text-center">
                <p className="text-2xl font-bold text-purple-600">{stats.highest}%</p>
                <p className="text-xs text-muted mt-1">Highest</p>
              </div>
              <div className="bg-surface rounded-card shadow-card border border-border p-4 text-center">
                <p className="text-2xl font-bold text-amber-600">{stats.lowest}%</p>
                <p className="text-xs text-muted mt-1">Lowest</p>
              </div>
              <div className="bg-surface rounded-card shadow-card border border-border p-4 text-center">
                <p className="text-2xl font-bold text-green-600">{stats.passCount}</p>
                <p className="text-xs text-muted mt-1">Pass</p>
              </div>
              <div className="bg-surface rounded-card shadow-card border border-border p-4 text-center">
                <p className="text-2xl font-bold text-red-600">{stats.failCount}</p>
                <p className="text-xs text-muted mt-1">Fail</p>
              </div>
            </div>
          )}

          {/* Primary View Mode Switch: Bulk Grade Entry vs Summary Overview */}
          {viewMode === 'bulk' ? (
            <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4 sm:space-y-6">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-bold text-heading">Bulk Grade Entry</h2>
                  <p className="text-xs text-muted mt-0.5">Enter or update marks for all enrolled students at once</p>
                </div>
                <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 w-full lg:w-auto">
                  <div className="flex items-center gap-2 mr-0 sm:mr-2">
                    <label className="text-sm font-medium text-heading whitespace-nowrap">Component:</label>
                    <select
                      value={selectedComponent === 'ALL' ? (gradebook.components[0]?.name || '') : selectedComponent}
                      onChange={e => setSelectedComponent(e.target.value)}
                      className="form-input py-1.5 text-sm font-medium w-full sm:w-auto"
                    >
                      {gradebook.components.map(c => (
                        <option key={c.name} value={c.name}>
                          {c.name} (Max: {c.maxMarks}, Weight: {c.weightage}%)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Excel / CSV Action Buttons */}
                  <button
                    type="button"
                    onClick={() => handleDownloadTemplate(false)}
                    className="border border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-btn text-xs font-medium inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
                    title="Download Excel template containing active course roster"
                  >
                    <Icons.Download className="w-3.5 h-3.5" /> Download Template
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingFile}
                    className="border border-blue-600 text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-btn text-xs font-medium inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
                    title="Upload filled Excel (.xlsx) or CSV (.csv) file"
                  >
                    {isUploadingFile ? 'Uploading...' : <><Icons.Upload className="w-3.5 h-3.5" /> Upload Excel/CSV</>}
                  </button>

                  <button
                    onClick={handleSaveBulkMarks}
                    disabled={isSavingBulk || activeMarksCount === 0}
                    className={`px-5 py-2 rounded-btn text-sm font-semibold shadow-sm transition-colors w-full sm:w-auto text-center ${
                      isSavingBulk || activeMarksCount === 0
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {isSavingBulk ? 'Saving...' : activeMarksCount > 0 ? `SAVE ALL MARKS (${activeMarksCount})` : 'No marks to save'}
                  </button>
                </div>
              </div>

              {/* Roster Controls: Counters & Filters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center bg-gray-50 p-3 sm:p-4 rounded-lg border border-border">
                {/* Counters */}
                <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs font-semibold">
                  <span className="bg-blue-100 text-blue-800 px-2.5 py-1 rounded-full">{totalCount} Enrolled Students</span>
                  <span className="bg-green-100 text-green-800 px-2.5 py-1 rounded-full">{gradedCount} Graded</span>
                  <span className="bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">{missingCount} Missing</span>
                </div>

                {/* Filter Pills */}
                <div className="flex flex-wrap items-center justify-start md:justify-center gap-1.5">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`px-3 py-1 text-xs rounded-full font-medium ${statusFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                    All ({totalCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter('ungraded')}
                    className={`px-3 py-1 text-xs rounded-full font-medium ${statusFilter === 'ungraded' ? 'bg-amber-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                    Ungraded ({missingCount})
                  </button>
                  <button
                    onClick={() => setStatusFilter('graded')}
                    className={`px-3 py-1 text-xs rounded-full font-medium ${statusFilter === 'graded' ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                  >
                    Graded ({gradedCount})
                  </button>
                </div>

                {/* Search */}
                <div>
                  <input
                    type="text"
                    placeholder="Search student by name or enrollment..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="form-input w-full text-xs py-1.5"
                  />
                </div>
              </div>

              {/* Bulk Roster Table */}
              <div className="overflow-x-auto rounded-card border border-border">
                <table className="w-full min-w-[560px] md:min-w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b border-border text-xs text-muted uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-3 w-12 text-center whitespace-nowrap">#</th>
                      <th className="px-4 py-3 whitespace-nowrap">Student Name</th>
                      <th className="px-4 py-3 whitespace-nowrap">Enrollment Number</th>
                      <th className="px-4 py-3 text-center whitespace-nowrap">Marks Obtained (Max: {maxMarksVal})</th>
                      <th className="px-4 py-3 text-center w-28 whitespace-nowrap">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border text-sm">
                    {filteredStudents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="text-center py-8 text-muted">
                          <div className="sticky left-0 w-full max-w-[calc(100vw-3.5rem)] sm:max-w-none text-center">
                            {students.length === 0 ? 'No active enrolled students found for this course.' : 'No students match the search/filter criteria.'}
                          </div>
                        </td>
                      </tr>
                    ) : (
                      filteredStudents.map((s, idx) => {
                        const markVal = bulkMarks[s._id] ?? '';
                        const isGraded = markVal !== undefined && markVal !== null && String(markVal).trim() !== '';
                        return (
                          <tr key={s._id} className="hover:bg-blue-50/40 transition-colors">
                            <td className="px-4 py-2.5 text-center text-muted font-mono text-xs">{idx + 1}</td>
                            <td className="px-4 py-2.5 font-medium text-heading whitespace-nowrap">{s.name}</td>
                            <td className="px-4 py-2.5 text-muted font-mono text-xs whitespace-nowrap">{s.enrollmentNumber || 'N/A'}</td>
                            <td className="px-4 py-2.5 text-center">
                              <div className="inline-flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={maxMarksVal}
                                  placeholder="Marks"
                                  value={markVal}
                                  onChange={e => handleBulkMarkChange(s._id, e.target.value)}
                                  className="form-input w-28 text-center font-semibold text-heading focus:ring-blue-500 py-1"
                                />
                                <span className="text-xs text-muted font-medium">/ {maxMarksVal}</span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-center">
                              <span className={`inline-block px-2.5 py-0.5 text-xs rounded-full font-medium ${isGraded ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                {isGraded ? 'Graded' : 'Ungraded'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Bottom Action Footer */}
              <div className="flex justify-end pt-2">
                <button
                  onClick={handleSaveBulkMarks}
                  disabled={isSavingBulk || activeMarksCount === 0}
                  className={`w-full sm:w-auto text-center px-6 py-2.5 rounded-btn text-sm font-semibold shadow-md transition-colors ${
                    isSavingBulk || activeMarksCount === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {isSavingBulk ? 'Saving...' : activeMarksCount > 0 ? `SAVE ALL MARKS (${activeMarksCount})` : 'No marks to save'}
                </button>
              </div>
            </div>
          ) : (
            /* Summary Overview Table */
            <div className="space-y-6">
              {/* Components overview */}
              <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left Side: Components Title & Pills */}
                  <div>
                    <h3 className="text-sm font-bold text-heading mb-2">Course Components</h3>
                    <div className="flex flex-wrap gap-2">
                      {gradebook.components.map(c => (
                        <span key={c.name} className="bg-blue-50 text-blue-700 text-xs px-3 py-1 rounded-full font-medium border border-blue-100">
                          {c.name} ({c.weightage}% · Max {c.maxMarks})
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Right Side: Download Control Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-gray-50 p-2.5 rounded-lg border border-border w-full lg:w-auto">
                    <span className="text-xs font-semibold text-heading whitespace-nowrap">Export Options:</span>
                    <select
                      value={selectedComponent || 'ALL'}
                      onChange={e => setSelectedComponent(e.target.value)}
                      className="form-input py-1.5 px-3 text-xs font-medium bg-white rounded-md border-gray-300 shadow-sm focus:ring-blue-500 w-full sm:w-auto sm:max-w-xs"
                    >
                      <option value="ALL">All Components (Complete Gradebook)</option>
                      {gradebook.components.map(c => (
                        <option key={c.name} value={c.name}>
                          {c.name} (Max: {c.maxMarks}, Weight: {c.weightage}%)
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate(true)}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-md text-xs font-medium shadow-sm transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5 w-full sm:w-auto"
                      title="Download spreadsheet export for selected component or complete gradebook"
                    >
                      <Icons.BarChart className="w-3.5 h-3.5" /> {selectedComponent === 'ALL' || !selectedComponent ? 'Download Complete Gradebook' : 'Download Component Marks'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Student grades table */}
              <div className="bg-surface rounded-card shadow-card border border-border overflow-x-auto">
                <table className="w-full min-w-[560px] md:min-w-full">
                  <thead className="bg-gray-50 border-b border-border">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-medium text-muted whitespace-nowrap">Student</th>
                      {gradebook.components.map(c => (
                        <th key={c.name} className="text-center px-4 py-3 text-sm font-medium text-muted whitespace-nowrap">{c.name}</th>
                      ))}
                      <th className="text-center px-4 py-3 text-sm font-medium text-muted whitespace-nowrap">Total (%)</th>
                      <th className="text-center px-4 py-3 text-sm font-medium text-muted whitespace-nowrap">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {studentGrades.length === 0 ? (
                      <tr>
                        <td colSpan={gradebook.components.length + 3} className="text-center py-8 text-muted">
                          <div className="sticky left-0 w-full max-w-[calc(100vw-3.5rem)] sm:max-w-none text-center">
                            No grades entered yet
                          </div>
                        </td>
                      </tr>
                    ) : (
                      studentGrades.map((sg, i) => (
                        <tr key={sg.student?._id || i} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{sg.student?.name || 'N/A'}</td>
                          {gradebook.components.map(c => {
                            const comp = sg.components?.[c.name];
                            return (
                              <td key={c.name} className="px-4 py-3 text-center text-sm whitespace-nowrap">
                                {comp ? `${comp.obtained}/${comp.max}` : '—'}
                              </td>
                            );
                          })}
                          <td className="px-4 py-3 text-center text-sm font-semibold whitespace-nowrap">{sg.totalWeighted}%</td>
                          <td className="px-4 py-3 text-center whitespace-nowrap">
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              sg.letterGrade === 'A+' || sg.letterGrade === 'A' ? 'bg-green-100 text-green-700' :
                              sg.letterGrade === 'B' ? 'bg-blue-100 text-blue-700' :
                              sg.letterGrade === 'C' ? 'bg-amber-100 text-amber-700' :
                              sg.letterGrade === 'F' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>{sg.letterGrade}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import Preview Modal */}
      {showImportModal && importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 sm:p-4">
          <div className="bg-surface border border-border rounded-card shadow-2xl max-w-4xl w-full p-4 sm:p-6 space-y-4 sm:space-y-6 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-start sm:items-center border-b border-border pb-3">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-heading">IMPORT PREVIEW</h2>
                <p className="text-xs text-muted mt-0.5">
                  Course: {importPreview.course?.name} ({importPreview.course?.code}) | Component: {importPreview.component?.name} (Max: {importPreview.component?.maxMarks})
                </p>
              </div>
              <button onClick={() => { setShowImportModal(false); setImportPreview(null); }} className="text-muted hover:text-heading p-1 flex items-center justify-center">
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            {/* Summary Counters */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs font-semibold bg-gray-50 p-3 rounded-lg border border-border">
              <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full">Total Rows: {importPreview.summary?.totalRows}</span>
              <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full">Valid: {importPreview.summary?.validRows}</span>
              <span className={`px-3 py-1 rounded-full ${importPreview.summary?.errorRows > 0 ? 'bg-red-100 text-red-800 font-bold' : 'bg-gray-200 text-gray-700'}`}>
                Errors: {importPreview.summary?.errorRows}
              </span>
            </div>

            {!importPreview.canImport && (
              <div className="bg-red-50 text-red-700 border border-red-200 p-3 rounded-md text-xs font-medium flex items-center gap-2">
                <Icons.AlertTriangle className="w-4 h-4 text-red-600 shrink-0 inline" />
                <span>The uploaded file contains validation errors. Please fix the highlighted rows in your spreadsheet and upload again. Partial imports are disabled.</span>
              </div>
            )}

            {/* Preview Table */}
            <div className="overflow-x-auto overflow-y-auto flex-1 rounded-card border border-border">
              <table className="w-full min-w-[580px] text-left text-sm border-collapse">
                <thead className="bg-gray-50 border-b border-border text-xs text-muted uppercase font-semibold sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5 w-12 text-center whitespace-nowrap">#</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Enrollment No.</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Student Name</th>
                    <th className="px-3 py-2.5 text-center whitespace-nowrap">Marks</th>
                    <th className="px-3 py-2.5 text-center w-24 whitespace-nowrap">Status</th>
                    <th className="px-3 py-2.5 whitespace-nowrap">Reason / Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {importPreview.previewRows?.map((row, idx) => (
                    <tr key={idx} className={row.status === 'Error' ? 'bg-red-50/50' : 'hover:bg-gray-50'}>
                      <td className="px-3 py-2 text-center text-xs font-mono text-muted">{row.rowNumber || idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs text-heading whitespace-nowrap">{row.enrollmentNumber || 'N/A'}</td>
                      <td className="px-3 py-2 font-medium text-heading whitespace-nowrap">{row.studentName}</td>
                      <td className="px-3 py-2 text-center font-semibold whitespace-nowrap">
                        {row.marks !== null && row.marks !== undefined ? `${row.marks} / ${importPreview.component?.maxMarks}` : (row.rawMarks || '—')}
                      </td>
                      <td className="px-3 py-2 text-center whitespace-nowrap">
                        <span className={`inline-block px-2.5 py-0.5 text-xs rounded-full font-semibold ${row.status === 'Valid' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-red-600 font-medium whitespace-nowrap">{row.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3 pt-2 border-t border-border">
              <button onClick={() => { setShowImportModal(false); setImportPreview(null); }} className="w-full sm:w-auto px-4 py-2 border border-border rounded-btn text-sm hover:bg-gray-50 text-center">
                Cancel
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={!importPreview.canImport || isSavingImport}
                className={`w-full sm:w-auto text-center px-5 py-2 rounded-btn text-sm font-semibold transition-colors ${
                  !importPreview.canImport || isSavingImport
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
                }`}
              >
                {isSavingImport ? 'Saving Import...' : 'Confirm & Save Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


