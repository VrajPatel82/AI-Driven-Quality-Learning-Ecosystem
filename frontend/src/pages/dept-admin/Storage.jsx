import ResourceManagement from '../../components/shared/ResourceManagement';

export default function DeptAdminStorage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Storage & Resources</h1>
        <p className="text-sm text-muted mt-1">Manage storage allocations for professors in your department</p>
      </div>

      <ResourceManagement role="dept_admin" />
    </div>
  );
}
