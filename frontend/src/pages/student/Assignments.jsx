import { useState, useEffect } from 'react';
import { assignmentsAPI, coursesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';
import { FiChevronUp, FiChevronDown, FiX, FiDownload, FiUpload } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function StudentAssignments() {
  const { user, refreshUser } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [submissionFile, setSubmissionFile] = useState(null);
  const [viewingEvalAssignment, setViewingEvalAssignment] = useState(null);

  useEffect(() => { fetchData(); }, [user?.id]);

  const fetchData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      await refreshUser();
      
      let enrolledCourses = [];
      try {
        const cRes = await coursesAPI.getAll({ limit: 50 });
        enrolledCourses = cRes.data?.data || [];
      } catch (e) {
        enrolledCourses = [];
      }

      const enrolledCourseIds = enrolledCourses.map(c => typeof c === 'string' ? c : c._id);
      setCourses(enrolledCourses);
      
      const courseParams = enrolledCourseIds.length > 0 ? enrolledCourseIds.join(',') : undefined;
      const aRes = await assignmentsAPI.getAll({ limit: 50, ...(courseParams ? { course: courseParams } : {}) });
      setAssignments(aRes.data.data || []);
    } catch (err) { 
      if (!silent) toast.error('Failed to load assignments'); 
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    const hasProcessing = assignments.some(a => 
      a.mySubmission && (a.mySubmission.evaluationStatus === 'PROCESSING' || a.mySubmission.evaluationStatus === 'PENDING')
    );

    if (!hasProcessing) return;

    const interval = setInterval(() => {
      fetchData(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [assignments, user?.id]);

  const handleSubmit = async (assignmentId) => {
    if (!submissionFile) {
      toast.error('Please select a file to upload (.txt, .pdf, or .docx)');
      return;
    }
    try {
      toast.loading('Submitting assignment and initializing AI processing...', { id: 'sub' });
      const formData = new FormData();
      formData.append('files', submissionFile);
      await assignmentsAPI.submit(assignmentId, formData);
      toast.success('Assignment submitted successfully! AI evaluation queued.', { id: 'sub' });
      setSelectedAssignment(null);
      setSubmissionFile(null);
      fetchData();
    } catch (err) { 
      toast.error(err.response?.data?.message || 'Submission failed', { id: 'sub' }); 
    }
  };

  const getStatus = (a) => {
    const sub = a.mySubmission;
    if (sub) return sub.status === 'graded' || sub.evaluationStatus === 'FINALIZED' ? 'graded' : 'submitted';
    if (new Date(a.dueDate) < new Date()) return 'overdue';
    return 'pending';
  };

  const statusConfig = {
    pending: {
      label: 'Pending',
      badge: 'bg-amber-50 text-amber-700 border border-amber-200',
      dot: 'bg-amber-500'
    },
    submitted: {
      label: 'Submitted',
      badge: 'bg-blue-50 text-blue-700 border border-blue-200',
      dot: 'bg-blue-500'
    },
    graded: {
      label: 'Graded',
      badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      dot: 'bg-emerald-500'
    },
    overdue: {
      label: 'Overdue',
      badge: 'bg-rose-50 text-rose-700 border border-rose-200',
      dot: 'bg-rose-500'
    }
  };

  const counts = {
    all: assignments.length,
    pending: assignments.filter(a => getStatus(a) === 'pending').length,
    submitted: assignments.filter(a => getStatus(a) === 'submitted').length,
    graded: assignments.filter(a => getStatus(a) === 'graded').length,
    overdue: assignments.filter(a => getStatus(a) === 'overdue').length,
  };

  const filtered = filter === 'all' ? assignments : assignments.filter(a => getStatus(a) === filter);

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
        <span className="text-xs sm:text-sm text-muted">Loading assignments...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-heading">Assignments</h1>
        <p className="text-xs sm:text-sm text-muted mt-1">
          Course deliverables, problem sets, and submission evaluations.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'All' },
          { id: 'pending', label: 'Pending' },
          { id: 'submitted', label: 'Submitted' },
          { id: 'graded', label: 'Graded' },
          { id: 'overdue', label: 'Overdue' }
        ].map(f => {
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 sm:px-4 rounded-btn text-xs sm:text-sm font-semibold transition-all min-h-[40px] ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-600/20'
                  : 'bg-surface border border-border text-slate-700 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <span>{f.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
                isActive ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-600'
              }`}>
                {counts[f.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Submission Upload Panel / Modal */}
      {selectedAssignment && (
        <div className="bg-surface rounded-card shadow-lg border-2 border-blue-500 p-4 sm:p-6 space-y-4 animate-in fade-in duration-200">
          <div className="flex items-start justify-between gap-3 pb-3 border-b border-border/80">
            <div className="min-w-0 flex-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full inline-block mb-1">
                Submit Deliverable
              </span>
              <h2 className="text-base sm:text-lg font-bold text-heading break-words leading-snug">
                {selectedAssignment.title}
              </h2>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted">
                {selectedAssignment.course?.name && (
                  <span>Course: <strong className="text-slate-700">{selectedAssignment.course.name}</strong></span>
                )}
                <span>Max Marks: <strong className="text-slate-700">{selectedAssignment.maxMarks || selectedAssignment.totalMarks}</strong></span>
                {selectedAssignment.dueDate && (
                  <span>Due: <strong className="text-slate-700">{new Date(selectedAssignment.dueDate).toLocaleDateString()}</strong></span>
                )}
              </div>
            </div>
            <button
              onClick={() => { setSelectedAssignment(null); setSubmissionFile(null); }}
              className="text-slate-400 hover:text-heading p-1.5 rounded-lg hover:bg-slate-100 shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center transition-colors"
              aria-label="Close submit form"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-2">
            <label className="block text-xs sm:text-sm font-semibold text-heading">
              Attach Submission File <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".txt,.pdf,.docx,.doc"
                onChange={e => setSubmissionFile(e.target.files[0])}
                className="form-input w-full text-xs sm:text-sm py-2 px-3 border border-border rounded-xl file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
              />
            </div>
            
            {submissionFile && (
              <p className="text-xs text-emerald-700 font-medium flex items-center gap-1.5 pt-0.5">
                <Icons.Check className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Selected: <strong>{submissionFile.name}</strong> ({(submissionFile.size / 1024).toFixed(1)} KB)</span>
              </p>
            )}

            <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3 text-xs text-blue-900 leading-relaxed flex items-start gap-2 mt-2">
              <Icons.Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-blue-950">Submission & AI Evaluation Guidelines</p>
                <p className="text-[11px] sm:text-xs text-blue-800 mt-0.5">
                  AI Evaluation supports <strong>.txt</strong>, <strong>.pdf</strong> (including scanned/handwritten submissions up to 40 pages), and <strong>.docx</strong> files.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <button
              onClick={() => handleSubmit(selectedAssignment._id)}
              className="btn-primary w-full sm:w-auto px-6 py-2.5 rounded-btn text-xs sm:text-sm font-semibold min-h-[44px] inline-flex items-center justify-center gap-2"
            >
              <FiUpload className="w-4 h-4" />
              <span>Submit Assignment</span>
            </button>
            <button
              onClick={() => { setSelectedAssignment(null); setSubmissionFile(null); }}
              className="w-full sm:w-auto px-5 py-2.5 border border-border rounded-btn text-xs sm:text-sm font-medium hover:bg-slate-50 transition-colors min-h-[44px] text-heading"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Assignment List */}
      <div className="space-y-4">
        {filtered.length === 0 ? (
          <div className="bg-surface rounded-card shadow-card border border-border p-8 sm:p-12 text-center max-w-md mx-auto">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mb-3">
              <Icons.Clipboard className="w-6 h-6" />
            </div>
            <h3 className="font-semibold text-heading text-sm sm:text-base mb-1">No assignments found</h3>
            <p className="text-xs sm:text-sm text-muted">
              {filter !== 'all' ? `No assignments in "${filter}" status.` : 'You have no assignments listed currently.'}
            </p>
          </div>
        ) : (
          filtered.map(a => {
            const status = getStatus(a);
            const sub = a.mySubmission;
            const max = a.maxMarks || a.totalMarks;
            const finalizedMarks = sub?.marks !== null && sub?.marks !== undefined ? sub.marks : null;
            const conf = statusConfig[status] || statusConfig.pending;

            return (
              <div key={a._id} className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5 space-y-3.5 transition-shadow hover:shadow-md">
                {/* Card Header: Title + Status Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold rounded-full ${conf.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${conf.dot}`} />
                        {conf.label}
                      </span>
                      {a.academicTerm && a.academicTerm !== 'CURRENT' && (
                        <span className="text-[11px] font-medium text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-full">
                          {a.academicTerm}
                        </span>
                      )}
                    </div>

                    <h3 className="font-bold text-heading text-base sm:text-lg leading-snug break-words">
                      {a.title}
                    </h3>
                  </div>
                </div>

                {/* Description */}
                {a.description && (
                  <p className="text-xs sm:text-sm text-muted leading-relaxed line-clamp-3 break-words">
                    {a.description}
                  </p>
                )}

                {/* Question Paper PDF Download Section (if present) */}
                {a.questionPdf?.fileUrl && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                        <Icons.FileText className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-heading truncate">
                          {a.questionPdf.fileName || 'Question Paper PDF'}
                        </p>
                        <p className="text-[11px] text-muted">Problem set & reference questions</p>
                      </div>
                    </div>
                    <a
                      href={a.questionPdf.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:border-blue-500 hover:text-blue-700 text-blue-600 text-xs font-semibold shadow-2xs transition-all min-h-[36px]"
                    >
                      <FiDownload className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
                    </a>
                  </div>
                )}

                {/* Metadata Bar */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-xs text-muted border-t border-border/70">
                  {a.course?.name && (
                    <span className="inline-flex items-center gap-1 text-slate-700">
                      <Icons.Book className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Course: <strong className="font-semibold text-heading">{a.course.name}</strong></span>
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 text-slate-600">
                    <Icons.Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>Due: <strong className="font-semibold text-slate-700">{a.dueDate ? new Date(a.dueDate).toLocaleDateString() : 'N/A'}</strong></span>
                  </span>
                  {max && (
                    <span className="inline-flex items-center gap-1 text-slate-600">
                      <Icons.Award className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Max Marks: <strong className="font-semibold text-slate-700">{max}</strong></span>
                    </span>
                  )}
                </div>

                {/* Action: Submit Assignment (when pending or not submitted yet) */}
                {status === 'pending' && (
                  <div className="pt-1">
                    <button
                      onClick={() => setSelectedAssignment(a)}
                      className="btn-primary w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-btn text-xs sm:text-sm font-semibold min-h-[44px] shadow-sm"
                    >
                      <FiUpload className="w-4 h-4" />
                      <span>Submit Assignment</span>
                    </button>
                  </div>
                )}

                {/* Submission & Grade Summary Box */}
                {sub && (
                  <div className="bg-slate-50/90 border border-slate-200/90 rounded-xl p-3.5 sm:p-4 text-xs space-y-3 mt-2">
                    {/* Submission timestamp & status header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-200/70">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800">Submission Details</span>
                        <span className="text-slate-400">•</span>
                        <span className="text-slate-600">
                          Submitted {new Date(sub.submittedAt).toLocaleString(undefined, {
                            dateStyle: 'short',
                            timeStyle: 'short'
                          })}
                        </span>
                        {sub.isLate && (
                          <span className="text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full font-bold inline-flex items-center gap-1 text-[11px]">
                            <Icons.AlertTriangle className="w-3 h-3" /> Late Submission
                          </span>
                        )}
                      </div>

                      {/* Grade or AI Status badge */}
                      <div className="flex items-center gap-2">
                        {finalizedMarks !== null ? (
                          <div className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-900 border border-emerald-300 px-3 py-1 rounded-full font-bold">
                            <span>Official Grade:</span>
                            <span className="text-emerald-950 font-extrabold">{finalizedMarks} / {max}</span>
                            <span>({((finalizedMarks / max) * 100).toFixed(1)}%)</span>
                          </div>
                        ) : sub.evaluationStatus === 'COMPLETED' ? (
                          <div className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-900 border border-blue-300 px-3 py-1 rounded-full font-bold">
                            <Icons.Bot className="w-3.5 h-3.5 text-blue-700" />
                            <span>AI Evaluated ({sub.aiEvaluation?.suggestedMarks} / {max})</span>
                          </div>
                        ) : sub.evaluationStatus === 'FAILED' ? (
                          <div className="inline-flex items-center gap-1.5 bg-rose-100 text-rose-900 border border-rose-300 px-3 py-1 rounded-full font-bold">
                            <Icons.AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
                            <span>Evaluation Failed</span>
                          </div>
                        ) : (
                          <span className="text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full font-semibold inline-flex items-center gap-1.5">
                            <Icons.Loader className="w-3.5 h-3.5 animate-spin" />
                            <span>AI Evaluation Processing...</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Professor Feedback */}
                    {sub.feedback && (
                      <div className="bg-white border-l-4 border-blue-500 border border-slate-200/90 rounded-r-xl p-3 sm:p-3.5 space-y-1">
                        <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
                          <Icons.User className="w-3.5 h-3.5 text-blue-600" />
                          <span>Professor Feedback</span>
                        </div>
                        <p className="text-slate-700 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words">
                          {sub.feedback}
                        </p>
                      </div>
                    )}

                    {/* Detailed Evaluation Toggle */}
                    {sub.aiEvaluation?.criteria && sub.aiEvaluation.criteria.length > 0 && finalizedMarks !== null && (
                      <div>
                        <button
                          onClick={() => setViewingEvalAssignment(viewingEvalAssignment === a._id ? null : a._id)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1.5 pt-0.5 hover:underline"
                        >
                          {viewingEvalAssignment === a._id ? (
                            <>
                              <span>Hide Criteria Breakdown</span>
                              <FiChevronUp className="w-3.5 h-3.5" />
                            </>
                          ) : (
                            <>
                              <span>View Criteria Breakdown</span>
                              <FiChevronDown className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>

                        {/* Criteria Breakdown Grid */}
                        {viewingEvalAssignment === a._id && (
                          <div className="mt-3 pt-3 border-t border-slate-200 space-y-2">
                            <p className="font-bold text-slate-800 text-xs">Evaluated Criteria Breakdown:</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {sub.aiEvaluation.criteria.map((c, cidx) => (
                                <div key={cidx} className="bg-white p-2.5 rounded-xl border border-slate-200 space-y-1">
                                  <div className="flex justify-between items-center font-semibold text-xs gap-2">
                                    <span className="text-slate-800 truncate">{c.name}</span>
                                    <span className="text-blue-700 shrink-0 font-bold">{c.awardedMarks} / {c.maximumMarks}</span>
                                  </div>
                                  {c.feedback && (
                                    <p className="text-slate-600 text-[11px] leading-relaxed break-words">{c.feedback}</p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

