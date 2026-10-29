import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { lecturesAPI, quizzesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import toast from 'react-hot-toast';
import GenerateQuizModal from '../../components/quiz/GenerateQuizModal';
import QuizDisplay from '../../components/quiz/QuizDisplay';
import EditContentModal from '../../components/shared/EditContentModal';
import { Icons } from '../../components/shared/Icons';
import { detectMediaType } from '../../utils/mediaHelper';

// Format seconds to MM:SS
const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export default function ProfessorLabDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [lab, setLab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transcription, setTranscription] = useState(null);
  const [showTranscript, setShowTranscript] = useState(true);
  const [activeSegment, setActiveSegment] = useState(-1);
  
  const [relatedQuizzes, setRelatedQuizzes] = useState([]);
  const [quizzesLoading, setQuizzesLoading] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  
  const [importantQuestions, setImportantQuestions] = useState([]);
  const [iqLoading, setIqLoading] = useState(false);
  const [iqGenerated, setIqGenerated] = useState(false);
  const [expandedQ, setExpandedQ] = useState({});
  
  const mediaRef = useRef(null);
  const scrollSectionRef = useRef(null);

  useEffect(() => {
    fetchLab();
  }, [id]);

  const fetchLab = async () => {
    try {
      const res = await lecturesAPI.getById(id);
      const labData = res.data.data || res.data.lecture || res.data;
      setLab(labData);
      
      // Fetch transcription
      fetchTranscription();
      // Fetch quizzes
      fetchRelatedQuizzes(labData._id);
    } catch (err) {
      toast.error('Failed to load lab details');
    } finally {
      setLoading(false);
    }
  };

  const fetchTranscription = async () => {
    try {
      const res = await lecturesAPI.getTranscription(id);
      setTranscription(res.data.transcription || { status: 'none' });
    } catch (err) {
      setTranscription({ status: 'none' });
    }
  };

  const fetchRelatedQuizzes = async (labId) => {
    setQuizzesLoading(true);
    try {
      const res = await quizzesAPI.getAll({ limit: 50 });
      const allQuizzes = res.data.data || [];
      const related = allQuizzes.filter(q => q.sourceLecture === labId);
      setRelatedQuizzes(related);
    } catch (err) {
      console.error('Error fetching quizzes:', err);
    } finally {
      setQuizzesLoading(false);
    }
  };

  const handleGenerateImportantQuestions = async () => {
    setIqLoading(true);
    try {
      const res = await lecturesAPI.generateImportantQuestions(id);
      setImportantQuestions(res.data.questions || []);
      setIqGenerated(true);
      toast.success('Important questions generated!');
    } catch (err) {
      toast.error('Failed to generate questions');
    } finally {
      setIqLoading(false);
    }
  };

  const handleQuizGenerated = (newQuiz) => {
    setRelatedQuizzes(prev => [newQuiz, ...prev]);
    setShowGenerateModal(false);
    toast.success('Quiz generated successfully!');
  };

  const seekTo = (time) => {
    if (mediaRef.current) {
      mediaRef.current.currentTime = time;
      mediaRef.current.play();
    }
  };

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

  if (loading) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div></div>;
  }

  if (!lab) {
    return <div className="text-center py-12 text-muted">Lab not found</div>;
  }

  const fileUrl = lab.fileUrl || (lab.file ? `${window.location.origin}/${lab.file}` : '');
  const attachmentUrl = lab.attachmentUrl ? (lab.attachmentUrl.startsWith('http') ? lab.attachmentUrl : `${window.location.origin}${lab.attachmentUrl}`) : null;
  const { isVideo, isAudio, isPdf } = detectMediaType(lab);
  const hasTranscription = transcription?.status === 'completed' && transcription?.text;

  const renderImportantQuestions = () => (
    <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icons.Lightbulb className="w-5 h-5 text-amber-500 shrink-0" />
          <h3 className="font-semibold text-heading text-sm uppercase tracking-wider">Important Questions</h3>
        </div>
        {!iqGenerated && (
          <button 
            onClick={handleGenerateImportantQuestions}
            disabled={iqLoading || !hasTranscription}
            className="text-xs font-bold text-purple-600 hover:text-purple-800 disabled:opacity-50 py-1 px-2 rounded hover:bg-purple-50 transition-colors"
          >
            {iqLoading ? 'Generating...' : '+ Generate with AI'}
          </button>
        )}
      </div>
      <div className="p-4 sm:p-6">
        {!iqGenerated ? (
          <div className="text-center py-4">
            <p className="text-xs text-muted">Generate study questions from the transcript to help students</p>
          </div>
        ) : (
          <div className="space-y-3">
            {importantQuestions.map((q, idx) => (
              <div key={idx} className="border border-border rounded-lg overflow-hidden">
                <button 
                  onClick={() => setExpandedQ(prev => ({...prev, [idx]: !prev[idx]}))}
                  className="w-full text-left px-3 sm:px-4 py-3 text-sm font-medium text-heading hover:bg-gray-50 flex justify-between items-center gap-2"
                >
                  <span className="break-words">{idx+1}. {q.question}</span>
                  <span className="shrink-0 text-muted font-bold">{expandedQ[idx] ? '−' : '+'}</span>
                </button>
                {expandedQ[idx] && (
                  <div className="px-3 sm:px-4 pb-3 text-xs text-gray-600 bg-purple-50/70 p-3 border-t border-purple-100 break-words leading-relaxed">
                    {q.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2 text-xs sm:text-sm text-muted min-w-0">
          <Link to="/professor/my-labs" className="hover:text-purple-600 shrink-0 font-medium">My Labs</Link>
          <span className="shrink-0 text-gray-400">/</span>
          <span className="text-heading font-semibold truncate">{lab.title}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button 
            onClick={() => setShowEditModal(true)}
            className="text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm shadow-blue-200"
          >
            <Icons.Edit className="w-3.5 h-3.5" /> Edit Lab
          </button>
          <Link to="/professor/my-labs" className="text-xs sm:text-sm text-purple-600 hover:underline px-1 py-1">
            ← Back to List
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content (Left 2 Columns) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Video Player Section */}
          <div className="bg-black rounded-xl shadow-xl overflow-hidden aspect-video relative flex items-center justify-center border border-gray-800">
            {isVideo ? (
              <video ref={mediaRef} controls className="w-full h-full">
                <source src={fileUrl} />
              </video>
            ) : isAudio ? (
              <div className="p-8 w-full bg-gradient-to-br from-purple-900 to-indigo-900 flex flex-col items-center justify-center">
                <Icons.Mic className="w-16 h-16 text-purple-200 mb-4" />
                <audio ref={mediaRef} controls className="w-full max-w-md">
                  <source src={fileUrl} />
                </audio>
              </div>
            ) : isPdf ? (
              <div className="w-full h-[400px] sm:h-[600px] flex flex-col">
                <div className="bg-gray-100 p-2 text-xs flex justify-between items-center border-b border-gray-200">
                  <span className="text-gray-600">PDF Preview</span>
                  <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">Open in New Tab</a>
                </div>
                <iframe src={fileUrl} className="flex-1 w-full" title={lab.title} />
              </div>
            ) : (
              <div className="text-white text-center p-8">
                <p>Preview not available for this file type</p>
                <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="btn-primary mt-4 inline-block">Download File</a>
              </div>
            )}
          </div>

          {/* Lab Information */}
          <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6">
            <h1 className="text-xl sm:text-2xl font-bold text-heading break-words">{lab.title}</h1>
            <div className="flex flex-wrap gap-2 sm:gap-3 mt-3">
              <span className="px-2.5 sm:px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold">Semester {lab.semester}</span>
              <span className="px-2.5 sm:px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-semibold">{lab.course?.name || 'No Course'}</span>
              <span className="px-2.5 sm:px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-xs">{new Date(lab.createdAt).toLocaleDateString()}</span>
            </div>
            {lab.description && (
              <div className="mt-4">
                <h3 className="font-semibold text-heading mb-1 text-sm">Description</h3>
                <p className="text-gray-600 text-sm whitespace-pre-wrap break-words">{lab.description}</p>
              </div>
            )}
          </div>

          {/* Attachment / Lab Manual Section */}
          {attachmentUrl && (
            <div className="bg-white rounded-card shadow-card border border-border overflow-hidden">
              <div className="px-4 sm:px-6 py-3 border-b border-border bg-gray-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icons.FileText className="w-5 h-5 text-heading shrink-0" />
                  <h3 className="font-semibold text-heading text-xs sm:text-sm uppercase tracking-wider">Lab Manual / PDF</h3>
                </div>
                <a 
                  href={attachmentUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-xs font-bold text-purple-600 hover:text-purple-800"
                >
                  Open in New Tab
                </a>
              </div>
              <div className="p-0 h-[400px] sm:h-[500px]">
                <iframe src={attachmentUrl} className="w-full h-full border-none" title="Lab Manual" />
              </div>
            </div>
          )}

          {/* AI Important Questions Section (Desktop: in main left column) */}
          <div className="hidden lg:block">
            {renderImportantQuestions()}
          </div>
        </div>

        {/* Sidebar (Right 1 Column on Desktop, directly follows on Mobile) */}
        <div className="space-y-6">
          {/* Transcription Action Card */}
          <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border bg-gray-50 flex items-center justify-between">
              <h3 className="font-semibold text-heading text-sm">Transcript</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                transcription?.status === 'completed' ? 'bg-green-100 text-green-700' : 
                transcription?.status === 'processing' ? 'bg-amber-100 text-amber-700 animate-pulse' : 
                'bg-red-100 text-red-700'
              }`}>
                {transcription?.status || 'None'}
              </span>
            </div>
            <div className="p-4 max-h-[350px] sm:max-h-[400px] overflow-y-auto">
              {transcription?.segments?.length > 0 ? (
                <div className="space-y-3">
                  {transcription.segments.map((seg, idx) => (
                    <div 
                      key={idx} 
                      onClick={() => seekTo(seg.start)}
                      className={`p-2 rounded cursor-pointer transition-colors border-l-2 ${
                        activeSegment === idx ? 'bg-purple-50 border-purple-500' : 'hover:bg-gray-50 border-transparent'
                      }`}
                    >
                      <span className="text-[10px] font-mono text-purple-600 font-bold block mb-1">{formatTime(seg.start)}</span>
                      <p className="text-xs text-gray-700 leading-relaxed">{seg.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Icons.FileEdit className="w-8 h-8 mx-auto text-muted mb-2" />
                  <p className="text-xs text-muted">No transcription segments available</p>
                </div>
              )}
            </div>
          </div>

          {/* Quiz Management Card */}
          <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border bg-gray-50 flex items-center justify-between">
              <h3 className="font-semibold text-heading text-sm">Lab Quizzes</h3>
              <button 
                onClick={() => setShowGenerateModal(true)}
                disabled={!hasTranscription}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 disabled:opacity-50 py-1 px-2.5 rounded hover:bg-blue-50 transition-colors"
              >
                + Create New
              </button>
            </div>
            <div className="p-4">
               {quizzesLoading ? (
                 <div className="flex justify-center p-4"><div className="animate-spin h-5 w-5 border-b-2 border-blue-600 rounded-full"></div></div>
               ) : relatedQuizzes.length > 0 ? (
                 <div className="space-y-2">
                   {relatedQuizzes.map(quiz => (
                     <div 
                       key={quiz._id} 
                       onClick={() => setSelectedQuiz(quiz)}
                       className="p-3 border border-border rounded-lg hover:border-blue-300 cursor-pointer transition-colors group"
                     >
                        <h4 className="text-xs font-semibold text-heading group-hover:text-blue-600 truncate">{quiz.title}</h4>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-muted">
                           <span>{quiz.questions?.length || 0} Questions</span>
                           {quiz.aiGenerated && (
                             <span className="inline-flex items-center gap-1">
                               <Icons.Bot className="w-3 h-3 text-primary" /> AI
                             </span>
                           )}
                        </div>
                     </div>
                   ))}
                 </div>
               ) : (
                 <p className="text-xs text-center text-muted py-4">No quizzes created for this lab yet.</p>
               )}
            </div>
          </div>
        </div>
      </div>

      {/* AI Important Questions Section (Mobile: rendered in single vertical flow after Quizzes) */}
      <div className="lg:hidden">
        {renderImportantQuestions()}
      </div>

      {/* Modals */}
      {selectedQuiz && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4 md:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedQuiz(null);
          }}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[calc(100vh-2rem)] max-h-[calc(100dvh-2rem)] overflow-hidden"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quiz-preview-title"
          >
            {/* Modal Header */}
            <div className="px-4 py-3.5 sm:px-6 sm:py-4 border-b border-gray-100 flex items-start sm:items-center justify-between gap-3 bg-white rounded-t-2xl z-10 shrink-0">
              <div className="min-w-0 flex-1">
                <h2 id="quiz-preview-title" className="font-bold text-heading text-sm sm:text-base leading-snug break-words">
                  Quiz Preview: {selectedQuiz.title}
                </h2>
              </div>
              <button 
                type="button"
                onClick={() => setSelectedQuiz(null)} 
                aria-label="Close Quiz Preview"
                className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full flex items-center justify-center shrink-0 transition-colors"
              >
                <Icons.X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Scrollable Modal Content */}
            <div className="p-4 sm:p-6 overflow-y-auto flex-1 min-h-0 overscroll-contain">
              <QuizDisplay 
                quiz={{
                  ...selectedQuiz,
                  sourceLecture: (typeof selectedQuiz.sourceLecture === 'object' && selectedQuiz.sourceLecture?.title) 
                    ? selectedQuiz.sourceLecture 
                    : { title: lab?.title || 'Lab' }
                }} 
                showAnswers={true} 
              />
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 sm:px-6 sm:py-3.5 bg-gray-50/90 border-t border-gray-100 flex items-center justify-end rounded-b-2xl shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button 
                type="button"
                onClick={() => setSelectedQuiz(null)} 
                className="w-full sm:w-auto px-5 py-2.5 sm:py-2 text-xs sm:text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded-lg shadow-sm hover:shadow transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 active:bg-gray-100 text-center"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showGenerateModal && (
        <GenerateQuizModal 
          isOpen={showGenerateModal} 
          lecture={lab} 
          onClose={() => setShowGenerateModal(false)} 
          onQuizGenerated={handleQuizGenerated} 
        />
      )}

      {showEditModal && (
        <EditContentModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          content={lab}
          onUpdate={(updated) => setLab(updated)}
        />
      )}
    </div>
  );
}
