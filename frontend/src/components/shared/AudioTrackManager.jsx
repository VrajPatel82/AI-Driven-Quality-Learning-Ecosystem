import { useState, useEffect, useRef } from 'react';
import { lecturesAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Icons } from './Icons';

export default function AudioTrackManager({ lectureId, role = 'professor', mediaRef = null }) {
  const [sourceLanguage, setSourceLanguage] = useState('English');
  const [audioTracks, setAudioTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState({});
  const [activeTrack, setActiveTrack] = useState(null);

  const audioPlayerRef = useRef(null);
  const ALL_LANGUAGES = ['English', 'Hindi', 'Gujarati'];

  const getBaseUrl = (url) => {
    if (!url || typeof url !== 'string') return '';
    return url.split('?')[0];
  };

  useEffect(() => {
    if (!lectureId) return;
    fetchAudioTracks();
  }, [lectureId]);

  // Smart polling: only poll when at least one track is non-terminal (processing/pending) or being generated
  useEffect(() => {
    if (!lectureId) return;

    const hasPending = audioTracks.some(t => t.status === 'processing' || t.status === 'pending') ||
                      Object.values(generating).some(Boolean);

    if (!hasPending) return;

    const interval = setInterval(() => {
      fetchAudioTracks(true);
    }, 4000);

    return () => clearInterval(interval);
  }, [lectureId, audioTracks, generating]);

  // Audio synchronization with video media player
  useEffect(() => {
    const video = mediaRef?.current;
    const audio = audioPlayerRef?.current;
    if (!video || !audio || !activeTrack) return;

    const handlePlay = () => {
      video.muted = true;
      audio.currentTime = video.currentTime;
      audio.play().catch(() => {});
    };

    const handlePause = () => {
      audio.pause();
    };

    const handleSeeking = () => {
      audio.currentTime = video.currentTime;
    };

    const handleRateChange = () => {
      audio.playbackRate = video.playbackRate;
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeking', handleSeeking);
    video.addEventListener('ratechange', handleRateChange);

    // Initial sync
    if (!video.paused) {
      video.muted = true;
      audio.currentTime = video.currentTime;
      audio.play().catch(() => {});
    }

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('seeking', handleSeeking);
      video.removeEventListener('ratechange', handleRateChange);
      video.muted = false;
    };
  }, [mediaRef, activeTrack]);

  const fetchAudioTracks = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const res = await lecturesAPI.getAudioTracks(lectureId);
      setSourceLanguage(res.data.sourceLanguage || 'English');
      const incomingTracks = res.data.audioTracks || [];

      setAudioTracks(prevTracks => {
        return incomingTracks.map(newTrack => {
          const prevTrack = prevTracks.find(p =>
            (p._id && newTrack._id && p._id === newTrack._id) ||
            (p.language && newTrack.language && p.language.toLowerCase() === newTrack.language.toLowerCase())
          );

          // Preserve existing audioUrl if the physical file (base URL) hasn't changed and track was already completed
          if (
            prevTrack &&
            prevTrack.status === 'completed' &&
            newTrack.status === 'completed' &&
            prevTrack.audioUrl &&
            newTrack.audioUrl &&
            getBaseUrl(prevTrack.audioUrl) === getBaseUrl(newTrack.audioUrl)
          ) {
            return {
              ...newTrack,
              audioUrl: prevTrack.audioUrl
            };
          }

          return newTrack;
        });
      });
    } catch (err) {
      if (!isBackground) console.error('Failed to load audio tracks:', err);
    } finally {
      if (!isBackground) setLoading(false);
    }
  };

  const handleGenerate = async (targetLang) => {
    setGenerating(prev => ({ ...prev, [targetLang]: true }));
    try {
      await lecturesAPI.generateAudio(lectureId, targetLang);
      toast.success(`Started Speech-to-Speech generation for ${targetLang}`);
      fetchAudioTracks(true);
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to start audio generation for ${targetLang}`);
    } finally {
      setGenerating(prev => ({ ...prev, [targetLang]: false }));
    }
  };

  const handleDelete = async (targetLang) => {
    if (!window.confirm(`Delete ${targetLang} audio track? This will reclaim storage usage.`)) return;
    try {
      await lecturesAPI.deleteAudio(lectureId, targetLang);
      if (activeTrack?.language === targetLang) {
        setActiveTrack(null);
      }
      toast.success(`${targetLang} audio track deleted`);
      fetchAudioTracks(true);
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to delete ${targetLang} audio`);
    }
  };

  const isProfessorOrAdmin = ['professor', 'dept_admin', 'inst_admin', 'super_admin'].includes(role);
  const isSupportedSource = ALL_LANGUAGES.some(l => l.toLowerCase() === sourceLanguage.toLowerCase());
  const targetLanguages = isSupportedSource
    ? ALL_LANGUAGES.filter(l => l.toLowerCase() !== sourceLanguage.toLowerCase())
    : [];

  if (loading) {
    return (
      <div className="bg-surface rounded-card border border-border p-4 flex items-center justify-center h-24">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-card shadow-card border border-border p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between border-b border-border pb-3 gap-2">
        <div>
          <h3 className="font-semibold text-heading text-base flex items-center gap-2">
            <Icons.Mic className="w-5 h-5 text-indigo-600 inline" /> Speech-to-Speech Multilingual Audio
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Original Spoken Language: <span className="font-bold text-blue-600 px-2 py-0.5 bg-blue-50 rounded-full">{sourceLanguage}</span>
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 bg-purple-100 text-purple-800 rounded-full font-medium">
          V1 Multilingual Engine
        </span>
      </div>

      {!isSupportedSource && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 font-medium flex items-start gap-2">
          <Icons.AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <span>Audio translation is not available for {sourceLanguage} lectures. Supported source languages are English, Hindi, and Gujarati.</span>
        </div>
      )}

      {isSupportedSource && (
        <div className="flex flex-col gap-3">
          {targetLanguages.map(targetLang => {
            const track = audioTracks.find(t => t.language.toLowerCase() === targetLang.toLowerCase());
            const isProcessing = track?.status === 'processing' || generating[targetLang];
            const isReady = track?.status === 'completed';
            const isFailed = track?.status === 'failed';
            const isSelected = activeTrack?.language === targetLang;

            return (
              <div
                key={targetLang}
                className={`border rounded-lg p-3 flex flex-col justify-between gap-2 transition-all ${
                  isSelected ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-200' : 'border-border bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm text-heading flex items-center gap-1.5 min-w-0">
                    <Icons.Globe className="w-4 h-4 text-blue-600 shrink-0" />
                    <span className="truncate">{targetLang} Audio</span>
                  </span>
                  {isReady && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1 shrink-0">
                      <Icons.Check className="w-3 h-3" /> Ready
                    </span>
                  )}
                  {isProcessing && (
                    <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 shrink-0">
                      <span className="w-2 h-2 rounded-full bg-amber-600 animate-ping"></span> Generating...
                    </span>
                  )}
                  {isFailed && (
                    <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-semibold shrink-0" title={track?.error}>
                      Failed
                    </span>
                  )}
                  {!track && !isProcessing && (
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                      Not Generated
                    </span>
                  )}
                </div>

                {isReady && track.audioUrl && (
                  <div className="mt-1 space-y-2">
                    <audio
                      ref={isSelected ? audioPlayerRef : null}
                      controls
                      className="w-full h-8"
                      src={track.audioUrl}
                    />
                    {mediaRef && (
                      <button
                        onClick={() => setActiveTrack(isSelected ? null : track)}
                        className={`w-full py-1 text-xs font-semibold rounded transition-colors ${
                          isSelected
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-blue-600 text-blue-600 hover:bg-blue-50'
                        }`}
                      >
                        {isSelected ? (
                          <span className="inline-flex items-center justify-center gap-1.5"><Icons.Check className="w-3.5 h-3.5" /> Synced with Video</span>
                        ) : (
                          <span className="inline-flex items-center justify-center gap-1.5"><Icons.Link className="w-3.5 h-3.5" /> Sync Audio with Video</span>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {isProfessorOrAdmin && (
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-gray-200 mt-1">
                    {!isReady && !isProcessing && !isFailed && (
                      <button
                        onClick={() => handleGenerate(targetLang)}
                        disabled={isProcessing}
                        className="btn-primary w-full sm:w-auto py-2 sm:py-1 px-4 text-xs font-semibold flex items-center justify-center min-h-[38px] sm:min-h-0"
                      >
                        + Generate {targetLang} Audio
                      </button>
                    )}
                    {isReady && (
                      <button
                        onClick={() => handleDelete(targetLang)}
                        className="text-xs text-red-600 hover:text-red-800 font-medium hover:underline py-1.5 sm:py-0 text-center"
                      >
                        Delete Audio
                      </button>
                    )}
                    {isFailed && (
                      <button
                        onClick={() => handleGenerate(targetLang)}
                        className="btn-primary w-full sm:w-auto py-2 sm:py-1 px-4 text-xs font-semibold bg-amber-600 hover:bg-amber-700 flex items-center justify-center min-h-[38px] sm:min-h-0"
                      >
                        Retry Generation
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
