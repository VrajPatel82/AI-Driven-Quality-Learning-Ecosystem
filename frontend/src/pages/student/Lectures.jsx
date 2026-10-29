import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { lecturesAPI, coursesAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function StudentLectures() {
  const { user, refreshUser } = useAuth();
  const [lectures, setLectures] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [semesterFilter, setSemesterFilter] = useState('all'); // Default to 'all' for current + previous
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({});
  
  const currentSem = user?.currentSemester || 1;
  const availableSemesters = [...new Set([
    currentSem,
    ...courses.map(c => c.semester),
    ...lectures.map(l => l.semester)
  ].filter(Boolean))].sort((a, b) => a - b);

  useEffect(() => {
    refreshUser();
    fetchCourses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchLectures();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, courseFilter, semesterFilter, search]);

  const fetchCourses = async () => {
    try {
      const res = await coursesAPI.getAll({ limit: 50 });
      setCourses(res.data.data || []);
    } catch (err) { /* ignore */ }
  };

  const fetchLectures = async () => {
    setLoading(true);
    try {
      const params = { page, limit: 12, type: 'lecture' };
      if (search) params.search = search;
      if (courseFilter) params.course = courseFilter;
      // If 'all' is selected, don't pass semester filter (show all accessible)
      // Otherwise pass the specific semester
      if (semesterFilter && semesterFilter !== 'all') {
        params.semester = semesterFilter;
      }
      console.log('[DEBUG] Fetching student lectures with params:', params);
      // Use student-specific endpoint for proper semester-based filtering
      const res = await lecturesAPI.getStudentContent(params);
      setLectures(res.data.data || []);
      setPagination(res.data.pagination || {});
    } catch (err) {
      toast.error('Failed to load lectures');
      console.error('[DEBUG] Error fetching lectures:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-heading tracking-tight">
            {semesterFilter === 'all' ? 'Lectures' : `Semester ${semesterFilter} Lectures`}
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Access course recordings, multilingual audio tracks, and lecture materials.
          </p>
        </div>
        {semesterFilter !== 'all' && (
          <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold shrink-0">
            <Icons.Book className="w-3.5 h-3.5" /> Semester {semesterFilter}
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-2.5 sm:gap-3">
        <div className="relative flex-1 w-full">
          <Icons.Search className="w-4 h-4 text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search lectures..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="form-input w-full pl-10 pr-4 py-2 sm:py-2.5 h-11 text-xs sm:text-sm rounded-xl"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex gap-2.5 sm:gap-3 w-full lg:w-auto">
          <select
            value={courseFilter}
            onChange={e => { setCourseFilter(e.target.value); setPage(1); }}
            className="form-input w-full lg:w-48 h-11 text-xs sm:text-sm py-2 px-3 rounded-xl"
          >
            <option value="">All Courses</option>
            {courses.map(c => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
          <select
            value={semesterFilter}
            onChange={e => { setSemesterFilter(e.target.value); setPage(1); }}
            className="form-input w-full lg:w-44 h-11 text-xs sm:text-sm py-2 px-3 rounded-xl"
          >
            <option value="all">All Semesters</option>
            {availableSemesters.map(s => (
              <option key={s} value={s.toString()}>
                Semester {s} {s === currentSem ? '(Current)' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
        </div>
      ) : lectures.length === 0 ? (
        <div className="text-center py-12 bg-surface rounded-card border border-border">
          <p className="text-muted text-lg">No lectures found</p>
          <p className="text-muted text-sm mt-1">Check back later for new content</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 lg:gap-5">
            {lectures.map(lecture => (
              <Link
                to={`/student/lectures/${lecture._id}`}
                key={lecture._id}
                className="bg-surface rounded-card shadow-card border border-border hover:shadow-lg active:scale-[0.99] transition-all overflow-hidden flex flex-col group"
              >
                {/* VIDEO THUMBNAIL */}
                <div className="aspect-video w-full bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 flex items-center justify-center text-white relative overflow-hidden">
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-xs flex items-center justify-center group-hover:scale-110 transition-transform shadow-md">
                    <Icons.Video className="w-6 h-6 text-white" />
                  </div>
                  {lecture.semester && (
                    <span className={`absolute top-2.5 right-2.5 px-2 py-0.5 rounded-full text-[10.5px] font-semibold backdrop-blur-md shadow-xs ${
                      lecture.semester === user?.currentSemester
                        ? 'bg-emerald-500/90 text-white'
                        : 'bg-slate-900/60 text-white'
                    }`}>
                      Sem {lecture.semester} {lecture.semester === user?.currentSemester ? '• Current' : ''}
                    </span>
                  )}
                </div>

                {/* CARD CONTENT */}
                <div className="p-3.5 sm:p-4 flex flex-col flex-1 justify-between">
                  <div>
                    <h3 className="font-semibold text-sm sm:text-base text-heading truncate group-hover:text-blue-600 transition-colors">
                      {lecture.title}
                    </h3>
                    {lecture.subject ? (
                      <p className="text-[11px] sm:text-xs text-blue-600 font-medium mt-0.5 truncate">
                        {lecture.subject}
                      </p>
                    ) : lecture.course?.name ? (
                      <p className="text-[11px] sm:text-xs text-blue-600 font-medium mt-0.5 truncate">
                        {lecture.course.name}
                      </p>
                    ) : null}
                    <p className="text-xs sm:text-sm text-muted mt-1.5 line-clamp-2 leading-relaxed">
                      {lecture.description || 'No description provided for this lecture.'}
                    </p>
                  </div>

                  {/* FOOTER METADATA */}
                  <div className="mt-3.5 pt-3 border-t border-border/70 flex items-center justify-between text-[11px] sm:text-xs text-muted">
                    <span className="truncate max-w-[65%] font-medium text-slate-600">
                      {lecture.course?.name || 'General Course'}
                    </span>
                    <span className="shrink-0">
                      {new Date(lecture.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div className="flex justify-center items-center gap-2 pt-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-primary px-3.5 py-1.5 text-xs sm:text-sm disabled:opacity-50 min-h-[38px]"
              >
                Previous
              </button>
              <span className="px-3 py-1 text-xs sm:text-sm text-muted font-medium">
                Page {page} of {pagination.pages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="btn-primary px-3.5 py-1.5 text-xs sm:text-sm disabled:opacity-50 min-h-[38px]"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
