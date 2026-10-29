import { useState, useEffect, useMemo } from 'react';
import { usersAPI, divisionsAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useStudentSync } from '../../context/StudentSyncContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function AcademicDivisions() {
  const { user } = useAuth();
  const { getAuthoritativeStudent, notifyStudentUpdated, lastSyncTimestamp } = useStudentSync();

  const [selectedSemester, setSelectedSemester] = useState('1');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchByDiv, setSearchByDiv] = useState({ A: '', B: '', C: '' });

  // Selection & Bulk Action State
  const [selectedStudentIds, setSelectedStudentIds] = useState(new Set());
  const [bulkTargetDiv, setBulkTargetDiv] = useState('');
  const [isAssigningBulk, setIsAssigningBulk] = useState(false);

  // Single Add Modal State
  const [assignModalDiv, setAssignModalDiv] = useState(null);
  const [selectedStudentToAdd, setSelectedStudentToAdd] = useState('');

  // CSV Import Modal State
  const [showCsvModal, setShowCsvModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [selectedCsvFile, setSelectedCsvFile] = useState(null);
  const [csvValidation, setCsvValidation] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedCsvFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result || '';
      handleParseCsv(text);
    };
    reader.readAsText(file);
  };


  // Auto Distribution Modal State
  const [showAutoDistModal, setShowAutoDistModal] = useState(false);
  const [autoDistScope, setAutoDistScope] = useState('all'); // 'all' or 'selected'
  const [autoDistDivisions, setAutoDistDivisions] = useState(['A', 'B', 'C']);

  const deptName = user?.department?.name || user?.departmentName || 'Computer Engineering';
  const deptId = user?.department?._id || user?.department;

  const divisions = ['A', 'B', 'C'];

  useEffect(() => {
    fetchStudents();
  }, [deptId, selectedSemester, lastSyncTimestamp]);

  // Fetch all students for the department using backend pagination to handle 200+ students without cap
  const fetchStudents = async () => {
    setLoading(true);
    try {
      let page = 1;
      let allRawStudents = [];
      let totalPages = 1;

      // 1. Fetch first page with limit: 100
      const res = await usersAPI.getAll({
        role: 'student',
        department: deptId,
        page: 1,
        limit: 100
      });

      const firstBatch = res.data.data || res.data || [];
      allRawStudents = [...firstBatch];

      if (res.data.pagination && res.data.pagination.totalPages) {
        totalPages = res.data.pagination.totalPages;
      }

      // 2. Fetch all remaining pages asynchronously if totalPages > 1
      if (totalPages > 1) {
        const pagePromises = [];
        for (let p = 2; p <= totalPages; p++) {
          pagePromises.push(usersAPI.getAll({
            role: 'student',
            department: deptId,
            page: p,
            limit: 100
          }));
        }
        const results = await Promise.allSettled(pagePromises);
        results.forEach(r => {
          if (r.status === 'fulfilled') {
            const batch = r.value.data.data || r.value.data || [];
            allRawStudents = [...allRawStudents, ...batch];
          }
        });
      }

      // 3. Filter for active selected semester
      const filtered = allRawStudents
        .map(s => getAuthoritativeStudent(s))
        .filter(s => String(s.currentSemester || 1) === String(selectedSemester));

      setStudents(filtered);
      setSelectedStudentIds(new Set()); // Clear selection on semester change
    } catch (err) {
      toast.error('Failed to load students for division management');
    } finally {
      setLoading(false);
    }
  };

  // Single student division update
  const handleChangeDivision = async (studentId, newDivision) => {
    try {
      await usersAPI.update(studentId, { division: newDivision });
      notifyStudentUpdated(studentId, { division: newDivision });
      toast.success(`Assigned student to Division ${newDivision}`);
      fetchStudents();
    } catch (err) {
      toast.error('Failed to update student division');
    }
  };

  // Bulk assignment via backend endpoint POST /api/admin/divisions/assign
  const handleBulkAssign = async (targetDivision) => {
    if (!targetDivision || selectedStudentIds.size === 0) return;
    const idsArray = Array.from(selectedStudentIds);
    setIsAssigningBulk(true);

    try {
      const res = await divisionsAPI.assignStudents({
        studentIds: idsArray,
        division: targetDivision
      });

      toast.success(res.data.message || `Assigned ${idsArray.length} students to Division ${targetDivision}`);

      // Sync updated students in global context
      idsArray.forEach(id => {
        notifyStudentUpdated(id, { division: targetDivision });
      });

      setSelectedStudentIds(new Set());
      setBulkTargetDiv('');
      fetchStudents();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to perform bulk division assignment';
      toast.error(msg);
    } finally {
      setIsAssigningBulk(false);
    }
  };

  // Selection Toggle Helpers
  const toggleStudentSelection = (studentId) => {
    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (next.has(studentId)) {
        next.delete(studentId);
      } else {
        next.add(studentId);
      }
      return next;
    });
  };

  const toggleSelectAllDiv = (divStudents) => {
    const divIds = divStudents.map(s => s._id);
    const allSelected = divIds.every(id => selectedStudentIds.has(id));

    setSelectedStudentIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        divIds.forEach(id => next.delete(id));
      } else {
        divIds.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const selectAllSemesterStudents = () => {
    const allIds = students.map(s => s._id);
    setSelectedStudentIds(new Set(allIds));
  };

  const clearSelection = () => {
    setSelectedStudentIds(new Set());
  };

  // CSV Parsing & All-or-Nothing Validation
  const handleParseCsv = (rawText) => {
    setCsvText(rawText);
    if (!rawText.trim()) {
      setCsvValidation(null);
      return;
    }

    const lines = rawText.trim().split(/\r?\n/);
    if (lines.length < 2) {
      setCsvValidation({
        isValid: false,
        totalRows: 0,
        validCount: 0,
        invalidCount: 1,
        errors: [{ row: 1, reason: 'CSV file must contain a header row and at least one data row.' }],
        validAssignments: []
      });
      return;
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/^["']|["']$/g, ''));
    let idColIdx = headers.findIndex(h => h.includes('id') || h.includes('enroll') || h.includes('roll') || h.includes('email') || h.includes('student'));
    let divColIdx = headers.findIndex(h => h.includes('div') || h.includes('sec') || h.includes('group'));

    if (idColIdx === -1) idColIdx = 0;
    if (divColIdx === -1) divColIdx = 1;

    const errors = [];
    const validAssignments = [];
    const seenIdsInCsv = new Set();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const rowNum = i + 1;
      const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));

      const identifier = cols[idColIdx] || '';
      const rawDiv = (cols[divColIdx] || '').toUpperCase();

      if (!identifier) {
        errors.push({ row: rowNum, identifier: 'N/A', reason: 'Student identifier (ID/Roll/Email) is required' });
        continue;
      }

      if (!rawDiv || !['A', 'B', 'C'].includes(rawDiv)) {
        errors.push({ row: rowNum, identifier, reason: `Invalid division "${rawDiv}". Division must be A, B, or C.` });
        continue;
      }

      // Match against currently loaded semester students
      const matchedStudent = students.find(s =>
        s._id === identifier ||
        (s.enrollmentNumber && s.enrollmentNumber.toLowerCase() === identifier.toLowerCase()) ||
        (s.studentId && s.studentId.toLowerCase() === identifier.toLowerCase()) ||
        (s.email && s.email.toLowerCase() === identifier.toLowerCase()) ||
        (s.personalEmail && s.personalEmail.toLowerCase() === identifier.toLowerCase())
      );

      if (!matchedStudent) {
        errors.push({ row: rowNum, identifier, reason: `Student "${identifier}" not found in Semester ${selectedSemester}` });
        continue;
      }

      if (seenIdsInCsv.has(matchedStudent._id)) {
        errors.push({ row: rowNum, identifier, reason: `Duplicate assignment for student ${matchedStudent.name} (${identifier}) in CSV` });
        continue;
      }
      seenIdsInCsv.add(matchedStudent._id);

      validAssignments.push({
        studentId: matchedStudent._id,
        name: matchedStudent.name,
        enrollmentNumber: matchedStudent.enrollmentNumber || matchedStudent.studentId || 'N/A',
        targetDivision: rawDiv
      });
    }

    const isValid = errors.length === 0 && validAssignments.length > 0;
    setCsvValidation({
      isValid,
      totalRows: lines.length - 1,
      validCount: validAssignments.length,
      invalidCount: errors.length,
      errors,
      validAssignments
    });
  };

  // Apply CSV Assignment (All-or-Nothing verified)
  const handleApplyCsvAssignment = async () => {
    if (!csvValidation || !csvValidation.isValid || csvValidation.validAssignments.length === 0) return;

    setIsAssigningBulk(true);
    try {
      // Group valid assignments by target division
      const divGroups = { A: [], B: [], C: [] };
      csvValidation.validAssignments.forEach(item => {
        if (divGroups[item.targetDivision]) {
          divGroups[item.targetDivision].push(item.studentId);
        }
      });

      let totalSuccess = 0;
      for (const targetDiv of ['A', 'B', 'C']) {
        const studentIds = divGroups[targetDiv];
        if (studentIds.length > 0) {
          const res = await divisionsAPI.assignStudents({ studentIds, division: targetDiv });
          totalSuccess += studentIds.length;
          studentIds.forEach(id => notifyStudentUpdated(id, { division: targetDiv }));
        }
      }

      toast.success(`CSV Import Completed: Assigned ${totalSuccess} students to divisions.`);
      setShowCsvModal(false);
      setCsvText('');
      setCsvValidation(null);
      fetchStudents();
    } catch (err) {
      toast.error('Failed to apply CSV division assignments');
    } finally {
      setIsAssigningBulk(false);
    }
  };

  // Calculate Auto Distribution preview
  const autoDistPreview = useMemo(() => {
    const targetPool = autoDistScope === 'selected'
      ? students.filter(s => selectedStudentIds.has(s._id))
      : students;

    const validDivs = autoDistDivisions.length > 0 ? autoDistDivisions : ['A', 'B', 'C'];
    const totalCount = targetPool.length;
    if (totalCount === 0) return null;

    const numDivs = validDivs.length;
    const baseCount = Math.floor(totalCount / numDivs);
    const remainder = totalCount % numDivs;

    const divCounts = {};
    const divAssignments = {};

    validDivs.forEach((div, index) => {
      const allocated = baseCount + (index < remainder ? 1 : 0);
      divCounts[div] = allocated;
      divAssignments[div] = [];
    });

    // Sort students deterministically by enrollment number / name
    const sortedPool = [...targetPool].sort((a, b) => {
      const idA = a.enrollmentNumber || a.studentId || a.name || '';
      const idB = b.enrollmentNumber || b.studentId || b.name || '';
      return idA.localeCompare(idB);
    });

    let divIndex = 0;
    sortedPool.forEach(student => {
      const targetDiv = validDivs[divIndex];
      divAssignments[targetDiv].push(student._id);

      if (divAssignments[targetDiv].length >= divCounts[targetDiv]) {
        divIndex++;
      }
    });

    return {
      totalStudents: totalCount,
      divCounts,
      divAssignments
    };
  }, [students, selectedStudentIds, autoDistScope, autoDistDivisions]);

  // Execute Auto Distribution
  const handleConfirmAutoDistribute = async () => {
    if (!autoDistPreview) return;

    setIsAssigningBulk(true);
    try {
      let totalAssigned = 0;
      for (const [targetDiv, studentIds] of Object.entries(autoDistPreview.divAssignments)) {
        if (studentIds.length > 0) {
          await divisionsAPI.assignStudents({ studentIds, division: targetDiv });
          totalAssigned += studentIds.length;
          studentIds.forEach(id => notifyStudentUpdated(id, { division: targetDiv }));
        }
      }

      toast.success(`Auto Distribution Completed: Assigned ${totalAssigned} students across Divisions.`);
      setShowAutoDistModal(false);
      setSelectedStudentIds(new Set());
      fetchStudents();
    } catch (err) {
      toast.error('Failed to execute auto distribution');
    } finally {
      setIsAssigningBulk(false);
    }
  };

  // Download CSV template matching the existing importer format
  const handleDownloadCsvTemplate = () => {
    const csvContent = 'studentId,division\n24172012001,A\n24172012002,B\n24172012003,C\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'division_assignment_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Downloaded CSV template');
  };

  const handleSearchChange = (div, value) => {
    setSearchByDiv(prev => ({ ...prev, [div]: value }));
  };

  const getInitials = (name) => {
    if (!name) return 'ST';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // Eligible students for manual Add modal
  const candidatesToAdd = useMemo(() => {
    if (!assignModalDiv) return [];
    return students.filter(s => (s.division || 'A') !== assignModalDiv);
  }, [students, assignModalDiv]);

  return (
    <div className="space-y-6">
      {/* Page Header & Top Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
            <Icons.Grid className="w-6 h-6 text-primary" />
            Divisions & Sections
          </h1>
          <p className="text-xs text-muted mt-1">
            Manage student division allocations, bulk assignments, CSV importing, and auto-distribution for {deptName}.
          </p>
        </div>

        {/* Global Controls & Actions */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Download CSV Template Button */}
          <button
            type="button"
            onClick={handleDownloadCsvTemplate}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-200 rounded-xl transition flex items-center gap-1.5 shadow-xs"
          >
            <Icons.Download className="w-3.5 h-3.5 text-emerald-600" />
            Download CSV Template
          </button>

          {/* CSV Bulk Import Button */}
          <button
            type="button"
            onClick={() => {
              setShowCsvModal(true);
              setCsvText('');
              setSelectedCsvFile(null);
              setCsvValidation(null);
            }}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-200 rounded-xl transition flex items-center gap-1.5 shadow-xs"
          >
            <Icons.Upload className="w-3.5 h-3.5 text-blue-600" />
            CSV Import
          </button>



          {/* Auto Distribute Button */}
          <button
            type="button"
            onClick={() => setShowAutoDistModal(true)}
            className="px-3.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs border border-slate-200 rounded-xl transition flex items-center gap-1.5 shadow-xs"
          >
            <Icons.Refresh className="w-3.5 h-3.5 text-indigo-600" />
            Auto Distribute
          </button>

          {/* Semester Selector */}
          <div className="flex items-center gap-2 bg-surface px-3 py-1.5 border border-border rounded-xl shadow-xs">
            <label htmlFor="semester-select" className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              Semester:
            </label>
            <div className="relative">
              <select
                id="semester-select"
                value={selectedSemester}
                onChange={e => setSelectedSemester(e.target.value)}
                className="text-xs font-bold text-heading bg-transparent pr-6 pl-2 py-1 rounded-lg border border-slate-200 hover:border-slate-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 cursor-pointer appearance-none"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                  <option key={s} value={s}>Semester {s}</option>
                ))}
              </select>
              <Icons.ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Select Bulk Actions Sticky Toolbar */}
      {selectedStudentIds.size > 0 && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-card p-4 shadow-lg flex flex-wrap items-center justify-between gap-4 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-full bg-white/20 font-bold text-xs flex items-center justify-center">
              {selectedStudentIds.size}
            </span>
            <div>
              <p className="font-bold text-sm">
                {selectedStudentIds.size} Student{selectedStudentIds.size > 1 ? 's' : ''} Selected
              </p>
              <p className="text-[11px] text-blue-100">Semester {selectedSemester} &bull; {deptName}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs text-blue-100 font-medium">Assign Selected To:</span>
            {['A', 'B', 'C'].map(divLetter => (
              <button
                key={divLetter}
                type="button"
                disabled={isAssigningBulk}
                onClick={() => handleBulkAssign(divLetter)}
                className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-900 font-bold text-xs rounded-lg transition shadow-xs disabled:opacity-50"
              >
                Division {divLetter}
              </button>
            ))}

            <button
              type="button"
              onClick={clearSelection}
              className="px-3 py-1.5 bg-blue-800/60 hover:bg-blue-800 text-white font-semibold text-xs rounded-lg transition ml-2 border border-blue-400/40"
            >
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {/* Overview Stats Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3 text-xs">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-heading">
            Total Semester {selectedSemester} Students: <strong className="text-primary font-bold">{students.length}</strong>
          </span>
          <span className="text-slate-400">|</span>
          <span className="text-muted">
            Div A: {students.filter(s => (s.division || 'A') === 'A').length} &bull; Div B: {students.filter(s => (s.division || 'A') === 'B').length} &bull; Div C: {students.filter(s => (s.division || 'A') === 'C').length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={selectAllSemesterStudents}
            className="text-xs text-blue-600 font-semibold hover:underline"
          >
            Select All {students.length} Students
          </button>
          {selectedStudentIds.size > 0 && (
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-slate-500 font-medium hover:underline ml-2"
            >
              Deselect All
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="p-12 text-center text-xs text-muted flex items-center justify-center gap-2 bg-surface rounded-card border border-border">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          Loading student cohort for Semester {selectedSemester}...
        </div>
      ) : (
        /* Division Cards Grid */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {divisions.map(div => {
            const divStudents = students.filter(s => (s.division || 'A') === div);
            const query = (searchByDiv[div] || '').toLowerCase().trim();
            const filteredDivStudents = divStudents.filter(st => {
              if (!query) return true;
              const nameMatch = st.name?.toLowerCase().includes(query);
              const rollMatch = (st.enrollmentNumber || st.studentId || '').toLowerCase().includes(query);
              return nameMatch || rollMatch;
            });

            const isAllDivSelected = divStudents.length > 0 && divStudents.every(s => selectedStudentIds.has(s._id));

            return (
              <div
                key={div}
                className="bg-surface rounded-card shadow-card border border-border p-5 space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  {/* Division Header */}
                  <div className="flex justify-between items-center border-b border-border pb-3">
                    <div className="flex items-center gap-2.5">
                      {/* Checkbox for Select All in Division */}
                      <input
                        type="checkbox"
                        checked={isAllDivSelected}
                        onChange={() => toggleSelectAllDiv(divStudents)}
                        title={`Select all students in Division ${div}`}
                        className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                      />
                      <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 font-bold flex items-center justify-center text-xs shadow-2xs">
                        {div}
                      </span>
                      <div>
                        <h3 className="font-bold text-sm text-heading">Division {div}</h3>
                        <p className="text-[11px] text-muted">Semester {selectedSemester}</p>
                      </div>
                    </div>

                    {/* Student Count Badge */}
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200">
                      {divStudents.length} Students
                    </span>
                  </div>

                  {/* Student Search */}
                  {(divStudents.length > 0 || searchByDiv[div]) && (
                    <div className="relative">
                      <Icons.Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search by name or roll number..."
                        value={searchByDiv[div] || ''}
                        onChange={e => handleSearchChange(div, e.target.value)}
                        className="form-input w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border-slate-200 focus:border-primary"
                      />
                      {searchByDiv[div] && (
                        <button
                          type="button"
                          onClick={() => handleSearchChange(div, '')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                          title="Clear search"
                        >
                          <Icons.X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Student List / Empty State */}
                  {divStudents.length === 0 ? (
                    <div className="py-12 px-4 text-center space-y-2 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-blue-600">
                        <Icons.Users className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-heading">No students assigned</p>
                        <p className="text-[11px] text-muted max-w-[200px] mx-auto mt-0.5">
                          Students assigned to Division {div} will appear here.
                        </p>
                      </div>
                    </div>
                  ) : filteredDivStudents.length === 0 ? (
                    <div className="py-8 text-center text-xs text-muted bg-slate-50 rounded-xl border border-border">
                      No students matching "{searchByDiv[div]}".
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1.5 pb-1">
                      {filteredDivStudents.map(st => {
                        const isSelected = selectedStudentIds.has(st._id);
                        return (
                          <div
                            key={st._id}
                            className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-2.5 shadow-2xs ${
                              isSelected
                                ? 'bg-blue-50/80 border-blue-300 ring-1 ring-blue-300'
                                : 'bg-white hover:bg-slate-50/80 border-slate-200/80'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleStudentSelection(st._id)}
                                className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer shrink-0"
                              />
                              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 border border-slate-200/60 shadow-2xs">
                                {getInitials(st.name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-xs text-heading truncate leading-tight" title={st.name}>
                                  {st.name}
                                </p>
                                <p className="font-mono text-[11px] text-blue-600 font-medium truncate mt-0.5" title={st.enrollmentNumber || st.studentId || ''}>
                                  {st.enrollmentNumber || st.studentId || 'No ID'}
                                </p>
                              </div>
                            </div>
                            <div className="shrink-0 w-[84px] relative">
                              <select
                                value={st.division || 'A'}
                                onChange={e => handleChangeDivision(st._id, e.target.value)}
                                className="w-full text-xs font-semibold py-1.5 pl-2.5 pr-6 bg-slate-50 hover:bg-white text-slate-700 border border-slate-200 hover:border-slate-300 rounded-lg cursor-pointer transition focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 appearance-none shadow-2xs"
                                title="Reassign division"
                              >
                                {divisions.map(d => (
                                  <option key={d} value={d}>Div {d}</option>
                                ))}
                              </select>
                              <Icons.ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Add Student Action */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAssignModalDiv(div);
                      setSelectedStudentToAdd('');
                    }}
                    className="w-full py-2 px-3 border border-dashed border-blue-200 hover:border-blue-500 text-blue-600 hover:bg-blue-50 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <Icons.Plus className="w-3.5 h-3.5" />
                    Add Student to Division {div}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Single Add Student Modal */}
      {assignModalDiv && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#0f172a]/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl border border-border w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-slate-50/70">
              <div>
                <h2 className="text-base font-bold text-heading">Add Student to Division {assignModalDiv}</h2>
                <p className="text-xs text-muted">Select a Semester {selectedSemester} student to assign.</p>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalDiv(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-200/60 transition"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {candidatesToAdd.length === 0 ? (
                <p className="text-xs text-muted text-center py-4 bg-slate-50 rounded-xl border border-border">
                  All Semester {selectedSemester} students are already in Division {assignModalDiv}.
                </p>
              ) : (
                <div>
                  <label className="block text-[11px] font-semibold text-heading uppercase mb-1.5">
                    Select Student ({candidatesToAdd.length} eligible)
                  </label>
                  <select
                    value={selectedStudentToAdd}
                    onChange={e => setSelectedStudentToAdd(e.target.value)}
                    className="form-input w-full text-xs font-medium"
                  >
                    <option value="">-- Choose a student --</option>
                    {candidatesToAdd.map(st => (
                      <option key={st._id} value={st._id}>
                        {st.name} ({st.enrollmentNumber || st.studentId || 'No ID'}) - Current Div: {st.division || 'Unassigned'}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setAssignModalDiv(null)}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedStudentToAdd}
                onClick={async () => {
                  if (!selectedStudentToAdd) return;
                  await handleChangeDivision(selectedStudentToAdd, assignModalDiv);
                  setAssignModalDiv(null);
                }}
                className="btn-primary text-xs font-semibold px-4 py-2 rounded-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Assign to Division {assignModalDiv}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Bulk Import Modal */}
      {showCsvModal && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#0f172a]/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl border border-border w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs">
                  <Icons.Upload className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-heading">CSV Division Import</h2>
                  <p className="text-xs text-muted">Upload CSV to bulk-assign students to divisions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCsvModal(false);
                  setCsvValidation(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
              {/* CSV File Upload Area */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-heading uppercase mb-1">
                  Select CSV File
                </label>
                <div className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-2xl p-6 text-center bg-slate-50/50 hover:bg-blue-50/30 transition-all cursor-pointer relative group">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  />
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
                    <Icons.Upload className="w-6 h-6" />
                  </div>
                  {selectedCsvFile ? (
                    <div>
                      <p className="text-xs font-bold text-heading truncate max-w-xs mx-auto">
                        {selectedCsvFile.name}
                      </p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {(selectedCsvFile.size / 1024).toFixed(1)} KB &bull; Click or drag to change file
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs font-bold text-heading">
                        Click to browse or drag and drop your .csv file here
                      </p>
                      <p className="text-[11px] text-muted mt-1">
                        Select a CSV file containing student identifiers and division assignments.
                      </p>
                    </div>
                  )}
                </div>
              </div>


              {/* Validation Summary Display */}
              {csvValidation && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-xs font-semibold">
                    <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-800 border">
                      Total: {csvValidation.totalRows}
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Valid: {csvValidation.validCount}
                    </span>
                    {csvValidation.invalidCount > 0 && (
                      <span className="px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200">
                        Invalid: {csvValidation.invalidCount}
                      </span>
                    )}
                  </div>

                  {/* Errors Table */}
                  {csvValidation.invalidCount > 0 && (
                    <div className="p-3 bg-red-50/80 border border-red-200 rounded-xl space-y-2">
                      <p className="text-xs font-bold text-red-800">
                        Validation Errors ({csvValidation.invalidCount}): All-or-nothing check failed
                      </p>
                      <div className="max-h-36 overflow-y-auto space-y-1 text-[11px] font-mono">
                        {csvValidation.errors.map((err, idx) => (
                          <div key={idx} className="p-1.5 bg-white rounded border border-red-200 text-red-700">
                            Row {err.row}: [{err.identifier}] &bull; {err.reason}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Valid Preview Summary */}
                  {csvValidation.isValid && csvValidation.validAssignments.length > 0 && (
                    <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-2 text-xs">
                      <p className="font-bold text-emerald-800 flex items-center gap-1.5">
                        <Icons.CheckCircle className="w-4 h-4 text-emerald-600" />
                        All CSV Rows Validated Successfully
                      </p>
                      <p className="text-slate-600 text-[11px]">
                        Ready to bulk-assign {csvValidation.validAssignments.length} student records across Divisions A, B, C.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowCsvModal(false);
                  setCsvValidation(null);
                }}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!csvValidation || !csvValidation.isValid || isAssigningBulk}
                onClick={handleApplyCsvAssignment}
                className="btn-primary text-xs font-semibold px-4 py-2 rounded-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAssigningBulk ? 'Applying Assignments...' : 'Apply CSV Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Distribution Modal */}
      {showAutoDistModal && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#0f172a]/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl border border-border w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">
                  <Icons.Refresh className="w-4 h-4" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-heading">Auto Distribute Cohort</h2>
                  <p className="text-xs text-muted">Automatically distribute students evenly across divisions</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAutoDistModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Scope Selection */}
              <div>
                <label className="block text-xs font-bold text-heading uppercase mb-1.5">
                  Target Student Scope
                </label>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <label className={`p-3 rounded-xl border cursor-pointer transition ${autoDistScope === 'all' ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'bg-slate-50 border-slate-200'}`}>
                    <input
                      type="radio"
                      name="distScope"
                      value="all"
                      checked={autoDistScope === 'all'}
                      onChange={() => setAutoDistScope('all')}
                      className="mr-2"
                    />
                    <strong className="text-slate-900">All Semester Students</strong>
                    <p className="text-[11px] text-muted mt-0.5">{students.length} students</p>
                  </label>

                  <label className={`p-3 rounded-xl border cursor-pointer transition ${autoDistScope === 'selected' ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300' : 'bg-slate-50 border-slate-200'}`}>
                    <input
                      type="radio"
                      name="distScope"
                      value="selected"
                      disabled={selectedStudentIds.size === 0}
                      checked={autoDistScope === 'selected'}
                      onChange={() => setAutoDistScope('selected')}
                      className="mr-2"
                    />
                    <strong className="text-slate-900">Selected Students Only</strong>
                    <p className="text-[11px] text-muted mt-0.5">{selectedStudentIds.size} selected</p>
                  </label>
                </div>
              </div>

              {/* Division Checkboxes */}
              <div>
                <label className="block text-xs font-bold text-heading uppercase mb-1.5">
                  Distribute Among Divisions
                </label>
                <div className="flex gap-4 text-xs font-semibold">
                  {['A', 'B', 'C'].map(div => (
                    <label key={div} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={autoDistDivisions.includes(div)}
                        onChange={e => {
                          if (e.target.checked) {
                            setAutoDistDivisions(prev => [...prev, div].sort());
                          } else if (autoDistDivisions.length > 1) {
                            setAutoDistDivisions(prev => prev.filter(d => d !== div));
                          }
                        }}
                        className="w-4 h-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500"
                      />
                      Division {div}
                    </label>
                  ))}
                </div>
              </div>

              {/* Calculated Distribution Preview */}
              {autoDistPreview && (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 text-xs">
                  <p className="font-bold text-heading flex items-center gap-1.5">
                    <Icons.BarChart className="w-4 h-4 text-indigo-600" />
                    Calculated Distribution Preview ({autoDistPreview.totalStudents} Students)
                  </p>
                  <div className="grid grid-cols-3 gap-3 text-center">
                    {Object.entries(autoDistPreview.divCounts).map(([div, count]) => (
                      <div key={div} className="p-2.5 bg-white border border-slate-200 rounded-lg">
                        <span className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 font-bold text-[11px] inline-flex items-center justify-center mb-1">
                          {div}
                        </span>
                        <p className="text-base font-extrabold text-slate-900">{count}</p>
                        <p className="text-[10px] text-muted">Division {div}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-border bg-slate-50 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAutoDistModal(false)}
                className="btn-secondary text-xs px-4 py-2"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!autoDistPreview || isAssigningBulk}
                onClick={handleConfirmAutoDistribute}
                className="btn-primary text-xs font-semibold px-4 py-2 rounded-btn disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAssigningBulk ? 'Distributing...' : 'Confirm & Apply Auto Distribution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
