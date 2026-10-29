import React, { useState, useEffect } from 'react';
import { lecturesAPI } from '../../services/api';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Icons } from './Icons';

export default function LanguageReportTable({ filterByUploader = null, department = null, title = "Language Analysis Report" }) {
  const [lectures, setLectures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReportData();
  }, [filterByUploader, department]);

  const fetchReportData = async () => {
    try {
      setLoading(true);
      const params = { limit: 50, sort: '-createdAt' };
      if (filterByUploader) {
        params.uploadedBy = filterByUploader;
      }
      if (department) {
        params.department = department;
      }
      const res = await lecturesAPI.getAll(params);
      const allLectures = res.data.data || [];
      
      // Filter for lectures that actually have language analysis data
      const analyzedLectures = allLectures.filter(l => l.languageAnalysis);
      setLectures(analyzedLectures);
    } catch (err) {
      toast.error('Failed to load language report');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (lectures.length === 0) return;

    // Create CSV header
    const headers = ['Lecture/Lab Title', 'Professor Name', 'Semester', 'English (%)', 'Hindi (%)', 'Gujarati (%)', 'Other (%)'];
    
    // Create CSV rows
    const rows = lectures.map(l => [
      `"${l.title || 'Unknown'}"`,
      `"${l.uploadedBy?.name || 'Unknown'}"`,
      l.semester || 'N/A',
      l.languageAnalysis?.English || 0,
      l.languageAnalysis?.Hindi || 0,
      l.languageAnalysis?.Gujarati || 0,
      l.languageAnalysis?.Other || 0
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    // Create and trigger download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `language_analysis_report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) {
    return (
      <div className="bg-surface rounded-card shadow-card border border-border p-6 mt-6 flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-surface rounded-card shadow-card border border-border mt-6">
      <div className="p-4 border-b border-border flex justify-between items-center bg-gray-50 rounded-t-card">
        <div className="flex items-center gap-2">
          <Icons.BarChart className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-heading">{title}</h2>
        </div>
        <button 
          onClick={handleDownloadCSV}
          disabled={lectures.length === 0}
          className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
        >
          <Icons.Download className="w-4 h-4" /> Download CSV
        </button>
      </div>
      
      <div className="overflow-x-auto">
        {lectures.length === 0 ? (
          <p className="text-center text-muted py-8">No language analysis data available yet.</p>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-100 border-b border-border text-xs uppercase text-muted tracking-wider">
                <th className="p-4 font-semibold">Lecture/Lab Title</th>
                <th className="p-4 font-semibold">Professor Name</th>
                <th className="p-4 font-semibold">Semester</th>
                <th className="p-4 font-semibold text-center">English%</th>
                <th className="p-4 font-semibold text-center">Hindi%</th>
                <th className="p-4 font-semibold text-center">Gujarati%</th>
                <th className="p-4 font-semibold text-center">Other%</th>
                <th className="p-4 font-semibold text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm text-body">
              {lectures.map(l => (
                <tr key={l._id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4 font-medium text-heading truncate max-w-xs" title={l.title}>{l.title}</td>
                  <td className="p-4">{l.uploadedBy?.name || 'Unknown'}</td>
                  <td className="p-4 text-center">{l.semester || '-'}</td>
                  <td className="p-4 text-center font-medium text-blue-600 bg-blue-50/30">{l.languageAnalysis?.English || 0}%</td>
                  <td className="p-4 text-center font-medium text-green-600 bg-green-50/30">{l.languageAnalysis?.Hindi || 0}%</td>
                  <td className="p-4 text-center font-medium text-orange-600 bg-orange-50/30">{l.languageAnalysis?.Gujarati || 0}%</td>
                  <td className="p-4 text-center font-medium text-purple-600 bg-purple-50/30">{l.languageAnalysis?.Other || 0}%</td>
                  <td className="p-4 text-center">
                    <Link 
                      to={`/dept-admin/lecture-analysis/${l._id}`}
                      className="text-blue-600 hover:text-blue-800 font-medium text-xs underline"
                    >
                      View Analysis
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
