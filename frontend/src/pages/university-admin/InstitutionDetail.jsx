import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { adminAPI } from '../../services/api';
import Breadcrumbs from '../../components/shared/Breadcrumbs';
import { Icons } from '../../components/shared/Icons';
import toast from 'react-hot-toast';

export default function UniversityInstitutionDetail() {
  const { id } = useParams();
  const [institution, setInstitution] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('departments');

  useEffect(() => {
    fetchCampusDetails();
  }, [id]);

  const fetchCampusDetails = async () => {
    setLoading(true);
    try {
      const [instRes, deptRes] = await Promise.allSettled([
        adminAPI.getInstitutions(),
        adminAPI.getDepartments({ institution: id })
      ]);

      if (instRes.status === 'fulfilled') {
        const all = instRes.value.data.data || instRes.value.data || [];
        const found = all.find(i => i._id === id);
        setInstitution(found || { _id: id, name: 'Campus Details', code: 'CAMPUS' });
      }

      if (deptRes.status === 'fulfilled') {
        setDepartments(deptRes.value.data.data || deptRes.value.data || []);
      }
    } catch {
      toast.error('Failed to load campus details');
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
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Campuses', to: '/university-admin/institutions' },
          { label: institution?.name || 'Campus Details' }
        ]}
      />

      {/* Campus Header */}
      <div className="bg-surface rounded-card shadow-card border border-border p-6">
        <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex items-center justify-center text-white text-2xl shadow-md">
              <Icons.Landmark className="w-8 h-8 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-heading">{institution?.name}</h1>
                <span className="font-mono text-xs bg-blue-100 text-blue-800 font-bold px-2.5 py-1 rounded-md">
                  {institution?.code}
                </span>
              </div>
              <p className="text-sm text-muted mt-1">{institution?.address || 'Campus Location'}</p>
            </div>
          </div>
          <Link
            to="/university-admin/institutions"
            className="px-4 py-2 border border-border rounded-btn text-xs font-semibold hover:bg-gray-50 self-start md:self-auto text-slate-700"
          >
            &larr; Back to Campuses
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-border text-xs">
          <div>
            <p className="text-muted font-medium uppercase text-[11px]">Academic Departments</p>
            <p className="text-xl font-bold text-slate-800 mt-1">{departments.length}</p>
          </div>
          <div>
            <p className="text-muted font-medium uppercase text-[11px]">Campus Contact</p>
            <p className="font-medium text-slate-700 mt-1 truncate">{institution?.contactEmail || 'N/A'}</p>
          </div>
          <div>
            <p className="text-muted font-medium uppercase text-[11px]">Phone</p>
            <p className="font-medium text-slate-700 mt-1">{institution?.contactPhone || 'N/A'}</p>
          </div>
          <div>
            <p className="text-muted font-medium uppercase text-[11px]">Campus Status</p>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full font-bold text-xs bg-green-100 text-green-700 mt-1">
              Active
            </span>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-border gap-6 text-sm font-medium">
        <button
          onClick={() => setActiveTab('departments')}
          className={`pb-3 border-b-2 transition-colors ${
            activeTab === 'departments'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Departments ({departments.length})
        </button>
      </div>

      {/* Departments under this institution */}
      <div className="bg-surface rounded-card shadow-card border border-border overflow-hidden">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            Affiliated Departments
          </h3>
        </div>

        {departments.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted">
            No departments found under this campus.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
            {departments.map(d => (
              <div key={d._id} className="border border-border p-4 rounded-xl bg-slate-50/50">
                <span className="font-mono text-xs bg-white px-2 py-0.5 rounded border border-slate-200 font-bold">
                  {d.code || 'DEPT'}
                </span>
                <h4 className="font-bold text-slate-800 mt-2">{d.name}</h4>
                <p className="text-xs text-muted mt-1">Semesters: 1 - 8</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
