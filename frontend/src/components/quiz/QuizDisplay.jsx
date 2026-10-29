import React, { useState } from 'react';
import { Icons } from '../shared/Icons';
import './QuizDisplay.css';

/**
 * QuizDisplay Component
 * Displays quiz questions with multiple-choice options
 * Allows for quiz submission
 */
const QuizDisplay = ({ 
  quiz, 
  onSubmit, 
  loading = false,
  showAnswers = false,
  userAnswers = {}
}) => {
  const [answers, setAnswers] = useState(userAnswers || {});
  const [submitted, setSubmitted] = useState(false);

  if (!quiz || !quiz.questions) {
    return <div className="alert alert-error">No quiz data available</div>;
  }

  const handleAnswerChange = (questionId, answer) => {
    if (!submitted && !loading) {
      setAnswers(prev => ({
        ...prev,
        [questionId]: answer
      }));
    }
  };

  const handleSubmit = async () => {
    // Validate all questions answered
    const unansweredCount = quiz.questions.length - Object.keys(answers).length;
    if (unansweredCount > 0) {
      alert(`Please answer all ${unansweredCount} unanswered question(s)`);
      return;
    }

    // Transform answers to API format
    const submittedAnswers = quiz.questions.map(q => ({
      questionId: q._id,
      answer: answers[q._id] || ''
    }));

    if (onSubmit) {
      await onSubmit(submittedAnswers);
      setSubmitted(true);
    }
  };

  const calculateProgress = () => {
    return Math.round((Object.keys(answers).length / quiz.questions.length) * 100);
  };

  return (
    <div className="quiz-display">
      {/* Header */}
      <div className="quiz-header">
        <h2 className="quiz-title">{quiz.title}</h2>
        <div className="quiz-meta-row">
          {quiz.sourceLecture && (
            <p className="quiz-source-text">
              Generated from: <strong className="font-semibold text-heading">{typeof quiz.sourceLecture === 'object' ? (quiz.sourceLecture.title || 'Lab') : quiz.sourceLecture}</strong>
            </p>
          )}
          {quiz.aiGenerated && (
            <span className="badge badge-ai inline-flex items-center gap-1">
              <Icons.Bot className="w-3 h-3 text-amber-700" /> AI Generated
            </span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-section">
        <div className="progress-info">
          <span className="progress-label">
            Progress: <strong className="font-semibold text-heading">{Object.keys(answers).length} / {quiz.questions.length} answered</strong>
          </span>
          <span className="progress-percent">{calculateProgress()}%</span>
        </div>
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${calculateProgress()}%` }}
          ></div>
        </div>
      </div>

      {/* Questions */}
      <div className="questions-container">
        {quiz.questions.map((question, index) => (
          <div key={question._id || index} className="question-card">
            <div className="question-header">
              <span className="question-number">Question {index + 1}</span>
              {showAnswers && question.correctAnswer && (
                <span className={`answer-status ${
                  answers[question._id] === question.correctAnswer 
                    ? 'correct' 
                    : answers[question._id] ? 'incorrect' : 'neutral'
                }`}>
                  {answers[question._id] === question.correctAnswer ? (
                    <span className="inline-flex items-center gap-1"><Icons.Check className="w-3.5 h-3.5" /> Correct</span>
                  ) : answers[question._id] ? (
                    <span className="inline-flex items-center gap-1"><Icons.X className="w-3.5 h-3.5" /> Incorrect</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-muted">Answer Key: {question.correctAnswer}</span>
                  )}
                </span>
              )}
            </div>

            <h3 className="question-text">{question.question}</h3>

            {/* Options */}
            <div className="options-container">
              {question.options && question.options.map((option, optIndex) => {
                const isSelected = answers[question._id] === option;
                const isCorrect = option === question.correctAnswer;
                const showCorrect = showAnswers && isCorrect;
                const showIncorrect = showAnswers && isSelected && !isCorrect;

                return (
                  <label
                    key={optIndex}
                    className={`option-label ${
                      isSelected ? 'selected' : ''
                    } ${
                      showCorrect ? 'correct' : ''
                    } ${
                      showIncorrect ? 'incorrect' : ''
                    }`}
                  >
                    <input
                      type="radio"
                      name={`question-${question._id || index}`}
                      value={option}
                      checked={isSelected}
                      onChange={() => handleAnswerChange(question._id, option)}
                      disabled={submitted || loading}
                      className="option-radio"
                    />
                    <span className="option-text">{option}</span>
                    {showCorrect && <span className="option-badge">Correct Answer</span>}
                    {showIncorrect && <span className="option-badge">Your Answer</span>}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Time limit info */}
      {quiz.timeLimit && (
        <div className="time-limit-info">
          <p className="text-xs sm:text-sm text-muted inline-flex items-center gap-1.5">
            <Icons.Clock className="w-4 h-4 text-blue-600" /> Time Limit: {quiz.timeLimit} minutes
          </p>
        </div>
      )}

      {/* Submit button (when onSubmit handler is provided) */}
      {onSubmit && !submitted && (
        <div className="quiz-footer">
          <button
            className="btn btn-primary btn-lg"
            onClick={handleSubmit}
            disabled={loading || Object.keys(answers).length === 0}
          >
            {loading ? (
              <>
                <span className="spinner"></span> Submitting...
              </>
            ) : (
              `Submit Quiz (${Object.keys(answers).length}/${quiz.questions.length} answered)`
            )}
          </button>
        </div>
      )}

      {/* Submitted message */}
      {submitted && (
        <div className="alert alert-success">
          <p className="flex items-center gap-2"><Icons.CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" /> Quiz submitted successfully! Your responses have been recorded.</p>
        </div>
      )}
    </div>
  );
};

export default QuizDisplay;
