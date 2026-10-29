import ResourceManagement from '../../components/shared/ResourceManagement';

export default function InstAdminStorage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-heading">Storage & Resources</h1>
        <p className="text-sm text-muted mt-1">Manage departmental storage quotas across your institution</p>
      </div>

      <ResourceManagement role="inst_admin" />
    </div>
  );
}
