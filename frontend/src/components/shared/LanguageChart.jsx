import React from 'react';
import { Icons } from './Icons';

export default function LanguageChart({ data, title = "Language Analysis" }) {
  if (!data) return null;

  // Filter out languages with 0%
  const languages = Object.entries(data)
    .filter(([_, percentage]) => percentage > 0)
    .sort((a, b) => b[1] - a[1]); // Sort by percentage descending

  if (languages.length === 0) return null;

  // Colors for different languages
  const colors = {
    English: 'bg-blue-500',
    Hindi: 'bg-green-500',
    Gujarati: 'bg-orange-500',
    Other: 'bg-purple-500'
  };

  const textColors = {
    English: 'text-blue-600',
    Hindi: 'text-green-600',
    Gujarati: 'text-orange-600',
    Other: 'text-purple-600'
  };

  const bgColors = {
    English: 'bg-blue-50',
    Hindi: 'bg-green-50',
    Gujarati: 'bg-orange-50',
    Other: 'bg-purple-50'
  };

  return (
    <div className="bg-surface rounded-card shadow-card border border-border p-6 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <Icons.Globe className="w-5 h-5 text-blue-600" />
        <h3 className="font-semibold text-heading">{title}</h3>
      </div>
      
      {/* Visual Bar */}
      <div className="w-full h-4 bg-gray-100 rounded-full flex overflow-hidden mb-6">
        {languages.map(([lang, percentage]) => (
          <div 
            key={lang} 
            className={`h-full ${colors[lang] || colors.Other} transition-all duration-500`} 
            style={{ width: `${percentage}%` }}
            title={`${lang}: ${percentage}%`}
          ></div>
        ))}
      </div>

      {/* Legend / Breakdown */}
      <div className="flex flex-wrap gap-4">
        {languages.map(([lang, percentage]) => (
          <div key={lang} className={`flex items-center gap-3 px-4 py-2 rounded-lg ${bgColors[lang] || bgColors.Other}`}>
            <div className={`w-3 h-3 rounded-full ${colors[lang] || colors.Other}`}></div>
            <div className="flex flex-col">
              <span className={`text-sm font-semibold ${textColors[lang] || textColors.Other}`}>{lang}</span>
              <span className="text-xs text-muted font-medium">{percentage}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
