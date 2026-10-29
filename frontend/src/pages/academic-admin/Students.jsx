import { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { usersAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useStudentSync } from '../../context/StudentSyncContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function AcademicStudents() {
  const { user } = useAuth();
  const {
    authoritativeStudents,
    lastSyncTimestamp,
    notifyStudentUpdated,
    importAuthoritativeStudents,
    getAuthoritativeStudent,
    syncServerStudents
  } = useStudentSync();

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterSemester, setFilterSemester] = useState('');
  const [filterDivision, setFilterDivision] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileInputRef = useRef(null);

  const [form, setForm] = useState({
    name: '',
    personalEmail: '',
    currentSemester: 1,
    division: 'A',
    password: ''
  });

  const deptName = user?.department?.name || user?.departmentName || 'Computer Science & Engineering';
  const deptId = user?.department?._id || user?.department;
  const uniAcronym = (user?.university?.acronym || user?.university?.code || 'IITB').toUpperCase();
  const deptCode = (user?.department?.code || 'CSE').toUpperCase();

  const previewCollegeEmail = useMemo(() => {
    if (!form.name.trim()) return `student@${uniAcronym.toLowerCase()}.ac.in`;
    const token = form.name.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '') || 'student';
    return `${token}@${uniAcronym.toLowerCase()}.ac.in`;
  }, [form.name, uniAcronym]);

  const previewEnrollmentNo = useMemo(() => {
    const sem = String(form.currentSemester || 1).padStart(2, '0');
    return `${uniAcronym}-${deptCode}-${sem}-XXX`;
  }, [form.currentSemester, uniAcronym, deptCode]);

  useEffect(() => {
    fetchStudents();
  }, [deptId, lastSyncTimestamp]);

  const fetchStudents = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await usersAPI.getAll({
        role: 'student',
        department: deptId,
        limit: 200
      });
      const val = res.data?.data || res.data?.users || res.data || [];
      if (Array.isArray(val)) {
        syncServerStudents(val, deptId);
      }
    } catch (err) {
      const status = err.response?.status;
      if (status && status !== 404) {
        setFetchError(`Backend status ${status}. Operating from authoritative department records.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const departmentStudents = useMemo(() => {
    return authoritativeStudents
      .map(s => getAuthoritativeStudent(s))
      .filter(s => {
        if (!deptId) return true;
        const sDept = s.department?._id || s.department;
        return String(sDept) === String(deptId);
      });
  }, [authoritativeStudents, deptId, getAuthoritativeStudent]);

  const downloadCSVTemplate = () => {
    const headers = ['name', 'personalGmail', 'department', 'semester', 'division'];
    const deptNameToUse = deptName || 'Computer Science & Engineering';
    const sampleRows = [
      ['Rahul Verma', 'rahul@gmail.com', deptNameToUse, '2', 'A'],
      ['Om Patel', 'om@gmail.com', deptNameToUse, '2', 'A'],
      ['Priya Shah', 'priya@gmail.com', deptNameToUse, '2', 'B']
    ];

    const csvContent = [
      headers.join(','),
      ...sampleRows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'student_import_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Downloaded student_import_template.csv');
  };

  const parseAndValidateCSV = (text) => {
    const lines = text
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l.length > 0);

    if (lines.length < 2) {
      throw new Error('CSV file is empty or missing data rows.');
    }

    const headerLine = lines[0];
    const rawHeaders = headerLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));

    const headerMap = {};
    rawHeaders.forEach((h, index) => {
      const clean = h.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (clean.includes('name') || clean === 'studentname' || clean === 'fullname') headerMap.name = index;
      else if (clean.includes('personal') || clean.includes('gmail') || clean === 'email' || clean === 'mail') headerMap.personalGmail = index;
      else if (clean.includes('dept') || clean.includes('department')) headerMap.department = index;
      else if (clean.includes('sem')) headerMap.semester = index;
      else if (clean.includes('div') || clean.includes('sec')) headerMap.division = index;
      else if (clean.includes('enrollment') || clean === 'studentid') headerMap.enrollmentNumber = index;
    });

    if (headerMap.name === undefined || headerMap.personalGmail === undefined) {
      throw new Error(
        'Missing required columns: "name" and "personalGmail" must be present in header row.'
      );
    }

    const records = [];
    const errors = [];
    const seenEmails = new Set();

    for (let i = 1; i < lines.length; i++) {
      const rowNum = i + 1;
      const line = lines[i];
      if (!line) continue;
      const cols = line.split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));

      const name = cols[headerMap.name];
      const personalGmail = cols[headerMap.personalGmail];
      const rowDept = headerMap.department !== undefined && cols[headerMap.department]
        ? cols[headerMap.department]
        : (deptName || 'Computer Science & Engineering');
      const semRaw = headerMap.semester !== undefined ? cols[headerMap.semester] : '1';
      const division = headerMap.division !== undefined && cols[headerMap.division]
        ? cols[headerMap.division].toUpperCase()
        : 'A';
      const semester = parseInt(semRaw, 10) || 1;

      if (!name) {
        errors.push({ row: rowNum, reason: 'Missing student name' });
        continue;
      }
      if (!personalGmail || !personalGmail.includes('@')) {
        errors.push({ row: rowNum, reason: 'Invalid or missing personal email format' });
        continue;
      }

      const lowerEmail = personalGmail.toLowerCase();
      if (seenEmails.has(lowerEmail)) {
        errors.push({ row: rowNum, reason: 'Duplicate personal email in CSV file' });
        continue;
      }
      seenEmails.add(lowerEmail);

      const usernameToken = name.trim().toLowerCase().split(/\s+/)[0].replace(/[^a-z0-9]/g, '') || 'student';
      const semPadded = String(semester).padStart(2, '0');

      records.push({
        row: rowNum,
        name,
        personalGmail: lowerEmail,
        personalEmail: lowerEmail,
        department: rowDept,
        currentSemester: semester,
        division,
        predictedEmail: `${usernameToken}@${uniAcronym.toLowerCase()}.ac.in`,
        predictedEnrollment: `${uniAcronym}-${deptCode}-${semPadded}-XXX`
      });
    }

    return { records, errors };
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Please choose a valid .csv spreadsheet file.');
      return;
    }

    setImportFile(file);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const text = evt.target?.result;
        if (typeof text !== 'string') throw new Error('Could not read file.');
        const parsed = parseAndValidateCSV(text);
        setCsvPreview(parsed);
      } catch (err) {
        toast.error(err.message || 'Failed to parse CSV file');
        setCsvPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (!csvPreview || !csvPreview.records || csvPreview.records.length === 0) {
      toast.error('No valid records to import.');
      return;
    }

    setImporting(true);

    const validRecords = csvPreview.records;
    const initialErrors = csvPreview.errors || [];
    let serverFailures = [];
    let serverSuccessCount = 0;

    try {
      const serverRes = await usersAPI.importStudents({
        department: deptId,
        institution: user?.institution?._id || user?.institution,
        students: validRecords
      }).catch(err => ({ error: err }));

      if (serverRes && !serverRes.error && serverRes.data) {
        const data = serverRes.data;
        serverSuccessCount = data.successCount || data.importedCount || validRecords.length;
        serverFailures = data.failures || [];
        if (Array.isArray(data.students) && data.students.length > 0) {
          importAuthoritativeStudents(data.students);
        }
      } else {
        const createdBatch = [];
        for (const st of validRecords) {
          const res = await usersAPI.create({
            name: st.name,
            personalEmail: st.personalGmail,
            password: 'Student@123',
            role: 'student',
            department: deptId,
            institution: user?.institution?._id || user?.institution,
            currentSemester: st.currentSemester,
            division: st.division
          }).catch(err => {
            serverFailures.push({ row: st.row, reason: err.response?.data?.message || err.message });
            return null;
          });

          if (res?.data?.user) {
            createdBatch.push(res.data.user);
            serverSuccessCount++;
          }
        }
        if (createdBatch.length > 0) {
          importAuthoritativeStudents(createdBatch);
        }
      }

      const totalProcessed = validRecords.length + initialErrors.length;
      const totalFailed = initialErrors.length + serverFailures.length;

      setImportResult({
        total: totalProcessed,
        successCount: serverSuccessCount,
        failedCount: totalFailed,
        failures: [...initialErrors, ...serverFailures]
      });

      if (serverSuccessCount > 0) {
        toast.success(`Successfully imported ${serverSuccessCount} student records!`);
      }
      if (totalFailed > 0) {
        toast.error(`${totalFailed} record(s) could not be imported`);
      }
    } catch (err) {
      toast.error('Import failed: ' + (err.message || 'Unknown error'));
    } finally {
      setImporting(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setImportFile(null);
    setCsvPreview(null);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Student Name is required');
    if (!form.personalEmail.trim()) return toast.error('Personal Gmail is required');

    try {
      if (editingStudent) {
        const updatePayload = {
          name: form.name.trim(),
          personalEmail: form.personalEmail.trim().toLowerCase(),
          currentSemester: parseInt(form.currentSemester, 10),
          division: form.division
        };
        await usersAPI.update(editingStudent._id, updatePayload);

        notifyStudentUpdated(editingStudent._id, updatePayload);
        toast.success('Student profile updated across all modules');
      } else {
        const createPayload = {
          name: form.name.trim(),
          personalEmail: form.personalEmail.trim().toLowerCase(),
          password: form.password || 'Student@123',
          role: 'student',
          department: deptId,
          institution: user?.institution?._id || user?.institution,
          currentSemester: parseInt(form.currentSemester, 10),
          division: form.division
        };

        const res = await usersAPI.create(createPayload);
        const createdStudent = res?.data?.user;
        if (createdStudent) {
          importAuthoritativeStudents([createdStudent]);
        }
        toast.success('Student enrolled with permanent enrollment number and college email');
      }
      resetForm();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Operation failed');
    }
  };

  const startEdit = (st) => {
    const authSt = getAuthoritativeStudent(st);
    setEditingStudent(authSt);
    setForm({
      name: authSt.name || '',
      personalEmail: authSt.personalEmail || authSt.personalGmail || '',
      currentSemester: authSt.currentSemester || 1,
      division: authSt.division || 'A',
      password: ''
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setForm({
      name: '',
      personalEmail: '',
      currentSemester: 1,
      division: 'A',
      password: ''
    });
    setEditingStudent(null);
    setShowForm(false);
  };

  const filtered = useMemo(() => {
    return departmentStudents.filter(s => {
      const term = search.toLowerCase();
      const matchSearch =
        s.name?.toLowerCase().includes(term) ||
        s.email?.toLowerCase().includes(term) ||
        (s.enrollmentNumber && String(s.enrollmentNumber).toLowerCase().includes(term)) ||
        (s.studentId && String(s.studentId).toLowerCase().includes(term));
      const matchSem = !filterSemester || String(s.currentSemester) === String(filterSemester);
      const matchDiv = !filterDivision || String(s.division) === String(filterDivision);
      return matchSearch && matchSem && matchDiv;
    });
  }, [departmentStudents, search, filterSemester, filterDivision]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Student Management</h1>
          <p className="text-muted mt-1 text-sm">
            {departmentStudents.length} official student records maintained under this department.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={downloadCSVTemplate}
            className="px-3.5 py-2 rounded-btn border border-border bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Download blank CSV template with sample rows"
          >
            <Icons.Download className="w-3.5 h-3.5" /> Download CSV Template
          </button>
          <button
            onClick={() => setShowGuideModal(true)}
            className="px-2.5 py-2 rounded-btn border border-border bg-white hover:bg-slate-50 text-slate-500 text-xs font-semibold transition-colors shadow-sm flex items-center justify-center"
            title="CSV Format Help Guide"
          >
            <Icons.HelpCircle className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="px-3.5 py-2 rounded-btn border border-blue-200 bg-blue-50/70 hover:bg-blue-100/70 text-primary text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <Icons.Upload className="w-3.5 h-3.5" /> Import CSV
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className="btn-primary px-4 py-2 rounded-btn text-xs font-semibold flex items-center gap-1.5 shadow-sm"
          >
            {showForm ? 'Cancel' : <><Icons.Plus className="w-3.5 h-3.5" /> Add Student</>}
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-surface rounded-card shadow-card border border-border p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-border pb-3">
            <h2 className="text-lg font-semibold text-heading">
              {editingStudent ? 'Edit Current Student Profile' : 'Register New Department Student'}
            </h2>
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-100 font-bold px-2.5 py-0.5 rounded">
              {deptName}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Student Name *</label>
              <input
                type="text"
                placeholder="e.g. Rahul Verma"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className="form-input w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Personal Gmail *</label>
              <input
                type="email"
                placeholder="e.g. rahulverma@gmail.com"
                value={form.personalEmail}
                onChange={e => setForm({ ...form, personalEmail: e.target.value })}
                className="form-input w-full"
                required
              />
              <p className="text-[11px] text-muted mt-1">Student's personal contact email address</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 flex items-center justify-between">
                <span>College Gmail</span>
                <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-1.5 py-0.5 rounded">AUTO GENERATED</span>
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={editingStudent ? editingStudent.email : previewCollegeEmail}
                className="form-input w-full bg-slate-100 text-slate-600 font-mono text-xs cursor-not-allowed border-slate-200"
              />
              <p className="text-[11px] text-muted mt-1">Official Student Portal login identity</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700 flex items-center justify-between">
                <span>Permanent Enrollment No.</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">PERMANENT</span>
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={editingStudent ? (editingStudent.enrollmentNumber || editingStudent.studentId) : previewEnrollmentNo}
                className="form-input w-full bg-slate-100 text-slate-600 font-mono text-xs cursor-not-allowed border-slate-200"
              />
              <p className="text-[11px] text-muted mt-1">Format: {uniAcronym}-{deptCode}-{String(form.currentSemester || 1).padStart(2, '0')}-XXX</p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Current Semester *</label>
              <select
                value={form.currentSemester}
                onChange={e => setForm({ ...form, currentSemester: parseInt(e.target.value, 10) })}
                className="form-input w-full"
              >
                {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                  <option key={sem} value={sem}>Semester {sem}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1 text-slate-700">Assigned Division</label>
              <select
                value={form.division}
                onChange={e => setForm({ ...form, division: e.target.value })}
                className="form-input w-full"
              >
                {['A', 'B', 'C', 'D'].map(div => (
                  <option key={div} value={div}>Division {div}</option>
                ))}
              </select>
            </div>
            {!editingStudent && (
              <div>
                <label className="block text-sm font-medium mb-1 text-slate-700">Initial Password</label>
                <input
                  type="password"
                  placeholder="Defaults to Student@123"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="form-input w-full"
                />
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 border border-border rounded-btn text-xs font-semibold hover:bg-gray-50 text-slate-700"
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary px-5 py-2 rounded-btn text-xs">
              {editingStudent ? 'Save Changes' : 'Confirm Enrollment'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-surface rounded-card shadow-card border border-border p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Search enrollment no. or name..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="form-input w-full pl-9 text-xs"
            />
            <Icons.Search className="w-4 h-4 absolute left-3 top-2.5 text-muted" />
          </div>

          <div>
            <select
              value={filterSemester}
              onChange={e => setFilterSemester(e.target.value)}
              className="form-input w-full text-xs"
            >
              <option value="">All Active Semesters</option>
              {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                <option key={s} value={s}>Semester {s}</option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filterDivision}
              onChange={e => setFilterDivision(e.target.value)}
              className="form-input w-full text-xs"
            >
              <option value="">All Divisions</option>
              {['A', 'B', 'C', 'D'].map(d => (
                <option key={d} value={d}>Division {d}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm">
            {departmentStudents.length === 0
              ? 'No students found in this department. Use "Import CSV" or "+ Add Student" to register students.'
              : 'No students found matching your filters.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Permanent Enrollment No.</th>
                  <th className="py-3.5 px-4">Student Name</th>
                  <th className="py-3.5 px-4">Personal Gmail</th>
                  <th className="py-3.5 px-4">College Gmail (Login)</th>
                  <th className="py-3.5 px-4 text-center">Semester</th>
                  <th className="py-3.5 px-4 text-center">Division</th>
                  <th className="py-3.5 px-4">Academic Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(st => (
                  <tr key={st._id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-mono text-xs font-bold text-primary">
                      <Link to={`/academic-admin/students/${st._id}`} className="hover:underline">
                        {st.enrollmentNumber || st.studentId || 'IITB-CSE-' + String(st._id).slice(-3)}
                      </Link>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {st.name}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600 font-mono">
                      {st.personalEmail || st.personalGmail || '—'}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono font-semibold text-blue-700">
                      {st.email}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-bold text-xs bg-slate-100 text-slate-800 px-2.5 py-1 rounded">
                        Semester {st.currentSemester || 1}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="font-bold text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                        Div {st.division || 'A'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        Active
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          to={`/academic-admin/students/${st._id}`}
                          className="p-1.5 hover:bg-slate-100 rounded text-blue-600"
                        >
                          <Icons.Eye className="w-4 h-4" />
                        </Link>
                        <button
                          onClick={() => startEdit(st)}
                          className="p-1.5 hover:bg-slate-100 rounded text-slate-600"
                        >
                          <Icons.Edit className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-surface rounded-card shadow-xl border border-border w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-border flex justify-between items-center bg-slate-50/70">
              <div className="flex items-center gap-2">
                <Icons.Clipboard className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-slate-900 text-base">CSV Import Specifications</h3>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 flex items-center justify-center"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 text-xs text-slate-700">
              <p>
                The CSV file must be in standard comma-delimited format with a single header row:
              </p>
              <div className="p-2.5 bg-slate-100 rounded-lg font-mono text-[11px] text-slate-800 border border-border">
                name,personalGmail,department,semester,division
              </div>

              <div className="border border-border rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-border text-[11px] font-bold text-slate-600 uppercase">
                    <tr>
                      <th className="py-2 px-3">Column Name</th>
                      <th className="py-2 px-3">Required</th>
                      <th className="py-2 px-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-primary">name</td>
                      <td className="py-2 px-3 text-red-600 font-bold">Yes</td>
                      <td className="py-2 px-3">Student's full name (e.g. Rahul Verma).</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-primary">personalGmail</td>
                      <td className="py-2 px-3 text-red-600 font-bold">Yes</td>
                      <td className="py-2 px-3">Student's personal contact Gmail (e.g. rahul@gmail.com).</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-primary">department</td>
                      <td className="py-2 px-3 text-red-600 font-bold">Yes</td>
                      <td className="py-2 px-3">Existing department name (e.g. {deptName || 'Computer Science & Engineering'}). Backend matches database record.</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-primary">semester</td>
                      <td className="py-2 px-3 text-slate-500 font-semibold">Optional</td>
                      <td className="py-2 px-3">Current semester (1-8). Defaults to 1.</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-mono font-bold text-primary">division</td>
                      <td className="py-2 px-3 text-slate-500 font-semibold">Optional</td>
                      <td className="py-2 px-3">Assigned division (A, B, C, D). Defaults to A.</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-[11px] text-blue-900 space-y-1.5">
                <p className="font-bold text-xs flex items-center gap-1.5">
                  <Icons.Landmark className="w-4 h-4 inline-block text-primary mr-1" /> Automatic Organization & Identity Rules:
                </p>
                <ul className="list-disc list-inside space-y-1 text-slate-700">
                  <li><strong>University:</strong> Automatically determined from the authenticated Academic Admin's authorized scope (never from CSV).</li>
                  <li><strong>Department Code:</strong> Looked up directly from the database record matching the CSV department (do NOT enter code manually).</li>
                  <li><strong>Enrollment Number:</strong> Generated as <code>&lt;University Acronym&gt;-&lt;Department Code&gt;-&lt;Semester&gt;-&lt;Seq&gt;</code> (e.g., <code>{uniAcronym}-{deptCode}-02-001</code>).</li>
                  <li><strong>College Gmail:</strong> Generated as <code>&lt;normalized_name&gt;@{uniAcronym.toLowerCase()}.ac.in</code> with duplicate collision handling (e.g., <code>rahul@...</code>, <code>rahul01@...</code>).</li>
                </ul>
              </div>
            </div>
            <div className="p-4 border-t border-border flex justify-between items-center bg-slate-50/50">
              <button
                onClick={downloadCSVTemplate}
                className="text-primary hover:underline font-semibold text-xs flex items-center gap-1.5"
              >
                <Icons.Download className="w-3.5 h-3.5" /> Download Blank Template
              </button>
              <button
                onClick={() => setShowGuideModal(false)}
                className="btn-primary text-xs px-4 py-1.5 rounded-btn"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
          <div className="bg-surface rounded-card shadow-2xl border border-border w-full max-w-2xl my-8 overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-border flex justify-between items-center bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-100 text-primary flex items-center justify-center font-bold">
                  <Icons.Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Import Students via CSV</h3>
                  <p className="text-xs text-muted">
                    Bulk enroll and register student records into {deptName}
                  </p>
                </div>
              </div>
              <button
                onClick={closeImportModal}
                disabled={importing}
                className="text-slate-400 hover:text-slate-600 p-1 disabled:opacity-50 flex items-center justify-center"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {!importResult ? (
                <>
                  {!importFile ? (
                    <div className="border-2 border-dashed border-slate-300 hover:border-primary rounded-xl p-8 text-center transition-colors bg-slate-50/50">
                      <div className="w-12 h-12 bg-blue-50 text-primary rounded-full flex items-center justify-center mx-auto mb-3">
                        <Icons.Upload className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-slate-800">
                        Choose a CSV file containing student records
                      </p>
                      <p className="text-xs text-muted mt-1">
                        Accepted format: <strong>.csv</strong>
                      </p>

                      <div className="mt-4 flex justify-center items-center gap-3">
                        <label className="btn-primary text-xs px-4 py-2 rounded-btn cursor-pointer inline-flex items-center gap-2">
                          <Icons.Upload className="w-3.5 h-3.5" /> Select CSV File
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={handleFileChange}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 bg-slate-50 rounded-xl border border-border flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-blue-100 text-primary flex items-center justify-center font-bold text-sm">
                            CSV
                          </div>
                          <div>
                            <p className="text-xs font-bold text-slate-900">{importFile.name}</p>
                            <p className="text-[11px] text-muted">
                              {(importFile.size / 1024).toFixed(1)} KB • {csvPreview?.records?.length || 0} valid records detected
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setImportFile(null);
                            setCsvPreview(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                          disabled={importing}
                          className="text-xs text-red-600 hover:underline font-semibold"
                        >
                          Choose Different File
                        </button>
                      </div>

                      {csvPreview?.errors?.length > 0 && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 space-y-1">
                          <p className="font-bold flex items-center gap-1.5">
                            <Icons.AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 inline-block" /> {csvPreview.errors.length} row(s) had formatting errors or duplicate entries:
                          </p>
                          <ul className="list-disc list-inside text-[11px] space-y-0.5 text-amber-800 max-h-24 overflow-y-auto">
                            {csvPreview.errors.map((err, i) => (
                              <li key={i}>
                                Row {err.row} ({err.enrollmentNumber}): {err.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-bold uppercase tracking-wider text-muted">
                            Preview ({csvPreview?.records?.length || 0})
                          </span>
                        </div>

                        <div className="border border-border rounded-lg overflow-x-auto max-h-56">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 border-b border-border text-[11px] text-muted font-bold uppercase">
                              <tr>
                                <th className="py-2.5 px-3">Row</th>
                                <th className="py-2.5 px-3">Student Name</th>
                                <th className="py-2.5 px-3">Personal Gmail</th>
                                <th className="py-2.5 px-3">Department</th>
                                <th className="py-2.5 px-3">College Gmail (Predicted)</th>
                                <th className="py-2.5 px-3 font-mono">Enrollment Prefix</th>
                                <th className="py-2.5 px-3 text-center">Sem</th>
                                <th className="py-2.5 px-3 text-center">Div</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                              {csvPreview?.records?.slice(0, 10).map((r) => (
                                <tr key={r.row} className="hover:bg-slate-50/50">
                                  <td className="py-2 px-3 text-muted font-mono">{r.row}</td>
                                  <td className="py-2 px-3 font-semibold text-slate-800">{r.name}</td>
                                  <td className="py-2 px-3 text-slate-600 font-mono text-[11px]">{r.personalGmail}</td>
                                  <td className="py-2 px-3 text-slate-700 text-[11px] font-medium">{r.department}</td>
                                  <td className="py-2 px-3 font-mono text-blue-700 text-[11px]">{r.predictedEmail}</td>
                                  <td className="py-2 px-3 font-mono font-bold text-emerald-700 text-[11px]">{r.predictedEnrollment}</td>
                                  <td className="py-2 px-3 text-center">
                                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold text-[11px]">
                                      {r.currentSemester}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-center">
                                    <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold text-[11px]">
                                      {r.division}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-border space-y-3 text-center">
                    <div className="w-12 h-12 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto">
                      <Icons.Check className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">Student Import Complete</h4>
                      <p className="text-xs text-muted mt-1">
                        Records have been synchronized into the authoritative department roster.
                      </p>
                    </div>

                    <div className="flex justify-center items-center gap-4 pt-2">
                      <div className="px-4 py-2 rounded-lg bg-green-50 border border-green-200">
                        <span className="text-xl font-bold text-green-700 block">{importResult.successCount}</span>
                        <span className="text-[11px] font-semibold text-green-800">Successfully Imported</span>
                      </div>
                      <div className="px-4 py-2 rounded-lg bg-red-50 border border-red-200">
                        <span className="text-xl font-bold text-red-700 block">{importResult.failedCount}</span>
                        <span className="text-[11px] font-semibold text-red-800">Failed Records</span>
                      </div>
                    </div>
                  </div>

                  {/* Failed Records Detail Breakdown */}
                  {importResult.failures?.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-xs font-bold text-red-800 uppercase tracking-wide">
                        Failed Records Breakdown ({importResult.failures.length})
                      </h5>
                      <div className="border border-red-200 rounded-lg overflow-x-auto max-h-48 bg-red-50/30">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-red-50 border-b border-red-200 text-[11px] text-red-900 font-bold uppercase">
                            <tr>
                              <th className="py-2 px-3">Row</th>
                              <th className="py-2 px-3">Enrollment No.</th>
                              <th className="py-2 px-3">Failure Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-100">
                            {importResult.failures.map((f, i) => (
                              <tr key={i}>
                                <td className="py-2 px-3 font-mono text-muted">{f.row || '—'}</td>
                                <td className="py-2 px-3 font-mono font-bold text-slate-800">{f.enrollmentNumber || 'N/A'}</td>
                                <td className="py-2 px-3 text-red-700 font-medium">{f.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-lg text-[11px] text-blue-900">
                    <strong>Backend Contract:</strong> Server-side bulk imports expect endpoint <code>POST /api/users/import-students</code> accepting multipart <code>file</code> (.csv).
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border flex justify-end gap-3 bg-slate-50/50">
              {!importResult ? (
                <>
                  <button
                    type="button"
                    onClick={closeImportModal}
                    disabled={importing}
                    className="px-4 py-2 border border-border rounded-btn text-xs font-semibold hover:bg-white text-slate-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={!csvPreview || csvPreview?.records?.length === 0 || importing}
                    className="btn-primary px-5 py-2 rounded-btn text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                  >
                    {importing ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Importing...
                      </>
                    ) : (
                      `Import ${csvPreview?.records?.length || 0} Students`
                    )}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={closeImportModal}
                  className="btn-primary px-6 py-2 rounded-btn text-xs font-semibold"
                >
                  Done & Close
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
