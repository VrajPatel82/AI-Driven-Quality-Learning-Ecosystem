import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { lecturesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import LanguageChart from '../../components/shared/LanguageChart';
import TranscriptViewer from '../../components/shared/TranscriptViewer';
import AudioTrackManager from '../../components/shared/AudioTrackManager';
import LectureSideNavigation from '../../components/shared/LectureSideNavigation';
import LectureSidePanel from '../../components/shared/LectureSidePanel';
import { Icons } from '../../components/shared/Icons';
import { detectMediaType } from '../../utils/mediaHelper';
import toast from 'react-hot-toast';

// Format seconds to MM:SS
const formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Get semester-specific subject display
const getSemesterSubjectDisplay = (lecture, userSemester) => {
  if (!lecture.subject) return null;
  const semesterLabel = lecture.semester === userSemester ? 'Current Semester' : `Semester ${lecture.semester}`;
  return `${lecture.subject} (${semesterLabel})`;
};

export default function StudentLectureDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [lecture, setLecture] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transcription, setTranscription] = useState(null);
  const [transcriptionLoading, setTranscriptionLoading] = useState(false);
  const [activeSegment, setActiveSegment] = useState(-1);
  const [activePanel, setActivePanel] = useState(null); // null | 'ai' | 'audio' | 'files'
  const [userReaction, setUserReaction] = useState(null); // 'like' | 'dislike' | null
  const [reported, setReported] = useState(false);
  const mediaRef = useRef(null);

  useEffect(() => {
    fetchLecture();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchLecture = async () => {
    try {
      const res = await lecturesAPI.getById(id);
      const lectureData = res.data.data || res.data.lecture || res.data;
      setLecture(lectureData);
      fetchTranscription();
    } catch (err) {
      toast.error('Failed to load lecture');
    } finally {
      setLoading(false);
    }
  };

  const fetchTranscription = async () => {
    setTranscriptionLoading(true);
    try {
      const res = await lecturesAPI.getTranscription(id);
      setTranscription(res.data.transcription || { status: 'none' });
    } catch (err) {
      setTranscription({ status: 'none' });
    } finally {
      setTranscriptionLoading(false);
    }
  };

  const handleLike = () => {
    if (userReaction === 'like') {
      setUserReaction(null);
      toast('Removed reaction');
    } else {
      setUserReaction('like');
      toast.success('Liked lecture');
    }
  };

  const handleDislike = () => {
    if (userReaction === 'dislike') {
      setUserReaction(null);
      toast('Removed reaction');
    } else {
      setUserReaction('dislike');
      toast.success('Disliked lecture');
    }
  };

  const handleReport = () => {
    if (reported) {
      toast('Lecture already reported');
    } else {
      setReported(true);
      toast.success('Lecture reported to administration');
    }
  };

  const panelRef = useRef(null);

  const togglePanel = (panelId) => {
    setActivePanel((prev) => {
      const next = prev === panelId ? null : panelId;
      if (next && window.innerWidth < 1024) {
        setTimeout(() => {
          panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
      return next;
    });
  };

  useEffect(() => {
    const media = mediaRef.current;
    if (!media || !transcription?.segments?.length) return;

    const handleTimeUpdate = () => {
      const currentTime = media.currentTime;
      const idx = transcription.segments.findIndex(
        (seg) => currentTime >= seg.start && currentTime <= (seg.end + 0.3)
      );
      setActiveSegment(idx);
    };

    media.addEventListener('timeupdate', handleTimeUpdate);
    return () => media.removeEventListener('timeupdate', handleTimeUpdate);
  }, [transcription]);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!lecture) {
    return (
      <div className="text-center py-12">
        <p className="text-muted text-lg">Lecture not found</p>
        <Link to="/student/lectures" className="text-blue-600 hover:underline mt-2 inline-block">Back to Lectures</Link>
      </div>
    );
  }

  const fileUrl = lecture.fileUrl || (lecture.file ? `${window.location.origin}/${lecture.file}` : '');
  const attachmentUrl = lecture.attachmentUrl ? (lecture.attachmentUrl.startsWith('http') ? lecture.attachmentUrl : `${window.location.origin}${lecture.attachmentUrl}`) : null;
  const { isVideo, isAudio, isPdf } = detectMediaType(lecture);

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Breadcrumb Header */}
      <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-muted min-w-0 overflow-hidden">
        <Link to="/student/lectures" className="hover:text-blue-600 font-medium shrink-0">Lectures</Link>
        <span className="text-slate-300 shrink-0">/</span>
        <span className="text-heading font-semibold truncate">{lecture.title}</span>
      </div>

      {/* Main Layout: VIDEO -> ACTIVE SIDE PANEL -> RIGHT NAVIGATION RAIL */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 items-start relative">
        
        {/* 1. LECTURE VIDEO & MAIN CONTENT AREA */}
        <div className="flex-1 min-w-0 space-y-4 sm:space-y-6 w-full">
          
          {/* Video / Media Player */}
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
                  <span className="text-slate-600 font-medium">Lecture Document (PDF)</span>
                  <a
                    href={fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 font-semibold"
                  >
                    Open PDF in new tab ↗
                  </a>
                </div>
                <iframe src={fileUrl} className="flex-1 w-full border-0" title={lecture.title} />
              </div>
            ) : isAudio ? (
              <div className="p-6 sm:p-8 flex justify-center bg-gradient-to-br from-blue-600 to-indigo-700">
                <audio ref={mediaRef} controls className="w-full max-w-lg shadow-md rounded-full">
                  <source src={fileUrl} />
                  Your browser does not support audio playback.
                </audio>
              </div>
            ) : fileUrl ? (
              <div className="p-6 sm:p-8 text-center bg-slate-50 flex flex-col items-center justify-center min-h-[220px]">
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-3">
                  <Icons.FileText className="w-6 h-6" />
                </div>
                <p className="text-heading font-semibold mb-1 text-sm sm:text-base break-words max-w-md">
                  {lecture.fileName || 'Lecture Material'}
                </p>
                <p className="text-xs text-muted mb-4">Click below to view or download</p>
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-btn bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm transition-all shadow-sm"
                >
                  <Icons.FileText className="w-4 h-4" />
                  Open / Download Document
                </a>
              </div>
            ) : (
              <div className="h-48 sm:h-64 bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center text-white">
                <Icons.Video className="w-14 h-14 text-white" />
              </div>
            )}
          </div>

          {/* Lecture Info & Actions: Like, Dislike, Report */}
          <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h1 className="text-lg sm:text-2xl font-bold text-heading leading-tight">{lecture.title}</h1>
                {lecture.subject && (
                  <p className="text-xs sm:text-sm text-muted mt-1 font-medium flex items-center gap-1.5">
                    <Icons.Book className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>{getSemesterSubjectDisplay(lecture, user?.currentSemester)}</span>
                  </p>
                )}
              </div>

              {/* Action Buttons: Like, Dislike, Report */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleLike}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[36px] ${
                    userReaction === 'like'
                      ? 'bg-blue-50 border-blue-400 text-blue-700 shadow-xs'
                      : 'border-border hover:bg-slate-50 text-heading'
                  }`}
                >
                  <Icons.ThumbsUp className="w-3.5 h-3.5" />
                  <span>Like</span>
                </button>
                <button
                  type="button"
                  onClick={handleDislike}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[36px] ${
                    userReaction === 'dislike'
                      ? 'bg-red-50 border-red-400 text-red-700 shadow-xs'
                      : 'border-border hover:bg-slate-50 text-heading'
                  }`}
                >
                  <Icons.ThumbsDown className="w-3.5 h-3.5" />
                  <span>Dislike</span>
                </button>
                <button
                  type="button"
                  onClick={handleReport}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[36px] ${
                    reported
                      ? 'bg-amber-50 border-amber-400 text-amber-700 shadow-xs'
                      : 'border-border hover:bg-slate-50 text-heading'
                  }`}
                >
                  <Icons.Flag className="w-3.5 h-3.5" />
                  <span>{reported ? 'Reported' : 'Report'}</span>
                </button>
              </div>
            </div>

            {lecture.semester && (
              <div className={`mb-3.5 p-2.5 sm:p-3 rounded-xl border ${
                lecture.semester === user?.currentSemester
                  ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                  : 'bg-blue-50/70 border-blue-200 text-blue-900'
              }`}>
                <div className="flex items-center gap-2.5">
                  <span className={`w-6 h-6 sm:w-7 sm:h-7 rounded-lg font-bold text-xs flex items-center justify-center border shrink-0 ${
                    lecture.semester === user?.currentSemester
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-blue-100 text-blue-800 border-blue-300'
                  }`}>
                    {lecture.semester}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-xs sm:text-sm truncate">
                      Semester {lecture.semester} {lecture.semester === user?.currentSemester ? '(Your Current Semester)' : '(Previous Semester)'}
                    </p>
                    <p className="text-[11px] sm:text-xs opacity-75">
                      {['', 'First Year', 'First Year', 'Second Year', 'Second Year', 'Third Year', 'Third Year', 'Fourth Year', 'Fourth Year'][lecture.semester]} Content
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2 mt-3">
              {lecture.course?.name && (
                <span className="px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-100/80 text-xs font-medium rounded-lg truncate max-w-[200px]">
                  {lecture.course.name}
                </span>
              )}
              <span className="px-2.5 py-1 bg-slate-50 text-slate-600 border border-slate-200 text-xs font-medium rounded-lg">
                {new Date(lecture.createdAt).toLocaleDateString()}
              </span>
              {lecture.uploadedBy?.name && (
                <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-100/80 text-xs font-medium rounded-lg truncate max-w-[200px]">
                  By {lecture.uploadedBy.name}
                </span>
              )}
            </div>

            {lecture.description && (
              <div className="mt-3.5 pt-3.5 border-t border-border/70 text-body">
                <h3 className="font-semibold text-heading text-xs sm:text-sm mb-1 uppercase tracking-wider text-slate-500">
                  Description
                </h3>
                <p className="whitespace-pre-wrap text-xs sm:text-sm leading-relaxed text-slate-700 break-words">
                  {lecture.description}
                </p>
              </div>
            )}
          </div>

          {/* Language Analysis Section */}
          {lecture.languageAnalysis && (
            <LanguageChart data={lecture.languageAnalysis} />
          )}

          {/* Transcript Viewer Section */}
          {(isVideo || isAudio) && (
            <TranscriptViewer lectureId={id} />
          )}
        </div>

        {/* 2. ACTIVE SIDE PANEL (Opens BETWEEN Video Player and Navigation Rail on Desktop, inline on Mobile) */}
        {activePanel && (
          <div ref={panelRef} className="w-full lg:w-[380px] xl:w-[420px] lg:h-[650px] flex-shrink-0 transition-all duration-300">
            <LectureSidePanel
              activePanel={activePanel}
              onClose={() => setActivePanel(null)}
              lecture={lecture}
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
