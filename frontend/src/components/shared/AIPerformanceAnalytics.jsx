import React, { useState, useEffect, useMemo } from 'react';
import { aiPerformanceAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Icons } from './Icons';

/**
 * Clean SVG-based Processing Time Trend Line Chart
 */
function ProcessingTimeTrendChart({ timeTrend = [] }) {
  // Aggregate daily points per workflow
  const { dates, series, maxDuration } = useMemo(() => {
    if (!Array.isArray(timeTrend) || timeTrend.length === 0) {
      return { dates: [], series: {}, maxDuration: 0 };
    }

    const dateSet = new Set();
    const wfSeries = {
      ASSIGNMENT_EVALUATION: {},
      TRANSCRIPTION: {},
      TTS_SYNTHESIS: {}
    };

    let maxMs = 0;

    timeTrend.forEach(item => {
      const d = item._id?.date;
      const wf = item._id?.workflow;
      const dur = Math.round(item.avgDuration || 0);
      if (d && wf && wfSeries[wf]) {
        dateSet.add(d);
        wfSeries[wf][d] = dur;
        if (dur > maxMs) maxMs = dur;
      }
    });

    const sortedDates = Array.from(dateSet).sort();
    return { dates: sortedDates, series: wfSeries, maxDuration: maxMs || 1000 };
  }, [timeTrend]);

  const [hoveredPoint, setHoveredPoint] = useState(null);

  if (dates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <Icons.Clock className="w-8 h-8 text-slate-300 mb-2" />
        <p className="text-xs text-muted font-medium">No processing trend data available for this selection.</p>
        <p className="text-[11px] text-slate-400 mt-0.5">Try widening the time range or resetting filters.</p>
      </div>
    );
  }

  // Chart Dimensions
  const width = 640;
  const height = 220;
  const padLeft = 55;
  const padRight = 20;
  const padTop = 20;
  const padBottom = 35;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  const getY = (val) => {
    const ratio = Math.min(1, Math.max(0, val / maxDuration));
    return padTop + plotHeight - ratio * plotHeight;
  };

  const getX = (idx) => {
    if (dates.length <= 1) return padLeft + plotWidth / 2;
    return padLeft + (idx / (dates.length - 1)) * plotWidth;
  };

  const formatMs = (ms) => {
    if (!ms && ms !== 0) return '0s';
    if (ms < 1000) return `${ms}ms`;
    const s = (ms / 1000).toFixed(1);
    return `${s}s`;
  };

  const workflows = [
    { key: 'ASSIGNMENT_EVALUATION', label: 'Assignment Eval', color: '#8b5cf6', stroke: '#8b5cf6' },
    { key: 'TRANSCRIPTION', label: 'Transcription', color: '#3b82f6', stroke: '#3b82f6' },
    { key: 'TTS_SYNTHESIS', label: 'TTS Synthesis', color: '#10b981', stroke: '#10b981' }
  ];

  return (
    <div className="w-full">
      {/* Legend */}
      <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-4 mb-2 text-[11px]">
        {workflows.map(wf => (
          <div key={wf.key} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: wf.color }} />
            <span className="text-slate-600 font-medium">{wf.label}</span>
          </div>
        ))}
      </div>

      <div className="relative w-full overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto min-w-[300px] max-h-[260px] overflow-visible"
        >
          {/* Y Axis Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((r, i) => {
            const y = padTop + plotHeight - r * plotHeight;
            const val = Math.round(r * maxDuration);
            return (
              <g key={i}>
                <line
                  x1={padLeft}
                  y1={y}
                  x2={width - padRight}
                  y2={y}
                  stroke="#e2e8f0"
                  strokeDasharray={i === 0 ? '' : '3 3'}
                  strokeWidth="1"
                />
                <text
                  x={padLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[10px] fill-slate-400 font-mono"
                >
                  {formatMs(val)}
                </text>
              </g>
            );
          })}

          {/* Lines and Data Points */}
          {workflows.map(wf => {
            const points = dates
              .map((d, idx) => {
                const val = series[wf.key]?.[d];
                if (val === undefined) return null;
                return { x: getX(idx), y: getY(val), val, date: d, label: wf.label };
              })
              .filter(Boolean);

            if (points.length === 0) return null;

            const pathD = points.reduce((acc, pt, i) => {
              return i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
            }, '');

            return (
              <g key={wf.key}>
                {points.length > 1 && (
                  <path
                    d={pathD}
                    fill="none"
                    stroke={wf.stroke}
                    strokeWidth="2.25"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}
                {points.map((pt, i) => (
                  <circle
                    key={i}
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredPoint?.date === pt.date && hoveredPoint?.label === pt.label ? 5.5 : 3.5}
                    fill="#ffffff"
                    stroke={wf.stroke}
                    strokeWidth="2.5"
                    className="cursor-pointer transition-all hover:scale-125"
                    onMouseEnter={() => setHoveredPoint(pt)}
                    onMouseLeave={() => setHoveredPoint(null)}
                  >
                    <title>{`${pt.label} (${pt.date}): ${formatMs(pt.val)}`}</title>
                  </circle>
                ))}
              </g>
            );
          })}

          {/* X Axis Date Labels */}
          {dates.map((d, idx) => {
            // Show up to ~6 date ticks evenly spaced to prevent clutter
            const step = Math.max(1, Math.ceil(dates.length / 6));
            if (idx % step !== 0 && idx !== dates.length - 1) return null;

            const x = getX(idx);
            // Format YYYY-MM-DD -> MM/DD or MMM D
            const parts = d.split('-');
            const label = parts.length === 3 ? `${parts[1]}/${parts[2]}` : d;

            return (
              <text
                key={d}
                x={x}
                y={height - 8}
                textAnchor="middle"
                className="text-[10px] fill-slate-400 font-mono"
              >
                {label}
              </text>
            );
          })}
        </svg>

        {/* Hover Tooltip Overlay */}
        {hoveredPoint && (
          <div
            className="absolute z-10 pointer-events-none bg-slate-900 text-white text-[11px] px-2 py-1 rounded shadow-lg -translate-x-1/2 -translate-y-full whitespace-nowrap"
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
              marginTop: '-6px'
            }}
          >
            <div className="font-semibold">{hoveredPoint.label}</div>
            <div className="text-slate-300 font-mono">{hoveredPoint.date}: {formatMs(hoveredPoint.val)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Operation Status Distribution Chart (Success vs Failed per workflow)
 */
function OperationStatusDistributionChart({ byWorkflow = {} }) {
  const workflows = [
    { key: 'ASSIGNMENT_EVALUATION', label: 'AI Assignment Eval', color: 'border-l-purple-500' },
    { key: 'TRANSCRIPTION', label: 'Lecture Transcription', color: 'border-l-blue-500' },
    { key: 'TTS_SYNTHESIS', label: 'Text-to-Speech (TTS)', color: 'border-l-emerald-500' }
  ];

  const hasAnyData = workflows.some(w => (byWorkflow[w.key]?.total || 0) > 0);

  if (!hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
        <Icons.BarChart className="w-8 h-8 text-slate-300 mb-2" />
        <p className="text-xs text-muted font-medium">No operations recorded for the selected filter scope.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {workflows.map(wf => {
        const data = byWorkflow[wf.key] || { total: 0, successful: 0, failed: 0, successRate: 0, failureRate: 0 };
        const total = data.total || 0;
        const successful = data.successful || 0;
        const failed = data.failed || 0;
        const successRate = total > 0 ? parseFloat(((successful / total) * 100).toFixed(1)) : 0;
        const failureRate = total > 0 ? parseFloat(((failed / total) * 100).toFixed(1)) : 0;

        return (
          <div key={wf.key} className="space-y-1.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
              <span className="font-semibold text-slate-700">{wf.label}</span>
              <div className="flex items-center gap-3 text-[11px] font-medium">
                <span className="text-emerald-700">
                  <strong>{successful}</strong> passed ({successRate}%)
                </span>
                {failed > 0 ? (
                  <span className="text-rose-600">
                    <strong>{failed}</strong> failed ({failureRate}%)
                  </span>
                ) : (
                  <span className="text-slate-400">0 failed</span>
                )}
                <span className="text-muted font-mono">Total: {total}</span>
              </div>
            </div>

            {/* Segmented Bar */}
            <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
              {total > 0 ? (
                <>
                  <div
                    className="bg-emerald-500 h-full transition-all duration-300"
                    style={{ width: `${successRate}%` }}
                    title={`Success: ${successful} (${successRate}%)`}
                  />
                  <div
                    className="bg-rose-500 h-full transition-all duration-300"
                    style={{ width: `${failureRate}%` }}
                    title={`Failed: ${failed} (${failureRate}%)`}
                  />
                </>
              ) : (
                <div className="w-full h-full bg-slate-200/70" />
              )}
            </div>
          </div>
        );
      })}

      {/* Bar Legend */}
      <div className="flex items-center justify-end gap-4 pt-1 text-[11px] text-muted">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span>Success</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
          <span>Failed</span>
        </div>
      </div>
    </div>
  );
}

export default function AIPerformanceAnalytics({ role = 'super_admin' }) {
  // Data state
  const [overview, setOverview] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState(null);

  // Global Monitoring Config
  const [isMonitoringEnabled, setIsMonitoringEnabled] = useState(true);
  const [updatingConfig, setUpdatingConfig] = useState(false);

  // Common Filters
  const [timeRange, setTimeRange] = useState('7d');
  const [workflowFilter, setWorkflowFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Hierarchy Filters
  const [selectedUniversity, setSelectedUniversity] = useState('');
  const [selectedInstitution, setSelectedInstitution] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedProfessor, setSelectedProfessor] = useState('');

  // Search filter for history
  const [historySearch, setHistorySearch] = useState('');

  // Active view tab for history (all vs slowest diagnostic)
  const [historyTab, setHistoryTab] = useState('all'); // 'all' | 'slowest'

  // Stage Detail Modal
  const [inspectingOp, setInspectingOp] = useState(null);

  // Format Duration helper
  const formatDuration = (ms) => {
    if (!ms && ms !== 0) return '—';
    if (ms < 1000) return `${ms} ms`;
    const sec = (ms / 1000).toFixed(2);
    if (sec < 60) return `${sec} s`;
    const min = Math.floor(sec / 60);
    const remSec = (sec % 60).toFixed(1);
    return `${min}m ${remSec}s`;
  };

  const hasActiveFilters = Boolean(
    workflowFilter ||
    statusFilter ||
    selectedUniversity ||
    selectedInstitution ||
    selectedDepartment ||
    selectedProfessor ||
    (timeRange !== '7d')
  );

  const handleClearFilters = () => {
    setTimeRange('7d');
    setWorkflowFilter('');
    setStatusFilter('');
    setSelectedUniversity('');
    setSelectedInstitution('');
    setSelectedDepartment('');
    setSelectedProfessor('');
  };

  // Dependent cascading reset handlers
  const handleUniversityChange = (val) => {
    setSelectedUniversity(val);
    setSelectedInstitution('');
    setSelectedDepartment('');
    setSelectedProfessor('');
  };

  const handleInstitutionChange = (val) => {
    setSelectedInstitution(val);
    setSelectedDepartment('');
    setSelectedProfessor('');
  };

  const handleDepartmentChange = (val) => {
    setSelectedDepartment(val);
    setSelectedProfessor('');
  };

  useEffect(() => {
    fetchOverview();
  }, [timeRange, workflowFilter, statusFilter, selectedUniversity, selectedInstitution, selectedDepartment, selectedProfessor]);

  useEffect(() => {
    fetchHistory(1);
  }, [timeRange, workflowFilter, statusFilter, selectedUniversity, selectedInstitution, selectedDepartment, selectedProfessor]);

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {};
      if (timeRange) params.timeRange = timeRange;
      if (workflowFilter) params.workflow = workflowFilter;
      if (statusFilter) params.status = statusFilter;
      if (selectedUniversity) params.university = selectedUniversity;
      if (selectedInstitution) params.institution = selectedInstitution;
      if (selectedDepartment) params.department = selectedDepartment;
      if (selectedProfessor) params.professor = selectedProfessor;

      const res = await aiPerformanceAPI.getOverview(params);
      if (res.data?.success) {
        setOverview(res.data.data);
        setIsMonitoringEnabled(res.data.data.isMonitoringEnabled !== false);
      } else {
        setError(res.data?.message || 'Failed to fetch API performance analytics.');
      }
    } catch (err) {
      console.error('[AIPerformance] Error fetching overview:', err);
      setError(err.response?.data?.message || err.message || 'Error connecting to analytics service.');
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = async (page = 1) => {
    setHistoryLoading(true);
    try {
      const params = { page, limit: 10 };
      if (timeRange) params.timeRange = timeRange;
      if (workflowFilter) params.workflow = workflowFilter;
      if (statusFilter) params.status = statusFilter;
      if (selectedUniversity) params.university = selectedUniversity;
      if (selectedInstitution) params.institution = selectedInstitution;
      if (selectedDepartment) params.department = selectedDepartment;
      if (selectedProfessor) params.professor = selectedProfessor;

      const res = await aiPerformanceAPI.getHistory(params);
      if (res.data?.success) {
        setHistoryData(res.data.data || []);
        setPagination(res.data.pagination || { total: 0, page: 1, limit: 10, totalPages: 1 });
      }
    } catch (err) {
      console.error('[AIPerformance] Error fetching history:', err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleToggleMonitoring = async () => {
    if (role !== 'super_admin') {
      toast.error('Only Super Admin can change global monitoring settings.');
      return;
    }
    const targetState = !isMonitoringEnabled;
    setUpdatingConfig(true);
    try {
      const res = await aiPerformanceAPI.updateConfig({ enabled: targetState });
      if (res.data?.success) {
        setIsMonitoringEnabled(targetState);
        toast.success(`Global AI performance monitoring ${targetState ? 'enabled' : 'disabled'}.`);
        fetchOverview();
      } else {
        toast.error(res.data?.message || 'Failed to update monitoring setting.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update monitoring setting.');
    } finally {
      setUpdatingConfig(false);
    }
  };

  const getWorkflowBadge = (type) => {
    switch (type) {
      case 'ASSIGNMENT_EVALUATION':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/80 whitespace-nowrap">
            AI Assignment Eval
          </span>
        );
      case 'TRANSCRIPTION':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200/80 whitespace-nowrap">
            Transcription
          </span>
        );
      case 'TTS_SYNTHESIS':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 whitespace-nowrap">
            TTS Synthesis
          </span>
        );
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-800">{type}</span>;
    }
  };

  // Safe data extraction
  const summary = overview?.summary || {
    totalOperations: 0,
    successfulOperations: 0,
    failedOperations: 0,
    successRate: 0,
    failureRate: 0,
    avgDurationMs: 0
  };

  const byWorkflow = overview?.byWorkflow || {};
  const filterOptions = overview?.filterOptions || {};
  const slowestOps = overview?.slowestOperations || [];
  const timeTrend = overview?.timeTrend || [];

  // Filtered dropdown lists according to active parents
  const availableInstitutions = useMemo(() => {
    const allInsts = filterOptions.institutions || [];
    if (!selectedUniversity) return allInsts;
    return allInsts.filter(i => {
      const uId = i.university?._id || i.university;
      return String(uId) === String(selectedUniversity);
    });
  }, [filterOptions.institutions, selectedUniversity]);

  const availableDepartments = useMemo(() => {
    const allDepts = filterOptions.departments || [];
    if (selectedInstitution) {
      return allDepts.filter(d => {
        const instId = d.institution?._id || d.institution;
        return String(instId) === String(selectedInstitution);
      });
    }
    if (selectedUniversity) {
      // Filter by institutions belonging to this university
      const instIds = new Set(availableInstitutions.map(i => String(i._id)));
      return allDepts.filter(d => {
        const instId = String(d.institution?._id || d.institution);
        return instIds.has(instId);
      });
    }
    return allDepts;
  }, [filterOptions.departments, selectedInstitution, selectedUniversity, availableInstitutions]);

  const availableProfessors = useMemo(() => {
    const allProfs = filterOptions.professors || [];
    if (selectedDepartment) {
      return allProfs.filter(p => {
        const deptId = p.department?._id || p.department;
        return String(deptId) === String(selectedDepartment);
      });
    }
    if (selectedInstitution) {
      const deptIds = new Set(availableDepartments.map(d => String(d._id)));
      return allProfs.filter(p => {
        const deptId = String(p.department?._id || p.department);
        const instId = String(p.institution?._id || p.institution);
        return deptIds.has(deptId) || instId === String(selectedInstitution);
      });
    }
    if (selectedUniversity) {
      const deptIds = new Set(availableDepartments.map(d => String(d._id)));
      const instIds = new Set(availableInstitutions.map(i => String(i._id)));
      return allProfs.filter(p => {
        const deptId = String(p.department?._id || p.department);
        const instId = String(p.institution?._id || p.institution);
        const uniId = String(p.university?._id || p.university);
        return deptIds.has(deptId) || instIds.has(instId) || uniId === String(selectedUniversity);
      });
    }
    return allProfs;
  }, [filterOptions.professors, selectedDepartment, selectedInstitution, selectedUniversity, availableDepartments, availableInstitutions]);

  // Client-side text filter on current page history
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return historyData;
    const q = historySearch.toLowerCase();
    return historyData.filter(r => {
      const wf = (r.operationType || '').toLowerCase();
      const user = (r.user?.name || '').toLowerCase();
      const dept = (r.department?.name || '').toLowerCase();
      const inst = (r.institution?.name || '').toLowerCase();
      const provider = (r.provider || '').toLowerCase();
      const model = (r.model || '').toLowerCase();
      const err = (r.errorMessage || r.errorCategory || '').toLowerCase();
      return wf.includes(q) || user.includes(q) || dept.includes(q) || inst.includes(q) || provider.includes(q) || model.includes(q) || err.includes(q);
    });
  }, [historyData, historySearch]);

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0 max-w-full">
      {/* 1. Header Section */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-3">
              <span className="p-2.5 rounded-xl bg-blue-50 text-blue-600 shrink-0 border border-blue-100">
                <Icons.Activity className="w-5 h-5" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-heading truncate">API Performance</h1>
                  {/* Telemetry Status Badge */}
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    isMonitoringEnabled
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    <span className={`w-2 h-2 rounded-full ${isMonitoringEnabled ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    <span>{isMonitoringEnabled ? 'Active' : 'Disabled'}</span>
                  </span>
                </div>
                <p className="text-xs text-muted mt-1 truncate sm:whitespace-normal">
                  Monitor background AI workflow performance across your organization
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 w-full md:w-auto justify-between sm:justify-end shrink-0">
            {/* Super Admin-Only Global Monitoring Enable/Disable Toggle */}
            {role === 'super_admin' && (
              <button
                onClick={handleToggleMonitoring}
                disabled={updatingConfig}
                className={`px-3 sm:px-3.5 py-2 rounded-btn text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-xs ${
                  isMonitoringEnabled
                    ? 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'
                }`}
                title="Only Super Admin can enable or disable platform-wide background telemetry collection"
              >
                {updatingConfig ? (
                  <span className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-current" />
                ) : isMonitoringEnabled ? (
                  <>
                    <Icons.ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>Disable Collection</span>
                  </>
                ) : (
                  <>
                    <Icons.CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Enable Collection</span>
                  </>
                )}
              </button>
            )}

            {/* Refresh Button */}
            <button
              onClick={() => { fetchOverview(); fetchHistory(pagination.page); }}
              className="px-3 py-2 rounded-btn border border-border text-xs font-semibold text-slate-700 hover:text-heading hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5 shrink-0"
              title="Reload metrics"
              aria-label="Refresh"
            >
              <Icons.Refresh className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Monitoring Disabled Notice */}
        {!isMonitoringEnabled && (
          <div className="mt-4 p-3 sm:p-3.5 bg-amber-50/90 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
            <Icons.AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="font-semibold">AI Workflow Performance Telemetry is Currently Disabled</p>
              <p className="text-amber-800 mt-0.5 leading-relaxed">
                New telemetry for AI Assignment Evaluation, Lecture Transcription, and Text-to-Speech is paused platform-wide by the Super Admin. Historical records and diagnostics remain available below. Core AI evaluation, transcription, and speech synthesis services continue uninterrupted.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Filters & Hierarchy Scope Section */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between pb-2.5 border-b border-border/60">
          <span className="text-xs font-semibold text-heading">Filters</span>
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
            >
              Clear Filters
            </button>
          )}
        </div>

        {/* Row 1 — Performance Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Time Range</label>
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="form-input w-full text-xs py-2 px-2.5 bg-white"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Workflow</label>
            <select
              value={workflowFilter}
              onChange={(e) => setWorkflowFilter(e.target.value)}
              className="form-input w-full text-xs py-2 px-2.5 bg-white"
            >
              <option value="">All Workflows</option>
              <option value="ASSIGNMENT_EVALUATION">AI Assignment Evaluation</option>
              <option value="TRANSCRIPTION">Lecture Transcription</option>
              <option value="TTS_SYNTHESIS">Text-to-Speech (TTS)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="form-input w-full text-xs py-2 px-2.5 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="success">Successful</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>

        {/* Row 2 — Organizational Filters */}
        <div className={`grid grid-cols-1 sm:grid-cols-2 ${
          role === 'super_admin' ? 'lg:grid-cols-4' :
          role === 'university_admin' ? 'lg:grid-cols-3' :
          role === 'inst_admin' ? 'lg:grid-cols-2' : 'lg:grid-cols-3'
        } gap-3 sm:gap-4 pt-3 border-t border-border/60`}>
          {/* University (Super Admin only) */}
          {role === 'super_admin' && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">University</label>
              <select
                value={selectedUniversity}
                onChange={(e) => handleUniversityChange(e.target.value)}
                className="form-input w-full text-xs py-2 px-2.5 bg-white truncate"
              >
                <option value="">All Universities</option>
                {(filterOptions.universities || []).map(u => (
                  <option key={u._id} value={u._id}>{u.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Institution (Super Admin & University Admin) */}
          {['super_admin', 'university_admin'].includes(role) && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Institution</label>
              <select
                value={selectedInstitution}
                onChange={(e) => handleInstitutionChange(e.target.value)}
                className="form-input w-full text-xs py-2 px-2.5 bg-white truncate"
              >
                <option value="">All Institutions</option>
                {availableInstitutions.length === 0 && selectedUniversity ? (
                  <option value="" disabled>No institutions in this university</option>
                ) : (
                  availableInstitutions.map(i => (
                    <option key={i._id} value={i._id}>{i.name}</option>
                  ))
                )}
              </select>
            </div>
          )}

          {/* Department (Super Admin, University Admin & Institution Admin) */}
          {['super_admin', 'university_admin', 'inst_admin'].includes(role) && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
              <select
                value={selectedDepartment}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                className="form-input w-full text-xs py-2 px-2.5 bg-white truncate"
              >
                <option value="">All Departments</option>
                {availableDepartments.length === 0 && (selectedInstitution || selectedUniversity) ? (
                  <option value="" disabled>No departments found</option>
                ) : (
                  availableDepartments.map(d => (
                    <option key={d._id} value={d._id}>
                      {d.name}{!selectedInstitution && d.code ? ` (${d.code})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {/* Professor (All 4 permitted admin roles) */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Professor</label>
            <select
              value={selectedProfessor}
              onChange={(e) => setSelectedProfessor(e.target.value)}
              className="form-input w-full text-xs py-2 px-2.5 bg-white truncate"
            >
              <option value="">All Faculty</option>
              {availableProfessors.length === 0 && (selectedDepartment || selectedInstitution || selectedUniversity) ? (
                <option value="" disabled>No faculty found</option>
              ) : (
                availableProfessors.map(p => (
                  <option key={p._id} value={p._id}>{p.name}</option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-card flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <Icons.AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={fetchOverview}
            className="btn-outline px-3 py-1 rounded text-xs text-rose-700 border-rose-300 hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      )}

      {/* 3. Summary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Total Operations */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4 flex flex-col justify-between min-w-0 border-l-4 border-l-blue-500">
          <div>
            <div className="flex items-center justify-between text-muted">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Operations</span>
              <span className="p-1.5 rounded-lg bg-blue-50 text-blue-600">
                <Icons.Activity className="w-4 h-4" />
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-heading mt-2">
              {summary.totalOperations.toLocaleString()}
            </p>
          </div>
          <p className="text-[11px] text-muted mt-2 truncate">Single-count per workflow execution</p>
        </div>

        {/* Successful Operations & Success Rate */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4 flex flex-col justify-between min-w-0 border-l-4 border-l-emerald-500">
          <div>
            <div className="flex items-center justify-between text-muted">
              <span className="text-xs font-semibold uppercase tracking-wider">Success Rate</span>
              <span className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600">
                <Icons.CheckCircle className="w-4 h-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl sm:text-3xl font-bold text-emerald-600">{summary.successRate}%</p>
              <span className="text-xs text-muted truncate">({summary.successfulOperations.toLocaleString()} ok)</span>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${summary.successRate}%` }}
              />
            </div>
            <p className="text-[11px] text-muted truncate">Completed without errors</p>
          </div>
        </div>

        {/* Failed Operations & Failure Rate */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4 flex flex-col justify-between min-w-0 border-l-4 border-l-rose-500">
          <div>
            <div className="flex items-center justify-between text-muted">
              <span className="text-xs font-semibold uppercase tracking-wider">Failed Operations</span>
              <span className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                <Icons.AlertTriangle className="w-4 h-4" />
              </span>
            </div>
            <div className="flex items-baseline gap-2 mt-2">
              <p className="text-2xl sm:text-3xl font-bold text-rose-600">{summary.failedOperations.toLocaleString()}</p>
              <span className="text-xs text-muted truncate">({summary.failureRate}%)</span>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-rose-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${summary.failureRate}%` }}
              />
            </div>
            <p className="text-[11px] text-muted truncate">Encountered exceptions</p>
          </div>
        </div>

        {/* Average Processing Time */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4 flex flex-col justify-between min-w-0 border-l-4 border-l-purple-500">
          <div>
            <div className="flex items-center justify-between text-muted">
              <span className="text-xs font-semibold uppercase tracking-wider">Avg Duration</span>
              <span className="p-1.5 rounded-lg bg-purple-50 text-purple-600">
                <Icons.Clock className="w-4 h-4" />
              </span>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-purple-600 mt-2 truncate">
              {formatDuration(summary.avgDurationMs)}
            </p>
          </div>
          <p className="text-[11px] text-muted mt-2 truncate">Across completed executions</p>
        </div>
      </div>

      {/* 4. Three Dedicated AI Workflow Deep-Dive Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
        {/* Workflow A: AI Assignment Evaluation */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5 flex flex-col justify-between min-w-0 border-t-4 border-t-purple-500">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500 shrink-0" />
                <h3 className="font-semibold text-heading text-sm truncate">AI Assignment Evaluation</h3>
              </div>
              <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 shrink-0">
                {byWorkflow.ASSIGNMENT_EVALUATION?.total || 0} runs
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 py-3 border-b border-border text-xs">
              <div>
                <span className="text-muted block text-[11px]">Success Rate</span>
                <span className="font-bold text-emerald-600 text-sm">
                  {byWorkflow.ASSIGNMENT_EVALUATION?.successRate || 0}%
                </span>
                <span className="text-[10px] text-muted block truncate">
                  ({byWorkflow.ASSIGNMENT_EVALUATION?.successful || 0} pass / {byWorkflow.ASSIGNMENT_EVALUATION?.failed || 0} fail)
                </span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Avg Duration</span>
                <span className="font-bold text-heading text-sm">
                  {formatDuration(byWorkflow.ASSIGNMENT_EVALUATION?.avgDurationMs)}
                </span>
                <span className="text-[10px] text-muted block truncate">
                  Min: {formatDuration(byWorkflow.ASSIGNMENT_EVALUATION?.minDurationMs)} | Max: {formatDuration(byWorkflow.ASSIGNMENT_EVALUATION?.maxDurationMs)}
                </span>
              </div>
            </div>

            {/* Stages */}
            <div className="pt-3">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Stage Latencies</p>
              <div className="space-y-2 text-xs">
                {[
                  { key: 'NATIVE_GEMINI_PDF', label: 'Gemini Native PDF Eval' },
                  { key: 'TEXT_EXTRACTION', label: 'Document Text Extraction' },
                  { key: 'AI_EVALUATION', label: 'AI Scoring & Feedback' }
                ].map(st => {
                  const duration = byWorkflow.ASSIGNMENT_EVALUATION?.stages?.[st.key];
                  return (
                    <div key={st.key} className="p-2 rounded-lg bg-slate-50/80 border border-slate-100 space-y-1">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-700 font-medium truncate">{st.label}</span>
                        <span className="font-semibold text-heading shrink-0">{formatDuration(duration)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Workflow B: Lecture Transcription */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5 flex flex-col justify-between min-w-0 border-t-4 border-t-blue-500">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
                <h3 className="font-semibold text-heading text-sm truncate">Lecture Transcription</h3>
              </div>
              <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 shrink-0">
                {byWorkflow.TRANSCRIPTION?.total || 0} runs
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 py-3 border-b border-border text-xs">
              <div>
                <span className="text-muted block text-[11px]">Success Rate</span>
                <span className="font-bold text-emerald-600 text-sm">
                  {byWorkflow.TRANSCRIPTION?.successRate || 0}%
                </span>
                <span className="text-[10px] text-muted block truncate">
                  ({byWorkflow.TRANSCRIPTION?.successful || 0} pass / {byWorkflow.TRANSCRIPTION?.failed || 0} fail)
                </span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Avg Duration</span>
                <span className="font-bold text-heading text-sm">
                  {formatDuration(byWorkflow.TRANSCRIPTION?.avgDurationMs)}
                </span>
                <span className="text-[10px] text-muted block truncate">
                  Min: {formatDuration(byWorkflow.TRANSCRIPTION?.minDurationMs)} | Max: {formatDuration(byWorkflow.TRANSCRIPTION?.maxDurationMs)}
                </span>
              </div>
            </div>

            {/* Stages */}
            <div className="pt-3">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Stage Latencies</p>
              <div className="space-y-1.5 text-xs">
                {[
                  { key: 'B2_DOWNLOAD', label: 'B2 Audio Download' },
                  { key: 'FFMPEG_AUDIO_EXTRACTION', label: 'FFmpeg Audio Extraction' },
                  { key: 'GROQ_WHISPER_STT', label: 'Groq Whisper STT' },
                  { key: 'GEMINI_LANGUAGE_ANALYSIS', label: 'Gemini Language Analysis' },
                  { key: 'TRANSCRIPT_PDF_GENERATION', label: 'Transcript PDF Rendering' }
                ].map(st => {
                  const duration = byWorkflow.TRANSCRIPTION?.stages?.[st.key];
                  return (
                    <div key={st.key} className="p-1.5 px-2 rounded-lg bg-slate-50/80 border border-slate-100 flex justify-between items-center gap-2">
                      <span className="text-slate-700 font-medium truncate">{st.label}</span>
                      <span className="font-semibold text-heading shrink-0">{formatDuration(duration)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Workflow C: Text-to-Speech (TTS) */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5 flex flex-col justify-between min-w-0 border-t-4 border-t-emerald-500">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-border gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                <h3 className="font-semibold text-heading text-sm truncate">Text-to-Speech (TTS)</h3>
              </div>
              <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                {byWorkflow.TTS_SYNTHESIS?.total || 0} runs
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 py-3 border-b border-border text-xs">
              <div>
                <span className="text-muted block text-[11px]">Success Rate</span>
                <span className="font-bold text-emerald-600 text-sm">
                  {byWorkflow.TTS_SYNTHESIS?.successRate || 0}%
                </span>
                <span className="text-[10px] text-muted block truncate">
                  ({byWorkflow.TTS_SYNTHESIS?.successful || 0} pass / {byWorkflow.TTS_SYNTHESIS?.failed || 0} fail)
                </span>
              </div>
              <div>
                <span className="text-muted block text-[11px]">Avg Duration</span>
                <span className="font-bold text-heading text-sm">
                  {formatDuration(byWorkflow.TTS_SYNTHESIS?.avgDurationMs)}
                </span>
                <span className="text-[10px] text-muted block truncate">
                  Min: {formatDuration(byWorkflow.TTS_SYNTHESIS?.minDurationMs)} | Max: {formatDuration(byWorkflow.TTS_SYNTHESIS?.maxDurationMs)}
                </span>
              </div>
            </div>

            {/* Stages */}
            <div className="pt-3">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">Stage Latencies</p>
              <div className="space-y-2 text-xs">
                {[
                  { key: 'GEMINI_TRANSLATION', label: 'Gemini Translation' },
                  { key: 'EDGE_TTS_SYNTHESIS', label: 'Edge TTS / Python Audio' },
                  { key: 'B2_AUDIO_UPLOAD', label: 'B2 Audio Storage Upload' }
                ].map(st => {
                  let duration = byWorkflow.TTS_SYNTHESIS?.stages?.[st.key];
                  const isCached = duration === undefined && st.key === 'GEMINI_TRANSLATION' && byWorkflow.TTS_SYNTHESIS?.stages?.['TRANSLATION_CACHE_HIT'] !== undefined;
                  if (isCached) {
                    duration = 0;
                  }
                  return (
                    <div key={st.key} className="p-2 rounded-lg bg-slate-50/80 border border-slate-100 space-y-1">
                      <div className="flex justify-between items-center gap-2">
                        <span className="text-slate-700 font-medium truncate">{st.label}</span>
                        <span className="font-semibold text-heading shrink-0">
                          {isCached ? '0 ms (Cached)' : formatDuration(duration)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 5 & 6. Visual Charts: Processing Time Trend & Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Chart 1: Processing Time Trend */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Icons.Activity className="w-4 h-4 text-blue-600" />
                <h3 className="font-semibold text-heading text-sm">Processing Time Trend</h3>
              </div>
              <span className="text-[11px] text-muted">Daily average latency</span>
            </div>
            <ProcessingTimeTrendChart timeTrend={timeTrend} />
          </div>
          <p className="text-[11px] text-slate-400 mt-2 text-center sm:text-left">
            Comparing latency trends across Assignment Evaluation, Transcription, and TTS
          </p>
        </div>

        {/* Chart 2: Operation Status Distribution */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Icons.BarChart className="w-4 h-4 text-emerald-600" />
                <h3 className="font-semibold text-heading text-sm">Operation Status Distribution</h3>
              </div>
              <span className="text-[11px] text-muted">Success vs Failed split</span>
            </div>
            <OperationStatusDistributionChart byWorkflow={byWorkflow} />
          </div>
          <p className="text-[11px] text-slate-400 mt-2 text-center sm:text-left">
            Reflects logical execution counts under the currently applied filter scope
          </p>
        </div>
      </div>

      {/* 7. Recent AI Operations & Diagnostic Section */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-3.5 sm:p-4 border-b border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="text-sm font-semibold text-heading">Recent AI Operations</h3>
              <p className="text-xs text-muted">Persistent execution audit records</p>
            </div>
            {/* View Switcher: All Records vs Top Latency Outliers */}
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-slate-50 text-xs font-semibold ml-2">
              <button
                onClick={() => setHistoryTab('all')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  historyTab === 'all' ? 'bg-white shadow-xs text-blue-600' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Records
              </button>
              <button
                onClick={() => setHistoryTab('slowest')}
                className={`px-2.5 py-1 rounded-md transition-colors ${
                  historyTab === 'slowest' ? 'bg-white shadow-xs text-amber-700' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Slowest Outliers ({slowestOps.length})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto justify-between sm:justify-end">
            {/* Search Input */}
            {historyTab === 'all' && (
              <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                <Icons.Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filter records..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full text-xs pl-8 pr-2.5 py-1.5 rounded-lg border border-border bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            )}
            <span className="text-xs text-muted shrink-0">
              {historyTab === 'all' ? `${pagination.total} total` : `${slowestOps.length} outliers`}
            </span>
          </div>
        </div>

        {/* Content View */}
        {historyLoading ? (
          <div className="flex justify-center items-center py-16">
            <span className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (historyTab === 'all' ? filteredHistory : slowestOps).length === 0 ? (
          <div className="text-center py-14 px-4 text-muted text-xs sm:text-sm">
            <Icons.Database className="w-8 h-8 mx-auto mb-2 text-slate-300" />
            <p className="font-medium text-slate-600">No AI performance records found for this view.</p>
            <p className="text-[11px] text-slate-400 mt-1">Try adjusting the active filters or time range above.</p>
          </div>
        ) : (
          <>
            {/* Desktop Table View (>= 768px) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-border text-slate-500 uppercase font-semibold">
                  <tr>
                    <th className="py-2.5 px-4">Timestamp</th>
                    <th className="py-2.5 px-4">Workflow</th>
                    <th className="py-2.5 px-4">Duration</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Provider / Model</th>
                    <th className="py-2.5 px-4">Ownership</th>
                    <th className="py-2.5 px-4">Error / Target</th>
                    <th className="py-2.5 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(historyTab === 'all' ? filteredHistory : slowestOps).map((rec) => (
                    <tr key={rec._id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">
                        {new Date(rec.startTime).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">{getWorkflowBadge(rec.operationType)}</td>
                      <td className="py-2.5 px-4 font-semibold text-heading whitespace-nowrap">
                        <span className={historyTab === 'slowest' ? 'font-bold text-amber-700' : ''}>
                          {formatDuration(rec.durationMs)}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${
                          rec.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {rec.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 whitespace-nowrap">
                        {rec.provider || '—'} {rec.model ? `(${rec.model})` : ''}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">
                        <div className="font-medium text-slate-800 truncate max-w-[160px]">{rec.user?.name || 'System / Auto'}</div>
                        <div className="text-[10px] text-muted truncate max-w-[160px]">
                          {[rec.department?.code || rec.department?.name, rec.institution?.code || rec.institution?.name].filter(Boolean).join(' • ') || '—'}
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        {rec.status === 'failed' ? (
                          <span className="text-rose-600 font-medium truncate block max-w-[180px]" title={rec.errorMessage}>
                            {rec.errorCategory || 'ERROR'}: {rec.errorMessage || 'Failure'}
                          </span>
                        ) : (
                          <span className="text-slate-500 truncate block max-w-[180px]">
                            {rec.targetLanguage ? `Lang: ${rec.targetLanguage}` : '—'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          onClick={() => setInspectingOp(rec)}
                          className="btn-outline px-2 py-1 text-[11px] rounded inline-flex items-center gap-1 hover:text-blue-600 hover:border-blue-300"
                        >
                          <Icons.Eye className="w-3 h-3" />
                          Stages ({rec.stages?.length || 0})
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (< 768px) */}
            <div className="md:hidden divide-y divide-border p-3 space-y-3">
              {(historyTab === 'all' ? filteredHistory : slowestOps).map((rec) => (
                <div key={rec._id} className="pt-3 first:pt-0 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    {getWorkflowBadge(rec.operationType)}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold shrink-0 ${
                      rec.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {rec.status}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-bold text-heading">{formatDuration(rec.durationMs)}</span>
                    <span className="text-[11px] text-slate-500 shrink-0">{new Date(rec.startTime).toLocaleString()}</span>
                  </div>
                  <div className="text-xs text-slate-600 space-y-0.5">
                    {rec.provider && <div>Provider: <strong className="text-slate-800">{rec.provider}</strong> {rec.model ? `(${rec.model})` : ''}</div>}
                    {rec.targetLanguage && <div>Target Lang: <strong className="text-slate-800">{rec.targetLanguage}</strong></div>}
                    <div>Ownership: <strong className="text-slate-800">{rec.user?.name || 'System / Auto'}</strong> {[rec.department?.code || rec.department?.name, rec.institution?.code || rec.institution?.name].filter(Boolean).join(' • ') ? `(${[rec.department?.code || rec.department?.name, rec.institution?.code || rec.institution?.name].filter(Boolean).join(' • ')})` : ''}</div>
                    {rec.status === 'failed' && (
                      <div className="text-rose-600 text-[11px] font-medium break-words">
                        Error: <strong>{rec.errorCategory || 'FAILED'}</strong> {rec.errorMessage ? `• ${rec.errorMessage}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end pt-1">
                    <button
                      onClick={() => setInspectingOp(rec)}
                      className="btn-outline px-3 py-1 text-xs rounded-lg inline-flex items-center gap-1.5 w-full sm:w-auto justify-center"
                    >
                      <Icons.Eye className="w-3.5 h-3.5" />
                      Inspect Stages ({rec.stages?.length || 0})
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Responsive Pagination Bar (for All Records view) */}
        {historyTab === 'all' && pagination.totalPages > 1 && (
          <div className="p-3 sm:p-4 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-3 text-xs bg-slate-50/50">
            <span className="text-muted text-center sm:text-left">
              Page {pagination.page} of {pagination.totalPages} ({pagination.total} records)
            </span>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-center">
              <button
                onClick={() => fetchHistory(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="btn-outline px-3.5 py-1.5 rounded-lg disabled:opacity-40 text-xs flex-1 sm:flex-none justify-center bg-white"
              >
                Previous
              </button>
              <button
                onClick={() => fetchHistory(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="btn-outline px-3.5 py-1.5 rounded-lg disabled:opacity-40 text-xs flex-1 sm:flex-none justify-center bg-white"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 8. Stage Detail Modal */}
      {inspectingOp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface rounded-card shadow-2xl border border-border max-w-2xl w-full p-4 sm:p-6 space-y-4 max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex justify-between items-start border-b border-border pb-3 shrink-0">
              <div className="min-w-0 pr-2">
                <h3 className="text-base font-bold text-heading flex items-center gap-2 truncate">
                  <Icons.Layers className="w-4 h-4 text-blue-600 shrink-0" />
                  <span>Stage Latency Breakdown</span>
                </h3>
                <p className="text-[11px] text-muted mt-0.5 truncate">
                  Logical Op ID: <code className="bg-slate-100 px-1 py-0.5 rounded text-[11px] font-mono">{inspectingOp.logicalOperationId || inspectingOp._id}</code>
                </p>
              </div>
              <button
                onClick={() => setInspectingOp(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 shrink-0"
                aria-label="Close dialog"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-slate-50 p-2.5 sm:p-3 rounded-lg shrink-0">
              <div className="min-w-0">
                <span className="text-muted block text-[10px]">Workflow</span>
                <span className="font-semibold truncate block">{inspectingOp.operationType}</span>
              </div>
              <div className="min-w-0">
                <span className="text-muted block text-[10px]">Total Latency</span>
                <span className="font-bold text-blue-600 truncate block">{formatDuration(inspectingOp.durationMs)}</span>
              </div>
              <div className="min-w-0">
                <span className="text-muted block text-[10px]">Status</span>
                <span className={`font-bold truncate block ${inspectingOp.status === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {inspectingOp.status}
                </span>
              </div>
              <div className="min-w-0">
                <span className="text-muted block text-[10px]">Started At</span>
                <span className="font-semibold truncate block">{new Date(inspectingOp.startTime).toLocaleTimeString()}</span>
              </div>
            </div>

            {inspectingOp.errorMessage && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800 shrink-0">
                <p className="font-bold">Error ({inspectingOp.errorCategory || 'FAILURE'}):</p>
                <p className="mt-0.5 break-words">{inspectingOp.errorMessage}</p>
              </div>
            )}

            <div className="overflow-y-auto flex-1 pr-1 space-y-2 min-h-[120px]">
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2 sticky top-0 bg-surface py-1">
                Instrumented Sub-Stages ({inspectingOp.stages?.length || 0})
              </h4>
              {(!inspectingOp.stages || inspectingOp.stages.length === 0) ? (
                <p className="text-xs text-muted italic">No sub-stage breakdown records attached to this operation.</p>
              ) : (
                <div className="space-y-2">
                  {inspectingOp.stages.map((st, idx) => (
                    <div key={idx} className="flex justify-between items-start sm:items-center p-2.5 rounded border border-border bg-white text-xs gap-2 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-800 break-words">{st.stageName}</div>
                        <div className="text-[11px] text-muted truncate">
                          Provider: {st.provider || 'Internal'} {st.model ? `• ${st.model}` : ''}
                        </div>
                        {st.errorMessage && (
                          <div className="text-[11px] text-rose-600 mt-0.5 break-words">{st.errorMessage}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-bold text-slate-900">{formatDuration(st.durationMs)}</div>
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold mt-0.5 ${
                          st.status === 'success' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {st.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-border shrink-0">
              <button
                onClick={() => setInspectingOp(null)}
                className="btn-primary w-full sm:w-auto px-4 py-1.5 text-xs rounded-lg"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
