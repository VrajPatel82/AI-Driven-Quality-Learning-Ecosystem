import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Icons } from './Icons';

/**
 * StudentLanguageSettings Component
 * Allows students to set their preferred language for transcript translations
 */
const StudentLanguageSettings = ({ onSuccess }) => {
  const [preferredLanguage, setPreferredLanguage] = useState('English');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const languages = ['English', 'Hindi', 'Gujarati', 'Spanish'];

  // Fetch current preferred language
  useEffect(() => {
    fetchPreferredLanguage();
  }, []);

  const fetchPreferredLanguage = async () => {
    try {
      setLoading(true);
      const response = await api.get('/transcripts/student/preferred-language');
      setPreferredLanguage(response.data.preferredLanguage);
    } catch (err) {
      console.error('[Settings] Error fetching preferred language:', err);
      setPreferredLanguage('English');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await api.put('/transcripts/student/preferred-language', {
        preferredLanguage
      });

      setMessage({
        type: 'success',
        text: `Preferred language updated to ${preferredLanguage}`
      });

      if (onSuccess) {
        onSuccess(preferredLanguage);
      }

      // Clear message after 3 seconds
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.response?.data?.message || 'Failed to update preferred language'
      });
    } finally {
      setSaving(false);
    }
  };

  const hasChanged = preferredLanguage !== localStorage.getItem('preferredLanguage');

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">
        Transcript Preferences
      </h3>

      <div className="space-y-4">
        {/* Preferred Language Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Preferred Language for Transcripts
          </label>
          <div className="grid grid-cols-2 gap-3">
            {languages.map(lang => (
              <button
                key={lang}
                onClick={() => setPreferredLanguage(lang)}
                className={`p-3 rounded-lg border-2 transition text-sm font-medium flex items-center justify-center gap-1.5 ${
                  preferredLanguage === lang
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
              >
                <span>{lang}</span>
                {preferredLanguage === lang && <Icons.Check className="w-4 h-4 text-blue-600 inline" />}
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="bg-blue-50 border border-blue-200 rounded p-3">
          <p className="text-xs text-blue-700 flex items-start gap-1.5">
            <Icons.Lightbulb className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <span>Tip: When you view lecture transcripts, they will automatically be
            translated to your preferred language if available.</span>
          </p>
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          disabled={saving || !hasChanged}
          className={`w-full py-2 rounded-lg font-medium transition ${
            saving || !hasChanged
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {saving ? 'Saving...' : 'Save Preference'}
        </button>

        {/* Message */}
        {message && (
          <div
            className={`p-3 rounded text-sm ${
              message.type === 'success'
                ? 'bg-green-50 border border-green-200 text-green-700'
                : 'bg-red-50 border border-red-200 text-red-700'
            }`}
          >
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentLanguageSettings;
