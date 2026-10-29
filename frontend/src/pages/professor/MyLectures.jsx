import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { lecturesAPI, coursesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';
import GenerateQuizModal from '../../components/quiz/GenerateQuizModal';
import QuizDisplay from '../../components/quiz/QuizDisplay';

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

export default function ProfessorMyLectures() {
  const { user } = useAuth();
  const [lectures, setLectures] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [selectedLecture, setSelectedLecture] = useState(null);
  const [generatingQuiz, setGeneratingQuiz] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generatedQuiz, setGeneratedQuiz] = useState(null);
  const [showQuizDisplay, setShowQuizDisplay] = useState(false);

  useEffect(() => { fetchCourses(); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchLectures(); }, [page, courseFilter, search, semesterFilter]);

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

  const fetchLectures = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 10,
        type: 'lecture',
        uploadedBy: user.id
      };
      if (courseFilter) params.course = courseFilter;
      if (search) params.search = search;
      if (semesterFilter) params.semester = semesterFilter;
      const res = await lecturesAPI.getAll(params);
      setLectures(res.data.data || []);
      setPagination(res.data.pagination || {});
    } catch (err) {
      toast.error('Failed to load lectures');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this lecture?')) return;
    try {
      await lecturesAPI.delete(id);
      toast.success('Lecture deleted');
      fetchLectures();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  const handleRetryTranscription = async (id) => {
    try {
      await lecturesAPI.retryTranscription(id);
      toast.success('Transcription retry started');
      fetchLectures();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Retry failed');
    }
  };

  const handleGenerateQuizClick = (lectureId) => {
    // Find the lecture and set it
    const lecture = lectures.find(l => l._id === lectureId);
    if (lecture) {
      setSelectedLecture(lecture);
      setShowGenerateModal(true);
    }
  };

  const handleQuizGenerated = (quiz) => {
    setGeneratedQuiz(quiz);
    setShowQuizDisplay(true);
    setShowGenerateModal(false);
    toast.success('Quiz generated successfully!');
  };

  const handleQuizSubmit = async (answers) => {
    try {
      const response = await fetch(
        `/api/quizzes/${generatedQuiz._id}/submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: JSON.stringify({ answers })
        }
      );
      if (!response.ok) throw new Error('Failed to submit quiz');
      const data = await response.json();
      toast.success(`Quiz submitted! Score: ${data.score}`);
      setShowQuizDisplay(false);
      setGeneratedQuiz(null);
      setSelectedLecture(null);
    } catch (err) {
      toast.error(err.message || 'Failed to submit quiz');
    }
  };

  // Get semester description for title
  const getSemesterTitle = () => {
    if (!semesterFilter) return 'My Lectures';
    const semesterNames = {
      '1': 'Semester 1 - First Year Lectures',
      '2': 'Semester 2 - First Year Lectures',
      '3': 'Semester 3 - Second Year Lectures',
      '4': 'Semester 4 - Second Year Lectures',
      '5': 'Semester 5 - Third Year Lectures',
      '6': 'Semester 6 - Third Year Lectures',
      '7': 'Semester 7 - Fourth Year Lectures',
      '8': 'Semester 8 - Fourth Year Lectures'
    };
    return semesterNames[semesterFilter.toString()] || 'My Lectures';
  };

  const getSemesterDescription = () => {
    if (!semesterFilter) return 'Manage your uploaded lectures and generate quizzes';
    const descriptions = {
      '1': 'Manage Semester 1 lectures - Foundation subjects',
      '2': 'Manage Semester 2 lectures - Build on fundamental concepts',
      '3': 'Manage Semester 3 lectures - Intermediate subjects',
      '4': 'Manage Semester 4 lectures - Advanced intermediate concepts',
      '5': 'Manage Semester 5 lectures - Advanced subjects',
      '6': 'Manage Semester 6 lectures - Specialized advanced topics',
      '7': 'Manage Semester 7 lectures - Professional specialized content',
      '8': 'Manage Semester 8 lectures - Final specialized and capstone content'
    };
    return descriptions[semesterFilter.toString()] || 'Manage your uploaded lectures and generate quizzes';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">{getSemesterTitle()}</h1>
          {semesterFilter && (
            <div className="mt-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                <Icons.Book className="w-3.5 h-3.5" /> Semester {semesterFilter} Selected
              </span>
            </div>
          )}
        </div>
        <Link to="/professor/upload" className="btn-primary text-center w-full sm:w-auto py-2.5 sm:py-2">Upload New</Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          placeholder="Search lectures..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="form-input flex-1 w-full"
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
      ) : lectures.length === 0 ? (
        <div className="text-center py-12 px-4 bg-surface rounded-card border border-border">
          <p className="text-muted text-lg">No lectures found</p>
          <Link to="/professor/upload" className="text-blue-600 hover:underline mt-2 inline-block">Upload your first lecture</Link>
        </div>
      ) : (
        <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
          {/* Desktop Table View (>= md) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">Title</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-muted">Sem</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">Course</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">Transcription</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-muted">Date</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lectures.map(l => (
                  <tr key={l._id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-heading">{l.title}</p>
                      <p className="text-xs text-muted truncate max-w-xs">{l.description || 'No description'}</p>
                    </td>
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
                        to={`/professor/lectures/${l._id}`}
                        className="text-blue-600 hover:text-blue-800 text-sm"
                      >
                        View
                      </Link>
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

          {/* Mobile Card View (< md) */}
          <div className="md:hidden divide-y divide-border">
            {lectures.map(l => (
              <div key={l._id} className="p-4 space-y-3 bg-surface hover:bg-gray-50/50 transition-colors">
                <div>
                  <h3 className="font-bold text-heading text-base leading-snug break-words">{l.title}</h3>
                  <p className="text-xs text-muted mt-1 break-words line-clamp-2 leading-relaxed">
                    {l.description || 'No description'}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-gray-100">
                  <div>
                    <span className="text-muted block font-medium">Semester</span>
                    <span className="text-heading font-semibold">{l.semester || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted block font-medium">Course</span>
                    <span className="text-heading font-medium break-words">{l.course?.name || '—'}</span>
                  </div>
                  <div className="pt-1">
                    <span className="text-muted block font-medium">Transcription</span>
                    <div className="flex items-center gap-1.5 mt-0.5">
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
                  <div className="pt-1">
                    <span className="text-muted block font-medium">Date</span>
                    <span className="text-heading font-medium">{new Date(l.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
                  <Link
                    to={`/professor/lectures/${l._id}`}
                    className="flex-1 py-2 px-3 text-center text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-btn transition-colors shadow-sm"
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleDelete(l._id)}
                    className="flex-1 py-2 px-3 text-center text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-btn transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>

          {pagination.pages > 1 && (
            <div className="flex flex-wrap items-center justify-center gap-2 p-4 border-t border-border">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-primary px-3 py-1.5 text-xs sm:text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-xs sm:text-sm text-muted">Page {page} of {pagination.pages}</span>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="btn-primary px-3 py-1.5 text-xs sm:text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* Details Modal */}
      {selectedLecture && !showQuizDisplay && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-card shadow-card border border-border max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-surface border-b border-border p-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-heading">{selectedLecture.title}</h2>
              <button
                onClick={() => setSelectedLecture(null)}
                className="p-1 text-muted hover:text-heading flex items-center justify-center"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted">Semester</p>
                  <p className="text-sm text-heading font-medium">{selectedLecture.semester}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted">Course</p>
                  <p className="text-sm text-heading">{selectedLecture.course?.name}</p>
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-muted">Description</p>
                <p className="text-sm text-heading mt-1">{selectedLecture.description || 'No description'}</p>
              </div>

              <div>
                <p className="text-sm font-medium text-muted mb-2">Transcription</p>
                <div className="p-3 bg-gray-50 rounded border border-gray-200 max-h-48 overflow-y-auto">
                  <p className="text-sm text-gray-700">
                    {selectedLecture.transcription?.text || 'No transcription available yet'}
                  </p>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-border p-4 flex justify-end gap-2">
              {selectedLecture.transcription?.status === 'completed' && (
                <button
                  onClick={() => setShowGenerateModal(true)}
                  className="btn-primary flex items-center gap-1.5"
                >
                  <Icons.Bot className="w-4 h-4" /> Generate Quiz with AI
                </button>
              )}
              {selectedLecture.transcription?.status !== 'completed' && (
                <p className="text-xs text-amber-600 flex items-center gap-1.5">
                  <Icons.Loader className="w-3.5 h-3.5" /> Transcription in progress or not available
                </p>
              )}
              <button
                onClick={() => setSelectedLecture(null)}
                className="px-4 py-2 border border-border rounded-btn hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Generation Modal */}
      {selectedLecture && (
        <GenerateQuizModal
          isOpen={showGenerateModal}
          lecture={selectedLecture}
          onClose={() => setShowGenerateModal(false)}
          onQuizGenerated={handleQuizGenerated}
        />
      )}

      {/* Quiz Preview Modal — full-screen scrollable overlay */}
      {generatedQuiz && showQuizDisplay && (
        <div
          className="fixed inset-0 z-50 bg-black/60"
          style={{ overflowY: 'auto' }}
        >
          <div className="min-h-full flex items-start justify-center py-8 px-4">
            <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-3xl w-full">
              {/* Sticky header */}
              <div className="sticky top-0 z-10 bg-white border-b border-gray-200 rounded-t-2xl px-6 py-4 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    <Icons.FileEdit className="w-5 h-5 text-primary" />
                    <span>Quiz Preview</span>
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">{generatedQuiz.title}</p>
                </div>
                <button
                  onClick={() => {
                    setShowQuizDisplay(false);
                    setGeneratedQuiz(null);
                    setSelectedLecture(null);
                  }}
                  className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 transition-colors"
                >
                  <Icons.X className="w-4 h-4" />
                </button>
              </div>

              {/* Quiz body — all questions visible */}
              <div className="p-6">
                <QuizDisplay
                  quiz={generatedQuiz}
                  onSubmit={handleQuizSubmit}
                  showAnswers={false}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
