import { useState } from 'react';
import toast from 'react-hot-toast';
import { Icons } from '../shared/Icons';

const QuizPreviewForProfessor = ({ quiz, onPublish, onClose }) => {
  const [publishing, setPublishing] = useState(false);
  const [editingQuestions, setEditingQuestions] = useState(quiz?.questions || []);
  const [editingTitle, setEditingTitle] = useState(quiz?.title || '');

  if (!quiz || !quiz.questions) {
    return null;
  }

  const handlePublish = async () => {
    setPublishing(true);
    try {
      if (onPublish) {
        await onPublish();
      }
      toast.success('Quiz submitted to students!');
      setTimeout(() => onClose(), 1000);
    } catch (err) {
      toast.error('Failed to submit quiz');
    } finally {
      setPublishing(false);
    }
  };

  const updateQuestion = (idx, field, value) => {
    const updated = [...editingQuestions];
    updated[idx] = { ...updated[idx], [field]: value };
    setEditingQuestions(updated);
  };

  const updateOption = (qIdx, optIdx, value) => {
    const updated = [...editingQuestions];
    const options = [...updated[qIdx].options];
    options[optIdx] = value;
    updated[qIdx] = { ...updated[qIdx], options };
    setEditingQuestions(updated);
  };

  const updateCorrectAnswer = (qIdx, value) => {
    const updated = [...editingQuestions];
    updated[qIdx] = { ...updated[qIdx], correctAnswer: value };
    setEditingQuestions(updated);
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px',
      overflowY: 'auto'
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
        width: '100%',
        maxWidth: '900px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }} onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f0f9ff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start'
        }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '24px', fontWeight: 'bold', color: '#111827', margin: 0, marginBottom: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Icons.Edit className="w-6 h-6 text-blue-600 inline" /> Edit & Submit Quiz
            </h2>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
              Modify questions, answers and then submit to publish to students
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: '#9ca3af',
              padding: '0',
              marginTop: '-4px'
            }}
          >
            ×
          </button>
        </div>

        {/* CONTENT - Editable Questions */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
        }}>
          {/* Title Editor */}
          <div style={{ marginBottom: '24px', padding: '16px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', color: '#6b7280', marginBottom: '8px', textTransform: 'uppercase' }}>
              Quiz Title
            </label>
            <input
              type="text"
              value={editingTitle}
              onChange={(e) => setEditingTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '15px',
                fontWeight: '600',
                boxSizing: 'border-box'
              }}
              placeholder="Quiz title"
            />
          </div>

          {/* Questions */}
          {editingQuestions.map((q, qIdx) => (
            <div key={q._id || qIdx} style={{
              border: '2px solid #e5e7eb',
              borderRadius: '8px',
              padding: '20px',
              marginBottom: '20px',
              backgroundColor: '#fafafa'
            }}>
              {/* Question Number */}
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#2563eb', textTransform: 'uppercase', marginBottom: '12px' }}>
                Question {qIdx + 1}
              </div>

              {/* Question Text Editor */}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#6b7280', marginBottom: '6px' }}>
                  Question Text
                </label>
                <input
                  type="text"
                  value={q.question}
                  onChange={(e) => updateQuestion(qIdx, 'question', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* Points Editor */}
              <div style={{ marginBottom: '16px', display: 'flex', gap: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#6b7280', marginBottom: '6px' }}>
                    Points
                  </label>
                  <input
                    type="number"
                    value={q.points || 1}
                    onChange={(e) => updateQuestion(qIdx, 'points', parseInt(e.target.value) || 1)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      boxSizing: 'border-box'
                    }}
                    min="1"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#6b7280', marginBottom: '6px' }}>
                    Type
                  </label>
                  <input
                    type="text"
                    value={q.type === 'mcq' ? 'Multiple Choice' : 'Descriptive'}
                    disabled
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      backgroundColor: '#f3f4f6',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* Options/Answers Editor */}
              {q.type === 'mcq' && q.options ? (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#6b7280', marginBottom: '12px', textTransform: 'uppercase' }}>
                    Options & Select Correct Answer
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {q.options.map((opt, oIdx) => {
                      const isCorrect = opt === q.correctAnswer;
                      return (
                        <div key={oIdx} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input
                            type="radio"
                            name={`correct-${qIdx}`}
                            checked={isCorrect}
                            onChange={() => updateCorrectAnswer(qIdx, opt)}
                            style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                          />
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => updateOption(qIdx, oIdx, e.target.value)}
                            style={{
                              flex: 1,
                              padding: '8px 10px',
                              border: `1px solid ${isCorrect ? '#22c55e' : '#d1d5db'}`,
                              borderRadius: '6px',
                              fontSize: '14px',
                              backgroundColor: isCorrect ? '#f0fdf4' : 'white',
                              boxSizing: 'border-box'
                            }}
                            placeholder={`Option ${oIdx + 1}`}
                          />
                          {isCorrect && (
                            <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#22c55e', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              <Icons.Check className="w-3.5 h-3.5 inline" /> Correct
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Expected Answer
                  </label>
                  <textarea
                    value={q.correctAnswer || ''}
                    onChange={(e) => updateCorrectAnswer(qIdx, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box',
                      minHeight: '80px',
                      resize: 'vertical'
                    }}
                    placeholder="Enter expected answer for manual grading"
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* FOOTER - Buttons */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 24px',
              border: '2px solid #d1d5db',
              borderRadius: '6px',
              backgroundColor: 'white',
              color: '#374151',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => e.target.style.backgroundColor = '#f3f4f6'}
            onMouseOut={(e) => e.target.style.backgroundColor = 'white'}
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={publishing}
            style={{
              padding: '10px 24px',
              backgroundColor: publishing ? '#86efac' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: publishing ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseOver={(e) => !publishing && (e.target.style.backgroundColor = '#1d4ed8')}
            onMouseOut={(e) => !publishing && (e.target.style.backgroundColor = '#2563eb')}
          >
            {publishing ? (
              <><Icons.Loader className="w-4 h-4 animate-spin inline" /> Submitting...</>
            ) : (
              <><Icons.CheckCircle className="w-4 h-4 inline" /> Submit & Publish to Students</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuizPreviewForProfessor;
