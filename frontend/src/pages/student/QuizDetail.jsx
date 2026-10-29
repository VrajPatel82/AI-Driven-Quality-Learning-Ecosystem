import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { quizzesAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function StudentQuizDetail() {
  const { id } = useParams();
  const [quiz, setQuiz] = useState(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState({});
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchQuiz();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchQuiz = async () => {
    try {
      const res = await quizzesAPI.getById(id);
      const responseData = res.data;
      
      // Extract quiz, attempted status, and result from response
      const quizData = responseData.data || responseData.quiz || responseData;
      const attempted = responseData.attempted || false;
      const resultData = responseData.result || null;
      
      setQuiz(quizData);
      
      // If already attempted, show result instead of quiz form
      if (attempted && resultData) {
        setSubmitted(true);
        setResult(resultData);
        toast.error('You have already submitted this quiz', { duration: 4000 });
      }
    } catch (err) {
      toast.error('Failed to load quiz');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswer = (questionIndex, optionIndex) => {
    setAnswers(prev => ({ ...prev, [questionIndex]: optionIndex }));
  };

  const handleSubmit = async () => {
    if (!quiz) return;
    const unanswered = quiz.questions.length - Object.keys(answers).length;
    if (unanswered > 0 && !window.confirm(`You have ${unanswered} unanswered question(s). Submit anyway?`)) {
      return;
    }

    setSubmitting(true);
    try {
      const formattedAnswers = quiz.questions.map((question, idx) => {
        const selectedOptionIndex = answers[idx];
        const selectedOptionText = selectedOptionIndex !== undefined ? question.options[selectedOptionIndex] : '';
        return {
          questionId: question._id,
          answer: selectedOptionText
        };
      });
      const res = await quizzesAPI.submit(id, { answers: formattedAnswers });
      // Extract result from response - the backend returns { result, message }
      setResult(res.data.result);
      setSubmitted(true);
      toast.success('Quiz submitted successfully!');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to submit quiz';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3"></div>
        <span className="text-xs sm:text-sm text-muted">Loading quiz questions...</span>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="text-center py-12 px-4 bg-surface rounded-card border border-border shadow-card max-w-md mx-auto">
        <p className="text-muted text-base sm:text-lg">Quiz not found</p>
        <Link to="/student/quiz" className="text-blue-600 hover:underline mt-2 inline-block font-medium text-sm">
          Back to Quizzes
        </Link>
      </div>
    );
  }

  if (submitted && result) {
    const percentage = result?.maxScore > 0 ? ((result.totalScore / result.maxScore) * 100).toFixed(1) : '0';
    const pctNum = parseFloat(percentage);

    return (
      <div className="max-w-xl mx-auto space-y-4 sm:space-y-6">
        <div className="bg-surface rounded-card shadow-card border border-border p-6 sm:p-8 text-center">
          {/* Celebration / Success Icon */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-emerald-50 text-emerald-600 border-2 border-emerald-200 rounded-full flex items-center justify-center mb-4 shadow-sm">
            <Icons.Check className="w-8 h-8 sm:w-10 sm:h-10 stroke-[2.5]" />
          </div>

          <h1 className="text-xl sm:text-2xl font-bold text-heading">Quiz Completed!</h1>
          <p className="text-xs sm:text-sm text-muted mt-1.5 break-words max-w-md mx-auto">{quiz.title}</p>
          
          {/* Source lecture pill if AI-generated */}
          {quiz.aiGenerated && quiz.sourceLecture && (
            <div className="mt-3 inline-flex items-center gap-1.5 bg-indigo-50 px-3 py-1 rounded-full text-xs font-medium text-indigo-700 border border-indigo-200 max-w-full truncate">
              <Icons.Bot className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">From: <strong className="font-semibold">{quiz.sourceLecture.title || quiz.sourceLecture}</strong></span>
            </div>
          )}
          
          {/* Score & Percentage Cards Grid */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 max-w-sm mx-auto">
            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-3.5 sm:p-4 text-center">
              <p className="text-2xl sm:text-3xl font-extrabold text-blue-700">
                {result?.totalScore ?? 0} <span className="text-base sm:text-lg font-medium text-blue-500">/ {result?.maxScore ?? 0}</span>
              </p>
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-blue-600 mt-1">Score</p>
            </div>

            <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-3.5 sm:p-4 text-center">
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700">
                {percentage}%
              </p>
              <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-emerald-600 mt-1">Percentage</p>
            </div>
          </div>

          {/* Performance feedback note */}
          <p className="text-xs sm:text-sm text-slate-600 mt-4 font-medium">
            {pctNum >= 80 
              ? '🎉 Excellent performance! You have mastered this topic.' 
              : pctNum >= 60 
              ? '👍 Good job! Review the concepts you missed to improve further.' 
              : '📚 Keep practicing! Revisit the lecture materials and attempt again.'}
          </p>

          {/* Action Buttons */}
          <div className="mt-6 pt-5 border-t border-border/70 flex flex-col sm:flex-row gap-2.5 justify-center">
            <Link
              to="/student/quiz"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-btn bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs sm:text-sm transition-all shadow-sm min-h-[44px]"
            >
              Back to Quizzes
            </Link>
            {quiz.sourceLecture && quiz.sourceLecture._id && (
              <Link
                to={`/student/lectures/${quiz.sourceLecture._id}`}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-btn bg-slate-100 hover:bg-slate-200 text-heading font-medium text-xs sm:text-sm transition-all border border-border min-h-[44px]"
              >
                <Icons.Book className="w-4 h-4 text-slate-500" />
                View Lecture
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const questions = quiz.questions || [];
  const currentQ = questions[currentQuestion];

  return (
    <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
      {/* Breadcrumb Header */}
      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted min-w-0 overflow-hidden">
        <Link to="/student/quiz" className="hover:text-blue-600 font-medium shrink-0">
          Quizzes
        </Link>
        <span className="text-slate-300 shrink-0">/</span>
        <span className="text-heading font-semibold truncate">{quiz.title}</span>
      </div>

      {/* AI-Generated Quiz Info Banner */}
      {quiz.aiGenerated && (
        <div className="bg-gradient-to-r from-indigo-50/80 via-blue-50/80 to-purple-50/80 rounded-xl border border-indigo-200/80 p-3 sm:p-4 shadow-sm">
          <div className="flex items-start sm:items-center gap-2.5 sm:gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
              <Icons.Bot className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                <span className="text-[11px] font-bold bg-indigo-200 text-indigo-900 px-2 py-0.5 rounded-full">
                  AI GENERATED
                </span>
                {quiz.sourceLecture && (
                  <span className="text-xs text-indigo-950 font-medium truncate">
                    Based on lecture: <strong className="font-semibold">{quiz.sourceLecture.title || quiz.sourceLecture}</strong>
                  </span>
                )}
                {quiz.generatedAt && (
                  <span className="text-[11px] text-indigo-600 sm:ml-auto">
                    Created on {new Date(quiz.generatedAt).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Progress Card */}
      <div className="bg-surface rounded-card shadow-card border border-border p-3.5 sm:p-4">
        <div className="flex justify-between items-center mb-2 text-xs sm:text-sm">
          <span className="font-semibold text-heading">Question {currentQuestion + 1} of {questions.length}</span>
          <span className="font-medium text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full text-xs">
            {Object.keys(answers).length} of {questions.length} answered
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
          <div
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out"
            style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
          ></div>
        </div>
      </div>

      {/* Question Card */}
      {currentQ && (
        <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4 sm:space-y-5">
          <div className="flex items-start gap-2.5">
            <span className="shrink-0 px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 text-xs font-bold uppercase tracking-wider">
              Q{currentQuestion + 1}
            </span>
            <h2 className="text-base sm:text-lg font-semibold text-heading leading-snug break-words">
              {currentQ.question || currentQ.text}
            </h2>
          </div>

          <div className="space-y-2.5 sm:space-y-3 pt-1">
            {(currentQ.options || []).map((option, idx) => {
              const isSelected = answers[currentQuestion] === idx;
              const optionText = typeof option === 'string' ? option : option.text || option.label;
              const letter = String.fromCharCode(65 + idx);

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAnswer(currentQuestion, idx)}
                  className={`group w-full text-left p-3.5 sm:p-4 rounded-xl border-2 transition-all flex items-start gap-3 active:scale-[0.99] min-h-[48px] ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/80 text-blue-950 shadow-sm ring-1 ring-blue-600/20'
                      : 'border-border hover:border-blue-300 hover:bg-slate-50 text-slate-800'
                  }`}
                >
                  <span className={`w-7 h-7 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center shrink-0 transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-700 group-hover:bg-blue-100 group-hover:text-blue-700'
                  }`}>
                    {letter}
                  </span>
                  <span className="flex-1 text-xs sm:text-sm font-medium leading-relaxed pt-0.5 break-words">
                    {optionText}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation Controls */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          onClick={() => setCurrentQuestion(q => Math.max(0, q - 1))}
          disabled={currentQuestion === 0}
          className="inline-flex items-center justify-center gap-1.5 px-4 sm:px-5 py-2.5 rounded-btn border border-border bg-white hover:bg-slate-50 text-heading text-xs sm:text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed min-h-[44px]"
        >
          ← Previous
        </button>

        <div className="flex gap-2">
          {currentQuestion < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setCurrentQuestion(q => q + 1)}
              className="inline-flex items-center justify-center gap-1.5 px-5 sm:px-6 py-2.5 rounded-btn bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold transition-all shadow-sm min-h-[44px]"
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-btn bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-semibold transition-all shadow-sm disabled:opacity-50 min-h-[44px]"
            >
              {submitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Submitting...
                </>
              ) : (
                <>
                  <Icons.Check className="w-4 h-4" />
                  Submit Quiz
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Question Navigator */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-xs sm:text-sm font-semibold text-heading">Question Navigator</p>
          <div className="flex items-center gap-3 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500" /> Answered
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-600" /> Current
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-slate-300" /> Unanswered
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {questions.map((_, idx) => {
            const isCurrent = currentQuestion === idx;
            const isAnswered = answers[idx] !== undefined;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => setCurrentQuestion(idx)}
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center min-w-[36px] ${
                  isCurrent
                    ? 'bg-blue-600 text-white ring-2 ring-blue-600 ring-offset-2 shadow-sm'
                    : isAnswered
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 font-bold'
                    : 'bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200'
                }`}
                aria-label={`Go to Question ${idx + 1}`}
              >
                {idx + 1}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
