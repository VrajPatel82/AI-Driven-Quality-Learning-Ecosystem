import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { lecturesAPI, coursesAPI, quizzesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

const TranscriptionBadge = ({ status }) => {
  const config = {
    none: { label: '—', cls: 'text-gray-400' },
    processing: { icon: Icons.Loader, label: 'Transcribing...', cls: 'text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1' },
    completed: { icon: Icons.Check, label: 'Transcribed', cls: 'text-green-600 bg-green-50 px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1' },
    failed: { icon: Icons.X, label: 'Failed', cls: 'text-red-600 bg-red-50 px-2 py-0.5 rounded-full text-xs inline-flex items-center gap-1' }
  };
  const c = config[status] || config.none;
  const IconComp = c.icon;
  return (
    <span className={c.cls}>
      {IconComp && <IconComp className="w-3 h-3" />}
      <span>{c.label}</span>
    </span>
  );
};

export default function ProfessorMyLabs() {
  const { user } = useAuth();
  const [labs, setLabs] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [selectedLab, setSelectedLab] = useState(null);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [generatingIq, setGeneratingIq] = useState(false);

  useEffect(() => { fetchCourses(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchLabs(); }, [page, courseFilter, search, semesterFilter]);

  const fetchCourses = async () => {
    try {
      // Use user.courses directly - it's already populated from auth
      if (user?.courses?.length) {
        setCourses(user.courses);
      } else {
        setCourses([]);
      }
    } catch (err) { /* ignore */ }
  };

  const fetchLabs = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        type: 'lab',
        uploadedBy: user.id
      };
      if (courseFilter) params.course = courseFilter;
      if (search) params.search = search;
      if (semesterFilter) params.semester = semesterFilter;
      const res = await lecturesAPI.getAll(params);
      setLabs(res.data.data || []);
      setPagination(res.data.pagination || {});
    } catch (err) {
      toast.error('Failed to load labs');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this lab?')) return;
    try {
      await lecturesAPI.delete(id);
      toast.success('Lab deleted');
      fetchLabs();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleRetryTranscription = async (id) => {
    try {
      await lecturesAPI.retryTranscription(id);
      toast.success('Transcription retry started');
      fetchLabs();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Retry failed');
    }
  };

  const handleGenerateQuiz = async (labId) => {
    if (!window.confirm('Generate quiz from this lab?')) return;
    setGeneratingQuiz(true);
    try {
      const res = await lecturesAPI.generateQuiz(labId);
      toast.success(`Quiz generated with ${res.data.questionCount} questions!`);
      setSelectedLab(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate quiz');
    } finally {
      setGeneratingQuiz(false);
    }
  };

  const handleGenerateIq = async (labId) => {
    if (!window.confirm('Generate important questions from this lab?')) return;
    setGeneratingIq(true);
    try {
      await lecturesAPI.generateImportantQuestions(labId);
      toast.success('Important questions generated!');
      setSelectedLab(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to generate questions');
    } finally {
      setGeneratingIq(false);
    }
  };

  // Get semester description for title
  const getSemesterTitle = () => {
    if (!semesterFilter) return 'My Labs';
    const semesterNames = {
      '1': 'Semester 1 - First Year Labs',
      '2': 'Semester 2 - First Year Labs',
      '3': 'Semester 3 - Second Year Labs',
      '4': 'Semester 4 - Second Year Labs',
      '5': 'Semester 5 - Third Year Labs',
      '6': 'Semester 6 - Third Year Labs',
      '7': 'Semester 7 - Fourth Year Labs',
      '8': 'Semester 8 - Fourth Year Labs'
    };
    return semesterNames[semesterFilter.toString()] || 'My Labs';
  };

  const getSemesterDescription = () => {
    if (!semesterFilter) return 'Manage your lab sessions and generate quizzes';
    const descriptions = {
      '1': 'Manage Semester 1 lab experiments - Foundation practical skills',
      '2': 'Manage Semester 2 lab experiments - Build on fundamental practical knowledge',
      '3': 'Manage Semester 3 lab experiments - Intermediate practical applications',
      '4': 'Manage Semester 4 lab experiments - Advanced intermediate practicals',
      '5': 'Manage Semester 5 lab experiments - Advanced practical subjects',
      '6': 'Manage Semester 6 lab experiments - Specialized advanced practicals',
      '7': 'Manage Semester 7 lab experiments - Professional specialized practicals',
      '8': 'Manage Semester 8 lab experiments - Final specialized capstone practicals'
    };
    return descriptions[semesterFilter.toString()] || 'Manage your lab sessions and generate quizzes';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">{getSemesterTitle()}</h1>
          {semesterFilter && (
            <div className="mt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">
                <Icons.Flask className="w-3.5 h-3.5" /> Semester {semesterFilter} Selected
              </span>
            </div>
          )}
        </div>
        <Link to="/professor/upload" className="btn-primary text-center w-full sm:w-auto py-2.5 sm:py-2">
          Upload Lab
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search labs..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="form-input w-full sm:flex-1"
        />
        <select
          value={courseFilter}
          onChange={e => { setCourseFilter(e.target.value); setPage(1); }}
          className="form-input w-full sm:w-48"
        >
          <option value="">All Courses</option>
          {courses.map(c => <option key={c._id} value={c._id}>{c.name}</option>)}
        </select>
        <select
          value={semesterFilter}
          onChange={e => { setSemesterFilter(e.target.value); setPage(1); }}
          className="form-input w-full sm:w-40"
        >
          <option value="">All Semesters</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
            <option key={s} value={s}>Semester {s}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center h-40"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>
      ) : labs.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-card border border-border">
          <p className="text-muted text-lg">No labs found</p>
          <Link to="/professor/upload" className="text-blue-600 hover:underline mt-2 inline-block">Upload your first lab</Link>
        </div>
      ) : (
        <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">Experiment</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">Subject</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-muted">Sem</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">Course</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">Transcription</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">Date</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {labs.map(l => (
                  <tr key={l._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-heading">{l.experimentTitle || l.title}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">{l.subject || '—'}</td>
                    <td className="px-4 py-3 text-center text-sm text-muted">{l.semester}</td>
                    <td className="px-4 py-3 text-sm text-muted">{l.course?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <TranscriptionBadge status={l.transcription?.status || 'none'} />
                      {l.transcription?.status === 'failed' && (
                        <button
                          onClick={() => handleRetryTranscription(l._id)}
                          className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          Retry
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted">{new Date(l.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <Link
                        to={`/professor/labs/${l._id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        View
                      </Link>
                      {l.transcription?.status === 'completed' && (
                        <>
                          <button
                            onClick={() => handleGenerateQuiz(l._id)}
                            className="text-green-600 hover:text-green-800 text-sm"
                          >
                            Quiz
                          </button>
                          <button
                            onClick={() => handleGenerateIq(l._id)}
                            className="text-purple-600 hover:text-purple-800 text-sm"
                          >
                            Q&A
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleDelete(l._id)}
                        className="text-red-600 hover:text-red-800 text-sm"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden divide-y divide-border">
            {labs.map(l => (
              <div key={l._id} className="p-4 space-y-3 bg-surface hover:bg-gray-50/50 transition-colors">
                <div>
                  <h3 className="font-bold text-heading text-base break-words">
                    {l.experimentTitle || l.title}
                  </h3>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-xs font-medium text-muted uppercase tracking-wider block">Subject</span>
                    <span className="text-heading font-medium break-words">{l.subject || '—'}</span>
                  </div>
                  <div>
                    <span className="text-xs font-medium text-muted uppercase tracking-wider block">Semester</span>
                    <span className="text-heading font-medium">{l.semester ? `Semester ${l.semester}` : '—'}</span>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-medium text-muted uppercase tracking-wider block">Course</span>
                  <span className="text-sm text-heading break-words">{l.course?.name || '—'}</span>
                </div>

                <div className="flex items-center justify-between gap-2 text-sm pt-1">
                  <div>
                    <span className="text-xs font-medium text-muted uppercase tracking-wider block">Transcription</span>
                    <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <TranscriptionBadge status={l.transcription?.status || 'none'} />
                      {l.transcription?.status === 'failed' && (
                        <button
                          onClick={() => handleRetryTranscription(l._id)}
                          className="text-xs text-blue-600 hover:text-blue-800 underline"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-medium text-muted uppercase tracking-wider block">Date</span>
                    <span className="text-xs text-muted font-medium">{new Date(l.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Mobile Actions */}
                <div className="pt-2 flex flex-col gap-2">
                  <Link
                    to={`/professor/labs/${l._id}`}
                    className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-btn text-xs font-semibold text-center transition-colors shadow-sm"
                  >
                    View
                  </Link>
                  <div className="flex items-center gap-2">
                    {l.transcription?.status === 'completed' && (
                      <>
                        <button
                          onClick={() => handleGenerateQuiz(l._id)}
                          className="flex-1 py-1.5 px-2 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-btn text-xs font-medium text-center transition-colors"
                        >
                          Quiz
                        </button>
                        <button
                          onClick={() => handleGenerateIq(l._id)}
                          className="flex-1 py-1.5 px-2 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded-btn text-xs font-medium text-center transition-colors"
                        >
                          Q&A
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDelete(l._id)}
                      className="flex-1 py-1.5 px-2 bg-red-50 text-red-600 hover:bg-red-100 border border-red-200 rounded-btn text-xs font-medium text-center transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {pagination.pages > 1 && (
            <div className="flex justify-center gap-2 p-4 border-t border-border">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-primary px-3 py-1 text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-sm text-muted">Page {page} of {pagination.pages}</span>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="btn-primary px-3 py-1 text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Details Modal */}
      {selectedLab && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-surface rounded-card shadow-card border border-border max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface border-b border-border p-4 flex items-center justify-between">
              <h2 className="text-lg sm:text-xl font-bold text-heading truncate">{selectedLab.experimentTitle || selectedLab.title}</h2>
              <button
                onClick={() => setSelectedLab(null)}
                className="p-1 text-muted hover:text-heading flex items-center justify-center"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted">Subject</p>
                  <p className="text-sm text-heading font-medium">{selectedLab.subject || '—'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted">Semester</p>
                  <p className="text-sm text-heading font-medium">{selectedLab.semester}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted">Course</p>
                  <p className="text-sm text-heading">{selectedLab.course?.name || '—'}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted">Date</p>
                  <p className="text-sm text-heading">{new Date(selectedLab.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-muted">Description</p>
                <p className="text-sm text-heading mt-1">{selectedLab.description || 'No description'}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-muted mb-2">Transcription</p>
                <div className="p-3 bg-gray-50 rounded border border-gray-200 max-h-48 overflow-y-auto">
                  <p className="text-sm text-gray-700">
                    {selectedLab.transcription?.text || 'No transcription available yet'}
                  </p>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-border p-4 flex flex-col-reverse sm:flex-row justify-end gap-2">
              <button
                onClick={() => setSelectedLab(null)}
                className="w-full sm:w-auto px-4 py-2 border border-border rounded-btn hover:bg-gray-100 text-sm font-medium"
              >
                Close
              </button>
              {selectedLab.transcription?.status === 'completed' && (
                <div className="flex gap-2 w-full sm:w-auto">
                  <button
                    onClick={() => handleGenerateIq(selectedLab._id)}
                    disabled={generatingIq}
                    className="flex-1 sm:flex-initial btn-primary bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-xs sm:text-sm py-2 px-3"
                  >
                    {generatingIq ? 'Generating...' : 'Generate Q&A'}
                  </button>
                  <button
                    onClick={() => handleGenerateQuiz(selectedLab._id)}
                    disabled={generatingQuiz}
                    className="flex-1 sm:flex-initial btn-primary disabled:opacity-50 text-xs sm:text-sm py-2 px-3"
                  >
                    {generatingQuiz ? 'Generating...' : 'Generate Quiz'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
