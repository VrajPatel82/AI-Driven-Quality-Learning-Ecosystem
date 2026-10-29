import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { coursesAPI, usersAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useStudentSync } from '../../context/StudentSyncContext';
import { Icons } from '../../components/shared/Icons';

export default function AcademicSemesters() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { getAuthoritativeStudent, lastSyncTimestamp } = useStudentSync();

  const [selectedYear, setSelectedYear] = useState('2026–27');
  const [selectedTerm, setSelectedTerm] = useState('Even Term');
  const [courses, setCourses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [managedSemester, setManagedSemester] = useState(null);

  const deptName = user?.department?.name || user?.departmentName || 'Computer Engineering';
  const deptId = user?.department?._id || user?.department;

  useEffect(() => {
    fetchData();
  }, [deptId, lastSyncTimestamp]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [coursesRes, studentsRes] = await Promise.allSettled([
        coursesAPI.getAll({ department: deptId, limit: 100 }),
        usersAPI.getAll({ role: 'student', department: deptId, limit: 300 })
      ]);

      if (coursesRes.status === 'fulfilled') {
        setCourses(coursesRes.value.data.data || coursesRes.value.data || []);
      }
      if (studentsRes.status === 'fulfilled') {
        const raw = studentsRes.value.data.data || studentsRes.value.data || [];
        setStudents(raw.map(s => getAuthoritativeStudent(s)));
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  // Generate 8 Semesters with accurate dynamic metrics
  const semestersData = useMemo(() => {
    return [1, 2, 3, 4, 5, 6, 7, 8].map(semNumber => {
      const semStudents = students.filter(s => (s.currentSemester || 1) === semNumber);
      const semCourses = courses.filter(c => (c.semester || 1) === semNumber);
      
      // Calculate divisions represented in this semester
      const divSet = new Set();
      semStudents.forEach(s => {
        if (s.division) divSet.add(s.division.toUpperCase());
      });
      const divisionsList = Array.from(divSet).sort();
      if (divisionsList.length === 0) {
        divisionsList.push('A', 'B', 'C');
      }

      const isEvenSem = semNumber % 2 === 0;
      const cycleName = isEvenSem ? 'Even Term' : 'Odd Term';

      // Multiple active semesters logic:
      // In Even Term, semesters 2, 4, 6, 8 are active concurrently.
      // In Odd Term, semesters 1, 3, 5, 7 are active concurrently.
      let isActive = false;
      if (selectedTerm === 'Even Term') {
        isActive = isEvenSem;
      } else if (selectedTerm === 'Odd Term') {
        isActive = !isEvenSem;
      } else {
        // 'All Terms' view: default active cycle is Even Term (sem 2, 4, 6, 8) or active teaching
        isActive = isEvenSem;
      }

      return {
        number: semNumber,
        studentsCount: semStudents.length,
        coursesCount: semCourses.length,
        students: semStudents,
        courses: semCourses,
        divisions: divisionsList,
        cycle: cycleName,
        isActive
      };
    });
  }, [students, courses, selectedTerm]);

  // Filter semesters if specific term is selected or show all
  const filteredSemesters = useMemo(() => {
    if (selectedTerm === 'Even Term') {
      return semestersData;
    }
    if (selectedTerm === 'Odd Term') {
      return semestersData;
    }
    return semestersData;
  }, [semestersData, selectedTerm]);

  const activeStudentsTotal = useMemo(() => {
    return semestersData.filter(s => s.isActive).reduce((acc, s) => acc + s.studentsCount, 0);
  }, [semestersData]);

  const activeCoursesTotal = useMemo(() => {
    return semestersData.filter(s => s.isActive).reduce((acc, s) => acc + s.coursesCount, 0);
  }, [semestersData]);

  return (
    <div className="space-y-6">
      {/* Top Header & Selector Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading flex items-center gap-2">
            <Icons.Calendar className="w-6 h-6 text-primary" />
            Semesters & Terms
          </h1>
        </div>

        {/* Academic Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Academic Year Dropdown */}
          <div className="flex items-center gap-2 bg-surface px-3 py-1.5 border border-border rounded-xl shadow-xs">
            <label htmlFor="year-select" className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              Academic Year:
            </label>
            <div className="relative">
              <select
                id="year-select"
                value={selectedYear}
                onChange={e => setSelectedYear(e.target.value)}
                className="text-xs font-bold text-heading bg-transparent pr-6 pl-2 py-1 rounded-lg border border-slate-200 hover:border-slate-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 cursor-pointer appearance-none"
              >
                <option value="2026–27">2026–27</option>
                <option value="2025–26">2025–26</option>
                <option value="2027–28">2027–28</option>
              </select>
              <Icons.ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Academic Term Dropdown */}
          <div className="flex items-center gap-2 bg-surface px-3 py-1.5 border border-border rounded-xl shadow-xs">
            <label htmlFor="term-select" className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              Academic Term:
            </label>
            <div className="relative">
              <select
                id="term-select"
                value={selectedTerm}
                onChange={e => setSelectedTerm(e.target.value)}
                className="text-xs font-bold text-heading bg-transparent pr-6 pl-2 py-1 rounded-lg border border-slate-200 hover:border-slate-300 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 cursor-pointer appearance-none"
              >
                <option value="Even Term">Even Term (Active Cycle)</option>
                <option value="Odd Term">Odd Term (Inactive Cycle)</option>
                <option value="All Terms">All Academic Terms</option>
              </select>
              <Icons.ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Term Information Overview Banner */}
      <div className="bg-gradient-to-r from-blue-50/80 via-indigo-50/50 to-surface border border-blue-100 rounded-card p-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
              {selectedYear} &bull; {selectedTerm}
            </span>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Term Active
            </span>
          </div>

          <div className="flex items-center gap-6 shrink-0 pt-2 sm:pt-0 sm:border-l border-blue-100 sm:pl-6">
            <div>
              <p className="text-xs text-muted font-medium">Active Term Students</p>
              <p className="text-xl font-bold text-heading">{activeStudentsTotal}</p>
            </div>
            <div>
              <p className="text-xs text-muted font-medium">Active Courses</p>
              <p className="text-xl font-bold text-heading">{activeCoursesTotal}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {loading ? (
        <div className="p-12 text-center text-xs text-muted flex items-center justify-center gap-2 bg-surface rounded-card border border-border">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
          Loading semester and term details...
        </div>
      ) : (
        /* Semester Cards Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {filteredSemesters.map(sem => (
            <div
              key={sem.number}
              className={`bg-surface rounded-card shadow-card border transition-all duration-150 p-5 flex flex-col justify-between ${
                sem.isActive 
                  ? 'border-border hover:border-blue-300 hover:shadow-md' 
                  : 'border-slate-200/80 bg-slate-50/40 opacity-90'
              }`}
            >
              <div className="space-y-4">
                {/* Card Top: Semester and Term Cycle */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/70">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 font-bold text-xs flex items-center justify-center shadow-2xs">
                      S{sem.number}
                    </span>
                    <div>
                      <h3 className="font-bold text-sm text-heading">Semester {sem.number}</h3>
                      <p className="text-[10px] text-muted font-medium">{deptName}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200/80 px-2 py-0.5 rounded-full whitespace-nowrap">
                    {sem.cycle}
                  </span>
                </div>

                {/* Main Metrics: Students & Courses */}
                <div className="space-y-3 pt-1">
                  <div>
                    <p className="text-3xl font-extrabold text-heading tracking-tight leading-none">
                      {sem.studentsCount}
                    </p>
                    <p className="text-xs font-medium text-muted mt-1 flex items-center gap-1.5">
                      <Icons.Users className="w-3.5 h-3.5 text-slate-400" />
                      Enrolled Students
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Icons.Book className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium">{sem.coursesCount} Active Courses</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-slate-600">
                      <Icons.Grid className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium">{sem.divisions.length} Divisions</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom: Status & Manage Action */}
              <div className="flex items-center justify-between gap-2 text-xs pt-3 mt-4 border-t border-border">
                <span
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap border shrink-0 flex items-center gap-1 ${
                    sem.isActive
                      ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                      : 'text-slate-600 bg-slate-100 border-slate-200'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${sem.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                  {sem.isActive ? 'Active' : 'Inactive'}
                </span>

                <button
                  type="button"
                  onClick={() => setManagedSemester(sem)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold rounded-lg text-xs border border-slate-200 hover:border-blue-200 transition flex items-center gap-1 shadow-2xs"
                >
                  <Icons.Settings className="w-3.5 h-3.5" />
                  Manage
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Manage Semester Details Modal */}
      {managedSemester && (
        <div className="fixed inset-0 z-[9999] overflow-y-auto bg-[#0f172a]/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl shadow-2xl border border-border w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-3">
                <span className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 border border-blue-200 font-bold flex items-center justify-center text-sm shadow-xs">
                  S{managedSemester.number}
                </span>
                <div>
                  <h2 className="text-base font-bold text-heading">Semester {managedSemester.number}</h2>
                  <p className="text-xs text-muted">{deptName} &bull; {selectedYear}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManagedSemester(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition"
              >
                <Icons.X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Semester Overview Meta Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <p className="text-[11px] font-medium text-slate-500">Academic Year</p>
                  <p className="text-sm font-bold text-heading mt-0.5">{selectedYear}</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <p className="text-[11px] font-medium text-slate-500">Term Cycle</p>
                  <p className="text-sm font-bold text-heading mt-0.5">{managedSemester.cycle}</p>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl">
                  <p className="text-[11px] font-medium text-slate-500">Status</p>
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full mt-1 border ${
                      managedSemester.isActive
                        ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                        : 'text-slate-600 bg-slate-100 border-slate-200'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${managedSemester.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`}></span>
                    {managedSemester.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* Statistics Breakdown */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-heading uppercase tracking-wider">Semester Statistics</h3>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 bg-surface border border-border rounded-xl">
                    <p className="text-2xl font-extrabold text-heading">{managedSemester.studentsCount}</p>
                    <p className="text-xs text-muted font-medium mt-0.5">Students</p>
                  </div>
                  <div className="p-3 bg-surface border border-border rounded-xl">
                    <p className="text-2xl font-extrabold text-heading">{managedSemester.coursesCount}</p>
                    <p className="text-xs text-muted font-medium mt-0.5">Active Courses</p>
                  </div>
                  <div className="p-3 bg-surface border border-border rounded-xl">
                    <p className="text-2xl font-extrabold text-heading">{managedSemester.divisions.length}</p>
                    <p className="text-xs text-muted font-medium mt-0.5">Divisions</p>
                  </div>
                </div>
              </div>

              {/* Divisions Breakdown */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-heading uppercase tracking-wider">Divisions Overview</h3>
                <div className="flex flex-wrap gap-2">
                  {['A', 'B', 'C'].map(divLetter => {
                    const countInDiv = managedSemester.students.filter(s => (s.division || 'A') === divLetter).length;
                    return (
                      <div
                        key={divLetter}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                      >
                        <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 font-bold text-[11px] flex items-center justify-center">
                          {divLetter}
                        </span>
                        <span className="font-semibold text-slate-800">Division {divLetter}:</span>
                        <span className="text-slate-600 font-medium">{countInDiv} Students</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Associated Courses List */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-heading uppercase tracking-wider">
                  Associated Courses ({managedSemester.coursesCount})
                </h3>
                {managedSemester.coursesCount === 0 ? (
                  <p className="text-xs text-muted py-3 px-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
                    No active courses configured for Semester {managedSemester.number}.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                    {managedSemester.courses.map(c => (
                      <div
                        key={c._id}
                        className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-xs flex items-center justify-between"
                      >
                        <div>
                          <p className="font-bold text-heading">{c.name}</p>
                          <p className="font-mono text-[11px] text-blue-600 font-medium">{c.code}</p>
                        </div>
                        <span className="text-[11px] text-muted font-medium bg-white px-2 py-1 rounded-md border border-slate-200">
                          Semester {c.semester || managedSemester.number}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="px-6 py-4 border-t border-border bg-slate-50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setManagedSemester(null);
                    navigate('/academic-admin/students');
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200 rounded-lg transition flex items-center gap-1 shadow-2xs"
                >
                  <Icons.Users className="w-3.5 h-3.5 text-blue-600" />
                  View Students
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManagedSemester(null);
                    navigate('/academic-admin/courses');
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200 rounded-lg transition flex items-center gap-1 shadow-2xs"
                >
                  <Icons.Book className="w-3.5 h-3.5 text-blue-600" />
                  View Courses
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManagedSemester(null);
                    navigate('/academic-admin/divisions');
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs border border-slate-200 rounded-lg transition flex items-center gap-1 shadow-2xs"
                >
                  <Icons.Grid className="w-3.5 h-3.5 text-blue-600" />
                  View Divisions
                </button>
              </div>

              <button
                type="button"
                onClick={() => setManagedSemester(null)}
                className="btn-secondary text-xs px-4 py-1.5"
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
