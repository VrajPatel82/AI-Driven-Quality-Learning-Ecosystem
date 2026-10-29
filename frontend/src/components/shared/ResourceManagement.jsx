import React, { useState, useEffect } from 'react';
import { resourcesAPI, adminAPI, usersAPI, universitiesAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { Icons } from './Icons';

export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export default function ResourceManagement({ role }) {
  const [overview, setOverview] = useState(null);
  const [allocations, setAllocations] = useState([]);
  const [history, setHistory] = useState([]);
  const [files, setFiles] = useState([]);
  const [aiUsage, setAiUsage] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [reconciliation, setReconciliation] = useState(null);
  const [syncingB2, setSyncingB2] = useState(false);

  // Allocation Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState(null);
  const [targetOptions, setTargetOptions] = useState([]);
  const [formData, setFormData] = useState({
    resourceType: 'STORAGE',
    childId: '',
    allocatedAmount: '',
    unit: 'GB',
    reason: ''
  });

  // History filtering state
  const [historyActionFilter, setHistoryActionFilter] = useState('ALL');
  const [historyTargetFilter, setHistoryTargetFilter] = useState('ALL');

  // Expandable child rows in overview
  const [expandedChildRows, setExpandedChildRows] = useState({});
  const toggleExpandChildRow = (id) => setExpandedChildRows(prev => ({ ...prev, [id]: !prev[id] }));

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const calls = [
        resourcesAPI.getOverview(),
        resourcesAPI.getAllocations(),
        resourcesAPI.getHistory(),
        resourcesAPI.getFiles(),
        resourcesAPI.getAIUsage()
      ];
      if (role === 'super_admin' || role === 'university_admin') {
        calls.push(resourcesAPI.getReconciliation());
      }

      const results = await Promise.allSettled(calls);

      if (results[0].status === 'fulfilled') {
        setOverview(results[0].value.data.data);
      } else {
        console.error('Failed to load overview:', results[0].reason);
        setLoadError(results[0].reason?.response?.data?.message || 'Unable to load storage overview. Please check connection and try again.');
      }

      if (results[1].status === 'fulfilled') setAllocations(results[1].value.data.data || []);
      if (results[2].status === 'fulfilled') setHistory(results[2].value.data.data || []);
      if (results[3].status === 'fulfilled') setFiles(results[3].value.data.data || []);
      if (results[4].status === 'fulfilled') setAiUsage(results[4].value.data.data || []);
      if (results[5] && results[5].status === 'fulfilled') setReconciliation(results[5].value.data.data);
    } catch (err) {
      console.error('Fetch data error:', err);
      setLoadError('Unable to load storage information. Please refresh and try again.');
      toast.error('Failed to load resource data');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncB2 = async () => {
    setSyncingB2(true);
    try {
      await resourcesAPI.syncB2();
      toast.success('Backblaze B2 storage scan completed successfully');
      await fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to sync with Backblaze B2');
    } finally {
      setSyncingB2(false);
    }
  };

  const handleOpenCreateModal = async () => {
    setEditingAllocation(null);
    setFormData({
      resourceType: 'STORAGE',
      childId: '',
      allocatedAmount: '',
      unit: 'GB',
      reason: ''
    });
    fetchTargetOptions();
    setShowModal(true);
  };

  const handleOpenEditModal = (alloc) => {
    setEditingAllocation(alloc);
    let amountDisplay = alloc.allocatedAmount;
    let unit = 'COUNT';
    if (alloc.resourceType === 'STORAGE') {
      if (alloc.allocatedAmount >= 1024 * 1024 * 1024 * 1024 * 1024) {
        amountDisplay = alloc.allocatedAmount / (1024 * 1024 * 1024 * 1024 * 1024);
        unit = 'PB';
      } else if (alloc.allocatedAmount >= 1024 * 1024 * 1024 * 1024) {
        amountDisplay = alloc.allocatedAmount / (1024 * 1024 * 1024 * 1024);
        unit = 'TB';
      } else if (alloc.allocatedAmount >= 1024 * 1024 * 1024) {
        amountDisplay = alloc.allocatedAmount / (1024 * 1024 * 1024);
        unit = 'GB';
      } else if (alloc.allocatedAmount >= 1024 * 1024) {
        amountDisplay = alloc.allocatedAmount / (1024 * 1024);
        unit = 'MB';
      } else {
        unit = 'BYTES';
      }
    }
    setFormData({
      resourceType: alloc.resourceType,
      childId: alloc.childId?._id || alloc.childId,
      allocatedAmount: amountDisplay,
      unit,
      reason: ''
    });
    setShowModal(true);
  };

  const fetchTargetOptions = async () => {
    try {
      if (role === 'super_admin') {
        const res = await universitiesAPI.getAll();
        setTargetOptions(res.data.data || res.data || []);
      } else if (role === 'university_admin') {
        const res = await adminAPI.getInstitutions();
        setTargetOptions(res.data.data || res.data || []);
      } else if (role === 'inst_admin') {
        const res = await adminAPI.getDepartments();
        setTargetOptions(res.data.data || res.data || []);
      } else if (role === 'dept_admin') {
        const res = await usersAPI.getAll({ role: 'professor', limit: 100 });
        setTargetOptions(res.data.data || res.data || []);
      }
    } catch (e) {
      console.error(e);
      setTargetOptions([]);
    }
  };

  const handleSubmitAllocation = async (e) => {
    e.preventDefault();
    if (!editingAllocation && !formData.childId) {
      toast.error('Please select a target recipient');
      return;
    }
    try {
      let rawAmount = Number(formData.allocatedAmount);
      if (formData.resourceType === 'STORAGE') {
        if (formData.unit === 'PB') rawAmount *= 1024 * 1024 * 1024 * 1024 * 1024;
        else if (formData.unit === 'TB') rawAmount *= 1024 * 1024 * 1024 * 1024;
        else if (formData.unit === 'GB') rawAmount *= 1024 * 1024 * 1024;
        else if (formData.unit === 'MB') rawAmount *= 1024 * 1024;
        else if (formData.unit === 'KB') rawAmount *= 1024;
      }

      if (editingAllocation) {
        await resourcesAPI.updateAllocation(editingAllocation._id, {
          allocatedAmount: rawAmount,
          reason: formData.reason
        });
        toast.success('Allocation updated successfully');
      } else {
        let parentLevel = 'SUPER_ADMIN';
        let childLevel = 'UNIVERSITY';
        if (role === 'university_admin') {
          parentLevel = 'UNIVERSITY';
          childLevel = 'INSTITUTION';
        } else if (role === 'inst_admin') {
          parentLevel = 'INSTITUTION';
          childLevel = 'DEPARTMENT';
        } else if (role === 'dept_admin') {
          parentLevel = 'DEPARTMENT';
          childLevel = 'PROFESSOR';
        }

        await resourcesAPI.createAllocation({
          resourceType: formData.resourceType,
          parentLevel,
          parentId: overview?.scope?.id || null,
          childLevel,
          childId: formData.childId,
          allocatedAmount: rawAmount,
          reason: formData.reason
        });
        toast.success('Allocation created successfully');
      }

      setShowModal(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const handleRevoke = async (id) => {
    if (!window.confirm('Are you sure you want to revoke this allocation?')) return;
    try {
      await resourcesAPI.revokeAllocation(id);
      toast.success('Allocation revoked successfully');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Revoke failed');
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-48"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div></div>;
  }

  const { storage, meteredAI, aiTutor } = overview || {};

  const totalCapBytes = storage?.totalCapacity || storage?.allocated || 0;
  const usedCapBytes = storage?.used || 0;
  const remainingCapBytes = totalCapBytes > 0 ? Math.max(0, totalCapBytes - usedCapBytes) : (storage?.remaining || 0);
  const percentageCapUsed = totalCapBytes > 0 ? Number(((usedCapBytes / totalCapBytes) * 100).toFixed(2)) : (storage?.percentageUsed || 0);

  const availableTabs = ['overview', 'allocations', 'files', 'history'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-heading">Commercial Resource Management</h2>
          <p className="text-xs sm:text-sm text-muted">Authoritative Storage Resource Allocation & Cloud Usage Overview</p>
        </div>
        {['super_admin', 'university_admin', 'inst_admin', 'dept_admin'].includes(role) && (
          <button onClick={handleOpenCreateModal} className="btn-primary flex items-center justify-center gap-2 w-full sm:w-auto">
            <span>+</span> Allocate Storage
          </button>
        )}
      </div>

      {/* Top Cards Grid */}
      <div className="grid grid-cols-1 gap-6">
        {/* Storage Card */}
        <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5">
              <Icons.HardDrive className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0 mt-0.5 sm:mt-0" />
              <div>
                <span className="text-sm font-semibold text-heading block">
                  {role === 'super_admin' ? 'APPLICATION MASTER STORAGE POOL' : role === 'university_admin' ? 'UNIVERSITY STORAGE POOL' : role === 'inst_admin' ? 'INSTITUTION STORAGE POOL' : role === 'dept_admin' ? 'DEPARTMENT STORAGE POOL' : 'STORAGE CAPACITY'}
                </span>
                <span className="text-xs text-muted block">
                  {role === 'super_admin'
                    ? 'Configured Educational Platform Budget & Backblaze B2 Verification'
                    : role === 'university_admin'
                      ? 'Authoritative university quota allocation and physical storage usage'
                      : role === 'inst_admin'
                        ? 'Authoritative institution quota allocation and physical storage usage'
                        : role === 'dept_admin'
                          ? 'Authoritative department quota allocation and physical storage usage'
                          : 'Physical storage quota and usage'}
                </span>
              </div>
            </div>

            {role === 'super_admin' && (
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${storage?.b2Status?.syncStatus === 'SUCCESS' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'}`}>
                  ● {storage?.b2Status?.syncStatus === 'SUCCESS' ? 'B2 Connected' : 'B2 Sync Pending'}
                </span>
                <span className="text-xs text-muted whitespace-nowrap">
                  Last Sync: {storage?.b2Status?.lastSyncedAt ? new Date(storage.b2Status.lastSyncedAt).toLocaleTimeString() : 'Pending'}
                </span>
                <button
                  onClick={handleSyncB2}
                  disabled={syncingB2}
                  className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-heading text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors"
                >
                  <span className={syncingB2 ? 'animate-spin' : ''}>🔄</span>
                  {syncingB2 ? 'Scanning B2...' : 'Refresh B2 Usage'}
                </button>
              </div>
            )}
          </div>

          {/* Over-Allocation Banner for Super Admin */}
          {role === 'super_admin' && storage?.isOverAllocated && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-900 text-sm space-y-1">
              <div className="font-bold flex items-center gap-2">
                <span>⚠️</span>
                <span>OVER-ALLOCATED SYSTEM STATE (MIGRATION REQUIRED)</span>
              </div>
              <p className="text-xs text-red-700">
                Existing university allocations ({formatBytes(storage?.allocated)}) exceed the configured master storage pool ({formatBytes(storage?.masterPoolBytes)}) by {formatBytes(storage?.overAllocatedBytes)}. The system is in migration mode. New allocations are blocked until university quotas are adjusted to fit within the master pool.
              </p>
            </div>
          )}

          {/* Global Low Storage Warning */}
          {role === 'super_admin' && storage?.globalLowStorageWarning && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs font-medium">
              ⚠️ WARNING: Global Application Storage Pool is almost full (≤ 5% remaining capacity). Consider requesting quota expansion.
            </div>
          )}

          {role === 'super_admin' ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center">
                <div className="bg-gray-50 p-3 rounded-lg border border-border">
                  <span className="text-xs text-muted block font-semibold">APPLICATION POOL</span>
                  <span className="text-lg sm:text-xl font-bold text-heading mt-1 block">{formatBytes(storage?.masterPoolBytes || totalCapBytes)}</span>
                  <span className="text-[10px] text-muted">Configured Budget</span>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                  <span className="text-xs text-purple-700 block font-semibold">B2 ACTUAL USAGE</span>
                  <span className="text-lg sm:text-xl font-bold text-purple-800 mt-1 block">{formatBytes(storage?.b2ActualUsage || 0)}</span>
                  <span className="text-[10px] text-purple-600">Cloud Reality</span>
                </div>
                <div className="bg-teal-50 p-3 rounded-lg border border-teal-100">
                  <span className="text-xs text-teal-700 block font-semibold">REMAINING CAPACITY</span>
                  <span className="text-lg sm:text-xl font-bold text-teal-800 mt-1 block">{formatBytes(storage?.b2RemainingCapacity ?? remainingCapBytes)}</span>
                  <span className="text-[10px] text-teal-600">Pool - Cloud Usage</span>
                </div>
                <div className={`p-3 rounded-lg border ${storage?.isOverAllocated ? 'bg-red-50 border-red-200' : 'bg-blue-50 border-blue-100'}`}>
                  <span className={`text-xs block font-semibold ${storage?.isOverAllocated ? 'text-red-700' : 'text-blue-700'}`}>
                    ALLOCATED {storage?.isOverAllocated && '(OVER)'}
                  </span>
                  <span className={`text-lg sm:text-xl font-bold mt-1 block ${storage?.isOverAllocated ? 'text-red-800' : 'text-blue-800'}`}>
                    {formatBytes(storage?.distributed)}
                  </span>
                  <span className="text-[10px] text-muted">To Universities</span>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100 col-span-2 md:col-span-1">
                  <span className="text-xs text-green-700 block font-semibold">AVAILABLE TO ALLOCATE</span>
                  <span className="text-lg sm:text-xl font-bold text-green-800 mt-1 block">{formatBytes(storage?.unallocated)}</span>
                  <span className="text-[10px] text-green-600">Unallocated Quota</span>
                </div>
              </div>
              <div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${percentageCapUsed > 90 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(percentageCapUsed, 100)}%` }}></div>
                </div>
                <div className="flex flex-col sm:flex-row sm:justify-between text-xs text-muted mt-1.5 gap-1">
                  <span>{percentageCapUsed}% Cloud Usage of {formatBytes(storage?.masterPoolBytes || totalCapBytes)} Pool</span>
                  <span>{formatBytes(storage?.b2RemainingCapacity ?? remainingCapBytes)} Remaining Platform Capacity</span>
                </div>
              </div>
            </div>
          ) : ['university_admin', 'inst_admin', 'dept_admin'].includes(role) ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div className="bg-gray-50 p-3 rounded-lg border border-border">
                  <span className="text-xs text-muted block font-semibold uppercase">
                    {role === 'university_admin' ? 'University Quota' : role === 'inst_admin' ? 'Institution Quota' : 'Department Quota'}
                  </span>
                  <span className="text-xl font-bold text-heading mt-1 block">{formatBytes(storage?.allocated || totalCapBytes)}</span>
                  <span className="text-[10px] text-muted">Allocated by Parent</span>
                </div>
                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                  <span className="text-xs text-purple-700 block font-semibold uppercase">ACTUAL USED</span>
                  <span className="text-xl font-bold text-purple-800 mt-1 block">{formatBytes(storage?.used || usedCapBytes)}</span>
                  <span className="text-[10px] text-purple-600">Active Files</span>
                </div>
                <div className="bg-teal-50 p-3 rounded-lg border border-teal-100">
                  <span className="text-xs text-teal-700 block font-semibold uppercase">REMAINING</span>
                  <span className="text-xl font-bold text-teal-800 mt-1 block">{formatBytes(storage?.remaining ?? remainingCapBytes)}</span>
                  <span className="text-[10px] text-teal-600">Quota - Usage</span>
                </div>
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-100">
                  <span className="text-xs text-blue-700 block font-semibold uppercase">DISTRIBUTED</span>
                  <span className="text-xl font-bold text-blue-800 mt-1 block">{formatBytes(storage?.distributed || 0)}</span>
                  <span className="text-[10px] text-blue-600">
                    {role === 'university_admin' ? 'To Institutions' : role === 'inst_admin' ? 'To Departments' : 'To Professors'}
                  </span>
                </div>
                <div className="bg-green-50 p-3 rounded-lg border border-green-100">
                  <span className="text-xs text-green-700 block font-semibold uppercase">AVAILABLE TO ALLOCATE</span>
                  <span className="text-xl font-bold text-green-800 mt-1 block">{formatBytes(storage?.availableToAllocate ?? storage?.unallocated ?? 0)}</span>
                  <span className="text-[10px] text-green-600">Unallocated Quota</span>
                </div>
              </div>
              <div>
                <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${percentageCapUsed > 90 ? 'bg-red-500' : 'bg-blue-600'}`}
                    style={{ width: `${Math.min(percentageCapUsed, 100)}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-muted mt-1.5">
                  <span>{percentageCapUsed}% Used of {formatBytes(storage?.allocated || totalCapBytes)} Quota</span>
                  <span>{formatBytes(storage?.remaining ?? remainingCapBytes)} Remaining Storage</span>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-bold">{formatBytes(usedCapBytes)} <span className="text-xs font-normal text-muted">/ {formatBytes(totalCapBytes)}</span></p>
              <div className="w-full bg-gray-100 h-2.5 rounded-full mt-2 overflow-hidden">
                <div className={`h-full rounded-full ${percentageCapUsed > 90 ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${Math.min(percentageCapUsed, 100)}%` }}></div>
              </div>
              <div className="flex flex-wrap items-center justify-between text-xs text-muted mt-1.5 gap-1">
                <span>{percentageCapUsed}% Used</span>
                <span>{formatBytes(remainingCapBytes)} Remaining</span>
              </div>
              {['university_admin', 'inst_admin', 'dept_admin'].includes(role) && (
                <div className="pt-2 border-t border-border flex justify-between text-xs text-muted mt-2">
                  <span>Distributed to Children: {formatBytes(storage?.distributed)}</span>
                  <span>Available to Allocate: {formatBytes(storage?.unallocated)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Error state alert if overview failed */}
      {loadError && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Error:</span>
            <span className="text-sm">{loadError}</span>
          </div>
          <button
            onClick={fetchData}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-border flex gap-2 sm:gap-4 text-sm font-medium overflow-x-auto no-scrollbar">
        {availableTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 capitalize transition-colors whitespace-nowrap px-1 shrink-0 ${activeTab === tab ? 'border-b-2 border-blue-600 text-blue-600 font-semibold' : 'text-muted hover:text-heading'}`}
          >
            {tab === 'b2-cloud' ? 'Backblaze B2 & Reconciliation' : tab.replace('-', ' ')}
          </button>
        ))}
      </div>

      {/* Tab Contents */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* University Storage Overview (Super Admin only) */}
          {role === 'super_admin' && (
            <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-heading">University Storage Overview</h3>
                  <p className="text-xs sm:text-sm text-muted">Authoritative multi-tenant storage quotas and physical usage by university</p>
                </div>
                <div className="text-xs text-muted">
                  Total Universities: <span className="font-semibold text-heading">{storage?.universityOverview?.length || 0}</span>
                </div>
              </div>

              {(!storage?.universityOverview || storage.universityOverview.length === 0) ? (
                <div className="text-center py-8 text-muted text-sm border border-dashed rounded-lg">
                  No universities registered yet.
                </div>
              ) : (
                <>
                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs uppercase text-muted bg-gray-50">
                          <th className="py-3 px-4 font-semibold">University</th>
                          <th className="py-3 px-4 font-semibold">Allocated</th>
                          <th className="py-3 px-4 font-semibold">Used</th>
                          <th className="py-3 px-4 font-semibold">Remaining</th>
                          <th className="py-3 px-4 font-semibold">Usage</th>
                          <th className="py-3 px-4 font-semibold text-center">Status</th>
                          <th className="py-3 px-4 font-semibold text-right">Files</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {storage.universityOverview.map((univ) => {
                          const usagePct = Number(univ.usagePercentage || 0);
                          const isFull = usagePct >= 100;
                          const isCritical = usagePct >= 95;
                          const isWarning = usagePct >= 80 && usagePct < 95;

                          const statusLabel = isFull ? 'Full' : isCritical ? 'Critical' : isWarning ? 'Warning' : 'Healthy';
                          const statusClass = isFull
                            ? 'bg-red-100 text-red-800'
                            : isCritical
                              ? 'bg-rose-100 text-rose-800'
                              : isWarning
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-green-100 text-green-800';

                          const barColor = isCritical || isFull ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-blue-600';

                          return (
                            <tr key={univ.universityId} className="hover:bg-gray-50 transition-colors">
                              <td className="py-3 px-4">
                                <span className="font-semibold text-heading block">{univ.name}</span>
                                <span className="text-xs text-muted uppercase font-mono">{univ.code}</span>
                              </td>
                              <td className="py-3 px-4 font-medium text-heading">
                                {univ.allocatedFormatted || formatBytes(univ.allocated)}
                              </td>
                              <td className="py-3 px-4 font-medium text-purple-700">
                                {univ.usedFormatted || formatBytes(univ.used)}
                              </td>
                              <td className="py-3 px-4 font-medium text-teal-700">
                                {univ.remainingFormatted || formatBytes(univ.remaining)}
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2">
                                  <div className="w-24 bg-gray-200 h-2 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${barColor}`}
                                      style={{ width: `${Math.min(usagePct, 100)}%` }}
                                    ></div>
                                  </div>
                                  <span className={`text-xs font-semibold ${isCritical || isFull ? 'text-red-600' : isWarning ? 'text-amber-700' : 'text-heading'}`}>
                                    {usagePct.toFixed(1)}%
                                  </span>
                                </div>
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusClass}`}>
                                  {statusLabel}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right text-muted font-mono text-xs">
                                {univ.fileCount || 0}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Responsive Cards */}
                  <div className="block md:hidden divide-y divide-border">
                    {storage.universityOverview.map((univ) => {
                      const usagePct = Number(univ.usagePercentage || 0);
                      const isFull = usagePct >= 100;
                      const isCritical = usagePct >= 95;
                      const isWarning = usagePct >= 80 && usagePct < 95;

                      const statusLabel = isFull ? 'Full' : isCritical ? 'Critical' : isWarning ? 'Warning' : 'Healthy';
                      const statusClass = isFull
                        ? 'bg-red-100 text-red-800'
                        : isCritical
                          ? 'bg-rose-100 text-rose-800'
                          : isWarning
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-green-100 text-green-800';

                      const barColor = isCritical || isFull ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-blue-600';

                      return (
                        <div key={univ.universityId} className="py-3.5 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span className="font-semibold text-heading text-sm block">{univ.name}</span>
                              <span className="text-xs text-muted uppercase font-mono">{univ.code}</span>
                            </div>
                            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${statusClass}`}>
                              {statusLabel}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="text-muted">Usage</span>
                              <span className={`font-semibold ${isCritical || isFull ? 'text-red-600' : isWarning ? 'text-amber-700' : 'text-heading'}`}>
                                {usagePct.toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${barColor}`}
                                style={{ width: `${Math.min(usagePct, 100)}%` }}
                              ></div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                            <div className="bg-gray-50 p-2 rounded border border-border">
                              <span className="text-muted block text-[11px]">Allocated</span>
                              <span className="font-semibold text-heading">{univ.allocatedFormatted || formatBytes(univ.allocated)}</span>
                            </div>
                            <div className="bg-purple-50/50 p-2 rounded border border-purple-100">
                              <span className="text-purple-600 block text-[11px]">Used</span>
                              <span className="font-semibold text-purple-700">{univ.usedFormatted || formatBytes(univ.used)}</span>
                            </div>
                            <div className="bg-teal-50/50 p-2 rounded border border-teal-100">
                              <span className="text-teal-600 block text-[11px]">Remaining</span>
                              <span className="font-semibold text-teal-700">{univ.remainingFormatted || formatBytes(univ.remaining)}</span>
                            </div>
                            <div className="bg-gray-50 p-2 rounded border border-border">
                              <span className="text-muted block text-[11px]">Files</span>
                              <span className="font-semibold font-mono text-heading">{univ.fileCount || 0}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Child Storage Overview (University Admin, Institution Admin, Department Admin) */}
          {['university_admin', 'inst_admin', 'dept_admin'].includes(role) && (() => {
            const childItems = role === 'university_admin'
              ? (storage?.institutionOverview || storage?.childOverview || [])
              : role === 'inst_admin'
                ? (storage?.departmentOverview || storage?.childOverview || [])
                : (storage?.professorOverview || storage?.childOverview || []);

            const tierMeta = role === 'university_admin' ? {
              title: 'Institutions Storage Overview',
              subtitle: 'Authoritative multi-tenant storage quotas and physical usage by institution',
              entityColumn: 'Institution',
              emptyMessage: 'No institutions registered under this university yet.',
              totalLabel: 'Total Institutions',
              childTierName: 'Departments'
            } : role === 'inst_admin' ? {
              title: 'Departments Storage Overview',
              subtitle: 'Authoritative storage quotas and physical usage by department',
              entityColumn: 'Department',
              emptyMessage: 'No departments registered under this institution yet.',
              totalLabel: 'Total Departments',
              childTierName: 'Professors'
            } : {
              title: 'Professors Storage Overview',
              subtitle: 'Authoritative storage quotas and physical usage by professor',
              entityColumn: 'Professor',
              emptyMessage: 'No professors registered under this department yet.',
              totalLabel: 'Total Professors',
              childTierName: null
            };

            return (
              <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h3 className="text-base sm:text-lg font-semibold text-heading">{tierMeta.title}</h3>
                    <p className="text-xs sm:text-sm text-muted">{tierMeta.subtitle}</p>
                  </div>
                  <div className="text-xs text-muted">
                    {tierMeta.totalLabel}: <span className="font-semibold text-heading">{childItems.length}</span>
                  </div>
                </div>

                {childItems.length === 0 ? (
                  <div className="text-center py-8 text-muted text-sm border border-dashed rounded-lg">
                    {tierMeta.emptyMessage}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-border text-xs uppercase text-muted bg-gray-50">
                          <th className="py-3 px-4 font-semibold">{tierMeta.entityColumn}</th>
                          <th className="py-3 px-4 font-semibold">Allocated</th>
                          <th className="py-3 px-4 font-semibold">Used</th>
                          <th className="py-3 px-4 font-semibold">Remaining</th>
                          <th className="py-3 px-4 font-semibold">Usage</th>
                          <th className="py-3 px-4 font-semibold text-center">Status</th>
                          <th className="py-3 px-4 font-semibold text-right">Files</th>
                          {tierMeta.childTierName && (
                            <th className="py-3 px-4 font-semibold text-center">Details</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {childItems.map((item) => {
                          const itemId = (item.institutionId || item.departmentId || item.professorId || '').toString();
                          const usagePct = Number(item.usagePercentage || 0);
                          const isFull = usagePct >= 100;
                          const isCritical = usagePct >= 95;
                          const isWarning = usagePct >= 80 && usagePct < 95;

                          const statusLabel = isFull ? 'Full' : isCritical ? 'Critical' : isWarning ? 'Warning' : 'Healthy';
                          const statusClass = isFull
                            ? 'bg-red-100 text-red-800'
                            : isCritical
                              ? 'bg-rose-100 text-rose-800'
                              : isWarning
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-green-100 text-green-800';

                          const barColor = isCritical || isFull ? 'bg-red-500' : isWarning ? 'bg-amber-500' : 'bg-blue-600';
                          const nestedChildren = item.departments || item.professors || [];
                          const isExpanded = !!expandedChildRows[itemId];

                          return (
                            <React.Fragment key={itemId}>
                              <tr className="hover:bg-gray-50 transition-colors">
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    {tierMeta.childTierName && nestedChildren.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => toggleExpandChildRow(itemId)}
                                        className="text-muted hover:text-heading p-1 rounded hover:bg-gray-100 transition"
                                        title={isExpanded ? 'Collapse' : 'Expand'}
                                      >
                                        <span className="text-xs font-mono">{isExpanded ? '▼' : '▶'}</span>
                                      </button>
                                    )}
                                    <div>
                                      <span className="font-semibold text-heading block">{item.name}</span>
                                      <span className="text-xs text-muted uppercase font-mono">{item.code || item.email}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-4 font-medium text-heading">
                                  {item.allocatedFormatted || formatBytes(item.allocated)}
                                </td>
                                <td className="py-3 px-4 font-medium text-purple-700">
                                  {item.usedFormatted || formatBytes(item.used)}
                                </td>
                                <td className="py-3 px-4 font-medium text-teal-700">
                                  {item.remainingFormatted || formatBytes(item.remaining)}
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-24 bg-gray-200 h-2 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full rounded-full ${barColor}`}
                                        style={{ width: `${Math.min(usagePct, 100)}%` }}
                                      ></div>
                                    </div>
                                    <span className={`text-xs font-semibold ${isCritical || isFull ? 'text-red-600' : isWarning ? 'text-amber-700' : 'text-heading'}`}>
                                      {usagePct.toFixed(1)}%
                                    </span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${statusClass}`}>
                                    {statusLabel}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right text-muted font-mono text-xs">
                                  {item.fileCount || 0}
                                </td>
                                {tierMeta.childTierName && (
                                  <td className="py-3 px-4 text-center">
                                    {nestedChildren.length > 0 ? (
                                      <button
                                        type="button"
                                        onClick={() => toggleExpandChildRow(itemId)}
                                        className="text-xs text-blue-600 hover:text-blue-800 font-medium underline"
                                      >
                                        {isExpanded ? 'Hide' : `${nestedChildren.length} ${tierMeta.childTierName}`}
                                      </button>
                                    ) : (
                                      <span className="text-xs text-muted">0 {tierMeta.childTierName}</span>
                                    )}
                                  </td>
                                )}
                              </tr>

                              {/* Accordion / Expanded row for sub-tier */}
                              {isExpanded && nestedChildren.length > 0 && (
                                <tr className="bg-gray-50/80">
                                  <td colSpan={tierMeta.childTierName ? 8 : 7} className="p-4 pl-12 border-b border-border">
                                    <div className="bg-white rounded-lg border border-border p-4 shadow-sm">
                                      <h4 className="text-xs font-semibold text-muted uppercase mb-3">
                                        {tierMeta.childTierName} in {item.name}
                                      </h4>
                                      <div className="overflow-x-auto">
                                        <table className="w-full text-left text-xs">
                                          <thead>
                                            <tr className="border-b border-gray-200 text-muted uppercase">
                                              <th className="py-2 px-3">{tierMeta.childTierName.slice(0, -1)}</th>
                                              <th className="py-2 px-3">Allocated</th>
                                              <th className="py-2 px-3">Used</th>
                                              <th className="py-2 px-3">Remaining</th>
                                              <th className="py-2 px-3">Usage</th>
                                              <th className="py-2 px-3 text-right">Files</th>
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-100">
                                            {nestedChildren.map((sub) => {
                                              const subPct = Number(sub.usagePercentage || 0);
                                              const subBar = subPct >= 95 ? 'bg-red-500' : subPct >= 80 ? 'bg-amber-500' : 'bg-blue-600';
                                              return (
                                                <tr key={sub.departmentId || sub.professorId} className="hover:bg-gray-50">
                                                  <td className="py-2 px-3 font-medium text-heading">
                                                    {sub.name}
                                                    <span className="text-[10px] text-muted block">{sub.code || sub.email}</span>
                                                  </td>
                                                  <td className="py-2 px-3">{sub.allocatedFormatted || formatBytes(sub.allocated)}</td>
                                                  <td className="py-2 px-3 text-purple-700">{sub.usedFormatted || formatBytes(sub.used)}</td>
                                                  <td className="py-2 px-3 text-teal-700">{sub.remainingFormatted || formatBytes(sub.remaining)}</td>
                                                  <td className="py-2 px-3">
                                                    <div className="flex items-center gap-1.5">
                                                      <div className="w-16 bg-gray-200 h-1.5 rounded-full overflow-hidden">
                                                        <div className={`h-full ${subBar}`} style={{ width: `${Math.min(subPct, 100)}%` }}></div>
                                                      </div>
                                                      <span className="font-semibold">{subPct.toFixed(1)}%</span>
                                                    </div>
                                                  </td>
                                                  <td className="py-2 px-3 text-right font-mono">{sub.fileCount || 0}</td>
                                                </tr>
                                              );
                                            })}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Compact Technical Informational Note */}
          <div className="p-3.5 bg-gray-50 rounded-lg border border-border flex flex-col sm:flex-row sm:items-center justify-between text-xs text-muted gap-2">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="font-semibold text-heading">Storage Ledger Note:</span>
              <span>Storage usage is calculated from active physical file metadata (<code className="bg-gray-200 px-1 py-0.5 rounded text-[11px]">isDeleted: false</code>) and verified against Backblaze B2.</span>
            </div>
            {storage?.b2Status?.lastSyncedAt && (
              <span className="text-[11px] text-muted whitespace-nowrap shrink-0">
                Last Cloud Sync: {new Date(storage.b2Status.lastSyncedAt).toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>
      )}

      {activeTab === 'allocations' && (
        <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
          <div className="p-4 border-b border-border font-semibold">Active Allocations</div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">Resource Type</th>
                  <th className="px-4 py-3 text-left">Child Target</th>
                  <th className="px-4 py-3 text-right">Allocated Amount</th>
                  <th className="px-4 py-3 text-center">Updated</th>
                  {['super_admin', 'university_admin', 'inst_admin', 'dept_admin'].includes(role) && <th className="px-4 py-3 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {allocations.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-6 text-muted">No allocations found</td></tr>
                ) : (
                  allocations.map((alloc) => (
                    <tr key={alloc._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${alloc.resourceType === 'STORAGE' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                          {alloc.resourceType}
                        </span>
                      </td>
                      <td className="px-4 py-3">{alloc.childId?.name || alloc.childId?.code || alloc.childId}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {alloc.resourceType === 'STORAGE' ? formatBytes(alloc.allocatedAmount) : `${alloc.allocatedAmount?.toLocaleString()} reqs`}
                      </td>
                      <td className="px-4 py-3 text-center text-xs text-muted">{new Date(alloc.updatedAt).toLocaleDateString()}</td>
                      {['super_admin', 'university_admin', 'inst_admin', 'dept_admin'].includes(role) && (
                        <td className="px-4 py-3 text-center space-x-2">
                          <button onClick={() => handleOpenEditModal(alloc)} className="text-blue-600 hover:underline text-xs">Edit</button>
                          <button onClick={() => handleRevoke(alloc._id)} className="text-red-600 hover:underline text-xs">Revoke</button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Allocations Cards */}
          <div className="block md:hidden divide-y divide-border">
            {allocations.length === 0 ? (
              <div className="text-center py-6 text-muted text-sm">No allocations found</div>
            ) : (
              allocations.map((alloc) => (
                <div key={alloc._id} className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${alloc.resourceType === 'STORAGE' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                      {alloc.resourceType}
                    </span>
                    <span className="text-xs text-muted">
                      Updated: {new Date(alloc.updatedAt).toLocaleDateString()}
                    </span>
                  </div>

                  <div>
                    <span className="text-xs text-muted block">Target:</span>
                    <span className="text-sm font-semibold text-heading block">
                      {alloc.childId?.name || alloc.childId?.code || alloc.childId}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
                    <div>
                      <span className="text-muted block text-[11px]">Allocated:</span>
                      <span className="text-sm font-bold text-heading">
                        {alloc.resourceType === 'STORAGE' ? formatBytes(alloc.allocatedAmount) : `${alloc.allocatedAmount?.toLocaleString()} reqs`}
                      </span>
                    </div>
                    {['super_admin', 'university_admin', 'inst_admin', 'dept_admin'].includes(role) && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleOpenEditModal(alloc)}
                          className="px-3 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleRevoke(alloc._id)}
                          className="px-3 py-1.5 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded transition-colors"
                        >
                          Revoke
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'files' && (
        <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
          <div className="p-4 border-b border-border font-semibold">Active Storage Files (FileMetadata)</div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-border text-muted">
                <tr>
                  <th className="px-4 py-3 text-left">File Name</th>
                  <th className="px-4 py-3 text-left">Entity Type</th>
                  <th className="px-4 py-3 text-left">Owner</th>
                  <th className="px-4 py-3 text-right">Size</th>
                  <th className="px-4 py-3 text-center">Uploaded</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {files.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-6 text-muted">No active storage files</td></tr>
                ) : (
                  files.map((file) => (
                    <tr key={file._id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium truncate max-w-xs">{file.fileName}</td>
                      <td className="px-4 py-3"><span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{file.relatedEntityType}</span></td>
                      <td className="px-4 py-3 text-xs">{file.owner?.name || 'User'}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatBytes(file.fileSizeBytes)}</td>
                      <td className="px-4 py-3 text-center text-xs text-muted">{new Date(file.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Files Cards */}
          <div className="block md:hidden divide-y divide-border">
            {files.length === 0 ? (
              <div className="text-center py-6 text-muted text-sm">No active storage files</div>
            ) : (
              files.map((file) => (
                <div key={file._id} className="p-4 space-y-2.5">
                  <div className="min-w-0">
                    <span className="text-xs text-muted block mb-0.5">File Name:</span>
                    <span className="text-sm font-medium text-heading block break-all" title={file.fileName}>
                      {file.fileName}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-border/60">
                    <div>
                      <span className="text-muted block text-[11px]">Entity Type:</span>
                      <span className="bg-gray-100 text-slate-700 px-1.5 py-0.5 rounded text-[11px] font-medium inline-block mt-0.5">
                        {file.relatedEntityType}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted block text-[11px]">Owner:</span>
                      <span className="font-medium text-heading text-xs block truncate mt-0.5">
                        {file.owner?.name || 'User'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted block text-[11px]">Size:</span>
                      <span className="font-semibold text-heading text-xs block mt-0.5">
                        {formatBytes(file.fileSizeBytes)}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted block text-[11px]">Uploaded:</span>
                      <span className="text-muted text-xs block mt-0.5">
                        {new Date(file.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'history' && (() => {
        // Summary metrics calculation
        const totalChanges = history.length;
        const allocationsCount = history.filter(h => h.action === 'ALLOCATED').length;
        const increasesCount = history.filter(h => h.action === 'INCREASED').length;
        const decreasesCount = history.filter(h => h.action === 'DECREASED').length;
        const revocationsCount = history.filter(h => h.action === 'REVOKED').length;

        // Apply filters
        const filteredHistory = history.filter(h => {
          if (historyActionFilter !== 'ALL' && h.action !== historyActionFilter) return false;
          if (historyTargetFilter !== 'ALL' && h.childLevel !== historyTargetFilter) return false;
          return true;
        });

        // Resolve human-friendly target display
        const getTargetDisplay = (h) => {
          const childObj = h.childId;
          const level = h.childLevel || 'ENTITY';
          const tierLabel = level === 'SUPER_ADMIN' ? 'Super Admin'
            : level === 'UNIVERSITY' ? 'University'
              : level === 'INSTITUTION' ? 'Institution'
                : level === 'DEPARTMENT' ? 'Department'
                  : level === 'PROFESSOR' ? 'Professor'
                    : level;

          if (!childObj) {
            return { name: 'Target no longer available', level, tierLabel, code: null, isAvailable: false, status: null };
          }
          if (typeof childObj === 'object') {
            const name = childObj.name || childObj.email || (childObj.code ? `${childObj.code}` : null);
            if (!name) {
              return { name: 'Target no longer available', level, tierLabel, code: null, isAvailable: false, status: null };
            }
            const isInactive = childObj.status === 'inactive' || childObj.isDeleted;
            return {
              name,
              level,
              tierLabel,
              code: childObj.code || childObj.professorId,
              isAvailable: true,
              status: isInactive ? 'Inactive' : null
            };
          }
          // If childId is an unpopulated string ID (e.g. entity was deleted)
          return { name: 'Target no longer available', level, tierLabel, code: null, isAvailable: false, status: null };
        };

        // Format previous allocation display
        const formatPrevious = (h) => {
          if (h.action === 'ALLOCATED' && (!h.previousAllocation || h.previousAllocation === 0)) {
            return 'No previous allocation';
          }
          if (!h.previousAllocation || h.previousAllocation === 0) {
            return '0 B';
          }
          return h.resourceType === 'STORAGE' ? formatBytes(h.previousAllocation) : `${h.previousAllocation}`;
        };

        // Format new allocation display
        const formatNew = (h) => {
          if (h.action === 'REVOKED' || h.newAllocation === 0) {
            return '0 B';
          }
          return h.resourceType === 'STORAGE' ? formatBytes(h.newAllocation) : `${h.newAllocation}`;
        };

        // Format difference display
        const formatDifference = (h) => {
          const diff = h.difference || 0;
          if (h.action === 'REVOKED') {
            const prev = h.previousAllocation || Math.abs(diff) || 0;
            return { text: `-${formatBytes(prev)}`, style: 'text-red-700 bg-red-50 border-red-200' };
          }
          if (diff > 0) {
            return {
              text: `+${h.resourceType === 'STORAGE' ? formatBytes(diff) : diff}`,
              style: 'text-green-700 bg-green-50 border-green-200'
            };
          } else if (diff < 0) {
            return {
              text: `-${h.resourceType === 'STORAGE' ? formatBytes(Math.abs(diff)) : Math.abs(diff)}`,
              style: 'text-amber-700 bg-amber-50 border-amber-200'
            };
          }
          return { text: '0 B', style: 'text-muted bg-gray-50 border-gray-200' };
        };

        // Format action label
        const getActionBadge = (action) => {
          switch (action) {
            case 'ALLOCATED':
              return { label: 'Allocated', style: 'bg-blue-100 text-blue-800 border-blue-200' };
            case 'INCREASED':
              return { label: 'Increased', style: 'bg-green-100 text-green-800 border-green-200' };
            case 'DECREASED':
              return { label: 'Decreased', style: 'bg-amber-100 text-amber-800 border-amber-200' };
            case 'REVOKED':
              return { label: 'Revoked', style: 'bg-red-100 text-red-800 border-red-200' };
            default:
              return { label: action || 'Modified', style: 'bg-gray-100 text-gray-800 border-gray-200' };
          }
        };

        return (
          <div className="space-y-4">
            {/* Simple Compact Filter Bar */}
            <div className="bg-surface rounded-card shadow-card border border-border p-3 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 w-full sm:w-auto">
                <span className="text-xs font-semibold text-muted uppercase tracking-wider">Filter:</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full sm:w-auto">
                  <select
                    value={historyActionFilter}
                    onChange={(e) => setHistoryActionFilter(e.target.value)}
                    className="form-input text-xs py-1.5 px-3 rounded w-full sm:w-auto"
                  >
                    <option value="ALL">All Actions</option>
                    <option value="ALLOCATED">Allocated</option>
                    <option value="INCREASED">Increased</option>
                    <option value="DECREASED">Decreased</option>
                    <option value="REVOKED">Revoked</option>
                  </select>

                  <select
                    value={historyTargetFilter}
                    onChange={(e) => setHistoryTargetFilter(e.target.value)}
                    className="form-input text-xs py-1.5 px-3 rounded w-full sm:w-auto"
                  >
                    <option value="ALL">All Recipient Tiers</option>
                    <option value="UNIVERSITY">Universities</option>
                    <option value="INSTITUTION">Institutions</option>
                    <option value="DEPARTMENT">Departments</option>
                    <option value="PROFESSOR">Professors</option>
                  </select>
                </div>
              </div>

              <div className="text-xs text-muted">
                Showing <span className="font-semibold text-heading">{filteredHistory.length}</span> of {history.length} records
              </div>
            </div>

            {/* Simple Clean History Table */}
            <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
              <div className="p-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-heading">Storage Allocation History</h3>
                  <p className="text-xs text-muted">Log of all storage quota additions, adjustments, and revocations</p>
                </div>
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-border text-xs uppercase text-muted">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Date & Time</th>
                      <th className="px-4 py-3 text-left font-semibold">Action</th>
                      <th className="px-4 py-3 text-left font-semibold">Target</th>
                      <th className="px-4 py-3 text-right font-semibold">Previous</th>
                      <th className="px-4 py-3 text-right font-semibold">New</th>
                      <th className="px-4 py-3 text-right font-semibold">Change</th>
                      <th className="px-4 py-3 text-left font-semibold">Changed By</th>
                      <th className="px-4 py-3 text-left font-semibold">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredHistory.length === 0 ? (
                      <tr>
                        <td colSpan="8" className="text-center py-8 text-muted text-sm">
                          No allocation history records found matching criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredHistory.map((h) => {
                        const target = getTargetDisplay(h);
                        const badge = getActionBadge(h.action);
                        const diffInfo = formatDifference(h);
                        const actorObj = h.performedBy;
                        const hasActor = actorObj && (typeof actorObj === 'object') && (actorObj.name || actorObj.email);
                        const actorName = hasActor ? (actorObj.name || actorObj.email) : 'User no longer available';
                        const actorRole = hasActor && actorObj.role ? actorObj.role.replace('_', ' ') : null;
                        const reasonText = h.reason?.trim() ? h.reason : 'No reason provided';
                        const dateFormatted = new Date(h.createdAt).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short'
                        });

                        return (
                          <tr key={h._id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3.5 text-xs text-muted whitespace-nowrap">
                              {dateFormatted}
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.style}`}>
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3.5">
                              <span className={`font-semibold block ${target.isAvailable ? 'text-heading' : 'text-slate-500 italic'}`}>
                                {target.name}
                              </span>
                              <span className="text-[11px] text-muted block capitalize font-mono">
                                {target.tierLabel.toLowerCase()}{target.code ? ` • ${target.code}` : ''}{target.status ? ` • ${target.status}` : ''}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-right text-xs text-muted whitespace-nowrap">
                              {formatPrevious(h)}
                            </td>
                            <td className="px-4 py-3.5 text-right font-semibold text-heading text-xs whitespace-nowrap">
                              {formatNew(h)}
                            </td>
                            <td className="px-4 py-3.5 text-right whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-xs font-semibold border ${diffInfo.style}`}>
                                {diffInfo.text}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 text-xs">
                              <span className={`font-medium block ${hasActor ? 'text-heading' : 'text-slate-500 italic'}`}>
                                {actorName}
                              </span>
                              {actorRole && (
                                <span className="text-[10px] text-muted capitalize block">
                                  {actorRole}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3.5 text-xs text-muted max-w-xs truncate" title={reasonText}>
                              {reasonText}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile History Cards */}
              <div className="block md:hidden divide-y divide-border">
                {filteredHistory.length === 0 ? (
                  <div className="text-center py-8 text-muted text-sm">
                    No allocation history records found matching criteria.
                  </div>
                ) : (
                  filteredHistory.map((h) => {
                    const target = getTargetDisplay(h);
                    const badge = getActionBadge(h.action);
                    const diffInfo = formatDifference(h);
                    const actorObj = h.performedBy;
                    const hasActor = actorObj && (typeof actorObj === 'object') && (actorObj.name || actorObj.email);
                    const actorName = hasActor ? (actorObj.name || actorObj.email) : 'User no longer available';
                    const actorRole = hasActor && actorObj.role ? actorObj.role.replace('_', ' ') : null;
                    const reasonText = h.reason?.trim() ? h.reason : 'No reason provided';
                    const dateFormatted = new Date(h.createdAt).toLocaleString(undefined, {
                      dateStyle: 'medium',
                      timeStyle: 'short'
                    });

                    return (
                      <div key={h._id} className="p-4 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badge.style}`}>
                            {badge.label}
                          </span>
                          <span className="text-xs text-muted">
                            {dateFormatted}
                          </span>
                        </div>

                        <div>
                          <span className="text-xs text-muted block">Target:</span>
                          <span className={`font-semibold text-sm block ${target.isAvailable ? 'text-heading' : 'text-slate-500 italic'}`}>
                            {target.name}
                          </span>
                          <span className="text-[11px] text-muted block capitalize font-mono">
                            {target.tierLabel.toLowerCase()}{target.code ? ` • ${target.code}` : ''}{target.status ? ` • ${target.status}` : ''}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-2 text-xs pt-1 border-t border-border/60">
                          <div className="bg-gray-50 p-2 rounded border border-border">
                            <span className="text-muted block text-[10px]">Previous</span>
                            <span className="font-medium text-heading text-xs block truncate mt-0.5">{formatPrevious(h)}</span>
                          </div>
                          <div className="bg-gray-50 p-2 rounded border border-border">
                            <span className="text-muted block text-[10px]">New</span>
                            <span className="font-bold text-heading text-xs block truncate mt-0.5">{formatNew(h)}</span>
                          </div>
                          <div className="p-2 rounded border flex flex-col justify-between">
                            <span className="text-muted block text-[10px]">Change</span>
                            <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold border text-center mt-0.5 ${diffInfo.style}`}>
                              {diffInfo.text}
                            </span>
                          </div>
                        </div>

                        <div className="text-xs space-y-1 pt-1 border-t border-border/60">
                          <div>
                            <span className="text-muted text-[11px]">Changed By: </span>
                            <span className={`font-medium ${hasActor ? 'text-heading' : 'text-slate-500 italic'}`}>
                              {actorName}
                            </span>
                            {actorRole && (
                              <span className="text-[10px] text-muted capitalize ml-1">
                                ({actorRole})
                              </span>
                            )}
                          </div>
                          <div>
                            <span className="text-muted text-[11px]">Reason: </span>
                            <span className="text-muted break-words">
                              {reasonText}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Allocation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-surface rounded-card shadow-card border border-border w-full max-w-md p-4 sm:p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base sm:text-lg font-bold text-heading">
                {editingAllocation ? 'Edit Allocation' : 'Create Allocation'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-muted hover:text-heading p-1 rounded" aria-label="Close"><Icons.X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSubmitAllocation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-muted mb-1">RESOURCE TYPE</label>
                <input
                  type="text"
                  readOnly
                  value="STORAGE"
                  className="w-full form-input bg-gray-100 cursor-not-allowed font-semibold text-blue-700"
                />
              </div>

              {!editingAllocation && (
                <div>
                  <label className="block text-xs font-semibold text-muted mb-1">
                    {role === 'super_admin' ? 'TARGET UNIVERSITY' : role === 'university_admin' ? 'TARGET CAMPUS / INSTITUTION' : role === 'inst_admin' ? 'TARGET DEPARTMENT' : 'TARGET PROFESSOR'}
                  </label>
                  <select
                    value={formData.childId}
                    onChange={(e) => setFormData({ ...formData, childId: e.target.value })}
                    required
                    className="w-full form-input"
                  >
                    <option value="">
                      {targetOptions.length === 0
                        ? (role === 'dept_admin' ? 'No Professors Found in Department' : 'Select Recipient')
                        : `Select ${role === 'super_admin' ? 'University' : role === 'university_admin' ? 'Campus / Institution' : role === 'inst_admin' ? 'Department' : 'Professor'}`}
                    </option>
                    {targetOptions.map((opt) => (
                      <option key={opt._id} value={opt._id}>
                        {opt.name} {opt.code ? `(${opt.code})` : opt.professorId ? `(${opt.professorId})` : opt.email ? `(${opt.email})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted mb-1">AMOUNT</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={formData.allocatedAmount}
                    onChange={(e) => setFormData({ ...formData, allocatedAmount: e.target.value })}
                    className="flex-1 form-input"
                    placeholder="Enter amount"
                  />
                  {formData.resourceType === 'STORAGE' && (
                    <select
                      value={formData.unit}
                      onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                      className="form-input w-24 shrink-0"
                    >
                      <option value="MB">MB</option>
                      <option value="GB">GB</option>
                      <option value="TB">TB</option>
                      <option value="PB">PB</option>
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted mb-1">REASON / NOTES</label>
                <input
                  type="text"
                  value={formData.reason}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                  placeholder="Optional note"
                  className="w-full form-input"
                />
              </div>

              <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-3 pt-3 border-t border-border">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary w-full sm:w-auto">Cancel</button>
                <button type="submit" className="btn-primary w-full sm:w-auto">Save Allocation</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
