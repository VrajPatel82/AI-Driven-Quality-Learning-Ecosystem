import React from 'react';
import { Icons } from './Icons';

/**
 * LectureSideNavigation
 * Coursera-inspired 3-option navigation rail for the Student Lecture Viewer.
 * Contains EXACTLY: AI, Audio, Files.
 */
export default function LectureSideNavigation({ activePanel, onToggle }) {
  const navItems = [
    {
      id: 'ai',
      label: 'AI',
      title: 'AI Tutor & Assistant',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M12 2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
          <rect x="4" y="8" width="16" height="12" rx="2"/>
          <path d="M9 13v2"/><path d="M15 13v2"/><path d="M10 17h4"/>
        </svg>
      )
    },
    {
      id: 'audio',
      label: 'Audio',
      title: 'Multilingual Audio Tracks',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
        </svg>
      )
    },
    {
      id: 'files',
      label: 'Files',
      title: 'Lecture Materials & Downloads',
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
        </svg>
      )
    }
  ];

  return (
    <nav
      aria-label="Lecture Tools Navigation"
      className="bg-surface rounded-card shadow-card border border-border p-1.5 sm:p-2 w-full grid grid-cols-3 lg:flex lg:flex-col lg:w-16 items-center justify-around gap-1.5 sm:gap-2"
    >
      {navItems.map((item) => {
        const isActive = activePanel === item.id;
        return (
          <button
            key={item.id}
            type="button"
            aria-label={item.title}
            aria-expanded={isActive}
            title={item.title}
            onClick={() => onToggle(item.id)}
            className={`flex flex-col sm:flex-row lg:flex-col items-center justify-center py-2 px-2 sm:px-3 rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[46px] w-full ${
              isActive
                ? 'bg-blue-600 text-white shadow-sm font-bold scale-[1.02] lg:scale-105'
                : 'text-heading hover:bg-slate-100 hover:text-blue-600 font-medium'
            }`}
          >
            <span className="leading-none shrink-0">{item.icon}</span>
            <span className="text-[11px] sm:text-xs font-semibold mt-1 sm:mt-0 sm:ml-1.5 lg:ml-0 lg:mt-1 tracking-tight truncate">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
