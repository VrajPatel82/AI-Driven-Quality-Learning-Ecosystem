import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { lecturesAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Icons } from '../../components/shared/Icons';

export default function DeptLectureAnalysis() {
  const { id } = useParams();
  const [lecture, setLecture] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLecture();
  }, [id]);

  const fetchLecture = async () => {
    try {
      setLoading(true);
      const res = await lecturesAPI.getById(id);
      // Support various response formats for robustness
      setLecture(res.data.data || res.data.lecture || res.data);
    } catch (err) {
      toast.error('Failed to load lecture analysis');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center h-screen"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  if (!lecture) return <div className="p-8 text-center text-red-500">Lecture not found</div>;

  const segments = lecture.transcription?.segments || [];
  const analysis = lecture.languageAnalysis || {};

  const getLangColor = (lang) => {
    switch (lang) {
      case 'English': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'Hindi': return 'bg-green-100 text-green-700 border-green-200';
      case 'Gujarati': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4">
      <div className="flex items-center gap-4">
        <Link to="/dept-admin/overview" className="btn-secondary px-3 py-1 text-sm">← Back</Link>
        <h1 className="text-2xl font-bold text-heading">Lecture Analysis</h1>
      </div>

      {/* Header Info */}
      <div className="bg-surface rounded-card shadow-card border border-border p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-blue-600">{lecture.title}</h2>
          <p className="text-muted text-sm mt-1">Professor: {lecture.uploadedBy?.name} | Semester: {lecture.semester}</p>
        </div>
        
        <div className="flex gap-3">
          {Object.entries(analysis).map(([lang, pct]) => (
            <div key={lang} className={`px-4 py-2 rounded-lg border ${getLangColor(lang)} text-center`}>
              <p className="text-[10px] uppercase font-bold tracking-wider">{lang}</p>
              <p className="text-lg font-bold">{pct}%</p>
            </div>
          ))}
        </div>
      </div>

      {/* Per-Sentence Analysis Table */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border bg-gray-50 flex justify-between items-center">
            <h3 className="font-semibold text-heading">Sentence-by-Sentence Breakdown</h3>
            <span className="text-xs text-muted uppercase tracking-tighter font-bold">{segments.length} segments analyzed</span>
        </div>
        
        <div className="max-h-[600px] overflow-y-auto">
          {segments.length === 0 ? (
            <div className="p-12 text-center text-muted">
                <p>No transcription segments found.</p>
                <p className="text-xs mt-1">Make sure the video has been processed for transcription.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="bg-gray-50 border-b border-border text-[10px] uppercase text-muted tracking-widest font-bold">
                  <th className="p-4 w-20">Time</th>
                  <th className="p-4">Sentence / Transcript Segment</th>
                  <th className="p-4 w-32 text-center">Detected Language</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {segments.map((seg, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/30 transition-colors">
                    <td className="p-4 text-xs font-mono text-gray-500">
                      {Math.floor(seg.start / 60)}:{(seg.start % 60).toFixed(0).padStart(2, '0')}
                    </td>
                    <td className="p-4 text-sm text-body leading-relaxed">
                      {seg.text}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${getLangColor(seg.language || 'Other')}`}>
                        {seg.language || 'Analyzing...'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Tip Box */}
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-card flex gap-3 items-start">
        <Icons.Lightbulb className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-800">How this works</p>
          <p className="text-xs text-blue-700 mt-1">
            Our AI analyzes each segment of the transcript individually to identify Code-Switching (mixing languages). 
            If a sentence contains multiple languages, the AI determines the primary dominant language for that segment.
          </p>
        </div>
      </div>
    </div>
  );
}
