import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usersAPI, enrollmentAPI, attendanceAPI } from '../../services/api';
import { useStudentSync } from '../../context/StudentSyncContext';
import Breadcrumbs from '../../components/shared/Breadcrumbs';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function AcademicStudentDetail() {
  const { id } = useParams();
  const { getAuthoritativeStudent, lastSyncTimestamp } = useStudentSync();
  const [student, setStudent] = useState(null);
  const [activeEnrollments, setActiveEnrollments] = useState([]);
  const [historyEnrollments, setHistoryEnrollments] = useState([]);
  const [attendanceSummary, setAttendanceSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('current');

  useEffect(() => {
    fetchStudentProfile();
  }, [id, lastSyncTimestamp]);

  const fetchStudentProfile = async () => {
    setLoading(true);
    try {
      const [userRes, enrollmentRes, attRes] = await Promise.allSettled([
        usersAPI.getById(id),
        enrollmentAPI.getStudentEnrollment(id),
        attendanceAPI.getStudentAttendance(id)
      ]);

      if (userRes.status === 'fulfilled') {
        const rawStudent = userRes.value.data.data || userRes.value.data?.user || userRes.value.data;
        setStudent(getAuthoritativeStudent(rawStudent));
      } else {
        // Fallback preview
        setStudent(getAuthoritativeStudent({
          _id: id,
          name: 'Student Profile',
          email: 'student@university.ac.in',
          enrollmentNumber: 'N/A',
          currentSemester: 1,
          division: 'A',
          status: 'active'
        }));
      }

      if (enrollmentRes.status === 'fulfilled') {
        const data = enrollmentRes.value.data;
        setActiveEnrollments(Array.isArray(data?.active) ? data.active : []);
        setHistoryEnrollments(Array.isArray(data?.history) ? data.history : []);
      } else {
        setActiveEnrollments([]);
        setHistoryEnrollments([]);
      }

      if (attRes.status === 'fulfilled') {
        setAttendanceSummary(attRes.value.data.data || attRes.value.data);
      }
    } catch {
      toast.error('Failed to load student academic profile');
    } finally {
      setLoading(false);
    }
  };

  // Group historical enrollments by semester for structured academic history display
  const historyBySemester = useMemo(() => {
    const grouped = {};
    historyEnrollments.forEach(enr => {
      const semKey = enr.course?.semester ? `Semester ${enr.course.semester}` : 'Past Academic Terms';
      if (!grouped[semKey]) grouped[semKey] = [];
      grouped[semKey].push(enr);
    });
    return grouped;
  }, [historyEnrollments]);

  const historySemestersList = Object.keys(historyBySemester).sort((a, b) => b.localeCompare(a));

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const currentSem = student?.currentSemester || 1;
  const enrollmentNo = student?.enrollmentNumber || student?.studentId || 'N/A';
  const deptName = student?.department?.name || 'Department of Computer Science & Engineering';

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Students Roster', to: '/academic-admin/students' },
          { label: student?.name || 'Student Profile' }
        ]}
      />

      {/* Authoritative Basic Profile Header */}
      <div className="bg-surface rounded-card shadow-card border border-border p-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-b from-[#2563eb] to-[#1e40af] rounded-2xl flex items-center justify-center text-white shadow-sm">
              <Icons.GraduationCap className="w-7 h-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-heading">{student?.name}</h1>
                <span className="badge badge-info font-mono">
                  {enrollmentNo}
                </span>
                <span className="badge badge-success">
                  {student?.isActive !== false ? 'Active Student' : 'Inactive'}
                </span>
              </div>
              <p className="text-xs text-muted mt-1">{student?.email} &bull; {deptName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              to="/academic-admin/enrollment"
              className="btn-primary text-xs px-3.5 py-2 flex items-center gap-1.5"
            >
              <Icons.Eye className="w-3.5 h-3.5" /> View Enrollment Roster
            </Link>
            <Link
              to="/academic-admin/students"
              className="btn-secondary text-xs px-3.5 py-2"
            >
              Back to Roster
            </Link>
          </div>
        </div>

        {/* Current State Highlights */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border">
          <div className="p-3.5 bg-white rounded-card border border-border shadow-card">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">Current Academic State</p>
            <p className="text-xl font-bold text-heading mt-0.5">Semester {currentSem}</p>
            <span className="text-[10px] text-primary font-medium">Active Cycle</span>
          </div>
          <div className="p-3.5 bg-white rounded-card border border-border shadow-card">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">Assigned Division</p>
            <p className="text-xl font-bold text-heading mt-0.5">Division {student?.division || 'A'}</p>
            <span className="text-[10px] text-muted">Current Roster</span>
          </div>
          <div className="p-3.5 bg-white rounded-card border border-border shadow-card">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">Permanent Identity ID</p>
            <p className="text-base font-mono font-bold text-heading mt-1">{enrollmentNo}</p>
            <span className="text-[10px] text-muted">Immutable Roll No.</span>
          </div>
          <div className="p-3.5 bg-white rounded-card border border-border shadow-card">
            <p className="text-[11px] font-semibold text-muted uppercase tracking-wide">Attendance Standing</p>
            <p className="text-xl font-bold text-success-dark mt-0.5">
              {attendanceSummary?.overallPercentage !== undefined ? `${attendanceSummary.overallPercentage}%` : 'N/A'}
            </p>
            <span className="text-[10px] text-success-dark font-medium">&gt; 75% Threshold Requirement</span>
          </div>
        </div>
      </div>

      {/* Tabs separating Current Active Enrollments from Historical Records */}
      <div className="flex border-b border-border gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('current')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'current'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted hover:text-heading'
          }`}
        >
          <span>Active Course Enrollments</span>
          <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold">
            {activeEnrollments.length} Active
          </span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'history'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-muted hover:text-heading'
          }`}
        >
          <span>Historical Enrollment Records</span>
          <span className="text-xs bg-slate-100 text-muted px-2 py-0.5 rounded-full font-bold">
            {historyEnrollments.length} Preserved History
          </span>
        </button>
      </div>

      {/* Tab 1: Authoritative Active Course Enrollments */}
      {activeTab === 'current' && (
        <div className="space-y-6">
          <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
            <div className="p-4 border-b border-border flex justify-between items-center bg-white">
              <div>
                <h3 className="text-sm font-semibold text-heading uppercase tracking-wide">
                  Authoritative Active Enrollments
                </h3>
                <p className="text-xs text-muted">
                  Actual active student-course memberships retrieved from Enrollment documents
                </p>
              </div>
              <span className="badge badge-info font-bold">
                {activeEnrollments.length} Active Courses
              </span>
            </div>

            {activeEnrollments.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted bg-slate-50 border-b border-border">
                No active Enrollment records found in database for this student.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs text-muted uppercase font-semibold border-b border-border">
                    <tr>
                      <th className="py-3 px-4">Course Code</th>
                      <th className="py-3 px-4">Course Title</th>
                      <th className="py-3 px-4 text-center">Curriculum Sem</th>
                      <th className="py-3 px-4 text-center">Division</th>
                      <th className="py-3 px-4 text-center">Academic Term</th>
                      <th className="py-3 px-4 text-center">Enrollment Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {activeEnrollments.map(enr => (
                      <tr key={enr._id} className="hover:bg-slate-50/50">
                        <td className="py-3 px-4 font-mono text-xs font-bold text-primary">
                          {enr.course?.code || 'N/A'}
                        </td>
                        <td className="py-3 px-4 font-semibold text-heading">
                          {enr.course?.name || 'Untitled Course'}
                        </td>
                        <td className="py-3 px-4 text-center text-xs font-semibold text-slate-700">
                          {enr.course?.semester ? `Sem ${enr.course.semester}` : 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-center font-bold text-xs text-slate-800">
                          {enr.division ? `Div ${enr.division}` : `Div ${student?.division || 'A'}`}
                        </td>
                        <td className="py-3 px-4 text-center text-xs font-mono text-slate-600">
                          {enr.academicTerm || 'N/A'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                            ACTIVE
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Preserved Historical Academic Records */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 flex items-center gap-2">
            <Icons.AlertCircle className="w-4 h-4 shrink-0 text-slate-500" />
            <span>
              <strong>Historical Preservation Notice:</strong> Past completed and dropped Enrollment documents are permanently preserved in MongoDB.
            </span>
          </div>

          {historyEnrollments.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted bg-slate-50 rounded-lg border border-slate-200">
              No historical Enrollment records (completed/dropped) found in database for this student.
            </div>
          ) : (
            <div className="space-y-4">
              {historySemestersList.map(semKey => {
                const semRecords = historyBySemester[semKey] || [];
                return (
                  <div key={semKey} className="bg-surface rounded-card shadow-card border border-border p-5 space-y-3">
                    <div className="flex justify-between items-center border-b border-border pb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                        <h3 className="font-semibold text-sm text-heading">
                          {semKey} (Preserved History)
                        </h3>
                      </div>
                      <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {semRecords.length} Historical Record(s)
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-500 text-[11px] uppercase font-semibold">
                          <tr>
                            <th className="py-2 px-3">Course Code</th>
                            <th className="py-2 px-3">Course Name</th>
                            <th className="py-2 px-3 text-center">Division</th>
                            <th className="py-2 px-3 text-center">Academic Term</th>
                            <th className="py-2 px-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {semRecords.map(enr => (
                            <tr key={enr._id}>
                              <td className="py-2 px-3 font-mono font-semibold text-slate-700">
                                {enr.course?.code || 'N/A'}
                              </td>
                              <td className="py-2 px-3 font-medium text-slate-800">
                                {enr.course?.name || 'Untitled Course'}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-600 font-semibold">
                                {enr.division ? `Div ${enr.division}` : 'N/A'}
                              </td>
                              <td className="py-2 px-3 text-center text-slate-600 font-mono text-[11px]">
                                {enr.academicTerm || 'N/A'}
                              </td>
                              <td className="py-2 px-3 text-center">
                                {enr.status === 'completed' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 uppercase">
                                    COMPLETED
                                  </span>
                                ) : enr.status === 'dropped' ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 uppercase">
                                    DROPPED
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 uppercase">
                                    {enr.status?.toUpperCase() || 'UNKNOWN'}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

