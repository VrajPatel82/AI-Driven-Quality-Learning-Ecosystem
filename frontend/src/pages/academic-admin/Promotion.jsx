import { useState, useEffect, useMemo } from 'react';
import { usersAPI, academicLifecycleAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useStudentSync } from '../../context/StudentSyncContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function AcademicPromotion() {
  const { user } = useAuth();
  const {
    authoritativeStudents,
    lastSyncTimestamp,
    getAuthoritativeStudent,
    notifyStudentUpdated,
    syncServerStudents
  } = useStudentSync();
  
  const [selectedSemester, setSelectedSemester] = useState('1');
  const [loading, setLoading] = useState(true);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);
  const [targetDivision, setTargetDivision] = useState('KEEP'); // 'KEEP', 'A', 'B', 'C'
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Preview / Confirmation Modal State
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [actionType, setActionType] = useState('promote'); // 'promote' or 'retain'
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const deptId = user?.department?._id || user?.department;

  // Single effect to fetch department students once on mount or when deptId / lastSyncTimestamp changes
  useEffect(() => {
    fetchCohort();
  }, [deptId, lastSyncTimestamp]);

  const fetchCohort = async () => {
    setLoading(true);
    try {
      // Limit 1000 to fetch complete department cohort without artificial 100-student cap
      const res = await usersAPI.getAll({
        role: 'student',
        department: deptId,
        limit: 1000
      });
      const raw = res.data?.data || res.data?.users || res.data || [];
      if (Array.isArray(raw) && raw.length > 0) {
        syncServerStudents(raw);
      }
    } catch {
      // Fall through to authoritative cached students
    } finally {
      setLoading(false);
    }
  };

  // Derive students in the current semester cohort reactively
  const students = useMemo(() => {
    return authoritativeStudents
      .map(s => getAuthoritativeStudent(s))
      .filter(s => {
        const sDept = s.department?._id || s.department;
        const matchDept = !deptId || !sDept || String(sDept) === String(deptId);
        return matchDept && String(s.currentSemester || 1) === String(selectedSemester);
      });
  }, [authoritativeStudents, deptId, selectedSemester, getAuthoritativeStudent]);

  // Reset selected checkboxes & pagination when semester changes
  useEffect(() => {
    setSelectedStudentIds([]);
    setCurrentPage(1);
  }, [selectedSemester]);

  // Paginated Subset
  const totalPages = Math.ceil(students.length / pageSize) || 1;
  const paginatedStudents = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return students.slice(start, start + pageSize);
  }, [students, currentPage, pageSize]);

  const toggleSelectStudent = (id) => {
    setSelectedStudentIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedStudentIds.length === students.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(students.map(s => s._id));
    }
  };

  // Open Preview Modal & Trigger Dry-Run Backend Validation
  const handleOpenPreview = async (type) => {
    setActionType(type);
    setPreviewModalOpen(true);
    setValidating(true);
    setValidationResult(null);

    const targetSem = type === 'promote' ? parseInt(selectedSemester) + 1 : parseInt(selectedSemester);
    const reason = type === 'promote' ? 'Semester Promotion' : 'Semester Retention';

    try {
      const res = await academicLifecycleAPI.transitionBulk({
        studentIds: selectedStudentIds,
        targetSemester: targetSem,
        reason,
        divisionMapping: targetDivision,
        validateOnly: true
      });
      setValidationResult(res.data);
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Validation request failed';
      const errors = err.response?.data?.errors || [msg];
      setValidationResult({
        valid: false,
        errors,
        summary: null
      });
    } finally {
      setValidating(false);
    }
  };

  // Execute Bulk Transition
  const handleExecuteBulkTransition = async () => {
    if (!validationResult || !validationResult.valid) return;

    setSubmitting(true);
    const targetSem = actionType === 'promote' ? parseInt(selectedSemester) + 1 : parseInt(selectedSemester);
    const reason = actionType === 'promote' ? 'Semester Promotion' : 'Semester Retention';

    try {
      const res = await academicLifecycleAPI.transitionBulk({
        studentIds: selectedStudentIds,
        targetSemester: targetSem,
        reason,
        divisionMapping: targetDivision,
        validateOnly: false
      });

      // Update StudentSyncContext reactively for updated students
      selectedStudentIds.forEach(stId => {
        notifyStudentUpdated(stId, {
          currentSemester: targetSem,
          ...(targetDivision !== 'KEEP' ? { division: targetDivision } : {})
        });
      });

      toast.success(res.data?.message || `Successfully processed ${selectedStudentIds.length} student(s)`);
      setPreviewModalOpen(false);
      setSelectedStudentIds([]);
      fetchCohort();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Bulk operation failed';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const nextSem = parseInt(selectedSemester) + 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Semester Promotion</h1>
        </div>

        {/* Semester Selector */}
        <div className="flex items-center gap-2 bg-surface p-1.5 border border-border rounded-xl shadow-xs">
          <span className="text-xs font-semibold text-slate-500 pl-2">Cohort:</span>
          <select
            value={selectedSemester}
            onChange={e => setSelectedSemester(e.target.value)}
            className="form-input text-xs font-bold py-1.5"
          >
            {[1, 2, 3, 4, 5, 6, 7].map(s => (
              <option key={s} value={s}>Semester {s} &rarr; Sem {s + 1}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Cohort Card */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex flex-col lg:flex-row justify-between lg:items-center gap-4 bg-slate-50/70">
          <div>
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              Eligible Semester {selectedSemester} Students ({students.length})
            </h3>
            <p className="text-xs text-muted">Permanent roll numbers and academic history remain immutable upon promotion.</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Division Selector */}
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 border border-border rounded-btn text-xs font-medium text-slate-700">
              <span className="text-slate-500 font-semibold">Division:</span>
              <select
                value={targetDivision}
                onChange={e => setTargetDivision(e.target.value)}
                className="bg-transparent border-none text-xs font-bold focus:ring-0 cursor-pointer text-slate-800"
              >
                <option value="KEEP">Keep Current</option>
                <option value="A">Assign Div A</option>
                <option value="B">Assign Div B</option>
                <option value="C">Assign Div C</option>
              </select>
            </div>

            {/* Retention Button */}
            <button
              onClick={() => handleOpenPreview('retain')}
              disabled={selectedStudentIds.length === 0}
              className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded-btn text-xs font-semibold disabled:opacity-50 transition-colors"
            >
              Do Not Promote ({selectedStudentIds.length})
            </button>

            {/* Promote Button */}
            <button
              onClick={() => handleOpenPreview('promote')}
              disabled={selectedStudentIds.length === 0}
              className="btn-primary px-4 py-1.5 rounded-btn text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 shadow-xs"
            >
              <Icons.TrendingUp className="w-4 h-4" />
              Promote to Sem {nextSem} ({selectedStudentIds.length})
            </button>
          </div>
        </div>

        {/* Selection Banner */}
        {selectedStudentIds.length > 0 && (
          <div className="px-4 py-2 bg-primary-light/40 border-b border-primary/20 flex justify-between items-center text-xs font-medium text-primary">
            <span>
              <strong>{selectedStudentIds.length}</strong> of {students.length} student(s) selected in Semester {selectedSemester} cohort.
            </span>
            <button
              onClick={() => setSelectedStudentIds([])}
              className="hover:underline font-semibold"
            >
              Clear Selection
            </button>
          </div>
        )}

        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : students.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm">
            No active students found in Semester {selectedSemester}.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                  <tr>
                    <th className="py-3 px-4 w-10">
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.length === students.length && students.length > 0}
                        onChange={selectAll}
                        className="rounded text-primary focus:ring-primary accent-primary"
                      />
                    </th>
                    <th className="py-3 px-4">Permanent Enrollment No.</th>
                    <th className="py-3 px-4">Student Name</th>
                    <th className="py-3 px-4 text-center">Current Sem</th>
                    <th className="py-3 px-4 text-center">Current Div</th>
                    <th className="py-3 px-4 text-center">Target Div</th>
                    <th className="py-3 px-4 text-center">Target Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedStudents.map(st => {
                    const isChecked = selectedStudentIds.includes(st._id);
                    const projectedDiv = targetDivision === 'KEEP' ? (st.division || 'A') : targetDivision;

                    return (
                      <tr key={st._id} className={isChecked ? 'bg-primary-light/30' : 'hover:bg-slate-50/50'}>
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleSelectStudent(st._id)}
                            className="rounded text-primary focus:ring-primary accent-primary"
                          />
                        </td>
                        <td className="py-3 px-4 font-mono text-xs font-semibold text-primary">
                          {st.enrollmentNumber || st.studentId || '21CE' + String(st._id).slice(-3)}
                        </td>
                        <td className="py-3 px-4 font-semibold text-heading">
                          {st.name}
                        </td>
                        <td className="py-3 px-4 text-center font-semibold text-xs text-heading">
                          Sem {st.currentSemester || selectedSemester}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="badge badge-info">
                            {st.division || 'A'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className={`badge ${projectedDiv !== (st.division || 'A') ? 'badge-warning' : 'badge-neutral'}`}>
                            {projectedDiv}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-xs font-semibold text-primary">
                          &rarr; Semester {nextSem}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="p-4 border-t border-border flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-600 bg-slate-50/40">
              <div className="flex items-center gap-2">
                <span>Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, students.length)} of {students.length} students</span>
                <select
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                  className="form-input text-xs py-1 px-2 font-medium"
                >
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-2.5 py-1 border border-border rounded-btn font-medium hover:bg-white disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-2 font-semibold">Page {currentPage} of {totalPages}</span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-2.5 py-1 border border-border rounded-btn font-medium hover:bg-white disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Promotion Preview Modal */}
      {previewModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-card shadow-2xl border border-border max-w-xl w-full p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5 text-slate-900">
                <Icons.TrendingUp className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-lg">
                  {actionType === 'promote' ? 'Bulk Semester Promotion Preview' : 'Bulk Semester Retention Preview'}
                </h3>
              </div>
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold"
              >
                &times;
              </button>
            </div>

            {validating ? (
              <div className="py-8 text-center space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="text-xs text-muted font-medium">Validating cohort progression batch...</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Validation Status Banner */}
                {validationResult?.valid ? (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-xs">
                    <Icons.CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <div>
                      <p className="font-bold">Validation Passed: Batch Safe for Execution</p>
                      <p className="text-emerald-700">All selected student records, department scopes, and course enrollments verified cleanly.</p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl space-y-1 text-rose-900 text-xs">
                    <div className="flex items-center gap-2 font-bold text-rose-700">
                      <Icons.AlertCircle className="w-4 h-4 flex-shrink-0" />
                      Validation Failed: Cannot Process Batch
                    </div>
                    <ul className="list-disc list-inside space-y-0.5 text-rose-700 pl-1">
                      {validationResult?.errors?.map((err, idx) => (
                        <li key={idx}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Summary Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3 rounded-xl border border-border text-center text-xs">
                  <div className="p-2 bg-white rounded-lg border border-border">
                    <span className="text-slate-500 block">Selected</span>
                    <strong className="text-slate-900 text-sm">{selectedStudentIds.length} Students</strong>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-border">
                    <span className="text-slate-500 block">Source</span>
                    <strong className="text-slate-900 text-sm">Semester {selectedSemester}</strong>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-border">
                    <span className="text-slate-500 block">Target</span>
                    <strong className="text-slate-900 text-sm">Semester {actionType === 'promote' ? nextSem : selectedSemester}</strong>
                  </div>
                  <div className="p-2 bg-white rounded-lg border border-border">
                    <span className="text-slate-500 block">Action</span>
                    <strong className="text-primary text-sm capitalize">{actionType}</strong>
                  </div>
                </div>

                {/* Division Breakdown */}
                <div className="p-3 bg-white rounded-xl border border-border space-y-1.5 text-xs">
                  <h4 className="font-bold text-slate-800 uppercase tracking-wide text-[11px]">Division Allocation Mapping</h4>
                  {targetDivision === 'KEEP' ? (
                    <p className="text-slate-600">Preserving existing student division assignments ({selectedStudentIds.length} students stay in current divisions).</p>
                  ) : (
                    <p className="text-slate-600">All <strong>{selectedStudentIds.length}</strong> selected students will be assigned to <strong>Division {targetDivision}</strong> upon transition.</p>
                  )}
                </div>

                {/* Target Course Auto-Enrollment Preview */}
                {validationResult?.summary?.targetCourses?.length > 0 && (
                  <div className="p-3 bg-white rounded-xl border border-border space-y-2 text-xs">
                    <h4 className="font-bold text-slate-800 uppercase tracking-wide text-[11px]">
                      Target Semester {nextSem} Compulsory Courses ({validationResult.summary.targetCourses.length})
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {validationResult.summary.targetCourses.map(c => (
                        <span key={c._id} className="badge badge-neutral text-xs">
                          {c.code}: {c.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-border">
              <button
                onClick={() => setPreviewModalOpen(false)}
                className="px-4 py-2 border border-border rounded-btn text-xs font-semibold hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteBulkTransition}
                disabled={!validationResult?.valid || submitting || validating}
                className="btn-primary px-5 py-2 rounded-btn text-xs font-semibold disabled:opacity-50"
              >
                {submitting ? 'Executing Bulk Transition...' : 'Confirm & Execute Transition'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
