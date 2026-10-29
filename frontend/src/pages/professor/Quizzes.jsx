import { useState, useEffect } from 'react';
import { quizzesAPI, coursesAPI, usersAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';

export default function ProfessorQuizzes() {
  const { user } = useAuth();
  const [quizzes, setQuizzes] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSemester, setSelectedSemester] = useState('1');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [showResponsesModal, setShowResponsesModal] = useState(false);
  const [responses, setResponses] = useState([]);
  const [responsesLoading, setResponsesLoading] = useState(false);

  useEffect(() => {
    fetchCourses();
    fetchQuizzes();
  }, []);

  useEffect(() => {
    setSelectedCourse('');
    if (selectedSemester) {
      fetchQuizzes();
    }
  }, [selectedSemester]);

  useEffect(() => {
    if (selectedCourse) {
      fetchQuizzes();
    }
  }, [selectedCourse]);

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
    }
  };

  const fetchQuizzes = async () => {
    try {
      setLoading(true);
      const params = { limit: 100, createdBy: user.id };
      if (selectedCourse) {
        params.course = selectedCourse;
      }
      const res = await quizzesAPI.getAll(params);
      const allQuizzes = res.data.data || res.data || [];
      
      // Filter by semester if needed
      const filteredQuizzes = selectedSemester
        ? allQuizzes.filter(q => {
            // Try to match semester from course or lecture
            return !q.semester || q.semester == selectedSemester || 
                   (q.course && courses.find(c => c._id === q.course._id || c._id === q.course)?.semester == selectedSemester);
          })
        : allQuizzes;
      
      setQuizzes(filteredQuizzes);
    } catch (err) {
      toast.error('Failed to fetch quizzes');
    } finally {
      setLoading(false);
    }
  };

  const fetchResponses = async (quizId) => {
    try {
      setResponsesLoading(true);
      const res = await quizzesAPI.getResults(quizId);
      const resultsData = res.data.results || res.data || [];
      setResponses(resultsData);
    } catch (err) {
      toast.error('Failed to fetch quiz responses');
    } finally {
      setResponsesLoading(false);
    }
  };

  const handleViewResponses = (quiz) => {
    setSelectedQuiz(quiz);
    setShowResponsesModal(true);
    fetchResponses(quiz._id);
  };

  const handleDownloadResponses = () => {
    if (!selectedQuiz || responses.length === 0) {
      toast.error('No responses to download');
      return;
    }

    const headers = 'Student Name,Enrollment Number,Score,Max Score,Percentage,Submitted At\n';
    const rows = responses.map(r => {
      const student = r.student || {};
      const name = student.name || 'Unknown';
      const enrollmentNumber = student.enrollmentNumber || 'N/A';
      const score = r.totalScore || 0;
      const maxScore = r.maxScore || 0;
      const percentage = maxScore > 0 ? ((score / maxScore) * 100).toFixed(1) : 0;
      const submittedAt = r.submittedAt ? new Date(r.submittedAt).toLocaleString() : 'N/A';
      
      return `"${name}","${enrollmentNumber}",${score},${maxScore},${percentage},${submittedAt}`;
    }).join('\n');

    const csv = headers + rows;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedQuiz.title}-responses-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success('Responses downloaded successfully');
  };

  const filteredCourses = courses.filter(c => !c.semester || c.semester == selectedSemester);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-card shadow-card border border-border p-6">
        <h1 className="text-2xl font-bold text-heading mb-4">My Quizzes</h1>

        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-heading mb-2">Semester</label>
            <select
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="w-full px-4 py-2 border border-border rounded-lg bg-white text-heading focus:outline-none focus:border-blue-600"
            >
              <option value="">Select Semester</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <option key={s} value={String(s)}>Semester {s}</option>
              ))}
            </select>
            <p className="text-xs text-muted mt-1">Select the semester first, then choose a course from that semester</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-heading mb-2">Course</label>
            {(() => {
              const filteredForSem = courses.filter(c => Number(c.semester) === Number(selectedSemester));
              return (
                <>
                  <select
                    value={selectedCourse}
                    onChange={(e) => setSelectedCourse(e.target.value)}
                    className="w-full px-4 py-2 border border-border rounded-lg bg-white text-heading focus:outline-none focus:border-blue-600"
                    disabled={!selectedSemester}
                  >
                    {!selectedSemester ? (
                      <option value="">Please select a semester first</option>
                    ) : filteredForSem.length === 0 ? (
                      <option value="" disabled selected>No courses from this semester are assigned to you.</option>
                    ) : (
                      <>
                        <option value="">All Courses for Semester {selectedSemester}</option>
                        {filteredForSem.map(course => (
                          <option key={course._id} value={course._id}>
                            {course.name} ({course.code})
                          </option>
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

        {/* Quizzes List */}
        {quizzes.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted text-lg">No quizzes created yet</p>
            <p className="text-muted text-sm mt-2">Quizzes you create will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {quizzes.map(quiz => (
              <div
                key={quiz._id}
                className="flex items-center justify-between p-4 bg-white border border-border rounded-lg hover:shadow-md transition-shadow"
              >
                <div className="flex-1">
                  <h3 className="font-semibold text-heading">{quiz.title}</h3>
                  <p className="text-sm text-muted mt-1">
                    {quiz.questions?.length || 0} questions • {quiz.timeLimit || 30} min
                  </p>
                  {quiz.course && (
                    <p className="text-xs text-muted mt-1">
                      {typeof quiz.course === 'object' ? `${quiz.course.code} - ${quiz.course.name}` : 'Course assigned'}
                    </p>
                  )}
                </div>

                <div className="text-right ml-4">
                  <button
                    onClick={() => handleViewResponses(quiz)}
                    className="text-blue-600 hover:text-blue-700 font-semibold text-sm cursor-pointer inline-flex items-center gap-1"
                  >
                    Responses: <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs">
                      {quiz.responseCount || 0}
                    </span>
                    {' '}→
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Responses Modal */}
      {showResponsesModal && selectedQuiz && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-6 border-b border-border bg-surface">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-heading">{selectedQuiz.title}</h2>
                  <p className="text-sm text-muted mt-1">
                    {responses.length} student{responses.length !== 1 ? 's' : ''} responded
                  </p>
                </div>
                <button
                  onClick={() => setShowResponsesModal(false)}
                  className="text-muted hover:text-heading text-2xl font-light"
                >
                  ×
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
              {responsesLoading ? (
                <div className="flex justify-center items-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              ) : responses.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-muted">No responses yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-surface border-b border-border">
                        <th className="px-4 py-3 text-left text-sm font-semibold text-heading">Student Name</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-heading">Enrollment Number</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-heading">Score</th>
                        <th className="px-4 py-3 text-center text-sm font-semibold text-heading">Percentage</th>
                        <th className="px-4 py-3 text-left text-sm font-semibold text-heading">Submitted At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {responses.map((response, idx) => {
                        const student = response.student || {};
                        const percentage = response.maxScore > 0
                          ? ((response.totalScore / response.maxScore) * 100).toFixed(1)
                          : 0;

                        return (
                          <tr
                            key={idx}
                            className="border-b border-border hover:bg-surface transition-colors"
                          >
                            <td className="px-4 py-3 text-sm text-heading">{student.name || 'Unknown'}</td>
                            <td className="px-4 py-3 text-sm text-muted">{student.enrollmentNumber || 'N/A'}</td>
                            <td className="px-4 py-3 text-sm text-center font-semibold text-heading">
                              {response.totalScore}/{response.maxScore}
                            </td>
                            <td className="px-4 py-3 text-sm text-center">
                              <span className={`${
                                percentage >= 70 ? 'text-green-600 font-semibold' :
                                percentage >= 50 ? 'text-amber-600' :
                                'text-red-600'
                              }`}>
                                {percentage}%
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted">
                              {response.submittedAt ? new Date(response.submittedAt).toLocaleString() : 'N/A'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-border bg-surface flex gap-3 justify-end">
              <button
                onClick={() => setShowResponsesModal(false)}
                className="px-4 py-2 border border-border rounded-lg text-heading hover:bg-surface transition-colors"
              >
                Close
              </button>
              {responses.length > 0 && (
                <button
                  onClick={handleDownloadResponses}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-1.5"
                >
                  <Icons.Download className="w-4 h-4" /> Download CSV
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
