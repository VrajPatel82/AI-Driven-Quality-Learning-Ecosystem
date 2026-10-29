import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Icons } from './Icons';

/**
 * TranscriptViewer Component
 * Displays lecture transcript with timestamp synchronization
 * Supports multiple language translations displayed inline
 */
const TranscriptViewer = ({ lectureId }) => {
  const [transcript, setTranscript] = useState(null);
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [availableLanguages, setAvailableLanguages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [translating, setTranslating] = useState(false);

  // Fetch transcript on mount
  useEffect(() => {
    if (!lectureId) return;
    console.log(`[Transcript Viewer] Component mounted with lectureId: ${lectureId}`);
    fetchTranscript();
    fetchAvailableLanguages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectureId]);

  const fetchTranscript = async (language) => {
    try {
      setLoading(true);
      const targetLang = language || selectedLanguage || '';
      console.log(`[Transcript Viewer] Fetching transcript for language: "${targetLang}"`);
      
      const queryParam = targetLang ? `?language=${encodeURIComponent(targetLang)}` : '';
      const response = await api.get(`/transcripts/${lectureId}${queryParam}`);
      console.log(`[Transcript Viewer] Got response:`, response.data);
      
      setTranscript(response.data);
      if (response.data.currentLanguage) {
        setSelectedLanguage(response.data.currentLanguage);
      }
      setError(null);
    } catch (err) {
      console.error('[Transcript Viewer] Error fetching transcript:', err);
      setError(err.response?.data?.message || 'Failed to load transcript');
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableLanguages = async () => {
    try {
      console.log(`[Transcript Viewer] Fetching available languages...`);
      const response = await api.get(`/transcripts/${lectureId}/languages`);
      console.log(`[Transcript Viewer] Available languages:`, response.data.languages);
      setAvailableLanguages(response.data.languages);
    } catch (err) {
      console.error('[Transcript Viewer] Error fetching languages:', err);
      const defaults = [
        { name: 'Hindi', available: true, isOriginal: true },
        { name: 'English', available: true },
        { name: 'Gujarati', available: true }
      ];
      setAvailableLanguages(defaults);
    }
  };

  const handleLanguageChange = async (language) => {
    const lang = String(language || '').trim();
    console.log(`[Transcript Viewer] Language change requested: ${lang}`);
    
    if (!lang || lang === selectedLanguage) {
      return;
    }

    setSelectedLanguage(lang);
    await fetchTranscript(lang);
    await fetchAvailableLanguages();
  };

  const translateTranscript = async (targetLanguage) => {
    try {
      setTranslating(true);
      // Ensure targetLanguage is a string
      const lang = String(targetLanguage).trim();
      console.log(`[Transcript Viewer] Starting translation to ${lang}...`);
      
      const response = await api.post(`/transcripts/${lectureId}/translate`, {
        targetLanguage: lang
      });

      console.log(`[Transcript Viewer] Translation response:`, response.data);
      
      // Update transcript with translated segments
      if (response.data.translation && response.data.translation.segments) {
        console.log(`[Transcript Viewer] Updating UI with ${response.data.translation.segments.length} translated segments`);
        setTranscript(prev => ({
          ...prev,
          segments: response.data.translation.segments,
          currentLanguage: lang
        }));
      }
      
      // Update available languages
      console.log(`[Transcript Viewer] Fetching updated language list...`);
      await fetchAvailableLanguages();
      console.log(`[Transcript Viewer] Translation completed successfully!`);
    } catch (err) {
      console.error('[Transcript Viewer] Translation error:', err);
      console.error('[Transcript Viewer] Error response:', err.response?.data);
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to translate transcript');
      // Reset language selection on error
      setSelectedLanguage('English');
    } finally {
      setTranslating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-600">Loading transcript...</p>
        </div>
      </div>
    );
  }

  if (transcript?.status === 'processing') {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded p-6 text-blue-800">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-600 border-t-transparent"></div>
          <div>
            <p className="font-semibold text-base flex items-center gap-2">
              <Icons.Loader className="w-4 h-4 text-blue-600 animate-spin" /> Transcription in Progress
            </p>
            <p className="text-sm mt-0.5 text-blue-700">
              {transcript.message || 'The lecture is being transcribed. Please refresh in a moment.'}
            </p>
          </div>
        </div>
        <button 
          onClick={() => fetchTranscript()}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium text-sm transition inline-flex items-center gap-1.5"
        >
          <Icons.Refresh className="w-4 h-4" /> Refresh Status
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50/90 border border-red-200 rounded-xl p-4 sm:p-5 text-red-700 shadow-xs">
        <div className="flex items-start gap-3">
          <Icons.AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm sm:text-base text-red-800">Transcript Unavailable</h3>
            <p className="text-xs sm:text-sm text-red-600 mt-1 leading-relaxed">
              {error.includes('not found') || error.includes('404')
                ? 'Transcript not found for this lecture.'
                : 'Unable to load transcript for this lecture.'}
            </p>
            <button 
              onClick={() => fetchTranscript(selectedLanguage || 'English')}
              className="mt-3 px-4 py-2 bg-red-600 hover:bg-red-700 active:scale-95 text-white rounded-lg font-semibold text-xs transition-colors min-h-[36px]"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!transcript) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-amber-800 text-xs sm:text-sm">
        <p>No transcript available for this lecture yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Transcript Header */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6">
        <div className="mb-4 sm:mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-heading">Lecture Transcript</h2>
          <p className="text-muted text-xs sm:text-sm mt-1">
            {transcript.course} {transcript.professor ? `| ${transcript.professor}` : ''}
          </p>
        </div>

        {/* Language Selection */}
        <div className="flex flex-wrap gap-2.5 items-center">
          <label className="font-semibold text-xs sm:text-sm text-heading">Language:</label>
          <select
            value={selectedLanguage}
            onChange={(e) => {
              const selectedValue = e.target.value;
              console.log(`[Transcript Viewer] Dropdown selected:`, selectedValue);
              handleLanguageChange(selectedValue);
            }}
            disabled={translating}
            className="px-3 py-1.5 sm:px-4 sm:py-2 border border-border rounded-lg bg-surface text-xs sm:text-sm hover:border-gray-400 disabled:bg-gray-100 disabled:cursor-not-allowed font-medium"
          >
            {(availableLanguages.length > 0 
              ? availableLanguages 
              : [
                  { name: transcript?.originalLanguage || 'Hindi', available: true, translated: false, isOriginal: true },
                  { name: 'English', available: true, translated: false },
                  { name: 'Gujarati', available: true, translated: false }
                ]
            ).map((lang) => (
              <option key={lang.name} value={lang.name}>
                {lang.name} {lang.isOriginal ? '(Original)' : lang.translated ? '(Ready)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Translation Status */}
      {translating && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 sm:p-4 text-blue-700 flex items-center gap-2 text-xs sm:text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent shrink-0"></div>
          <p className="flex items-center gap-1.5">
            <Icons.Loader className="w-4 h-4 animate-spin shrink-0" /> Translating to <span className="font-semibold">{selectedLanguage}</span>... This may take a moment.
          </p>
        </div>
      )}

      {/* Transcript Content */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6">
        <div className="mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-heading">Full Transcript - {selectedLanguage}</h3>
          <p className="text-xs text-blue-600 mt-1 font-medium flex items-center gap-1.5">
            <Icons.Globe className="w-3.5 h-3.5" /> Language: {selectedLanguage}
          </p>
        </div>
        
        <div className="space-y-1.5 sm:space-y-2 max-h-[500px] overflow-y-auto">
          {transcript.segments?.map((segment, index) => (
            <div
              key={index}
              className="flex gap-3 sm:gap-4 pb-2.5 border-b border-border/60 last:border-b-0 hover:bg-blue-50/50 px-2 py-2 rounded-lg transition"
            >
              <span className="text-blue-600 font-mono text-xs sm:text-sm font-bold min-w-fit pt-0.5 shrink-0">
                {formatTime(segment.start)}
              </span>
              <p className="text-body text-xs sm:text-sm leading-relaxed flex-1 break-words">
                {segment.text}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// Helper function to format time
const formatTime = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  const pad = (num) => String(num).padStart(2, '0');
  
  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
};

export default TranscriptViewer;
