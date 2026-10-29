import { useState, useEffect, useRef } from 'react';
import { auditLogsAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Icons } from '../../components/shared/Icons';

const APPROVED_FAMILIES = [
  { value: 'PRIVILEGE', label: 'Privilege Changes' },
  { value: 'UNIVERSITY', label: 'University Operations' },
  { value: 'SECURITY', label: 'Security Incidents' },
  { value: 'BULK', label: 'Bulk Operations' },
  { value: 'CONFIGURATION', label: 'Platform Config' },
  { value: 'DESTRUCTIVE', label: 'Destructive Ops' }
];

export default function SuperSecurityLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  const [selectedEvent, setSelectedEvent] = useState(null);

  // Filters
  const [eventFamily, setEventFamily] = useState('');
  const [severity, setSeverity] = useState('');
  const [status, setStatus] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  // SSE status: 'connecting' | 'live' | 'disconnected'
  const [sseStatus, setSseStatus] = useState('connecting');
  const eventSourceRef = useRef(null);

  // Fetch critical audit logs
  const fetchLogs = async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      const params = {
        page,
        limit: 20
      };
      if (eventFamily) params.eventFamily = eventFamily;
      if (severity) params.severity = severity;
      if (status) params.status = status;
      if (activeSearch) params.search = activeSearch;

      const res = await auditLogsAPI.getAll(params);
      const data = res.data;
      setLogs(data.logs || data.data || []);
      setPagination({
        totalItems: data.totalItems || data.total,
        currentPage: data.currentPage || data.page || page,
        totalPages: data.totalPages || Math.ceil((data.totalItems || 0) / 20)
      });
    } catch (err) {
      toast.error('Failed to load critical audit events');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, eventFamily, severity, status, activeSearch]);

  // Real-time SSE Live Connection
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      setSseStatus('disconnected');
      return;
    }

    const getBaseURL = () => {
      if (import.meta.env.VITE_API_BASE_URL) return import.meta.env.VITE_API_BASE_URL;
      if (import.meta.env.PROD) return '/api';
      return 'http://localhost:5000/api';
    };

    const sseUrl = `${getBaseURL()}/audit-logs/stream?token=${encodeURIComponent(token)}`;

    let es;
    try {
      es = new EventSource(sseUrl);
      eventSourceRef.current = es;

      es.onopen = () => {
        setSseStatus('live');
      };

      es.addEventListener('critical_event', (e) => {
        try {
          const newEvent = JSON.parse(e.data);
          if (!newEvent || !newEvent._id) return;

          // Apply current active filters to incoming live event
          if (eventFamily && newEvent.eventFamily !== eventFamily) return;
          if (severity && newEvent.severity !== severity) return;
          if (status && newEvent.status !== status) return;

          setLogs((prev) => {
            if (prev.some((item) => item._id === newEvent._id)) return prev;
            return [newEvent, ...prev];
          });
        } catch (err) {
          console.error('SSE critical event parsing error:', err);
        }
      });

      es.onerror = () => {
        setSseStatus('disconnected');
      };
    } catch (err) {
      setSseStatus('disconnected');
    }

    return () => {
      if (es) {
        es.close();
      }
    };
  }, [eventFamily, severity, status]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    setActiveSearch(searchInput.trim());
  };

  const handleClearFilters = () => {
    setEventFamily('');
    setSeverity('');
    setStatus('');
    setSearchInput('');
    setActiveSearch('');
    setPage(1);
  };

  const handleAcknowledge = async (e, eventId) => {
    if (e) e.stopPropagation();
    try {
      const res = await auditLogsAPI.acknowledge(eventId);
      const updatedLog = res.data?.log || res.data?.data;

      setLogs((prev) =>
        prev.map((item) =>
          item._id === eventId
            ? {
                ...item,
                status: 'ACKNOWLEDGED',
                acknowledgedBy: updatedLog?.acknowledgedBy || item.acknowledgedBy,
                acknowledgedAt: updatedLog?.acknowledgedAt || new Date().toISOString()
              }
            : item
        )
      );

      if (selectedEvent && selectedEvent._id === eventId) {
        setSelectedEvent((prev) => ({
          ...prev,
          status: 'ACKNOWLEDGED',
          acknowledgedBy: updatedLog?.acknowledgedBy || prev.acknowledgedBy,
          acknowledgedAt: updatedLog?.acknowledgedAt || new Date().toISOString()
        }));
      }

      toast.success('Critical event acknowledged');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to acknowledge event');
    }
  };

  // Helper Badge Renderers
  const getFamilyBadge = (family) => {
    switch (family) {
      case 'PRIVILEGE':
        return { label: 'Privilege', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Icons.ShieldCheck };
      case 'UNIVERSITY':
        return { label: 'University', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Icons.Building };
      case 'SECURITY':
        return { label: 'Security', color: 'bg-red-100 text-red-700 border-red-200', icon: Icons.AlertTriangle };
      case 'BULK':
        return { label: 'Bulk Op', color: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: Icons.Users };
      case 'CONFIGURATION':
        return { label: 'Config', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Icons.Settings };
      case 'DESTRUCTIVE':
        return { label: 'Destructive', color: 'bg-rose-100 text-rose-800 border-rose-200', icon: Icons.Trash };
      default:
        return { label: family || 'System', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: Icons.Activity };
    }
  };

  const getSeverityBadge = (sev) => {
    if (sev === 'CRITICAL') {
      return <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-red-100 text-red-700 border border-red-200">CRITICAL</span>;
    }
    return <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700 border border-amber-200">HIGH</span>;
  };

  const getStatusBadge = (st) => {
    if (st === 'ACKNOWLEDGED') {
      return (
        <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700 border border-green-200 flex items-center gap-1 w-fit">
          <Icons.CheckCircle className="w-3 h-3" /> Acknowledged
        </span>
      );
    }
    if (st === 'RESOLVED') {
      return (
        <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1 w-fit">
          <Icons.Check className="w-3 h-3" /> Resolved
        </span>
      );
    }
    return (
      <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1 w-fit">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span> Open
      </span>
    );
  };

  // Derive Summary Counters from current dataset
  const criticalEventsCount = pagination.totalItems !== undefined ? pagination.totalItems : logs.length;
  const securityIncidentsCount = logs.filter((l) => l.eventFamily === 'SECURITY').length;
  const highImpactOpsCount = logs.filter((l) => ['BULK', 'CONFIGURATION', 'DESTRUCTIVE', 'UNIVERSITY'].includes(l.eventFamily)).length;
  const openEventsCount = logs.filter((l) => l.status === 'OPEN').length;

  return (
    <div className="space-y-4 sm:space-y-6 w-full min-w-0">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading">Security & Critical Events</h1>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Monitor critical security incidents, privileged actions, and high-impact platform changes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          {/* Unobtrusive Live SSE Connection Indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-border bg-surface text-xs font-medium">
            {sseStatus === 'live' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
                <span className="text-green-700 flex items-center gap-1">
                  <Icons.Radio className="w-3.5 h-3.5 text-green-600" /> Live Stream
                </span>
              </>
            ) : sseStatus === 'connecting' ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                <span className="text-amber-700">Connecting...</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-gray-400"></span>
                <span className="text-muted">Disconnected</span>
              </>
            )}
          </div>

          <button
            onClick={() => fetchLogs(true)}
            disabled={refreshing}
            className="btn-primary px-3.5 py-2 rounded-btn text-sm inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors"
          >
            <Icons.Refresh className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-surface rounded-card shadow-card border border-border p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs sm:text-sm font-medium text-muted truncate">Critical Events</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-blue-50 text-blue-600 flex-shrink-0">
              <Icons.Shield className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-heading mt-1 sm:mt-2 truncate">{criticalEventsCount}</p>
          <p className="text-[11px] sm:text-xs text-muted mt-1 truncate">Total in active query scope</p>
        </div>

        <div className="bg-surface rounded-card shadow-card border border-border p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs sm:text-sm font-medium text-muted truncate">Security Incidents</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-red-50 text-red-600 flex-shrink-0">
              <Icons.AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-red-600 mt-1 sm:mt-2 truncate">{securityIncidentsCount}</p>
          <p className="text-[11px] sm:text-xs text-muted mt-1 truncate">Suspicious auth & access attempts</p>
        </div>

        <div className="bg-surface rounded-card shadow-card border border-border p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs sm:text-sm font-medium text-muted truncate">High-Impact Ops</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-indigo-50 text-indigo-600 flex-shrink-0">
              <Icons.Activity className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-heading mt-1 sm:mt-2 truncate">{highImpactOpsCount}</p>
          <p className="text-[11px] sm:text-xs text-muted mt-1 truncate">Bulk, config & university changes</p>
        </div>

        <div className="bg-surface rounded-card shadow-card border border-border p-3.5 sm:p-5">
          <div className="flex items-center justify-between gap-1">
            <span className="text-xs sm:text-sm font-medium text-muted truncate">Open Alerts</span>
            <div className="p-1.5 sm:p-2 rounded-lg bg-amber-50 text-amber-600 flex-shrink-0">
              <Icons.AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          </div>
          <p className="text-xl sm:text-2xl font-bold text-amber-600 mt-1 sm:mt-2 truncate">{openEventsCount}</p>
          <p className="text-[11px] sm:text-xs text-muted mt-1 truncate">Awaiting admin review</p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-surface rounded-card shadow-card border border-border p-3.5 sm:p-4">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3 flex-1">
            {/* Event Family Filter */}
            <select
              value={eventFamily}
              onChange={(e) => {
                setEventFamily(e.target.value);
                setPage(1);
              }}
              className="form-input text-xs sm:text-sm py-2"
            >
              <option value="">All Event Families</option>
              {APPROVED_FAMILIES.map((fam) => (
                <option key={fam.value} value={fam.value}>
                  {fam.label}
                </option>
              ))}
            </select>

            {/* Severity Filter */}
            <select
              value={severity}
              onChange={(e) => {
                setSeverity(e.target.value);
                setPage(1);
              }}
              className="form-input text-xs sm:text-sm py-2"
            >
              <option value="">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
            </select>

            {/* Status Filter */}
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="form-input text-xs sm:text-sm py-2"
            >
              <option value="">All Statuses</option>
              <option value="OPEN">OPEN</option>
              <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
              <option value="RESOLVED">RESOLVED</option>
            </select>
          </div>

          {/* Search Form */}
          <form onSubmit={handleSearchSubmit} className="flex flex-wrap sm:flex-nowrap gap-2 items-center">
            <div className="relative flex-1 min-w-[180px] lg:w-64">
              <input
                type="text"
                placeholder="Search description..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="form-input text-xs sm:text-sm py-2 pl-9 pr-3 w-full"
              />
              <Icons.Search className="w-4 h-4 text-muted absolute left-3 top-2.5" />
            </div>
            <button type="submit" className="btn-primary px-3.5 py-2 rounded-btn text-xs sm:text-sm flex-shrink-0">
              Search
            </button>

            {(eventFamily || severity || status || activeSearch) && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="px-3 py-2 border border-border rounded-btn text-xs sm:text-sm text-muted hover:bg-gray-50 flex-shrink-0 transition-colors"
              >
                Clear
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Events Table / Mobile Cards */}
      {loading ? (
        <div className="flex justify-center items-center h-48 bg-surface rounded-card border border-border">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="space-y-3.5 md:space-y-0 md:bg-surface md:rounded-card md:shadow-card md:border md:border-border md:overflow-hidden">
          {/* Desktop & Tablet Table (md and up) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Time</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Severity</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Event</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Scope / Uni</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider">Impact & Details</th>
                  <th className="text-left px-4 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Status</th>
                  <th className="text-right px-4 py-3.5 text-xs font-semibold text-muted uppercase tracking-wider whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 px-4">
                      <div className="max-w-md mx-auto space-y-2">
                        <Icons.ShieldCheck className="w-12 h-12 text-muted mx-auto opacity-50" />
                        <p className="text-base font-semibold text-heading">No critical events found.</p>
                        <p className="text-sm text-muted">
                          There are no events matching the current filters. Active monitoring is operational.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const familyInfo = getFamilyBadge(log.eventFamily);
                    const FamilyIcon = familyInfo.icon;
                    const isPlatform = log.eventScope === 'PLATFORM' || !log.university;

                    return (
                      <tr key={log._id} className="hover:bg-gray-50/80 transition-colors cursor-pointer" onClick={() => setSelectedEvent(log)}>
                        {/* Time */}
                        <td className="px-4 py-3.5 text-xs text-muted whitespace-nowrap">
                          {new Date(log.createdAt || log.timestamp).toLocaleString()}
                        </td>

                        {/* Severity */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {getSeverityBadge(log.severity)}
                        </td>

                        {/* Event */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${familyInfo.color}`}>
                            <FamilyIcon className="w-3.5 h-3.5" />
                            {familyInfo.label}
                          </span>
                        </td>

                        {/* Scope / University */}
                        <td className="px-4 py-3.5 text-xs whitespace-nowrap">
                          {isPlatform ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200 font-medium">
                              <Icons.Globe className="w-3 h-3" /> PLATFORM
                            </span>
                          ) : (
                            <span className="font-medium text-heading">
                              {log.university?.name || log.university?.code || 'University Scope'}
                            </span>
                          )}
                        </td>

                        {/* Details */}
                        <td className="px-4 py-3.5 text-sm text-heading max-w-xs sm:max-w-sm truncate">
                          {log.description || log.details || '—'}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {getStatusBadge(log.status)}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedEvent(log)}
                              className="px-2.5 py-1 text-xs border border-border rounded-btn text-heading hover:bg-gray-100 font-medium transition-colors"
                            >
                              View
                            </button>

                            {log.status === 'OPEN' && (
                              <button
                                onClick={(e) => handleAcknowledge(e, log._id)}
                                className="px-2.5 py-1 text-xs bg-green-600 text-white rounded-btn hover:bg-green-700 font-medium inline-flex items-center gap-1 transition-colors"
                              >
                                <Icons.Check className="w-3 h-3" /> Acknowledge
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Event Cards (below md) — Clean, Spaced, and Readable */}
          <div className="block md:hidden space-y-3.5">
            {logs.length === 0 ? (
              <div className="bg-surface rounded-card shadow-card border border-border text-center py-12 px-4">
                <Icons.ShieldCheck className="w-10 h-10 text-muted mx-auto opacity-50 mb-2" />
                <p className="text-sm font-semibold text-heading">No critical events found.</p>
                <p className="text-xs text-muted mt-1">
                  There are no events matching the current filters. Active monitoring is operational.
                </p>
              </div>
            ) : (
              logs.map((log) => {
                const familyInfo = getFamilyBadge(log.eventFamily);
                const FamilyIcon = familyInfo.icon;
                const isPlatform = log.eventScope === 'PLATFORM' || !log.university;

                return (
                  <div
                    key={log._id}
                    className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5 space-y-3.5 hover:border-blue-200 transition-all cursor-pointer"
                    onClick={() => setSelectedEvent(log)}
                  >
                    {/* 1. Time Header */}
                    <div>
                      <span className="text-xs font-semibold text-muted tracking-wide">
                        {new Date(log.createdAt || log.timestamp).toLocaleString()}
                      </span>
                    </div>

                    {/* 2. Severity + Event Badges Row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {getSeverityBadge(log.severity)}
                      <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium ${familyInfo.color}`}>
                        <FamilyIcon className="w-3.5 h-3.5" />
                        {familyInfo.label}
                      </span>
                    </div>

                    {/* 3. Scope + Status Row */}
                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <div className="min-w-0">
                        {isPlatform ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-xs font-medium">
                            <Icons.Globe className="w-3.5 h-3.5" /> PLATFORM
                          </span>
                        ) : (
                          <span className="font-semibold text-xs text-heading truncate block">
                            {log.university?.name || log.university?.code || 'University Scope'}
                          </span>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        {getStatusBadge(log.status)}
                      </div>
                    </div>

                    {/* 4. Impact & Details Section */}
                    <div className="pt-1">
                      <p className="text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">Impact & Details</p>
                      <p className="text-xs sm:text-sm text-heading leading-relaxed break-words font-medium">
                        {log.description || log.details || '—'}
                      </p>
                    </div>

                    {/* 5. Action Buttons */}
                    <div
                      className="flex items-center justify-end gap-2.5 pt-2.5 border-t border-gray-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() => setSelectedEvent(log)}
                        className="px-3.5 py-1.5 text-xs border border-border rounded-btn text-heading hover:bg-gray-100 font-medium transition-colors"
                      >
                        View
                      </button>

                      {log.status === 'OPEN' && (
                        <button
                          onClick={(e) => handleAcknowledge(e, log._id)}
                          className="px-3.5 py-1.5 text-xs bg-green-600 text-white rounded-btn hover:bg-green-700 font-medium inline-flex items-center gap-1.5 transition-colors"
                        >
                          <Icons.Check className="w-3.5 h-3.5" /> Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="p-3.5 sm:p-4 bg-surface md:bg-gray-50/50 rounded-card md:rounded-none border md:border-0 md:border-t border-border shadow-card md:shadow-none flex flex-col sm:flex-row items-center justify-between gap-3">
              <p className="text-xs sm:text-sm text-muted text-center sm:text-left">
                Showing Page <span className="font-semibold text-heading">{pagination.currentPage || page}</span> of{' '}
                <span className="font-semibold text-heading">{pagination.totalPages}</span> ({pagination.totalItems || logs.length} records)
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 border border-border rounded-btn text-xs font-medium disabled:opacity-50 hover:bg-white bg-surface shadow-xs transition-colors"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= (pagination.totalPages || 1)}
                  className="px-3 py-1.5 border border-border rounded-btn text-xs font-medium disabled:opacity-50 hover:bg-white bg-surface shadow-xs transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4" onClick={() => setSelectedEvent(null)}>
          <div
            className="bg-surface rounded-card shadow-xl border border-border w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                <div className="p-2 sm:p-2.5 rounded-lg bg-blue-50 text-blue-600 flex-shrink-0">
                  <Icons.Shield className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base sm:text-lg font-bold text-heading truncate">Event Detail</h2>
                  <p className="text-xs text-muted truncate">ID: {selectedEvent._id}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 text-muted hover:text-heading rounded-lg hover:bg-gray-200/60 flex-shrink-0"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 overflow-y-auto flex-1">
              {/* Event Header Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 bg-gray-50 p-3 sm:p-4 rounded-xl border border-border">
                <div>
                  <p className="text-xs text-muted uppercase font-semibold">Event Family</p>
                  <p className="text-sm font-bold text-heading mt-1">{selectedEvent.eventFamily || 'SYSTEM'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase font-semibold">Severity</p>
                  <div className="mt-1">{getSeverityBadge(selectedEvent.severity)}</div>
                </div>
                <div>
                  <p className="text-xs text-muted uppercase font-semibold">Status</p>
                  <div className="mt-1">{getStatusBadge(selectedEvent.status)}</div>
                </div>
              </div>

              {/* Description */}
              <div>
                <p className="text-xs font-semibold text-muted uppercase">Description</p>
                <p className="text-xs sm:text-sm text-heading mt-1 font-medium bg-blue-50/50 p-3 rounded-lg border border-blue-100 break-words">
                  {selectedEvent.description || 'No description provided.'}
                </p>
              </div>

              {/* Scope & Actor Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <p className="text-xs font-semibold text-muted uppercase">Actor / Initiator</p>
                  <div className="mt-1 text-xs sm:text-sm bg-surface p-3 rounded-lg border border-border space-y-1">
                    <p className="font-medium text-heading break-words">{selectedEvent.userId?.name || selectedEvent.user?.name || 'System / Anonymous'}</p>
                    {selectedEvent.userId?.email && <p className="text-xs text-muted break-all">{selectedEvent.userId.email}</p>}
                    {selectedEvent.userId?.role && <p className="text-xs text-muted">Role: {selectedEvent.userId.role}</p>}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-muted uppercase">Scope & Target</p>
                  <div className="mt-1 text-xs sm:text-sm bg-surface p-3 rounded-lg border border-border space-y-1">
                    <p className="font-medium text-heading">Scope: {selectedEvent.eventScope || 'PLATFORM'}</p>
                    {selectedEvent.university && (
                      <p className="text-xs text-muted break-words">
                        University: {selectedEvent.university?.name || selectedEvent.university}
                      </p>
                    )}
                    {selectedEvent.resource && (
                      <p className="text-xs text-muted break-words">
                        Resource: {selectedEvent.resource} {selectedEvent.resourceId ? `(${selectedEvent.resourceId})` : ''}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Context Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4 text-xs text-muted">
                <div>
                  <span className="font-semibold text-heading">Timestamp:</span>{' '}
                  {new Date(selectedEvent.createdAt || selectedEvent.timestamp).toLocaleString()}
                </div>
                {selectedEvent.ipAddress && (
                  <div>
                    <span className="font-semibold text-heading">IP Address:</span> {selectedEvent.ipAddress}
                  </div>
                )}
                {selectedEvent.userAgent && (
                  <div className="md:col-span-2 truncate">
                    <span className="font-semibold text-heading">User Agent:</span> {selectedEvent.userAgent}
                  </div>
                )}
              </div>

              {/* Acknowledgement Metadata if applicable */}
              {selectedEvent.status === 'ACKNOWLEDGED' && selectedEvent.acknowledgedBy && (
                <div className="bg-green-50 p-3 rounded-lg border border-green-200 text-xs space-y-1 text-green-900">
                  <p className="font-semibold flex items-center gap-1">
                    <Icons.CheckCircle className="w-4 h-4 text-green-600" /> Event Acknowledged
                  </p>
                  <p>By: {selectedEvent.acknowledgedBy?.name || selectedEvent.acknowledgedBy?.email || selectedEvent.acknowledgedBy}</p>
                  {selectedEvent.acknowledgedAt && <p>At: {new Date(selectedEvent.acknowledgedAt).toLocaleString()}</p>}
                </div>
              )}

              {/* Structured Changes / Data Details */}
              {selectedEvent.changes && Object.keys(selectedEvent.changes).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted uppercase mb-2">Operation Metadata / Changes</p>
                  <div className="bg-gray-900 text-gray-100 p-3 sm:p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-48">
                    <pre>{JSON.stringify(selectedEvent.changes, null, 2)}</pre>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-border bg-gray-50 flex flex-wrap items-center justify-between gap-2">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 border border-border rounded-btn text-xs sm:text-sm text-heading hover:bg-white font-medium transition-colors"
              >
                Close
              </button>

              {selectedEvent.status === 'OPEN' && (
                <button
                  onClick={(e) => handleAcknowledge(e, selectedEvent._id)}
                  className="px-4 py-2 bg-green-600 text-white rounded-btn hover:bg-green-700 text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors"
                >
                  <Icons.Check className="w-4 h-4" /> Acknowledge Event
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
