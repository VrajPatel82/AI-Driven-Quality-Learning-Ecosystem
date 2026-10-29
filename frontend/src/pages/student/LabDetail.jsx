import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { lecturesAPI, quizzesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import TranscriptViewer from '../../components/shared/TranscriptViewer';
import LectureSideNavigation from '../../components/shared/LectureSideNavigation';
import LectureSidePanel from '../../components/shared/LectureSidePanel';
import { Icons } from '../../components/shared/Icons';
import { FiChevronDown } from 'react-icons/fi';
import { detectMediaType } from '../../utils/mediaHelper';
import toast from 'react-hot-toast';

// Format seconds to MM:SS
const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Get semester-specific subject display
const getSemesterSubjectDisplay = (lab, userSemester) => {
  if (!lab.subject) return null;
  const semesterLabel = lab.semester === userSemester ? 'Current Semester' : `Semester ${lab.semester}`;
  return `${lab.subject} (${semesterLabel})`;
};

export default function StudentLabDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [lab, setLab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transcription, setTranscription] = useState(null);
  const [relatedQuizzes, setRelatedQuizzes] = useState([]);
  const [quizzesLoading, setQuizzesLoading] = useState(false);
  const [importantQuestions, setImportantQuestions] = useState([]);
  const [iqLoading, setIqLoading] = useState(false);
  const [iqGenerated, setIqGenerated] = useState(false);
  const [expandedQ, setExpandedQ] = useState({});
  const [activePanel, setActivePanel] = useState(null); // null | 'ai' | 'audio' | 'files'
  const mediaRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    fetchLab();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchLab = async () => {
    try {
      const res = await lecturesAPI.getById(id);
      const labData = res.data.data || res.data.lecture || res.data;
      setLab(labData);
      fetchTranscription();
      fetchRelatedQuizzes(labData._id);
    } catch (err) {
      toast.error('Failed to load lab');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedQuizzes = async (labId) => {
    setQuizzesLoading(true);
    try {
      const res = await quizzesAPI.getAll({ limit: 50 });
      const allQuizzes = res.data.data || [];
      const related = allQuizzes.filter(q => q.aiGenerated && q.sourceLecture === labId);
      setRelatedQuizzes(related);
    } catch (err) {
      console.log('Could not fetch quizzes');
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
      toast.error(err.response?.data?.message || 'Failed to generate important questions');
    } finally {
      setIqLoading(false);
    }
  };

  const toggleQExpand = (idx) => {
    setExpandedQ(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const fetchTranscription = async () => {
    try {
      const res = await lecturesAPI.getTranscription(id);
      setTranscription(res.data.transcription || { status: 'none' });
    } catch (err) {
      setTranscription({ status: 'none' });
    }
  };

  const togglePanel = (panelId) => {
    setActivePanel((prev) => {
      const next = prev === panelId ? null : panelId;
      if (next && window.innerWidth < 1024) {
        setTimeout(() => {
          panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
      }
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  if (!lab) {
    return (
      <div className="text-center py-12">
        <p className="text-muted text-lg">Lab not found</p>
        <Link to="/student/labs" className="text-purple-600 hover:underline mt-2 inline-block">Back to Labs</Link>
      </div>
    );
  }

  const fileUrl = lab.fileUrl || (lab.file ? `${window.location.origin}/${lab.file}` : '');
  const attachmentUrl = lab.attachmentUrl ? (lab.attachmentUrl.startsWith('http') ? lab.attachmentUrl : `${window.location.origin}${lab.attachmentUrl}`) : null;
  const { isVideo, isAudio, isPdf } = detectMediaType(lab);
  const hasTranscription = transcription?.status === 'completed' && transcription?.text;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Breadcrumb Header */}
      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted min-w-0 overflow-hidden">
        <Link to="/student/labs" className="hover:text-purple-600 font-medium shrink-0">
          Labs
        </Link>
        <span className="text-slate-300 shrink-0">/</span>
        <span className="text-heading font-semibold truncate">{lab.title}</span>
      </div>

      {/* Main Layout: MEDIA PLAYER -> ACTIVE SIDE PANEL -> RIGHT NAVIGATION RAIL */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 items-start relative">
        
        {/* 1. LAB MEDIA PLAYER & MAIN CONTENT AREA */}
        <div className="flex-1 min-w-0 space-y-4 sm:space-y-6 w-full">
          
          {/* Media Player */}
          <div className="relative bg-surface rounded-card shadow-card border border-border overflow-hidden">
            {isVideo ? (
              <div className="w-full aspect-video max-h-[500px] bg-black flex items-center justify-center">
                <video ref={mediaRef} controls className="w-full h-full object-contain">
                  <source src={fileUrl} />
                  Your browser does not support video playback.
                </video>
              </div>
            ) : isPdf ? (
              <div className="w-full h-[400px] sm:h-[550px] lg:h-[600px] flex flex-col bg-white">
                <div className="bg-slate-50 px-3 py-2 text-xs flex justify-between items-center border-b border-border">
                  <span className="text-slate-600 font-medium">Lab Document (PDF)</span>
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-600 hover:text-purple-700 font-semibold"
                  >
                    Open PDF in new tab ↗
                  </a>
                </div>
                <iframe src={fileUrl} className="flex-1 w-full border-0" title={lab.title} />
              </div>
            ) : isAudio ? (
              <div className="p-6 sm:p-8 flex justify-center bg-gradient-to-br from-purple-600 to-indigo-700">
                <audio ref={mediaRef} controls className="w-full max-w-lg shadow-md rounded-full">
                  <source src={fileUrl} />
                </audio>
              </div>
            ) : fileUrl ? (
              <div className="p-6 sm:p-8 text-center bg-slate-50 flex flex-col items-center justify-center min-h-[220px]">
                <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center mb-3">
                  <Icons.FileText className="w-6 h-6" />
                </div>
                <p className="text-heading font-semibold mb-1 text-sm sm:text-base break-words max-w-md">
                  {lab.fileName || 'Lab Material Document'}
                </p>
                <p className="text-xs text-muted mb-4">Click below to view or download</p>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-btn bg-purple-600 hover:bg-purple-700 text-white font-medium text-sm transition-all shadow-sm"
                >
                  <Icons.Download className="w-4 h-4" />
                  Open / Download Document
                </a>
              </div>
            ) : (
              <div className="h-48 sm:h-64 bg-gradient-to-br from-purple-500 via-purple-600 to-indigo-700 flex flex-col items-center justify-center text-white p-6 text-center">
                <Icons.Flask className="w-12 h-12 mb-2 text-white/90" />
                <p className="font-semibold text-base sm:text-lg">Virtual Lab Practical</p>
                <p className="text-xs text-purple-100 mt-1 max-w-xs">No media file uploaded for this session</p>
              </div>
            )}
          </div>

          {/* Lab Metadata Card */}
          <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6">
            <div className="space-y-3">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  {lab.semester && (
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      lab.semester === user?.currentSemester
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-purple-50 text-purple-700 border border-purple-200'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        lab.semester === user?.currentSemester ? 'bg-emerald-500' : 'bg-purple-500'
                      }`} />
                      Sem {lab.semester} {lab.semester === user?.currentSemester ? '• Current' : ''}
                    </span>
                  )}
                  {lab.course?.name && (
                    <span className="inline-flex items-center px-2.5 py-1 bg-slate-100 text-slate-700 text-xs rounded-full font-medium">
                      {lab.course.name}
                    </span>
                  )}
                </div>

                <h1 className="text-xl sm:text-2xl font-bold text-heading leading-tight break-words">
                  {lab.title}
                </h1>
              </div>

              {/* Experiment & Subject Details */}
              {(lab.experimentTitle || lab.subject) && (
                <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 pt-1 text-xs sm:text-sm">
                  {lab.experimentTitle && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-700 rounded-lg font-medium border border-purple-100">
                      <Icons.Flask className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-purple-900 font-semibold">Experiment:</span>
                      <span className="truncate">{lab.experimentTitle}</span>
                    </div>
                  )}
                  {lab.subject && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg font-medium border border-indigo-100">
                      <Icons.Clipboard className="w-3.5 h-3.5 shrink-0" />
                      <span>{getSemesterSubjectDisplay(lab, user?.currentSemester)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Metadata chips (Date, Instructor) */}
              <div className="flex flex-wrap items-center gap-3 pt-2 text-xs text-muted border-t border-border/70">
                <span className="inline-flex items-center gap-1.5">
                  <Icons.Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {new Date(lab.createdAt).toLocaleDateString(undefined, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                {lab.uploadedBy?.name && (
                  <span className="inline-flex items-center gap-1.5">
                    <Icons.User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Instructor: <strong className="font-semibold text-heading">{lab.uploadedBy.name}</strong></span>
                  </span>
                )}
              </div>
            </div>

            {/* Description */}
            {lab.description && (
              <div className="mt-4 pt-4 border-t border-border/70 text-body">
                <h3 className="font-semibold text-heading text-xs uppercase tracking-wider text-slate-500 mb-1.5">
                  Description
                </h3>
                <p className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-slate-700 break-words">
                  {lab.description}
                </p>
              </div>
            )}

            {/* Lab Manual Attachment */}
            {attachmentUrl && (
              <div className="mt-5 pt-5 border-t border-border">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                      <Icons.FileText className="w-4 h-4" />
                    </div>
                    <h3 className="font-semibold text-heading text-sm truncate">Lab Manual / Reference PDF</h3>
                  </div>
                  <a
                    href={attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs sm:text-sm font-semibold text-purple-600 hover:text-purple-700 hover:underline shrink-0"
                  >
                    Open in New Tab ↗
                  </a>
                </div>
                <div className="bg-slate-100 rounded-xl overflow-hidden border border-border h-[360px] sm:h-[480px]">
                  <iframe src={attachmentUrl} className="w-full h-full border-none" title="Lab Manual" />
                </div>
              </div>
            )}
          </div>

          {/* Shared Multi-Language Transcript Viewer */}
          {(isVideo || isAudio) && (
            <TranscriptViewer lectureId={id} />
          )}

          {/* AI Important Questions Section */}
          <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-border bg-slate-50/50">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                    <Icons.Lightbulb className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-heading text-sm sm:text-base leading-tight">AI Important Questions</h3>
                    <p className="text-xs text-muted truncate mt-0.5">Key lab exam questions & practical viva prompts</p>
                  </div>
                </div>
                {iqGenerated && importantQuestions.length > 0 && (
                  <span className="shrink-0 text-xs font-semibold text-purple-700 bg-purple-100 px-2.5 py-1 rounded-full">
                    {importantQuestions.length} Questions
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {!iqGenerated ? (
                <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center max-w-md mx-auto">
                  <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                    <Icons.Brain className="w-6 h-6" />
                  </div>
                  <h4 className="text-heading font-semibold text-sm sm:text-base mb-1">Generate Lab Viva Questions</h4>
                  <p className="text-xs sm:text-sm text-muted mb-4 leading-relaxed">
                    AI will analyze this lab's transcript and generate high-yield practical exam questions with thorough answers.
                  </p>
                  <button
                    onClick={handleGenerateImportantQuestions}
                    disabled={iqLoading || !hasTranscription}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-btn bg-purple-600 hover:bg-purple-700 text-white font-medium text-xs sm:text-sm transition-all shadow-sm disabled:opacity-50 min-h-[44px]"
                  >
                    {iqLoading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0"></span>
                        <span>Analyzing & Generating...</span>
                      </>
                    ) : (
                      <>
                        <Icons.Lightbulb className="w-4 h-4 shrink-0" />
                        <span>Generate Important Questions</span>
                      </>
                    )}
                  </button>
                  {!hasTranscription && (
                    <p className="text-xs text-amber-600 mt-2.5 flex items-center justify-center gap-1.5">
                      <Icons.Loader className="w-3.5 h-3.5 shrink-0" />
                      <span>Audio/video transcript must be processed first</span>
                    </p>
                  )}
                </div>
              ) : importantQuestions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Icons.FileText className="w-8 h-8 text-muted mb-2" />
                  <p className="text-sm text-muted">No questions could be generated for this lab.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {importantQuestions.map((item, idx) => (
                    <div
                      key={idx}
                      className="border border-border rounded-xl overflow-hidden transition-all hover:border-purple-300 bg-white"
                    >
                      <button
                        onClick={() => toggleQExpand(idx)}
                        className="w-full flex items-start gap-3 p-3.5 sm:p-4 text-left hover:bg-slate-50 transition-colors"
                      >
                        <span className="shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center text-xs font-bold mt-0.5">
                          {idx + 1}
                        </span>
                        <span className="flex-1 font-medium text-heading text-xs sm:text-sm leading-relaxed">
                          {item.question}
                        </span>
                        <FiChevronDown
                          className={`text-slate-400 transition-transform shrink-0 mt-1 w-4 h-4 ${
                            expandedQ[idx] ? 'rotate-180 text-purple-600' : ''
                          }`}
                        />
                      </button>
                      {expandedQ[idx] && (
                        <div className="px-3.5 sm:px-4 pb-3.5 pt-0">
                          <div className="bg-purple-50/70 border-l-4 border-purple-500 rounded-r-lg p-3 sm:p-3.5 ml-8 sm:ml-9 text-xs sm:text-sm text-slate-700 leading-relaxed">
                            {item.answer}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  <div className="flex justify-center pt-3 border-t border-border/70">
                    <button
                      onClick={handleGenerateImportantQuestions}
                      disabled={iqLoading}
                      className="text-xs sm:text-sm text-purple-600 hover:text-purple-800 font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 py-2 px-3 rounded-lg hover:bg-purple-50 min-h-[44px]"
                    >
                      {iqLoading ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin shrink-0"></span>
                          <span>Regenerating...</span>
                        </>
                      ) : (
                        <>
                          <Icons.RefreshCw className="w-3.5 h-3.5 shrink-0" />
                          <span>Regenerate Questions</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* AI-Generated Quizzes Section */}
          <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-border bg-slate-50/50">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                    <Icons.Bot className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-heading text-sm sm:text-base leading-tight">AI-Generated Quizzes</h3>
                    <p className="text-xs text-muted truncate mt-0.5">Test your practical understanding</p>
                  </div>
                </div>
                {relatedQuizzes.length > 0 && (
                  <span className="shrink-0 text-xs font-semibold text-indigo-700 bg-indigo-100 px-2.5 py-1 rounded-full">
                    {relatedQuizzes.length} Quizzes
                  </span>
                )}
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {quizzesLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                  <span className="ml-3 text-xs sm:text-sm text-muted">Loading quizzes...</span>
                </div>
              ) : relatedQuizzes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center max-w-sm mx-auto">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
                    <Icons.FileEdit className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-medium text-heading">No quizzes available for this lab yet</p>
                  <p className="text-xs text-muted mt-1">
                    When quizzes are generated from this lab material, they will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {relatedQuizzes.map((quiz) => (
                    <Link
                      key={quiz._id}
                      to={`/student/quiz/${quiz._id}`}
                      className="group block p-3.5 sm:p-4 border border-border rounded-xl hover:border-purple-400 hover:bg-purple-50/50 transition-all shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-semibold text-heading text-xs sm:text-sm group-hover:text-purple-700 transition-colors truncate">
                            {quiz.title}
                          </h4>
                          <p className="text-xs text-muted mt-1 flex items-center gap-2">
                            <span>{quiz.questions?.length || 0} questions</span>
                            <span>•</span>
                            <span>{quiz.timeLimit || 30} mins</span>
                          </p>
                        </div>
                        <span className="shrink-0 text-xs sm:text-sm font-semibold text-purple-600 group-hover:translate-x-0.5 transition-transform inline-flex items-center gap-1">
                          Start Quiz →
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. ACTIVE SIDE PANEL (Opens BETWEEN Media Player and Navigation Rail on Desktop, inline on Mobile) */}
        {activePanel && (
          <div ref={panelRef} className="w-full lg:w-[380px] xl:w-[420px] lg:h-[650px] flex-shrink-0 transition-all duration-300">
            <LectureSidePanel
              activePanel={activePanel}
              onClose={() => setActivePanel(null)}
              lecture={lab}
              user={user}
              mediaRef={mediaRef}
            />
          </div>
        )}

        {/* 3. RIGHT NAVIGATION RAIL (Fixed on FAR RIGHT on Desktop, Sticky Bottom on Mobile) */}
        <div className="w-full lg:w-16 flex-shrink-0 sticky bottom-2 lg:bottom-auto lg:top-4 z-20">
          <LectureSideNavigation
            activePanel={activePanel}
            onToggle={togglePanel}
          />
        </div>

      </div>
    </div>
  );
}
