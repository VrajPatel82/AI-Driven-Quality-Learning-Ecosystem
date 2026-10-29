import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import GenerateQuizModal from '../../components/quiz/GenerateQuizModal';
import QuizDisplay from '../../components/quiz/QuizDisplay';
import QuizPreviewForProfessor from '../../components/quiz/QuizPreviewForProfessor';
import LanguageChart from '../../components/shared/LanguageChart';
import AudioTrackManager from '../../components/shared/AudioTrackManager';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import EditContentModal from '../../components/shared/EditContentModal';
import { Icons } from '../../components/shared/Icons';
import { detectMediaType } from '../../utils/mediaHelper';
import './LectureDetailWithQuiz.css';

/**
 * LectureDetailWithQuiz Component
 * 
 * Example of how to use AI Quiz Generation in a lecture detail view
 * This component shows:
 * 1. Lecture details
 * 2. Generate Quiz button (for professors)
 * 3. List of generated quizzes
 * 4. Quiz display and submission
 */
const LectureDetailWithQuiz = () => {
  const params = useParams();
  const lectureId = params.lectureId || params.id;
  const { user } = useAuth();
  
  const [lecture, setLecture] = useState(null);
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const quizSectionRef = React.useRef(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transcription, setTranscription] = useState(null);
  const [showTranscript, setShowTranscript] = useState(true);
  const [activeSegment, setActiveSegment] = useState(-1);
  const [showEditModal, setShowEditModal] = useState(false);
  const mediaRef = React.useRef(null);

  // Fetch lecture details
  useEffect(() => {
    fetchLecture();
  }, [lectureId]);

  const fetchLecture = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/lectures/${lectureId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch lecture');
      }

      const data = await response.json();
      setLecture(data.data);
      setQuizzes(data.data.quizzes || []);
      
      // Also fetch transcription separately if needed, or if already in lecture
      if (data.data.transcription) {
        setTranscription(data.data.transcription);
      } else {
        fetchTranscription();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTranscription = async () => {
    try {
      const response = await fetch(`/api/lectures/${lectureId}/transcription`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await response.json();
      setTranscription(data.transcription || { status: 'none' });
    } catch (err) {
      setTranscription({ status: 'none' });
    }
  };

  const seekTo = (time) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
      mediaRef.current.play();
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Sync transcription highlighted segment
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !transcription?.segments?.length) return;

    const handleTimeUpdate = () => {
      const currentTime = media.currentTime;
      const idx = transcription.segments.findIndex(
        (seg, i) => currentTime >= seg.start && (i === transcription.segments.length - 1 || currentTime < transcription.segments[i + 1].start)
      );
      setActiveSegment(idx);
    };

    media.addEventListener('timeupdate', handleTimeUpdate);
    return () => media.removeEventListener('timeupdate', handleTimeUpdate);
  }, [transcription]);

  useEffect(() => {
    if (selectedQuiz && quizSectionRef.current) {
      // Find the main scrollable container to avoid scrollIntoView body-shifting bugs
      const scrollable = document.querySelector('main');
      if (scrollable) {
        scrollable.scrollTo({
          top: quizSectionRef.current.offsetTop - 20,
          behavior: 'smooth'
        });
      }
    }
  }, [selectedQuiz]);

  const handleQuizGenerated = (newQuiz) => {
    setQuizzes(prev => [newQuiz, ...prev]);
    setSelectedQuiz(newQuiz); // Open preview modal after generation
    toast.success('Quiz generated! You can now edit and submit to students.');
  };

  const handlePublishQuiz = async () => {
    // For professors, the quiz is already published when generated
    // Just close the preview modal
    setSelectedQuiz(null);
    toast.success('Quiz is ready for students!');
  };

  if (loading) {
    return <div className="loading">Loading lecture details...</div>;
  }

  if (error) {
    return <div className="alert alert-error">Error: {error}</div>;
  }

  if (!lecture) {
    return <div className="alert alert-error">Lecture not found</div>;
  }

  const isProfessor = ['professor', 'dept_admin', 'inst_admin', 'super_admin'].includes(user?.role);

  const fileUrl = lecture.fileUrl || (lecture.file ? `${window.location.origin}/${lecture.file}` : '');
  const attachmentUrl = lecture.attachmentUrl ? (lecture.attachmentUrl.startsWith('http') ? lecture.attachmentUrl : `${window.location.origin}${lecture.attachmentUrl}`) : null;
  const { isVideo, isAudio, isPdf } = detectMediaType(lecture);

  return (
    <div className="lecture-detail-container pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-500 min-w-0">
          <Link to="/professor/my-lectures" className="hover:text-blue-600 shrink-0 font-medium">My Lectures</Link>
          <span className="shrink-0 text-gray-400">/</span>
          <span className="text-gray-900 font-semibold truncate">{lecture.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={() => setShowEditModal(true)}
            className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm shadow-blue-200"
          >
            <Icons.Edit className="w-3.5 h-3.5" /> Edit Lecture
          </button>
          <Link to="/professor/my-lectures" className="text-xs sm:text-sm text-blue-600 hover:underline px-1 py-1">
            ← Back to List
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Main Media Player */}
          <div className="bg-black rounded-xl shadow-xl overflow-hidden aspect-video border border-gray-800 flex items-center justify-center">
            {isVideo ? (
              <video ref={mediaRef} controls className="w-full h-full">
                <source src={fileUrl} />
              </video>
            ) : isAudio ? (
              <div className="w-full h-full bg-gradient-to-br from-blue-900 to-indigo-900 flex flex-col items-center justify-center">
                <Icons.Music className="w-16 h-16 text-blue-200 mb-4" />
                <audio ref={mediaRef} controls className="w-full max-w-md">
                   <source src={fileUrl} />
                </audio>
              </div>
            ) : isPdf ? (
              <div className="w-full h-[600px] flex flex-col bg-white">
                <div className="bg-gray-100 p-2 text-xs flex justify-between items-center border-b border-gray-200">
                  <span className="text-gray-600 font-medium font-sans">Lecture Document (PDF)</span>
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-bold font-sans">
                    Open in New Tab
                  </a>
                </div>
                <iframe src={fileUrl} className="flex-1 w-full" title={lecture.title} />
              </div>
            ) : (
              <div className="text-white flex flex-col items-center p-8">
                <p className="mb-4">No video preview available</p>
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary px-6">Download Material</a>
              </div>
            )}
          </div>

          <div className="lecture-section">
            <h1 className="lecture-title">{lecture.title}</h1>
            <div className="lecture-meta">
              {lecture.subject && (
                <span className="meta-item">
                  <strong>Subject:</strong> {lecture.subject}
                </span>
              )}
              {lecture.experimentTitle && (
                <span className="meta-item">
                  <strong>Experiment:</strong> {lecture.experimentTitle}
                </span>
              )}
              <span className="meta-item">
                <strong>Semester:</strong> {lecture.semester}
              </span>
              <span className="meta-item">
                <strong>Type:</strong> {lecture.type}
              </span>
            </div>

            {lecture.description && (
              <div className="lecture-description">
                <p>{lecture.description}</p>
              </div>
            )}

            {/* Attachment Section */}
            {attachmentUrl && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-4">
                  <Icons.FileText className="w-5 h-5 text-gray-900" />
                  <h3 className="font-semibold text-gray-900">Additional Material (PDF)</h3>
                </div>
                <div className="bg-gray-50 rounded-lg border border-gray-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Icons.File className="w-6 h-6 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{lecture.attachmentName || 'Lecture Material.pdf'}</p>
                      <p className="text-xs text-gray-600 mt-0.5">Click download to access the PDF</p>
                    </div>
                  </div>
                  <a 
                    href={attachmentUrl} 
                    download
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 w-full sm:w-auto"
                  >
                    <Icons.Download className="w-4 h-4" /> Download
                  </a>
                </div>
              </div>
            )}

            {/* Speech-to-Speech Audio Track Management */}
            <div style={{ marginTop: '20px', marginBottom: '20px' }}>
              <AudioTrackManager lectureId={lectureId} role="professor" mediaRef={mediaRef} />
            </div>

            {/* Language Analysis Section */}
            {lecture.languageAnalysis && (
              <div style={{ marginTop: '20px', marginBottom: '20px' }}>
                <LanguageChart data={lecture.languageAnalysis} />
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Transcription Sidebar */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full max-h-[600px]">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-sm">Transcription</h3>
              <div className={`status-badge-small ${transcription?.status || 'none'}`}>
                 {transcription?.status === 'completed' ? 'Available' : transcription?.status === 'processing' ? 'Processing' : 'None'}
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {transcription?.segments?.length > 0 ? (
                transcription.segments.map((seg, idx) => (
                  <div 
                    key={idx}
                    onClick={() => seekTo(seg.start)}
                    className={`p-2 rounded-lg cursor-pointer transition-colors border-l-2 ${
                      activeSegment === idx ? 'bg-blue-50 border-blue-500' : 'hover:bg-gray-50 border-transparent'
                    }`}
                  >
                    <span className="text-[10px] font-mono text-blue-600 font-bold block mb-1">{formatTime(seg.start)}</span>
                    <p className="text-xs text-gray-700 leading-relaxed">{seg.text}</p>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-gray-400">
                   <p className="text-xs">No transcription available yet</p>
                </div>
              )}
            </div>
          </div>

          {/* AI Management Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 space-y-4">
             <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">AI Actions</h3>
             {isProfessor && (
               <div className="space-y-2">
                 {transcription?.status === 'completed' ? (
                   <button
                     className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-2"
                     onClick={() => setShowGenerateModal(true)}
                   >
                     <Icons.Bot className="w-4 h-4" /> Generate Quiz
                   </button>
                 ) : (
                   <div className="p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                     Wait for transcription to finish for AI features.
                   </div>
                 )}
               </div>
             )}
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-gray-200 pt-8">
        <GenerateQuizModal
          isOpen={showGenerateModal}
          lecture={lecture}
          onClose={() => setShowGenerateModal(false)}
          onQuizGenerated={handleQuizGenerated}
        />
      </div>

      {/* Quizzes Section - UNIFIED VIEW */}
      <div className="quizzes-section" ref={quizSectionRef}>
        <h2>Quizzes</h2>

        {quizzes.length === 0 ? (
          <div className="no-quizzes">
            <p>{isProfessor ? 'No quizzes generated yet.' : 'No quizzes available.'}</p>
            {isProfessor && <p>Click the "Generate Quiz with AI" button above to create one.</p>}
          </div>
        ) : selectedQuiz ? (
          <div className="selected-quiz">
            <button
              className="btn btn-secondary"
              onClick={() => setSelectedQuiz(null)}
            >
              ← Back to Quiz List
            </button>
            {!isProfessor && (
              <QuizDisplay
                quiz={selectedQuiz}
                onSubmit={() => {
                  toast.success('Quiz submitted successfully!');
                  setSelectedQuiz(null);
                }}
                showAnswers={false}
              />
            )}
          </div>
        ) : (
          <div className="quizzes-grid">
            {quizzes.map(quiz => (
              <div key={quiz._id} className="quiz-card">
                <div className="quiz-card-header">
                  <h3>{quiz.title}</h3>
                  {quiz.aiGenerated && (
                    <span className="badge-ai inline-flex items-center gap-1">
                      <Icons.Bot className="w-3.5 h-3.5" /> AI Generated
                    </span>
                  )}
                </div>

                <div className="quiz-card-meta">
                  <span>{quiz.questions.length} questions</span>
                  <span>{quiz.timeLimit} min</span>
                </div>

                {quiz.sourceLecture && (
                  <p className="quiz-source">
                    Generated from: {quiz.sourceLecture.title}
                  </p>
                )}

                <button
                  className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
                  onClick={() => setSelectedQuiz(quiz)}
                >
                  {isProfessor ? <><Icons.Eye className="w-3.5 h-3.5" /> Preview & Publish</> : 'Take Quiz'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Quiz Preview Modal for Professor */}
        {isProfessor && selectedQuiz && (
          <QuizPreviewForProfessor
            quiz={selectedQuiz}
            onPublish={handlePublishQuiz}
            onClose={() => setSelectedQuiz(null)}
          />
        )}
      </div>

      {showEditModal && (
        <EditContentModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          content={lecture}
          onUpdate={(updated) => setLecture(updated)}
        />
      )}
    </div>
  );
};

export default LectureDetailWithQuiz;
