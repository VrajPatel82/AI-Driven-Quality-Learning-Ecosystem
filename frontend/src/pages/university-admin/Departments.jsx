import { useState, useEffect } from 'react';
import { adminAPI } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { Icons } from '../../components/shared/Icons';

export default function UniversityDepartments() {
  const { user } = useAuth();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterInst, setFilterInst] = useState('');
  const [institutions, setInstitutions] = useState([]);

  const uniName = user?.university?.name || user?.universityName || 'Apex National University';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [deptRes, instRes] = await Promise.allSettled([
        adminAPI.getDepartments(),
        adminAPI.getInstitutions()
      ]);

      if (deptRes.status === 'fulfilled') {
        setDepartments(deptRes.value.data.data || deptRes.value.data || []);
      }
      if (instRes.status === 'fulfilled') {
        setInstitutions(instRes.value.data.data || instRes.value.data || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  const filtered = departments.filter(d => {
    const matchSearch = d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.code?.toLowerCase().includes(search.toLowerCase());
    const instId = d.institution?._id || d.institution;
    const matchInst = !filterInst || instId === filterInst;
    return matchSearch && matchInst;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Departments</h1>
        <p className="text-muted mt-1 text-sm">
          {departments.length} department{departments.length !== 1 ? 's' : ''} offering specialized degree programs.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            placeholder="Search department by name or code..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input w-full sm:w-72 text-sm"
          />
          <select
            value={filterInst}
            onChange={e => setFilterInst(e.target.value)}
            className="form-input w-full sm:w-60 text-sm"
          >
            <option value="">All Campuses / Colleges</option>
            {institutions.map(i => (
              <option key={i._id} value={i._id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <span className="text-xs text-muted font-medium">
          Showing {filtered.length} of {departments.length}
        </span>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-muted text-sm">
            No departments match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="py-3.5 px-4">Department</th>
                  <th className="py-3.5 px-4">Code</th>
                  <th className="py-3.5 px-4">Parent Campus</th>
                  <th className="py-3.5 px-4 text-center">Students</th>
                  <th className="py-3.5 px-4 text-center">Faculty</th>
                  <th className="py-3.5 px-4 text-center">Courses</th>
                  <th className="py-3.5 px-4 text-center">Semesters</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(dept => (
                  <tr key={dept._id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {dept.name}
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {dept.code || 'DEPT'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 text-xs font-medium">
                      {dept.institution?.name || 'Affiliated Campus'}
                    </td>
                    <td className="py-3 px-4 text-center text-xs font-semibold text-slate-700">
                      {dept.studentsCount ?? 0}
                    </td>
                    <td className="py-3 px-4 text-center text-xs font-semibold text-slate-700">
                      {dept.professorsCount ?? dept.professors?.length ?? 0}
                    </td>
                    <td className="py-3 px-4 text-center text-xs font-semibold text-slate-700">
                      {dept.coursesCount ?? dept.courses?.length ?? 0}
                    </td>
                    <td className="py-3 px-4 text-center text-xs font-semibold text-slate-700">
                      1 - 8
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                        Active
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
  );
}
