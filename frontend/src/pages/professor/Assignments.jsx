import { useState, useEffect } from 'react';
import { assignmentsAPI, coursesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function ProfAssignments() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    semester: '1',
    course: '',
    dueDate: '',
    totalMarks: 100,
    rubric: []
  });
  const [rubricRows, setRubricRows] = useState([]);
  const [questionPdfFile, setQuestionPdfFile] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [showSubmissionsModal, setShowSubmissionsModal] = useState(false);
  const [activeSubmissions, setActiveSubmissions] = useState([]);

  // AI Evaluation Modal State
  const [evalModalSub, setEvalModalSub] = useState(null);
  const [finalizeMarks, setFinalizeMarks] = useState('');
  const [finalizeFeedback, setFinalizeFeedback] = useState('');
  const [isSubmittingFinal, setIsSubmittingFinal] = useState(false);
  const [isReevaluating, setIsReevaluating] = useState(false);

  useEffect(() => { fetchData(); }, []);

  useEffect(() => {
    if (!showSubmissionsModal || !selectedAssignment) return;

    const hasProcessing = activeSubmissions.some(s => 
      s.evaluationStatus === 'PROCESSING' || s.evaluationStatus === 'PENDING'
    );

    if (!hasProcessing) return;

    const interval = setInterval(async () => {
      try {
        const res = await assignmentsAPI.getSubmissions(selectedAssignment._id);
        setActiveSubmissions(res.data.submissions || []);
      } catch (err) {
        console.error('Submissions polling error:', err.message);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [showSubmissionsModal, selectedAssignment, activeSubmissions]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const res = await assignmentsAPI.getAll({ createdBy: user.id });
      setAssignments(res.data.data || []);
      
      try {
        const coursesRes = await coursesAPI.getAll({ limit: 100 });
        const apiCourses = coursesRes.data?.data || coursesRes.data || [];
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
      }
    } catch (err) {
      toast.error('Failed to load assignments');
    } finally {
      setLoading(false);
    }
  };

  const handleAddRubricRow = () => {
    setRubricRows([...rubricRows, { criterion: '', maxMarks: 10, description: '' }]);
  };

  const handleRemoveRubricRow = (idx) => {
    setRubricRows(rubricRows.filter((_, i) => i !== idx));
  };

  const handleRubricChange = (idx, field, val) => {
    const updated = [...rubricRows];
    updated[idx][field] = field === 'maxMarks' ? parseInt(val) || 0 : val;
    setRubricRows(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!questionPdfFile) {
      toast.error('Question PDF document is required to create an assignment.');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('title', form.title);
      formData.append('description', form.description);
      formData.append('semester', form.semester);
      formData.append('course', form.course);
      formData.append('dueDate', form.dueDate);
      formData.append('maxMarks', form.totalMarks);

      if (questionPdfFile) {
        formData.append('questionPdf', questionPdfFile);
      }

      const validRubric = rubricRows.filter(r => r.criterion.trim() && r.maxMarks > 0);
      if (validRubric.length > 0) {
        formData.append('rubric', JSON.stringify(validRubric));
      }

      await assignmentsAPI.create(formData);
      toast.success('Assignment created with AI Evaluation enabled');
      setForm({ title: '', description: '', semester: '1', course: '', dueDate: '', totalMarks: 100, rubric: [] });
      setRubricRows([]);
      setQuestionPdfFile(null);
      setShowForm(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create assignment');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this assignment?')) return;
    try {
      await assignmentsAPI.delete(id);
      toast.success('Assignment deleted');
      fetchData();
    } catch (err) { toast.error('Failed to delete'); }
  };

  const openSubmissionsModal = async (assignment) => {
    setSelectedAssignment(assignment);
    setShowSubmissionsModal(true);
    try {
      const res = await assignmentsAPI.getSubmissions(assignment._id);
      setActiveSubmissions(res.data.submissions || []);
    } catch (err) {
      setActiveSubmissions(assignment.submissions || []);
    }
  };

  const handleExportExcel = async (assignment) => {
    try {
      toast.loading('Generating Excel evaluation report...', { id: 'excel' });
      const res = await assignmentsAPI.exportExcel(assignment._id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${assignment.title.replace(/[^a-z0-9]/gi, '_')}_evaluation_report.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Excel report downloaded', { id: 'excel' });
    } catch (err) {
      toast.error('Failed to export Excel report', { id: 'excel' });
    }
  };

  const openEvalModal = (sub) => {
    setEvalModalSub(sub);
    setFinalizeMarks(sub.marks !== null && sub.marks !== undefined ? sub.marks : (sub.aiEvaluation?.suggestedMarks ?? ''));
    setFinalizeFeedback(sub.feedback || sub.professorFeedback || sub.aiEvaluation?.overallFeedback || '');
  };

  const handleTriggerReeval = async () => {
    if (!evalModalSub || !selectedAssignment) return;
    try {
      setIsReevaluating(true);
      await assignmentsAPI.evaluateSubmission(selectedAssignment._id, evalModalSub._id);
      toast.success('AI Evaluation triggered. Please refresh in a moment.');
      // Refresh submissions
      const res = await assignmentsAPI.getSubmissions(selectedAssignment._id);
      setActiveSubmissions(res.data.submissions || []);
      const updatedSub = (res.data.submissions || []).find(s => s._id === evalModalSub._id);
      if (updatedSub) openEvalModal(updatedSub);
    } catch (err) {
      toast.error('Failed to trigger AI evaluation');
    } finally {
      setIsReevaluating(false);
    }
  };

  const handleFinalizeSubmission = async () => {
    if (!evalModalSub || !selectedAssignment) return;
    const numMarks = parseFloat(finalizeMarks);
    if (isNaN(numMarks) || numMarks < 0) {
      toast.error('Please enter valid non-negative final marks');
      return;
    }
    if (numMarks > selectedAssignment.maxMarks) {
      toast.error(`Marks cannot exceed maximum marks (${selectedAssignment.maxMarks})`);
      return;
    }

    try {
      setIsSubmittingFinal(true);
      await assignmentsAPI.finalizeSubmission(selectedAssignment._id, evalModalSub._id, {
        marks: numMarks,
        feedback: finalizeFeedback
      });
      toast.success('Evaluation finalized successfully!');
      setEvalModalSub(null);
      // Refresh submissions
      const res = await assignmentsAPI.getSubmissions(selectedAssignment._id);
      setActiveSubmissions(res.data.submissions || []);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to finalize evaluation');
    } finally {
      setIsSubmittingFinal(false);
    }
  };

  const filtered = assignments.filter(a => a.title?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <h1 className="text-xl sm:text-2xl font-bold text-heading">Assignments</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary px-4 py-2 rounded-btn text-sm w-full sm:w-auto font-medium text-center shadow-sm"
        >
          {showForm ? 'Cancel' : '+ New Assignment'}
        </button>
      </div>

      {/* New Assignment Form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-6">
          <div className="border-b border-border pb-3 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-heading">Create New Assignment</h2>
              <p className="text-xs text-muted">Fill in details, attach question paper, and configure optional rubrics.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-muted hover:text-heading p-1"
              aria-label="Close"
            >
              <Icons.X className="w-5 h-5" />
            </button>
          </div>

          {/* Section 1: Assignment Details */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-muted uppercase tracking-wider">1. Assignment Details</h3>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Title *</label>
              <input
                type="text"
                placeholder="e.g. Implement Linked Lists and Binary Search Trees"
                value={form.title}
                onChange={e => setForm({...form, title: e.target.value})}
                className="form-input w-full text-sm"
                required
              />
            </div>
          </div>

          {/* Section 2: Course & Schedule */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold text-muted uppercase tracking-wider">2. Course & Schedule</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Semester *</label>
                <select
                  value={form.semester}
                  onChange={e => setForm(f => ({ ...f, semester: e.target.value, course: '' }))}
                  className="form-input w-full text-sm"
                  required
                >
                  <option value="">Select Semester</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                    <option key={s} value={String(s)}>Semester {s}</option>
                  ))}
                </select>
                <p className="text-[11px] text-muted mt-1">Select the semester first, then choose a course from that semester</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Course *</label>
                {(() => {
                  const filteredForSem = courses.filter(c => Number(c.semester) === Number(form.semester));
                  return (
                    <>
                      <select
                        value={form.course}
                        onChange={e => setForm(f => ({ ...f, course: e.target.value }))}
                        className="form-input w-full text-sm"
                        required
                        disabled={!form.semester}
                      >
                        {!form.semester ? (
                          <option value="">Please select a semester first</option>
                        ) : filteredForSem.length === 0 ? (
                          <option value="" disabled selected>No courses from this semester are assigned to you.</option>
                        ) : (
                          <>
                            <option value="">Select course for Semester {form.semester}</option>
                            {filteredForSem.map(c => (
                              <option key={c._id} value={c._id}>{c.name} ({c.code})</option>
                            ))}
                          </>
                        )}
                      </select>
                      {form.semester && filteredForSem.length === 0 && (
                        <p className="text-xs text-red-600 mt-1 font-medium">
                          No courses from this semester are assigned to you.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Due Date *</label>
                <input
                  type="datetime-local"
                  value={form.dueDate}
                  onChange={e => setForm({...form, dueDate: e.target.value})}
                  className="form-input w-full text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Total Marks *</label>
                <input
                  type="number"
                  value={form.totalMarks}
                  onChange={e => setForm({...form, totalMarks: parseInt(e.target.value) || 0})}
                  className="form-input w-full text-sm"
                  min={1}
                  required
                />
              </div>
            </div>
          </div>

          {/* Section 3: Instructions */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold text-muted uppercase tracking-wider">3. Instructions & Description</h3>
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm({...form, description: e.target.value})}
                className="form-input w-full text-sm min-h-[90px]"
                rows={3}
                placeholder="Enter additional information, context, requirements, or explanation about the assignment..."
              />
            </div>
          </div>

          {/* Section 4: Question Paper PDF */}
          <div className="space-y-4 pt-2">
            <h3 className="text-xs font-bold text-muted uppercase tracking-wider">4. Question Paper (PDF) *</h3>
            <div className="border-2 border-dashed border-border rounded-xl p-5 sm:p-6 text-center hover:border-blue-400 transition-colors bg-blue-50/20">
              <input
                type="file"
                accept=".pdf"
                onChange={e => setQuestionPdfFile(e.target.files[0] || null)}
                className="hidden"
                id="question-pdf-upload"
                required
              />
              <label htmlFor="question-pdf-upload" className="cursor-pointer block">
                {questionPdfFile ? (
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2 p-2 bg-white rounded-lg border border-blue-200">
                    <Icons.FileText className="w-6 h-6 text-blue-600 shrink-0" />
                    <span className="text-sm font-semibold text-blue-800 break-all">{questionPdfFile.name}</span>
                    <span className="text-xs text-muted">({(questionPdfFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setQuestionPdfFile(null); }}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline font-bold px-2 py-1"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mx-auto">
                      <Icons.Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="btn-primary text-xs px-4 py-2 inline-block shadow-sm">Choose PDF</span>
                    </div>
                    <p className="text-xs text-muted max-w-sm mx-auto">
                      Upload the required question paper PDF containing the questions students must answer
                    </p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Section 5: Optional Rubric Criteria */}
          <div className="border-t border-border pt-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div>
                <h3 className="text-sm font-bold text-heading">Optional Rubric Criteria</h3>
                <p className="text-xs text-muted">Help AI evaluate specific dimensions separately.</p>
              </div>
              <button
                type="button"
                onClick={handleAddRubricRow}
                className="text-xs text-blue-600 font-bold hover:underline inline-flex items-center gap-1 self-start sm:self-auto"
              >
                + Add Criterion
              </button>
            </div>

            {rubricRows.length > 0 && (
              <div className="space-y-3">
                {rubricRows.map((row, idx) => (
                  <div key={idx} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-gray-50/80 p-3 rounded-lg border border-border">
                    <input
                      type="text"
                      placeholder="Criterion Name (e.g. Working)"
                      value={row.criterion}
                      onChange={e => handleRubricChange(idx, 'criterion', e.target.value)}
                      className="form-input text-xs flex-1 w-full"
                    />
                    <input
                      type="number"
                      placeholder="Max Marks"
                      value={row.maxMarks}
                      onChange={e => handleRubricChange(idx, 'maxMarks', e.target.value)}
                      className="form-input text-xs w-full sm:w-28"
                      min={1}
                    />
                    <input
                      type="text"
                      placeholder="Description (optional)"
                      value={row.description}
                      onChange={e => handleRubricChange(idx, 'description', e.target.value)}
                      className="form-input text-xs flex-1 w-full"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveRubricRow(idx)}
                      className="text-red-500 hover:text-red-700 text-xs p-1.5 flex items-center justify-center self-end sm:self-auto rounded hover:bg-red-50"
                      title="Remove criterion"
                      aria-label="Remove criterion"
                    >
                      <Icons.X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 6: Form Actions */}
          <div className="border-t border-border pt-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="w-full sm:w-auto px-5 py-2.5 border border-border rounded-btn text-sm font-medium hover:bg-gray-100 transition-colors text-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="w-full sm:w-auto btn-primary px-6 py-2.5 rounded-btn text-sm font-bold text-center shadow-md shadow-blue-100"
            >
              Create Assignment
            </button>
          </div>
        </form>
      )}

      {/* Search Bar */}
      <div className="relative w-full max-w-sm">
        <Icons.Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          placeholder="Search assignments..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="form-input w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white rounded-lg border border-gray-200"
        />
      </div>

      {/* Assignment List */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-surface rounded-card shadow-card border border-border p-12 text-center text-muted">
            <Icons.FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-base font-medium text-heading">No assignments found</p>
            <p className="text-xs text-muted mt-1">
              {search ? 'Try adjusting your search criteria' : 'Create your first assignment to get started'}
            </p>
            {!search && (
              <button
                onClick={() => setShowForm(true)}
                className="mt-4 btn-primary text-xs px-4 py-2"
              >
                + New Assignment
              </button>
            )}
          </div>
        ) : (
          filtered.map(a => (
            <div
              key={a._id}
              className="bg-white rounded-xl border border-gray-200 shadow-2xs p-3.5 sm:p-4 hover:shadow-xs transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                {/* Left content area */}
                <div className="flex-1 min-w-0">
                  {/* Title and badges */}
                  <div className="flex flex-wrap items-center gap-2">
                    <h3
                      onClick={() => openSubmissionsModal(a)}
                      className="text-sm sm:text-base font-bold text-gray-900 hover:text-blue-600 cursor-pointer break-words transition-colors"
                    >
                      {a.title}
                    </h3>
                    {a.rubric && a.rubric.length > 0 && (
                      <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded font-medium shrink-0">
                        Rubric ({a.rubric.length} criteria)
                      </span>
                    )}
                    {a.questionPdf?.fileUrl && (
                      <a
                        href={a.questionPdf.fileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded font-medium hover:bg-blue-100 transition-colors inline-flex items-center gap-1 shrink-0"
                      >
                        <Icons.FileText className="w-3 h-3" /> Question PDF
                      </a>
                    )}
                  </div>

                  {/* Description */}
                  {a.description && (
                    <p className="text-xs text-gray-500 mt-1 break-words line-clamp-2">
                      {a.description}
                    </p>
                  )}

                  {/* Compact Metadata Row */}
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-2 text-xs">
                    <div>
                      <span className="text-gray-400">Course:</span>{' '}
                      <span className="text-gray-700 font-medium">{a.course?.name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Due:</span>{' '}
                      <span className="text-gray-700 font-medium">
                        {a.dueDate ? new Date(a.dueDate).toLocaleDateString('en-GB') : 'N/A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-400">Max Marks:</span>{' '}
                      <span className="text-gray-700 font-medium">{a.maxMarks}</span>
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() => openSubmissionsModal(a)}
                        className="text-blue-600 hover:text-blue-800 font-bold hover:underline inline-flex items-center gap-1 transition-colors"
                      >
                        <span>Submissions: {a.submissions?.length || 0}</span>
                        <span className="text-xs">→</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-center pt-2 sm:pt-0 border-t sm:border-0 border-gray-100 w-full sm:w-auto justify-end">
                  <button
                    onClick={() => handleExportExcel(a)}
                    className="text-xs bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-lg hover:bg-green-100 font-medium inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Icons.BarChart className="w-3.5 h-3.5" /> Export Excel
                  </button>
                  <button
                    onClick={() => handleDelete(a._id)}
                    className="text-xs text-red-500 hover:text-red-700 font-medium px-2 py-1 transition-colors hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Submissions Modal */}
      {showSubmissionsModal && selectedAssignment && (
        <div 
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-3 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSubmissionsModal(false);
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)] sm:max-h-[90vh] overflow-hidden flex flex-col"
            role="dialog"
            aria-modal="true"
            aria-labelledby="submissions-modal-title"
          >
            {/* Header */}
            <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-gray-50/80 shrink-0">
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between sm:block">
                  <div className="min-w-0 pr-2 sm:pr-0">
                    <h2 id="submissions-modal-title" className="text-lg sm:text-xl font-bold text-heading break-words sm:truncate">
                      Submissions & AI Evaluation
                    </h2>
                    <p className="text-xs text-muted break-words sm:truncate mt-0.5">
                      {selectedAssignment.title} • Max Marks: {selectedAssignment.maxMarks}
                    </p>
                  </div>
                  {/* Mobile close button at top-right */}
                  <button
                    type="button"
                    onClick={() => setShowSubmissionsModal(false)}
                    className="sm:hidden text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors shrink-0"
                    aria-label="Close"
                  >
                    <Icons.X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Action group */}
              <div className="flex items-center gap-2 self-stretch sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => handleExportExcel(selectedAssignment)}
                  className="btn-primary text-xs px-3 py-2 sm:py-1.5 bg-green-600 hover:bg-green-700 inline-flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto"
                >
                  <Icons.BarChart className="w-3.5 h-3.5" /> Export Excel Report
                </button>
                {/* Desktop close button */}
                <button
                  type="button"
                  onClick={() => setShowSubmissionsModal(false)}
                  className="hidden sm:flex text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-100 items-center justify-center transition-colors"
                  aria-label="Close"
                >
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto flex-1 min-h-0 overscroll-contain p-4 sm:p-6">
              {activeSubmissions.length === 0 ? (
                <div className="text-center py-12 text-muted">
                  <Icons.FileText className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                  <p className="font-medium text-gray-600">No submissions yet for this assignment.</p>
                  <p className="text-xs text-muted mt-1">Students will appear here once they submit their work.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activeSubmissions.map((sub, idx) => {
                    const status = sub.evaluationStatus || (sub.status === 'graded' ? 'FINALIZED' : 'NOT_EVALUATED');
                    return (
                      <div key={idx} className="border border-border rounded-xl p-4 hover:bg-gray-50/60 transition space-y-3 bg-white">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                          <div className="min-w-0">
                            <h4 className="font-bold text-heading text-sm sm:text-base flex flex-wrap items-center gap-2">
                              <span>{sub.student?.name || 'Student'}</span>
                              <span className="text-xs text-muted font-normal">({sub.student?.enrollmentNumber || 'No Enrollment#'})</span>
                            </h4>
                            <p className="text-xs text-muted mt-0.5">Submitted: {new Date(sub.submittedAt).toLocaleString()}</p>
                            {sub.isLate && (
                              <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded font-semibold mt-1 inline-flex items-center gap-1">
                                <Icons.AlertTriangle className="w-3 h-3" /> Late Submission
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                            {/* Evaluation Status Badge */}
                            {status === 'FINALIZED' && (
                              <span className="text-xs bg-green-100 text-green-800 font-bold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                                <Icons.Check className="w-3.5 h-3.5" /> FINALIZED ({sub.marks}/{selectedAssignment.maxMarks})
                              </span>
                            )}
                            {status === 'COMPLETED' && (
                              <span className="text-xs bg-blue-100 text-blue-800 font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                                <Icons.Bot className="w-3.5 h-3.5" /> AI Evaluated ({sub.aiEvaluation?.suggestedMarks}/{selectedAssignment.maxMarks})
                              </span>
                            )}
                            {status === 'PROCESSING' && (
                              <span className="text-xs bg-amber-100 text-amber-800 font-semibold px-2.5 py-1 rounded-full animate-pulse inline-flex items-center gap-1">
                                <Icons.Loader className="w-3.5 h-3.5" /> AI Evaluating...
                              </span>
                            )}
                            {status === 'FAILED' && (
                              <span className="text-xs bg-red-100 text-red-800 font-semibold px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                                <Icons.AlertTriangle className="w-3.5 h-3.5" /> Evaluation Failed
                              </span>
                            )}
                            {status === 'NOT_EVALUATED' && (
                              <span className="text-xs bg-gray-100 text-gray-700 font-medium px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                                Pending Review
                              </span>
                            )}

                            <button
                              type="button"
                              onClick={() => openEvalModal(sub)}
                              className="btn-primary text-xs px-3.5 py-2 sm:py-1.5 bg-indigo-600 hover:bg-indigo-700 inline-flex items-center justify-center gap-1.5 shadow-sm w-full sm:w-auto"
                            >
                              <Icons.Search className="w-3.5 h-3.5" /> Review & Finalize
                            </button>
                          </div>
                        </div>

                        {/* Files */}
                        {sub.files && sub.files.length > 0 && (
                          <div className="bg-gray-50 p-2.5 rounded-lg border border-border">
                            <p className="text-xs font-semibold text-gray-700 mb-1 inline-flex items-center gap-1">
                              <Icons.FileText className="w-3.5 h-3.5 text-gray-500" /> Submitted Document:
                            </p>
                            <div className="flex flex-wrap gap-2 mt-1">
                              {sub.files.map((f, fidx) => (
                                <a
                                  key={fidx}
                                  href={f.fileUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 font-medium bg-white px-2 py-1 rounded border border-gray-200 break-all max-w-full"
                                >
                                  <Icons.Paperclip className="w-3.5 h-3.5 shrink-0" />
                                  <span className="truncate max-w-[200px] sm:max-w-xs">{f.fileName}</span>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Final Feedback Preview */}
                        {sub.feedback && (
                          <div className="text-xs bg-blue-50/70 p-3 rounded-lg border-l-4 border-blue-500 text-blue-900 break-words">
                            <strong>Professor Feedback:</strong> {sub.feedback}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 text-right shrink-0 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setShowSubmissionsModal(false)}
                className="w-full sm:w-auto px-4 py-2 border border-border rounded-btn text-xs font-medium hover:bg-gray-100 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Evaluation & Finalization Modal */}
      {evalModalSub && selectedAssignment && (
        <div 
          className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-3 sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEvalModalSub(null);
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)] sm:max-h-[92vh] flex flex-col overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="eval-review-modal-title"
          >
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-indigo-950/20 flex items-start sm:items-center justify-between gap-3 bg-indigo-900 text-white shrink-0">
              <div className="min-w-0 flex-1 pr-2">
                <h3 id="eval-review-modal-title" className="text-base sm:text-lg font-bold break-words sm:truncate">
                  AI Assignment Evaluation Review
                </h3>
                <p className="text-xs text-indigo-200 break-words sm:truncate mt-0.5">
                  Student: {evalModalSub.student?.name} • Assignment: {selectedAssignment.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEvalModalSub(null)}
                className="text-indigo-200 hover:text-white p-1 rounded-full hover:bg-indigo-800/50 flex items-center justify-center transition-colors shrink-0"
                aria-label="Close"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="overflow-y-auto flex-1 min-h-0 overscroll-contain p-4 sm:p-6 space-y-5">
              {/* Failure Alert */}
              {evalModalSub.evaluationStatus === 'FAILED' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-800 space-y-1">
                  <p className="font-bold text-sm flex items-center gap-1.5">
                    <Icons.AlertTriangle className="w-4 h-4 text-red-600 shrink-0" /> AI Evaluation Could Not Be Processed
                  </p>
                  <p>{evalModalSub.aiEvaluation?.failureReason || 'Extraction or AI model evaluation encountered an error.'}</p>
                  <p className="text-muted">You can evaluate and enter marks manually below.</p>
                </div>
              )}

              {/* AI Evaluation Overview Card */}
              {evalModalSub.aiEvaluation?.suggestedMarks !== undefined && evalModalSub.aiEvaluation?.suggestedMarks !== null && (
                <div className="bg-gradient-to-br from-indigo-50/80 via-blue-50/50 to-white border border-indigo-200 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-indigo-100 pb-3">
                    <div>
                      <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider block">AI Suggested Score</span>
                      <div className="text-3xl font-extrabold text-indigo-900 mt-0.5">
                        {evalModalSub.aiEvaluation.suggestedMarks} <span className="text-lg text-indigo-600 font-medium">/ {selectedAssignment.maxMarks}</span>
                      </div>
                    </div>
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-indigo-100 pt-2 sm:pt-0">
                      <span className="text-2xl font-bold text-blue-700">{evalModalSub.aiEvaluation.percentage}%</span>
                      <p className="text-[10px] text-muted font-medium">Automated Analysis</p>
                    </div>
                  </div>

                  {/* Rubric Criteria Breakdown */}
                  {evalModalSub.aiEvaluation.criteria && evalModalSub.aiEvaluation.criteria.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">Criteria Score Breakdown</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {evalModalSub.aiEvaluation.criteria.map((c, cidx) => (
                          <div key={cidx} className="bg-white p-3 rounded-lg border border-indigo-100 text-xs shadow-2xs">
                            <div className="flex justify-between items-start gap-2 font-semibold text-gray-800">
                              <span className="break-words">{c.name}</span>
                              <span className="text-indigo-700 shrink-0 ml-2 font-bold">{c.awardedMarks} / {c.maximumMarks}</span>
                            </div>
                            {c.feedback && <p className="text-[11px] text-gray-600 mt-1 break-words">{c.feedback}</p>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Detailed Analysis Blocks */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                    {evalModalSub.aiEvaluation.correctness && (
                      <div className="bg-white p-3 rounded-lg border border-gray-200">
                        <span className="font-bold text-emerald-800 flex items-center gap-1.5">
                          <Icons.Check className="w-3.5 h-3.5 text-emerald-800 shrink-0" /> Correctness
                        </span>
                        <p className="text-gray-700 mt-1 break-words">{evalModalSub.aiEvaluation.correctness}</p>
                      </div>
                    )}
                    {evalModalSub.aiEvaluation.completeness && (
                      <div className="bg-white p-3 rounded-lg border border-gray-200">
                        <span className="font-bold text-blue-800 flex items-center gap-1.5">
                          <Icons.Clipboard className="w-3.5 h-3.5 text-blue-800 shrink-0" /> Completeness
                        </span>
                        <p className="text-gray-700 mt-1 break-words">{evalModalSub.aiEvaluation.completeness}</p>
                      </div>
                    )}
                  </div>

                  {/* Missing Points & Errors */}
                  {((evalModalSub.aiEvaluation.missingPoints && evalModalSub.aiEvaluation.missingPoints.length > 0) ||
                    (evalModalSub.aiEvaluation.errors && evalModalSub.aiEvaluation.errors.length > 0)) && (
                    <div className="space-y-2 pt-1 text-xs">
                      {evalModalSub.aiEvaluation.missingPoints && evalModalSub.aiEvaluation.missingPoints.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                          <span className="font-bold text-amber-900 flex items-center gap-1.5">
                            <Icons.AlertTriangle className="w-3.5 h-3.5 text-amber-900 shrink-0" /> Missing Expected Points:
                          </span>
                          <ul className="list-disc list-inside mt-1 text-amber-800 space-y-0.5 break-words">
                            {evalModalSub.aiEvaluation.missingPoints.map((mp, idx) => <li key={idx}>{mp}</li>)}
                          </ul>
                        </div>
                      )}
                      {evalModalSub.aiEvaluation.errors && evalModalSub.aiEvaluation.errors.length > 0 && (
                        <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                          <span className="font-bold text-red-900 flex items-center gap-1.5">
                            <Icons.XCircle className="w-3.5 h-3.5 text-red-900 shrink-0" /> Mistakes / Errors Identified:
                          </span>
                          <ul className="list-disc list-inside mt-1 text-red-800 space-y-0.5 break-words">
                            {evalModalSub.aiEvaluation.errors.map((err, idx) => <li key={idx}>{err}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Overall Feedback */}
                  {evalModalSub.aiEvaluation.overallFeedback && (
                    <div className="bg-white p-3.5 rounded-lg border border-indigo-200 text-xs">
                      <span className="font-bold text-indigo-900 flex items-center gap-1.5">
                        <Icons.MessageSquare className="w-3.5 h-3.5 text-indigo-900 shrink-0" /> AI Overall Feedback:
                      </span>
                      <p className="text-gray-800 mt-1 italic break-words leading-relaxed">{evalModalSub.aiEvaluation.overallFeedback}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Extracted Text Preview */}
              {evalModalSub.aiEvaluation?.extractedText && (
                <details className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs">
                  <summary className="font-semibold text-gray-700 cursor-pointer inline-flex items-center gap-1.5">
                    <Icons.FileText className="w-3.5 h-3.5 text-gray-700" /> Extracted Submission Text Preview
                  </summary>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-[11px] text-gray-800 bg-white p-3 rounded-lg border max-h-48 overflow-y-auto break-words">
                    {evalModalSub.aiEvaluation.extractedText}
                  </pre>
                </details>
              )}

              {/* Professor Action / Finalization Form */}
              <div className="bg-white border-2 border-indigo-400 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <h4 className="font-bold text-heading text-sm">Professor Finalization Authority</h4>
                  {evalModalSub.aiEvaluation?.suggestedMarks !== undefined && evalModalSub.aiEvaluation?.suggestedMarks !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setFinalizeMarks(evalModalSub.aiEvaluation.suggestedMarks);
                        setFinalizeFeedback(evalModalSub.aiEvaluation.overallFeedback || '');
                        toast.success('Pre-filled with AI suggested marks');
                      }}
                      className="text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-3 py-2 sm:py-1.5 rounded-btn inline-flex items-center justify-center gap-1.5 border border-indigo-200 transition-colors w-full sm:w-auto"
                    >
                      <Icons.Zap className="w-3.5 h-3.5" /> Accept AI Marks ({evalModalSub.aiEvaluation.suggestedMarks})
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-gray-700">Official Final Marks * (Max: {selectedAssignment.maxMarks})</label>
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      max={selectedAssignment.maxMarks}
                      value={finalizeMarks}
                      onChange={e => setFinalizeMarks(e.target.value)}
                      className="form-input w-full text-sm font-bold text-indigo-900 py-2 sm:py-1.5"
                      placeholder={`0 - ${selectedAssignment.maxMarks}`}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold mb-1 text-gray-700">Professor Feedback to Student</label>
                    <textarea
                      rows={2}
                      value={finalizeFeedback}
                      onChange={e => setFinalizeFeedback(e.target.value)}
                      className="form-input w-full text-xs py-2 sm:py-1.5"
                      placeholder="Add custom feedback or retain AI feedback..."
                    />
                  </div>
                </div>

                <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={handleTriggerReeval}
                    disabled={isReevaluating}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline inline-flex items-center justify-center gap-1.5 py-1.5"
                  >
                    <Icons.RefreshCw className={`w-3.5 h-3.5 ${isReevaluating ? 'animate-spin' : ''}`} />
                    <span>{isReevaluating ? 'Re-evaluating...' : 'Re-run AI Evaluation'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleFinalizeSubmission}
                    disabled={isSubmittingFinal}
                    className="btn-primary text-xs px-5 py-2.5 bg-green-600 hover:bg-green-700 font-bold inline-flex items-center justify-center gap-1.5 w-full sm:w-auto shadow-sm"
                  >
                    <Icons.Check className="w-3.5 h-3.5" />
                    <span>{isSubmittingFinal ? 'Finalizing...' : 'Finalize & Publish Grade'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
