import React from 'react';
import LectureAIAssistantPanel from './LectureAIAssistantPanel';
import AudioTrackManager from './AudioTrackManager';
import { Icons } from './Icons';
import { detectMediaType } from '../../utils/mediaHelper';

/**
 * LectureSidePanel
 * Displays active panel content (AI, Audio, or Files) immediately to the LEFT of the navigation rail.
 */
export default function LectureSidePanel({
  activePanel,
  onClose,
  lecture,
  user,
  mediaRef
}) {
  if (!activePanel || !lecture) return null;

  const isLab = lecture.type === 'lab';
  const lectureId = lecture._id || lecture.id;
  const fileUrl = lecture.fileUrl || (lecture.file ? `${window.location.origin}/${lecture.file}` : '');
  const attachmentUrl = lecture.attachmentUrl
    ? (lecture.attachmentUrl.startsWith('http')
        ? lecture.attachmentUrl
        : `${window.location.origin}${lecture.attachmentUrl}`)
    : null;

  // Build list of professor-uploaded files ONLY
  const professorFiles = [];

  if (fileUrl) {
    const { isVideo, isAudio, isPdf } = detectMediaType(lecture);
    let typeLabel = isLab ? 'Lab Primary File' : 'Primary File';
    let icon = Icons.FileText;

    if (isVideo) {
      typeLabel = isLab ? 'Lab Video' : 'Lecture Video';
      icon = Icons.Film;
    } else if (isAudio) {
      typeLabel = isLab ? 'Lab Audio' : 'Lecture Audio';
      icon = Icons.Headphones;
    } else if (isPdf) {
      typeLabel = isLab ? 'Lab Document (PDF)' : 'Lecture Document (PDF)';
      icon = Icons.FileText;
    } else {
      typeLabel = isLab ? 'Lab Presentation/Document' : 'Lecture Presentation/Document';
      icon = Icons.BarChart;
    }

    professorFiles.push({
      id: 'primary-file',
      name: lecture.fileName || (isLab ? 'Lab Primary File' : 'Lecture Primary File'),
      url: fileUrl,
      typeLabel,
      icon
    });
  }

  if (attachmentUrl) {
    professorFiles.push({
      id: 'attachment-file',
      name: lecture.attachmentName || (isLab ? 'Lab Manual / Additional Material (PDF)' : 'Additional Lecture Material (PDF)'),
      url: attachmentUrl,
      typeLabel: isLab ? 'Lab Manual / Material (PDF)' : 'Additional Material (PDF)',
      icon: Icons.FileText,
      ext: 'pdf'
    });
  }

  const panelTitles = {
    ai: 'AI Tutor & Assistant',
    audio: 'Multilingual Audio Tracks',
    files: isLab ? 'Lab Materials & Manuals' : 'Lecture Materials'
  };

  return (
    <div className="h-[520px] sm:h-[580px] lg:h-full flex flex-col bg-surface rounded-card shadow-card border border-border overflow-hidden">
      {/* Panel Header */}
      <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 border-b border-border flex items-center justify-between bg-slate-50/80 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {activePanel === 'ai' && <Icons.Bot className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 font-bold shrink-0" />}
          {activePanel === 'audio' && <Icons.Headphones className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 font-bold shrink-0" />}
          {activePanel === 'files' && <Icons.Folder className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 font-bold shrink-0" />}
          <h2 className="font-bold text-heading text-xs sm:text-sm truncate">
            {panelTitles[activePanel]}
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="w-8 h-8 rounded-lg hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold shrink-0"
        >
          <Icons.X className="w-4 h-4" />
        </button>
      </div>

      {/* Panel Content Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activePanel === 'ai' && (
          <div className="h-full">
            <LectureAIAssistantPanel
              lectureTitle={lecture.title}
              lectureId={lectureId}
              isOpen={true}
              conversationKey={isLab ? `lab-${lectureId}` : `lecture-${lectureId}`}
            />
          </div>
        )}

        {activePanel === 'audio' && (
          <div className="p-3 sm:p-4">
            <AudioTrackManager
              lectureId={lectureId}
              role={user?.role || 'student'}
              mediaRef={mediaRef}
            />
          </div>
        )}

        {activePanel === 'files' && (
          <div className="p-3 sm:p-4 space-y-3">
            <p className="text-xs text-muted font-medium">
              Materials uploaded by the professor for this {isLab ? 'lab' : 'lecture'}:
            </p>

            {professorFiles.length === 0 ? (
              <div className="text-center py-10 text-muted bg-slate-50 rounded-xl border border-dashed border-slate-200">
                <Icons.Inbox className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p className="text-sm font-medium">No lecture materials uploaded</p>
                <p className="text-xs text-slate-400 mt-1">The professor has not attached additional files for this lecture.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {professorFiles.map((file) => {
                  const FileIcon = file.icon;
                  return (
                    <div
                      key={file.id}
                      className="p-2.5 sm:p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex items-center justify-between gap-2.5 hover:border-blue-300 transition-all"
                    >
                      <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
                        <FileIcon className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10.5px] sm:text-xs font-semibold text-blue-600 uppercase tracking-wider truncate">{file.typeLabel}</p>
                          <p className="text-xs sm:text-sm font-medium text-heading truncate mt-0.5">{file.name}</p>
                        </div>
                      </div>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        download
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-semibold rounded-lg flex items-center gap-1 transition-all shrink-0 min-h-[34px]"
                      >
                        <Icons.Download className="w-3.5 h-3.5" /> <span>Open</span>
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
