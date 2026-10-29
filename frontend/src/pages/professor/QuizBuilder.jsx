import { useState, useEffect } from 'react';
import { quizzesAPI, coursesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function ProfessorQuizBuilder() {
  const { user } = useAuth();
  const [courses, setCourses] = useState([]);
  const [assignedCourses, setAssignedCourses] = useState([]);
  const [form, setForm] = useState({ title: '', description: '', semester: '1', course: '', duration: 30, isActive: true });
  const [questions, setQuestions] = useState([{ question: '', options: ['', '', '', ''], correctAnswer: 0, type: 'mcq', points: 1 }]);
  const [saving, setSaving] = useState(false);
  const [existingQuizzes, setExistingQuizzes] = useState([]);
  const [showList, setShowList] = useState(true);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [showResults, setShowResults] = useState(false);
  const [results, setResults] = useState([]);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    fetchCourses();
    fetchQuizzes();
  }, [user?.id]);

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
        setAssignedCourses(myCourses);
      } else if (user?.courses?.length) {
        setAssignedCourses(user.courses);
      } else {
        setAssignedCourses([]);
      }
    } catch (err) {
      if (user?.courses?.length) {
        setAssignedCourses(user.courses);
      } else {
        setAssignedCourses([]);
      }
    }
  };

  const fetchQuizzes = async () => {
    try {
      const res = await quizzesAPI.getAll({ limit: 50, createdBy: user.id });
      const allQuizzes = res.data.data || [];
      // Filter to only quizzes from assigned courses
      if (user?.courses?.length) {
        const courseIds = user.courses.map(c => c._id?.toString() || c.toString());
        const filtered = allQuizzes.filter(q => {
          const quizCourseId = q.course?._id?.toString() || q.course?.toString();
          return courseIds.includes(quizCourseId);
        });
        setExistingQuizzes(filtered);
      } else {
        setExistingQuizzes([]);
      }
    } catch (err) { /* ignore */ }
  };

  const fetchResults = async (quizId) => {
    setLoadingResults(true);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/results`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      setResults(data.results || []);
      setSelectedQuiz(data.quiz);
      setShowResults(true);
      setShowList(false);
    } catch (err) {
      toast.error('Failed to fetch results');
    } finally {
      setLoadingResults(false);
    }
  };

  const downloadResults = () => {
    if (!results || results.length === 0) {
      toast.error('No results to download');
      return;
    }

    // Create CSV data
    const headers = ['Student Name', 'Enrollment Number', 'Score', 'Submitted Date'];
    const rows = results.map(r => [
      r.student?.name || 'N/A',
      r.student?.enrollmentNumber || 'N/A',
      `${r.totalScore}/${r.maxScore}`,
      new Date(r.submittedAt).toLocaleDateString()
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    // Download CSV
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${selectedQuiz?.title || 'quiz'}-results.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Results downloaded successfully');
  };

  const deleteStudentResponse = async (resultId) => {
    if (!window.confirm('Delete this student response? This action cannot be undone.')) return;
    
    try {
      await fetch(`/api/quiz-results/${resultId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success('Response deleted successfully');
      setResults(results.filter(r => r._id !== resultId));
    } catch (err) {
      toast.error('Failed to delete response');
    }
  };

  const toggleQuizStatus = async (quizId, currentStatus) => {
    try {
      await quizzesAPI.update(quizId, { isActive: !currentStatus });
      toast.success(`Quiz ${!currentStatus ? 'activated' : 'deactivated'} successfully`);
      fetchQuizzes();
    } catch (err) {
      toast.error('Failed to update quiz status');
    }
  };

  const addQuestion = () => {
    setQuestions(q => [...q, { question: '', options: ['', '', '', ''], correctAnswer: 0, type: 'mcq', points: 1 }]);
  };

  const removeQuestion = (idx) => {
    if (questions.length <= 1) return;
    setQuestions(q => q.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx, field, value) => {
    setQuestions(q => q.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const updateOption = (qIdx, oIdx, value) => {
    setQuestions(q => q.map((item, i) => {
      if (i !== qIdx) return item;
      const newOptions = [...item.options];
      newOptions[oIdx] = value;
      return { ...item, options: newOptions };
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title || !form.course) return toast.error('Title and course are required');
    if (questions.some(q => !q.question || q.options.some(o => !o))) {
      return toast.error('Fill in all questions and options');
    }

    setSaving(true);
    try {
      // Format questions with type and points
      const formattedQuestions = questions.map(q => ({
        question: q.question,
        type: 'mcq',
        options: q.options,
        correctAnswer: q.options[q.correctAnswer],
        points: 1
      }));

      await quizzesAPI.create({ ...form, questions: formattedQuestions });
      toast.success('Quiz created!');
      setShowList(true);
      fetchQuizzes();
      // Reset form
      setForm({ title: '', description: '', course: '', duration: 30, isActive: true });
      setQuestions([{ question: '', options: ['', '', '', ''], correctAnswer: 0, type: 'mcq', points: 1 }]);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create quiz');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this quiz?')) return;
    try {
      await quizzesAPI.delete(id);
      toast.success('Quiz deleted');
      fetchQuizzes();
    } catch (err) {
      toast.error('Failed to delete');
    }
  };

  if (showResults) {
    return (
      <div className="space-y-6">
        <div className="space-y-3">
          {/* Back Navigation Button */}
          <div>
            <button 
              onClick={() => { setShowResults(false); setShowList(true); }} 
              className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-blue-600 hover:text-blue-800 bg-blue-50/70 hover:bg-blue-100/80 px-3 py-1.5 rounded-lg border border-blue-200/60 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:bg-blue-100"
            >
              <Icons.ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Back to Quizzes</span>
            </button>
          </div>

          {/* Title and Download Action Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-heading break-words">{selectedQuiz?.title}</h1>
              <p className="text-xs sm:text-sm text-muted mt-1 break-words">
                {selectedQuiz?.course?.name || 'No course'} · Student Results
              </p>
            </div>
            <button 
              onClick={downloadResults} 
              disabled={loadingResults || results.length === 0} 
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 sm:py-2 rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 w-full sm:w-auto shadow-sm shrink-0"
            >
              <Icons.Download className="w-4 h-4" /> Download Results
            </button>
          </div>
        </div>

        {loadingResults ? (
          <div className="flex justify-center h-40"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>
        ) : results.length === 0 ? (
          <div className="text-center py-12 px-4 bg-surface rounded-card border border-border">
            <p className="text-muted text-lg">No student submissions yet</p>
          </div>
        ) : (
          <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
            {/* Desktop Table View (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-border">
                  <tr>
                    <th className="text-left px-6 py-3 text-sm font-medium text-muted">Student Name</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-muted">Enrollment Number</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-muted">Score</th>
                    <th className="text-left px-6 py-3 text-sm font-medium text-muted">Submitted Date</th>
                    <th className="text-center px-6 py-3 text-sm font-medium text-muted">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results.map((result, idx) => (
                    <tr key={result._id || idx} className="hover:bg-gray-50">
                      <td className="px-6 py-3 text-sm text-heading font-medium">{result.student?.name || 'N/A'}</td>
                      <td className="px-6 py-3 text-sm text-muted">{result.student?.enrollmentNumber || 'N/A'}</td>
                      <td className="px-6 py-3 text-sm text-heading font-bold text-center">
                        <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-bold">
                          {result.totalScore}/{result.maxScore}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-sm text-muted">{new Date(result.submittedAt).toLocaleDateString()}</td>
                      <td className="px-6 py-3 text-center">
                        <button 
                          onClick={() => deleteStudentResponse(result._id)}
                          className="text-red-600 hover:text-red-800 text-sm font-medium hover:underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Result Cards (< md) */}
            <div className="md:hidden divide-y divide-border">
              {results.map((result, idx) => (
                <div key={result._id || idx} className="p-4 space-y-3 bg-surface">
                  <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
                    <div className="min-w-0">
                      <span className="text-xs text-muted block font-medium">Student Name</span>
                      <p className="text-sm font-bold text-heading break-words">{result.student?.name || 'N/A'}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs text-muted block font-medium">Score</span>
                      <span className="text-base font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full inline-block">
                        {result.totalScore}/{result.maxScore}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted block font-medium">Enrollment Number</span>
                      <span className="text-heading font-medium break-words">{result.student?.enrollmentNumber || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-muted block font-medium">Submitted</span>
                      <span className="text-heading font-medium">{new Date(result.submittedAt).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-gray-100">
                    <button 
                      onClick={() => deleteStudentResponse(result._id)}
                      className="w-full py-2 px-3 text-center text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-btn transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (showList) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-heading">Quiz</h1>
          </div>
          <button 
            onClick={() => setShowList(false)} 
            className="btn-primary w-full sm:w-auto py-2.5 sm:py-2 text-center"
          >
            Create New Quiz
          </button>
        </div>

        {existingQuizzes.length === 0 ? (
          <div className="text-center py-12 px-4 bg-surface rounded-card border border-border">
            <p className="text-muted text-lg">No quizzes yet</p>
            <button onClick={() => setShowList(false)} className="text-blue-600 hover:underline mt-2">Create your first quiz</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {existingQuizzes.map(q => (
              <div 
                key={q._id} 
                onClick={() => fetchResults(q._id)}
                className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5 cursor-pointer hover:shadow-lg transition-shadow flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-heading text-base leading-snug break-words">{q.title}</h3>
                      <p className="text-sm text-muted mt-1 break-words">{q.course?.name || 'No course'}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 text-xs rounded-full font-medium ${q.isActive !== false ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {q.isActive !== false ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-muted">
                    <span>{q.questions?.length || 0} questions</span>
                    <span>•</span>
                    <span>{q.duration || 30} min</span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleQuizStatus(q._id, q.isActive); }} 
                    className={`text-xs font-semibold px-3 py-2 sm:py-1.5 rounded-btn transition-colors inline-flex items-center justify-center gap-1.5 w-full sm:w-auto min-h-[38px] sm:min-h-0 ${
                      q.isActive 
                        ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {q.isActive ? <Icons.Check className="w-3.5 h-3.5" /> : <Icons.X className="w-3.5 h-3.5" />}
                    <span>{q.isActive ? 'Active' : 'Inactive'}</span>
                  </button>
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(q._id); }} 
                    className="text-red-600 hover:text-red-800 text-xs sm:text-sm font-semibold py-2 sm:py-1 px-3 text-center w-full sm:w-auto hover:bg-red-50 rounded-btn transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <button 
          type="button" 
          onClick={() => setShowList(true)} 
          className="text-muted hover:text-heading inline-flex items-center gap-1 text-sm font-medium w-fit py-1"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">Create Quiz</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Quiz Title *</label>
            <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="form-input w-full" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Semester *</label>
            <select
              value={form.semester}
              onChange={e => setForm(f => ({ ...f, semester: e.target.value, course: '' }))}
              className="form-input w-full"
              required
            >
              <option value="">Select Semester</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <option key={s} value={String(s)}>Semester {s}</option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">Select the semester first, then choose a course from that semester</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-heading mb-1">Course *</label>
            {(() => {
              const filteredForSem = assignedCourses.filter(c => Number(c.semester) === Number(form.semester));
              return (
                <>
                  <select
                    value={form.course}
                    onChange={e => setForm(f => ({ ...f, course: e.target.value }))}
                    className="form-input w-full"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Duration (minutes)</label>
              <input type="number" value={form.duration} onChange={e => setForm(f => ({ ...f, duration: parseInt(e.target.value) || 30 }))} className="form-input w-full" min="1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-heading mb-1">Status</label>
              <select value={form.isActive} onChange={e => setForm(f => ({ ...f, isActive: e.target.value === 'true' }))} className="form-input w-full">
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-heading mb-1">Description</label>
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="form-input w-full" rows={2} />
          </div>
        </div>

        {/* Questions */}
        <div className="space-y-4">
          {questions.map((q, qIdx) => (
            <div key={qIdx} className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-semibold text-heading text-base">Question {qIdx + 1}</h3>
                {questions.length > 1 && (
                  <button type="button" onClick={() => removeQuestion(qIdx)} className="text-red-600 hover:text-red-800 text-xs sm:text-sm font-medium py-1 px-2 rounded hover:bg-red-50 transition-colors">Remove</button>
                )}
              </div>
              <input
                type="text"
                value={q.question}
                onChange={e => updateQuestion(qIdx, 'question', e.target.value)}
                className="form-input w-full mb-3"
                placeholder="Enter question text"
              />
              <div className="space-y-2.5">
                {q.options.map((opt, oIdx) => (
                  <div key={oIdx} className="flex items-center gap-2.5">
                    <input
                      type="radio"
                      name={`correct-${qIdx}`}
                      checked={q.correctAnswer === oIdx}
                      onChange={() => updateQuestion(qIdx, 'correctAnswer', oIdx)}
                      className="text-blue-600 w-4 h-4 shrink-0 focus:ring-blue-500 cursor-pointer"
                      id={`q-${qIdx}-opt-${oIdx}`}
                    />
                    <input
                      type="text"
                      value={opt}
                      onChange={e => updateOption(qIdx, oIdx, e.target.value)}
                      className="form-input flex-1 min-w-0"
                      placeholder={`Option ${String.fromCharCode(65 + oIdx)}`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted mt-2.5">Select the radio button for the correct answer</p>
            </div>
          ))}
        </div>

        <button 
          type="button" 
          onClick={addQuestion} 
          className="w-full py-3.5 border-2 border-dashed border-border rounded-card text-muted hover:text-heading hover:border-blue-400 font-medium text-sm transition-colors flex items-center justify-center gap-1.5"
        >
          <Icons.Plus className="w-4 h-4" /> Add Question
        </button>

        <div className="flex flex-col sm:flex-row gap-3">
          <button type="submit" disabled={saving} className="btn-primary w-full sm:flex-1 py-2.5 sm:py-2 text-center disabled:opacity-50">
            {saving ? 'Saving...' : 'Create Quiz'}
          </button>
          <button 
            type="button" 
            onClick={() => setShowList(true)} 
            className="w-full sm:w-auto px-5 py-2.5 sm:py-2 border border-border rounded-btn text-muted hover:text-heading hover:bg-gray-50 text-center font-medium text-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
