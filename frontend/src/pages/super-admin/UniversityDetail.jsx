import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { universitiesAPI, adminAPI } from '../../services/api';
import Breadcrumbs from '../../components/shared/Breadcrumbs';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function UniversityDetail() {
  const { id } = useParams();
  const [university, setUniversity] = useState(null);
  const [stats, setStats] = useState({});
  const [institutions, setInstitutions] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [activeTab, setActiveTab] = useState('institutions');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUniversityData();
  }, [id]);

  const fetchUniversityData = async () => {
    setLoading(true);
    try {
      const [uniRes, statsRes, instRes] = await Promise.allSettled([
        universitiesAPI.getById(id),
        universitiesAPI.getStats(id),
        universitiesAPI.getInstitutions(id)
      ]);

      if (uniRes.status === 'fulfilled') {
        setUniversity(uniRes.value.data.data || uniRes.value.data);
      }
      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data.data || statsRes.value.data || {});
      }
      if (instRes.status === 'fulfilled') {
        const instList = instRes.value.data.data || instRes.value.data || [];
        setInstitutions(instList);
        // Fetch departments for these institutions
        const instIds = instList.map(i => i._id);
        const deptRes = await adminAPI.getDepartments();
        const allDepts = deptRes.data.data || deptRes.data || [];
        setDepartments(allDepts.filter(d => {
          const dInstId = d.institution?._id || d.institution;
          return instIds.includes(dInstId);
        }));
      }
    } catch {
      toast.error('Failed to load university details');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 w-full">
      <Breadcrumbs
        items={[
          { label: 'Universities', to: '/super-admin/universities' },
          { label: university?.name || 'University Details' }
        ]}
      />

      {/* Header Card */}
      <div className="bg-surface rounded-card shadow-card border border-border p-4 sm:p-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex items-start sm:items-center gap-3 sm:gap-4">
            <div className="w-11 h-11 sm:w-14 sm:h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl sm:rounded-2xl flex items-center justify-center text-white text-xl sm:text-2xl shadow-md shrink-0">
              <Icons.GraduationCap className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <h1 className="text-lg sm:text-2xl font-bold text-heading break-words">{university?.name}</h1>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="font-mono text-xs bg-blue-100 text-blue-800 font-bold px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md">
                    {university?.code}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
                    {university?.status || 'active'}
                  </span>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-muted mt-1 break-words">{university?.address || 'Campus Headquarters'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1 md:pt-0 w-full md:w-auto">
            <Link
              to="/super-admin/storage"
              className="flex-1 md:flex-initial justify-center px-3.5 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-btn text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Icons.HardDrive className="w-4 h-4 shrink-0" /> Manage Quota
            </Link>
            <Link
              to="/super-admin/universities"
              className="flex-1 md:flex-initial justify-center px-3.5 py-2 border border-border rounded-btn text-xs font-semibold hover:bg-gray-50 text-slate-700 text-center"
            >
              Back to List
            </Link>
          </div>
        </div>

        {/* Quick Stats Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-4 mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-border">
          <div className="bg-slate-50/60 sm:bg-transparent p-2.5 sm:p-0 rounded-lg sm:rounded-none border border-slate-100 sm:border-0">
            <p className="text-[10px] sm:text-xs text-muted font-medium uppercase truncate">Campuses</p>
            <p className="text-base sm:text-xl font-bold text-slate-800 mt-0.5">{stats.institutionsCount !== undefined ? stats.institutionsCount : institutions.length}</p>
          </div>
          <div className="bg-slate-50/60 sm:bg-transparent p-2.5 sm:p-0 rounded-lg sm:rounded-none border border-slate-100 sm:border-0">
            <p className="text-[10px] sm:text-xs text-muted font-medium uppercase truncate">Departments</p>
            <p className="text-base sm:text-xl font-bold text-slate-800 mt-0.5">{stats.departmentsCount !== undefined ? stats.departmentsCount : departments.length}</p>
          </div>
          <div className="bg-slate-50/60 sm:bg-transparent p-2.5 sm:p-0 rounded-lg sm:rounded-none border border-slate-100 sm:border-0">
            <p className="text-[10px] sm:text-xs text-muted font-medium uppercase truncate">Total Students</p>
            <p className="text-base sm:text-xl font-bold text-slate-800 mt-0.5">{stats.studentsCount || 0}</p>
          </div>
          <div className="bg-slate-50/60 sm:bg-transparent p-2.5 sm:p-0 rounded-lg sm:rounded-none border border-slate-100 sm:border-0">
            <p className="text-[10px] sm:text-xs text-muted font-medium uppercase truncate">Faculty</p>
            <p className="text-base sm:text-xl font-bold text-slate-800 mt-0.5">{stats.facultyCount || 0}</p>
          </div>
          <div className="bg-slate-50/60 sm:bg-transparent p-2.5 sm:p-0 rounded-lg sm:rounded-none border border-slate-100 sm:border-0">
            <p className="text-[10px] sm:text-xs text-muted font-medium uppercase truncate">Courses</p>
            <p className="text-base sm:text-xl font-bold text-slate-800 mt-0.5">{stats.courseCount || 0}</p>
          </div>
          <div className="bg-slate-50/60 sm:bg-transparent p-2.5 sm:p-0 rounded-lg sm:rounded-none border border-slate-100 sm:border-0 col-span-2 sm:col-span-1">
            <p className="text-[10px] sm:text-xs text-muted font-medium uppercase truncate">Storage Used</p>
            <p className="text-base sm:text-xl font-bold text-slate-800 mt-0.5">{stats.storageUsedTB || 0} <span className="text-xs text-muted font-normal">/ {stats.storageAllocatedTB || 0} TB</span></p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border gap-4 sm:gap-6 text-xs sm:text-sm font-medium overflow-x-auto no-scrollbar">
        <button
          onClick={() => setActiveTab('institutions')}
          className={`pb-2.5 sm:pb-3 transition-colors border-b-2 whitespace-nowrap shrink-0 ${
            activeTab === 'institutions'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Campuses / Institutions ({institutions.length})
        </button>
        <button
          onClick={() => setActiveTab('departments')}
          className={`pb-2.5 sm:pb-3 transition-colors border-b-2 whitespace-nowrap shrink-0 ${
            activeTab === 'departments'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Departments ({departments.length})
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'institutions' && (
        <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
          <div className="p-3.5 sm:p-4 border-b border-border flex flex-col sm:flex-row justify-between sm:items-center gap-1.5 sm:gap-4">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
              Affiliated Institutions / Colleges
            </h3>
            <Link
              to="/super-admin/institutions"
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              Manage Institutions &rarr;
            </Link>
          </div>

          {/* Desktop Table: exactly as original */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-border text-xs text-muted uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Institution Name</th>
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Contact</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {institutions.map(inst => (
                  <tr key={inst._id} className="hover:bg-slate-50/50">
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {inst.name}
                      <p className="text-xs text-muted font-normal">{inst.address || 'Campus location'}</p>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs">{inst.code || 'N/A'}</td>
                    <td className="py-3 px-4 text-xs text-slate-600">{inst.contactEmail || 'N/A'}</td>
                    <td className="py-3 px-4 text-right">
                      <Link
                        to="/super-admin/institutions"
                        className="text-xs text-blue-600 font-semibold hover:underline"
                      >
                        View Details &rarr;
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards: compact list items without horizontal scrolling */}
          <div className="block md:hidden divide-y divide-border">
            {institutions.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted">No institutions affiliated yet.</div>
            ) : (
              institutions.map(inst => (
                <div key={inst._id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="font-semibold text-sm text-slate-800 break-words">{inst.name}</h4>
                      <p className="text-xs text-muted mt-0.5 break-words">{inst.address || 'Campus location'}</p>
                    </div>
                    <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded border border-slate-200 shrink-0 font-semibold">
                      {inst.code || 'N/A'}
                    </span>
                  </div>
                  {inst.contactEmail && (
                    <div className="text-xs text-slate-600">
                      <span className="text-muted">Contact: </span>{inst.contactEmail}
                    </div>
                  )}
                  <div className="pt-1 flex justify-end">
                    <Link
                      to="/super-admin/institutions"
                      className="text-xs text-blue-600 font-semibold hover:underline flex items-center gap-1"
                    >
                      View Details &rarr;
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'departments' && (
        <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
          <div className="p-3.5 sm:p-4 border-b border-border">
            <h3 className="text-xs sm:text-sm font-bold text-slate-800 uppercase tracking-wide">
              Academic Departments
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 p-3.5 sm:p-4">
            {departments.length === 0 ? (
              <div className="col-span-full p-6 text-center text-sm text-muted">No departments found.</div>
            ) : (
              departments.map(d => (
                <div key={d._id} className="border border-border p-3.5 sm:p-4 rounded-xl bg-slate-50/60 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border border-slate-200 font-bold">
                      {d.code || 'DEPT'}
                    </span>
                    <span className="text-xs text-slate-400">Semester 1-8</span>
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm leading-snug break-words">{d.name}</h4>
                  <p className="text-xs text-muted break-words">
                    Institution: {d.institution?.name || 'Parent Campus'}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
