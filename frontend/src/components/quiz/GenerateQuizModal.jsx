import { useState } from 'react';
import toast from 'react-hot-toast';
import { Icons } from '../shared/Icons';

const GenerateQuizModal = ({ isOpen, lecture, onClose, onQuizGenerated }) => {
  const [loading, setLoading] = useState(false);
  const [questionCount, setQuestionCount] = useState(5);

  if (!isOpen || !lecture) return null;

  const handleGenerateQuiz = async () => {
    if (!lecture.transcription || !lecture.transcription.text) {
      toast.error('Please transcribe the lecture first');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/quizzes/generate-from-lecture/${lecture._id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({ questionCount })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to generate quiz');
      }

      toast.success('Quiz generated! Scroll down to edit and submit.');
      if (onQuizGenerated) {
        onQuizGenerated(data.quiz);
      }
      onClose();
    } catch (err) {
      toast.error(err.message || 'Failed to generate quiz');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      padding: '16px'
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
        width: '100%',
        maxWidth: '500px'
      }} onClick={(e) => e.stopPropagation()}>
        {/* HEADER */}
        <div style={{
          padding: '24px',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f0f9ff',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111827', margin: 0, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <Icons.Bot className="w-5 h-5 text-blue-600 inline" /> Generate Quiz
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '28px',
              cursor: 'pointer',
              color: '#9ca3af'
            }}
          >
            ×
          </button>
        </div>

        {/* CONTENT */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Lecture Info */}
          <div style={{
            padding: '16px',
            backgroundColor: '#f9fafb',
            borderRadius: '8px',
            borderLeft: '4px solid #2563eb'
          }}>
            <p style={{ fontSize: '13px', color: '#6b7280', margin: 0, marginBottom: '4px', textTransform: 'uppercase' }}>
              From Lecture
            </p>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#111827', margin: 0 }}>
              {lecture.title}
            </h3>
          </div>

          {/* Transcription Status */}
          <div style={{
            padding: '12px 16px',
            backgroundColor: lecture.transcription?.status === 'completed' ? '#f0fdf4' : '#fef3c7',
            border: `1px solid ${lecture.transcription?.status === 'completed' ? '#bbf7d0' : '#fcd34d'}`,
            borderRadius: '6px'
          }}>
            <p style={{ fontSize: '13px', color: lecture.transcription?.status === 'completed' ? '#166534' : '#92400e', margin: 0, fontWeight: '500', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              {lecture.transcription?.status === 'completed' ? (
                <><Icons.Check className="w-4 h-4 inline text-green-600" /> Ready for AI generation</>
              ) : (
                <><Icons.Hourglass className="w-4 h-4 inline text-amber-600" /> Transcription in progress or not started</>
              )}
            </p>
          </div>

          {/* Question Count */}
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#111827', marginBottom: '8px' }}>
              How many questions?
            </label>
            <select
              value={questionCount}
              onChange={(e) => setQuestionCount(parseInt(e.target.value))}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 12px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
                backgroundColor: 'white',
                cursor: 'pointer',
                opacity: loading ? 0.6 : 1,
                boxSizing: 'border-box'
              }}
            >
              <option value={3}>3 Questions</option>
              <option value={5}>5 Questions</option>
              <option value={7}>7 Questions</option>
              <option value={10}>10 Questions</option>
            </select>
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '6px 0 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icons.FileText className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" /> AI will generate multiple-choice questions from transcription
            </p>
          </div>

          {/* Info Box */}
          <div style={{
            padding: '12px 16px',
            backgroundColor: '#dbeafe',
            border: '1px solid #93c5fd',
            borderRadius: '6px'
          }}>
            <p style={{ fontSize: '13px', color: '#1e40af', margin: 0, display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <Icons.Lightbulb className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" /> <span>After generation, you can <strong>edit all questions and answers</strong> before submitting to students.</span>
            </p>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #e5e7eb',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '12px'
        }}>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              padding: '8px 16px',
              backgroundColor: '#f3f4f6',
              color: '#374151',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: '500'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleGenerateQuiz}
            disabled={loading}
            style={{
              padding: '8px 20px',
              backgroundColor: loading ? '#93c5fd' : '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {loading ? (
              <><Icons.Loader className="w-4 h-4 animate-spin inline" /> Generating...</>
            ) : (
              <><Icons.Sparkles className="w-4 h-4 inline" /> Generate Quiz</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GenerateQuizModal;
