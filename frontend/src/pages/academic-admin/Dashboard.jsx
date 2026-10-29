import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useStudentSync } from '../../context/StudentSyncContext';
import { usersAPI, coursesAPI, attendanceAPI } from '../../services/api';
import { Icons } from '../../components/shared/Icons';

export default function AcademicDashboard() {
  const { user } = useAuth();
  const {
    authoritativeStudents,
    lastSyncTimestamp,
    syncServerStudents,
    getAuthoritativeStudent
  } = useStudentSync();

  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [professors, setProfessors] = useState([]);
  const [lowAttendance, setLowAttendance] = useState([]);
  const [attendanceAvg, setAttendanceAvg] = useState(null);
  const [fetchError, setFetchError] = useState(null);

  const deptName = user?.department?.name || user?.departmentName || 'Computer Science & Engineering';
  const deptId = user?.department?._id || user?.department;

  useEffect(() => {
    fetchDashboard();
  }, [deptId, lastSyncTimestamp]);

  const fetchDashboard = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [studentsRes, coursesRes, profsRes, attSummaryRes, lowAttRes] = await Promise.allSettled([
        usersAPI.getAll({ role: 'student', department: deptId, limit: 200 }),
        coursesAPI.getAll({ department: deptId, limit: 50 }),
        usersAPI.getAll({ role: 'professor', department: deptId, limit: 50 }),
        deptId ? attendanceAPI.getDepartmentSummary(deptId) : Promise.reject('No deptId'),
        attendanceAPI.getLowAttendance({ threshold: 75, limit: 5 })
      ]);

      if (studentsRes.status === 'fulfilled') {
        const val = studentsRes.value.data?.data || studentsRes.value.data?.users || studentsRes.value.data || [];
        if (Array.isArray(val) && val.length > 0) {
          syncServerStudents(val);
        }
      } else if (studentsRes.status === 'rejected') {
        // Capture error details
        const status = studentsRes.reason?.response?.status;
        if (status && status !== 404) {
          setFetchError(`Backend student sync returned status ${status}. Displaying synchronized department records.`);
        }
      }

      if (coursesRes.status === 'fulfilled') {
        setCourses(coursesRes.value.data.data || coursesRes.value.data || []);
      }
      if (profsRes.status === 'fulfilled') {
        setProfessors(profsRes.value.data.data || profsRes.value.data || []);
      }
      if (attSummaryRes.status === 'fulfilled') {
        const attData = attSummaryRes.value.data?.summary || attSummaryRes.value.data?.data || attSummaryRes.value.data;
        if (attData && attData.attendancePercentage) {
          setAttendanceAvg(`${attData.attendancePercentage.toFixed(1)}%`);
        } else {
          setAttendanceAvg(null);
        }
      } else {
        setAttendanceAvg(null);
      }
      if (lowAttRes.status === 'fulfilled') {
        setLowAttendance(lowAttRes.value.data.data || lowAttRes.value.data || []);
      }
    } catch (err) {
      setFetchError('Failed to load some dashboard metrics');
    } finally {
      setLoading(false);
    }
  };

  // Authoritative students belonging to this department
  const departmentStudents = useMemo(() => {
    return authoritativeStudents
      .map(s => getAuthoritativeStudent(s))
      .filter(s => {
        if (!deptId) return true;
        const sDeptId = s.department?._id || s.department;
        return !sDeptId || String(sDeptId) === String(deptId);
      });
  }, [authoritativeStudents, deptId, getAuthoritativeStudent]);

  // Dynamically calculate semester distribution from authoritative department students
  const semesterCounts = useMemo(() => {
    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    departmentStudents.forEach(s => {
      const sem = parseInt(s.currentSemester, 10) || 1;
      if (counts[sem] !== undefined) {
        counts[sem]++;
      }
    });
    return counts;
  }, [departmentStudents]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Overview</h1>
      </div>

      {/* API Notice / Error if encountered */}
      {fetchError && (
        <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-card flex items-center justify-between text-xs text-blue-800">
          <div className="flex items-center gap-2">
            <Icons.Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            onClick={fetchDashboard}
            className="font-semibold underline hover:text-blue-900 ml-4"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          // Skeleton KPI cards
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface rounded-card shadow-card border border-border p-4 animate-pulse">
              <div className="h-3 w-24 bg-slate-200 rounded mb-3"></div>
              <div className="flex justify-between items-center">
                <div className="h-7 w-12 bg-slate-200 rounded"></div>
                <div className="h-7 w-7 bg-slate-200 rounded-full"></div>
              </div>
              <div className="h-3 w-20 bg-slate-100 rounded mt-3"></div>
            </div>
          ))
        ) : (
          [
            {
              label: 'Enrolled Students',
              value: departmentStudents.length,
              icon: Icons.GraduationCap,
              link: '/academic-admin/students',
              note: `${departmentStudents.length} verified in department`
            },
            {
              label: 'Active Courses',
              value: courses.length,
              icon: Icons.Book,
              link: '/academic-admin/courses',
              note: `${courses.length} active syllabus offerings`
            },
            {
              label: 'Department Faculty',
              value: professors.length,
              icon: Icons.Users,
              note: `${professors.length} professors assigned`
            },
            {
              label: 'Attendance Average',
              value: attendanceAvg || 'N/A',
              icon: Icons.Calendar,
              link: '/academic-admin/attendance',
              note: attendanceAvg ? 'Department records' : 'No logs recorded'
            }
          ].map((item) => (
            <div key={item.label} className="bg-surface rounded-card shadow-card border border-border p-4 flex flex-col justify-between">
              <div>
                <p className="text-xs text-muted font-medium uppercase tracking-wide">{item.label}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-2xl font-bold text-slate-900">{item.value}</span>
                  <span className="p-2 rounded-lg bg-blue-50 text-primary">
                    <item.icon className="w-5 h-5" />
                  </span>
                </div>
              </div>
              {item.link ? (
                <Link to={item.link} className="text-xs text-primary hover:underline font-semibold mt-3 block">
                  View Details &rarr;
                </Link>
              ) : (
                <span className="text-[11px] text-muted mt-3 block">{item.note}</span>
              )}
            </div>
          ))
        )}
      </div>

      {/* Dynamic Semester Distribution Visualizer */}
      <div className="bg-surface rounded-card shadow-card border border-border p-6">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-heading">Student Semester Distribution</h3>
              <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded border border-blue-100">
                {departmentStudents.length} Total
              </span>
            </div>
            <p className="text-xs text-muted mt-0.5">
              Active students currently enrolled across Semesters 1 through 8
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <Link
              to="/academic-admin/students"
              className="text-xs font-semibold px-3 py-1.5 rounded-btn border border-border bg-white text-slate-700 hover:bg-slate-50 transition-colors"
            >
              View Roster
            </Link>
            <Link
              to="/academic-admin/promotion"
              className="btn-primary text-xs px-3.5 py-1.5"
            >
              Promote Cohorts &rarr;
            </Link>
          </div>
        </div>

        {loading ? (
          // Skeleton semester cards
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="border border-border rounded-xl p-3 bg-white text-center animate-pulse">
                <div className="h-3 w-12 bg-slate-200 rounded mx-auto mb-2"></div>
                <div className="h-6 w-8 bg-slate-200 rounded mx-auto mb-1"></div>
                <div className="h-2 w-10 bg-slate-100 rounded mx-auto"></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 pt-2">
            {Object.entries(semesterCounts).map(([sem, count]) => {
              const hasStudents = count > 0;
              return (
                <div
                  key={sem}
                  className={`border rounded-xl p-3 text-center transition-all ${
                    hasStudents
                      ? 'border-blue-200 bg-blue-50/20 hover:border-primary hover:shadow-sm'
                      : 'border-border bg-white opacity-85 hover:opacity-100'
                  }`}
                >
                  <span className="text-[11px] font-bold text-muted uppercase tracking-wider block">
                    Sem {sem}
                  </span>
                  <span
                    className={`text-xl font-extrabold mt-1 block ${
                      hasStudents ? 'text-primary' : 'text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                  <span className="text-[10px] font-medium text-muted">
                    {count === 1 ? 'Student' : 'Students'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Workflows Grid */}
      <div className="bg-surface rounded-card shadow-card border border-border">
        <div className="p-4 border-b border-border">
          <h2 className="text-base font-bold text-heading">Academic Operations</h2>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/academic-admin/enrollment"
            className="p-4 border border-border rounded-lg bg-white hover:bg-blue-50/50 hover:border-blue-200 transition-all group block"
          >
            <Icons.Clipboard className="w-7 h-7 text-primary mb-2 group-hover:scale-110 transition-transform" />
            <h4 className="font-semibold text-heading text-sm group-hover:text-primary transition-colors">
              Course Enrollment
            </h4>
            <p className="text-xs text-muted mt-1">
              Assign students to eligible academic courses for their current semester.
            </p>
            <span className="text-xs font-semibold text-primary mt-3 inline-block">
              Enroll Students &rarr;
            </span>
          </Link>
          <Link
            to="/academic-admin/promotion"
            className="p-4 border border-border rounded-lg bg-white hover:bg-blue-50/50 hover:border-blue-200 transition-all group block"
          >
            <Icons.Rocket className="w-7 h-7 text-primary mb-2 group-hover:scale-110 transition-transform" />
            <h4 className="font-semibold text-heading text-sm group-hover:text-primary transition-colors">
              Semester Promotion
            </h4>
            <p className="text-xs text-muted mt-1">
              Batch promote eligible students to the next semester or manage retentions.
            </p>
            <span className="text-xs font-semibold text-primary mt-3 inline-block">
              Promote Cohorts &rarr;
            </span>
          </Link>
          <Link
            to="/academic-admin/divisions"
            className="p-4 border border-border rounded-lg bg-white hover:bg-blue-50/50 hover:border-blue-200 transition-all group block"
          >
            <Icons.School className="w-7 h-7 text-primary mb-2 group-hover:scale-110 transition-transform" />
            <h4 className="font-semibold text-heading text-sm group-hover:text-primary transition-colors">
              Divisions & Sections
            </h4>
            <p className="text-xs text-muted mt-1">
              Organize student cohorts into synchronized divisions and section rosters.
            </p>
            <span className="text-xs font-semibold text-primary mt-3 inline-block">
              Manage Divisions &rarr;
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
